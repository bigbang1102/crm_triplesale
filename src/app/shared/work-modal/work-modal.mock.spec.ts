import { describe, expect, it, vi } from 'vitest';
import { handleWorkModalRequest, parseBffUrl, toResponse, type ScheduleEnvelope, type WorkModalData } from './work-modal.mock';

/** a page's data: records what the servlet layer hands to it */
function data(over: Partial<WorkModalData> = {}): WorkModalData & { added: Record<string, unknown>[]; edited: [number, Record<string, unknown>][] } {
  const added: Record<string, unknown>[] = [];
  const edited: [number, Record<string, unknown>][] = [];
  const ok = (status = 201): ScheduleEnvelope => ({ status, message: 'success' });
  return {
    added,
    edited,
    employees: vi.fn((g?: string) => [{ id: 1, code: 'E1', name: g ? 'team' : 'all' }]),
    employeesByActivityGroup: (g) => [{ id: 2, code: 'E2', name: 'group ' + g }],
    activityGroups: (mt) => (mt === '7' ? [{ id: 101, code: 'CS', name: 'CS' }] : null),
    addSchedule: (b) => (added.push(b), ok()),
    editSchedule: (id, b) => (edited.push([id, b]), ok(200)),
    ...over,
  };
}
const call = (method: string, url: string, body: unknown, d: WorkModalData) => {
  const { path, params } = parseBffUrl(url);
  return handleWorkModalRequest(method, path, params, body === undefined ? undefined : JSON.stringify(body), d);
};

describe('the servlet layer of the work modal', () => {
  it('parseBffUrl takes the page URL, the context path and the root path alike', () => {
    for (const u of ['../board/schedule/add?x=1', '/triplesale/board/schedule/add?x=1', '/board/schedule/add?x=1', 'board/schedule/add?x=1']) {
      const p = parseBffUrl(u);
      expect([p.path, p.params.get('x')]).toEqual(['board/schedule/add', '1']);
    }
  });

  it('schedule/add: AddScheduleServlet drops movementTypeId and turns activityGroupId into procedureGroupId; HTTP 200 unless the envelope is an error', () => {
    const d = data();
    const r = call('POST', '../board/schedule/add', { leadId: 1, subject: 's', movementTypeId: 9, activityGroupId: 101 }, d)!;
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: 201, message: 'success' });
    expect(d.added[0]).toEqual({ leadId: 1, subject: 's', procedureGroupId: 101 });
    // an explicit procedureGroupId wins
    call('POST', '../board/schedule/add', { activityGroupId: 101, procedureGroupId: 5 }, d);
    expect(d.added[1]).toEqual({ procedureGroupId: 5 });
    const bad = call('POST', '../board/schedule/add', {}, data({ addSchedule: () => ({ status: 400, message: 'no', error: { message: 'no' } }) }))!;
    expect(bad.status).toBe(400);
  });

  it('schedule/edit: the id goes to the path, leadId is dropped; PATCH and POST both work', () => {
    const d = data();
    const r = call('PATCH', '../board/schedule/edit', { id: 12, leadId: 3, subject: 's', status: 'doing' }, d)!;
    expect(r.status).toBe(200);
    expect(d.edited).toEqual([[12, { subject: 's', status: 'doing' }]]);
    expect(call('POST', '../board/schedule/edit', { id: 13 }, d)!.status).toBe(200);
    expect(call('GET', '../board/schedule/edit', {}, d)!.status).toBe(405);
    expect(call('PATCH', '../board/schedule/edit', { subject: 'no id' }, d)!.status).toBe(500);
  });

  it('employees, employees of an activity group, activity groups of a product', () => {
    const d = data();
    expect(call('GET', '../board/employees?saleGroupId=3', undefined, d)!.body).toEqual([{ id: 1, code: 'E1', name: 'team' }]);
    expect(call('GET', '../board/employees', undefined, d)!.body).toEqual([{ id: 1, code: 'E1', name: 'all' }]);
    expect(call('GET', '../board/master/employees-by-activity-group?activityGroupId=101', undefined, d)!.body).toEqual({ status: 200, message: 'success', result: [{ id: 2, code: 'E2', name: 'group 101' }] });
    expect(call('GET', '../board/master/employees-by-activity-group', undefined, d)!.status).toBe(400);
    expect((call('GET', '../board/master/activity-groups?movementTypeId=7', undefined, d)!.body as { result: { items: unknown[] } }).result.items).toHaveLength(1);
    expect(call('GET', '../board/master/activity-groups?movementTypeId=8', undefined, d)!.status).toBe(404);
    expect(call('GET', '../board/master/activity-groups', undefined, d)!.status).toBe(400);
  });

  it('a path that is not the modal\'s is not answered (the page mock goes on)', () => {
    expect(call('GET', '../board/activity-list', undefined, data())).toBeNull();
  });

  it('toResponse: the JSON of the reply with its status', async () => {
    const r = toResponse({ status: 404, body: { error: 'x' } });
    expect([r.status, r.headers.get('Content-Type'), await r.json()]).toEqual([404, 'application/json', { error: 'x' }]);
  });
});
