import { describe, expect, it } from 'vitest';
import {
  authenticatedLobbyForMember,
  httpAndBuilderShareLobby,
  lobbyScopedToMemberA,
  unauthenticatedInitRefused,
} from '../../patterns/request_lobby.js';

describe('TST-ROO-066 RequestLobbyBuilder returns a member-scoped lobby shared by HTTP init and Discord card', () => {
  it('Authenticated member gets gate, items, and own pending counts', async () => {
    const lobby = await authenticatedLobbyForMember();
    expect(lobby.isGateOpen).toBe(true);
    expect(lobby.currentPhase).toBe(1);
    expect(lobby.items.some((i) => i.id === 'puppet')).toBe(true);
    expect(lobby.liveCounts.puppet).toBe(1);
    expect(lobby.liveCounts).not.toHaveProperty('fromOtherMember');
  });

  it('Unauthenticated caller does not get a lobby', async () => {
    const { status, body } = await unauthenticatedInitRefused();
    expect(status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.items).toBeUndefined();
    expect(body.liveCounts).toBeUndefined();
  });

  it('HTTP init and Discord Request Card share one builder result', async () => {
    const { built, http } = await httpAndBuilderShareLobby();
    expect(http.status).toBe(200);
    expect(http.body.isGateOpen).toBe(built.isGateOpen);
    expect(http.body.currentPhase).toBe(built.currentPhase);
    expect(http.body.liveCounts).toEqual(built.liveCounts);
    expect(http.body.items.map((i) => i.id)).toEqual(built.items.map((i) => i.id));
  });

  it("Another member's selections do not appear", async () => {
    const { a, b } = await lobbyScopedToMemberA();
    expect(a.liveCounts.puppet).toBe(1);
    expect(b.liveCounts.puppet).toBe(2);
    expect(a.liveCounts.puppet).not.toBe(b.liveCounts.puppet);
  });
});
