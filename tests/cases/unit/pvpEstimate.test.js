import { describe, expect, it } from 'vitest';
import { estimatePvp, latestConfirmedSheet, sheetSideValues } from '../../../packages/shared/pvpEstimate.js';

const reportDefault = {
  pvpScene: true,
  size: 'medium',
  skillMultiplier: 2,
  weaponAtk: 0,
  patk: 9477,
  matk: 4838,
  refinePatk: 1408,
  refineMatk: 897,
  ignorePdef: 559,
  ignoreMdef: 202,
  pdmg: 72.69,
  mdmg: 52.69,
  pvpDmg: 2502,
  basePdef: 140,
  baseMdef: 207,
  equipmentPdef: 6352,
  equipmentMdef: 1801,
  equipmentPdefPercent: 33,
  equipmentMdefPercent: 16,
  pdmgReduction: 176.8,
  mdmgReduction: 103.29,
  pvpReduction: 2761,
  dmgSmall: 7.62,
  reductionSmall: 12.2,
  dmgMedium: 3.82,
  reductionMedium: 34.6,
  dmgLarge: 7.02,
  reductionLarge: 9.8,
  dmgDemi: 2.6,
  reductionDemi: 23.6,
  attackElement: 'Fire',
  defendElement: 'Fire',
  elementDmg: 0,
  elementReduction: 2,
};

const cleaner = {
  pvpScene: true,
  size: 'medium',
  skillMultiplier: 1,
  weaponAtk: 0,
  patk: 5000,
  matk: 3000,
  refinePatk: 0,
  refineMatk: 0,
  ignorePdef: 0,
  ignoreMdef: 0,
  pdmg: 50,
  mdmg: 50,
  pvpDmg: 0,
  basePdef: 100,
  baseMdef: 100,
  equipmentPdef: 2000,
  equipmentMdef: 1000,
  equipmentPdefPercent: 20,
  equipmentMdefPercent: 20,
  pdmgReduction: 20,
  mdmgReduction: 20,
  pvpReduction: 0,
  dmgSmall: 0,
  reductionSmall: 0,
  dmgMedium: 0,
  reductionMedium: 0,
  dmgLarge: 0,
  reductionLarge: 0,
  dmgDemi: 0,
  reductionDemi: 0,
  attackElement: 'Fire',
  defendElement: 'Water',
  elementDmg: 0,
  elementReduction: 0,
};

describe('PvP damage estimate', () => {
  it('matches the report default setup', () => {
    const result = estimatePvp(reportDefault);
    expect(result.physical).toBe(112);
    expect(result.magic).toBe(100);
    expect(result.pdefTaken).toBe(35.97);
    expect(result.mdefTaken).toBe(47.24);
    expect(result.size).toBe(69.22);
    expect(result.element).toBe(23);
    expect(result.resistPhysical).toBe(10);
  });

  it('matches the report when the PvP scene is off', () => {
    const result = estimatePvp({ ...reportDefault, pvpScene: false });
    expect(result.physical).toBe(190);
    expect(result.magic).toBe(341);
    expect(result.pvpPhysical).toBe(100);
    expect(result.pvpMagic).toBe(100);
  });

  it('matches the cleaner matchup', () => {
    const result = estimatePvp(cleaner);
    expect(result.physical).toBe(5884);
    expect(result.magic).toBe(943);
    expect(result.element).toBe(175);
    expect(result.resistPhysical).toBe(130);
    expect(result.pvpPhysical).toBe(60);
    expect(result.pvpMagic).toBe(30);
  });

  it('stays defined for an empty sheet and does not use the example numbers', () => {
    const result = estimatePvp({
      pvpScene: true,
      size: 'medium',
      skillMultiplier: 1,
      attackElement: 'Neutral',
      defendElement: 'Neutral',
    });
    expect(result.physical).toBe(75);
    expect(result.magic).toBe(18);
    expect(result.physical).not.toBe(112);
    expect(result.magic).not.toBe(100);
  });

  it('does not treat a special percent as flat equipment defense', () => {
    const result = estimatePvp({
      patk: 1000,
      equipmentPdefPercent: 44.79,
      skillMultiplier: 1,
      pvpScene: true,
      size: 'medium',
      attackElement: 'Neutral',
      defendElement: 'Neutral',
    });
    expect(result.pdefTaken).toBe(100);
  });
});

describe('sheet values for the simulator', () => {
  const readings = [
    { section: 'general', column: 'left', label: 'PATK', value: 9477 },
    { section: 'general', column: 'right', label: 'PDEF', value: 9999 },
    { section: 'quasi', column: 'left', label: 'Ignore PDEF', value: 10 },
    { section: 'quasi', column: 'right', label: 'Ignore PDEF', value: 99 },
    { section: 'quasi', column: 'right', label: 'PDMG.R', value: 176.8 },
    { section: 'quasi', column: 'left', label: 'PvP DMG Redu', value: 2761 },
    { section: 'quasi', column: 'right', label: 'PvP DMG Bonus', value: 2502 },
    { section: 'special', column: 'left', label: 'Equipment PDEF', value: 44.79 },
    { section: 'special', column: 'left', label: 'DMG vs Medium Enemies', value: 3.82 },
  ];

  it('fills only stored labels and prefers the left ignore reading', () => {
    expect(sheetSideValues(readings, 'you')).toMatchObject({
      equipmentPdefPercent: 44.79,
      pdmgReduction: 176.8,
      pvpReduction: 2761,
      dmgMedium: 3.82,
      equipmentMdefPercent: null,
    });
    expect(sheetSideValues(readings, 'you').equipmentPdef).toBeUndefined();
    expect(sheetSideValues(readings, 'enemy')).toMatchObject({
      patk: 9477,
      ignorePdef: 10,
      pvpDmg: 2502,
      pvpReduction: 2761,
      matk: null,
    });
    expect(sheetSideValues([
      { section: 'quasi', column: 'left', label: 'PvP DMG Reduction', value: 1800 },
    ], 'you').pvpReduction).toBe(1800);
  });

  it('uses the latest confirmed sheet for a member', () => {
    const sheet = latestConfirmedSheet([
      { status: 'confirmed', memberUid: 'ada', capturedAt: '2026-11-01', confirmedAt: '2026-11-01T01:00:00.000Z', id: 'old' },
      { status: 'draft', memberUid: 'ada', capturedAt: '2026-11-20', confirmedAt: '', id: 'draft' },
      { status: 'confirmed', memberUid: 'ada', capturedAt: '2026-11-15', confirmedAt: '2026-11-15T01:00:00.000Z', id: 'new' },
      { status: 'confirmed', memberUid: 'bee', capturedAt: '2026-11-18', id: 'other' },
    ], 'ada');
    expect(sheet.id).toBe('new');
    expect(latestConfirmedSheet([], 'ada')).toBeNull();
  });
});
