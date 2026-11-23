import { describe, expect, it } from 'vitest';
import { BACKEND_ROLE_LIST } from '../testing/backend-role-list';
import { KNOWN_ROLES } from './all-roles';
import { PIPELINE_DOC_ROLES, ROLE, SUPPORTING_DOC_ROLE_PREFIX, pipelineDocRole } from './roles';

/** the list of roles the backend handed over on 2026-10-29 (core/testing/backend-role-list.ts) */
describe('the backend role list of 2026-10-29', () => {
  it('has 88 roles, none twice, each made of letters, digits and underscores only', () => {
    expect(BACKEND_ROLE_LIST).toHaveLength(88);
    expect(new Set(BACKEND_ROLE_LIST).size).toBe(88);
    expect(BACKEND_ROLE_LIST.filter((r) => !/^[A-Za-z0-9_]+$/.test(r))).toEqual([]);
  });

  it('is entirely known to the app (a role added to the list but not to ROLE shows up here)', () => {
    const known = new Set<string>(KNOWN_ROLES);
    expect(BACKEND_ROLE_LIST.filter((r) => !known.has(r))).toEqual([]);
  });

  it('has the 21 Pipeline_Document_* roles: the old CRM_Document_* ones under their new names', () => {
    const inList = BACKEND_ROLE_LIST.filter((r) => r.startsWith('Pipeline_Document_'));
    expect(inList).toHaveLength(21);
    expect([...PIPELINE_DOC_ROLES].sort()).toEqual([...inList].sort());
    expect(pipelineDocRole('loan-agreement', 'Edit')).toBe('Pipeline_Document_LoanAgreement_Edit');
    for (const prefix of Object.values(SUPPORTING_DOC_ROLE_PREFIX)) {
      for (const action of ['View', 'Create', 'Edit']) {
        const old = `${prefix}_${action}`;
        expect(inList, old).toContain(old.replace('CRM_Document_', 'Pipeline_Document_'));
      }
    }
  });

  it('renamed Customer_Support from Lead to Opportunity, and the three new chat roles are in ROLE', () => {
    expect(BACKEND_ROLE_LIST).toContain(ROLE.pipelineCustomerSupportOpportunityAllViewOnly);
    expect(BACKEND_ROLE_LIST).not.toContain('Pipeline_Customer_Support_Lead_All_View_Only');
    expect([ROLE.chatAssigner, ROLE.chatChangeAssigned, ROLE.chatRevokeAssigned]).toEqual([
      'Chat_Assigner',
      'Chat_Change_Assigned',
      'Chat_Revoke_Assigned',
    ]);
  });
});
