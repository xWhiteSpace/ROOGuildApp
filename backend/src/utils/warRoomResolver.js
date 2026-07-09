/**
 * Resolves Settings war room identifiers to Discord voice channel snowflakes.
 * SSOT: settings/configuration/warRooms (relational ID + envKey) → Render process.env
 */

const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,20}$/;

export function resolveWarRoomChannelId(identifier, warRooms = {}) {
  if (!identifier) return null;
  const token = String(identifier).trim();

  if (DISCORD_SNOWFLAKE_PATTERN.test(token)) {
    return token;
  }

  const catalogEntry = warRooms[token];
  if (catalogEntry?.envKey && process.env[catalogEntry.envKey]) {
    return process.env[catalogEntry.envKey];
  }

  if (process.env[token]) {
    return process.env[token];
  }

  for (const room of Object.values(warRooms)) {
    if (room?.envKey === token && process.env[room.envKey]) {
      return process.env[room.envKey];
    }
  }

  return null;
}

export function resolveWarRoomChannelIds(identifiers = [], warRooms = {}) {
  const resolved = [];
  const seen = new Set();

  for (const identifier of identifiers) {
    const channelId = resolveWarRoomChannelId(identifier, warRooms);
    if (channelId && !seen.has(channelId)) {
      seen.add(channelId);
      resolved.push(channelId);
    }
  }

  return resolved;
}

export function inferWarRoomRelationalIds(identifiers = [], warRooms = {}) {
  const relationalIds = [];
  const seen = new Set();

  for (const identifier of identifiers) {
    if (warRooms[identifier] && !seen.has(identifier)) {
      seen.add(identifier);
      relationalIds.push(identifier);
      continue;
    }

    for (const [roomId, room] of Object.entries(warRooms)) {
      if (room?.envKey === identifier && !seen.has(roomId)) {
        seen.add(roomId);
        relationalIds.push(roomId);
      }
    }
  }

  return relationalIds;
}

export async function fetchVoiceChannelPresentUids(discordClient, channelIds = []) {
  const presentUserIds = [];
  const seen = new Set();

  if (!discordClient?.isReady() || channelIds.length === 0) {
    return presentUserIds;
  }

  for (const channelId of channelIds) {
    const channel = await discordClient.channels.fetch(channelId).catch(() => null);
    if (!channel?.isVoiceBased()) continue;

    channel.members.forEach((member) => {
      const uid = member.user?.id;
      if (uid && !member.user.bot && !seen.has(uid)) {
        seen.add(uid);
        presentUserIds.push(uid);
      }
    });
  }

  return presentUserIds;
}
