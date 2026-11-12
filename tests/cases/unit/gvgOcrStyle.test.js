import { describe, expect, it } from 'vitest';
import {
  layoutForStyle,
  layoutGuildRows,
  layoutPartySlots,
  layoutTeamSlots,
  normalizeGvgOcrStyle,
  ocrShotLimit,
} from '../../../backend/src/games/ragnarok-origin/services/partyOcr.js';
import { promptSentence } from '../../../backend/src/games/ragnarok-origin/services/partyOcrPrompt.js';
import { buildDraftReview, linkOcrReading } from '../../../backend/src/games/ragnarok-origin/services/discordPartyOcr.js';

function canvas(width, height, paint) {
  const data = Buffer.alloc(width * height * 3, 0);
  const set = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 3;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  };
  const fill = (x0, y0, x1, y1, r, g, b) => {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) set(x, y, r, g, b);
    }
  };
  paint({ fill, set });
  return data;
}

function partyFrame(scale) {
  const width = 400 * scale;
  const height = 260 * scale;
  const left = 20 * scale;
  const right = 380 * scale;
  const top = 16 * scale;
  const bot = 230 * scale;
  const data = canvas(width, height, ({ fill }) => {
    fill(0, 0, width, height, 30, 40, 50);
    fill(left, top, right, top + 14 * scale, 80, 120, 210);
    fill(left, top + 14 * scale, right, bot, 240, 242, 244);
  });
  return { data, width, height };
}

function paintNameAndLevel(frame, cells) {
  const { data, width } = frame;
  cells.forEach((cell, index) => {
    const plate = cell.plate || nameBand(cell.slot);
    if (index === 2) return;
    const y0 = plate.top;
    const y1 = Math.min(plate.top + plate.height, plate.top + 4);
    for (let y = y0; y < y1; y += 1) {
      for (let x = plate.left + 2; x < plate.left + plate.width - 2; x += 1) {
        const i = (y * width + x) * 3;
        data[i] = 20;
        data[i + 1] = 20;
        data[i + 2] = 30;
      }
    }
    const levelY = plate.top + plate.height + 6;
    for (let x = plate.left; x < plate.left + plate.width; x += 1) {
      const i = (levelY * width + x) * 3;
      if (i < 0 || i + 2 >= data.length) continue;
      data[i] = 20;
      data[i + 1] = 20;
      data[i + 2] = 30;
    }
  });
}

function nameBand(slot) {
  const inset = Math.max(2, Math.round(slot.width * 0.06));
  const top = slot.top + Math.round(slot.height * 0.784);
  const bottom = slot.top + Math.round(slot.height * 0.876);
  return {
    left: slot.left + inset,
    top,
    width: Math.max(8, slot.width - inset * 2),
    height: Math.max(4, bottom - top),
  };
}

function guildFrame() {
  const width = 400;
  const height = 320;
  const left = 20;
  const right = 340;
  const top = 16;
  const bot = 340;
  const seps = [48, 72, 112, 152, 192, 232];
  const rows = [78, 118, 158, 198];
  const data = canvas(width, height, ({ fill }) => {
    fill(0, 0, width, height, 20, 30, 40);
    fill(left, top, right, bot, 235, 240, 242);
    fill(left, top, right, top + 18, 80, 140, 210);
    seps.forEach((y) => fill(left + 8, y, right - 8, y + 3, 190, 200, 220));
    rows.forEach((y, index) => {
      const color = [
        [210, 40, 40],
        [40, 80, 200],
        [40, 160, 50],
        [200, 140, 30],
      ][index];
      fill(36, y, 70, y + 24, color[0], color[1], color[2]);
    });
    fill(36, 54, 70, 66, 180, 40, 160);
    fill(36, 268, 78, 316, 180, 40, 90);
  });
  return { data, width, height, fragmentY: 54 };
}

describe('GvG OCR styles', () => {
  it('keeps a missing style on the raid layout', () => {
    expect(normalizeGvgOcrStyle()).toBe('raid');
    expect(normalizeGvgOcrStyle('nope')).toBe('raid');
    expect(ocrShotLimit()).toBe(8);
    expect(ocrShotLimit('party')).toBe(8);
    expect(ocrShotLimit('guild')).toBe(24);
    const width = 40;
    const height = 30;
    const data = Buffer.alloc(width * height * 3, 255);
    expect(layoutForStyle(data, width, height)).toEqual(layoutTeamSlots(data, width, height));
    expect(layoutForStyle(data, width, height, 'raid').cells).toEqual(layoutTeamSlots(data, width, height).cells);
  });

  it('places five party slots from the window at two sizes and keeps the name band off the level line', () => {
    const fractions = [];
    for (const scale of [1, 2]) {
      const frame = partyFrame(scale);
      const first = layoutPartySlots(frame.data, frame.width, frame.height);
      expect(first.cells).toHaveLength(5);
      expect(layoutTeamSlots(frame.data, frame.width, frame.height).cells.length).toBeGreaterThan(5);
      paintNameAndLevel(frame, first.cells);
      const laid = layoutPartySlots(frame.data, frame.width, frame.height);
      expect(laid.cells.map((cell) => cell.col)).toEqual([1, 2, 3, 4, 5]);
      expect(laid.cells.every((cell) => cell.row === 1)).toBe(true);
      laid.cells.forEach((cell, index) => {
        const ratio = (cell.plate ? cell.plate.top - cell.slot.top : nameBand(cell.slot).top - cell.slot.top) / cell.slot.height;
        const end = cell.plate
          ? (cell.plate.top + cell.plate.height - cell.slot.top) / cell.slot.height
          : (nameBand(cell.slot).top + nameBand(cell.slot).height - cell.slot.top) / cell.slot.height;
        expect(ratio).toBeGreaterThan(0.78);
        expect(end).toBeLessThan(0.88);
        expect(cell.empty).toBe(index === 2);
        if (cell.plate) {
          const levelY = cell.plate.top + cell.plate.height + 6;
          expect(cell.plate.top + cell.plate.height).toBeLessThanOrEqual(levelY);
        }
      });
      const sample = laid.cells[0];
      fractions.push((sample.plate.top - sample.slot.top) / sample.slot.height);
    }
    expect(fractions[0]).toBeCloseTo(fractions[1], 2);
  });

  it('keeps a red name in column 2 instead of calling the card empty', () => {
    const frame = partyFrame(2);
    const preview = layoutPartySlots(frame.data, frame.width, frame.height);
    const plate = nameBand(preview.cells[1].slot);
    for (let y = plate.top + 4; y < plate.top + 16; y += 1) {
      for (let x = plate.left + 8; x < plate.left + plate.width - 8; x += 1) {
        const i = (y * frame.width + x) * 3;
        frame.data[i] = 220;
        frame.data[i + 1] = 130;
        frame.data[i + 2] = 160;
      }
    }
    const laid = layoutPartySlots(frame.data, frame.width, frame.height);
    expect(laid.cells.map((cell) => cell.empty)).toEqual([true, false, true, true, true]);
  });

  it('reads four whole guild rows from the window and keeps the name bar left-aligned', () => {
    const frame = guildFrame();
    const laid = layoutGuildRows(frame.data, frame.width, frame.height);
    expect(laid.window).toBeTruthy();
    expect(laid.window.width).toBeGreaterThan(frame.width * 0.5);
    const rows = laid.cells.filter((cell) => cell.slot);
    const loose = laid.cells.filter((cell) => !cell.slot);
    expect(rows).toHaveLength(4);
    expect(loose).toHaveLength(1);
    expect(loose[0].portrait.height).toBeGreaterThan(20);
    expect(loose[0].plate.left).toBeGreaterThan(loose[0].portrait.left + loose[0].portrait.width);
    const nameLeft = rows[0].plate.left;
    rows.forEach((cell, index) => {
      expect(cell.row).toBe(index + 1);
      expect(cell.empty).toBe(false);
      expect(cell.slot.top).toBeGreaterThan(frame.fragmentY);
      expect(cell.plate.left).toBe(nameLeft);
      const topRatio = (cell.plate.top - cell.slot.top) / cell.slot.height;
      const heightRatio = cell.plate.height / cell.slot.height;
      expect(topRatio).toBeGreaterThan(0.28);
      expect(topRatio).toBeLessThan(0.40);
      expect(heightRatio).toBeGreaterThan(0.30);
      expect(heightRatio).toBeLessThan(0.42);
      expect(cell.plate.left + cell.plate.width).toBeLessThan(cell.slot.left + cell.slot.width);
      expect(cell.portrait.width).toBe(cell.portrait.height);
      expect(cell.portrait.left).toBe(laid.cells[0].portrait.left);
      expect(cell.portrait.left).toBeGreaterThanOrEqual(cell.slot.left);
      expect(cell.portrait.top).toBeGreaterThanOrEqual(cell.slot.top);
      expect(cell.portrait.top + cell.portrait.height).toBeLessThanOrEqual(cell.slot.top + cell.slot.height);
    });
    const online = rows[0];
    const offline = rows[1];
    const paintFill = (slot, r, g, b) => {
      const x0 = slot.left + Math.round(slot.width * 0.22);
      const x1 = slot.left + Math.round(slot.width * 0.92);
      for (let y = slot.top + 6; y < slot.top + slot.height - 6; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const i = (y * frame.width + x) * 3;
          frame.data[i] = r;
          frame.data[i + 1] = g;
          frame.data[i + 2] = b;
        }
      }
    };
    paintFill(online.slot, 250, 250, 250);
    paintFill(offline.slot, 230, 232, 234);
    const marked = layoutGuildRows(frame.data, frame.width, frame.height);
    expect(marked.cells.find((cell) => cell.row === online.row).status).toBe('online');
    expect(marked.cells.find((cell) => cell.row === offline.row).status).toBe('offline');
    expect(promptSentence('2026-10-29')).toContain('Team Party screenshots');
    expect(promptSentence('2026-10-29', 'party')).toContain('Party screenshots (5 members each)');
    expect(promptSentence('2026-10-29', 'guild')).toContain('Guild list screenshots');
  });

  it('tallies a guild review as absent and everyone else as present', () => {
    const members = {
      a: { isRaidRoster: true },
      b: { isRaidRoster: true },
      c: { isRaidRoster: true },
    };
    const review = buildDraftReview({
      members,
      event: { key: '2026-10-29_war' },
      ocrResult: {
        matched: [
          { uid: 'a', ocrText: 'Off', score: 1, status: 'offline' },
          { uid: 'b', ocrText: 'On', score: 1, status: 'online' },
        ],
      },
      createdBy: 'u',
      createdByName: 'u',
      source: { ocrStyle: 'guild' },
    });
    expect(review.absent).toEqual(['a']);
    expect(Object.keys(review.present).sort()).toEqual(['b', 'c']);
    const raid = buildDraftReview({
      members,
      event: { key: '2026-10-29_war' },
      ocrResult: { matched: [{ uid: 'a', ocrText: 'On', score: 1 }] },
      createdBy: 'u',
      createdByName: 'u',
      source: { ocrStyle: 'raid' },
    });
    expect(Object.keys(raid.present)).toEqual(['a']);
    expect(raid.absent).toEqual(['b', 'c']);
    const fromPixels = buildDraftReview({
      members,
      event: { key: '2026-10-29_war' },
      ocrResult: {
        matched: [
          { uid: 'a', ocrText: 'Dark', score: 1, col: 1, row: 1, imageIndex: 0 },
          { uid: 'b', ocrText: 'Pale', score: 1, col: 1, row: 2, imageIndex: 0 },
        ],
        overlays: [{
          imageIndex: 0,
          cells: [
            { col: 1, row: 1, status: 'offline' },
            { col: 1, row: 2, status: 'online' },
          ],
        }],
      },
      createdBy: 'u',
      createdByName: 'u',
      source: { ocrStyle: 'guild' },
    });
    expect(fromPixels.absent).toEqual(['a']);
    expect(fromPixels.present.b.ocrText).toBe('Pale');
    expect(fromPixels.present.c).toBeTruthy();
  });

  it('links a guild reading by the row color', () => {
    const review = buildDraftReview({
      members: {
        a: { isRaidRoster: true },
        b: { isRaidRoster: true },
      },
      event: { key: '2026-10-29_war' },
      ocrResult: {
        slotGaps: [
          { text: 'Dark', category: 'unmatch', col: 1, row: 1, status: 'offline' },
          { text: 'Pale', category: 'unmatch', col: 1, row: 2, status: 'online' },
        ],
      },
      createdBy: 'u',
      createdByName: 'u',
      source: { ocrStyle: 'guild' },
    });
    const dark = review.unmatched.find((gap) => gap.text === 'Dark');
    const pale = review.unmatched.find((gap) => gap.text === 'Pale');
    expect(review.present.a).toBeTruthy();
    linkOcrReading(review, { unmatchedId: dark.id, toUid: 'a', text: 'Dark', remember: false });
    expect(review.present.a).toBeUndefined();
    expect(review.absent).toContain('a');
    expect(review.ocrMatches.a.status).toBe('offline');
    linkOcrReading(review, { unmatchedId: pale.id, toUid: 'b', text: 'Pale', remember: false });
    expect(review.present.b.ocrText).toBe('Pale');
    expect(review.absent).not.toContain('b');
  });

  it('does not put a guild name box on the search field above the column header', () => {
    const width = 400;
    const height = 360;
    const left = 20;
    const right = 340;
    const data = canvas(width, height, ({ fill }) => {
      fill(0, 0, width, height, 20, 30, 40);
      fill(left, 16, right, 330, 235, 240, 242);
      fill(left, 16, right, 34, 80, 140, 210);
      fill(36, 42, 70, 66, 40, 80, 200);
      fill(left, 70, right, 92, 90, 150, 220);
      [96, 140, 184, 228].forEach((y) => fill(left + 8, y, right - 8, y + 3, 190, 200, 220));
      [104, 148, 192].forEach((y, index) => {
        const color = [[210, 40, 40], [40, 80, 200], [40, 160, 50]][index];
        fill(36, y, 70, y + 24, color[0], color[1], color[2]);
      });
    });
    const laid = layoutGuildRows(data, width, height);
    const headerBottom = 92;
    expect(laid.cells.length).toBeGreaterThan(0);
    laid.cells.forEach((cell) => {
      const top = cell.slot?.top ?? cell.portrait?.top ?? cell.plate?.top ?? 0;
      expect(top).toBeGreaterThanOrEqual(headerBottom);
    });
  });
});
