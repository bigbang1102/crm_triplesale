import { describe, expect, it } from 'vitest';
import { ROLE } from '@core/permissions/roles';
import {
  MASK,
  allowedStatuses,
  canSeeLead,
  canSeeQueued,
  canRestoreLead,
  isSuperiorOf,
  keepMasked,
  leadActions,
  leadLevel,
  leadMenuActions,
  maskLead,
  maskedFields,
  needsReason,
  employeeCodeOfOwner,
  ownerCodeOf,
  type LeadViewer,
} from './leads.access';
import type { Lead, LeadForm } from './leads.types';

const viewer = (ownerCode: string, ...keys: string[]): LeadViewer => ({ ownerCode, has: (k) => keys.includes(k) });
const lead = (over: Partial<Lead> = {}): Lead =>
  ({
    id: 1, code: 'LD-1', createdDate: '2026-11-01', status: 'contacting', name: 'ก ข', phoneCode: '+66', phone: '0811111111', email: 'a@b.co', source: 'Facebook',
    ownerCode: 'CS0004', address: '1 ถนน', country: 'ไทย', province: '', district: '', subdistrict: '', postcode: '', taxId: '3120100456789', firstContactDate: '2026-10-01',
    contacts: [], items: [], ...over,
  }) as Lead;

const VIEW = ROLE.pipelineLeadView;
const EDITOR = [VIEW, ROLE.pipelineLeadEdit, ROLE.pipelineLeadClose, ROLE.pipelineLeadTrash, ROLE.pipelineLeadConvertProspect, ROLE.pipelineLeadContactActivityCreate];

describe('who sees a Lead (permission-visibility-design §7)', () => {
  it('should show nothing without Pipeline_Lead_View, even to the owner', () => {
    expect(leadLevel(viewer('CS0004'), lead())).toBe('none');
  });

  it('should let the owner and every superior up the chart write, but not a peer or a junior', () => {
    // CS0004 → CS0003 → CS0001
    expect(leadLevel(viewer('CS0004', VIEW), lead())).toBe('write');
    expect(leadLevel(viewer('CS0003', VIEW), lead())).toBe('write');
    expect(leadLevel(viewer('CS0001', VIEW), lead())).toBe('write');
    expect(leadLevel(viewer('CS0002', VIEW), lead())).toBe('none');
    expect(leadLevel(viewer('CS0004', VIEW), lead({ ownerCode: 'CS0003' }))).toBe('none');
  });

  it('should follow Entity Viewer (read) and Entity Admin (write) across the company', () => {
    expect(leadLevel(viewer('', VIEW, ROLE.viewAll), lead())).toBe('read');
    expect(leadLevel(viewer('', VIEW, ROLE.masterEditAll), lead())).toBe('write');
    expect(leadLevel(viewer('', ROLE.viewAll), lead())).toBe('none');
  });

  it('should show an unowned Lead only to the Wait List members', () => {
    const queued = lead({ ownerCode: '' });
    expect(canSeeLead(viewer('CS0001', VIEW), queued)).toBe(false);
    expect(leadLevel(viewer('CS0001', VIEW, ROLE.pipelineWaitListAccess), queued)).toBe('read');
  });

  it('should walk a graph with several parents without looping', () => {
    expect(isSuperiorOf('CS0001', 'CS0004')).toBe(true);
    expect(isSuperiorOf('CS0004', 'CS0004')).toBe(false);
    expect(isSuperiorOf('CS0004', 'CS0001')).toBe(false);
  });

  it('should map the employee of an account to the owner code of the Lead data', () => {
    expect(ownerCodeOf('E102')).toBe('CS0002');
    expect(ownerCodeOf('E999')).toBe('');
    expect(employeeCodeOfOwner('CS0002')).toBe('E102');
    expect(employeeCodeOfOwner('CS9999')).toBe('');
  });
});

describe('what a user may do with a Lead (flow §3.2, §3.10)', () => {
  it('should need the key of each button and write access', () => {
    expect(leadActions(viewer('CS0004', VIEW), lead())).toMatchObject({ edit: false, trash: false, convert: false, contact: false, status: false });
    expect(leadActions(viewer('CS0004', ...EDITOR), lead())).toMatchObject({ edit: true, trash: true, convert: true, contact: true, status: true });
    expect(leadActions(viewer('', VIEW, ROLE.viewAll, ...EDITOR), lead())).toMatchObject({ edit: false, trash: false, convert: false });
  });

  it('should offer the opportunity button only with Pipeline_Opportunity_Create as well', () => {
    expect(leadActions(viewer('CS0004', ...EDITOR), lead()).opportunity).toBe(false);
    expect(leadActions(viewer('CS0004', ...EDITOR, ROLE.pipelineOpportunityCreate), lead()).opportunity).toBe(true);
  });

  it('should make a converted Lead read-only and keep it out of the trash', () => {
    expect(leadActions(viewer('CS0004', ...EDITOR), lead({ status: 'converted' }))).toMatchObject({ edit: false, trash: false, convert: false, contact: false, status: false });
  });

  it('should let a disqualified Lead only be reopened or trashed', () => {
    const a = leadActions(viewer('CS0004', ...EDITOR), lead({ status: 'disqualified' }));
    expect(a).toMatchObject({ edit: false, convert: false, contact: false, trash: true, status: true });
    expect(allowedStatuses(viewer('CS0004', ...EDITOR), lead({ status: 'disqualified' }))).toEqual(['contacting']);
  });

  it('should only allow the manual status moves of the table, with Close for Disqualified and Edit for the rest', () => {
    const all = viewer('CS0004', ...EDITOR);
    expect(allowedStatuses(all, lead({ status: 'new' }))).toEqual(['disqualified']);
    expect(allowedStatuses(all, lead({ status: 'contacting' }))).toEqual(['inactive', 'disqualified']);
    expect(allowedStatuses(viewer('CS0004', VIEW, ROLE.pipelineLeadEdit), lead({ status: 'contacting' }))).toEqual(['inactive']);
    expect(needsReason('contacting', 'disqualified')).toBe(true);
    expect(needsReason('disqualified', 'contacting')).toBe(true);
    expect(needsReason('contacting', 'inactive')).toBe(false);
  });

  it('should gate create / import / export / contact tab by their own keys', () => {
    expect(leadMenuActions(viewer('', VIEW))).toMatchObject({ create: false, import: false, export: true, contactView: false });
    expect(leadMenuActions(viewer('', VIEW, ROLE.pipelineLeadCreate, ROLE.pipelineLeadContactView))).toMatchObject({ create: true, import: true, export: true, contactView: true });
  });
});

describe('confidential fields (permission-visibility-design §9)', () => {
  const none = viewer('CS0004', VIEW);

  it('should hide phone / email / address, tax id and source without their data keys', () => {
    const masked = maskedFields(none);
    expect(masked).toEqual(['phone', 'email', 'address', 'taxId', 'source']);
    const shown = maskLead(lead(), masked);
    expect(shown).toMatchObject({ phone: MASK, email: MASK, address: MASK, taxId: MASK, source: MASK, name: 'ก ข' });
  });

  it('should show a field with its data key and keep an empty value empty', () => {
    const pdpa = viewer('CS0004', VIEW, ROLE.pipelineLeadCustomerPdpaData);
    expect(maskedFields(pdpa)).toEqual(['taxId', 'source']);
    expect(maskLead(lead({ taxId: '' }), maskedFields(pdpa)).taxId).toBe('');
    expect(maskLead(lead(), maskedFields(pdpa)).phone).toBe('0811111111');
  });

  it('should keep the real value of a masked field when the form is saved', () => {
    const edited: LeadForm = { name: 'ใหม่', phoneCode: '+66', phone: MASK, email: MASK, source: MASK, ownerCode: 'CS0004', address: MASK, country: 'ไทย', province: '', district: '', subdistrict: '', postcode: '', taxId: MASK };
    const saved = keepMasked(edited, lead(), maskedFields(none));
    expect(saved).toMatchObject({ name: 'ใหม่', phone: '0811111111', email: 'a@b.co', taxId: '3120100456789', source: 'Facebook', address: '1 ถนน' });
  });
});

describe('queue and trash permissions (flow §2.4, §3.5, §3.6)', () => {
  const ASSIGN = [VIEW, ROLE.pipelineWaitListAccess, ROLE.pipelineLeadAssign];

  it('should show the queue only with Pipeline_Wait_list_Access and Pipeline_Lead_View', () => {
    expect(leadMenuActions(viewer('CS0002', VIEW)).queue).toBe(false);
    expect(leadMenuActions(viewer('CS0002', ROLE.pipelineWaitListAccess)).queue).toBe(false);
    expect(leadMenuActions(viewer('CS0002', VIEW, ROLE.pipelineWaitListAccess)).queue).toBe(true);
  });

  it('should need Pipeline_Lead_Assign to take or give, and an employee of the chart to take', () => {
    expect(leadMenuActions(viewer('CS0002', VIEW, ROLE.pipelineWaitListAccess))).toMatchObject({ take: false, give: false });
    expect(leadMenuActions(viewer('CS0002', ...ASSIGN))).toMatchObject({ take: true, give: true });
    expect(leadMenuActions(viewer('', ...ASSIGN))).toMatchObject({ take: false, give: true });
  });

  it('should let a queued Lead be seen by queue members only, and do nothing else with it', () => {
    const queued = lead({ ownerCode: '' });
    expect(canSeeQueued(viewer('CS0002', ...ASSIGN), queued)).toBe(true);
    expect(canSeeQueued(viewer('CS0002', VIEW), queued)).toBe(false);
    expect(canSeeQueued(viewer('CS0002', ...ASSIGN), lead())).toBe(false);
    expect(leadActions(viewer('CS0002', ...ASSIGN, ...EDITOR), queued)).toMatchObject({ edit: false, convert: false, changeOwner: false, returnToQueue: false, contact: false });
  });

  it('should offer change-owner and return-to-queue to the owner or a superior with Pipeline_Lead_Change_Assign, for an open Lead only', () => {
    const k = [...EDITOR, ROLE.pipelineLeadChangeAssign];
    expect(leadActions(viewer('CS0004', ...k), lead())).toMatchObject({ changeOwner: true, returnToQueue: true });
    expect(leadActions(viewer('CS0004', ...EDITOR), lead())).toMatchObject({ changeOwner: false, returnToQueue: false });
    expect(leadActions(viewer('CS0004', ...k), lead({ status: 'disqualified' }))).toMatchObject({ changeOwner: false });
    expect(leadActions(viewer('CS0004', ...k), lead({ status: 'converted' }))).toMatchObject({ changeOwner: false });
    expect(leadActions(viewer('CS0002', ...k), lead())).toMatchObject({ changeOwner: false });
  });

  it('should show and restore the trash only to Pipeline_Lead_Trash holders who may see the Lead', () => {
    expect(leadMenuActions(viewer('CS0004', VIEW)).trash).toBe(false);
    expect(leadMenuActions(viewer('CS0004', VIEW, ROLE.pipelineLeadTrash)).trash).toBe(true);
    expect(canRestoreLead(viewer('CS0004', VIEW, ROLE.pipelineLeadTrash), lead())).toBe(true);
    expect(canRestoreLead(viewer('CS0004', VIEW), lead())).toBe(false);
    expect(canRestoreLead(viewer('CS0002', VIEW, ROLE.pipelineLeadTrash), lead())).toBe(false);
  });
});
