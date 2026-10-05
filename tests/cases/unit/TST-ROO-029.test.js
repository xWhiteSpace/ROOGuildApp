import { describe, expect, it } from 'vitest';
import {
  adminRolesMatchCaseInsensitive,
  emptyAdminRolesOwnerOnly,
  manageServerAloneNotOfficerTools,
  ownerIsAlwaysOfficer,
} from '../../patterns/officer_predicate.js';

describe('TST-ROO-029 OfficerPredicate owner OR adminRoles; empty adminRoles → owner only', () => {
  it('Tenant owner always officer', () => {
    expect(ownerIsAlwaysOfficer()).toBe(true);
  });

  it('adminRoles name/id match case-insensitive → officer', () => {
    const { byName, byId, mixed } = adminRolesMatchCaseInsensitive();
    expect(byName).toBe(true);
    expect(byId).toBe(true);
    expect(mixed).toBe(true);
  });

  it('Empty adminRoles → owner only', () => {
    expect(emptyAdminRolesOwnerOnly()).toBe(false);
  });

  it('Manage Server alone does not grant day-to-day officer tools', () => {
    const { canManage, officer } = manageServerAloneNotOfficerTools();
    expect(canManage).toBe(true);
    expect(officer).toBe(false);
  });
});
