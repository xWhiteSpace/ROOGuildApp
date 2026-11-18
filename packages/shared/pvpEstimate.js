import { labelsMatch } from './gvgStatSheet.js';

export const ESTIMATE_NOTE = 'Physical attack uses the sword size table for the chosen size. Refine PATK uses 96.14% and Refine MATK uses 25.04%. PvP skills use 0.6 physical and 0.3 magic.';

export const MATCH_ELEMENTS = ['Neutral', 'Fire', 'Wind', 'Earth', 'Water'];

export const MATCH_SIZES = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
];

export const YOU_SHEET_FIELDS = [
  { key: 'equipmentPdefPercent', section: 'special', label: 'Equipment PDEF', name: 'Equipment PDEF %' },
  { key: 'equipmentMdefPercent', section: 'special', label: 'Equipment MDEF', name: 'Equipment MDEF %' },
  { key: 'pdmgReduction', section: 'quasi', label: 'PDMG.R', name: 'PDMG.R %' },
  { key: 'mdmgReduction', section: 'quasi', label: 'MDMG.R', name: 'MDMG.R %' },
  { key: 'pvpReduction', section: 'quasi', label: 'PvP DMG Reduction', labels: ['PvP DMG Reduction', 'PvP DMG Redu'], name: 'PvP DMG Reduction' },
  { key: 'dmgSmall', section: 'special', label: 'DMG vs Small Enemies', name: 'DMG vs Small %' },
  { key: 'reductionSmall', section: 'special', label: 'DMG Reduction vs Small Enemies', name: 'Reduction vs Small %' },
  { key: 'dmgMedium', section: 'special', label: 'DMG vs Medium Enemies', name: 'DMG vs Medium %' },
  { key: 'reductionMedium', section: 'special', label: 'DMG Reduction vs Medium Enemies', name: 'Reduction vs Medium %' },
  { key: 'dmgLarge', section: 'special', label: 'DMG vs Large Enemies', name: 'DMG vs Large %' },
  { key: 'reductionLarge', section: 'special', label: 'DMG Reduction vs Large Enemies', name: 'Reduction vs Large %' },
];

export const ENEMY_SHEET_FIELDS = [
  { key: 'patk', section: 'general', label: 'PATK', name: 'PATK' },
  { key: 'matk', section: 'general', label: 'MATK', name: 'MATK' },
  { key: 'refinePatk', section: 'general', label: 'Refine PATK', name: 'Refine PATK' },
  { key: 'refineMatk', section: 'general', label: 'Refine MATK', name: 'Refine MATK' },
  { key: 'ignorePdef', section: 'quasi', label: 'Ignore PDEF', name: 'Ignore PDEF' },
  { key: 'ignoreMdef', section: 'quasi', label: 'Ignore MDEF', name: 'Ignore MDEF' },
  { key: 'pdmg', section: 'quasi', label: 'PDMG', name: 'PDMG %' },
  { key: 'mdmg', section: 'quasi', label: 'MDMG', name: 'MDMG %' },
  { key: 'pvpDmg', section: 'quasi', label: 'PvP DMG Bonus', name: 'PvP DMG Bonus' },
  { key: 'pvpReduction', section: 'quasi', label: 'PvP DMG Reduction', labels: ['PvP DMG Reduction', 'PvP DMG Redu'], name: 'PvP DMG Reduction' },
];

const ELEMENT_ORDER = ['Neutral', 'Wind', 'Earth', 'Water', 'Fire', 'Poison', 'Holy', 'Shadow', 'Undead', 'Ghost', 'Mental'];

const ELEMENT_ROWS = {
  Neutral: [1, 1, 1, 1, 1, 1, 1, 1, 0.7, 1, 1],
  Wind: [1, 0.25, 0.8, 1, 1.75, 1, 0.75, 1, 1, 1, 1],
  Earth: [1, 1.75, 0.25, 0.8, 1, 1, 0.75, 1, 1, 1, 1],
  Water: [1, 1, 1.75, 0.25, 0.8, 1, 0.75, 1, 1, 1.5, 1],
  Fire: [1, 0.9, 1, 1.75, 0.25, 1, 0.75, 1, 1, 1, 1],
  Poison: [1, 1.25, 1.25, 1.25, 1.25, 0.25, 0.5, 0.5, 1, 0.25, 1],
  Holy: [1, 1, 1, 1, 1, 1, 0.25, 1.5, 1, 1.75, 1],
  Shadow: [1, 1, 1, 1, 1, 0.5, 1.5, 0.25, 1, 0.25, 1],
  Undead: [0.7, 1, 1, 1, 1, 1, 0.75, 0.75, 1.5, 1.25, 1],
  Ghost: [1, 1, 1, 1, 1, 0.5, 1.25, 0.25, 1, 0.25, 1],
  Mental: [1, 1, 1, 1, 1, 1, 1, 1, 0.7, 1, 1],
};

const SWORD_SIZE = { small: 0.75, medium: 0.75, large: 1 };
const REFINE_PATK = 0.9614;
const REFINE_MATK = 0.2504;
const PHYSICAL_SKILL = 0.6;
const MAGIC_SKILL = 0.3;
const LAYER_FLOOR = 0.1;

function num(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function percent(value) {
  return num(value) / 100;
}

function sheetNumber(readings, section, label) {
  const names = Array.isArray(label) ? label : [label];
  const rows = (readings || []).filter((row) => (
    row
    && row.section === section
    && names.some((name) => labelsMatch(row.label, name))
    && row.value != null
    && Number.isFinite(Number(row.value))
  ));
  const left = rows.find((row) => row.column === 'left');
  const picked = left || rows[0];
  return picked ? Number(picked.value) : null;
}

export function sheetSideValues(readings, side) {
  const fields = side === 'enemy' ? ENEMY_SHEET_FIELDS : YOU_SHEET_FIELDS;
  const out = {};
  for (const field of fields) out[field.key] = sheetNumber(readings, field.section, field.labels || field.label);
  return out;
}

export function latestConfirmedSheet(snapshots, uid) {
  const id = String(uid || '');
  if (!id) return null;
  const rows = (snapshots || []).filter((row) => row && row.status === 'confirmed' && String(row.memberUid) === id);
  rows.sort((a, b) => {
    const day = String(b.capturedAt || '').localeCompare(String(a.capturedAt || ''));
    if (day) return day;
    return String(b.confirmedAt || '').localeCompare(String(a.confirmedAt || ''));
  });
  return rows[0] || null;
}

function elementRate(attack, defend) {
  const row = ELEMENT_ROWS[attack] || ELEMENT_ROWS.Neutral;
  const index = ELEMENT_ORDER.indexOf(defend);
  if (index < 0 || row[index] == null) return 1;
  return row[index];
}

function unsignedPvpBonus(amount) {
  if (amount >= 2400) return 0.2;
  if (amount >= 2100) return 0.18 + 0.0000075 * (amount - 2100);
  if (amount >= 1800) return 0.15 + 0.0000175 * (amount - 1800);
  if (amount >= 1500) return 0.12 + 0.000015 * (amount - 1500);
  if (amount >= 1200) return 0.1 + 0.000035 * (amount - 1200);
  if (amount >= 900) return 0.08 + 0.0000225 * (amount - 900);
  if (amount >= 600) return 0.06 + 0.0000525 * (amount - 600);
  if (amount >= 300) return 0.04 + 0.0000375 * (amount - 300);
  return 0.0000775 * amount;
}

function signedPvpBonus(enemyBonus, yourReduction) {
  const diff = num(enemyBonus) - num(yourReduction);
  const unsigned = unsignedPvpBonus(Math.abs(diff));
  return diff < 0 ? -unsigned : unsigned;
}

function boundedLayer(value) {
  return Math.max(value, LAYER_FLOOR);
}

function rawDefense(equipment, equipmentPercent) {
  return num(equipment) / (1 + Math.max(percent(equipmentPercent), -0.99));
}

function defenseLayer(attack, effective) {
  if (num(attack) <= 0) return 0;
  return attack / (attack + effective * 4);
}

function layerPercent(ratio) {
  return Math.round(ratio * 10000) / 100;
}

function sizeKey(size) {
  if (size === 'small' || size === 'large') return size;
  return 'medium';
}

export function estimatePvp(input = {}) {
  const size = sizeKey(input.size);
  const pvpScene = input.pvpScene !== false;
  const skill = input.skillMultiplier == null || input.skillMultiplier === '' ? 1 : num(input.skillMultiplier, 1);
  const weapon = num(input.weaponAtk);
  const patk = num(input.patk);
  const matk = num(input.matk);
  const refinePatk = num(input.refinePatk);
  const refineMatk = num(input.refineMatk);
  const rawPdef = rawDefense(input.equipmentPdef, input.equipmentPdefPercent);
  const rawMdef = rawDefense(input.equipmentMdef, input.equipmentMdefPercent);
  const effectivePdef = Math.max(rawPdef - num(input.ignorePdef), 0);
  const effectiveMdef = Math.max(rawMdef - num(input.ignoreMdef), 0);
  const pdefLayer = defenseLayer(patk, effectivePdef);
  const mdefLayer = defenseLayer(matk, effectiveMdef);
  const resistPhysical = boundedLayer(1 + percent(input.pdmg) - percent(input.pdmgReduction));
  const resistMagic = boundedLayer(1 + percent(input.mdmg) - percent(input.mdmgReduction));
  const sizeDmg = size === 'small' ? input.dmgSmall : size === 'large' ? input.dmgLarge : input.dmgMedium;
  const sizeReduction = size === 'small' ? input.reductionSmall : size === 'large' ? input.reductionLarge : input.reductionMedium;
  const sizeLayer = boundedLayer(1 + percent(sizeDmg) - percent(sizeReduction));
  const raceLayer = boundedLayer(1 + percent(input.dmgDemi) - percent(input.reductionDemi));
  const elementLayer = boundedLayer(
    elementRate(input.attackElement || 'Neutral', input.defendElement || 'Neutral')
    + percent(input.elementDmg)
    - percent(input.elementReduction),
  );
  const signed = signedPvpBonus(input.pvpDmg, input.pvpReduction);
  const pvpPhysical = pvpScene ? PHYSICAL_SKILL * (1 + signed) : 1;
  const pvpMagic = pvpScene ? MAGIC_SKILL * (1 + signed) : 1;
  const sword = SWORD_SIZE[size];
  const weaponPart = (weapon + refinePatk * (1 + REFINE_PATK)) * sword;
  const physicalBase = 2 * patk + weaponPart;
  const physicalAfterSkill = physicalBase * skill;
  const physicalAfterDef = Math.max(physicalAfterSkill * pdefLayer - num(input.basePdef), 0);
  const physicalFinal = (physicalAfterDef + 100 + 25) * pvpPhysical;
  const magicBase = matk + weapon + refineMatk * (1 + REFINE_MATK);
  const magicAfterSkill = magicBase * skill;
  const magicAfterDef = Math.max(magicAfterSkill * mdefLayer - num(input.baseMdef), 0);
  const magicFinal = (magicAfterDef + 50 + 10) * pvpMagic;
  const physical = physicalFinal * resistPhysical * sizeLayer * raceLayer * elementLayer;
  const magic = magicFinal * resistMagic * sizeLayer * raceLayer * elementLayer;
  return {
    physical: Math.round(physical),
    magic: Math.round(magic),
    pdefTaken: layerPercent(pdefLayer),
    mdefTaken: layerPercent(mdefLayer),
    resistPhysical: layerPercent(resistPhysical),
    resistMagic: layerPercent(resistMagic),
    size: layerPercent(sizeLayer),
    demiHuman: layerPercent(raceLayer),
    element: layerPercent(elementLayer),
    pvpPhysical: layerPercent(pvpPhysical),
    pvpMagic: layerPercent(pvpMagic),
  };
}
