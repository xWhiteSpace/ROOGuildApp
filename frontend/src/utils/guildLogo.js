import { PRODUCT_MARK_SRC } from '../brand';

const VALHALLA_MARK = PRODUCT_MARK_SRC;

export function discordGuildIconUrl(guildId, iconHash) {
  if (!guildId || !iconHash) return '';
  const hash = String(iconHash);
  const ext = hash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${guildId}/${hash}.${ext}?size=128`;
}

/** Imported logo, else Discord server icon, else VALHALLA mark. */
export function guildMarkSrc({ logoUrl, guildId, icon } = {}) {
  const imported = String(logoUrl || '').trim();
  if (imported) return imported;
  return discordGuildIconUrl(guildId, icon) || VALHALLA_MARK;
}

export function onGuildMarkError(event) {
  const el = event.currentTarget;
  if (!el || el.dataset.fallbackApplied) return;
  el.dataset.fallbackApplied = '1';
  el.src = VALHALLA_MARK;
}

export default { discordGuildIconUrl, guildMarkSrc, onGuildMarkError };
