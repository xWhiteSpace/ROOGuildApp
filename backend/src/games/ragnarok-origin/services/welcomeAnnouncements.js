const TITLE_MAX = 80;
const FETCH_LIMIT = 5;
const BOARD_LIMIT = 5;
const CACHE_MS = 60 * 1000;

const cache = new Map();

function mentionName(bucket, id) {
  if (!bucket || id == null) return '';
  const hit = typeof bucket.get === 'function' ? (bucket.get(id) || bucket.get(String(id))) : bucket[id];
  if (!hit) return '';
  return String(hit.displayName || hit.globalName || hit.name || hit.username || '').trim();
}

export function readableDiscordText(raw, mentions = {}) {
  return String(raw || '')
    .replace(/<@&(\d+)>/g, (_, id) => {
      const name = mentionName(mentions.roles, id);
      return name ? `@${name}` : '@role';
    })
    .replace(/<#(\d+)>/g, (_, id) => {
      const name = mentionName(mentions.channels, id);
      return name ? `#${name}` : '#channel';
    })
    .replace(/<a?:([^:>]+):\d+>/g, (_, name) => name)
    .replace(/<@!?(\d+)>/g, (_, id) => {
      const name = mentionName(mentions.users, id);
      return name ? `@${name}` : '@user';
    });
}

function embedText(embed, key) {
  if (!embed) return '';
  return String(embed[key] || embed.data?.[key] || '');
}

function titledEmbed(message) {
  const list = Array.isArray(message?.embeds) ? message.embeds : [];
  return list.find((item) => embedText(item, 'title').trim()) || null;
}

function describedEmbed(message) {
  const list = Array.isArray(message?.embeds) ? message.embeds : [];
  return list.find((item) => embedText(item, 'description').trim()) || null;
}

function titleAndBody(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { title: '', body: '' };
  const lines = trimmed.split('\n');
  const first = lines[0].trim();
  const rest = lines.slice(1).join('\n').trim();
  if (first.length <= TITLE_MAX && rest) return { title: first, body: rest };
  return { title: '', body: trimmed };
}

function authorName(message) {
  const server = String(message?.member?.displayName || '').trim();
  const username = String(message?.author?.username || '').trim();
  return server || username || 'Officer';
}

export function announcementFromDiscordMessage(message, { guildId, channelId } = {}) {
  if (!message) return null;
  const mentions = message.mentions || {};
  const content = readableDiscordText(message.content, mentions).trim();
  const titled = titledEmbed(message);
  const embedTitle = readableDiscordText(embedText(titled, 'title'), mentions).trim();
  const described = titled || describedEmbed(message);
  const embedDescription = readableDiscordText(embedText(described, 'description'), mentions).trim();
  const split = embedTitle
    ? { title: embedTitle, body: content || embedDescription }
    : titleAndBody(content || embedDescription);
  if (!split.title && !split.body) return null;
  const id = String(message.id || '');
  const guild = String(guildId || message.guildId || '');
  const channel = String(channelId || message.channelId || '');
  const createdAt = Number(message.createdTimestamp) || Date.parse(message.createdAt) || 0;
  return {
    id,
    title: split.title,
    body: split.body,
    authorName: authorName(message),
    createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    jumpUrl: guild && channel && id ? `https://discord.com/channels/${guild}/${channel}/${id}` : '',
  };
}

export function announcementsFromMessages(messages, context) {
  const list = [...(typeof messages?.values === 'function' ? messages.values() : (messages || []))];
  list.sort((a, b) => (Number(b?.createdTimestamp) || 0) - (Number(a?.createdTimestamp) || 0));
  const announcements = [];
  for (const message of list) {
    const card = announcementFromDiscordMessage(message, context);
    if (!card) continue;
    announcements.push(card);
    if (announcements.length >= BOARD_LIMIT) break;
  }
  return announcements;
}

function readError(err, channelLabel) {
  const code = Number(err?.code);
  const detail = String(err?.rawError?.message || err?.message || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  if (err?.name === 'DiscordCircuitOpenError') {
    const error = new Error(detail || 'Discord is temporarily blocking this server.');
    error.status = 503;
    return error;
  }
  if (code === 10003 || code === 50035) {
    const error = new Error(`Announcements channel not found. Check the ${channelLabel} channel ID.`);
    error.status = 404;
    return error;
  }
  if (code === 50001 || code === 50013) {
    const error = new Error('The bot cannot read that channel. Give it View Channel and Read Message History.');
    error.status = 403;
    return error;
  }
  const error = new Error(detail
    ? `Could not read the announcements channel. ${detail}`
    : 'Could not read the announcements channel.');
  error.status = 502;
  return error;
}

export async function readDiscordAnnouncements({
  discordClient,
  enqueueDiscordCall,
  channelId,
  guildId,
  tenantId,
  channelLabel = 'General announcements',
}) {
  const channel = String(channelId || '').trim();
  if (!channel) return { announcements: [], unmapped: true };
  const key = `${tenantId || guildId || 'guild'}:${channel}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.payload;
  if (!discordClient?.isReady()) {
    const error = new Error('Discord bot client is offline.');
    error.status = 503;
    throw error;
  }
  let target;
  try {
    target = await enqueueDiscordCall(() => discordClient.channels.fetch(channel));
  } catch (err) {
    throw readError(err, channelLabel);
  }
  if (!target?.messages?.fetch) {
    const error = new Error('Announcements channel not found.');
    error.status = 404;
    throw error;
  }
  let fetched;
  try {
    fetched = await enqueueDiscordCall(() => target.messages.fetch({ limit: FETCH_LIMIT }));
  } catch (err) {
    throw readError(err, channelLabel);
  }
  const payload = {
    announcements: announcementsFromMessages(fetched, { guildId, channelId: channel }),
    unmapped: false,
  };
  cache.set(key, { at: Date.now(), payload });
  return payload;
}
