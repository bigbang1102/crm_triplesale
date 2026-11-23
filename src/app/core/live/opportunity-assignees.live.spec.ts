import { describe, expect, it } from 'vitest';
import { assigneeRows, opportunityAssigneesRoutes } from './opportunity-assignees.live';
import { fakeRest, type FakeAnswer } from './rest-fake';

describe('OP08 assignee-options', () => {
  it('rows from result.assignees (or a list / items), named { id, code, name }', () => {
    expect(assigneeRows({ result: { assignees: [{ id: 'e1', code: 'E01', name: 'สมหญิง' }], salePersons: [{ id: 'p' }] } })).toEqual([{ id: 'e1', code: 'E01', name: 'สมหญิง' }]);
    expect(assigneeRows({ result: [{ id: 'e2', nameTh: 'ก' }] })).toEqual([{ id: 'e2', nameTh: 'ก', code: '', name: 'ก' }]);
    expect(assigneeRows({ result: {} })).toEqual([]);
  });

  it('/board/employees?leadId= → GET /opportunities/{id}/assignee-options without any query; no leadId → not answered; a refusal → []', async () => {
    const ok = fakeRest(() => ({ status: 200, text: JSON.stringify({ result: { assignees: [{ id: 'e1', name: 'ก' }] } }) }) as FakeAnswer);
    const r = await opportunityAssigneesRoutes(ok.deps)('/board/employees', new URLSearchParams('leadId=o-1'), undefined);
    expect((await r!.json()).map((x: { id: string }) => x.id)).toEqual(['e1']);
    expect(ok.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /opportunities/o-1/assignee-options']);
    expect(await opportunityAssigneesRoutes(ok.deps)('/board/employees', new URLSearchParams(), undefined)).toBeNull();
    const no = fakeRest(() => ({ status: 403, text: '{}' }) as FakeAnswer);
    expect(await (await opportunityAssigneesRoutes(no.deps)('/board/employees', new URLSearchParams('leadId=o-1'), undefined))!.json()).toEqual([]);
  });
});
