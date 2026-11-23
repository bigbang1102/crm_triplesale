import { describe, expect, it } from 'vitest';
import { ALLOWED_UPLOAD_EXT as CORE_ALLOWED_EXT } from '@core/live/prospect-files.live';
import { fakeRest, type FakeCall } from '@core/live/rest-fake';
import { createLiveProspects } from './prospects.live';
import { ALLOWED_UPLOAD_EXT, UPLOAD_ACCEPT_EXT } from './prospects.constants';

/** the page-specific part: which servlets the Prospects page gets, and the value of its EL */
function live(answer: (c: FakeCall) => unknown = () => ({ status: 200, result: [] })) {
  const { deps, calls } = fakeRest((c) => answer(c) as object);
  return { calls, backend: createLiveProspects(deps) };
}

describe('the live backend of the Prospects page', () => {
  it('commonBean.uploadAcceptExt is FileServerAccess.uploadAcceptAttr(): the extensions the generator took from the Java class', async () => {
    expect((await live().backend.initial()).uploadAcceptExt).toBe(UPLOAD_ACCEPT_EXT);
    // the list the upload route checks is the one of the page
    expect([...CORE_ALLOWED_EXT]).toEqual([...ALLOWED_UPLOAD_EXT]);
  });

  it('answers the list, the enrich, the documents and the file route of the prospect servlets', async () => {
    const l = live((c) => (c.path.startsWith('/prospects?') ? { status: 200, result: [{ id: 1, name: 'ก' }] } : { status: 200, result: {} }));
    const list = await l.backend.fetch('/board/prospect-list?page=1&perPage=20&sortBy=date_desc');
    expect(list.status).toBe(200);
    expect(((await list.json()) as { result: { items: unknown[] } }).result.items).toHaveLength(1);
    expect(l.calls[0].path).toBe('/prospects?page=1&perPage=20&sort=-createdAt');
    expect((await l.backend.fetch('/board/prospect-enrich?ids=1')).status).toBe(200);
    expect((await l.backend.fetch('/board/prospect/attachments?prospectId=1')).status).toBe(200);
    expect((await l.backend.fetch('/docproxy?url=')).status).toBe(400);
  });

  it('answers the lead creation of the modal and the master data of the filters and of the modal (the shared servlets)', async () => {
    const l = live((c) => (c.method === 'POST' ? { status: 201, result: { id: 5, txNo: 'LD1' } } : { status: 200, result: [{ id: 3, code: 'P1', name: 'ก' }] }));
    const created = await l.backend.fetch('/board/lead-create', { method: 'POST', body: JSON.stringify({ prospectId: 1, movementTypeId: 2 }) });
    expect(await created.json()).toMatchObject({ status: 201, result: { id: 5 } });
    expect(l.calls[0]).toMatchObject({ method: 'POST', path: '/leads' });
    // the provinces come from options (the old /master-data/provinces is gone: 404)
    expect(((await (await l.backend.fetch('/board/provinces')).json()) as { id: string }[]).map((r) => r.id)).toEqual(['3']);
    expect(l.calls.some((c) => c.path.startsWith('/master-data/provinces'))).toBe(false);
    expect((await l.backend.fetch('/board/chat-master-data?type=marketing-channels')).status).toBe(200);
    // gone from the service (404): the page asks for no master-data/marketing-channels and no master-data/countries
    expect(l.calls.some((c) => c.path.startsWith('/master-data/marketing-channels') || c.path.startsWith('/master-data/countries'))).toBe(false);
    for (const url of ['/board/districts?provinceId=1', '/board/sale-persons', '/board/employees', '/board/movement-types', '/board/master/activity-groups?movementTypeId=1', '/board/master/employees-by-activity-group?activityGroupId=1']) {
      expect((await l.backend.fetch(url)).status).toBe(200);
    }
  });

  it('a route nobody owns is a 404 JSON, never a call to the old BFF', async () => {
    const l = live();
    const r = await l.backend.fetch('/board/leads?viewMode=list');
    expect(r.status).toBe(404);
    expect(l.calls).toHaveLength(0);
  });
});
