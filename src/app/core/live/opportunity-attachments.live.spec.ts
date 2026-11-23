import { describe, expect, it } from 'vitest';
import { attachmentRows, opportunityAttachmentsRoutes } from './opportunity-attachments.live';
import { fakeRest, type FakeAnswer } from './rest-fake';

describe('OP05 attachments of an opportunity', () => {
  it('rows are given the names the page reads; what the row already has is kept', () => {
    expect(attachmentRows({ result: [{ id: 'a1', fileName: 'ใบเสนอ.pdf', url: 'https://f/x.pdf', orderNo: 1 }] })).toEqual([
      { id: 'a1', fileName: 'ใบเสนอ.pdf', url: 'https://f/x.pdf', orderNo: 1, attachFile: 'https://f/x.pdf', description: 'ใบเสนอ.pdf', detailOrderNo: 1 },
    ]);
    expect(attachmentRows({ result: { items: [{ attachFile: 'k', url: 'u' }] } })[0]['attachFile']).toBe('k');
    expect(attachmentRows({ result: {} })).toEqual([]);
  });

  it('/board/lead/attachments?leadId= → GET /opportunities/{id}/attachments; a refusal → []; no leadId → 400', async () => {
    const ok = fakeRest(() => ({ status: 200, text: JSON.stringify({ result: [{ id: 'a1', name: 'x' }] }) }) as FakeAnswer);
    const route = opportunityAttachmentsRoutes(ok.deps);
    const r = await route('/board/lead/attachments', new URLSearchParams('leadId=o-1'), undefined);
    expect(await r!.json()).toEqual([{ id: 'a1', name: 'x', description: 'x' }]);
    expect(ok.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /opportunities/o-1/attachments']);
    expect((await route('/board/lead/attachments', new URLSearchParams(), undefined))!.status).toBe(400);
    const no = fakeRest(() => ({ status: 403, text: '{}' }) as FakeAnswer);
    expect(await (await opportunityAttachmentsRoutes(no.deps)('/board/lead/attachments', new URLSearchParams('leadId=o-1'), undefined))!.json()).toEqual([]);
  });

  it('OP23 DELETE /board/lead/attachments → DELETE /opportunities/{id}/attachments/{attachmentId}', async () => {
    const ok = fakeRest(() => ({ status: 204, text: '' }) as FakeAnswer);
    const r = await opportunityAttachmentsRoutes(ok.deps)('/board/lead/attachments', new URLSearchParams('leadId=o-1&attachmentId=a%2F1'), { method: 'DELETE' });
    expect(r!.status).toBe(200);
    expect(await r!.json()).toEqual({ status: 200, message: 'success' });
    expect(ok.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['DELETE /opportunities/o-1/attachments/a%2F1']);
  });

  it('OP23 keeps the status of a refusal with its message; no answer → 502; missing ids → 400', async () => {
    const no = fakeRest(() => ({ status: 403, text: JSON.stringify({ message: 'forbidden' }) }) as FakeAnswer);
    const r = await opportunityAttachmentsRoutes(no.deps)('/board/lead/attachments', new URLSearchParams('leadId=o-1&attachmentId=a1'), { method: 'DELETE' });
    expect(r!.status).toBe(403);
    expect((await r!.json()).message).toContain('forbidden');
    const gone = fakeRest(() => ({ status: 0, text: '' }) as FakeAnswer);
    const g = await opportunityAttachmentsRoutes(gone.deps)('/board/lead/attachments', new URLSearchParams('leadId=o-1&attachmentId=a1'), { method: 'DELETE' });
    expect(g!.status).toBe(502);
    const bad = await opportunityAttachmentsRoutes(gone.deps)('/board/lead/attachments', new URLSearchParams('leadId=o-1'), { method: 'DELETE' });
    expect(bad!.status).toBe(400);
  });
});
