import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AuthService, parseRoles } from '../auth/auth.service';
import { ConfigService } from '../config/config.service';
import { ME_ROLES_SAMPLE } from '../testing/me-roles.sample';
import { authStub, configStub } from '../testing/test-helpers';
import { ACCESS_BUTTONS, AccessButtonCode } from './access-buttons';
import { PermissionService } from './permission.service';
import { ROLE, SUPER_ADMIN_ALIASES, SUPPORTING_DOC_ROLE_PREFIX } from './roles';

const hiddenButtons = (perm: PermissionService) =>
  (Object.keys(ACCESS_BUTTONS) as AccessButtonCode[]).filter((code) => !perm.canUse(code));

/** the real answer of `/me/roles`, read the way AuthService reads it, then checked by PermissionService */
const SAMPLE_ROLES = parseRoles(ME_ROLES_SAMPLE.result);
const WITHOUT_SUPER_ADMIN = SAMPLE_ROLES.filter((r) => !SUPER_ADMIN_ALIASES.has(r.toLowerCase()));

function setup(roles: string[]) {
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: authStub(roles) },
      {
        provide: ConfigService,
        useValue: configStub({ features: { aiHubEnabled: false, pageGuardEnabled: true } }),
      },
    ],
  });
  return TestBed.inject(PermissionService);
}

describe('the real /me/roles answer (2026-10-28)', () => {
  it('is read as a flat list of 63 role names, none dropped', () => {
    expect(SAMPLE_ROLES).toEqual([...ME_ROLES_SAMPLE.result]);
    expect(SAMPLE_ROLES).toHaveLength(63);
  });

  it('carries no button and no Pipeline_* role: it is still the old naming', () => {
    expect(SAMPLE_ROLES.filter((r) => r.startsWith('Pipeline_'))).toEqual([]);
    expect(SAMPLE_ROLES).toContain(ROLE.featureLead);
    expect(SAMPLE_ROLES).toContain(ROLE.moduleCrm);
  });

  it('only holds roles the app knows (a new one in a fresh answer fails here, to be added to ROLE)', () => {
    const known = new Set<string>([
      ...Object.values(ROLE),
      ...Object.values(SUPPORTING_DOC_ROLE_PREFIX).flatMap((p) => [
        `${p}_View`,
        `${p}_Create`,
        `${p}_Edit`,
      ]),
    ]);
    expect(
      SAMPLE_ROLES.filter((r) => !known.has(r) && !SUPER_ADMIN_ALIASES.has(r.toLowerCase())),
    ).toEqual([]);
  });

  it('makes this user a super-admin, who passes every check', () => {
    const perm = setup(SAMPLE_ROLES);
    expect(perm.isSuperAdmin()).toBe(true);
    expect(perm.has(ROLE.featureReport)).toBe(true);
    expect(perm.has(ROLE.pipelineLeadView)).toBe(true);
  });

  // the draft button table (ROLE_BUTTONS) against this answer
  it('shows every button to this super-admin, but the sign-in ones that hang under no role', () => {
    const perm = setup(SAMPLE_ROLES);
    expect(hiddenButtons(perm)).toEqual(['LG-LI-MN-01', 'LG-LI-MN-02', 'LG-LI-MN-03']);
  });

  describe('without super_admin, on the roles alone', () => {
    // hidden: the sign-in buttons (no role), and every button the product team has confirmed: those hang under the new names (Pipeline_*) while the
    // answer still has the old CRM_* ones. They are the six of the dashboard (PL-DB-MN-01 … 05, PL-DB-AS-01), the twelve of the prospect list
    // (PL-PR-LS-01 … 12), the six of the opportunity list (PL-OP-LS-01 … 06), the thirty-one of the details of an opportunity (PL-OP-DT-01 … 12,
    // 14 … 32), the save buttons of its change-salesperson and tag popups (PL-OP-AS-01, PL-OP-TG-01), the two of its create popup (PL-OP-NW-01, 02) and the twelve of the contact-activity list (PL-CA-LS-01 … 12) and the save button of its contact popup (PL-CA-AD-01), the three of the letter-of-intent list (PL-IT-LS-01 … 03) and the four of its details (PL-IT-DT-01 … 04), the three of the legal-credit-request list (PL-LR-LS-01 … 03) and the four of its details (PL-LR-DT-01 … 04) and the seven of the loan-agreement pages (PL-LA-LS-01 … 03, PL-LA-DT-01 … 04)
    it('shows the buttons of the roles it holds, and hides those of roles it does not hold (by the name the table uses)', () => {
      const perm = setup(WITHOUT_SUPER_ADMIN);
      expect(hiddenButtons(perm)).toEqual([
        'LG-LI-MN-01',
        'LG-LI-MN-02',
        'LG-LI-MN-03',
        'PL-DB-MN-01',
        'PL-DB-MN-02',
        'PL-DB-MN-03',
        'PL-DB-MN-04',
        'PL-DB-MN-05',
        'PL-DB-AS-01',
        'PL-PR-LS-01',
        'PL-PR-LS-02',
        'PL-PR-LS-03',
        'PL-PR-LS-04',
        'PL-PR-LS-05',
        'PL-PR-LS-06',
        'PL-PR-LS-07',
        'PL-PR-LS-08',
        'PL-PR-LS-09',
        'PL-PR-LS-10',
        'PL-PR-LS-11',
        'PL-PR-LS-12',
        'PL-PR-CR-01',
        'PL-PR-CR-02',
        'PL-PR-CR-03',
        'PL-PR-CR-04',
        'PL-PR-DT-01',
        'PL-PR-DT-02',
        'PL-PR-DT-03',
        'PL-PR-DT-04',
        'PL-PR-DT-05',
        'PL-OP-LS-01',
        'PL-OP-LS-02',
        'PL-OP-LS-03',
        'PL-OP-LS-04',
        'PL-OP-LS-05',
        'PL-OP-LS-06',
        'PL-OP-DT-01',
        'PL-OP-DT-02',
        'PL-OP-DT-03',
        'PL-OP-DT-04',
        'PL-OP-DT-05',
        'PL-OP-DT-06',
        'PL-OP-DT-07',
        'PL-OP-DT-08',
        'PL-OP-DT-09',
        'PL-OP-DT-10',
        'PL-OP-DT-11',
        'PL-OP-DT-12',
        'PL-OP-DT-14',
        'PL-OP-DT-15',
        'PL-OP-DT-16',
        'PL-OP-DT-17',
        'PL-OP-DT-18',
        'PL-OP-DT-19',
        'PL-OP-DT-20',
        'PL-OP-DT-21',
        'PL-OP-DT-22',
        'PL-OP-DT-23',
        'PL-OP-DT-24',
        'PL-OP-DT-25',
        'PL-OP-DT-26',
        'PL-OP-DT-27',
        'PL-OP-DT-28',
        'PL-OP-DT-29',
        'PL-OP-DT-30',
        'PL-OP-DT-31',
        'PL-OP-DT-32',
        'PL-OP-NW-01',
        'PL-OP-NW-02',
        'PL-OP-AS-01',
        'PL-OP-TG-01',
        'PL-CA-LS-01',
        'PL-CA-LS-02',
        'PL-CA-LS-03',
        'PL-CA-LS-04',
        'PL-CA-LS-05',
        'PL-CA-LS-06',
        'PL-CA-LS-07',
        'PL-CA-LS-08',
        'PL-CA-LS-09',
        'PL-CA-LS-10',
        'PL-CA-LS-11',
        'PL-CA-LS-12',
        'PL-CA-AD-01',
        'PL-SC-CL-01',
        'PL-SC-CL-02',
        'PL-SC-CL-03',
        'PL-SC-CL-04',
        'PL-SC-CL-05',
        'PL-SC-CL-06',
        'PL-SC-CL-07',
        'PL-SC-CL-08',
        'PL-SC-LT-01',
        'PL-SC-LT-02',
        'PL-SC-LT-03',
        'PL-SC-LT-04',
        'PL-SC-LT-05',
        'PL-SC-LT-06',
        'PL-SC-LT-07',
        'PL-SC-BD-01',
        'PL-SC-BD-02',
        'PL-SC-BD-03',
        'PL-SC-BD-04',
        'PL-SC-BD-05',
        'PL-SC-BD-06',
        'PL-SC-BD-07',
        'PL-SC-BD-08',
        'PL-SC-AD-01',
        'PL-SC-AD-02',
        'PL-SC-ED-01',
        'PL-SC-ED-02',
        'PL-IT-LS-01',
        'PL-IT-LS-02',
        'PL-IT-LS-03',
        'PL-IT-DT-01',
        'PL-IT-DT-02',
        'PL-IT-DT-03',
        'PL-IT-DT-04',
        'PL-LR-LS-01',
        'PL-LR-LS-02',
        'PL-LR-LS-03',
        'PL-LR-DT-01',
        'PL-LR-DT-02',
        'PL-LR-DT-03',
        'PL-LR-DT-04',
        'PL-LA-LS-01',
        'PL-LA-LS-02',
        'PL-LA-LS-03',
        'PL-LA-DT-01',
        'PL-LA-DT-02',
        'PL-LA-DT-03',
        'PL-LA-DT-04',
        'PL-PA-LS-01',
        'PL-PA-LS-02',
        'PL-PA-LS-03',
        'PL-PA-DT-01',
        'PL-PA-DT-02',
        'PL-PA-DT-03',
        'PL-PA-DT-04',
        'PL-PP-LS-01',
        'PL-PP-LS-02',
        'PL-PP-LS-03',
        'PL-PP-DT-01',
        'PL-PP-DT-02',
        'PL-PP-DT-03',
        'PL-PP-DT-04',
        'PL-SV-LS-01',
        'PL-SV-LS-02',
        'PL-SV-LS-03',
        'PL-SV-DT-01',
        'PL-SV-DT-02',
        'PL-SV-DT-03',
        'PL-SV-DT-04',
        'PL-CP-LS-01',
        'PL-CP-LS-02',
        'PL-CP-LS-03',
        'PL-CP-DT-01',
        'PL-CP-DT-02',
        'PL-CP-DT-03',
        'PL-CP-DT-04',
      ]);
    });

    it('opens what the user holds under the old names', () => {
      const perm = setup(WITHOUT_SUPER_ADMIN);
      expect(perm.isSuperAdmin()).toBe(false);
      for (const key of [
        ROLE.moduleCrm,
        ROLE.moduleChat,
        ROLE.featureLead,
        ROLE.featureProspect,
        ROLE.featureDocument,
        ROLE.leadAssign,
        ROLE.leadAssignSup,
        ROLE.prospectDelete,
        ROLE.documentRvApprove,
      ]) {
        expect(perm.has(key), key).toBe(true);
      }
    });

    it('holds every one of the 21 supporting-document roles', () => {
      const perm = setup(WITHOUT_SUPER_ADMIN);
      for (const prefix of Object.values(SUPPORTING_DOC_ROLE_PREFIX)) {
        for (const action of ['View', 'Create', 'Edit'])
          expect(perm.has(`${prefix}_${action}`), `${prefix}_${action}`).toBe(true);
      }
    });

    it('does not open what the answer leaves out', () => {
      const perm = setup(WITHOUT_SUPER_ADMIN);
      expect(perm.has(ROLE.featureReport)).toBe(false);
      expect(perm.has(ROLE.leadSalesPersonAssign)).toBe(false);
      expect(perm.has(ROLE.chatReply)).toBe(false);
      expect(perm.has(ROLE.pipelineLeadView)).toBe(false);
      expect(perm.hasPrefix('Report_')).toBe(false);
    });
  });
});
