import { describe, expect, it } from 'vitest';
import {
  workspaceDefaultsShape,
  omittedTimezoneDefaultsManila,
  providedTimezoneIsUsed,
  formattingUsesFormatToParts,
  seededSettingsPersistDefaults,
} from '../../patterns/workspace_defaults.js';

describe('TST-ROO-213 WorkspaceDefaultsAndGuildClock seed Asia/Manila and format via Intl formatToParts', () => {
  it('workspace defaults store Asia/Manila and empty display fields', () => {
    const r = workspaceDefaultsShape();
    expect(r.timezone).toBe('Asia/Manila');
    expect(r.guildDisplayName).toBe('');
    expect(r.guildLogoUrl).toBe('');
    expect(r.adminRoles).toEqual([]);
  });

  it('an omitted timezone defaults to Asia/Manila', () => {
    const r = omittedTimezoneDefaultsManila();
    expect(r.parts.dayOfWeek).toBeTypeOf('number');
  });

  it('a provided timezone is the one the helper uses', () => {
    const r = providedTimezoneIsUsed();
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // noon UTC on Oct 7 is morning in New York → still 2026-10-07
    expect(r.date).toBe('2026-10-07');
  });

  it('formatting uses Intl formatToParts, not toISOString date keys', () => {
    const r = formattingUsesFormatToParts();
    expect(r.usesFormatToParts).toBe(true);
    expect(r.sample).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('seeded workspace settings persist the defaults', async () => {
    const r = await seededSettingsPersistDefaults();
    expect(r.persisted).toBe(true);
    expect(r.timezone).toBe('Asia/Manila');
    expect(r.guildDisplayName).toBe('');
    expect(r.adminRoles).toEqual([]);
  });
});
