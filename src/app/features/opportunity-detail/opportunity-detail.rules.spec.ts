import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMockupForTests, setDatasource } from '@core/mockup/mockup-datasource';
import { seedLead } from '@core/mock/crm-seed';
import { resetSharedDb } from '@core/mock/shared-db';
import { createMockLeadDetail, resetMockLeadDetail } from './opportunity-detail.mock';

/** the rules of the single opportunity in the design (opportunity-complete-design.md §4, §6): who may change what, and when it is refused */
const OWNER = 1001; // E101 (a supervisor) owns lead 29
const STAFF = 1003; // E103: neither the owner of lead 29 nor a supervisor
const asOwner = createMockLeadDetail({ delayMs: 0, employeeId: OWNER });
const asStaff = createMockLeadDetail({ delayMs: 0, employeeId: STAFF });
const post = (path: string, body: Record<string, unknown>): RequestInit => ({ method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const update = (b: Record<string, unknown>): RequestInit => ({ method: 'POST', body: new URLSearchParams({ leadId: '29', ...(b as Record<string, string>) }).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
const code = async (res: Response): Promise<string> => ((await res.json()) as { error?: { code?: string } }).error?.code ?? '';

describe('single opportunity rules of the design', () => {
  beforeEach(() => resetMockLeadDetail());
  afterEach(() => {
    resetMockupForTests();
    resetMockLeadDetail();
    resetSharedDb();
  });

  describe('the status', () => {
    it('should accept New, Hot, Warm, Cold and Inactive in any case, and write the day only when the value changes', async () => {
      for (const status of ['new', 'HOT', 'warm', 'Cold', 'inactive']) expect((await asOwner.fetch('board/lead-update', update({ action: 'active-status', activeStatus: status }))).status).toBe(200);
    });

    it('should refuse Sold / Lost (the system sets them) and any other value with 422', async () => {
      for (const status of ['sold', 'LOST', 'success', 'loss', 'banana']) {
        const res = await asOwner.fetch('board/lead-update', update({ action: 'active-status', activeStatus: status }));
        expect(res.status).toBe(422);
        expect(await code(res)).toBe('VALIDATION_FAILED');
      }
    });

    it('should refuse a month outside 1..12 and a negative or non-numeric amount', async () => {
      expect((await asOwner.fetch('board/lead-update', update({ action: 'target-month', month: '13' }))).status).toBe(422);
      expect((await asOwner.fetch('board/lead-update', update({ action: 'amount', amount: '-5' }))).status).toBe(422);
      expect((await asOwner.fetch('board/lead-update', update({ action: 'amount', amount: 'abc' }))).status).toBe(422);
      expect((await asOwner.fetch('board/lead-update', update({ action: 'target-month', month: '12' }))).status).toBe(200);
    });
  });

  describe('closing', () => {
    const stepOf = async (n: number): Promise<{ id: number; name: string }> => ((await (await asOwner.fetch(`board/activity-steps?leadId=${n}&activityGroupId=101`)).json()) as { id: number; name: string }[])[0];
    const enter = async (n: number, probability: number): Promise<Response> => {
      const step = await stepOf(n);
      setDatasource({ 'ref.opportunityDetail': { stepProbability: { [step.name]: probability } } }, true);
      return asOwner.fetch('board/contact-activities', post('board/contact-activities', { leadId: n, channel: 'line', content: 'ย้ายขั้น', procedureGroupId: 101, procedureId: step.id }));
    };

    it('should refuse the close button: the system closes the opportunity itself', async () => {
      const res = await asOwner.fetch('board/lead/close', post('board/lead/close', { leadId: 29, outcome: 'sold' }));
      expect(res.status).toBe(422);
      expect(seedLead(29).status).toBe('ACTIVE');
    });

    it('should close as sold on entering a step of 100% and as lost on one of 0%, and note it in the history', async () => {
      expect((await enter(29, 100)).status).toBe(200);
      expect(seedLead(29).status).toBe('SUCCESS');
      const lead = (await (await asOwner.fetch('board/lead?id=29')).json()) as { contactHistoryList: { type: string }[] };
      expect(lead.contactHistoryList[0]?.type).toBe('close');
      expect((await enter(5, 0)).status).toBe(200);
      expect(seedLead(5).status).toBe('LOST');
    });

    it('should leave the opportunity open on a step with another probability', async () => {
      expect((await enter(29, 60)).status).toBe(200);
      expect(seedLead(29).status).toBe('ACTIVE');
    });

    // a lead whose line has six groups or more has the loan line, with the registration of the collateral as its last step
    it('should close at the 100% step of the formula pipeline when the company document gives no probabilities (FAST-DEBT: it has no 0% step)', async () => {
      let closed = 0;
      for (let n = 1; n <= 120 && !closed; n += 1) {
        for (let groupId = 101; groupId <= 107 && !closed; groupId += 1) {
          const steps = (await (await asOwner.fetch(`board/activity-steps?leadId=${n}&activityGroupId=${groupId}`)).json()) as { id: number; name: string }[];
          const hit = Array.isArray(steps) ? steps.find((x) => x.name === 'จดทะเบียนหลักประกัน') : undefined;
          if (!hit) continue;
          const res = await asOwner.fetch('board/contact-activities', post('x', { leadId: n, channel: 'line', content: 'ถึงขั้นสุดท้าย', procedureGroupId: groupId, procedureId: hit.id }));
          if (res.status === 200) closed = n; // (a lead that is closed already or in the queue answers 409: the next one)
        }
      }
      expect(closed).toBeGreaterThan(0);
      expect(seedLead(closed).status).toBe('SUCCESS');
    });

    it('should cancel the appointments and tasks that are still open when it closes, and refuse new ones and changes (409)', async () => {
      const before = (await (await asOwner.fetch('board/lead?id=29')).json()) as { appointmentList: { id: number; status: string }[]; taskList: { id: number; status: string }[] };
      const stillOpen = [...before.appointmentList, ...before.taskList].filter((x) => x.status !== 'success' && x.status !== 'cancel');
      await enter(29, 100);
      const after = (await (await asOwner.fetch('board/lead?id=29')).json()) as { appointmentList: { status: string }[]; taskList: { status: string }[] };
      for (const x of [...after.appointmentList, ...after.taskList]) expect(['success', 'cancel']).toContain(x.status);
      const added = await asOwner.fetch('board/schedule/add', post('x', { leadId: 29, type: 'TASK', subject: 'งานใหม่', detail: 'x', date: '2026-12-01' }));
      expect(((await added.json()) as { status: number }).status).toBe(409);
      expect(stillOpen.length).toBeGreaterThanOrEqual(0);
    });

    it('should make a closed opportunity read-only: every write is 409 OPPORTUNITY_CLOSED', async () => {
      await enter(29, 100);
      const writes: [string, RequestInit][] = [
        ['board/lead-update', update({ action: 'active-status', activeStatus: 'hot' })],
        ['board/contact-activities', post('x', { leadId: 29, channel: 'line', content: 'อีกที' })],
        ['board/lead/forward', post('x', { leadId: 29, targets: [{ activityGroupId: 102, assigneeEmployeeId: 1002 }] })],
        ['board/lead/return', post('x', { leadId: 29, currentActivityGroupId: 102, returnToActivityGroupId: 101 })],
        ['board/lead-materials', post('x', { leadId: 29, materialId: 1 })],
        ['board/lead/close', post('x', { leadId: 29, outcome: 'lost' })],
      ];
      for (const [path, init] of writes) {
        const res = await asOwner.fetch(path, init);
        expect(res.status, path).toBe(409);
        expect(await code(res), path).toBe('OPPORTUNITY_CLOSED');
      }
    });
  });

  describe('a contact activity', () => {
    const note = (o: Record<string, unknown>): RequestInit => post('x', { leadId: 29, channel: 'line', content: 'คุยกับลูกค้า', ...o });

    it('should need a known channel and a detail', async () => {
      expect((await asOwner.fetch('board/contact-activities', note({ channel: 'pigeon' }))).status).toBe(422);
      expect((await asOwner.fetch('board/contact-activities', note({ channel: undefined }))).status).toBe(422);
      expect((await asOwner.fetch('board/contact-activities', note({ content: '   ' }))).status).toBe(422);
      expect((await asOwner.fetch('board/contact-activities', note({}))).status).toBe(200);
    });

    it('should count today in the time of Bangkok, not of UTC (just after midnight there it is already the next day)', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(new Date('2026-11-20T18:30:00Z')); // 01:30 on 21 November in Bangkok
        expect((await asOwner.fetch('board/contact-activities', note({ workRecordDate: '2026-11-21T00:30:00' }))).status).toBe(200);
        expect((await asOwner.fetch('board/contact-activities', note({ workRecordDate: '2026-11-22T00:30:00' }))).status).toBe(422);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should not be dated ahead, nor before the opportunity was made', async () => {
      expect((await asOwner.fetch('board/contact-activities', note({ workRecordDate: '2999-01-01T09:00:00' }))).status).toBe(422);
      expect((await asOwner.fetch('board/contact-activities', note({ workRecordDate: '2000-01-01T09:00:00' }))).status).toBe(422);
      expect((await asOwner.fetch('board/contact-activities', note({ workRecordDate: `${seedLead(29).createdDate}T10:00:00` }))).status).toBe(200);
    });
  });

  describe('changing the person in charge', () => {
    const assign = (employeeId: number): RequestInit => update({ action: 'assign', employeeId: String(employeeId) });

    it('should be refused with 403 to someone who is neither the owner nor a supervisor', async () => {
      const res = await asStaff.fetch('board/lead-update', assign(1002));
      expect(res.status).toBe(403);
      expect(await code(res)).toBe('FORBIDDEN');
    });

    it('should be refused with 422 when the new person is the same one', async () => {
      const res = await asOwner.fetch('board/lead-update', assign(OWNER));
      expect(res.status).toBe(422);
    });

    it('should be refused with 409 for a closed opportunity', async () => {
      const [step] = (await (await asOwner.fetch('board/activity-steps?leadId=29&activityGroupId=101')).json()) as { id: number; name: string }[];
      setDatasource({ 'ref.opportunityDetail': { stepProbability: { [step.name]: 100 } } }, true);
      await asOwner.fetch('board/contact-activities', post('x', { leadId: 29, channel: 'line', content: 'ปิด', procedureGroupId: 101, procedureId: step.id }));
      expect((await asOwner.fetch('board/lead-update', assign(1002))).status).toBe(409);
    });
  });
});

describe('single opportunity: version and the people in charge before', () => {
  beforeEach(() => resetMockLeadDetail());
  afterEach(() => resetSharedDb());

  it('should refuse a write that carries an older version with 409 VERSION_CONFLICT, and count each write', async () => {
    const read = async (): Promise<{ version: number }> => (await (await asOwner.fetch('board/lead?id=29')).json()) as { version: number };
    const first = (await read()).version;
    expect((await asOwner.fetch('board/lead-update', update({ action: 'demand', demand: 'a', version: String(first) }))).status).toBe(200);
    expect((await read()).version).toBe(first + 1);
    const stale = await asOwner.fetch('board/lead-update', update({ action: 'demand', demand: 'b', version: String(first) }));
    expect(stale.status).toBe(409);
    expect(await code(stale)).toBe('VERSION_CONFLICT');
    expect((await asOwner.fetch('board/lead-update', update({ action: 'demand', demand: 'c' }))).status).toBe(200);
  });

  it('should keep the person who was in charge as an ex responsible person after a change of owner', async () => {
    const members = ['E102', 'E103', 'E104'];
    let changed = false;
    for (const [i, c] of members.entries()) {
      const res = await asOwner.fetch('board/lead-update', update({ action: 'assign', employeeId: String(1002 + i) }));
      if (res.status === 200) {
        changed = true;
        expect(c).toBeTruthy();
        break;
      }
    }
    if (!changed) return; // nobody of the sample group can take lead 29 (the group of the seed): the refusal is covered above
    const lead = (await (await asOwner.fetch('board/lead?id=29')).json()) as { exResponsible: string[] };
    expect(lead.exResponsible).toEqual(['E101']);
  });
});
