import { afterEach, describe, expect, it } from 'vitest';
import { isKnownLead, isKnownProspect, seedLead, seedProspect } from '@core/mock/crm-seed';
import { resetSharedDb } from '@core/mock/shared-db';
import { createMockLeads, resetMockLeads } from '../../opportunities/opportunities.mock';
import { createMockProspects } from '../prospects.mock';
import { createMockProspectFormApi, resetMockProspectForm } from './prospect-form.mock';

/** the customer saved in the form is the same customer on the other pages (the shared database) */
describe('a customer saved in the prospect form, seen by the other pages', () => {
  afterEach(() => {
    resetMockProspectForm();
    resetMockLeads();
    resetSharedDb();
  });

  const answerOf = async (res: Response): Promise<unknown> => (await res.json()) as unknown;

  it('should be in the prospect list, with the lead opened for it in the opportunity list', async () => {
    const form = createMockProspectFormApi({ delayMs: 0 });
    const created = JSON.parse(await form.createProspect({ name: 'ทดสอบร่วม ฐานข้อมูล', customerTel: '0812223333', prospectEmail: 'shared@example.com', movementTypeId: 1 })) as { status: number; result: { id: number } };
    expect(created.status).toBe(201);
    const id = created.result.id;
    expect(isKnownProspect(id)).toBe(true);
    expect(seedProspect(id)).toMatchObject({ fullName: 'ทดสอบร่วม ฐานข้อมูล', phone: '081-222-3333', email: 'shared@example.com' });

    const prospects = createMockProspects({ delayMs: 0 });
    const list = JSON.stringify(await answerOf(await prospects.fetch(`/board/prospect-list?searchText=${encodeURIComponent('ทดสอบร่วม')}`)));
    expect(list).toContain('ทดสอบร่วม ฐานข้อมูล');
    // the details the list fetches for the new customer are found (its id is above the ids of the failing-enrich hook)
    expect((await prospects.fetch('/board/prospect-enrich?ids=' + id)).status).toBe(200);

    const opportunities = createMockLeads({ delayMs: 0 });
    let found = false;
    for (const movementTypeId of [31, 32, 33, 34]) {
      const text = JSON.stringify(await answerOf(await opportunities.fetch(`/board/leads?viewMode=list&movementTypeId=${movementTypeId}&perPage=50&search=${encodeURIComponent('ทดสอบร่วม')}`)));
      found = found || text.includes('ทดสอบร่วม ฐานข้อมูล');
    }
    expect(found).toBe(true);
    expect(isKnownLead(7000)).toBe(true);
  });

  it('should show an edit of the customer on the prospect list', async () => {
    const form = createMockProspectFormApi({ delayMs: 0 });
    await form.updateProspect(3, { name: 'แก้ไข แล้ว', customerTel: '0899990000' });
    const prospects = createMockProspects({ delayMs: 0 });
    const list = JSON.stringify(await answerOf(await prospects.fetch(`/board/prospect-list?searchText=${encodeURIComponent('แก้ไข แล้ว')}`)));
    expect(list).toContain('แก้ไข แล้ว');
  });

  it('should keep a customer made with the new create call (the one the form uses), with the lead of the person chosen', async () => {
    const form = createMockProspectFormApi({ delayMs: 0 });
    const answer = JSON.parse(await form.createProspectV2({ mode: 'RELEASE', customer: { name: 'ใหม่', lastname: 'สองสาย', mainPhone: '0877776666', email: 'v2@example.com' }, assignment: { destination: 'EMPLOYEE', responsibleEmployeeId: 'r-1' } }, 'key-1')) as { status: number; result: { id: string; code: string } };
    expect(answer.status).toBe(201);
    const id = Number(answer.result.id);
    expect(seedProspect(id)).toMatchObject({ fullName: 'ใหม่ สองสาย', phone: '087-777-6666', email: 'v2@example.com', code: answer.result.code });
    expect(isKnownLead(7000)).toBe(true);
    expect(seedLead(7000)).toMatchObject({ prospectId: id, ownerCode: 'E102', status: 'ACTIVE' });
  });

  it('should keep a draft as a customer without a lead', async () => {
    const form = createMockProspectFormApi({ delayMs: 0 });
    const answer = JSON.parse(await form.createProspectV2({ mode: 'DRAFT', customer: { name: 'ร่าง', lastname: '' } }, 'key-2')) as { result: { id: string } };
    expect(isKnownProspect(Number(answer.result.id))).toBe(true);
    expect(isKnownLead(7000)).toBe(false);
  });
});
