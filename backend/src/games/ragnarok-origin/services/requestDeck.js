/**
 * Shared Request Tab write path: lobby payload, submit (cart), and cancel/drop.
 * HTTP `/api/requests/*` and the Discord Request Card both call these so the
 * `auction/web_requests` ledger stays a single source of truth.
 */
import { getTenantStore, loadAuctionRequests, loadMembersByIds } from '../../../db/database.js';
import { clampLookbackDays } from '../defaults.js';
import { getGateStatusDetails, readTenantConfiguration } from '../timeWindow.js';
import { compileLeaderboard, requestsFromSnapshot } from '../utils/sortingEngine.js';
import { formatGuildDate } from '../../../utils/guildTime.js';
import { lookbackStartDay, resolveSessionDate, scorePriority } from './requestLedger.js';

export class RequestDeckError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'RequestDeckError';
    this.status = status;
  }
}

export async function loadBoardScoreContext(dynamicConfig) {
  const timezone = dynamicConfig?.timezone || 'Asia/Manila';
  const lookbackDays = clampLookbackDays(dynamicConfig?.priorityLookbackDays);
  const today = formatGuildDate(new Date(), timezone);
  const pendingMap = await loadAuctionRequests({ status: 'Pending' });
  const historyMap = await loadAuctionRequests({
    sinceCalendarDay: lookbackStartDay(today, lookbackDays),
  });
  return {
    pendingRows: requestsFromSnapshot(pendingMap),
    ledgerRows: requestsFromSnapshot(historyMap),
    lookbackDays,
    today,
  };
}

async function calculatePriorityScore(db, userId, itemId, itemNameFallback) {
  const configSnap = await db.ref('settings/configuration').once('value');
  const dynamicConfig = configSnap.exists() ? configSnap.val() : {};
  const lookbackDays = clampLookbackDays(dynamicConfig.priorityLookbackDays);
  const timezone = dynamicConfig.timezone || 'Asia/Manila';
  const today = formatGuildDate(new Date(), timezone);
  const records = await loadAuctionRequests({
    userId,
    sinceCalendarDay: lookbackStartDay(today, lookbackDays),
  });
  const itemsList = dynamicConfig.items || [];
  const targetItemMeta = itemsList.find((i) => {
    if (i.id && itemId) return i.id.trim().toLowerCase() === String(itemId).trim().toLowerCase();
    return false;
  }) || (itemNameFallback
    ? itemsList.find((i) => (i.name || '').trim().toLowerCase() === itemNameFallback.trim().toLowerCase())
    : null);

  return scorePriority(requestsFromSnapshot(records), {
    userId,
    itemId,
    itemName: itemNameFallback,
    isHighValue: targetItemMeta?.isHighValue === true,
    lookbackDays,
    today,
  });
}

function resolveItemId(reqRow, itemsList) {
  if (reqRow.itemId) return reqRow.itemId;
  if (!reqRow.item) return null;
  const found = itemsList.find(i => i.name === reqRow.item);
  return found?.id || null;
}

function activeItemsForGate(dynamicConfig, timeGateStatus) {
  const itemsList = dynamicConfig.items || [];
  const activeLoots = dynamicConfig.events?.[timeGateStatus.activeEventId]?.loots || {};
  const activeItemsList = [];
  itemsList.forEach((masterItem) => {
    if (activeLoots[masterItem.id] !== undefined) {
      activeItemsList.push({
        id: masterItem.id,
        name: masterItem.name,
        colorTheme: masterItem.colorTheme || 'slate',
        limitQty: activeLoots[masterItem.id],
        isHighValue: masterItem.isHighValue === true,
      });
    }
  });
  return activeItemsList;
}

function liveCountsForUser(pendingRows, userId, itemsList) {
  const liveCounts = {};
  itemsList.forEach((item) => { liveCounts[item.id] = 0; });
  pendingRows.forEach((reqRow) => {
    if (reqRow.userId !== userId) return;
    const selStatus = (reqRow.selectionStatus || 'pending').toLowerCase();
    const appStatus = (reqRow.applicationStatus || '').toLowerCase();
    const targetItemId = resolveItemId(reqRow, itemsList);
    if (selStatus !== 'pending' || !targetItemId || liveCounts[targetItemId] === undefined) return;
    if (appStatus === 'requested') liveCounts[targetItemId] += reqRow.quantity;
    if (appStatus === 'canceled') liveCounts[targetItemId] -= reqRow.quantity;
  });
  Object.keys(liveCounts).forEach((k) => { if (liveCounts[k] < 0) liveCounts[k] = 0; });
  return liveCounts;
}

function gateLobbyFields(dynamicConfig, timeGateStatus, displayName) {
  const timezone = dynamicConfig.timezone || 'Asia/Manila';
  return {
    displayName: displayName || '',
    date: resolveSessionDate(dynamicConfig, timezone),
    isGateOpen: timeGateStatus.isGateOpen,
    isForceLocked: dynamicConfig.isForceLocked === true,
    currentSessionLabel: timeGateStatus.currentSessionLabel,
    nextStatusChangeMessage: timeGateStatus.nextStatusChangeMessage,
    currentPhase: timeGateStatus.currentPhase,
    phaseIntervals: timeGateStatus.phaseIntervals,
    eventId: timeGateStatus.activeEventId || '',
    eventName: timeGateStatus.activeEventTitle || 'Raid Session',
    helpEmbedUrl: timeGateStatus.helpEmbedUrl || '',
    announcementMinutes: timeGateStatus.announcementMinutes || { phase1: [], phase2: null, phase3: null },
  };
}

/**
 * Slim lobby: gate + my counts + active items. No boards, members, or events tree.
 * GET /api/requests/init and the Discord Request Card both use this.
 */
export async function buildRequestLobby(userId, displayName) {
  const db = getTenantStore();
  const dynamicConfig = await readTenantConfiguration(db);
  const timeGateStatus = getGateStatusDetails();
  const activeItemsList = activeItemsForGate(dynamicConfig, timeGateStatus);
  const pendingMap = await loadAuctionRequests({ status: 'Pending', userId });
  return {
    ...gateLobbyFields(dynamicConfig, timeGateStatus, displayName),
    items: activeItemsList,
    liveCounts: liveCountsForUser(requestsFromSnapshot(pendingMap), userId, dynamicConfig.items || []),
  };
}

/** UIDs that appear on an item board (pending + lookback). Used so the queue never loads the whole roster. */
export function collectQueueMemberUids(pendingRows, ledgerRows) {
  const uids = new Set();
  for (const row of [...(pendingRows || []), ...(ledgerRows || [])]) {
    const uid = String(row?.userId || '').trim();
    if (uid) uids.add(uid);
  }
  return [...uids];
}

/** One item's queue for the Request dropdown and Mimic item filter. */
export async function buildRequestQueue(itemId) {
  const key = String(itemId || '').trim();
  if (!key) {
    throw new RequestDeckError('itemId is required.', 400);
  }
  const db = getTenantStore();
  const dynamicConfig = await readTenantConfiguration(db);
  const itemsList = dynamicConfig.items || [];
  const item = itemsList.find((row) => row.id === key);
  if (!item) {
    return { itemId: key, rankings: [], details: {}, members: {} };
  }
  const timezone = dynamicConfig.timezone || 'Asia/Manila';
  const lookbackDays = clampLookbackDays(dynamicConfig.priorityLookbackDays);
  const today = formatGuildDate(new Date(), timezone);
  const [pendingMap, historyMap] = await Promise.all([
    loadAuctionRequests({ status: 'Pending', itemId: key, itemName: item.name }),
    loadAuctionRequests({
      sinceCalendarDay: lookbackStartDay(today, lookbackDays),
      itemId: key,
      itemName: item.name,
    }),
  ]);
  const pendingRows = requestsFromSnapshot(pendingMap);
  const ledgerRows = requestsFromSnapshot(historyMap);
  const membersData = await loadMembersByIds(collectQueueMemberUids(pendingRows, ledgerRows));
  const computed = compileLeaderboard(
    pendingRows,
    [item],
    membersData,
    {
      ledgerRows,
      lookbackDays,
      today,
    },
  );
  const rankings = computed.rankingsByItem[key] || [];
  const details = computed.requestsByItemDetails[key] || {};
  const members = {};
  rankings.forEach((uid) => {
    members[uid] = { displayName: membersData[uid]?.displayName || details[uid]?.name || '' };
  });
  return { itemId: key, rankings, details, members };
}

/** Full board for officer announce-allocate. Not used on page open. */
export async function buildRequestBoard() {
  const db = getTenantStore();
  const dynamicConfig = await readTenantConfiguration(db);
  const timeGateStatus = getGateStatusDetails();
  const activeItemsList = activeItemsForGate(dynamicConfig, timeGateStatus);
  const { pendingRows, ledgerRows, lookbackDays, today } = await loadBoardScoreContext(dynamicConfig);
  const membersSnap = await db.ref('auction/members').once('value');
  const membersData = membersSnap.exists() ? membersSnap.val() : {};
  const members = {};
  Object.entries(membersData).forEach(([uid, row]) => {
    members[uid] = { displayName: row?.displayName || '' };
  });
  const computed = compileLeaderboard(pendingRows, dynamicConfig.items || [], membersData, {
    ledgerRows,
    lookbackDays,
    today,
  });
  return {
    items: activeItemsList,
    rankingsByItem: computed.rankingsByItem,
    requestsByItemDetails: computed.requestsByItemDetails,
    members,
  };
}

/**
 * Cart submit: `selections` is target qty per itemId (saved + staged), same as the website.
 */
export async function submitSelections(userId, displayName, selections) {
  const timeGateStatus = getGateStatusDetails();
  if (!timeGateStatus.isGateOpen) {
    throw new RequestDeckError(
      `Bidding registration is closed. ${timeGateStatus.nextStatusChangeMessage}`,
      423
    );
  }

  if (!selections || Object.keys(selections).length === 0) {
    throw new RequestDeckError('No item selections detected.', 400);
  }

  const playerDisplayName = displayName || '';
  const db = getTenantStore();

  const configSnap = await db.ref('settings/configuration').once('value');
  const dynamicConfig = configSnap.exists() ? configSnap.val() : {};
  const itemsList = dynamicConfig.items || [];
  const timezone = dynamicConfig.timezone || 'Asia/Manila';
  const targetSessionDate = resolveSessionDate(dynamicConfig, timezone);

  if (userId && !String(userId).startsWith('dummy_')) {
    const memberSnap = await db.ref(`auction/members/${userId}`).once('value');
    const existingMember = memberSnap.exists() ? memberSnap.val() : null;
    if (!existingMember || !existingMember.displayName) {
      await db.ref(`auction/members/${userId}`).update({
        displayName: playerDisplayName,
        status: existingMember?.status || 'Active',
        syncedAt: new Date().toLocaleDateString('en-US', { timeZone: timezone }),
      });
    }
  }

  const chosenItemIds = Object.keys(selections);
  const pendingMap = await loadAuctionRequests({ status: 'Pending', userId });
  const firebaseRequests = Object.values(pendingMap);

  const currentNetCounts = {};
  itemsList.forEach(item => { currentNetCounts[item.id] = 0; });

  firebaseRequests.forEach(reqRow => {
    if (reqRow.userId === userId && (reqRow.selectionStatus || 'Pending') === 'Pending') {
      const targetItemId = resolveItemId(reqRow, itemsList);
      if (targetItemId && currentNetCounts[targetItemId] !== undefined) {
        if (reqRow.applicationStatus.toLowerCase() === 'requested') currentNetCounts[targetItemId] += reqRow.quantity;
        if (reqRow.applicationStatus.toLowerCase() === 'canceled') currentNetCounts[targetItemId] -= reqRow.quantity;
      }
    }
  });

  for (const itemId of chosenItemIds) {
    const desiredQty = parseInt(selections[itemId], 10) || 0;
    const currentQty = currentNetCounts[itemId] || 0;
    const delta = desiredQty - currentQty;

    if (delta === 0) continue;

    const resolvedItemObj = itemsList.find(i => i.id === itemId) || { name: itemId };
    const activeEvent = dynamicConfig.events?.[timeGateStatus.activeEventId];
    const maxAllowedLimit = activeEvent?.loots?.[itemId] || 0;

    if (desiredQty > maxAllowedLimit) {
      throw new RequestDeckError(
        `Submission rejected: Requested volume for ${resolvedItemObj.name} exceeds the allowed event cap.`,
        422
      );
    }

    const dynamicPriority = await calculatePriorityScore(db, userId, itemId, resolvedItemObj.name);
    const newRequestRef = db.ref('auction/web_requests').push();
    const ledgerStamp = {
      id: newRequestRef.key,
      userId,
      date: new Date().toLocaleDateString('en-US', { timeZone: timezone }),
      time: new Date().toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }),
      member: playerDisplayName,
      item: resolvedItemObj.name,
      itemId,
      liveStatus: '',
      eventDate: targetSessionDate,
    };

    if (delta > 0) {
      await newRequestRef.set({
        ...ledgerStamp,
        quantity: delta,
        applicationStatus: 'Requested',
        selectionStatus: 'Pending',
        priority: dynamicPriority,
      });
    } else if (delta < 0) {
      await newRequestRef.set({
        ...ledgerStamp,
        quantity: Math.abs(delta),
        applicationStatus: 'Canceled',
        selectionStatus: 'Pending',
        priority: 0,
      });
    }
  }

  return { success: true };
}

/**
 * Drop the member's full pending qty for one item (website Cancel / Drop).
 */
export async function cancelPending(userId, displayName, { itemId, itemName } = {}) {
  const timeGateStatus = getGateStatusDetails();
  if (timeGateStatus.currentPhase === 3) {
    throw new RequestDeckError('Cancellations are locked during the Live Event / Auction phase.', 423);
  }

  const playerDisplayName = displayName || '';
  const db = getTenantStore();

  const configSnap = await db.ref('settings/configuration').once('value');
  const dynamicConfig = configSnap.exists() ? configSnap.val() : {};
  const timezone = dynamicConfig.timezone || 'Asia/Manila';
  const targetSessionDate = resolveSessionDate(dynamicConfig, timezone);
  const itemsList = dynamicConfig.items || [];

  const pendingMap = await loadAuctionRequests({ status: 'Pending', userId });
  const firebaseRequests = Object.values(pendingMap);

  let activeNetQty = 0;
  firebaseRequests.forEach(reqRow => {
    if (reqRow.userId === userId && (reqRow.selectionStatus || 'Pending') === 'Pending') {
      const targetItemId = resolveItemId(reqRow, itemsList);
      if (targetItemId === itemId || reqRow.item === itemName) {
        if (reqRow.applicationStatus.toLowerCase() === 'requested') activeNetQty += reqRow.quantity;
        if (reqRow.applicationStatus.toLowerCase() === 'canceled') activeNetQty -= reqRow.quantity;
      }
    }
  });

  if (activeNetQty <= 0) {
    return { success: true, message: 'Selection registry is already empty.' };
  }

  const newCancelRef = db.ref('auction/web_requests').push();
  await newCancelRef.set({
    id: newCancelRef.key,
    userId,
    date: new Date().toLocaleDateString('en-US', { timeZone: timezone }),
    member: playerDisplayName,
    item: itemName || itemId,
    itemId: itemId || 'item_unknown',
    quantity: activeNetQty,
    applicationStatus: 'Canceled',
    selectionStatus: 'Pending',
    liveStatus: '',
    priority: 0,
    eventDate: targetSessionDate,
  });

  const sessionSnap = await db.ref('auction/active_session').once('value');
  if (sessionSnap.exists()) {
    const sessionData = sessionSnap.val();
    const targetAllocationPath = `auction/active_session/categoryAllocations/${itemId}/selected`;
    let selectedList = sessionData.categoryAllocations?.[itemId]?.selected || [];

    if (selectedList.length > 0) {
      const initialLength = selectedList.length;
      let reclaimedSlotsCount = 0;

      selectedList = selectedList.filter(winner => {
        if (winner === userId) {
          reclaimedSlotsCount += 1;
          return false;
        }
        return true;
      });

      if (selectedList.length !== initialLength) {
        await db.ref(targetAllocationPath).set(selectedList);

        if (sessionData.lootSummary?.[itemId]) {
          const currentSummary = sessionData.lootSummary[itemId];
          const updatedAllocatedQty = Math.max(0, (parseInt(currentSummary.qty, 10) || 0) - reclaimedSlotsCount);
          const updatedFilledSeats = Math.max(0, (parseInt(currentSummary.seats, 10) || 0) - 1);

          await db.ref(`auction/active_session/lootSummary/${itemId}`).update({
            qty: updatedAllocatedQty,
            seats: updatedFilledSeats,
          });
        }
      }
    }
  }

  return { success: true };
}
