import { DEFAULT_TZ, formatGuildDate } from '../../../utils/guildTime.js';

export const MEMBER_HISTORY_PATH = 'auction/member_history';
const SHEET_ROWS_PATH = 'attendance/gvg_sheet';

function dayOrBlank(value) {
  const text = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function stayId(uid, leftAt, index) {
  return `${uid}:${leftAt || 'open'}:${index}`;
}

export async function loadMemberHistory(db) {
  const snap = await db.ref(MEMBER_HISTORY_PATH).once('value');
  const stays = snap.exists() ? snap.val()?.stays : null;
  return Array.isArray(stays) ? stays : [];
}

async function saveMemberHistory(db, stays) {
  await db.ref(MEMBER_HISTORY_PATH).set({ stays });
  return stays;
}

function sortStays(stays) {
  return stays.slice().sort((a, b) => {
    const leftA = a.leftAt || '';
    const leftB = b.leftAt || '';
    if (!leftA && leftB) return 1;
    if (leftA && !leftB) return -1;
    if (leftA !== leftB) return leftB.localeCompare(leftA);
    return String(a.displayName || a.snowflake || '').localeCompare(String(b.displayName || b.snowflake || ''));
  });
}

function liveRow(uid, member) {
  return {
    id: `live:${uid}`,
    uid: String(uid),
    displayName: String(member?.displayName || ''),
    snowflake: String(uid),
    joinedAt: dayOrBlank(member?.joinedAt),
    leftAt: '',
    current: true,
  };
}

function currentRoster(members) {
  return Object.entries(members || {})
    .filter(([, member]) => member?.isRaidRoster === true)
    .map(([uid, member]) => liveRow(uid, member))
    .sort((a, b) => String(a.displayName || a.snowflake).localeCompare(String(b.displayName || b.snowflake)));
}

function leftRow(uid, member) {
  return {
    id: `left:${uid}`,
    uid: String(uid),
    displayName: String(member?.displayName || ''),
    snowflake: String(uid),
    joinedAt: dayOrBlank(member?.joinedAt),
    leftAt: dayOrBlank(member?.leftAt),
    current: false,
  };
}

function departedMembers(members) {
  return Object.entries(members || {})
    .filter(([, member]) => member?.isRaidRoster !== true && dayOrBlank(member?.leftAt))
    .map(([uid, member]) => leftRow(uid, member));
}

export function windowsFrom(members, stays) {
  const windows = {};
  const living = new Set(Object.keys(members || {}));
  for (const [uid, member] of Object.entries(members || {})) {
    const joined = dayOrBlank(member?.joinedAt);
    if (!joined) continue;
    windows[String(uid)] = [{ joined, left: dayOrBlank(member?.leftAt) }];
  }
  for (const stay of stays || []) {
    const uid = String(stay?.uid || '');
    if (!uid || living.has(uid)) continue;
    const joined = dayOrBlank(stay?.joinedAt);
    const left = dayOrBlank(stay?.leftAt);
    if (!joined || !left) continue;
    if (!windows[uid]) windows[uid] = [];
    windows[uid].push({ joined, left });
  }
  return windows;
}

export function warInWindow(eventDate, windows, uid) {
  const day = dayOrBlank(eventDate);
  if (!day) return false;
  for (const stay of windows?.[String(uid)] || []) {
    if (!stay.joined || day < stay.joined) continue;
    if (stay.left && day >= stay.left) continue;
    return true;
  }
  return false;
}

async function loadMembers(db) {
  const snap = await db.ref('auction/members').once('value');
  return snap.exists() ? snap.val() || {} : {};
}

export async function listMemberHistory(db) {
  const [members, stays, rowsSnap] = await Promise.all([
    loadMembers(db),
    loadMemberHistory(db),
    db.ref(SHEET_ROWS_PATH).once('value'),
  ]);
  const rows = rowsSnap.exists() ? rowsSnap.val()?.rows : null;
  const known = new Set(stays.map((stay) => String(stay?.uid || '')));
  const extra = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const uid = String(row?.uid || '');
    if (!uid || members[uid] || known.has(uid)) continue;
    extra.push({
      id: `gap:${uid}`,
      uid,
      displayName: String(row.displayName || row.alias || ''),
      snowflake: String(row.snowflake || uid),
      joinedAt: '',
      leftAt: '',
    });
    known.add(uid);
  }
  const next = extra.length ? await saveMemberHistory(db, stays.concat(extra)) : stays;
  const archived = next.filter((stay) => !members[String(stay?.uid || '')]);
  return [...currentRoster(members), ...sortStays([...departedMembers(members), ...archived])];
}

export function rosterMembershipPatch(existing, staged, today) {
  const wasOn = existing?.isRaidRoster === true;
  const nowOn = staged?.isRaidRoster === true;
  if (wasOn && !nowOn) return { leftAt: today };
  if (!wasOn && nowOn) {
    return {
      leftAt: null,
      joinedAt: dayOrBlank(existing?.joinedAt) || dayOrBlank(staged?.joinedAt) || today,
    };
  }
  return {};
}

export async function membershipWindows(db) {
  const [members, stays] = await Promise.all([
    loadMembers(db),
    listMemberHistory(db),
  ]);
  return windowsFrom(members, stays);
}

export async function appendVanishStays(db, uids, timezone = DEFAULT_TZ) {
  const members = await loadMembers(db);
  const stays = await loadMemberHistory(db);
  const today = formatGuildDate(new Date(), timezone || DEFAULT_TZ);
  const next = stays.slice();
  for (const raw of uids || []) {
    const uid = String(raw || '');
    const member = members[uid];
    if (!uid || !member) continue;
    next.push({
      id: stayId(uid, today, next.length),
      uid,
      displayName: String(member.displayName || ''),
      snowflake: uid,
      joinedAt: dayOrBlank(member.joinedAt),
      leftAt: today,
    });
  }
  if (next.length === stays.length) return stays;
  return saveMemberHistory(db, next);
}

export async function updateMemberHistoryChanges(db, changes) {
  const list = Array.isArray(changes) ? changes : [];
  const stays = await loadMemberHistory(db);
  const byId = new Map(stays.map((stay) => [String(stay?.id || ''), stay]));
  const liveJoined = [];
  const leftEdits = [];
  let historyChanged = false;
  for (const change of list) {
    const id = String(change?.id || '');
    if (!id || !change || typeof change !== 'object') continue;
    if (id.startsWith('live:')) {
      if (!Object.prototype.hasOwnProperty.call(change, 'joinedAt')) continue;
      liveJoined.push({ uid: id.slice('live:'.length), joinedAt: dayOrBlank(change.joinedAt) });
      continue;
    }
    if (id.startsWith('left:')) {
      const patch = { uid: id.slice('left:'.length) };
      if (Object.prototype.hasOwnProperty.call(change, 'joinedAt')) patch.joinedAt = dayOrBlank(change.joinedAt);
      if (Object.prototype.hasOwnProperty.call(change, 'leftAt')) patch.leftAt = dayOrBlank(change.leftAt);
      if (patch.joinedAt === undefined && patch.leftAt === undefined) continue;
      leftEdits.push(patch);
      continue;
    }
    const stay = byId.get(id);
    if (!stay) continue;
    const next = { ...stay };
    if (Object.prototype.hasOwnProperty.call(change, 'joinedAt')) next.joinedAt = dayOrBlank(change.joinedAt);
    if (Object.prototype.hasOwnProperty.call(change, 'leftAt')) next.leftAt = dayOrBlank(change.leftAt);
    byId.set(id, next);
    historyChanged = true;
  }
  if (historyChanged) {
    await saveMemberHistory(db, stays.map((stay) => byId.get(String(stay?.id || '')) || stay));
  }
  const updated = [];
  if (liveJoined.length) {
    const members = await loadMembers(db);
    const writes = {};
    for (const row of liveJoined) {
      const member = members[row.uid];
      if (!member || member.isRaidRoster !== true) continue;
      writes[`auction/members/${row.uid}/joinedAt`] = row.joinedAt || null;
      updated.push(liveRow(row.uid, { ...member, joinedAt: row.joinedAt }));
    }
    if (Object.keys(writes).length) await db.ref().update(writes);
  }
  if (leftEdits.length) {
    const members = await loadMembers(db);
    const writes = {};
    for (const row of leftEdits) {
      const member = members[row.uid];
      if (!member || member.isRaidRoster === true) continue;
      const next = { ...member };
      if (row.joinedAt !== undefined) {
        next.joinedAt = row.joinedAt;
        writes[`auction/members/${row.uid}/joinedAt`] = row.joinedAt || null;
      }
      if (row.leftAt !== undefined) {
        next.leftAt = row.leftAt;
        writes[`auction/members/${row.uid}/leftAt`] = row.leftAt || null;
      }
      updated.push(leftRow(row.uid, next));
    }
    if (Object.keys(writes).length) await db.ref().update(writes);
  }
  for (const stay of byId.values()) {
    if (list.some((change) => String(change?.id || '') === String(stay?.id || '') && !String(stay?.id || '').startsWith('live:'))) {
      updated.push(stay);
    }
  }
  return updated;
}

export async function updateStayDates(db, stayId, body) {
  const id = String(stayId || '');
  if (id.startsWith('live:')) {
    const uid = id.slice('live:'.length);
    const snap = await db.ref(`auction/members/${uid}`).once('value');
    const member = snap.exists() ? snap.val() : null;
    if (!member || member.isRaidRoster !== true) return null;
    const joinedAt = dayOrBlank(body?.joinedAt);
    await db.ref(`auction/members/${uid}/joinedAt`).set(joinedAt || null);
    return liveRow(uid, { ...member, joinedAt });
  }
  if (id.startsWith('left:')) {
    const uid = id.slice('left:'.length);
    const snap = await db.ref(`auction/members/${uid}`).once('value');
    const member = snap.exists() ? snap.val() : null;
    if (!member || member.isRaidRoster === true) return null;
    const joinedAt = dayOrBlank(body?.joinedAt);
    const leftAt = dayOrBlank(body?.leftAt);
    await db.ref(`auction/members/${uid}`).update({
      joinedAt: joinedAt || null,
      leftAt: leftAt || null,
    });
    return leftRow(uid, { ...member, joinedAt, leftAt });
  }
  const stays = await loadMemberHistory(db);
  let found = null;
  const next = stays.map((stay) => {
    if (String(stay?.id || '') !== id) return stay;
    found = {
      ...stay,
      joinedAt: dayOrBlank(body?.joinedAt),
      leftAt: dayOrBlank(body?.leftAt),
    };
    return found;
  });
  if (!found) return null;
  await saveMemberHistory(db, next);
  return found;
}
