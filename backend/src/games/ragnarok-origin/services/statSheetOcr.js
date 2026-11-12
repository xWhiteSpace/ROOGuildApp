import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';
import {
  SHOT_KINDS,
  attributeFromClusterTexts,
  attributeFromLine,
  mergeShotReadings,
  pairsFromClusterTexts,
  pairsFromLine,
} from '@guildname/shared/gvgStatSheet';
import { layoutStatSheet } from './statSheetLayout.js';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_WIDTH = 1400;
const TESSDATA_PATH = '/tmp/tessdata';
const TEXT_WHITELIST = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .-%';

let ocrChain = Promise.resolve();

function enqueue(fn) {
  const run = ocrChain.catch(() => {}).then(fn);
  ocrChain = run.catch(() => {});
  return run;
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

async function cropPng(rgb, rect) {
  if (!rect) return null;
  const left = Math.max(0, Math.min(rect.left, rgb.width - 4));
  const top = Math.max(0, Math.min(rect.top, rgb.height - 4));
  const width = Math.min(rect.width, rgb.width - left);
  const height = Math.min(rect.height, rgb.height - top);
  if (width < 4 || height < 4) return null;
  return sharp(rgb.data, { raw: { width: rgb.width, height: rgb.height, channels: 3 } })
    .extract({ left, top, width, height })
    .grayscale()
    .normalize()
    .resize({ height: Math.max(48, height * 3), kernel: 'lanczos3' })
    .extend({ top: 12, bottom: 12, left: 14, right: 14, background: { r: 255, g: 255, b: 255 } })
    .png({ density: 300 })
    .toBuffer();
}

async function readText(worker, rgb, rect) {
  const image = await cropPng(rgb, rect);
  if (!image) return { text: '', confidence: null };
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    tessedit_char_whitelist: TEXT_WHITELIST,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
    tessedit_do_invert: '0',
  });
  const { data } = await worker.recognize(image);
  const text = String(data?.text || '').replace(/\s+/g, ' ').trim();
  const confidence = Number(data?.confidence);
  return { text, confidence: text && Number.isFinite(confidence) ? confidence : null };
}

function sectionFor(kind) {
  return kind === 'quasi' ? 'quasi' : 'general';
}

async function readListRow(worker, rgb, row, section) {
  const texts = [];
  for (const cluster of row.clusters || []) {
    texts.push(await readText(worker, rgb, cluster));
  }
  const paired = pairsFromClusterTexts(texts, section);
  if (paired.length) return paired;
  const line = await readText(worker, rgb, row.rect);
  return pairsFromLine(line.text, section, line.confidence);
}

async function readAttributeRow(worker, rgb, row) {
  const texts = [];
  for (const cluster of row.clusters || []) {
    const read = await readText(worker, rgb, cluster);
    texts.push(read.text);
  }
  const line = await readText(worker, rgb, row.rect);
  const fromLine = attributeFromLine(line.text);
  if (fromLine.length) return fromLine;
  const joined = attributeFromLine(texts.filter(Boolean).join(' '));
  if (joined.length) return joined;
  return attributeFromClusterTexts(texts);
}

function pickShareCode(text) {
  const tokens = String(text || '').toUpperCase().match(/[A-Z0-9]{6,16}/g) || [];
  return tokens.sort((a, b) => b.length - a.length)[0] || '';
}

async function readShot(worker, buffer, kind) {
  const rgb = await loadRgb(buffer);
  const layout = layoutStatSheet(rgb);
  if (!layout.panel) {
    return { kind, readings: [], shareCode: '', warning: 'Could not find the Character panel.' };
  }
  const section = sectionFor(kind);
  const readings = [];
  for (const row of layout.listRows) {
    readings.push(...await readListRow(worker, rgb, row, section));
  }
  let shareCode = '';
  if (kind === 'general') {
    for (const row of layout.attributeRows) {
      readings.push(...await readAttributeRow(worker, rgb, row));
    }
    shareCode = pickShareCode((await readText(worker, rgb, layout.shareCodeRect)).text);
  }
  return {
    kind,
    readings,
    shareCode,
    warning: readings.length ? '' : 'No stat rows were read.',
  };
}

export async function readStatShots(files) {
  const shots = Array.isArray(files) ? files : [];
  if (!shots.length) throw new Error('Upload at least one Character screenshot.');
  for (const shot of shots) {
    if (!SHOT_KINDS.includes(shot.kind)) throw new Error('Each shot needs a section: General or Quasi.');
  }
  return enqueue(async () => {
    const worker = await createWorker('eng', 1, {
      cachePath: TESSDATA_PATH,
      logger: () => {},
    });
    try {
      const read = [];
      for (const shot of shots) {
        read.push(await readShot(worker, shot.buffer, shot.kind));
      }
      const shareCode = read.find((shot) => shot.shareCode)?.shareCode || '';
      return {
        shareCode,
        shots: read,
        readings: mergeShotReadings(read),
        warnings: read.filter((shot) => shot.warning).map((shot) => ({ kind: shot.kind, warning: shot.warning })),
      };
    } finally {
      await worker.terminate().catch(() => {});
    }
  });
}
