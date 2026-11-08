function asBoxList(raw) {
  return Array.isArray(raw) ? raw : Object.values(raw || {});
}

function pagePos(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

function rangeCoords(row, perPage) {
  let page = pagePos(row?.startPage, 1);
  let pos = Math.min(perPage, pagePos(row?.startPos, 1));
  const endPage = pagePos(row?.endPage, page);
  const endPos = Math.min(perPage, pagePos(row?.endPos, pos));
  const startLin = (page - 1) * perPage + (pos - 1);
  const endLin = (endPage - 1) * perPage + (endPos - 1);
  if (endLin < startLin) return [];

  const coords = [];
  while (page < endPage || (page === endPage && pos <= endPos)) {
    coords.push({ page, slot: pos });
    pos += 1;
    if (pos > perPage) {
      pos = 1;
      page += 1;
    }
  }
  return coords;
}

export function auctionBookPageCount(lootRows = []) {
  let maxPage = 1;
  for (const row of lootRows || []) {
    const endPage = pagePos(row?.endPage, 1);
    if (endPage > maxPage) maxPage = endPage;
  }
  return maxPage;
}

export function placeAuctionBookSlots({
  items = [],
  lootRows = [],
  categoryAllocations = {},
  qtyPerPage = 4,
} = {}) {
  const perPage = Math.max(1, Number(qtyPerPage) || 1);
  const itemById = new Map((items || []).map((item) => [item?.id, item]));
  const rowsByItem = new Map();

  (lootRows || []).forEach((row) => {
    const itemId = row?.itemType;
    if (!itemId) return;
    if (!rowsByItem.has(itemId)) rowsByItem.set(itemId, []);
    rowsByItem.get(itemId).push(row);
  });

  const slots = [];
  rowsByItem.forEach((rows, itemId) => {
    const sorted = [...rows].sort((a, b) => {
      const pageDelta = pagePos(a.startPage, 1) - pagePos(b.startPage, 1);
      if (pageDelta !== 0) return pageDelta;
      return pagePos(a.startPos, 1) - pagePos(b.startPos, 1);
    });
    const coords = sorted.flatMap((row) => rangeCoords(row, perPage));
    const seats = asBoxList(categoryAllocations?.[itemId]?.selected);
    const item = itemById.get(itemId);
    coords.forEach((coord, index) => {
      const raw = index < seats.length ? seats[index] : '';
      const name = raw == null || raw === '' ? '' : raw;
      slots.push({
        name,
        itemType: itemId,
        itemName: item?.name || itemId,
        index,
        page: coord.page,
        slot: coord.slot,
        status: name === '' ? 'NotSelected' : 'Selected',
      });
    });
  });

  slots.sort((a, b) => a.page - b.page || a.slot - b.slot || String(a.itemType).localeCompare(String(b.itemType)));
  return slots;
}
