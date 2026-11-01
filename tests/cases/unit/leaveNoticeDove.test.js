import { describe, expect, it } from 'vitest';
import {
  creditAndDeadlineRules,
  doveWritesOneLeave,
  footerCounts,
  handlerDoesNotLoadRosterOrConfig,
  ignorePaths,
  leaveChannelResolvesFromCache,
  leaveMarkSqlStaysProjected,
  secondDoveDoesNotSpendAgain,
} from '../../patterns/leave_notice_dove.js';

describe('GvG readiness dove marks Leave', () => {
  it('reads one status and one credit, and does not select a document', () => {
    const sql = leaveMarkSqlStaysProjected();
    expect(sql.projected).toBe(true);
    expect(sql.statusField).toBe(true);
    expect(sql.creditField).toBe(true);
    expect(sql.oneMember).toBe(true);
    expect(sql.oneCommitment).toBe(true);
    expect(sql.noReturning).toBe(true);
    expect(sql.creditUpdate).toBe(true);
  });

  it('keeps the roster and configuration reads out of the dove path', () => {
    const guard = handlerDoesNotLoadRosterOrConfig();
    expect(guard.noRoster).toBe(true);
    expect(guard.listenerSkipsTenantLoad).toBe(true);
    expect(guard.watchesReactions).toBe(true);
  });

  it('maps the leave-notice channel from the cached guild channels', () => {
    const channel = leaveChannelResolvesFromCache();
    expect(channel.mapped).toBe('leave-1');
    expect(channel.stored).toBe('leave-1');
    expect(channel.blank).toBe('');
  });

  it('ignores every reaction that is not an officer dove on the mapped channel', async () => {
    const ignored = await ignorePaths();
    expect(ignored.emoji.result.reason).toBe('emoji');
    expect(ignored.emoji.reads).toBe(0);
    expect(ignored.channel.result.reason).toBe('channel');
    expect(ignored.channel.reads).toBe(0);
    expect(ignored.officer.result.reason).toBe('officer');
    expect(ignored.officer.reads).toBe(0);
    expect(ignored.cold.result.reason).toBe('cold_cache');
    expect(ignored.cold.reads).toBe(0);
    expect(ignored.noWar.result.reason).toBe('no_war');
    expect(ignored.noWar.reads).toBe(0);
    expect(ignored.closed.result.reason).toBe('deadline');
    expect(ignored.closed.reads).toBe(0);
  });

  it('writes one Leave, spends one credit, and bumps the readiness count', async () => {
    const rules = creditAndDeadlineRules();
    expect(rules.alreadyLeave.write).toBe(false);
    expect(rules.noCredits.write).toBe(false);
    expect(rules.closed.write).toBe(false);
    expect(rules.missingMember.write).toBe(false);
    expect(rules.spend).toEqual({ write: true, nextCredits: 2 });

    const counts = footerCounts();
    expect(counts.fromUnanswered).toBe('1 confirmed · 1 leave · 1 unanswered · Master List button to view names');
    expect(counts.fromConfirmed).toBe('0 confirmed · 1 leave · 2 unanswered · Master List button to view names');
    expect(counts.untouched).toBeNull();

    const marked = await doveWritesOneLeave();
    expect(marked.result.acted).toBe(true);
    expect(marked.calls.read).toEqual([{ eventKey: '2099-06-15_gvg', memberId: 'member-1' }]);
    expect(marked.calls.write).toEqual([{
      userId: 'member-1',
      displayName: 'Rae',
      dateStr: '2099-06-15',
      eventId: 'gvg',
      status: 'Leave',
    }]);
    expect(marked.calls.credit).toEqual([{ memberId: 'member-1', credits: 2 }]);
    expect(marked.calls.announce[0]).toContain('Unavailable');
    expect(marked.calls.edited[0].embeds[0].footer.text).toBe(
      '1 confirmed · 1 leave · 1 unanswered · Master List button to view names',
    );

    const again = await secondDoveDoesNotSpendAgain();
    expect(again.result.reason).toBe('already_leave');
    expect(again.calls.write).toEqual([]);
    expect(again.calls.credit).toEqual([]);
  });
});
