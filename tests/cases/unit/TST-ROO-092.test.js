import { describe, expect, it } from 'vitest';
import {
  allowListedJobsAndTimezoneOnly,
  nonOfficerPickFromPublicView,
  omittedFieldsFullViews,
  unknownFieldsDropped,
} from '../../patterns/settings_fields_pick.js';

describe('TST-ROO-092 SettingsFieldsAllowList picks only named keys', () => {
  it('Requested allow-listed keys are the only keys returned', async () => {
    const { status, body } = await allowListedJobsAndTimezoneOnly();
    expect(status).toBe(200);
    expect(Object.keys(body.config).sort()).toEqual(['jobs', 'timezone']);
  });

  it('Unknown field names are dropped', async () => {
    const { status, body } = await unknownFieldsDropped();
    expect(status).toBe(200);
    expect(body.config.jobs).toBeTruthy();
    expect(body.config.notARealField).toBeUndefined();
    expect(body.config.adminRoles).toBeUndefined();
  });

  it('Non-officer pick is the public view filtered before the pick', async () => {
    const { status, body } = await nonOfficerPickFromPublicView();
    expect(status).toBe(200);
    expect(body.publicOnly).toBe(true);
    expect(body.config.jobs).toBeTruthy();
    expect(body.config.timezone).toBe('Asia/Manila');
    expect(body.config.adminRoles).toBeUndefined();
  });

  it('Omitted fields still return the full officer view or the public view', async () => {
    const { officer, member } = await omittedFieldsFullViews();
    expect(officer.status).toBe(200);
    expect(officer.body.publicOnly).toBe(false);
    expect(officer.body.config.adminRoles).toEqual(['Officer', 'Admin']);
    expect(officer.body.discordChannels).toEqual({ requestChannelId: 'chan-1' });
    expect(member.status).toBe(200);
    expect(member.body.publicOnly).toBe(true);
    expect(member.body.config.adminRoles).toBeUndefined();
    expect(member.body.discordChannels).toBeUndefined();
  });
});
