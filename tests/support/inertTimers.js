/** Capture setInterval/setTimeout without running Discord/voice work on real clocks. */
export function installInertTimers() {
  const realSetInterval = global.setInterval;
  const realSetTimeout = global.setTimeout;
  const realClearInterval = global.clearInterval;
  const realClearTimeout = global.clearTimeout;
  const intervals = [];
  const timeouts = [];

  global.setInterval = (cb, ms, ...args) => {
    const id = realSetInterval(() => {}, 1e9);
    intervals.push({ id, cb, ms, args });
    return id;
  };
  global.setTimeout = (cb, ms, ...args) => {
    const id = realSetTimeout(() => {}, 1e9);
    timeouts.push({ id, cb, ms, args });
    return id;
  };

  function restore() {
    for (const t of intervals) realClearInterval(t.id);
    for (const t of timeouts) realClearTimeout(t.id);
    if (global.liveRaidIntervalTicker) {
      realClearInterval(global.liveRaidIntervalTicker);
      global.liveRaidIntervalTicker = undefined;
    }
    if (global.monitoringSchedulerTicker) {
      realClearInterval(global.monitoringSchedulerTicker);
      global.monitoringSchedulerTicker = undefined;
    }
    global.setInterval = realSetInterval;
    global.setTimeout = realSetTimeout;
    global.clearInterval = realClearInterval;
    global.clearTimeout = realClearTimeout;
  }

  return { intervals, timeouts, restore, realSetInterval, realSetTimeout };
}
