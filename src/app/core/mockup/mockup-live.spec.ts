import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ownRevisions } from './mockup-client';
import { datasourceDoc, resetMockupForTests } from './mockup-datasource';
import { startLive, stopLive } from './mockup-live';
import { onDocumentChanged, onDocumentFamilyChanged, onJournalChanged } from './mockup-registry';

type Answer = { epoch: string; rev: number; changed: Array<{ name: string; rev: number }> } | 'fail';

/** the server as far as the listener sees it: answers of `changes` one after the other, then it waits (a long poll that does not end) */
function server(answers: Answer[], docs: Record<string, unknown> = {}) {
  const asked: string[] = [];
  const fetchMock = vi.fn((input: string, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.includes('/changes')) {
      asked.push(url);
      const next = answers.shift();
      if (next === 'fail') return Promise.resolve(new Response('no', { status: 503 }));
      if (next) return Promise.resolve(new Response(JSON.stringify(next)));
      return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    }
    const doc = /\/ds\/(.+)$/.exec(url);
    const name = doc ? decodeURIComponent(doc[1]) : '';
    return Promise.resolve(name in docs ? new Response(JSON.stringify(docs[name])) : new Response('{}', { status: 404 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return { asked };
}

const settle = async (ms = 20): Promise<void> => void (await new Promise((r) => setTimeout(r, ms)));
const notice = (): HTMLElement | null => document.getElementById('ts-mockup-changed');

beforeEach(() => ownRevisions.clear());
afterEach(() => {
  stopLive();
  vi.resetModules();
  notice()?.remove();
  vi.unstubAllGlobals();
  resetMockupForTests();
});

describe('hearing of the changes of the others', () => {
  it('should ask for the changes after the revision the app took, and again after each answer', async () => {
    const s = server([{ epoch: 'e1', rev: 7, changed: [] }, { epoch: 'e1', rev: 9, changed: [] }]);
    startLive({ epoch: 'e1', rev: 4 });
    await settle();
    expect(s.asked[0]).toContain('since=4');
    expect(s.asked[1]).toContain('since=7');
    expect(s.asked[2]).toContain('since=9');
  });

  it('should let a journal play what was added to it, and show nothing on the page', async () => {
    const pull = vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    onJournalChanged('items', pull);
    server([{ epoch: 'e1', rev: 5, changed: [{ name: 'journal.items', rev: 5 }] }, { epoch: 'e1', rev: 6, changed: [{ name: 'journal.items', rev: 6 }] }]);
    startLive({ epoch: 'e1', rev: 1 });
    await settle();
    expect(pull).toHaveBeenCalledTimes(2);
    expect(notice()).toBeNull(); // no notice, no reload
  });

  it('should read a document somebody else wrote, keep it in memory and let the one who holds it take it in', async () => {
    const listener = vi.fn();
    onDocumentChanged('state.smart-docs', listener);
    server([{ epoch: 'e1', rev: 8, changed: [{ name: 'state.smart-docs', rev: 8 }] }], { 'state.smart-docs': { data: { quotations: [1] } } });
    startLive({ epoch: 'e1', rev: 1 });
    await settle();
    expect(listener).toHaveBeenCalledWith({ data: { quotations: [1] } });
    expect(datasourceDoc('state.smart-docs')).toEqual({ data: { quotations: [1] } });
    expect(notice()).toBeNull();
  });

  it('should tell a document that was removed (the document is gone, the holder starts from its seed again)', async () => {
    const listener = vi.fn();
    onDocumentChanged('state.gone', listener);
    server([{ epoch: 'e1', rev: 3, changed: [{ name: 'state.gone', rev: 3 }] }]);
    startLive({ epoch: 'e1', rev: 1 });
    await settle();
    expect(listener).toHaveBeenCalledWith(undefined);
  });

  it('should not take in what this page wrote itself (its own revision), nor say anything about it', async () => {
    const listener = vi.fn();
    onDocumentChanged('shared-db', listener);
    ownRevisions.set('shared-db', 6);
    server([{ epoch: 'e1', rev: 6, changed: [{ name: 'shared-db', rev: 6 }] }], { 'shared-db': { a: 1 } });
    startLive({ epoch: 'e1', rev: 1 });
    await settle();
    expect(listener).not.toHaveBeenCalled();
    expect(notice()).toBeNull();
  });

  it('should take in a family of documents by the start of the name (the state of the mock pages kept in the session)', async () => {
    const listener = vi.fn();
    onDocumentFamilyChanged('ts.mock.', listener);
    server([{ epoch: 'e1', rev: 4, changed: [{ name: 'ts.mock.leads.state', rev: 4 }, { name: 'other', rev: 4 }] }], { 'ts.mock.leads.state': { kind: 'session-key', json: { x: 1 } }, other: {} });
    startLive({ epoch: 'e1', rev: 1 });
    await settle();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('ts.mock.leads.state', { kind: 'session-key', json: { x: 1 } });
  });

  it('should go on after the server was started again (the revisions begin anew), without a word on the page', async () => {
    const s = server([{ epoch: 'other-run', rev: 2, changed: [] }]);
    startLive({ epoch: 'e1', rev: 50 });
    await settle();
    expect(notice()).toBeNull();
    expect(s.asked[1]).toContain('since=2');
  });

  it('should ask again after a failure, without giving up', async () => {
    vi.useFakeTimers();
    try {
      const s = server(['fail', { epoch: 'e1', rev: 3, changed: [] }]);
      startLive({ epoch: 'e1', rev: 1 });
      await vi.advanceTimersByTimeAsync(10);
      expect(s.asked).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(3100);
      expect(s.asked.length).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
