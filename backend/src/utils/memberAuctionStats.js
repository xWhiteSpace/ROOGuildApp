/**
 * Pure aggregator for Profile Auction Rewards.
 * Item list SSOT = Settings catalog ids matching item_xxx.
 * Counts = this member's past_auction_awards rows (snowflake + itemId).
 * Recorded battles = unique loot_history date+event groups (guild-wide).
 * Legacy award rows without itemId fall back to case-insensitive item name.
 */

const ITEM_XXX = /^item_\d+$/i;

export function asItemsList(rawItems) {
  if (!rawItems) return [];
  if (Array.isArray(rawItems)) return rawItems.filter(Boolean);
  return Object.values(rawItems).filter(Boolean);
}

export function catalogItemXxxList(rawItems) {
  return asItemsList(rawItems).filter((item) => ITEM_XXX.test(String(item?.id || '').trim()));
}

export function resolveCatalogItem(row, itemsList) {
  if (!row || !itemsList?.length) return null;
  if (row.itemId) {
    const id = String(row.itemId).trim().toLowerCase();
    const byId = itemsList.find((i) => i.id && String(i.id).trim().toLowerCase() === id);
    if (byId) return byId;
  }
  if (row.item) {
    const name = String(row.item).trim().toLowerCase();
    const byName = itemsList.find((i) => (i.name || '').trim().toLowerCase() === name);
    if (byName) return byName;
  }
  return null;
}

function rowBelongsToMember(row, memberUid) {
  if (!row || !memberUid) return false;
  return String(row.userId || '').trim() === String(memberUid).trim();
}

export function buildMemberAuctionStats({ lootHistory, pastAuctions, memberUid, itemsList = [] }) {
  const catalog = catalogItemXxxList(itemsList);
  const battleKeys = new Set();

  Object.values(lootHistory || {}).forEach((row) => {
    if (!row) return;
    battleKeys.add(`${row.date || ''}_${row.event || ''}`);
  });

  const qtyByKey = new Map();
  catalog.forEach((item) => {
    qtyByKey.set(String(item.id).trim(), 0);
  });

  const extraMeta = new Map();

  Object.values(pastAuctions || {}).forEach((row) => {
    if (!rowBelongsToMember(row, memberUid)) return;
    const qty = parseInt(row.quantity, 10) || 0;
    if (qty === 0) return;

    const catalogItem = resolveCatalogItem(row, catalog);
    const key = catalogItem?.id || String(row.itemId || row.item || 'unknown').trim();
    qtyByKey.set(key, (qtyByKey.get(key) || 0) + qty);

    if (!catalogItem && !extraMeta.has(key)) {
      extraMeta.set(key, {
        itemId: row.itemId || key,
        name: row.item || row.itemId || 'Unknown',
        colorTheme: '',
      });
    }
  });

  const items = [];
  catalog.forEach((item) => {
    const id = String(item.id).trim();
    items.push({
      itemId: id,
      name: item.name || id,
      colorTheme: item.colorTheme || '',
      quantity: qtyByKey.get(id) || 0,
    });
  });
  extraMeta.forEach((meta, key) => {
    items.push({
      itemId: meta.itemId,
      name: meta.name,
      colorTheme: meta.colorTheme,
      quantity: qtyByKey.get(key) || 0,
    });
  });

  return {
    recordedBattles: battleKeys.size,
    totalItemsAcquired: items.reduce((sum, item) => sum + (item.quantity || 0), 0),
    items,
  };
}
