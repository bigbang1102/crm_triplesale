import { afterEach, describe, expect, it } from 'vitest';
import { leadPatchOf, prospectPatchOf, resetSharedDb } from '@core/mock/shared-db';
import { ROLE } from '@core/permissions/roles';
import { MASK, allowedStatuses, isTransitionAllowed, leadActions, maskLead, maskedFields, type LeadViewer } from './leads.access';
import { checkImport, parseCsv, phoneKey } from './leads.csv';
import { LeadsMock } from './leads.mock';
import type { Lead, LeadForm, LeadQuery, LeadStatus } from './leads.types';

/**
 * The cases of docs/test-cases/lead-test-cases.md (LD-Txxx) that are checked by a unit test of the mock and the access rules, and were not before.
 * The rule behind each is in lead-prospect-opportunity-flow.md (section 2 and 3).
 */
const ALL: LeadQuery = { status: '', search: '', sort: 'newest', filter: { sources: [], ownerCode: '', dateFrom: '', dateTo: '' } };
const form = (over: Partial<LeadForm> = {}): LeadForm => ({
  name: 'ทดสอบ เคส', phoneCode: '+66', phone: '0877770001', email: 'case@example.com', source: 'Facebook', ownerCode: 'CS0001', address: '1 ถนนทดสอบ', country: 'ไทย', province: '', district: '', subdistrict: '', postcode: '', taxId: '3120100456789', ...over,
});
const viewer = (ownerCode: string, ...keys: string[]): LeadViewer => ({ ownerCode, has: (k) => keys.includes(k) });
const OWNER_KEYS = [
  ROLE.pipelineLeadView, ROLE.pipelineLeadEdit, ROLE.pipelineLeadClose, ROLE.pipelineLeadTrash, ROLE.pipelineLeadConvertProspect, ROLE.pipelineLeadContactActivityCreate,
  ROLE.pipelineScheduleAppointmentAddEdit, ROLE.pipelineScheduleTaskAddEdit, ROLE.pipelineLeadChangeAssign,
];
const firstOf = (m: LeadsMock, status: LeadStatus, owned = true): Lead => {
  const lead = m.list({ ...ALL, status }).rows.find((r) => (r.ownerCode !== '') === owned);
  if (!lead) throw new Error(`the seed has no ${status} lead (owned: ${owned})`);
  return lead;
};

describe('the Lead menu — cases of the matrix (list, search, filter, counters)', () => {
  afterEach(() => resetSharedDb());

  it('LD-T011/T012 should list the leads of a status tab, and count after the search and the filter but before the tab', () => {
    const m = new LeadsMock();
    for (const status of ['new', 'inactive', 'disqualified', 'converted'] as const) {
      const { rows, counts } = m.list({ ...ALL, status });
      expect(rows.length).toBe(counts[status]);
      expect(rows.every((r) => r.status === status)).toBe(true);
    }
    const first = m.list(ALL).rows[0];
    const searched = m.list({ ...ALL, status: first.status, search: first.name });
    expect(searched.counts.all).toBeLessThan(95); // the counters follow the search …
    expect(searched.counts[first.status]).toBeGreaterThan(0); // … and still count the other tabs of what was found
  });

  it('LD-T014/T015/T016 should search by name (any case, trimmed), by the number of the lead and by the e-mail', () => {
    const m = new LeadsMock();
    const lead = m.list(ALL).rows.find((r) => r.email !== '')!;
    expect(m.list({ ...ALL, search: `  ${lead.name.toUpperCase()}  ` }).rows.map((r) => r.id)).toContain(lead.id);
    expect(m.list({ ...ALL, search: lead.code }).rows.map((r) => r.id)).toContain(lead.id);
    expect(m.list({ ...ALL, search: lead.email }).rows.map((r) => r.id)).toContain(lead.id);
  });

  it('LD-T019/T020/T021/T022/T023 should filter by several sources (or), by owner, by the date of creation (both ends in) and by all of them together (and)', () => {
    const m = new LeadsMock();
    const sources = m.sources();
    expect(sources).toEqual([...new Set(sources)].sort());
    expect(m.list({ ...ALL, filter: { ...ALL.filter, sources: sources.slice(0, 2) } }).rows.every((r) => sources.slice(0, 2).includes(r.source))).toBe(true);
    const owner = m.list(ALL).rows.find((r) => r.ownerCode !== '')!.ownerCode;
    expect(m.list({ ...ALL, filter: { ...ALL.filter, ownerCode: owner } }).rows.every((r) => r.ownerCode === owner)).toBe(true);
    const day = m.list(ALL).rows[3].createdDate;
    const onDay = m.list({ ...ALL, filter: { ...ALL.filter, dateFrom: day, dateTo: day } }).rows;
    expect(onDay.length).toBeGreaterThan(0);
    expect(onDay.every((r) => r.createdDate === day)).toBe(true);
    const together = m.list({ ...ALL, filter: { sources: [onDay[0].source], ownerCode: onDay[0].ownerCode, dateFrom: day, dateTo: day } }).rows;
    expect(together.every((r) => r.source === onDay[0].source && r.ownerCode === onDay[0].ownerCode && r.createdDate === day)).toBe(true);
  });
});

describe('the Lead menu — cases of the matrix (create, edit, status, contact)', () => {
  afterEach(() => resetSharedDb());

  it('LD-T050/T051 should number a new lead LD-P26-nnnnn, start it as New with the first contact on the day of creation and nothing under it', () => {
    const m = new LeadsMock();
    const a = m.create(form({ phone: '0877770002' }), '2026-11-21');
    const b = m.create(form({ phone: '0877770003' }), '2026-11-21');
    expect(a.code).toMatch(/^LD-P26-\d{5}$/);
    expect(b.id).toBe(a.id + 1);
    expect(Number(b.code.slice(-5))).toBe(Number(a.code.slice(-5)) + 1);
    expect(a).toMatchObject({ status: 'new', firstContactDate: '2026-11-21', contacts: [], items: [] });
  });

  it('LD-T087 should keep the code, the status, the date and what is under the lead when it is edited', () => {
    const m = new LeadsMock();
    const lead = firstOf(m, 'contacting');
    const edited = m.update(lead.id, form({ name: 'ชื่อใหม่', phone: lead.phone }))!;
    expect(edited.name).toBe('ชื่อใหม่');
    expect(edited.code).toBe(lead.code);
    expect(edited.status).toBe(lead.status);
    expect(edited.createdDate).toBe(lead.createdDate);
    expect(edited.contacts).toEqual(lead.contacts);
    expect(edited.items).toEqual(lead.items);
    expect(edited.history).toEqual(lead.history);
  });

  it('LD-T100/T103 should let Inactive go to Contacting or Disqualified, and let nothing go back to New', () => {
    expect(isTransitionAllowed('inactive', 'contacting')).toBe(true);
    expect(isTransitionAllowed('inactive', 'disqualified')).toBe(true);
    for (const from of ['new', 'contacting', 'inactive', 'disqualified', 'converted'] as const) expect(isTransitionAllowed(from, 'new')).toBe(false);
    expect(isTransitionAllowed('converted', 'contacting')).toBe(false);
  });

  it('LD-T124/T125/T129 should wake an Inactive lead on a contact note, put the newest note first, and ignore a note on a lead in the trash', () => {
    const m = new LeadsMock();
    const lead = firstOf(m, 'inactive');
    m.addContact(lead.id, 'callOut', 'โทรครั้งแรก', '2026-11-21 09:00', 'CS0001');
    m.addContact(lead.id, 'note', 'บันทึกที่สอง', '2026-11-21 09:05', 'CS0001');
    const after = m.get(lead.id)!;
    expect(after.status).toBe('contacting');
    expect(after.contacts.map((c) => c.text).slice(0, 2)).toEqual(['บันทึกที่สอง', 'โทรครั้งแรก']);
    expect(m.remove(lead.id, 'CS0001', '2026-11-21 10:00')).toBe(true);
    m.addContact(lead.id, 'note', 'หลังลบ', '2026-11-21 10:05', 'CS0001');
    expect(m.getTrashed(lead.id)!.contacts.some((c) => c.text === 'หลังลบ')).toBe(false);
  });

  it('LD-T127/T140 should not take a contact note, an appointment or a task on a Disqualified lead (it can only be viewed, reopened or trashed)', () => {
    const m = new LeadsMock();
    const lead = firstOf(m, 'disqualified');
    const before = m.get(lead.id)!;
    m.addContact(lead.id, 'note', 'ไม่ควรลง', '2026-11-21 09:00', 'CS0001');
    m.addItem(lead.id, { kind: 'task', title: 'ไม่ควรมี', detail: '', date: '2026-11-22', time: '', allDay: true, status: 'doing' });
    const after = m.get(lead.id)!;
    expect(after.contacts).toEqual(before.contacts);
    expect(after.items).toEqual(before.items);
    m.addContact(lead.id, 'note', 'เหตุผล: ลูกค้าไม่สนใจ', '2026-11-21 09:01', 'CS0001', true); // the reason of a status change is written by the system
    expect(m.get(lead.id)!.contacts[0].text).toBe('เหตุผล: ลูกค้าไม่สนใจ');
    expect(m.get(lead.id)!.status).toBe('disqualified');
    const actions = leadActions(viewer('CS0001', ...OWNER_KEYS), { ownerCode: lead.ownerCode || 'CS0001', status: 'disqualified' });
    expect(actions).toMatchObject({ contact: false, appointment: false, task: false, edit: false, convert: false, trash: true });
  });
});

describe('the Lead menu — cases of the matrix (queue, hands, trash)', () => {
  afterEach(() => resetSharedDb());

  it('LD-T113 should give nobody — not even an administrator — a button that works on a lead in the queue except trash (LD-20)', () => {
    const admin = viewer('', ROLE.pipelineLeadView, ROLE.transactionEditAll, ...OWNER_KEYS);
    const actions = leadActions(admin, { ownerCode: '', status: 'new' });
    expect(actions).toMatchObject({ edit: false, convert: false, contact: false, appointment: false, task: false, status: false, changeOwner: false, returnToQueue: false });
    expect(allowedStatuses(admin, { ownerCode: '', status: 'new' })).toEqual([]);
  });

  it('LD-T166/T167/T174/T175/T180 should hand a lead out of the queue once, refuse a hand-over with nobody, refuse to move a Disqualified or queued lead, and take the rights of the old owner at once', () => {
    const m = new LeadsMock();
    const queued = m.list({ ...ALL, scope: 'queue' }).rows.find((r) => r.ownerCode === '' && (r.status === 'new' || r.status === 'contacting' || r.status === 'inactive'))!;
    expect(queued, 'the seed has leads in the queue').toBeDefined();
    expect(m.assign(queued.id, 'give', '', 'CS0001', '2026-11-21 09:00')).toBeUndefined();
    expect(m.assign(queued.id, 'give', 'CS0002', 'CS0001', '2026-11-21 09:00')?.ownerCode).toBe('CS0002');
    expect(m.assign(queued.id, 'take', 'CS0003', 'CS0003', '2026-11-21 09:01')).toBeUndefined(); // somebody has it already
    expect(m.returnToQueue(queued.id, 'CS0002', '2026-11-21 09:02', '')).toBeUndefined(); // a reason is needed
    const disqualified = firstOf(m, 'disqualified');
    expect(m.assign(disqualified.id, 'change', 'CS0003', 'CS0001', '2026-11-21 09:03')).toBeUndefined();
    expect(m.returnToQueue(disqualified.id, 'CS0001', '2026-11-21 09:03', 'เหตุผล')).toBeUndefined();
    // an owner who is not above the new one in the chart (CS0001 is above everybody, so it would still be its head)
    const owned = m.list(ALL).rows.find((r) => ['new', 'contacting', 'inactive'].includes(r.status) && ['CS0002', 'CS0004'].includes(r.ownerCode))!;
    expect(owned, 'the seed has such a lead').toBeDefined();
    const former = viewer(owned.ownerCode, ...OWNER_KEYS);
    expect(leadActions(former, owned).edit).toBe(true);
    const moved = m.assign(owned.id, 'change', 'CS0003', owned.ownerCode, '2026-11-21 09:04')!;
    expect(leadActions(former, moved).edit).toBe(false);
    expect(moved.history!.at(-1)).toMatchObject({ action: 'change', fromCode: owned.ownerCode });
  });

  it('LD-T194/T197/T200 should note who put a lead in the trash and when, keep what is under it, and refuse to restore it over a live lead with the same phone', () => {
    const m = new LeadsMock();
    const lead = firstOf(m, 'contacting');
    expect(m.remove(lead.id, 'CS0001', '2026-11-21 10:00')).toBe(true);
    expect(m.getTrashed(lead.id)).toMatchObject({ trashed: true, trashedAt: '2026-11-21', trashedBy: 'CS0001', contacts: lead.contacts, items: lead.items });
    const twin = m.create(form({ phone: lead.phone }), '2026-11-21');
    expect(m.restore(lead.id, 'CS0001', '2026-11-21 10:05')).toBe('duplicate');
    expect(m.remove(twin.id, 'CS0001', '2026-11-21 10:06')).toBe(true);
    expect(m.restore(lead.id, 'CS0001', '2026-11-21 10:07')).toBe('ok');
    expect(m.get(lead.id)).toMatchObject({ contacts: lead.contacts, items: lead.items });
  });

  it('LD-T197 should not count a Disqualified lead as a twin when restoring', () => {
    const m = new LeadsMock();
    const lead = firstOf(m, 'contacting');
    const other = firstOf(m, 'disqualified');
    m.update(other.id, form({ phone: lead.phone, name: other.name }));
    expect(m.remove(lead.id, 'CS0001', '2026-11-21 10:00')).toBe(true);
    expect(m.restore(lead.id, 'CS0001', '2026-11-21 10:01')).toBe('ok');
  });
});

describe('the Lead menu — cases of the matrix (secret fields, import, convert)', () => {
  afterEach(() => resetSharedDb());

  it('LD-T234/T235/T237/T238 should close only the fields of the key that is missing, and leave the lead it was made from as it was', () => {
    const lead = { ...new LeadsMock().list(ALL).rows[0] };
    const noCritical = viewer('CS0001', ROLE.pipelineLeadView, ROLE.pipelineLeadCustomerPdpaData, ROLE.pipelineLeadCompanyStrategicData);
    expect(maskedFields(noCritical)).toEqual(['taxId']);
    const noStrategic = viewer('CS0001', ROLE.pipelineLeadView, ROLE.pipelineLeadCustomerPdpaData, ROLE.pipelineLeadCustomerCriticalData);
    expect(maskedFields(noStrategic)).toEqual(['source']);
    const masked = maskLead({ ...lead, taxId: '3120100456789' }, maskedFields(noCritical));
    expect(masked.taxId).toBe(MASK);
    expect(masked.phone).toBe(lead.phone);
    expect(lead.taxId).not.toBe(MASK); // the lead it was made from is the same
  });

  it('LD-T080 should not use 0000 (a phone that was not given) to look for a duplicate: not in a restore, not in an import', () => {
    expect(phoneKey('0000')).toBe('');
    expect(phoneKey('00000')).toBe('');
    expect(phoneKey('0812345678')).not.toBe('');
    const rows = checkImport([['ชื่อ', 'นามสกุล', 'เบอร์โทร'], ['ก', 'ข', '0000'], ['ค', 'ง', '0000']], [{ phone: '0000' }]);
    expect(rows.map((r) => r.state)).toEqual(['noPhone', 'noPhone']);
  });

  it('LD-T249/T252/T253 should read a file with missing columns and spaces, import only the new rows with the name, source, owner and status asked for', () => {
    const m = new LeadsMock();
    const rows = checkImport(parseCsv('ชื่อ,นามสกุล,เบอร์โทร,อีเมล,ที่อยู่\n สมชาย , ใจดี ,0899991111\nสมหญิง,,0899992222,a@b.co,\n,,'), m.list(ALL).rows);
    expect(rows.slice(0, 2).map((r) => r.state)).toEqual(['new', 'new']);
    expect(checkImport([['ก', 'ข', '']], []).map((r) => r.state)).toEqual(['noPhone']);
    expect(m.importRows(rows, 'Import', 'CS0002', '2026-11-21')).toBe(2);
    const added = m.list({ ...ALL, search: '0899991111' }).rows[0];
    expect(added).toMatchObject({ name: 'สมชาย ใจดี', source: 'Import', ownerCode: 'CS0002', status: 'new' });
  });

  it('LD-T271/T277 should refuse to convert a Disqualified lead, and note who converted it, to whom and when', () => {
    const m = new LeadsMock();
    expect(m.convert(firstOf(m, 'disqualified').id, { salesLine: '', team: '', salesPerson: '', ownerCode: 'CS0001' }, '2026-11-21', 'CS0001')).toBeUndefined();
    const lead = firstOf(m, 'contacting');
    const prospectId = m.convert(lead.id, { salesLine: 'a', team: 'b', salesPerson: 'c', ownerCode: 'CS0002' }, '2026-11-21', 'CS0003');
    expect(prospectId).toBeGreaterThan(0);
    expect(m.get(lead.id)).toMatchObject({ status: 'converted', prospectId, convertedAt: '2026-11-21', convertedBy: 'CS0003', convertedOwner: 'CS0002', contacts: lead.contacts });
  });

  it('LD-T283/T284 should hand the owner chosen at the conversion to the prospect and to the opportunity as the employee the shared database knows', () => {
    const m = new LeadsMock();
    const lead = firstOf(m, 'contacting');
    const prospectId = m.convert(lead.id, { salesLine: '', team: '', salesPerson: '', ownerCode: 'CS0002' }, '2026-11-21', 'CS0003')!;
    expect(prospectPatchOf(prospectId)?.ownerCode).toBe('E102');
    const other = firstOf(m, 'inactive');
    const made = m.createOpportunity(other.id, { salesLine: '', team: '', salesPerson: '', ownerCode: 'CS0002' }, '2026-11-21', 'CS0003')!;
    expect(leadPatchOf(made.opportunityId)?.ownerCode).toBe('E102');
    expect(prospectPatchOf(made.prospectId)?.ownerCode).toBe('E102');
  });

  it('LD-T081 should find the active leads with the same phone (written in any way) for the warning, and none for 0000, a Disqualified lead or one in the trash', () => {
    const m = new LeadsMock();
    const live = firstOf(m, 'contacting');
    expect(m.duplicatesOf(live.phone).map((l) => l.id)).toContain(live.id);
    expect(m.duplicatesOf(`+66 ${live.phone.replace(/^0/, '')}`).map((l) => l.id)).toContain(live.id);
    expect(m.duplicatesOf(live.phone, live.id).map((l) => l.id)).not.toContain(live.id);
    expect(m.duplicatesOf('0000')).toEqual([]);
    const disqualified = firstOf(m, 'disqualified');
    expect(m.duplicatesOf(disqualified.phone).map((l) => l.id)).not.toContain(disqualified.id);
    m.remove(live.id, 'CS0001', '2026-11-21 10:00');
    expect(m.duplicatesOf(live.phone).map((l) => l.id)).not.toContain(live.id);
  });
});
