function longestRun(counts, cut) {
  let best = null;
  let start = -1;
  let total = 0;
  let bestTotal = -1;
  for (let i = 0; i <= counts.length; i += 1) {
    const on = i < counts.length && counts[i] >= cut;
    if (on && start < 0) {
      start = i;
      total = 0;
    }
    if (on) total += counts[i];
    if (!on && start >= 0) {
      const span = i - start;
      if (!best || span > best.end - best.start || (span === best.end - best.start && total > bestTotal)) {
        best = { start, end: i };
        bestTotal = total;
      }
      start = -1;
    }
  }
  return best;
}

function projectionRuns(counts, minVal, minSpan) {
  const runs = [];
  let start = -1;
  for (let i = 0; i <= counts.length; i += 1) {
    const on = i < counts.length && counts[i] >= minVal;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      if (i - start >= minSpan) runs.push({ start, end: i });
      start = -1;
    }
  }
  return runs;
}

export function isPalePixel(r, g, b) {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return min >= 214 && max - min <= 42;
}

export function isInkPixel(r, g, b) {
  const avg = (r + g + b) / 3;
  return avg < 178 && Math.max(r, g, b) < 205;
}

export function isBluePixel(r, g, b) {
  return b >= 165 && b > r + 28 && g >= 100 && g < 215 && r < 160;
}

function pixel(data, width, x, y) {
  const i = (y * width + x) * 3;
  return [data[i], data[i + 1], data[i + 2]];
}

function extendThroughTitle(data, width, left, right, top, bodyHeight) {
  const span = right - left;
  const minBlue = Math.round(span * 0.4);
  const limit = Math.max(0, top - Math.round(bodyHeight * 0.2));
  let y = top;
  while (y > limit) {
    let blue = 0;
    const row = y - 1;
    for (let x = left; x < right; x += 1) {
      const [r, g, b] = pixel(data, width, x, row);
      if (isBluePixel(r, g, b)) blue += 1;
    }
    if (blue < minBlue) break;
    y = row;
  }
  return y;
}

export function findPalePanel(data, width, height) {
  const rowCounts = new Array(height).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(data, width, x, y);
      if (isPalePixel(r, g, b)) rowCounts[y] += 1;
    }
  }
  const peak = rowCounts.reduce((best, value) => Math.max(best, value), 0);
  const yRun = longestRun(rowCounts, Math.max(24, Math.round(peak * 0.34)));
  if (!yRun || yRun.end - yRun.start < 40) return null;
  const colCounts = new Array(width).fill(0);
  for (let y = yRun.start; y < yRun.end; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(data, width, x, y);
      if (isPalePixel(r, g, b)) colCounts[x] += 1;
    }
  }
  const xRun = longestRun(colCounts, Math.round((yRun.end - yRun.start) * 0.4));
  if (!xRun || xRun.end - xRun.start < 80) return null;
  const bodyHeight = yRun.end - yRun.start;
  const top = extendThroughTitle(data, width, xRun.start, xRun.end, yRun.start, bodyHeight);
  const sides = windowSides(data, width, xRun.start, xRun.end, top, yRun.start);
  return {
    left: sides.left,
    top,
    width: sides.right - sides.left,
    height: yRun.end - top,
    contentTop: yRun.start,
    contentLeft: xRun.start,
    contentRight: xRun.end,
  };
}

function windowSides(data, width, left, right, top, contentTop) {
  const bandBottom = Math.max(contentTop, top + 8);
  const span = bandBottom - top;
  const min = Math.max(4, Math.round(span * 0.35));
  const counts = new Array(width).fill(0);
  for (let y = top; y < bandBottom; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(data, width, x, y);
      if (isBluePixel(r, g, b) || isPalePixel(r, g, b)) counts[x] += 1;
    }
  }
  let x0 = left;
  let x1 = right;
  while (x0 > 0 && counts[x0 - 1] >= min) x0 -= 1;
  while (x1 < width && counts[x1] >= min) x1 += 1;
  return { left: x0, right: x1 };
}

function inkAt(data, width, x, y, loose) {
  const [r, g, b] = pixel(data, width, x, y);
  if (isBluePixel(r, g, b)) return 'blue';
  if (isInkPixel(r, g, b)) return 'ink';
  if (loose) {
    const avg = (r + g + b) / 3;
    if (avg < 198 && Math.max(r, g, b) < 220) return 'ink';
  }
  return '';
}

export function findListSplit(data, width, panel) {
  const y0 = (panel.contentTop ?? panel.top) + Math.round(panel.height * 0.02);
  const y1 = panel.top + panel.height - 2;
  const counts = new Array(panel.width).fill(0);
  for (let y = y0; y < y1; y += 1) {
    for (let x = 0; x < panel.width; x += 1) {
      if (inkAt(data, width, panel.left + x, y) === 'ink') counts[x] += 1;
    }
  }
  const max = counts.reduce((best, value) => Math.max(best, value), 0);
  const peaks = projectionRuns(counts, Math.max(24, max * 0.28), 6);
  const rightNumbers = peaks.filter((peak) => peak.start > panel.width * 0.3 && peak.end < panel.width * 0.64).pop();
  if (rightNumbers) return panel.left + rightNumbers.end + 22;
  return panel.left + Math.round(panel.width * 0.56);
}

function rowBands(data, width, region, loose = false) {
  const span = region.bottom - region.top;
  const ink = new Array(span).fill(0);
  const blue = new Array(span).fill(0);
  const regionWidth = region.right - region.left;
  for (let y = region.top; y < region.bottom; y += 1) {
    for (let x = region.left; x < region.right; x += 1) {
      const kind = inkAt(data, width, x, y, loose);
      if (kind === 'ink') ink[y - region.top] += 1;
      else if (kind === 'blue') blue[y - region.top] += 1;
    }
  }
  const minInk = Math.max(3, Math.round(regionWidth * 0.015));
  const minSpan = Math.max(3, Math.round(span * 0.012));
  return projectionRuns(ink, minInk, minSpan).filter((run) => {
    let bar = 0;
    for (let y = run.start; y < run.end; y += 1) bar += blue[y];
    return bar / ((run.end - run.start) * regionWidth) < 0.22;
  }).map((run) => ({
    start: region.top + run.start,
    end: region.top + run.end,
  }));
}

function clustersInRow(data, width, row, region, loose) {
  const regionWidth = region.right - region.left;
  const counts = new Array(regionWidth).fill(0);
  for (let y = row.start; y < row.end; y += 1) {
    for (let x = region.left; x < region.right; x += 1) {
      if (inkAt(data, width, x, y, loose) === 'ink') counts[x - region.left] += 1;
    }
  }
  const glyphs = projectionRuns(counts, 1, 2);
  if (!glyphs.length) return [];
  const splitGap = Math.max(8, Math.round(regionWidth * 0.012));
  const groups = [];
  let current = { start: glyphs[0].start, end: glyphs[0].end };
  for (let i = 1; i < glyphs.length; i += 1) {
    const gap = glyphs[i].start - current.end;
    if (gap >= splitGap) {
      groups.push(current);
      current = { start: glyphs[i].start, end: glyphs[i].end };
    } else {
      current.end = glyphs[i].end;
    }
  }
  groups.push(current);
  return groups.map((group) => ({
    left: region.left + group.start,
    top: Math.max(0, row.start - 1),
    width: Math.max(4, group.end - group.start),
    height: Math.max(6, row.end - row.start + 2),
  }));
}

function padBands(bands, region) {
  const room = Math.max(3, Math.round((region.bottom - region.top) * 0.012));
  return bands.map((band, index) => {
    const prevEnd = index === 0 ? region.top : bands[index - 1].end;
    const nextStart = index === bands.length - 1 ? region.bottom : bands[index + 1].start;
    const padTop = Math.min(room, Math.floor(Math.max(0, band.start - prevEnd) / 2));
    const padBottom = Math.min(room, Math.floor(Math.max(0, nextStart - band.end) / 2));
    return { start: band.start - padTop, end: band.end + padBottom };
  });
}

function bandsToRows(data, width, bands, region, loose = false) {
  return padBands(bands, region).map((band) => ({
    top: band.start,
    height: band.end - band.start,
    rect: {
      left: region.left,
      top: band.start,
      width: region.right - region.left,
      height: band.end - band.start,
    },
    clusters: clustersInRow(data, width, band, region, loose),
  })).filter((row) => row.clusters.length);
}

export function layoutStatSheet(rgb) {
  const { data, width, height } = rgb;
  const panel = findPalePanel(data, width, height);
  if (!panel) return { panel: null, listRows: [], attributeRows: [], shareCodeRect: null };
  const contentLeft = panel.contentLeft ?? panel.left;
  const contentRight = panel.contentRight ?? panel.left + panel.width;
  const content = {
    left: contentLeft,
    top: panel.top,
    width: contentRight - contentLeft,
    height: panel.height,
    contentTop: panel.contentTop,
  };
  const split = findListSplit(data, width, content);
  const contentTop = panel.contentTop ?? panel.top;
  const bodyBottom = panel.top + panel.height - 2;
  const bodyTop = contentTop + Math.round((bodyBottom - contentTop) * 0.04);
  const listRegion = {
    left: contentLeft + 4,
    right: Math.max(contentLeft + 20, split - 4),
    top: bodyTop,
    bottom: bodyBottom,
  };
  const attrRegion = {
    left: Math.min(contentRight - 20, split + 4),
    right: contentRight - 4,
    top: bodyTop,
    bottom: bodyBottom,
  };
  const shareCodeRect = {
    left: contentLeft + Math.round(content.width * 0.62),
    top: contentTop,
    width: Math.round(content.width * 0.34),
    height: Math.max(16, Math.round((bodyBottom - contentTop) * 0.14)),
  };
  return {
    panel,
    listRows: bandsToRows(data, width, rowBands(data, width, listRegion), listRegion),
    attributeRows: bandsToRows(data, width, rowBands(data, width, attrRegion, true), attrRegion, true),
    shareCodeRect,
  };
}
