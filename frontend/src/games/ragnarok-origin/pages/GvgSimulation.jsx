import { useEffect, useRef, useState } from 'react';
import { Sheet } from 'lucide-react';
import MemberField from './MemberField';
import { normalizeExtras } from '@guildname/shared/gvgStatSheet';
import {
  ENEMY_SHEET_FIELDS,
  ESTIMATE_NOTE,
  MATCH_ELEMENTS,
  MATCH_SIZES,
  YOU_SHEET_FIELDS,
  estimatePvp,
  latestConfirmedSheet,
  sheetSideValues,
} from '@guildname/shared/pvpEstimate';

const controlClass = 'box-border h-8 w-full rounded-xl border border-slate-800 bg-slate-950 px-2.5 text-xs text-slate-100 outline-none scheme-dark focus:border-slate-600';
const labelClass = 'mb-1.5 block text-[11px] font-medium text-slate-400';
const cardClass = 'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40';
const cardHeader = 'flex h-10 shrink-0 items-center justify-between gap-2 border-b border-slate-800/80 px-3';
const cardTitle = 'shrink-0 text-[10px] font-normal uppercase tracking-wider text-slate-400';
const cardBody = 'p-5';
const quietButton = 'inline-flex h-8 shrink-0 items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 px-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-200 hover:border-slate-600';

const SIMULATION_KEY = 'valhalla_gvg_simulation';
let simulationMemory = null;

function readSimulationMemory() {
  if (simulationMemory) return simulationMemory;
  try {
    const raw = sessionStorage.getItem(SIMULATION_KEY);
    simulationMemory = raw ? JSON.parse(raw) : null;
  } catch {
    simulationMemory = null;
  }
  return simulationMemory;
}

function writeSimulationMemory(next) {
  simulationMemory = next;
  try {
    sessionStorage.setItem(SIMULATION_KEY, JSON.stringify(next));
  } catch {
    simulationMemory = next;
  }
}

const MATCH_START = {
  pvpScene: true,
  size: 'medium',
  skillMultiplier: '1',
  weaponAtk: '0',
  attackElement: 'Neutral',
  defendElement: 'Neutral',
  elementDmg: '0',
  elementReduction: '0',
  dmgDemi: '0',
  reductionDemi: '0',
  basePdef: '0',
  baseMdef: '0',
  equipmentPdef: '0',
  equipmentMdef: '0',
};

const LAYERS = [
  ['pdefTaken', 'PDEF taken'],
  ['mdefTaken', 'MDEF taken'],
  ['resistPhysical', 'PDMG resist'],
  ['resistMagic', 'MDMG resist'],
  ['size', 'Size'],
  ['demiHuman', 'Demi-Human'],
  ['element', 'Element'],
  ['pvpPhysical', 'PvP physical'],
  ['pvpMagic', 'PvP magic'],
];

function numberFrom(text, fallback) {
  const raw = String(text ?? '').trim().replace(/,/g, '').replace(/%$/, '');
  if (!raw || raw === '-' || raw === '.') return fallback;
  const number = Number(raw);
  return Number.isFinite(number) ? number : fallback;
}

function shown(overrides, sheet, key) {
  if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
  const value = sheet?.[key];
  return value == null ? '0' : String(value);
}

function fromSheet(overrides, sheet, key) {
  return sheet?.[key] != null && !Object.prototype.hasOwnProperty.call(overrides, key);
}

function SheetMark() {
  return <Sheet aria-label="From the sheet" className="h-3.5 w-3.5 shrink-0 text-emerald-400/80" />;
}

const choiceClass = 'box-border h-7 w-28 shrink-0 rounded-lg border border-slate-800 bg-slate-950 px-2 text-xs text-slate-100 outline-none scheme-dark focus:border-slate-600';

function ChoiceField({ label, value, onChange, options }) {
  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-400" title={label}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={choiceClass}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function NumberField({ label, value, onChange, sheet, compact }) {
  if (compact) {
    return (
      <label className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-400" title={label}>{label}</span>
        {sheet ? <SheetMark /> : null}
        <input
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="box-border h-7 w-[5.25rem] shrink-0 rounded-lg border border-slate-800 bg-slate-950 px-2 text-right text-xs tabular-nums text-slate-100 outline-none scheme-dark focus:border-slate-600"
        />
      </label>
    );
  }
  return (
    <label className="min-w-0">
      <span className={labelClass}>
        {label}
        {sheet ? <SheetMark /> : null}
      </span>
      <input
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={controlClass}
      />
    </label>
  );
}

function textNumber(value) {
  return String(value ?? 0);
}

function youMatchFrom(record, uid) {
  if (!uid) {
    return {
      basePdef: '0',
      baseMdef: '0',
      equipmentPdef: '0',
      equipmentMdef: '0',
      elementReduction: '0',
      reductionDemi: '0',
    };
  }
  const extras = normalizeExtras(record?.extras);
  return {
    basePdef: textNumber(extras.basePdef),
    baseMdef: textNumber(extras.baseMdef),
    equipmentPdef: textNumber(extras.equipmentPdef),
    equipmentMdef: textNumber(extras.equipmentMdef),
    elementReduction: textNumber(extras.elementReduction),
    reductionDemi: textNumber(extras.reductionDemi),
  };
}

function enemyMatchFrom(record, uid) {
  if (!uid) {
    return {
      weaponAtk: '0',
      elementDmg: '0',
      dmgDemi: '0',
    };
  }
  const extras = normalizeExtras(record?.extras);
  return {
    weaponAtk: textNumber(extras.weaponAtk),
    elementDmg: textNumber(extras.elementDmg),
    dmgDemi: textNumber(extras.dmgDemi),
  };
}

function sheetNote(uid, record) {
  if (uid && record?.capturedAt) return `Latest sheet · ${record.capturedAt}`;
  if (uid) return 'No confirmed sheet. These stay at 0.';
  return 'Manual starts at 0. Pick a member to copy their latest sheet.';
}

export default function GvgSimulation({ roster, snapshots, selfUid }) {
  const saved = readSimulationMemory();
  const [youUid, setYouUid] = useState(saved?.youUid || '');
  const [enemyUid, setEnemyUid] = useState(saved?.enemyUid || '');
  const mine = (roster || []).find((row) => String(row.uid) === String(selfUid || '')) || null;
  const youRecord = latestConfirmedSheet(snapshots, youUid);
  const enemyRecord = latestConfirmedSheet(snapshots, enemyUid);
  const youSheet = sheetSideValues(youRecord?.readings, 'you');
  const enemySheet = sheetSideValues(enemyRecord?.readings, 'enemy');
  const [match, setMatch] = useState(() => ({ ...MATCH_START, ...(saved?.match || {}) }));
  const [youOverrides, setYouOverrides] = useState(saved?.youOverrides || {});
  const [enemyOverrides, setEnemyOverrides] = useState(saved?.enemyOverrides || {});
  const appliedRef = useRef(saved ? `hold:${saved.youUid || ''}|${saved.enemyUid || ''}` : '');

  useEffect(() => {
    const picks = `${youUid}|${enemyUid}`;
    if (appliedRef.current === `hold:${picks}`) return;
    const token = `${picks}|${youRecord?.id || ''}|${enemyRecord?.id || ''}`;
    if (appliedRef.current === token) return;
    const previous = appliedRef.current;
    appliedRef.current = token;
    if (!previous) return;
    setMatch((current) => ({
      ...current,
      ...MATCH_START,
      ...youMatchFrom(youRecord, youUid),
      ...enemyMatchFrom(enemyRecord, enemyUid),
    }));
    setYouOverrides({});
    setEnemyOverrides({});
  }, [youUid, enemyUid, youRecord, enemyRecord]);

  useEffect(() => {
    writeSimulationMemory({
      youUid,
      enemyUid,
      match,
      youOverrides,
      enemyOverrides,
    });
  }, [youUid, enemyUid, match, youOverrides, enemyOverrides]);

  const youValue = (key) => shown(youOverrides, youUid ? youSheet : null, key);
  const enemyValue = (key) => shown(enemyOverrides, enemyUid ? enemySheet : null, key);
  const setMatchField = (key, value) => setMatch((current) => ({ ...current, [key]: value }));

  const result = estimatePvp({
    pvpScene: match.pvpScene,
    size: match.size,
    skillMultiplier: numberFrom(match.skillMultiplier, 0),
    weaponAtk: numberFrom(match.weaponAtk, 0),
    attackElement: match.attackElement,
    defendElement: match.defendElement,
    elementDmg: numberFrom(match.elementDmg, 0),
    elementReduction: numberFrom(match.elementReduction, 0),
    dmgDemi: numberFrom(match.dmgDemi, 0),
    reductionDemi: numberFrom(match.reductionDemi, 0),
    basePdef: numberFrom(match.basePdef, 0),
    baseMdef: numberFrom(match.baseMdef, 0),
    equipmentPdef: numberFrom(match.equipmentPdef, 0),
    equipmentMdef: numberFrom(match.equipmentMdef, 0),
    patk: numberFrom(enemyValue('patk'), 0),
    matk: numberFrom(enemyValue('matk'), 0),
    refinePatk: numberFrom(enemyValue('refinePatk'), 0),
    refineMatk: numberFrom(enemyValue('refineMatk'), 0),
    ignorePdef: numberFrom(enemyValue('ignorePdef'), 0),
    ignoreMdef: numberFrom(enemyValue('ignoreMdef'), 0),
    pdmg: numberFrom(enemyValue('pdmg'), 0),
    mdmg: numberFrom(enemyValue('mdmg'), 0),
    pvpDmg: numberFrom(enemyValue('pvpDmg'), 0),
    equipmentPdefPercent: numberFrom(youValue('equipmentPdefPercent'), 0),
    equipmentMdefPercent: numberFrom(youValue('equipmentMdefPercent'), 0),
    pdmgReduction: numberFrom(youValue('pdmgReduction'), 0),
    mdmgReduction: numberFrom(youValue('mdmgReduction'), 0),
    pvpReduction: numberFrom(youValue('pvpReduction'), 0),
    dmgSmall: numberFrom(youValue('dmgSmall'), 0),
    reductionSmall: numberFrom(youValue('reductionSmall'), 0),
    dmgMedium: numberFrom(youValue('dmgMedium'), 0),
    reductionMedium: numberFrom(youValue('reductionMedium'), 0),
    dmgLarge: numberFrom(youValue('dmgLarge'), 0),
    reductionLarge: numberFrom(youValue('reductionLarge'), 0),
  });

  const reset = () => {
    const nextMatch = {
      ...MATCH_START,
      ...youMatchFrom(youRecord, youUid),
      ...enemyMatchFrom(enemyRecord, enemyUid),
    };
    appliedRef.current = `hold:${youUid}|${enemyUid}`;
    writeSimulationMemory({
      youUid,
      enemyUid,
      match: nextMatch,
      youOverrides: {},
      enemyOverrides: {},
    });
    setMatch(nextMatch);
    setYouOverrides({});
    setEnemyOverrides({});
  };

  return (
    <section className={cardClass}>
      <header className={cardHeader}>
        <h2 className={cardTitle}>Simulation</h2>
        <button type="button" onClick={reset} className={quietButton}>Reset</button>
      </header>
      <div className={cardBody}>
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-950/50 p-4">
          <div>
            <p className={labelClass}>Physical</p>
            <p className="text-2xl font-black tabular-nums text-slate-50">{result.physical.toLocaleString('en-US')}</p>
          </div>
          <div>
            <p className={labelClass}>Magic</p>
            <p className="text-2xl font-black tabular-nums text-slate-50">{result.magic.toLocaleString('en-US')}</p>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
          {LAYERS.map(([key, name]) => (
            <div key={key} className="flex items-baseline justify-between gap-2 text-[11px]">
              <dt className="text-slate-500">{name}</dt>
              <dd className="tabular-nums text-slate-200">{result[key].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[10px] leading-relaxed text-slate-500">{ESTIMATE_NOTE}</p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:gap-x-4 lg:gap-y-3">
          <div className="min-w-0 space-y-3 rounded-xl bg-slate-950/50 p-4 lg:row-span-3 lg:grid lg:grid-rows-subgrid lg:space-y-0">
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-200">You</h3>
              <label className="mt-2 block">
                <span className={labelClass}>Member</span>
                <MemberField
                  people={roster || []}
                  value={youUid}
                  onPick={setYouUid}
                  mine={mine}
                  allowMine
                  emptyLabel="Manual"
                  placeholder="Manual"
                />
              </label>
              <p className="mt-1 text-[11px] text-slate-500">{sheetNote(youUid, youRecord)}</p>
            </div>
            <div className="grid grid-cols-1 gap-y-1.5">
              {YOU_SHEET_FIELDS.map((field) => (
                <NumberField
                  key={field.key}
                  compact
                  label={field.name}
                  value={youValue(field.key)}
                  sheet={Boolean(youUid) && fromSheet(youOverrides, youSheet, field.key)}
                  onChange={(value) => setYouOverrides((current) => ({ ...current, [field.key]: value }))}
                />
              ))}
            </div>
            <div className="space-y-1.5 border-t border-slate-800/80 pt-3">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-200">Other Stats</h4>
              <NumberField compact label="Base PDEF" value={match.basePdef} onChange={(value) => setMatchField('basePdef', value)} />
              <NumberField compact label="Base MDEF" value={match.baseMdef} onChange={(value) => setMatchField('baseMdef', value)} />
              <NumberField compact label="Equipment PDEF" value={match.equipmentPdef} onChange={(value) => setMatchField('equipmentPdef', value)} />
              <NumberField compact label="Equipment MDEF" value={match.equipmentMdef} onChange={(value) => setMatchField('equipmentMdef', value)} />
              <ChoiceField label="Size" value={match.size} onChange={(value) => setMatchField('size', value)} options={MATCH_SIZES.map((row) => ({ value: row.id, label: row.label }))} />
              <ChoiceField label="Your element" value={match.defendElement} onChange={(value) => setMatchField('defendElement', value)} options={MATCH_ELEMENTS.map((name) => ({ value: name, label: name }))} />
              <NumberField compact label="Element reduction %" value={match.elementReduction} onChange={(value) => setMatchField('elementReduction', value)} />
              <NumberField compact label="Reduction vs Demi-Human %" value={match.reductionDemi} onChange={(value) => setMatchField('reductionDemi', value)} />
            </div>
          </div>
          <div className="min-w-0 space-y-3 rounded-xl bg-slate-950/50 p-4 lg:row-span-3 lg:grid lg:grid-rows-subgrid lg:space-y-0">
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-200">Enemy</h3>
              <label className="mt-2 block">
                <span className={labelClass}>Member</span>
                <MemberField
                  people={roster || []}
                  value={enemyUid}
                  onPick={setEnemyUid}
                  mine={mine}
                  allowMine
                  emptyLabel="Manual"
                  placeholder="Manual"
                />
              </label>
              <p className="mt-1 text-[11px] text-slate-500">{sheetNote(enemyUid, enemyRecord)}</p>
            </div>
            <div className="grid grid-cols-1 gap-y-1.5">
              {ENEMY_SHEET_FIELDS.map((field) => (
                <NumberField
                  key={field.key}
                  compact
                  label={field.name}
                  value={enemyValue(field.key)}
                  sheet={Boolean(enemyUid) && fromSheet(enemyOverrides, enemySheet, field.key)}
                  onChange={(value) => setEnemyOverrides((current) => ({ ...current, [field.key]: value }))}
                />
              ))}
            </div>
            <div className="space-y-1.5 border-t border-slate-800/80 pt-3">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-200">Other Stats</h4>
              <NumberField compact label="Weapon ATK" value={match.weaponAtk} onChange={(value) => setMatchField('weaponAtk', value)} />
              <NumberField compact label="Skill multiplier" value={match.skillMultiplier} onChange={(value) => setMatchField('skillMultiplier', value)} />
              <ChoiceField label="Attack element" value={match.attackElement} onChange={(value) => setMatchField('attackElement', value)} options={MATCH_ELEMENTS.map((name) => ({ value: name, label: name }))} />
              <NumberField compact label="Element damage %" value={match.elementDmg} onChange={(value) => setMatchField('elementDmg', value)} />
              <NumberField compact label="DMG vs Demi-Human %" value={match.dmgDemi} onChange={(value) => setMatchField('dmgDemi', value)} />
              <label className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-400">PvP scene</span>
                <input
                  type="checkbox"
                  checked={match.pvpScene}
                  onChange={(event) => setMatchField('pvpScene', event.target.checked)}
                  className="h-4 w-4 shrink-0 accent-indigo-500"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
