/**
 * Shared Request Tab write path: lobby payload, submit (cart), and cancel/drop.
 * HTTP `/api/requests/*` and the Discord Request Card both call these so the
 * `auction/web_requests` ledger stays a single source of truth.
 */
import { getTenantStore } from '../../../db/database.js';
import { getGateStatusDetails } from '../timeWindow.js';
import { compileLeaderboard, requestsFromSnapshot } from '../utils/sortingEngine.js';

export class RequestDeckError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'RequestDeckError';
    this.status = status;
  }
}

async function calculatePriorityScore(db, userId, itemId, itemNameFallback) {
  const playerHistorySnap = await db.ref('auction/web_requests')
    .orderByChild('userId')
    .equalTo(userId)
    .once('value');

  if (!playerHistorySnap.exists()) return 0;

  const records = playerHistorySnap.val();
  const sortedKeys = Object.keys(records).sort();
  const combinedItemTimeline = [];

  const configSnap = await db.ref('settings/configuration').once('value');
  const dynamicConfig = configSnap.exists() ? configSnap.val() : {};
  const lookbackDays = parseInt(dynamicConfig.priorityLookbackDays, 10) || 30;

  const expirationWindowInMs = lookbackDays * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();

  const itemsList = dynamicConfig.items || [];
  const targetItemMeta = itemsList.find(i => {
    if (i.id && itemId) return i.id.trim().toLowerCase() === itemId.trim().toLowerCase();
    return false;
  }) || (itemNameFallback ? itemsList.find(i => (i.name || '').trim().toLowerCase() === itemNameFallback.trim().toLowerCase()) : null);
  const isHighValueItem = targetItemMeta?.isHighValue === true;

  sortedKeys.forEach(key => {
    const record = records[key];

    const recordDateStr = record.date || '';
    const recordTimeMs = Date.parse(recordDateStr);
    if (!isNaN(recordTimeMs) && (nowMs - recordTimeMs) > expirationWindowInMs) {
      return;
    }

    const recordItemId = record.itemId;
    let isMatch = false;
    if (recordItemId) {
      if (recordItemId.trim().toLowerCase() === itemId.trim().toLowerCase()) isMatch = true;
    } else if (record.item && itemNameFallback) {
      if (record.item.trim().toLowerCase() === itemNameFallback.trim().toLowerCase()) isMatch = true;
    }

    if (isMatch) {
      combinedItemTimeline.push({
        status: (record.selectionStatus || 'pending').toLowerCase(),
        date: record.date || record.eventDate,
      });
    }
  });

  let lastSelectedIdx = -1;
  for (let i = combinedItemTimeline.length - 1; i >= 0; i--) {
    const { status } = combinedItemTimeline[i];
    const isTerminal = status === 'selected' || status === 'reset' || (status === 'absent' && !isHighValueItem);
    if (isTerminal) {
      lastSelectedIdx = i;
      break;
    }
  }

  let priorityPoints = 0;
  const countedDates = new Set();
  const searchStart = lastSelectedIdx !== -1 ? lastSelectedIdx + 1 : 0;
  for (let i = searchStart; i < combinedItemTimeline.length; i++) {
    const { status, date: uniqueNightKey } = combinedItemTimeline[i];
    const countsTowardPity = status === 'notselected' || (status === 'absent' && isHighValueItem);
    if (countsTowardPity && uniqueNightKey && !countedDates.has(uniqueNightKey)) {
      priorityPoints++;
      countedDates.add(uniqueNightKey);
    }
  }

  return priorityPoints;
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
  const targetSessionDate = dynamicConfig.targetSessionDate || new Date().toLocaleDateString('en-US', { timeZone: timezone });
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

  const snapshot = await db.ref('auction/web_requests')
    .orderByChild('selectionStatus')
    .equalTo('Pending')
    .once('value');
  const firebaseRequests = requestsFromSnapshot(snapshot);

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
  if (membersListSnap.exists()) {
    Object.values(membersListSnap.val()).forEach(m => {
      if (m?.displayName) fullRosterArray.push(m.displayName);
    });
  }

  const commitmentsSnap = await db.ref('attendance/commitments').once('value');
  const commitmentsData = commitmentsSnap.exists() ? commitmentsSnap.val() : {};
  const membersData = membersListSnap.exists() ? membersListSnap.val() : {};

  const instancesSnap = await db.ref('scheduler/active_instances').once('value');
  const activeInstancesData = instancesSnap.exists() ? instancesSnap.val() : {};
  const computedLists = compileLeaderboard(firebaseRequests, itemsList, membersData);

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
    commitments: commitmentsData,
    activeInstances: activeInstancesData,
    rankingsByItem,
    requestsByItemDetails,
    fullRoster: fullRosterArray.sort(),
    members: membersListSnap.exists() ? membersListSnap.val() : {},
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
  const targetSessionDate = dynamicConfig.targetSessionDate || '';

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
  const snapshot = await db.ref('auction/web_requests')
    .orderByChild('userId')
    .equalTo(userId)
    .once('value');
  const firebaseRequests = snapshot.exists() ? Object.values(snapshot.val()) : [];

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
  const targetSessionDate = dynamicConfig.targetSessionDate || '';
  const itemsList = dynamicConfig.items || [];

  const snapshot = await db.ref('auction/web_requests').once('value');
  const firebaseRequests = snapshot.exists() ? Object.values(snapshot.val()) : [];

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
