// backend/src/utils/sortingEngine.js

/**
 * Decodes high-precision millisecond timestamps directly from a Firebase Push ID
 */
function extractTimeFromId(id, timezone = "Asia/Manila") {
  try {
    if (!id || id.length < 8) return '';
    const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
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

/**
 * Gold-Standard Deterministic Leaderboard Compiler Engine
 */
export function compileLeaderboard(firebaseRequests, itemsList, membersData) {
  const rankingsByItem = {};
  const requestsByItemDetails = {};

  itemsList.forEach(item => {
    rankingsByItem[item.id] = [];
    requestsByItemDetails[item.id] = {};
  });

  const userCalculationsMap = {};
  itemsList.forEach(item => { userCalculationsMap[item.id] = {}; });

  firebaseRequests.forEach(req => {
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
        quantity: u.netQty,
        priority: u.priority,
        time: u.firstTime || ''
      };
    });
  });

  return { rankingsByItem, requestsByItemDetails };
}