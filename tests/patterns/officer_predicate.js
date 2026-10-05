import { isTenantOfficer, rolesGrantOfficer } from '../../backend/src/auth/officer.js';
import { canManageGuild } from '../../backend/src/auth/identity.js';
import { patterns } from './registry.js';

patterns.officer_predicate = 'used';
patterns.admin_roles_casefold = 'used';

export function ownerIsAlwaysOfficer() {
  return isTenantOfficer(
    { id: 'owner-1', roles: [] },
    { ownerDiscordId: 'owner-1', adminRoles: [] },
  );
}

export function adminRolesMatchCaseInsensitive() {
  const byName = rolesGrantOfficer(['RaId LeAd'], ['raid lead']);
  const byId = rolesGrantOfficer(['998877665544332211'], ['998877665544332211']);
  const mixed = isTenantOfficer(
    { id: 'member-2', roles: ['OFFICER'] },
    { ownerDiscordId: 'owner-1', adminRoles: ['officer'] },
  );
  return { byName, byId, mixed };
}

export function emptyAdminRolesOwnerOnly() {
  return isTenantOfficer(
    { id: 'member-9', roles: ['Member'] },
    { ownerDiscordId: 'owner-1', adminRoles: [] },
  );
}

export function manageServerAloneNotOfficerTools() {
  const manageBits = String(32n);
  const canManage = canManageGuild(manageBits);
  const officer = isTenantOfficer(
    { id: 'manager-1', roles: [] },
    { ownerDiscordId: 'owner-1', adminRoles: [] },
  );
  return { canManage, officer };
}
