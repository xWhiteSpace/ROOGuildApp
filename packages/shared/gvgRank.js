function byDisplayName(a, b) {
  return String(a?.displayName || '').localeCompare(String(b?.displayName || ''));
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function sortRankingRows(rows, key) {
  const list = (rows || []).slice();
  list.sort((a, b) => {
    if (key === 'rate') {
      const rateA = finite(a?.rate);
      const rateB = finite(b?.rate);
      if (rateA == null && rateB == null) return byDisplayName(a, b);
      if (rateA == null) return 1;
      if (rateB == null) return -1;
      if (rateA !== rateB) return rateB - rateA;
      const warsA = Number(a?.sinceJoined) || 0;
      const warsB = Number(b?.sinceJoined) || 0;
      if (warsA !== warsB) return warsB - warsA;
      return byDisplayName(a, b);
    }
    const totalA = Number(a?.total) || 0;
    const totalB = Number(b?.total) || 0;
    if (totalA !== totalB) return totalB - totalA;
    return byDisplayName(a, b);
  });
  return list.map((row, index) => ({ ...row, rank: index + 1 }));
}
