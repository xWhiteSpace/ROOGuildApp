import { describe, expect, it } from 'vitest';
import {
  applyStatKeywords,
  unifyReadings,
  attributeFromLine,
  buildSnapshot,
  matchStatKeyword,
  parseStatKeywordList,
  prepareReadings,
  mergeShotReadings,
  pairsFromClusterTexts,
  pairsFromLine,
  cohortStatAverage,
  columnLabels,
  gvgStatsCsv,
  peerLatest,
  progressionFor,
  statPackForRole,
} from '../../../packages/shared/gvgStatSheet.js';
import { layoutStatSheet } from '../../../backend/src/games/ragnarok-origin/services/statSheetLayout.js';

function paint(width, height, pixel) {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      const i = (y * width + x) * 3;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
  return { data, width, height };
}

function fill(data, width, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const i = (yy * width + xx) * 3;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
    }
  }
}

describe('GVG stat sheet readings', () => {
  it('keeps the raw label beside each number and does not use row index', () => {
    const readings = pairsFromClusterTexts(['Refine', 'PATK', '1673', 'Refine PDEF', '300'], 'general');
    expect(readings.map((row) => [row.label, row.column, row.value])).toEqual([
      ['Refine PATK', 'left', 1673],
      ['Refine PDEF', 'right', 300],
    ]);
    expect(readings.every((row) => row.key.includes(row.label.toLowerCase()))).toBe(true);
  });

  it('keeps the weaker recognition confidence beside the stat', () => {
    const readings = pairsFromClusterTexts([
      { text: 'HP', confidence: 96 },
      { text: '241444', confidence: 91 },
      { text: 'SP', confidence: 62 },
      { text: '1605', confidence: 88 },
    ], 'general');
    expect(readings.map((row) => [row.label, row.confidence])).toEqual([
      ['HP', 91],
      ['SP', 62],
    ]);
    expect(pairsFromLine('PATK 100', 'general', 73)[0].confidence).toBe(73);
  });

  it('keeps a right-hand pair when that cluster already contains its number', () => {
    const readings = pairsFromClusterTexts(['HP', '241444', 'SP 1605'], 'general');
    expect(readings.map((row) => [row.label, row.column, row.value])).toEqual([
      ['HP', 'left', 241444],
      ['SP', 'right', 1605],
    ]);
  });

  it('reads a full line when the clusters come back as one string', () => {
    const readings = pairsFromLine('Variable CT 0 Variable CT -58.55%', 'quasi');
    expect(readings).toHaveLength(2);
    expect(readings[0]).toMatchObject({ label: 'Variable CT', column: 'left', value: 0, unit: 'number' });
    expect(readings[1]).toMatchObject({ label: 'Variable CT', column: 'right', value: -58.55, unit: 'percent' });
    expect(readings[0].key).not.toBe(readings[1].key);
  });

  it('stores attribute stats and bonus and drops req', () => {
    const readings = attributeFromLine('STR 1 39 2');
    expect(readings.map((row) => [row.column, row.value])).toEqual([
      ['stats', 1],
      ['bonus', 39],
    ]);
    const shifted = attributeFromLine('1605 STR 1 39 2');
    expect(shifted.map((row) => row.value)).toEqual([1, 39]);
    const misread = attributeFromLine('WIT 99 156 12');
    expect(misread[0]).toMatchObject({ label: 'WIT', column: 'stats', value: 99 });
    expect(misread[1].value).toBe(156);
  });

  it('drops attribute rows before a sheet is saved', () => {
    const saved = prepareReadings([
      { label: 'HP', column: 'left', section: 'general', raw: '1000', value: 1000 },
      { label: 'AGI', column: 'stats', section: 'attributes', raw: '40', value: 40 },
      { label: 'AB', column: 'bonus', section: 'attributes', raw: '3', value: 3 },
    ]);
    expect(saved.map((row) => row.label)).toEqual(['HP']);
  });

  it('flags two different numbers for the same label instead of averaging them', () => {
    const merged = mergeShotReadings([
      { kind: 'quasi', readings: pairsFromLine('Ignore PDEF 2589', 'quasi') },
      { kind: 'quasi', readings: pairsFromLine('Ignore PDEF 100', 'quasi') },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].flag).toBe('conflict');
    expect(merged[0].value).toBe(2589);
    expect(merged[0].alts).toEqual(['2589', '100']);
  });

  it('copies job and role onto a new snapshot and refuses a member without them', () => {
    const draft = {
      id: 'draft_1',
      memberUid: 'ada',
      capturedAt: '2026-11-11',
      readings: pairsFromLine('HP 241444 SP 1605', 'general'),
    };
    expect(buildSnapshot({ draft, member: { jobCode: 'job_001' }, id: 'snap_1' }).ok).toBe(false);
    const built = buildSnapshot({
      draft,
      member: { jobCode: 'job_001', roleCode: 'role_002' },
      id: 'snap_1',
      confirmedAt: '2026-11-11T00:00:00.000Z',
    });
    expect(built.ok).toBe(true);
    expect(built.snapshot).toMatchObject({
      id: 'snap_1',
      status: 'confirmed',
      memberUid: 'ada',
      capturedAt: '2026-11-11',
      jobCode: 'job_001',
      roleCode: 'role_002',
    });
    expect(built.snapshot.period).toBeUndefined();
    const reviewed = buildSnapshot({
      draft: { ...draft, jobCode: 'job_reviewed', roleCode: 'role_reviewed' },
      member: { jobCode: 'job_001', roleCode: 'role_002' },
      id: 'snap_2',
    });
    expect(reviewed.snapshot).toMatchObject({ jobCode: 'job_reviewed', roleCode: 'role_reviewed' });
  });

  it('starts a new progression line when the role changes', () => {
    const base = { status: 'confirmed', memberUid: 'ada', jobCode: 'job_001' };
    const series = progressionFor([
      { ...base, id: 'a', capturedAt: '2026-11-01', roleCode: 'role_phy', readings: pairsFromLine('PATK 100', 'general') },
      { ...base, id: 'b', capturedAt: '2026-11-08', roleCode: 'role_phy', readings: pairsFromLine('PATK 140', 'general') },
      { ...base, id: 'c', capturedAt: '2026-11-15', roleCode: 'role_mgc', readings: pairsFromLine('MATK 90', 'general') },
    ], 'ada');
    expect(series).toHaveLength(2);
    expect(series[0].rows).toHaveLength(2);
    expect(series[0].rows[1].deltas[series[0].rows[1].readings[0].key]).toBe(40);
    expect(series[1].roleCode).toBe('role_mgc');
    expect(series[1].rows[0].deltas).toEqual({});
  });

  it('compares peers only inside the same job and role, using the latest sheet', () => {
    const rows = peerLatest([
      { status: 'confirmed', memberUid: 'ada', jobCode: 'job_summoner', roleCode: 'role_phy', capturedAt: '2026-11-01', id: 'a1' },
      { status: 'confirmed', memberUid: 'ada', jobCode: 'job_summoner', roleCode: 'role_phy', capturedAt: '2026-11-20', id: 'a2' },
      { status: 'confirmed', memberUid: 'bea', jobCode: 'job_summoner', roleCode: 'role_mgc', capturedAt: '2026-11-20', id: 'b1' },
      { status: 'confirmed', memberUid: 'cy', jobCode: 'job_sinx', roleCode: 'role_phy', capturedAt: '2026-11-20', id: 'c1' },
    ], 'job_summoner', 'role_phy');
    expect(rows.map((row) => row.id)).toEqual(['a2']);
    expect(statPackForRole('DPS-PHY')).toContain('PATK');
    expect(statPackForRole('DPS-MGC')).toContain('MATK');
    expect(statPackForRole('DPS-MGC')).not.toContain('PATK');
    const columns = columnLabels([{ label: 'MA' }, { label: 'MATK' }], 'DPS-MGC');
    expect(columns[0]).toBe('MATK');
    expect(columns).toContain('MA');
  });

  it('averages one stat for the same job and role as of that day', () => {
    const reading = (label, value) => ({
      label, column: 'left', section: 'general', value, unit: 'number', raw: String(value),
    });
    const snapshots = [
      { status: 'confirmed', memberUid: 'ada', jobCode: 'job_priest', roleCode: 'role_sup', capturedAt: '2026-11-01', id: 'a1', readings: [reading('MATK', 100)] },
      { status: 'confirmed', memberUid: 'ada', jobCode: 'job_priest', roleCode: 'role_sup', capturedAt: '2026-11-20', id: 'a2', readings: [reading('MATK', 180)] },
      { status: 'confirmed', memberUid: 'bea', jobCode: 'job_priest', roleCode: 'role_dps', capturedAt: '2026-11-10', id: 'b1', readings: [reading('MATK', 900)] },
      { status: 'confirmed', memberUid: 'cy', jobCode: 'job_priest', roleCode: 'role_sup', capturedAt: '2026-11-08', id: 'c1', readings: [reading('MATK', 40)] },
      { status: 'confirmed', memberUid: 'dee', jobCode: 'job_priest', roleCode: 'role_sup', capturedAt: '2026-11-08', id: 'd1', readings: [reading('PATK', 50)] },
      { status: 'confirmed', memberUid: 'cy', jobCode: 'job_priest', roleCode: 'role_sup', capturedAt: '2026-12-01', id: 'c2', readings: [reading('MATK', 999)] },
    ];
    expect(cohortStatAverage(snapshots, {
      jobCode: 'job_priest',
      roleCode: 'role_sup',
      day: '2026-11-15',
      section: 'general',
      column: 'left',
      label: 'MATK',
    })).toEqual({ average: 70, count: 2, unit: 'number' });
  });

  it('keeps one latest sheet per member inside the comparison range', () => {
    const reading = (label, value) => ({
      label, column: 'left', section: 'general', value, unit: 'number', raw: String(value),
    });
    const snapshots = [
      { status: 'confirmed', memberUid: 'ada', jobCode: 'job_priest', roleCode: 'role_sup', capturedAt: '2026-11-01', id: 'a1', readings: [reading('MATK', 100)] },
      { status: 'confirmed', memberUid: 'ada', jobCode: 'job_priest', roleCode: 'role_sup', capturedAt: '2026-11-20', id: 'a2', readings: [reading('MATK', 180)] },
      { status: 'confirmed', memberUid: 'cy', jobCode: 'job_priest', roleCode: 'role_sup', capturedAt: '2026-11-08', id: 'c1', readings: [reading('MATK', 40)] },
      { status: 'confirmed', memberUid: 'cy', jobCode: 'job_priest', roleCode: 'role_sup', capturedAt: '2026-12-01', id: 'c2', readings: [reading('MATK', 999)] },
    ];
    expect(cohortStatAverage(snapshots, {
      jobCode: 'job_priest',
      roleCode: 'role_sup',
      from: '2026-11-05',
      day: '2026-11-30',
      section: 'general',
      column: 'left',
      label: 'MATK',
    })).toEqual({ average: 110, count: 2, unit: 'number' });
  });
});

describe('GVG stat keywords', () => {
  const general = 'HP\nSP\nPATK\nPDEF\nMATK\nMDEF';

  it('reads one keyword per line and skips blanks', () => {
    expect(parseStatKeywordList('HP\n\nSP\nHP\nPATK')).toEqual(['HP', 'SP', 'PATK']);
  });

  it('snaps a noisy general label onto the listed name', () => {
    expect(matchStatKeyword('PDE', general)).toBe('PDEF');
    expect(matchStatKeyword('MATK', general)).toBe('MATK');
    expect(matchStatKeyword('ZZZ', general)).toBe('ZZZ');
  });

  it('matches column 1 and column 2 separately', () => {
    const readings = applyStatKeywords([
      { label: 'PAT', column: 'left', section: 'general', raw: '12555', value: 12555, unit: 'number', flag: '' },
      { label: 'PDE', column: 'right', section: 'general', raw: '6692', value: 6692, unit: 'number', flag: '' },
      { label: 'PDE', column: 'left', section: 'general', raw: '6692', value: 6692, unit: 'number', flag: '' },
      { label: 'Variable C', column: 'right', section: 'quasi', raw: '-58.55%', value: -58.55, unit: 'percent', flag: '' },
    ], {
      general: { col1: 'HP\nPATK\nMATK', col2: 'SP\nPDEF\nMDEF' },
      quasi: { col1: 'ASPD\nVariable CT', col2: 'MSPD\nVariable CT' },
    });
    expect(readings.map((row) => row.label)).toEqual(['PATK', 'PDEF', 'PDE', 'Variable CT']);
  });

  it('fills a scrolled name only when one keyword owns the visible part', () => {
    const quasiCol2 = 'MDMG Bonus\nPvE DMG Bonus\nPvP DMG Bonus\nPvE DMG Redu\nPvP DMG Redu';
    expect(matchStatKeyword('rE DMG Bonus', quasiCol2)).toBe('PvE DMG Bonus');
    expect(matchStatKeyword('rP DMG Bonus', quasiCol2)).toBe('PvP DMG Bonus');
    expect(matchStatKeyword('E DMG Bonus', quasiCol2)).toBe('PvE DMG Bonus');
    expect(matchStatKeyword('DMG Bonus', quasiCol2)).toBe('DMG Bonus');
    expect(matchStatKeyword('MA', 'HP\nPATK\nMATK')).toBe('MA');
    const rows = unifyReadings(applyStatKeywords([
      { label: 'rE DMG Bonus', column: 'right', section: 'quasi', raw: '2286', value: 2286, unit: 'number', flag: '' },
      { label: 'PvE DMG Bonus', column: 'right', section: 'quasi', raw: '2286', value: 2286, unit: 'number', flag: '' },
      { label: 'rP DMG Bonus', column: 'right', section: 'quasi', raw: '3640', value: 3640, unit: 'number', flag: '' },
      { label: 'PvP DMG Bonus', column: 'right', section: 'quasi', raw: '3600', value: 3600, unit: 'number', flag: '' },
    ], { quasi: { col2: quasiCol2 } }));
    const pve = rows.find((row) => row.label === 'PvE DMG Bonus');
    const pvp = rows.find((row) => row.label === 'PvP DMG Bonus');
    expect(rows).toHaveLength(2);
    expect(pve.value).toBe(2286);
    expect(pve.ocrLabel).toBe('rE DMG Bonus');
    expect(pve.flag).toBe('');
    expect(pvp.flag).toBe('conflict');
    expect(pvp.alts).toEqual(['3640', '3600']);
  });

  it('names the rows under the first stat in list order', () => {
    const readings = applyStatKeywords([
      { label: 'HP', column: 'left', section: 'general', raw: '241444', value: 241444, unit: 'number', flag: '' },
      { label: 'MA', column: 'left', section: 'general', raw: '6227', value: 6227, unit: 'number', flag: '' },
      { label: 'R fine PA', column: 'left', section: 'general', raw: '1673', value: 1673, unit: 'number', flag: '' },
      { label: 'SP', column: 'right', section: 'general', raw: '1605', value: 1605, unit: 'number', flag: '' },
      { label: 'of DEF', column: 'right', section: 'general', raw: '6692', value: 6692, unit: 'number', flag: '' },
      { label: 'ASPD', column: 'left', section: 'quasi', raw: '154%', value: 154, unit: 'percent', flag: '' },
      { label: 'Variable C', column: 'left', section: 'quasi', raw: '0', value: 0, unit: 'number', flag: '' },
      { label: 'Healing Done', column: 'left', section: 'quasi', raw: '76%', value: 76, unit: 'percent', flag: '' },
    ], {
      general: { col1: 'HP\nPATK\nMATK\nRefine PATK', col2: 'SP\nPDEF\nMDEF' },
      quasi: { col1: 'ASPD\nVariable CT\nFixed CT', col2: 'MSPD\nVariable CT' },
    });
    expect(readings.map((row) => row.label)).toEqual([
      'HP', 'PATK', 'MATK', 'SP', 'PDEF', 'ASPD', 'Variable CT', 'Fixed CT',
    ]);
    expect(readings[1].ocrLabel).toBe('MA');
    expect(readings[2].ocrLabel).toBe('R fine PA');
  });
});

describe('GVG stat sheet layout', () => {
  it('finds list rows and attribute rows inside the pale panel and skips a blue section bar', () => {
    const width = 220;
    const height = 180;
    const rgb = paint(width, height, () => [180, 140, 90]);
    fill(rgb.data, width, 20, 16, 180, 148, [248, 246, 240]);
    fill(rgb.data, width, 28, 40, 70, 12, [70, 140, 230]);
    for (const y of [62, 86, 110]) {
      fill(rgb.data, width, 28, y, 24, 8, [40, 50, 70]);
      fill(rgb.data, width, 68, y, 18, 8, [40, 50, 70]);
    }
    for (const y of [70, 108]) {
      fill(rgb.data, width, 132, y, 22, 8, [40, 50, 70]);
      fill(rgb.data, width, 168, y, 16, 8, [40, 50, 70]);
    }
    const layout = layoutStatSheet(rgb);
    expect(layout.panel).toBeTruthy();
    expect(layout.listRows.length).toBeGreaterThanOrEqual(2);
    expect(layout.attributeRows.length).toBeGreaterThanOrEqual(1);
    expect(layout.listRows.every((row) => row.top > 50)).toBe(true);
    expect(layout.listRows.every((row) => row.height > 8)).toBe(true);
  });

  it('finds the Character window when it is a small part of the screenshot', () => {
    const width = 900;
    const height = 520;
    const rgb = paint(width, height, () => [90, 120, 70]);
    fill(rgb.data, width, 500, 70, 120, 22, [90, 160, 230]);
    fill(rgb.data, width, 500, 92, 120, 180, [248, 246, 240]);
    for (const y of [120, 150, 180]) {
      fill(rgb.data, width, 512, y, 20, 8, [40, 50, 70]);
      fill(rgb.data, width, 560, y, 18, 8, [40, 50, 70]);
    }
    const layout = layoutStatSheet(rgb);
    expect(layout.panel.top).toBeLessThanOrEqual(70);
    expect(layout.panel.contentTop).toBeGreaterThanOrEqual(90);
    expect(layout.listRows).toHaveLength(3);
    expect(layout.listRows.every((row) => row.top >= layout.panel.contentTop)).toBe(true);
  });

  it('keeps short stat rows inside a small Character window', () => {
    const width = 240;
    const height = 180;
    const rgb = paint(width, height, () => [90, 120, 70]);
    fill(rgb.data, width, 30, 30, 160, 120, [248, 246, 240]);
    for (const y of [50, 70, 90]) {
      fill(rgb.data, width, 40, y, 18, 4, [40, 50, 70]);
      fill(rgb.data, width, 90, y, 16, 4, [40, 50, 70]);
    }
    const layout = layoutStatSheet(rgb);
    expect(layout.listRows).toHaveLength(3);
  });
});

describe('GVG stats CSV', () => {
  const lists = {
    generalLeft: 'HP\nPATK',
    generalRight: 'SP',
    quasiLeft: 'Variable CT',
    quasiRight: 'Variable CT',
  };

  it('keeps both Variable CT columns, leaves a missing stat blank, and ignores names that are not in the settings lists', () => {
    const { headers, rows } = gvgStatsCsv([
      {
        status: 'confirmed',
        id: 'later',
        memberUid: 'ada',
        capturedAt: '2026-11-01',
        confirmedAt: '2026-11-01T02:00:00.000Z',
        jobCode: 'job_001',
        roleCode: 'role_002',
        readings: [
          { section: 'general', column: 'left', label: 'HP', value: 1100, unit: 'number' },
        ],
      },
      {
        status: 'draft',
        id: 'draft',
        memberUid: 'ada',
        capturedAt: '2026-11-01',
        readings: [
          { section: 'general', column: 'left', label: 'HP', value: 1, unit: 'number' },
        ],
      },
      {
        status: 'confirmed',
        id: 'first',
        memberUid: 'ada',
        capturedAt: '2026-11-01',
        confirmedAt: '2026-11-01T01:00:00.000Z',
        jobCode: 'job_001',
        roleCode: 'role_002',
        shareCode: 'AB12',
        readings: [
          { section: 'quasi', column: 'left', label: 'Variable CT', value: 10, unit: 'percent' },
          { section: 'quasi', column: 'right', label: 'Variable CT', value: 20, unit: 'percent' },
          { section: 'general', column: 'left', label: 'HP', value: 1000, unit: 'number' },
          { section: 'general', column: 'left', label: 'Junk Stat', value: 7, unit: 'number' },
          { section: 'attributes', column: 'bonus', label: 'STR', value: 12, unit: 'number' },
        ],
      },
    ], {
      members: { ada: { displayName: 'Ada' } },
      jobs: { job_001: { name: 'Priest' } },
      roles: { role_002: { name: 'Support' } },
      lists,
    });

    expect(headers).toEqual([
      'Name',
      'Discord id',
      'Taken on',
      'Confirmed at',
      'Job',
      'Role',
      'HP',
      'PATK',
      'SP',
      'Variable CT left',
      'Variable CT right',
    ]);
    expect(rows).toEqual([
      ['Ada', 'ada', '2026-11-01', '2026-11-01T01:00:00.000Z', 'Priest', 'Support', '1000', '', '', '10%', '20%'],
      ['Ada', 'ada', '2026-11-01', '2026-11-01T02:00:00.000Z', 'Priest', 'Support', '1100', '', '', '', ''],
    ]);
  });
});
