/**
 * Per-item Selected / Not Selected rows for Review Allocation and GEN Room announce.
 * One row per (item, member), not per slot.
 */

function asBoxList(raw) {
  return Array.isArray(raw) ? raw : Object.values(raw || {});
}

function uniqueSelectedUids(categoryAllocations, itemId) {
  const boxes = asBoxList(categoryAllocations?.[itemId]?.selected);
  const seen = new Set();
  const uids = [];
  boxes.forEach((uid) => {
    if (!uid) return;
    const key = String(uid);
    if (seen.has(key)) return;
    seen.add(key);
    uids.push(key);
  });
  return uids;
}

function rankingList(rankingsByItem, itemId) {
  const list = rankingsByItem?.[itemId];
  return Array.isArray(list) ? list.map((uid) => String(uid)).filter(Boolean) : [];
}

function rankForUid(rankings, uid) {
  const idx = rankings.indexOf(String(uid));
  return idx >= 0 ? idx + 1 : null;
}

export function formatAllocateRankLabel(rank) {
  return rank != null ? String(rank).padStart(2, '0') : '—';
}

function resolveMemberName(uid, members, details) {
  return members?.[uid]?.displayName || details?.name || uid;
}

function itemsWithLoot(items, lootSummary) {
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (!item?.id) return false;
    return (lootSummary?.[item.id]?.qty || 0) > 0;
  });
}

function buildRow({ item, uid, rankings, detailsMap, members }) {
  const details = detailsMap?.[uid] || {};
  const rank = rankForUid(rankings, uid);
  return {
    key: `${item.id}:${uid}`,
    itemId: item.id,
    itemName: item.name || item.id,
    uid,
    name: resolveMemberName(uid, members, details),
    rank,
    rankLabel: formatAllocateRankLabel(rank),
    priority: details.priority ?? 0,
  };
}

function sortByRank(a, b) {
  const rankA = a.rank == null ? Number.POSITIVE_INFINITY : a.rank;
  const rankB = b.rank == null ? Number.POSITIVE_INFINITY : b.rank;
  if (rankA !== rankB) return rankA - rankB;
  return String(a.uid).localeCompare(String(b.uid));
}

export function buildAllocateBidRows({
  items = [],
  lootSummary = {},
  categoryAllocations = {},
  rankingsByItem = {},
  requestsByItemDetails = {},
  members = {},
} = {}) {
  const selectedRows = [];
  const notSelectedRows = [];

  itemsWithLoot(items, lootSummary).forEach((item) => {
    const rankings = rankingList(rankingsByItem, item.id);
    const detailsMap = requestsByItemDetails?.[item.id] || {};
    const selectedSet = new Set(uniqueSelectedUids(categoryAllocations, item.id));

    const selectedForItem = [...selectedSet]
      .map((uid) => buildRow({ item, uid, rankings, detailsMap, members }))
      .sort(sortByRank);
    selectedRows.push(...selectedForItem);

    rankings.forEach((uid) => {
      if (selectedSet.has(uid)) return;
      notSelectedRows.push(buildRow({ item, uid, rankings, detailsMap, members }));
    });
  });

  return { selectedRows, notSelectedRows };
}
