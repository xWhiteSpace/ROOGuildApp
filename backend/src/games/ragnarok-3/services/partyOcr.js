/**
 * Render-safe party-screenshot OCR.
 * Detect green/AFK roster cells, OCR each name strip (PSM single-line), then
 * dictionary-match. Full-page sparse OCR is only a fallback. Worker is created
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
    .replace(/[0o]{2,}$/gi, '')
    .replace(/[0o]$/i, (m, offset, src) => (src.length > 5 ? '' : m))
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

function nameBand(box) {
  const short = box.height < 50;
  const insetX = Math.max(2, Math.round(box.width * 0.06));
  const insetTop = Math.round(box.height * (short ? 0.40 : 0.54));
  const insetBot = Math.max(1, Math.round(box.height * 0.06));
  const left = box.left + insetX;
  const top = box.top + insetTop;
  const width = Math.max(8, box.width - insetX - Math.round(box.width * 0.06));
  const height = Math.max(8, box.height - insetTop - insetBot);
  return { left, top, width, height };
}

async function cropNameStrip(rgb, box, { binary = true, threshold = 155 } = {}) {
  const band = nameBand(box);
  const extract = {
    left: Math.min(band.left, rgb.width - 8),
    top: Math.min(band.top, rgb.height - 8),
    width: Math.min(band.width, rgb.width - band.left),
    height: Math.min(band.height, rgb.height - band.top),
  };
  if (extract.width < 8 || extract.height < 8) return null;
  const targetH = 72;
  const scale = Math.max(3, Math.ceil(targetH / Math.max(1, extract.height)));
  let sum = 0;
  let n = 0;
  for (let y = extract.top; y < extract.top + extract.height; y += 1) {
    for (let x = extract.left; x < extract.left + extract.width; x += 1) {
      const i = (y * rgb.width + x) * 3;
      sum += (rgb.data[i] + rgb.data[i + 1] + rgb.data[i + 2]) / 3;
      n += 1;
    }
  }
  const mean = n ? sum / n : 255;
  let pipeline = sharp(rgb.data, { raw: { width: rgb.width, height: rgb.height, channels: 3 } })
    .extract(extract)
    .resize({ height: Math.max(targetH, extract.height * scale), withoutEnlargement: false })
    .grayscale()
    .normalize();
  if (mean < 130) {
    pipeline = pipeline.negate({ alpha: false }).linear(1.25, -8);
  } else if (binary) {
    pipeline = pipeline.linear(1.3, -10).threshold(threshold);
  } else {
    pipeline = pipeline.linear(1.25, -8);
  }
  return pipeline.png({ density: 300 }).toBuffer();
}

async function fullPageForFallback(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .grayscale()
    .normalize()
    .png()
    .toBuffer();
}

async function recognizeText(worker, image, psm) {
  await worker.setParameters({
    tessedit_pageseg_mode: psm,
    tessedit_char_whitelist: NAME_CHAR_WHITELIST,
    preserve_interword_spaces: '0',
    user_defined_dpi: '300',
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

async function readOccupiedName(worker, rgb, box) {
  const strip = await cropNameStrip(rgb, box);
  if (!strip) return '';
  let got = tokenizeOcrText(await recognizeText(worker, strip, PSM.SINGLE_LINE));
  if (!got.length) {
    const softer = await cropNameStrip(rgb, box, { binary: true, threshold: 140 });
    if (softer) got = tokenizeOcrText(await recognizeText(worker, softer, PSM.SINGLE_LINE));
  }
  if (!got.length) {
    const retry = await cropNameStrip(rgb, box, { binary: false });
    if (retry) got = tokenizeOcrText(await recognizeText(worker, retry, PSM.SINGLE_LINE));
  }
  return got[0] || '';
}

function tidyCellName(text) {
  return tidyOcrToken(String(text || '').replace(/\bAFK\b/gi, ''));
}

export async function ocrImageBuffer(buffer) {
  const rgb = await loadRgb(buffer);
  const boxes = detectSlotBoxes(rgb.data, rgb.width, rgb.height);
  const worker = await createWorker('eng', 1, {
    cachePath: TESSDATA_PATH,
    logger: () => {},
  });
  try {
    const cellRecords = [];
    const gaps = [];
    for (const box of boxes) {
      const loc = { col: box.col || null, row: box.row || null };
      if (box.empty) {
        gaps.push({ category: 'empty', text: '', ...loc });
        continue;
      }
      const token = tidyCellName(await readOccupiedName(worker, rgb, box));
      if (!looksLikePlayerName(token)) {
        gaps.push({ category: 'missing', text: token || '', ...loc });
        continue;
      }
      cellRecords.push({ text: token, ...loc });
    }
    let records = uniqueTokenRecords(cellRecords);
    const occupied = boxes.filter((box) => !box.empty).length;
    if (records.length < 16 && occupied < 18) {
      const page = await fullPageForFallback(buffer);
      const sparse = await recognizeText(worker, page, PSM.SPARSE_TEXT);
      records = uniqueTokenRecords([...records, ...tokenizeOcrText(sparse).map((text) => ({ text }))]);
    }
    return { records, cellRecords, gaps, occupied };
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

export async function ocrPartyImages(buffers, members) {
  const inputs = asOcrInputs(buffers);
  const allRecords = [];
  const allCells = [];
  const slotGaps = [];
  let occupied = 0;
  for (let i = 0; i < inputs.length; i += 1) {
    const { buffer, name } = inputs[i];
    const image = { imageSource: name, imageIndex: i };
    const result = await ocrImageBuffer(buffer);
    occupied += result.occupied || 0;
    for (const rec of result.records || []) allRecords.push({ ...rec, ...image });
    for (const rec of result.cellRecords || []) allCells.push({ ...rec, ...image });
    for (const gap of result.gaps || []) slotGaps.push({ ...gap, ...image });
  }
  const unique = uniqueTokenRecords(allRecords);
  const matchedResult = matchOcrTokensToRoster(unique, members);
  const matchedFolds = matchedResult.matched.map((hit) => foldConfusable(hit.ocrText));
  const unmatched = matchedResult.unmatched.filter((row) => keepUnmatchedName(row, matchedFolds));
  const matchedKeys = new Set(matchedResult.matched.map(slotKey));
  const placedUnmatch = new Set();
  for (const rec of allCells) {
    if (matchedKeys.has(slotKey(rec))) continue;
    slotGaps.push({
      category: 'unmatch',
      text: rec.text,
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
  };
}
