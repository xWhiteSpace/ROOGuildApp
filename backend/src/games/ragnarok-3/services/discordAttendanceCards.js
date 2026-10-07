function webOnly() {
  throw new Error('Ragnarok 3 is web-only. Discord cards are not available.');
}

export async function deployPublicAttendanceCardToWarAnnounce() { webOnly(); }
export async function sendPublicAttendanceCard() { webOnly(); }

export default { deployPublicAttendanceCardToWarAnnounce, sendPublicAttendanceCard };
