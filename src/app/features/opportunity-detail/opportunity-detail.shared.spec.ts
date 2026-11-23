import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedLead } from '@core/mock/crm-seed';
import { resetSharedDb } from '@core/mock/shared-db';
import { createMockLeads, resetMockLeads } from '../opportunities/opportunities.mock';
import { resetMockupForTests, setDatasource } from '@core/mockup/mockup-datasource';
import { createMockLeadDetail, resetMockLeadDetail } from './opportunity-detail.mock';

const post = (path: string, body: Record<string, unknown>): RequestInit => ({ method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

/** what is done on the detail page of an opportunity is seen by the other pages (the shared database) */
describe('closing / forwarding an opportunity, seen by the other pages', () => {
  const detail = createMockLeadDetail({ delayMs: 0 });
  beforeEach(() => resetMockLeadDetail());
  afterEach(() => {
    resetMockupForTests();
    resetMockLeadDetail();
    resetMockLeads();
    resetSharedDb();
  });

  // lead 5 is not one of the leads the mock fails on purpose (n % 7 === 0) and is open in the seed
  const N = 5;
  /** the system closes an opportunity on its entering a step of 100% / 0%: the first step of the first group is made the one for the test */
  const closeBy = async (n: number, probability: number): Promise<Response> => {
    const [step] = (await (await detail.fetch(`board/activity-steps?leadId=${n}&activityGroupId=101`)).json()) as { id: number; name: string }[];
    setDatasource({ 'ref.opportunityDetail': { stepProbability: { [step.name]: probability } } }, true);
    return detail.fetch('board/contact-activities', post('board/contact-activities', { leadId: n, channel: 'line', content: 'ปิดดีล', procedureGroupId: 101, procedureId: step.id }));
  };

  it('should show a lead closed as lost on every page', async () => {
    expect(seedLead(N).status).toBe('ACTIVE');
    const res = await closeBy(N, 0);
    expect(res.status).toBe(200);
    expect(seedLead(N)).toMatchObject({ status: 'LOST', interest: 'LOST' });
  });

  it('should show a lead closed as sold, and leave an ordinary step alone', async () => {
    const [step] = (await (await detail.fetch(`board/activity-steps?leadId=${N}&activityGroupId=101`)).json()) as { id: number }[];
    await detail.fetch('board/contact-activities', post('board/contact-activities', { leadId: N, channel: 'line', content: 'ติดต่อ', procedureGroupId: 101, procedureId: step.id }));
    expect(seedLead(N).status).toBe('ACTIVE');
    await closeBy(N, 100);
    expect(seedLead(N).status).toBe('SUCCESS');
  });

  it('should give the lead to the one it was forwarded to', async () => {
    const before = seedLead(N).ownerCode;
    const target = before === 'E103' ? 1003 + 1 : 1003; // an employee that is not the owner (ids are 1001 + the index of the cast)
    const res = await detail.fetch('board/lead/forward', post('board/lead/forward', { leadId: N, targets: [{ activityGroupId: 0, activityStepId: 0, assigneeEmployeeId: target }] }));
    expect(res.status).toBe(200);
    expect(seedLead(N).ownerCode).not.toBe(before);
  });

  it('should be what the opportunity list shows as closed (one more closed lead than before)', async () => {
    const list = createMockLeads({ delayMs: 0 });
    const lost = async (): Promise<number> => {
      let n = 0;
      for (const id of [31, 32, 33, 34]) {
        const text = JSON.stringify(await (await list.fetch(`/board/leads?viewMode=list&movementTypeId=${id}&showClosed=true&perPage=300`)).json());
        n += (text.match(/"LOST"/g) ?? []).length;
      }
      return n;
    };
    const before = await lost();
    await closeBy(N, 0);
    expect(await lost()).toBe(before + 1);
  });
});
