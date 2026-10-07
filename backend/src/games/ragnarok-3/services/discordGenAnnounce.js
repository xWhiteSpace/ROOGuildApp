function webOnly() {
  throw new Error('Ragnarok 3 is web-only. Discord announces are not available.');
}

export function buildAttendanceRaidAnnounce() {
  return '';
}

export function buildPartyReadyAnnounce() {
  return '';
}

export async function sendGenRoomMessage() { webOnly(); }
export async function sendWarAnnounceMessage() { webOnly(); }

export default {
  buildAttendanceRaidAnnounce,
  buildPartyReadyAnnounce,
  sendGenRoomMessage,
  sendWarAnnounceMessage,
};
