/** Static Discord card sentences. Blank officer text falls back to these. */

export const CARD_COPY_MAX = 2000;

export const DEFAULT_DISCORD_CARD_COPY = {
  request:
    'Request loot items during **Bid Open**, Claim or Take Extra Slots during **Live Auction**.\n\n' +
    '**Open Request** — Apply for Requests, Cancel Bid Requests\n' +
    '**Open Live Auction** — See your placed coordinates and the book length.\n' +
    '**Get Extra Slots** — Claim leftover empty slots. Use the dropdown to pick an item.',
  gvg:
    'Please confirm your availability for our upcoming GVG.\n' +
    'This will help our officers to build balanced parties. Your Response is greatly appreciated.',
  party:
    'See which party you were assigned to on the active composition.\n\n' +
    'Click below to open your personal party panel.',
  ocr:
    'Officers: **Scan Party Screenshot** picks the event and drops the Team Party image here.\n' +
    'Review, O/X, and Commit swords happen on **VALHALLA** (Raid → GVG Attendance). You can also upload there.\n' +
    'Images are not saved in VALHALLA. After Commit they may be posted to the Raid Screenshot channel.',
  onboarding: {
    hub: 'Welcome, Adventurer! This card shows where guild tools live. Pick a topic for a private explanation and a jump link.',
    auction:
      'Request weekly auction items and claim vacant loot slots. Use **Open Request**, **Open Live Auction**, and **Get Extra Slots** on the Request Card.',
    gvg: 'War-announce is the GvG board: mark Available / Unavailable, change in-game name or job, and view your party.',
    general: 'Guild-wide pings live here: loot allocation, raid-ready notices, RSVP lines.',
    website: 'VALHALLA is the full dashboard (requests, raid compose, live raid, history). Sign in with Discord.',
    message: 'Guild messages live in this channel.',
  },
};

function pickSentence(raw, fallback) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  const chosen = text || fallback;
  return chosen.slice(0, CARD_COPY_MAX);
}

export function resolveDiscordCardCopy(config) {
  const saved = config?.discordCardCopy && typeof config.discordCardCopy === 'object'
    ? config.discordCardCopy
    : {};
  const topics = saved.onboarding && typeof saved.onboarding === 'object' ? saved.onboarding : {};
  const defaults = DEFAULT_DISCORD_CARD_COPY;
  return {
    request: pickSentence(saved.request, defaults.request),
    gvg: pickSentence(saved.gvg, defaults.gvg),
    party: pickSentence(saved.party, defaults.party),
    ocr: pickSentence(saved.ocr, defaults.ocr),
    onboarding: {
      hub: pickSentence(topics.hub, defaults.onboarding.hub),
      auction: pickSentence(topics.auction, defaults.onboarding.auction),
      gvg: pickSentence(topics.gvg, defaults.onboarding.gvg),
      general: pickSentence(topics.general, defaults.onboarding.general),
      website: pickSentence(topics.website, defaults.onboarding.website),
      message: pickSentence(topics.message, defaults.onboarding.message),
    },
  };
}
