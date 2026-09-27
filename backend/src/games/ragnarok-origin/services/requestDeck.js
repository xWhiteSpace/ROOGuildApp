/**
 * Shared Request Tab write path: lobby payload, submit (cart), and cancel/drop.
 * HTTP `/api/requests/*` and the Discord Request Card both call these so the
 * `auction/web_requests` ledger stays a single source of truth.
 */
import { getTenantStore, loadAuctionRequests } from '../../../db/database.js';
import { clampLookbackDays } from '../defaults.js';
import { getGateStatusDetails } from '../timeWindow.js';
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

/**
 * Lobby payload consumed by GET /api/requests/init and the Discord Request Card.
 */
export async function buildRequestLobby(userId, displayName) {
  const playerDisplayName = displayName || '';
  const db = getTenantStore();
  const configSnap = await db.ref('settings/configuration').once('value');
  const dynamicConfig = configSnap.exists() ? configSnap.val() : {};
  const itemsList = dynamicConfig.items || [];
  const timezone = dynamicConfig.timezone || 'Asia/Manila';
  const targetSessionDate = resolveSessionDate(dynamicConfig, timezone);
  const isForceLocked = dynamicConfig.isForceLocked === true;

  const timeGateStatus = getGateStatusDetails();
  const activeEvent = dynamicConfig.events?.[timeGateStatus.activeEventId];
  const activeLoots = activeEvent?.loots || {};
  const activeItemsList = [];
  itemsList.forEach(masterItem => {
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

  const { pendingRows: firebaseRequests, ledgerRows: historyRows, lookbackDays, today } = await loadBoardScoreContext(dynamicConfig);

  const liveCounts = {};
  const rankingsByItem = {};
  const requestsByItemDetails = {};

  itemsList.forEach(item => {
    liveCounts[item.id] = 0;
    rankingsByItem[item.id] = [];
    requestsByItemDetails[item.id] = {};
  });

  firebaseRequests.forEach(reqRow => {
    if (reqRow.userId === userId) {
      const selStatus = (reqRow.selectionStatus || 'pending').toLowerCase();
      const appStatus = (reqRow.applicationStatus || '').toLowerCase();
      const targetItemId = resolveItemId(reqRow, itemsList);

      if (selStatus === 'pending' && targetItemId && liveCounts[targetItemId] !== undefined) {
        if (appStatus === 'requested') liveCounts[targetItemId] += reqRow.quantity;
        if (appStatus === 'canceled') liveCounts[targetItemId] -= reqRow.quantity;
      }
    }
  });

  Object.keys(liveCounts).forEach(k => { if (liveCounts[k] < 0) liveCounts[k] = 0; });

  const membersListSnap = await db.ref('auction/members').once('value');
  const fullRosterArray = [];
  const membersByName = {};
  if (membersListSnap.exists()) {
    Object.entries(membersListSnap.val()).forEach(([uid, m]) => {
      const displayName = m?.displayName || '';
      membersByName[uid] = { displayName };
      if (displayName) fullRosterArray.push(displayName);
    });
  }

  const membersData = membersListSnap.exists() ? membersListSnap.val() : {};
  const computedLists = compileLeaderboard(firebaseRequests, itemsList, membersData, {
    ledgerRows: historyRows,
    lookbackDays,
    today,
  });

  Object.assign(rankingsByItem, computedLists.rankingsByItem);
  Object.assign(requestsByItemDetails, computedLists.requestsByItemDetails);

  return {
    displayName: playerDisplayName,
    date: targetSessionDate,
    items: activeItemsList,
    liveCounts,
    isGateOpen: timeGateStatus.isGateOpen,
    isForceLocked,
    currentSessionLabel: timeGateStatus.currentSessionLabel,
    nextStatusChangeMessage: timeGateStatus.nextStatusChangeMessage,
    currentPhase: timeGateStatus.currentPhase,
    phaseIntervals: timeGateStatus.phaseIntervals,
    eventId: timeGateStatus.activeEventId || '',
    eventName: timeGateStatus.activeEventTitle || 'Raid Session',
    helpEmbedUrl: timeGateStatus.helpEmbedUrl || '',
    announcementMinutes: timeGateStatus.announcementMinutes || { phase1: [], phase2: null, phase3: null },
    events: dynamicConfig.events || {},
    rankingsByItem,
    requestsByItemDetails,
    fullRoster: fullRosterArray.sort(),
    members: membersByName,
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
