import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../services/apiClient';
import { queryClient } from './client';

const TWO_MIN = 2 * 60 * 1000;
const FIVE_MIN = 5 * 60 * 1000;

export const queryKeys = {
  members: (view = 'full') => ['members', view],
  settings: (fields = 'all') => ['settings', fields],
  settingsAdmin: () => ['settings-admin'],
  raidHistory: (limit = 12) => ['raid-history', limit],
  requestInit: () => ['request-init'],
  requestQueue: (itemId) => ['request-queue', itemId],
  warRoomInit: () => ['war-room-init'],
  requestHistory: (params) => ['request-history', params],
  pastAuctionDates: () => ['past-auction-dates'],
  pastAuctionNight: (date) => ['past-auction-night', date],
  profile: (uid) => ['profile', uid],
  auctionStats: (uid) => ['auction-stats', uid],
  peakHours: () => ['peak-hours'],
  commitments: (weekMonday = 'all') => ['commitments', weekMonday],
  compositionsList: () => ['compositions', 'list'],
  composition: (id) => ['compositions', 'detail', id],
  ocrReviews: () => ['ocr-reviews'],
  ocrEvents: () => ['ocr-events'],
  ocrReview: (id) => ['ocr-review', id],
  specialEvents: () => ['special-events'],
  attendanceMe: () => ['attendance-me'],
  weekInstances: (weekMonday) => ['week-instances', weekMonday],
  published: () => ['published'],
  activeSession: () => ['active-session'],
  discordRoles: (guildId) => ['discord-roles', guildId],
  voicePresence: (channels) => ['voice-presence', channels],
};

function readEtag(res) {
  return String(res.headers.get('ETag') || '').replace(/^W\//, '').replaceAll('"', '');
}

async function fetchEtagged(path, etagKey) {
  const etag = queryClient.getQueryData(etagKey);
  const res = await apiFetch(path, {
    headers: etag ? { 'If-None-Match': `"${etag}"` } : {},
  });
  if (res.status === 401) throw new Error('Session identity missing');
  const nextTag = readEtag(res);
  if (nextTag) queryClient.setQueryData(etagKey, nextTag);
  if (res.status === 304) {
    const cached = queryClient.getQueryData([...etagKey, 'body']);
    if (cached) return cached;
    const retry = await apiFetch(path);
    const data = await retry.json();
    queryClient.setQueryData([...etagKey, 'body'], data);
    return data;
  }
  const data = await res.json();
  queryClient.setQueryData([...etagKey, 'body'], data);
  return data;
}

async function readSuccess(res, fallbackError) {
  const data = await res.json();
  if (!data.success) throw new Error(data.error || fallbackError);
  return data;
}

export function useMembers(view, options = {}) {
  const key = view === 'card' || view === 'list' ? view : 'full';
  const suffix = key === 'full' ? '' : `?view=${key}`;
  return useQuery({
    queryKey: queryKeys.members(key),
    queryFn: async () => {
      const res = await apiFetch(`/api/attendance/members${suffix}`);
      const data = await readSuccess(res, 'Failed to load members');
      return data.members || {};
    },
    staleTime: FIVE_MIN,
    ...options,
  });
}

/** Raid-roster card slice only. Own cache key so full card/list maps stay intact. */
export function useRaidRosterCard(options = {}) {
  return useQuery({
    queryKey: queryKeys.members('card-raid'),
    queryFn: async () => {
      const res = await apiFetch('/api/attendance/members?view=card&roster=raid');
      const data = await readSuccess(res, 'Failed to load members');
      return data.members || {};
    },
    staleTime: FIVE_MIN,
    ...options,
  });
}

function toCardMember(uid, m) {
  return {
    uid,
    displayName: m?.displayName || '',
    jobCode: m?.jobCode || '',
    isRaidRoster: m?.isRaidRoster === true,
  };
}

/** Patch roster caches after a local save so we do not refetch the table. */
export function setMembersCaches(members) {
  const list = members || {};
  const card = {};
  const raid = {};
  Object.entries(list).forEach(([uid, m]) => {
    const row = toCardMember(uid, m);
    card[uid] = row;
    if (row.isRaidRoster) raid[uid] = row;
  });
  queryClient.setQueryData(queryKeys.members('list'), list);
  queryClient.setQueryData(queryKeys.members('card'), card);
  queryClient.setQueryData(queryKeys.members('card-raid'), raid);
}

export function upsertMemberCaches(uid, member) {
  if (!uid || !member) return;
  const cardRow = toCardMember(uid, member);
  queryClient.setQueryData(queryKeys.members('list'), (prev) => ({ ...(prev || {}), [uid]: member }));
  queryClient.setQueryData(queryKeys.members('card'), (prev) => ({
    ...(prev || {}),
    [uid]: cardRow,
  }));
  queryClient.setQueryData(queryKeys.members('card-raid'), (prev) => {
    const next = { ...(prev || {}) };
    if (cardRow.isRaidRoster) next[uid] = cardRow;
    else delete next[uid];
    return next;
  });
}

export function useSettings(fields, options = {}) {
  const fieldKey = fields || 'all';
  const suffix = fields ? `?fields=${encodeURIComponent(fields)}` : '';
  return useQuery({
    queryKey: queryKeys.settings(fieldKey),
    queryFn: async () => {
      const res = await apiFetch(`/api/requests/settings/get${suffix}`);
      const data = await readSuccess(res, 'Failed to load settings');
      return data.config || {};
    },
    staleTime: FIVE_MIN,
    ...options,
  });
}

export function useSettingsAdmin(options = {}) {
  return useQuery({
    queryKey: queryKeys.settingsAdmin(),
    queryFn: async () => {
      const res = await apiFetch('/api/requests/settings/get');
      const data = await readSuccess(res, 'Failed to load settings');
      return {
        config: data.config || {},
        discordChannels: data.discordChannels || null,
        publicOnly: Boolean(data.publicOnly),
      };
    },
    staleTime: FIVE_MIN,
    ...options,
  });
}

export function useRaidHistory(limit = 12, options = {}) {
  return useQuery({
    queryKey: queryKeys.raidHistory(limit),
    queryFn: async () => {
      const res = await apiFetch(`/api/live-raid/history/all?limit=${limit}`);
      const data = await readSuccess(res, 'Failed to load raid history');
      return data.sessions || {};
    },
    staleTime: TWO_MIN,
    ...options,
  });
}

export function useRequestInit(options = {}) {
  return useQuery({
    queryKey: queryKeys.requestInit(),
    queryFn: async () => {
      const data = await fetchEtagged('/api/requests/init', ['etag', 'request-init']);
      if (!data?.success) throw new Error(data?.error || 'Failed to load request lobby');
      return data;
    },
    staleTime: TWO_MIN,
    ...options,
  });
}

export function useRequestQueue(itemId, options = {}) {
  return useQuery({
    queryKey: queryKeys.requestQueue(itemId),
    queryFn: async () => {
      const data = await fetchEtagged(
        `/api/requests/queue?itemId=${encodeURIComponent(itemId)}`,
        ['etag', 'request-queue', itemId],
      );
      if (!data?.success) throw new Error(data?.error || 'Failed to load item queue');
      return data;
    },
    enabled: Boolean(itemId),
    staleTime: TWO_MIN,
    ...options,
  });
}

export function useRequestHistory(params, options = {}) {
  return useQuery({
    queryKey: queryKeys.requestHistory(params),
    queryFn: async () => {
      const search = new URLSearchParams({
        page: String(params.page || 1),
        limit: String(params.limit || 60),
        sort: params.sort || 'date',
        dir: params.dir || 'desc',
      });
      if (params.mine) search.set('mine', '1');
      if (params.q) search.set('q', params.q);
      if (params.status && params.status !== 'all') search.set('status', params.status);
      const res = await apiFetch(`/api/requests/request-history?${search.toString()}`);
      if (res.status === 401) throw new Error('Session identity missing');
      return readSuccess(res, 'Failed to load request history');
    },
    staleTime: TWO_MIN,
    placeholderData: keepPreviousData,
    ...options,
  });
}

export function usePastAuctionDates(options = {}) {
  return useQuery({
    queryKey: queryKeys.pastAuctionDates(),
    queryFn: async () => {
      const res = await apiFetch('/api/requests/past-auctions');
      const data = await readSuccess(res, 'Failed to load past auction dates');
      return data.dates || [];
    },
    staleTime: FIVE_MIN,
    ...options,
  });
}

export function usePastAuctionNight(date, options = {}) {
  return useQuery({
    queryKey: queryKeys.pastAuctionNight(date),
    queryFn: async () => {
      const res = await apiFetch(`/api/requests/past-auctions?date=${encodeURIComponent(date)}`);
      const data = await readSuccess(res, 'Failed to load past auction night');
      return data.history || [];
    },
    enabled: Boolean(date),
    staleTime: FIVE_MIN,
    ...options,
  });
}

export function useProfile(uid, { isSelf = false, enabled = true, ...options } = {}) {
  const path = isSelf
    ? '/api/attendance/profile'
    : `/api/attendance/profile?uid=${encodeURIComponent(String(uid || ''))}`;
  return useQuery({
    queryKey: queryKeys.profile(uid),
    queryFn: async () => {
      const res = await apiFetch(path);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load profile');
      return data;
    },
    enabled: Boolean(uid) && enabled,
    staleTime: FIVE_MIN,
    ...options,
  });
}

export function useMemberAuctionStats(uid, options = {}) {
  return useQuery({
    queryKey: queryKeys.auctionStats(uid),
    queryFn: async () => {
      const res = await apiFetch(`/api/requests/member-auction-stats?uid=${encodeURIComponent(String(uid || ''))}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { recordedBattles: 0, totalItemsAcquired: 0, items: [] };
      }
      return {
        recordedBattles: parseInt(data.recordedBattles, 10) || 0,
        totalItemsAcquired: parseInt(data.totalItemsAcquired, 10) || 0,
        items: Array.isArray(data.items) ? data.items : [],
      };
    },
    enabled: Boolean(uid),
    staleTime: FIVE_MIN,
    ...options,
  });
}

export function usePeakHours(options = {}) {
  return useQuery({
    queryKey: queryKeys.peakHours(),
    queryFn: async () => {
      const res = await apiFetch('/api/attendance/peak-hours');
      return readSuccess(res, 'Could not load Peak Hours.');
    },
    staleTime: FIVE_MIN,
    ...options,
  });
}

export function useWarRoomInit(options = {}) {
  return useQuery({
    queryKey: queryKeys.warRoomInit(),
    queryFn: async () => {
      const data = await fetchEtagged('/api/war-room/init', ['etag', 'war-room-init']);
      if (!data?.success) throw new Error(data?.error || 'Failed to load War Room');
      return data;
    },
    staleTime: TWO_MIN,
    ...options,
  });
}

export function useCommitments(weekMonday = '', options = {}) {
  const weekKey = weekMonday || 'all';
  const suffix = weekMonday ? `?weekMonday=${encodeURIComponent(weekMonday)}` : '';
  return useQuery({
    queryKey: queryKeys.commitments(weekKey),
    queryFn: async () => {
      const data = await fetchEtagged(`/api/attendance/commitments${suffix}`, ['etag', 'commitments', weekKey]);
      if (data?.commitments) return data.commitments;
      if (data?.unchanged) return queryClient.getQueryData(queryKeys.commitments(weekKey)) || {};
      if (!data?.success) throw new Error(data?.error || 'Failed to load commitments');
      return {};
    },
    staleTime: TWO_MIN,
    placeholderData: keepPreviousData,
    ...options,
  });
}

export function useCompositionsList(options = {}) {
  return useQuery({
    queryKey: queryKeys.compositionsList(),
    queryFn: async () => {
      const res = await apiFetch('/api/attendance/compositions?fields=list');
      const data = await readSuccess(res, 'Failed to load compositions');
      return data.compositions || {};
    },
    staleTime: FIVE_MIN,
    ...options,
  });
}

export function useComposition(id, options = {}) {
  return useQuery({
    queryKey: queryKeys.composition(id),
    queryFn: async () => {
      const res = await apiFetch(`/api/attendance/compositions?id=${encodeURIComponent(id)}`);
      const data = await readSuccess(res, 'Failed to load composition');
      return data.compositions || {};
    },
    enabled: Boolean(id),
    staleTime: FIVE_MIN,
    ...options,
  });
}

export function useOcrReviews(options = {}) {
  return useQuery({
    queryKey: queryKeys.ocrReviews(),
    queryFn: async () => {
      const res = await apiFetch('/api/ocr-reviews');
      const data = await readSuccess(res, 'Failed to load OCR reviews');
      return data.reviews || [];
    },
    staleTime: TWO_MIN,
    ...options,
  });
}

export function useOcrReviewEvents(options = {}) {
  return useQuery({
    queryKey: queryKeys.ocrEvents(),
    queryFn: async () => {
      const res = await apiFetch('/api/ocr-reviews/events');
      const data = await readSuccess(res, 'Failed to load events');
      return data.events || [];
    },
    staleTime: FIVE_MIN,
    ...options,
  });
}

export function useOcrReview(id, options = {}) {
  return useQuery({
    queryKey: queryKeys.ocrReview(id),
    queryFn: async () => {
      const res = await apiFetch(`/api/ocr-reviews/${encodeURIComponent(id)}`);
      return readSuccess(res, 'Failed to load review');
    },
    enabled: Boolean(id),
    staleTime: TWO_MIN,
    ...options,
  });
}

export function useSpecialEvents(options = {}) {
  return useQuery({
    queryKey: queryKeys.specialEvents(),
    queryFn: async () => {
      const res = await apiFetch('/api/attendance/special-events');
      const data = await readSuccess(res, 'Failed to load special events');
      return data.specialEvents || {};
    },
    staleTime: TWO_MIN,
    ...options,
  });
}

export function useAttendanceMe(options = {}) {
  return useQuery({
    queryKey: queryKeys.attendanceMe(),
    queryFn: async () => {
      const res = await apiFetch('/api/attendance/me');
      return readSuccess(res, 'Failed to load attendance profile');
    },
    staleTime: TWO_MIN,
    ...options,
  });
}

export function useWeekInstances(weekMonday, options = {}) {
  return useQuery({
    queryKey: queryKeys.weekInstances(weekMonday || 'current'),
    queryFn: async () => {
      const res = await apiFetch('/api/attendance/ensure-week', {
        method: 'POST',
        body: JSON.stringify({ weekMonday: weekMonday || undefined, force: false }),
      });
      return readSuccess(res, 'Failed to load week instances');
    },
    enabled: Boolean(weekMonday),
    staleTime: FIVE_MIN,
    ...options,
  });
}

export function usePublished(options = {}) {
  return useQuery({
    queryKey: queryKeys.published(),
    queryFn: async () => {
      const res = await apiFetch('/api/attendance/published');
      const data = await readSuccess(res, 'Failed to load published raids');
      return {
        published: data.published || {},
        anchor: data.anchor || null,
      };
    },
    staleTime: TWO_MIN,
    ...options,
  });
}

export function useActiveSession(options = {}) {
  return useQuery({
    queryKey: queryKeys.activeSession(),
    queryFn: async () => {
      const data = await fetchEtagged('/api/requests/active-session', ['etag', 'active-session']);
      if (!data?.success) throw new Error(data?.error || 'Failed to load active session');
      return data.session || null;
    },
    staleTime: TWO_MIN,
    ...options,
  });
}

export function useDiscordRoles(guildId, options = {}) {
  return useQuery({
    queryKey: queryKeys.discordRoles(guildId),
    queryFn: async () => {
      const res = await apiFetch(`/api/tenants/discord-roles?guildId=${encodeURIComponent(guildId)}`);
      const data = await readSuccess(res, 'Failed to load Discord roles');
      return data.roles || [];
    },
    enabled: Boolean(guildId),
    staleTime: FIVE_MIN,
    ...options,
  });
}

export function useTenantWorkspace(options = {}) {
  return useQuery({
    queryKey: ['tenant-workspace'],
    queryFn: async () => {
      const res = await apiFetch('/api/tenants/workspace');
      return readSuccess(res, 'Failed to load workspace');
    },
    staleTime: FIVE_MIN,
    ...options,
  });
}

export function useVoicePresence(channelRefs, options = {}) {
  const channels = Array.isArray(channelRefs) ? channelRefs.filter(Boolean).join(',') : '';
  return useQuery({
    queryKey: queryKeys.voicePresence(channels),
    queryFn: async () => {
      const res = await apiFetch(`/api/live-raid/voice-presence?channels=${encodeURIComponent(channels)}`);
      const data = await readSuccess(res, 'Failed to load voice presence');
      return data.presentUids || [];
    },
    enabled: Boolean(channels),
    staleTime: 30 * 1000,
    ...options,
  });
}

export function invalidateRequestHistory() {
  return queryClient.invalidateQueries({ queryKey: ['request-history'] });
}

export function invalidateRequestLobby() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['request-init'] }),
    queryClient.invalidateQueries({ queryKey: ['request-queue'] }),
    queryClient.removeQueries({ queryKey: ['etag', 'request-init'] }),
    queryClient.removeQueries({ queryKey: ['etag', 'request-queue'] }),
    invalidateRequestHistory(),
  ]);
}

export function invalidateMembers() {
  return queryClient.invalidateQueries({ queryKey: ['members'] });
}

export function invalidateRaidHistory() {
  return queryClient.invalidateQueries({ queryKey: ['raid-history'] });
}

export function invalidateSettings() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['settings'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.settingsAdmin() }),
  ]);
}

export function invalidateCommitments() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['commitments'] }),
    queryClient.removeQueries({ queryKey: ['etag', 'commitments'] }),
  ]);
}

export function invalidateCompositions() {
  return queryClient.invalidateQueries({ queryKey: ['compositions'] });
}

export function invalidateOcrReviews() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['ocr-reviews'] }),
    queryClient.invalidateQueries({ queryKey: ['ocr-review'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.ocrEvents() }),
  ]);
}

export function invalidateSpecialEvents() {
  return queryClient.invalidateQueries({ queryKey: queryKeys.specialEvents() });
}

export function invalidatePublished() {
  return queryClient.invalidateQueries({ queryKey: queryKeys.published() });
}

export function invalidateActiveSession() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.activeSession() }),
    queryClient.removeQueries({ queryKey: ['etag', 'active-session'] }),
  ]);
}

export function invalidateAttendanceMe() {
  return queryClient.invalidateQueries({ queryKey: queryKeys.attendanceMe() });
}

export async function refreshWeekInstances(weekMonday) {
  const data = await queryClient.fetchQuery({
    queryKey: queryKeys.weekInstances(weekMonday || 'current'),
    queryFn: async () => {
      const res = await apiFetch('/api/attendance/ensure-week', {
        method: 'POST',
        body: JSON.stringify({ weekMonday: weekMonday || undefined, force: true }),
      });
      return readSuccess(res, 'Failed to refresh week instances');
    },
    staleTime: 0,
  });
  return data;
}

export function invalidateProfile(uid) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: uid ? queryKeys.profile(uid) : ['profile'] }),
    queryClient.invalidateQueries({ queryKey: uid ? queryKeys.auctionStats(uid) : ['auction-stats'] }),
  ]);
}

export function invalidatePeakHours() {
  return queryClient.invalidateQueries({ queryKey: queryKeys.peakHours() });
}

export function invalidateWarRoom() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.warRoomInit() }),
    queryClient.removeQueries({ queryKey: ['etag', 'war-room-init'] }),
  ]);
}

export async function fetchRequestQueue(itemId) {
  if (!itemId) return null;
  return queryClient.fetchQuery({
    queryKey: queryKeys.requestQueue(itemId),
    queryFn: async () => {
      const data = await fetchEtagged(
        `/api/requests/queue?itemId=${encodeURIComponent(itemId)}`,
        ['etag', 'request-queue', itemId],
      );
      if (!data?.success) throw new Error(data?.error || 'Failed to load item queue');
      return data;
    },
    staleTime: TWO_MIN,
  });
}
