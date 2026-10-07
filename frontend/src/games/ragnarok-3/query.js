import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../services/apiClient';
import { queryClient } from '../../query/client';

const TWO_MIN = 2 * 60 * 1000;
const FIVE_MIN = 5 * 60 * 1000;

export const queryKeys = {
  members: (view = 'full') => ['r3', 'members', view],
  settings: (fields = 'all') => ['r3', 'settings', fields],
  settingsAdmin: () => ['r3', 'settings-admin'],
  raidHistory: (limit = 12) => ['r3', 'raid-history', limit],
  warRoomInit: () => ['r3', 'war-room-init'],
  profile: (uid) => ['r3', 'profile', uid],
  auctionStats: (uid) => ['r3', 'auction-stats', uid],
  peakHours: () => ['r3', 'peak-hours'],
  commitments: (weekMonday = 'all') => ['r3', 'commitments', weekMonday],
  compositionsList: () => ['r3', 'compositions', 'list'],
  composition: (id) => ['r3', 'compositions', 'detail', id],
  ocrReviews: () => ['r3', 'ocr-reviews'],
  ocrEvents: () => ['r3', 'ocr-events'],
  ocrReview: (id) => ['r3', 'ocr-review', id],
  specialEvents: () => ['r3', 'special-events'],
  attendanceMe: () => ['r3', 'attendance-me'],
  weekInstances: (weekMonday) => ['r3', 'week-instances', weekMonday],
  published: () => ['r3', 'published'],
  discordRoles: (guildId) => ['r3', 'discord-roles', guildId],
  voicePresence: (channels) => ['r3', 'voice-presence', channels],
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
      const res = await apiFetch(`/api/ragnarok-3/members${suffix}`);
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
  Object.entries(list).forEach(([uid, m]) => {
    card[uid] = toCardMember(uid, m);
  });
  queryClient.setQueryData(queryKeys.members('list'), list);
  queryClient.setQueryData(queryKeys.members('card'), card);
}

export function upsertMemberCaches(uid, member) {
  if (!uid || !member) return;
  queryClient.setQueryData(queryKeys.members('list'), (prev) => ({ ...(prev || {}), [uid]: member }));
  queryClient.setQueryData(queryKeys.members('card'), (prev) => ({
    ...(prev || {}),
    [uid]: toCardMember(uid, member),
  }));
}

export function useSettings(fields, options = {}) {
  const fieldKey = fields || 'all';
  const suffix = fields ? `?fields=${encodeURIComponent(fields)}` : '';
  return useQuery({
    queryKey: queryKeys.settings(fieldKey),
    queryFn: async () => {
      const res = await apiFetch(`/api/ragnarok-3/settings/get${suffix}`);
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
      const res = await apiFetch('/api/ragnarok-3/settings/get');
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
      const res = await apiFetch(`/api/ragnarok-3/live-raid/history/all?limit=${limit}`);
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
    ? '/api/ragnarok-3/profile'
    : `/api/ragnarok-3/profile?uid=${encodeURIComponent(String(uid || ''))}`;
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
    queryFn: async () => ({ recordedBattles: 0, totalItemsAcquired: 0, items: [] }),
    enabled: Boolean(uid),
    staleTime: FIVE_MIN,
    ...options,
  });
}

export function usePeakHours(options = {}) {
  return useQuery({
    queryKey: queryKeys.peakHours(),
    queryFn: async () => {
      const res = await apiFetch('/api/ragnarok-3/peak-hours');
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
      const data = await fetchEtagged('/api/ragnarok-3/war-room/init', ['etag', 'war-room-init']);
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
      const data = await fetchEtagged(`/api/ragnarok-3/commitments${suffix}`, ['etag', 'commitments', weekKey]);
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
      const res = await apiFetch('/api/ragnarok-3/compositions?fields=list');
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
      const res = await apiFetch(`/api/ragnarok-3/compositions?id=${encodeURIComponent(id)}`);
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
      const res = await apiFetch('/api/ragnarok-3/ocr-reviews');
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
      const res = await apiFetch('/api/ragnarok-3/ocr-reviews/events');
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
      const res = await apiFetch(`/api/ragnarok-3/ocr-reviews/${encodeURIComponent(id)}`);
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
      const res = await apiFetch('/api/ragnarok-3/special-events');
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
      const res = await apiFetch('/api/ragnarok-3/me');
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
      const res = await apiFetch('/api/ragnarok-3/ensure-week', {
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
      const res = await apiFetch('/api/ragnarok-3/published');
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
      const res = await apiFetch(`/api/ragnarok-3/live-raid/voice-presence?channels=${encodeURIComponent(channels)}`);
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
  return queryClient.invalidateQueries({ queryKey: ['r3', 'members'] });
}

export function invalidateRaidHistory() {
  return queryClient.invalidateQueries({ queryKey: ['r3', 'raid-history'] });
}

export function invalidateSettings() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['r3', 'settings'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.settingsAdmin() }),
  ]);
}

export function invalidateCommitments() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['r3', 'commitments'] }),
    queryClient.removeQueries({ queryKey: ['r3', 'etag', 'commitments'] }),
  ]);
}

export function invalidateCompositions() {
  return queryClient.invalidateQueries({ queryKey: ['r3', 'compositions'] });
}

export function invalidateOcrReviews() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['r3', 'ocr-reviews'] }),
    queryClient.invalidateQueries({ queryKey: ['r3', 'ocr-review'] }),
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
      const res = await apiFetch('/api/ragnarok-3/ensure-week', {
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
    queryClient.removeQueries({ queryKey: ['r3', 'etag', 'war-room-init'] }),
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
