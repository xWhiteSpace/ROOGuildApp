import { describe, expect, it } from 'vitest';
import { originJsonDocsUnreadableFromR3Context, schemaStampsGameId } from '../../patterns/r3_isolation.js';
import { RAGNAROK_3_ID } from '../../../backend/src/games/catalog.js';

describe('TST-R3-004 Operational rows are stamped with game_id and Origin backfill exists', () => {
  it('schema adds game_settings, game_id PKs, Origin backfill, and AG json_docs stamp', () => {
    const r = schemaStampsGameId();
    expect(r.hasGameSettings).toBe(true);
    expect(r.membersGameId).toBe(true);
    expect(r.originBackfill).toBe(true);
    expect(r.agJsonDocs).toBe(true);
  });

  it('R3 json_docs writes stamp game_id ragnarok-3 on Origin-shaped paths', async () => {
    const r = await originJsonDocsUnreadableFromR3Context();
    expect(r.count).toBeGreaterThan(0);
    expect(r.gameId).toBe(RAGNAROK_3_ID);
    expect(r.path).toBe('attendance/compositions');
  });
});
