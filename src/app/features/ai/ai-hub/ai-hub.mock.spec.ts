import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockAiHubFetch, mockAiHubFile } from './ai-hub.mock';

const API = '/triplesale/aihub';

/** call the mock and let its simulated latency pass */
async function call(path: string, init?: RequestInit): Promise<any> {
  const pending = mockAiHubFetch(`${API}${path}`, init, API);
  await vi.advanceTimersByTimeAsync(2000);
  return (await pending).json();
}

const post = (tool: string, fields: Record<string, string | File> = {}) => {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  return call(`/tools/${tool}`, { method: 'POST', body });
};

describe('AI HUB mock backend', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('lists the tools plus the chat helper, each with a recommended model first', async () => {
    const j = await call('/tools');
    expect(j.ok).toBe(true);
    const ids = j.tools.map((t: { id: string }) => t.id);
    expect(ids).toEqual(expect.arrayContaining(['doc-analyze', 'diagram', 'library-ask', 'chat', 'code-review', 'customer-brief']));
    expect(ids).not.toContain('voiceover'); // picks a voice, not a model
    for (const t of j.tools) expect(t.modelOptions[0].recommended || t.id === 'chat').toBeTruthy();
    expect(j.library.enabled).toBe(true);
    expect(j.diagram.editorUrl).toMatch(/^https:/);
  });

  it('answers every tool the screens call with a result the renderer understands', async () => {
    const analyze = await post('doc-analyze');
    expect(analyze.ok).toBe(true);
    expect(analyze.result.risks.length).toBeGreaterThan(0);
    expect(analyze.result.docId).toBeTruthy();

    const image = await post('image', { count: '1', ratio: '1:1' });
    expect(image.result.images).toHaveLength(1);
    expect(image.result.ratio).toBe('1:1');

    const code = await post('code');
    expect(code.result.files.map((f: { name: string }) => f.name)).toContain('InstallmentCalculator.java');

    expect((await post('chat', { message: 'สรุปให้หน่อย' })).result.reply).toContain('สรุปให้หน่อย');
    expect((await post('doc-ask', { question: 'ใคร' })).result.citations).toHaveLength(1);
  });

  it('meeting is asynchronous: a job id first, the finished minutes on the second status poll', async () => {
    const started = await post('meeting', { files: new File(['x'], 'ประชุม.mp3') });
    expect(started.result).toMatchObject({ async: true, status: 'transcribing', fileName: 'ประชุม.mp3' });

    const first = await post('meeting-status', { jobId: started.result.jobId });
    expect(first.result.status).toBe('summarizing');
    const second = await post('meeting-status', { jobId: started.result.jobId });
    expect(second.result.status).toBe('done');
    expect(second.result.actions.length).toBeGreaterThan(0);
  });

  it('library: list, add, edit and delete documents', async () => {
    const before = (await post('library-docs')).result.docs.length;

    const added = await post('library-upload', { title: 'คู่มือทดสอบ', category: 'ทดสอบ', scope: 'all', files: new File(['abc'], 'guide.pdf') });
    expect(added.result.added).toHaveLength(1);
    const id = added.result.added[0].id;
    expect((await post('library-docs')).result.docs).toHaveLength(before + 1);

    await post('library-update', { docId: id, title: 'คู่มือแก้ไข', category: 'ทดสอบ', scope: 'branches', branches: 'B01, B02' });
    const edited = (await post('library-docs')).result.docs.find((d: { id: string }) => d.id === id);
    expect(edited).toMatchObject({ title: 'คู่มือแก้ไข', scope: 'branches', branches: ['B01', 'B02'] });

    await post('library-delete', { docId: id });
    expect((await post('library-docs')).result.docs).toHaveLength(before);
  });

  it('reports an unknown tool the way the real servlet does (ok:false + error)', async () => {
    const j = await post('no-such-tool');
    expect(j).toMatchObject({ ok: false });
    expect(j.error).toContain('no-such-tool');
  });

  it('serves mock files: SVG images, a playable WAV, plain text for the rest', () => {
    expect(mockAiHubFile('mock-img-2').type).toBe('image/svg+xml');
    const wav = mockAiHubFile('mock-wav');
    expect(wav.type).toBe('audio/wav');
    expect(String.fromCharCode(...(wav.data as Uint8Array).slice(0, 4))).toBe('RIFF');
    expect(mockAiHubFile('mock-pptx').type).toContain('text/plain');
  });

  it('usage endpoint matches what the home screen draws', async () => {
    const j = await call('/usage');
    expect(j).toMatchObject({ ok: true, enabled: true });
    expect(j.me.byGroup).toHaveProperty('document');
    expect(j.me.byModel[0]).toHaveProperty('label');
  });
});
