function webOnly() {
  throw new Error('Ragnarok 3 is web-only. Discord cards are not available.');
}

export async function deployPublicPartyCardToWarAnnounce() { webOnly(); }

export default { deployPublicPartyCardToWarAnnounce };
