import { getTenant } from '../db/tenants.js';
import { parseEnabledGames } from '../games/catalog.js';
import { getCurrentTenantId } from '../db/tenantContext.js';

export function requireGame(gameId) {
  return async (req, res, next) => {
    try {
      const tenantId = req.tenantId || getCurrentTenantId() || req.session?.currentTenantId;
      if (!tenantId) {
        return res.status(409).json({ success: false, error: 'Select a Discord server first.', code: 'tenant_required' });
      }
      const tenant = await getTenant(tenantId);
      const enabled = parseEnabledGames(tenant?.enabled_games);
      if (!enabled.includes(String(gameId))) {
        return res.status(403).json({
          success: false,
          error: 'This game is not enabled for this workspace.',
          code: 'game_required',
          gameId,
        });
      }
      return next();
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  };
}

export default requireGame;
