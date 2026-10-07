import { Router } from 'express';
import { getTenantStore } from '../db/database.js';
import { getCurrentTenantId } from '../db/tenantContext.js';
import { checkOfficer } from '../auth/officer.js';
import { signUserProfile } from '../auth/identity.js';
import { WORKSPACE_CONFIG_KEYS } from '../config/workspaceDefaults.js';
import { RAGNAROK_3_DEFAULTS } from '../games/ragnarok-3/defaults.js';
import { defaultRaidSubtree, findOverlappingRaidCyclePair } from '@guildname/shared/raidCycle';

const router = Router();

function pickKeys(source, keys) {
  const out = {};
  for (const key of keys) {
    if (source && Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
  }
  return out;
}

function omitKeys(source, keys) {
  const out = { ...(source || {}) };
  for (const key of keys) delete out[key];
  return out;
}

function helpSettingsView(config) {
  return {
    helpEmbedUrl: config?.helpEmbedUrl || '',
    raidHelpEmbedUrl: config?.raidHelpEmbedUrl || '',
    timezone: config?.timezone || 'Asia/Manila',
  };
}

function publicSettingsView(config) {
  return {
    timezone: config?.timezone || 'Asia/Manila',
    jobs: config?.jobs || {},
    roles: config?.roles || {},
    events: config?.events || {},
    warRooms: config?.warRooms || {},
    specialEventCategories: config?.specialEventCategories || [],
    gridTopology: config?.gridTopology || { columns: 8, rows: 5 },
    helpEmbedUrl: config?.helpEmbedUrl || '',
    raidHelpEmbedUrl: config?.raidHelpEmbedUrl || '',
    defaultLeaveCredits: config?.defaultLeaveCredits,
  };
}

function parseSettingsFields(raw) {
  return String(raw || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
}

function sanitizeRo3Events(events) {
  const out = {};
  for (const [id, ev] of Object.entries(events || {})) {
    const next = { ...(ev || {}) };
    if (!next.raid?.phases && next.phases) {
      const migrated = defaultRaidSubtree({
        configId: next.raid?.configId || '',
        fromAuctionPhases: next.phases,
      });
      next.raid = { ...migrated, ...(next.raid || {}), phases: migrated.phases };
    }
    delete next.phases;
    delete next.announcements;
    delete next.loots;
    out[id] = next;
  }
  return out;
}

router.post('/unlock', async (req, res) => {
  try {
    const db = getTenantStore();
    const configSnap = await db.ref('settings/configuration').once('value');
    const config = configSnap.exists() ? configSnap.val() : {};
    const { user, ok } = await checkOfficer(req, config);
    if (!user) return res.status(401).json({ success: false, error: 'Login required' });
    if (!ok) {
      return res.status(403).json({
        success: false,
        error: 'Officers of this Discord server can unlock Settings.',
      });
    }
    const tenantId = req.tenantId || getCurrentTenantId();
    const signedUser = user ? signUserProfile(user) : null;
    const payload = { success: true, message: 'Officer configuration desk unlocked.', user: signedUser };
    if (req.session) {
      req.session.settingsUnlocked = true;
      req.session.settingsUnlockedTenantId = tenantId;
      return req.session.save(() => res.json(payload));
    }
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/help', async (req, res) => {
  try {
    const db = getTenantStore();
    const configSnap = await db.ref('settings/configuration').once('value');
    const config = configSnap.exists() ? configSnap.val() : { ...RAGNAROK_3_DEFAULTS };
    return res.json({ success: true, ...helpSettingsView(config) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/get', async (req, res) => {
  try {
    const db = getTenantStore();
    const configSnap = await db.ref('settings/configuration').once('value');
    const config = configSnap.exists() ? configSnap.val() : { ...RAGNAROK_3_DEFAULTS };
    const { ok } = await checkOfficer(req, config);
    const fieldKeys = parseSettingsFields(req.query.fields);
    if (fieldKeys.length > 0) {
      const base = ok ? config : publicSettingsView(config);
      return res.json({
        success: true,
        config: pickKeys(base, fieldKeys),
        needsSetup: false,
        publicOnly: !ok,
      });
    }
    if (!ok) {
      return res.json({
        success: true,
        config: publicSettingsView(config),
        help: helpSettingsView(config),
        needsSetup: false,
        publicOnly: true,
      });
    }
    return res.json({ success: true, config, needsSetup: false, publicOnly: false });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/save', async (req, res) => {
  try {
    const { config } = req.body;
    if (!config) return res.status(400).json({ success: false, error: 'Omitted payload configuration parameter maps.' });
    const db = getTenantStore();
    const storedSnap = await db.ref('settings/configuration').once('value');
    const storedConfig = storedSnap.exists() ? storedSnap.val() : {};
    const { user, ok } = await checkOfficer(req, storedConfig);
    if (!user) return res.status(401).json({ success: false, error: 'Login required' });
    if (!ok) {
      return res.status(403).json({ success: false, error: 'Officer access required to save Settings.' });
    }
    const nextConfig = {
      ...omitKeys(storedConfig, WORKSPACE_CONFIG_KEYS),
      ...omitKeys(config, WORKSPACE_CONFIG_KEYS),
    };
    delete nextConfig.items;
    delete nextConfig.priorityLookbackDays;
    nextConfig.events = sanitizeRo3Events(nextConfig.events);
    const overlap = findOverlappingRaidCyclePair(nextConfig.events || {});
    if (overlap) {
      const titleA = nextConfig.events?.[overlap.a]?.title || overlap.a;
      const titleB = nextConfig.events?.[overlap.b]?.title || overlap.b;
      return res.status(400).json({
        success: false,
        error: `Raid cycles overlap between ${titleA} (${overlap.a}) and ${titleB} (${overlap.b}). Adjust Start/End so raid-enabled events do not overlap.`,
      });
    }
    await db.ref('settings/configuration').set(nextConfig);
    return res.json({ success: true, message: 'Game settings saved.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
