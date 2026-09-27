// backend/src/utils/sortingEngine.js

import { scorePriority } from '../services/requestLedger.js';

export const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

/**
 * Decodes high-precision millisecond timestamps directly from a Firebase Push ID
 */
export function extractTimeFromId(id, timezone = "Asia/Manila") {
  try {
    if (!id || id.length < 8) return '';
    let ms = 0;
    for (let i = 0; i < 8; i++) {
      const idx = PUSH_CHARS.indexOf(id.charAt(i));
      if (idx === -1) return '';
      ms = (ms * 64) + idx;
    }
    const dateObj = new Date(ms);
    if (isNaN(dateObj.getTime())) return '';
    return dateObj.toLocaleTimeString("en-US", { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
  } catch (e) {
    return '';
  }
}

/** Lexicographic lower-bound push ID at `ms` (pairs with extractTimeFromId). */
export function pushIdAt(ms) {
  let time = Math.max(0, Math.floor(Number(ms) || 0));
  let id = '';
  for (let i = 0; i < 8; i++) {
    id = PUSH_CHARS.charAt(time % 64) + id;
    time = Math.floor(time / 64);
  }
  return `${id}------------`;
}

export function requestsFromSnapshot(snapOrMap) {
  const map = snapOrMap && typeof snapOrMap.val === 'function' ? snapOrMap.val() : snapOrMap;
  if (!map || typeof map !== 'object') return [];
  return Object.entries(map).map(([id, req]) => {
    const row = req && typeof req === 'object' ? { ...req } : {};
    if (!row.id) row.id = id;
    return row;
  });
}

function ledgerSortKey(req) {
  return String(req?.id || '');
}

/**
 * Gold-Standard Deterministic Leaderboard Compiler Engine
 */
export function compileLeaderboard(firebaseRequests, itemsList, membersData, scoreOptions = null) {
  const rankingsByItem = {};
  const requestsByItemDetails = {};

  itemsList.forEach(item => {
    rankingsByItem[item.id] = [];
    requestsByItemDetails[item.id] = {};
  });

  const userCalculationsMap = {};
  itemsList.forEach(item => { userCalculationsMap[item.id] = {}; });

  // Requested/Canceled is a ledger. Apply rows in push-id order so a cancel
  // never lands before its matching request (Postgres SELECT order is not stable).
  const ledger = [...(firebaseRequests || [])].sort((a, b) => {
    const ka = ledgerSortKey(a);
    const kb = ledgerSortKey(b);
    if (ka === kb) return 0;
    return ka < kb ? -1 : 1;
  });

  ledger.forEach(req => {
    if ((req.selectionStatus || 'Pending').toLowerCase() !== 'pending') return;

    let reqItemId = req.itemId;
    if (!reqItemId && req.item) {
      const found = itemsList.find(i => i.name.toLowerCase() === req.item.toLowerCase());
      if (found) reqItemId = found.id;
    }

    if (!reqItemId || userCalculationsMap[reqItemId] === undefined) return;

    const playerTrackingKey = req.userId;
    if (!playerTrackingKey) return;

    const resolvedName = membersData?.[req.userId]?.displayName || req.member || 'Unknown Member';

    if (!userCalculationsMap[reqItemId][playerTrackingKey]) {
      userCalculationsMap[reqItemId][playerTrackingKey] = {
        userId: playerTrackingKey,
        name: resolvedName,
        netQty: 0,
        priority: parseInt(req.priority, 10) || 0,
        firstKey: null,
        firstTime: null
      };
    }

    const appStatus = (req.applicationStatus || 'requested').toLowerCase();
    if (appStatus === 'requested') {
      userCalculationsMap[reqItemId][playerTrackingKey].netQty += parseInt(req.quantity, 10) || 0;
      if (!userCalculationsMap[reqItemId][playerTrackingKey].firstKey) {
        userCalculationsMap[reqItemId][playerTrackingKey].firstKey = req.id;
        // Fallback to push ID decoding if req.time does not exist
        userCalculationsMap[reqItemId][playerTrackingKey].firstTime = req.time || extractTimeFromId(req.id);
      }
    }
    if (appStatus === 'canceled') {
      userCalculationsMap[reqItemId][playerTrackingKey].netQty -= parseInt(req.quantity, 10) || 0;
      if (userCalculationsMap[reqItemId][playerTrackingKey].netQty <= 0) {
        userCalculationsMap[reqItemId][playerTrackingKey].netQty = 0;
        userCalculationsMap[reqItemId][playerTrackingKey].firstKey = null;
        userCalculationsMap[reqItemId][playerTrackingKey].firstTime = null;
      }
    }
  });

  const ledgerRows = scoreOptions?.ledgerRows;
  const today = scoreOptions?.today;
  if (ledgerRows && today) {
    itemsList.forEach(item => {
      Object.values(userCalculationsMap[item.id] || {}).forEach(applicant => {
        applicant.priority = scorePriority(ledgerRows, {
          userId: applicant.userId,
          itemId: item.id,
          itemName: item.name,
          isHighValue: item.isHighValue === true,
          lookbackDays: scoreOptions.lookbackDays,
          today,
        });
      });
    });
  }

  itemsList.forEach(item => {
    const activeApplicants = Object.values(userCalculationsMap[item.id]).filter(u => u.netQty > 0);

    activeApplicants.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      const tokenA = a.firstKey || 'ZZZZZZZZZZZZZZZZZZZZ';
      const tokenB = b.firstKey || 'ZZZZZZZZZZZZZZZZZZZZ';
      if (tokenA === tokenB) return 0;
      return tokenA < tokenB ? -1 : 1;
    });

    rankingsByItem[item.id] = activeApplicants.map(u => u.userId);
    activeApplicants.forEach(u => {
      requestsByItemDetails[item.id][u.userId] = {
        // Carry the request-time resolved name so consumers can display it even
        // when the live auction/members record is missing (e.g. purged/vanished).
        name: u.name,
        quantity: u.netQty,
        priority: u.priority,
        time: u.firstTime || ''
      };
    });
  });

  return { rankingsByItem, requestsByItemDetails };
}