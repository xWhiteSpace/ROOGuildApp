/**
 * Render-safe party-screenshot OCR.
 * Detect green/AFK roster cells, OCR each name strip (PSM single-line), then
 * dictionary-match. Worker is created
 * once per job and always terminated. Image buffers are never persisted.
 */
import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';
import { foldConfusable, matchOcrTokensToRoster } from '@guildname/shared/inGameAlias';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_WIDTH = 1400;
const TESSDATA_PATH = '/tmp/tessdata';
const MAX_CELLS = 48;
const NAME_CHAR_WHITELIST = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const CHROME_LINE = /^(party\s*\d+|lv\.?\s*\d+|convert to party|shout invite|leave the raid|edit team|placement confirmation|rally|team member|request|target:?.*|none|guild|afk|\+|team|heal|cheer)$/i;
const CHROME_PHRASE = /party of|convert to|shout invite|leave the raid|edit team|placement|confirmation|team member|montok:|add namin|dito para|final cheer|guild |leavetheraid|thefinalcheer|teammember/i;

let ocrChain = Promise.resolve();

export function enqueueOcrJob(fn) {
  const run = ocrChain.catch(() => {}).then(fn);
  ocrChain = run.catch(() => {});
  return run;
}

function tidyOcrToken(token) {
  return String(token || '')
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .trim();
}

function isChromeToken(token) {
  const t = String(token || '').trim();
  if (!t) return true;
  if (t.length < 3 || t.length > 24) return true;
  if (/^[\d\s./:+()x-]+$/i.test(t)) return true;
  if (CHROME_LINE.test(t)) return true;
  if (CHROME_PHRASE.test(t)) return true;
  if (/[:/\\|<>]/.test(t)) return true;
  if (/^lv\.?\s*\d+$/i.test(t)) return true;
  if (/^party\s*\d+/i.test(t)) return true;
  if (/^\d+\s*\/\s*\d+$/.test(t)) return true;
  if (/party\d|partys|teammember|leavethe|cheer|convert|shout|invite|confirm|request/i.test(t.replace(/\s/g, ''))) return true;
  const letters = t.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 3) return true;
  return false;
}

export function looksLikePlayerName(token) {
  if (isChromeToken(token)) return false;
  const t = String(token || '').trim();
  const alnum = t.replace(/[^a-zA-Z0-9]/g, '');
  if (alnum.length < 3 || alnum.length > 20) return false;
  if (/^[A-Z]{2,3}$/.test(t)) return false;
  return true;
}

export function tokenizeOcrText(text) {
  const lines = String(text || '').split(/\n+/);
  const tokens = [];
  const seen = new Set();
  for (const line of lines) {
    const cleaned = tidyOcrToken(
      String(line || '')
        .replace(/\bAFK\b/gi, ' ')
        .replace(/\bLv\.?\s*\d+\b/gi, ' '),
    );
    if (!cleaned || isChromeToken(cleaned)) continue;
    const parts = cleaned.length > 22 ? cleaned.split(/(?=[A-Z][a-z])/).filter((p) => looksLikePlayerName(p)) : [cleaned];
    for (const part of parts) {
      const token = String(part || '').trim();
      if (!looksLikePlayerName(token)) continue;
      const key = token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tokens.push(token);
    }
  }
  return tokens;
}

function isPresentGreen(r, g, b) {
  // Occupied slots are mint/yellow-green, not grass and not cyan UI chrome.
  if (g < 190 || g > 238) return false;
  if (r < 130 || r > 185) return false;
  if (b < 95 || b > 165) return false;
  if (g < r + 35) return false;
  if (g < b + 50) return false;
  return true;
}

function isAfkGray(r, g, b) {
  const avg = (r + g + b) / 3;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return avg >= 68 && avg <= 118 && spread <= 22 && Math.abs(r - g) <= 8 && Math.abs(g - b) <= 18 && b >= r;
}

function median(values) {
  const list = [...values].sort((a, b) => a - b);
  if (!list.length) return 0;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : Math.round((list[mid - 1] + list[mid]) / 2);
}

function projectionRuns(counts, from, to, minVal, minSpan) {
  const runs = [];
  let start = -1;
  for (let i = from; i <= to + 1; i += 1) {
    const on = i <= to && counts[i] >= minVal;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      if (i - start >= minSpan) runs.push({ start, end: i });
      start = -1;
    }
  }
  return runs;
}

async function loadRgb(buffer) {
  if (!buffer?.length) throw new Error('Empty image.');
  if (buffer.length > MAX_BYTES) throw new Error('Image is larger than 8MB.');
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function detectSlotBoxes(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let mint = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      if (!isPresentGreen(data[i], data[i + 1], data[i + 2])) continue;
      mint += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (mint < 8000 || maxX <= minX || maxY <= minY) return [];

  const mintW = maxX - minX + 1;
  const mintH = maxY - minY + 1;
  const mintRows = new Array(height).fill(0);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const i = (y * width + x) * 3;
      if (isPresentGreen(data[i], data[i + 1], data[i + 2])) mintRows[y] += 1;
    }
  }
  // Window must cover the Team Party grid (≈5 rows), not 40% of the screenshot.
  // A short window clips R1/R5; a tall one can pick up grass below the modal.
  const approxGridH = Math.round((mintW / 8) * 5.4);
  const bandH = mintH > Math.round(approxGridH * 1.25)
    ? Math.max(120, approxGridH)
    : mintH;
  let bestAcc = -1;
  let bestStart = minY;
  let acc = 0;
  for (let y = 0; y < height; y += 1) {
    acc += mintRows[y];
    if (y >= bandH) acc -= mintRows[y - bandH];
    if (y >= bandH - 1 && acc > bestAcc) {
      bestAcc = acc;
      bestStart = y - bandH + 1;
    }
  }
  minY = Math.max(minY, bestStart);
  maxY = Math.min(maxY, bestStart + bandH - 1);
  if (maxX <= minX || maxY <= minY) return [];

  const padX = Math.round((maxX - minX) * 0.04);
  const padY = Math.round((maxY - minY) * 0.08);
  const x0 = Math.max(0, minX - padX);
  const x1 = Math.min(width - 1, maxX + padX);
  const y0 = Math.max(0, minY - padY);
  const y1 = Math.min(height - 1, maxY + padY);

  const colCounts = new Array(width).fill(0);
  const rowCounts = new Array(height).fill(0);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * width + x) * 3;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (!isPresentGreen(r, g, b) && !isAfkGray(r, g, b)) continue;
      colCounts[x] += 1;
      rowCounts[y] += 1;
    }
  }

  const colThresh = Math.max(6, Math.round((y1 - y0) * 0.08));
  const rowThresh = Math.max(6, Math.round((x1 - x0) * 0.08));
  let cols = projectionRuns(colCounts, x0, x1, colThresh, 24);
  let rows = projectionRuns(rowCounts, y0, y1, rowThresh, 18);
  if (rows.length > 5) {
    let bestI = 0;
    let bestSpan = Infinity;
    for (let i = 0; i + 5 <= rows.length; i += 1) {
      const span = rows[i + 4].end - rows[i].start;
      if (span < bestSpan) {
        bestSpan = span;
        bestI = i;
      }
    }
    rows = rows.slice(bestI, bestI + 5);
  }
  if (cols.length < 4 || cols.length > 8 || rows.length < 3 || rows.length > 6) return [];

  const stride = rows.length > 1
    ? median(rows.slice(1).map((row, i) => row.start - rows[i].start))
    : median(rows.map((row) => row.end - row.start));
  const expandedCols = cols.map((col, i) => {
    const cw = col.end - col.start;
    const prevEnd = i === 0 ? x0 : cols[i - 1].end;
    const leftPad = i === 0
      ? Math.round(cw * 0.42)
      : Math.max(8, Math.min(col.start - prevEnd - 2, Math.round(cw * 0.4)));
    return { start: Math.max(x0, col.start - leftPad), end: Math.min(x1, col.end + 2) };
  });
  const expandedRows = rows.map((row, i) => {
    const isLast = i === rows.length - 1;
    const nextStart = isLast ? row.start + stride : rows[i + 1].start;
    const end = Math.min(height - 1, Math.max(row.end + 8, nextStart - 2));
    return { start: row.start, end };
  });

  const boxes = [];
  for (let rowIndex = 0; rowIndex < expandedRows.length; rowIndex += 1) {
    const row = expandedRows[rowIndex];
    for (let colIndex = 0; colIndex < expandedCols.length; colIndex += 1) {
      const col = expandedCols[colIndex];
      let empty = 0;
      let seen = 0;
      for (let y = row.start; y < row.end; y += 1) {
        for (let x = col.start; x < col.end; x += 1) {
          const i = (y * width + x) * 3;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          seen += 1;
          if (r > 235 && g > 235 && b > 235) empty += 1;
        }
      }
      const vacant = !seen || empty / seen > 0.5;
      boxes.push({
        left: Math.max(0, col.start - 1),
        top: Math.max(0, row.start - 1),
        width: Math.min(width - col.start, col.end - col.start + 2),
        height: Math.min(height - row.start, row.end - row.start + 2),
        col: colIndex + 1,
        row: rowIndex + 1,
        empty: vacant,
      });
    }
  }
  boxes.sort((a, b) => a.top - b.top || a.left - b.left);
  return boxes.slice(0, MAX_CELLS);
}

async function recognizeText(worker, image, psm) {
  await worker.setParameters({
    tessedit_pageseg_mode: psm,
    tessedit_char_whitelist: NAME_CHAR_WHITELIST,
    preserve_interword_spaces: '0',
    user_defined_dpi: '300',
    tessedit_do_invert: '0',
  });
  const { data } = await worker.recognize(image);
  return String(data?.text || '').trim();
}

function uniqueTokenRecords(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list || []) {
    const text = typeof raw === 'string' ? raw : String(raw?.text || '');
    const token = tidyOcrToken(String(text || '').replace(/\bAFK\b/gi, ''));
    if (!looksLikePlayerName(token)) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (typeof raw === 'object' && raw) out.push({ ...raw, text: token });
    else out.push({ text: token });
  }
  return out;
}

function uniqueTokens(list) {
  return uniqueTokenRecords(list).map((row) => row.text);
}

function asOcrInputs(buffers) {
  return (buffers || []).map((item, i) => {
    if (Buffer.isBuffer(item)) {
      return { buffer: item, name: `screenshot-${i + 1}.png` };
    }
    if (item && Buffer.isBuffer(item.buffer)) {
      return {
        buffer: item.buffer,
        name: String(item.name || `screenshot-${i + 1}.png`),
      };
    }
    return { buffer: item, name: `screenshot-${i + 1}.png` };
  });
}

function pixelAt(data, width, x, y) {
  const i = (y * width + x) * 3;
  return [data[i], data[i + 1], data[i + 2]];
}

function isWhitePixel(r, g, b) {
  return r > 230 && g > 230 && b > 220;
}

function isWindowWhite(r, g, b) {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return min > 205 && max - min < 42;
}

function isWindowHeader(r, g, b) {
  return b > 140 && b > r + 20 && g > 80 && r < 190;
}

function closeWindowGaps(on) {
  const height = on.length;
  for (let y = 0; y < height; y += 1) {
    if (on[y]) continue;
    let above = y - 1;
    let below = y + 1;
    while (above >= 0 && !on[above] && y - above <= 10) above -= 1;
    while (below < height && !on[below] && below - y <= 10) below += 1;
    if (above >= 0 && on[above] && below < height && on[below] && below - above <= 12) on[y] = true;
  }
}

function longestRun(on) {
  let best = null;
  let start = -1;
  for (let y = 0; y <= on.length; y += 1) {
    if (y < on.length && on[y]) {
      if (start < 0) start = y;
    } else if (start >= 0) {
      const len = y - start;
      if (!best || len > best.len) best = { top: start, bot: y - 1, len };
      start = -1;
    }
  }
  return best;
}

function detectTeamWindow(data, width, height) {
  const rowCount = new Array(height).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 2) {
      const [r, g, b] = pixelAt(data, width, x, y);
      if (isWindowWhite(r, g, b)) rowCount[y] += 2;
    }
  }
  const rowOn = rowCount.map((count) => count > width * 0.12);
  closeWindowGaps(rowOn);
  const band = longestRun(rowOn);
  if (!band || band.len < height * 0.28) return null;

  let { top, bot } = band;
  const step = 2;
  const colCount = new Array(width).fill(0);
  for (let y = top; y <= bot; y += step) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixelAt(data, width, x, y);
      if (isWindowWhite(r, g, b)) colCount[x] += 1;
    }
  }
  const samples = Math.ceil((bot - top + 1) / step);
  const colThresh = Math.max(6, Math.round(samples * 0.12));
  let left = -1;
  let right = -1;
  for (let x = 0; x < width; x += 1) {
    if (colCount[x] >= colThresh) {
      left = x;
      break;
    }
  }
  for (let x = width - 1; x >= 0; x -= 1) {
    if (colCount[x] >= colThresh) {
      right = x;
      break;
    }
  }
  if (left < 0 || right - left < width * 0.4) return null;

  let y = top - 1;
  let miss = 0;
  while (y > 2 && miss < 8) {
    let hit = 0;
    let seen = 0;
    for (let x = left + 8; x < right - 8; x += 3) {
      const [r, g, b] = pixelAt(data, width, x, y);
      seen += 1;
      if (isWindowHeader(r, g, b) || isWindowWhite(r, g, b)) hit += 1;
    }
    if (seen && hit / seen > 0.3) {
      top = y;
      miss = 0;
    } else miss += 1;
    y -= 1;
  }

  const ww = right - left;
  const wh = bot - top;
  const aspect = ww / wh;
  if (ww < 80 || wh < 80 || aspect < 1.35 || aspect > 2.2) return null;
  return { left, top, right, bot };
}

function plateForSlot(slot, fraction = 0.70) {
  const insetTop = slot.top + Math.round(slot.height * fraction);
  const insetBottom = slot.top + slot.height - 1;
  const top = insetTop - 4;
  const bottom = insetBottom + 8;
  return {
    left: slot.left + 3,
    top,
    width: Math.max(8, slot.width - 6),
    height: Math.max(4, bottom - top),
  };
}

function cellIsEmpty(data, width, height, slot) {
  const y1 = slot.top + Math.round(slot.height * 0.45);
  let seen = 0;
  let white = 0;
  for (let y = slot.top + 2; y < y1; y += 2) {
    for (let x = slot.left + 6; x < slot.left + slot.width - 4; x += 3) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      seen += 1;
      const [r, g, b] = pixelAt(data, width, x, y);
      if (isWhitePixel(r, g, b)) white += 1;
    }
  }
  return seen > 0 && white / seen > 0.75;
}

function layoutFromWindow(data, width, height, win) {
  const ww = win.right - win.left;
  const wh = win.bot - win.top;
  const grid = {
    left: Math.round(win.left + ww * 0.012),
    right: Math.round(win.left + ww * 0.975),
    top: Math.round(win.top + wh * 0.244),
    bottom: Math.round(win.top + wh * 0.774),
  };
  const cellW = (grid.right - grid.left) / 8;
  const cellH = (grid.bottom - grid.top) / 5;
  const cells = [];
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const left = Math.round(grid.left + col * cellW);
      const top = Math.round(grid.top + row * cellH);
      const right = Math.round(grid.left + (col + 1) * cellW) - 2;
      const bottom = Math.round(grid.top + (row + 1) * cellH) - 2;
      const slot = {
        left,
        top,
        width: Math.max(8, right - left),
        height: Math.max(8, bottom - top),
      };
      const empty = cellIsEmpty(data, width, height, slot);
      cells.push({
        col: col + 1,
        row: row + 1,
        empty,
        text: '',
        slot,
        plate: empty ? null : plateForSlot(slot),
      });
    }
  }
  return {
    width,
    height,
    window: {
      left: win.left,
      top: win.top,
      width: win.right - win.left,
      height: win.bot - win.top,
    },
    cells,
  };
}

function layoutFromLegacyBoxes(boxes, width, height) {
  return {
    width,
    height,
    window: null,
    cells: boxes.map((box) => {
      const slot = { left: box.left, top: box.top, width: box.width, height: box.height };
      const empty = Boolean(box.empty);
      return {
        col: box.col,
        row: box.row,
        empty,
        text: '',
        slot,
        plate: empty ? null : plateForSlot(slot),
      };
    }),
  };
}

export function layoutTeamSlots(data, width, height) {
  const win = detectTeamWindow(data, width, height);
  if (win) return layoutFromWindow(data, width, height, win);
  return layoutFromLegacyBoxes(detectSlotBoxes(data, width, height), width, height);
}

function nameBand(height) {
  const y0 = Math.floor(height * 0.25);
  const y1 = Math.max(y0 + 1, Math.ceil(height * 0.75));
  return { y0, y1 };
}

function barLevel(gray, width, height) {
  const { y0, y1 } = nameBand(height);
  const hist = new Uint32Array(32);
  for (let y = y0; y < y1; y += 1) {
    for (let x = 0; x < width; x += 1) {
      hist[Math.min(31, gray[y * width + x] >> 3)] += 1;
    }
  }
  let mode = 0;
  for (let i = 1; i < hist.length; i += 1) {
    if (hist[i] > hist[mode]) mode = i;
  }
  return mode * 8 + 4;
}

function lettersAreLight(gray, width, height) {
  const bar = barLevel(gray, width, height);
  const { y0, y1 } = nameBand(height);
  let lighter = 0;
  let darker = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = gray[y * width + x];
      if (bar < 180 && value >= 200) continue;
      if (value > bar + 24) lighter += 1;
      else if (value < bar - 24) darker += 1;
    }
  }
  return lighter > darker;
}

function letterRows(gray, width, height, preferLower) {
  const bar = barLevel(gray, width, height);
  const cut = Math.round(bar * 0.65);
  const minInk = Math.max(3, Math.round(width * 0.04));
  const counts = [];
  for (let y = 0; y < height; y += 1) {
    let n = 0;
    for (let x = 2; x < width - 2; x += 1) {
      if (gray[y * width + x] < cut) n += 1;
    }
    counts.push(n);
  }
  const runs = [];
  let start = -1;
  for (let y = 0; y <= height; y += 1) {
    const on = y < height && counts[y] >= minInk;
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      const rows = y - start;
      if (rows >= 6) {
        let ink = 0;
        for (let i = start; i < y; i += 1) ink += counts[i];
        runs.push({
          y0: Math.max(0, start - 1),
          y1: Math.min(height, y + 1),
          ink,
          rows,
        });
      }
      start = -1;
    }
  }
  if (!runs.length) return null;
  let best = runs.reduce((a, b) => (b.ink > a.ink ? b : a));
  const lower = runs[runs.length - 1];
  if (preferLower && lower !== best && best.ink / best.rows > (lower.ink / lower.rows) * 1.2) best = lower;
  if (best.y1 - best.y0 >= height - 2) return null;
  if (runs.length < 2 && best.rows >= height * 0.7) return null;
  return best;
}

function liftGrayBar(gray, width, height) {
  const bar = barLevel(gray, width, height);
  if (bar >= 200) return false;
  const bg = 236;
  const edge = 36;
  for (let i = 0; i < gray.length; i += 1) {
    const value = gray[i];
    if (value >= bar) {
      const t = (value - bar) / Math.max(1, 255 - bar);
      gray[i] = Math.round(bg + t * (255 - bg));
    } else if (value > bar - edge) {
      const t = (value - (bar - edge)) / edge;
      gray[i] = Math.round(value + (bg - bar) * t);
    }
  }
  return true;
}

async function nameLinePng(rgb, rect, preferLower, keepPlate) {
  if (!rect) return null;
  const left = Math.max(0, Math.min(rect.left, rgb.width - 8));
  const top = Math.max(0, Math.min(rect.top, rgb.height - 8));
  const extract = {
    left,
    top,
    width: Math.min(rect.width, rgb.width - left),
    height: Math.min(rect.height, rgb.height - top),
  };
  if (extract.width < 8 || extract.height < 8) return null;
  const raw = await sharp(rgb.data, { raw: { width: rgb.width, height: rgb.height, channels: 3 } })
    .extract(extract)
    .grayscale()
    .raw()
    .toBuffer();
  const gray = Buffer.from(raw);
  if (lettersAreLight(gray, extract.width, extract.height)) {
    for (let i = 0; i < gray.length; i += 1) gray[i] = 255 - gray[i];
  }
  const lifted = liftGrayBar(gray, extract.width, extract.height);
  const band = keepPlate ? null : letterRows(gray, extract.width, extract.height, preferLower);
  let source = gray;
  let width = extract.width;
  let height = extract.height;
  let heightOut = Math.max(64, height * 3);
  let pad = { top: 12, bottom: 12, left: 16, right: 16 };
  let kernel;
  if (band) {
    height = band.y1 - band.y0;
    source = Buffer.alloc(width * height);
    for (let y = 0; y < height; y += 1) {
      source.set(gray.subarray((band.y0 + y) * width, (band.y0 + y) * width + width), y * width);
    }
    heightOut = 80;
    pad = { top: 16, bottom: 16, left: 20, right: 20 };
    kernel = 'lanczos3';
  }
  let pipeline = sharp(source, { raw: { width, height, channels: 1 } });
  if (!lifted) pipeline = pipeline.normalize();
  return pipeline
    .resize({ height: heightOut, kernel: kernel || 'lanczos3' })
    .extend({ ...pad, background: { r: 255, g: 255, b: 255 } })
    .png({ density: 300 })
    .toBuffer();
}

async function readPlate(worker, rgb, rect, style) {
  const picked = style === true ? 'party' : normalizeGvgOcrStyle(style);
  const strip = await nameLinePng(rgb, rect, picked === 'party', picked === 'guild');
  if (!strip) return '';
  let got = tokenizeOcrText(await recognizeText(worker, strip, PSM.SINGLE_LINE));
  if (!got.length) {
    got = tokenizeOcrText(await recognizeText(worker, strip, PSM.RAW_LINE));
  }
  return got[0] || '';
}

function tidyCellName(text) {
  return tidyOcrToken(String(text || '').replace(/\bAFK\b/gi, ''));
}

function keepCellReading(token) {
  const text = tidyCellName(token);
  if (!text) return '';
  if (/^(away|afk|lv\d+|party\d+|emperiumhall|outercity|automatch|guildmember)$/i.test(text)) return '';
  if (CHROME_LINE.test(text) || CHROME_PHRASE.test(text)) return '';
  return text;
}

const PARTY_SLOT_X0 = 0.03275;
const PARTY_SLOT_X1 = 0.96374;
const PARTY_SLOT_Y0 = 0.22745;
const PARTY_SLOT_Y1 = 0.82745;
const PARTY_NAME_TOP = 0.784;
const PARTY_NAME_BOTTOM = 0.876;
const GUILD_SHOT_LIMIT = 24;
const RAID_SHOT_LIMIT = 8;

export function normalizeGvgOcrStyle(value) {
  const style = String(value || '').trim().toLowerCase();
  if (style === 'party' || style === 'guild') return style;
  return 'raid';
}

export function ocrShotLimit(style) {
  return normalizeGvgOcrStyle(style) === 'guild' ? GUILD_SHOT_LIMIT : RAID_SHOT_LIMIT;
}

function emptyLayout(width, height) {
  return { width, height, window: null, cells: [] };
}

function rowFractions(data, width, height, accept) {
  const counts = new Array(height).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 2) {
      const [r, g, b] = pixelAt(data, width, x, y);
      if (accept(r, g, b)) counts[y] += 2;
    }
  }
  return counts.map((count) => count / width);
}

function edgeSpan(data, width, height, y, accept) {
  const row = Math.max(0, Math.min(height - 1, y));
  let left = -1;
  let right = -1;
  for (let x = 0; x < width; x += 1) {
    const [r, g, b] = pixelAt(data, width, x, row);
    if (!accept(r, g, b)) continue;
    if (left < 0) left = x;
    right = x;
  }
  return { left, right };
}

function partyPanelPixel(r, g, b) {
  return isWindowWhite(r, g, b) || isWindowHeader(r, g, b);
}

export function detectPartyWindow(data, width, height) {
  const header = rowFractions(data, width, height, isWindowHeader);
  const white = rowFractions(data, width, height, isWindowWhite);
  let top = -1;
  for (let y = 0; y < height; y += 1) {
    if (header[y] > 0.45) {
      top = y;
      break;
    }
  }
  let bot = -1;
  for (let y = height - 1; y >= 0; y -= 1) {
    if (white[y] > 0.55) {
      bot = y;
      break;
    }
  }
  if (top < 0 || bot - top < 40) return null;
  const { left, right } = edgeSpan(data, width, height, bot - 4, partyPanelPixel);
  if (left < 0 || right - left < width * 0.4) return null;
  return { left, top, right, bot };
}

function medianChannel(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

function inkInRect(data, width, height, rect) {
  if (!rect) return 0;
  const x0 = Math.max(0, rect.left);
  const y0 = Math.max(0, rect.top);
  const x1 = Math.min(width - 1, rect.left + rect.width - 1);
  const y1 = Math.min(height - 1, rect.top + rect.height - 1);
  const samples = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) samples.push(pixelAt(data, width, x, y));
  }
  if (!samples.length) return 0;
  const bg = [0, 1, 2].map((channel) => medianChannel(samples.map((pixel) => pixel[channel])));
  let ink = 0;
  for (const [r, g, b] of samples) {
    const dark = (r + g + b) / 3 < 150;
    const colored = Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) > 120;
    if (dark || colored) ink += 1;
  }
  return ink;
}

function partyNamePlate(slot) {
  const inset = Math.max(2, Math.round(slot.width * 0.06));
  const top = slot.top + Math.round(slot.height * PARTY_NAME_TOP);
  const bottom = slot.top + Math.round(slot.height * PARTY_NAME_BOTTOM);
  return {
    left: slot.left + inset,
    top,
    width: Math.max(8, slot.width - inset * 2),
    height: Math.max(4, bottom - top),
  };
}

export function layoutPartySlots(data, width, height) {
  const win = detectPartyWindow(data, width, height);
  if (!win) return emptyLayout(width, height);
  const ww = win.right - win.left;
  const wh = win.bot - win.top;
  const x0 = win.left + ww * PARTY_SLOT_X0;
  const x1 = win.left + ww * PARTY_SLOT_X1;
  const y0 = win.top + wh * PARTY_SLOT_Y0;
  const y1 = win.top + wh * PARTY_SLOT_Y1;
  const cellW = (x1 - x0) / 5;
  const cellH = y1 - y0;
  const cells = [];
  for (let col = 0; col < 5; col += 1) {
    const slot = {
      left: Math.round(x0 + col * cellW),
      top: Math.round(y0),
      width: Math.max(8, Math.round(cellW) - 2),
      height: Math.max(8, Math.round(cellH)),
    };
    const plate = partyNamePlate(slot);
    const empty = inkInRect(data, width, height, plate) < Math.max(12, Math.round(plate.width * 0.08));
    cells.push({
      col: col + 1,
      row: 1,
      empty,
      text: '',
      slot,
      plate: empty ? null : plate,
    });
  }
  return {
    width,
    height,
    window: {
      left: win.left,
      top: win.top,
      width: ww,
      height: wh,
    },
    cells,
  };
}

function isGuildHeader(r, g, b) {
  return b > 190 && b > r + 30 && g > r + 10 && r < 190;
}

function isGuildBar(r, g, b) {
  if (isGuildHeader(r, g, b)) return true;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return min > 200 && max - min < 45;
}

function isGuildPanel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (min > 210 && max - min < 45) return true;
  return b > 175 && b > r + 25 && g + 5 > r && r < 210;
}

function isGuildSep(r, g, b) {
  const lum = (r + g + b) / 3;
  return lum < 230 && lum > 175 && b + 8 >= r;
}

function guildColumnInside(data, width, x, y0, y1) {
  if (x < 0 || x >= width) return false;
  let hit = 0;
  let seen = 0;
  for (let y = y0; y <= y1; y += 2) {
    const [r, g, b] = pixelAt(data, width, x, y);
    seen += 1;
    if (isGuildPanel(r, g, b)) hit += 1;
  }
  return seen > 0 && hit / seen > 0.85;
}

function guildRowInside(data, width, y, x0, x1) {
  if (y < 0) return false;
  let hit = 0;
  let seen = 0;
  for (let x = x0; x <= x1; x += 2) {
    const [r, g, b] = pixelAt(data, width, x, y);
    seen += 1;
    if (isGuildPanel(r, g, b) || isGuildBar(r, g, b)) hit += 1;
  }
  return seen > 0 && hit / seen > 0.7;
}

function guildHeaderSpan(data, width, y) {
  let left = -1;
  for (let x = 0; x < width; x += 1) {
    const [r, g, b] = pixelAt(data, width, x, y);
    if (!isGuildHeader(r, g, b)) continue;
    left = x;
    break;
  }
  if (left < 0) return null;
  let right = left;
  let miss = 0;
  for (let x = left; x < width; x += 1) {
    const [r, g, b] = pixelAt(data, width, x, y);
    if (isGuildBar(r, g, b)) {
      right = x;
      miss = 0;
    } else if (miss > 18) break;
    else miss += 1;
  }
  return { left, right };
}

export function detectGuildWindow(data, width, height) {
  let header = null;
  for (let y = 0; y < height; y += 1) {
    const span = guildHeaderSpan(data, width, y);
    if (!span || span.right - span.left < width * 0.45) continue;
    header = { top: y, left: span.left, right: span.right };
    break;
  }
  if (!header) return null;
  let bot = header.top;
  for (let y = header.top; y < height; y += 1) {
    let hit = 0;
    let seen = 0;
    for (let x = header.left; x <= header.right; x += 2) {
      const [r, g, b] = pixelAt(data, width, x, y);
      seen += 1;
      if (isGuildPanel(r, g, b)) hit += 1;
    }
    if (seen && hit / seen > 0.55) bot = y;
    else if (y > bot + 4) break;
  }
  if (bot - header.top < 40) return null;
  const y0 = header.top + 24;
  const y1 = Math.max(y0, bot - 16);
  let left = header.left;
  for (let x = header.left; x >= Math.max(0, header.left - 30); x -= 1) {
    if (!guildColumnInside(data, width, x, y0, y1)) break;
    left = x;
  }
  let right = header.right;
  for (let x = header.right; x <= Math.min(width - 1, header.right + 30); x += 1) {
    if (!guildColumnInside(data, width, x, y0, y1)) break;
    right = x;
  }
  let top = header.top;
  for (let y = header.top - 1; y >= Math.max(0, header.top - 6); y -= 1) {
    if (!guildRowInside(data, width, y, left, right)) break;
    top = y;
  }
  return { left, top, right, bot };
}

function portraitOnRow(win, ww, rowTop, rowHeight) {
  const side = Math.max(8, Math.round(rowHeight * 0.86));
  return {
    left: win.left + Math.round(ww * 0.025),
    top: rowTop + Math.round((rowHeight - side) / 2),
    width: side,
    height: side,
  };
}

function rowFillStatus(data, width, cell) {
  const band = cell.slot || {
    left: cell.portrait.left + cell.portrait.width,
    top: cell.portrait.top,
    width: cell.portrait.width * 4,
    height: cell.portrait.height,
  };
  const x0 = band.left + Math.round(band.width * (cell.slot ? 0.22 : 0.08));
  const x1 = band.left + Math.round(band.width * 0.92);
  const y0 = band.top + 6;
  const y1 = band.top + band.height - 6;
  const lums = [];
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 3) {
      if (x < 0 || x >= width || y < 0) continue;
      const [r, g, b] = pixelAt(data, width, x, y);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (min < 190 || max - min > 30) continue;
      lums.push((r + g + b) / 3);
    }
  }
  if (lums.length < 40) return '';
  lums.sort((a, b) => a - b);
  return lums[Math.floor(lums.length / 2)] >= 243 ? 'online' : 'offline';
}

function plateFromPortrait(ww, portrait) {
  return {
    left: portrait.left + portrait.width + Math.round(portrait.width * 0.55),
    top: portrait.top + Math.round(portrait.height * 0.28),
    width: Math.round(ww * 0.16),
    height: Math.max(8, Math.round(portrait.height * 0.42)),
  };
}

function portraitInk(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return !(min > 200 && max - min < 40);
}

function portraitOrphans(data, width, win, ww, pitch, listTop, rowCells) {
  if (!pitch) return [];
  const side = Math.max(8, Math.round(pitch * 0.82));
  const x0 = win.left + Math.round(ww * 0.03);
  const x1 = Math.min(win.right, x0 + side);
  const runs = [];
  let start = -1;
  let gap = 0;
  const y1 = win.bot - 8;
  for (let y = listTop; y <= y1; y += 1) {
    let hit = 0;
    let seen = 0;
    for (let x = x0; x <= x1; x += 2) {
      const [r, g, b] = pixelAt(data, width, x, y);
      seen += 1;
      if (portraitInk(r, g, b)) hit += 1;
    }
    const on = seen > 0 && hit / seen > 0.35;
    if (on) {
      if (start < 0) start = y;
      gap = 0;
    } else if (start >= 0 && gap < 12 && y < y1) gap += 1;
    else if (start >= 0) {
      runs.push([start, y - gap - 1]);
      start = -1;
      gap = 0;
    }
  }
  if (start >= 0) runs.push([start, y1 - gap]);
  const covered = (y) => rowCells.some((cell) => y >= cell.slot.top && y < cell.slot.top + cell.slot.height);
  return runs.flatMap(([top, bottom]) => {
    const runHeight = bottom - top + 1;
    const mid = (top + bottom) / 2;
    if (runHeight < side * 0.7 || covered(mid)) return [];
    const portrait = {
      left: win.left + Math.round(ww * 0.025),
      top: Math.max(listTop, Math.round(mid - side / 2)),
      width: side,
      height: side,
    };
    if (portrait.top + portrait.height > win.bot - 4) return [];
    return [{
      col: 1,
      empty: false,
      text: '',
      slot: null,
      plate: plateFromPortrait(ww, portrait),
      portrait,
    }];
  });
}

function guildListTop(data, width, win) {
  const ww = win.right - win.left;
  const x0 = win.left + Math.round(ww * 0.12);
  const x1 = win.left + Math.round(ww * 0.88);
  const yLimit = win.top + Math.round((win.bot - win.top) * 0.45);
  const bottoms = [];
  let start = -1;
  for (let y = win.top; y <= yLimit; y += 1) {
    let hit = 0;
    let seen = 0;
    for (let x = x0; x <= x1; x += 2) {
      const [r, g, b] = pixelAt(data, width, x, y);
      seen += 1;
      if (b > 180 && b > r + 30 && g > r && r < 200) hit += 1;
    }
    const on = seen > 0 && hit / seen > 0.55;
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      if (y - start >= 8) bottoms.push(y);
      start = -1;
    }
  }
  return bottoms.length ? bottoms[bottoms.length - 1] : win.top;
}

export function layoutGuildRows(data, width, height) {
  const win = detectGuildWindow(data, width, height);
  if (!win) return emptyLayout(width, height);
  const ww = win.right - win.left;
  const wh = win.bot - win.top;
  const x0 = win.left + Math.round(ww * 0.05);
  const x1 = win.right - Math.round(ww * 0.05);
  const flags = [];
  for (let y = win.top; y <= win.bot; y += 1) {
    let hit = 0;
    let seen = 0;
    for (let x = x0; x <= x1; x += 2) {
      const [r, g, b] = pixelAt(data, width, x, y);
      seen += 1;
      if (isGuildSep(r, g, b)) hit += 1;
    }
    flags.push(seen > 0 && hit / seen > 0.55);
  }
  const seps = [];
  let start = -1;
  for (let i = 0; i <= flags.length; i += 1) {
    const on = i < flags.length && flags[i];
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      if (i - start >= 3) seps.push([win.top + start, win.top + i - 1]);
      start = -1;
    }
  }
  const steps = [];
  for (let i = 1; i < seps.length; i += 1) steps.push(seps[i][0] - seps[i - 1][0]);
  const ordered = steps.slice().sort((a, b) => a - b);
  const pitch = ordered.length ? ordered[Math.floor(ordered.length / 2)] : 0;
  const whole = (heightPx) => pitch > 0 && heightPx >= pitch * 0.86 && heightPx <= pitch * 1.1;
  const listTop = guildListTop(data, width, win);
  const gaps = [];
  for (let i = 0; i < seps.length - 1; i += 1) {
    const top = seps[i][1] + 1;
    const bottom = seps[i + 1][0] - 1;
    const rowHeight = bottom - top + 1;
    if (top + 4 < listTop) continue;
    if (whole(rowHeight)) gaps.push({ top, bottom, height: rowHeight });
  }
  if (seps.length && whole(seps[0][0] - listTop)) {
    gaps.unshift({ top: listTop, bottom: seps[0][0] - 1, height: seps[0][0] - listTop });
  }
  const rowCells = gaps.map((gap) => {
    const slot = {
      left: win.left + Math.round(ww * 0.02),
      top: gap.top,
      width: Math.round(ww * 0.94),
      height: gap.height,
    };
    const portrait = portraitOnRow(win, ww, gap.top, gap.height);
    return {
      col: 1,
      empty: false,
      text: '',
      slot,
      plate: plateFromPortrait(ww, portrait),
      portrait,
    };
  });
  const orphans = portraitOrphans(data, width, win, ww, pitch, listTop, rowCells);
  const cells = [...rowCells, ...orphans]
    .filter((cell) => (cell.slot?.top ?? cell.portrait?.top ?? 0) + 4 >= listTop)
    .sort((a, b) => (a.portrait?.top || a.slot?.top || 0) - (b.portrait?.top || b.slot?.top || 0))
    .map((cell, index) => ({
      ...cell,
      row: index + 1,
      status: rowFillStatus(data, width, cell),
    }));
  return {
    width,
    height,
    window: { left: win.left, top: win.top, width: ww, height: wh },
    cells,
  };
}

export function layoutForStyle(data, width, height, style) {
  const picked = normalizeGvgOcrStyle(style);
  if (picked === 'party') return layoutPartySlots(data, width, height);
  if (picked === 'guild') return layoutGuildRows(data, width, height);
  return layoutTeamSlots(data, width, height);
}

export async function ocrImageBuffer(buffer, style) {
  const rgb = await loadRgb(buffer);
  const laid = layoutForStyle(rgb.data, rgb.width, rgb.height, style);
  const worker = await createWorker('eng', 1, {
    cachePath: TESSDATA_PATH,
    logger: () => {},
  }, {
    load_system_dawg: '0',
    load_freq_dawg: '0',
    load_unambig_dawg: '0',
    load_punc_dawg: '0',
    load_number_dawg: '0',
    load_bigram_dawg: '0',
  });
  try {
    const cellRecords = [];
    const gaps = [];
    for (const cell of laid.cells) {
      const loc = { col: cell.col || null, row: cell.row || null };
      if (cell.empty) {
        gaps.push({ category: 'empty', text: '', ...loc });
        continue;
      }
      const reading = keepCellReading(await readPlate(worker, rgb, cell.plate || cell.slot, style));
      cell.text = reading;
      if (!reading) {
        gaps.push({ category: 'missing', text: '', ...loc });
        continue;
      }
      cellRecords.push({ text: reading, status: cell.status || '', ...loc });
    }
    const records = uniqueTokenRecords(cellRecords);
    const occupied = laid.cells.filter((cell) => !cell.empty).length;
    return { records, cellRecords, gaps, occupied, overlay: laid };
  } finally {
    await worker.terminate().catch(() => {});
  }
}

function keepUnmatchedName(row, matchedFolds) {
  if (!looksLikePlayerName(row.text) || /\s/.test(row.text)) return false;
  const compact = String(row.text).replace(/[^a-zA-Z0-9]/g, '');
  if (compact.length < 3) return false;
  const fold = foldConfusable(row.text);
  return !matchedFolds.some((hit) => hit.includes(fold) || fold.includes(hit));
}

function slotKey(row) {
  return `${row.imageIndex ?? ''}:${row.col ?? row.ocrCol ?? ''}:${row.row ?? row.ocrRow ?? ''}`;
}

export async function ocrPartyImages(buffers, members, style) {
  const inputs = asOcrInputs(buffers);
  const picked = normalizeGvgOcrStyle(style);
  const allRecords = [];
  const allCells = [];
  const slotGaps = [];
  const overlays = [];
  let occupied = 0;
  for (let i = 0; i < inputs.length; i += 1) {
    const { buffer, name } = inputs[i];
    const image = { imageSource: name, imageIndex: i };
    const result = await ocrImageBuffer(buffer, picked);
    occupied += result.occupied || 0;
    for (const rec of result.records || []) allRecords.push({ ...rec, ...image });
    for (const rec of result.cellRecords || []) allCells.push({ ...rec, ...image });
    for (const gap of result.gaps || []) slotGaps.push({ ...gap, ...image });
    if (result.overlay) overlays.push({ ...result.overlay, imageIndex: i, imageSource: name });
  }
  const unique = uniqueTokenRecords(allRecords);
  const shortCells = allCells.filter((row) => row.text && !looksLikePlayerName(row.text));
  const matchedResult = matchOcrTokensToRoster([...unique, ...shortCells], members);
  const matchedFolds = matchedResult.matched.map((hit) => foldConfusable(hit.ocrText));
  const unmatched = matchedResult.unmatched.filter((row) => keepUnmatchedName(row, matchedFolds));
  const matchedKeys = new Set(matchedResult.matched.map(slotKey));
  const placedUnmatch = new Set();
  for (const rec of allCells) {
    if (matchedKeys.has(slotKey(rec))) continue;
    slotGaps.push({
      category: 'unmatch',
      text: rec.text,
      status: rec.status || '',
      col: rec.col ?? null,
      row: rec.row ?? null,
      imageSource: rec.imageSource || '',
      imageIndex: rec.imageIndex,
    });
    placedUnmatch.add(slotKey(rec));
  }
  for (const row of unmatched) {
    if (placedUnmatch.has(slotKey(row))) continue;
    slotGaps.push({
      category: 'unmatch',
      text: row.text,
      status: row.status || '',
      col: row.col ?? null,
      row: row.row ?? null,
      imageSource: row.imageSource || '',
      imageIndex: row.imageIndex,
    });
  }
  return {
    tokens: unique.map((row) => row.text),
    matched: matchedResult.matched,
    unmatched,
    slotGaps,
    occupied,
    overlays,
  };
}

function escapeXml(value) {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  }[ch]));
}

function labelChip(plate, text) {
  const fontSize = Math.max(10, Math.round(plate.height * 0.55)) / 2;
  const pad = 1;
  const width = Math.min(plate.width, Math.ceil(String(text).length * fontSize * 0.62) + pad * 2);
  const height = fontSize + pad * 2;
  const y = Math.max(0, plate.top - height - 1);
  return {
    fontSize,
    x: plate.left,
    y,
    width,
    height,
    textX: plate.left + pad,
    textY: y + fontSize,
  };
}

export function detectionOverlaySvg(overlay) {
  const width = Number(overlay?.width) || 1;
  const height = Number(overlay?.height) || 1;
  const parts = [];
  const win = overlay?.window;
  if (win && win.width > 0 && win.height > 0) {
    parts.push(`<rect x="${win.left}" y="${win.top}" width="${win.width}" height="${win.height}" fill="none" stroke="#aa28be" stroke-width="3"/>`);
  }
  for (const cell of overlay?.cells || []) {
    const slot = cell.slot;
    if (slot) parts.push(`<rect x="${slot.left}" y="${slot.top}" width="${slot.width}" height="${slot.height}" fill="none" stroke="#145ae0" stroke-width="2"/>`);
    if (cell.portrait) {
      const portrait = cell.portrait;
      parts.push(`<rect x="${portrait.left}" y="${portrait.top}" width="${portrait.width}" height="${portrait.height}" fill="none" stroke="#7c3aed" stroke-width="2"/>`);
    }
    if (!cell.plate) continue;
    const plate = cell.plate;
    parts.push(`<rect x="${plate.left}" y="${plate.top}" width="${plate.width}" height="${plate.height}" fill="none" stroke="#d23c14" stroke-width="2"/>`);
    if (!cell.text) continue;
    const chip = labelChip(plate, cell.text);
    parts.push(`<rect x="${chip.x}" y="${chip.y}" width="${chip.width}" height="${chip.height}" fill="#ffe14a"/>`);
    parts.push(`<text x="${chip.textX}" y="${chip.textY}" font-size="${chip.fontSize}" font-family="sans-serif" fill="#1a1a1a">${escapeXml(cell.text)}</text>`);
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`);
}

export async function annotateShotBuffer(buffer, overlay) {
  if (!buffer || !overlay?.width || !overlay?.height) return buffer;
  const base = await sharp(buffer)
    .rotate()
    .resize({ width: overlay.width, withoutEnlargement: false })
    .png()
    .toBuffer();
  return sharp(base).composite([{ input: detectionOverlaySvg(overlay), top: 0, left: 0 }]).png().toBuffer();
}
