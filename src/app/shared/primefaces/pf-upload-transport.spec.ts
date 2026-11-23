import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setUploadHandler } from './pf-upload-transport';

type Factory = (options: { data?: unknown }) => { send(h: unknown, complete: (s: number, t: string, r: Record<string, unknown>) => void): void; abort(): void } | undefined;

/** the transport registered with jQuery (once per page): the test plays jQuery and calls the factory the way `$.ajax` does */
let factory: Factory;
const ajaxTransport = vi.fn((_dataType: string, f: Factory) => {
  factory = f;
});

function partial(files: File[] = [], source = 'quotationForm:up'): FormData {
  const f = new FormData();
  f.append('jakarta.faces.partial.ajax', 'true');
  f.append('jakarta.faces.source', source);
  f.append('jakarta.faces.partial.render', 'quotationForm:sdDocList');
  for (const file of files) f.append(source, file, file.name);
  return f;
}

/** `send` of the transport as a promise of what it completed with */
function sendOf(options: { data?: unknown }): Promise<{ status: number; text: string; responses: Record<string, unknown> }> {
  const t = factory(options);
  if (!t) throw new Error('not claimed');
  return new Promise((resolve) => t.send({}, (status, text, responses) => resolve({ status, text, responses })));
}

describe('upload transport (the server of p:fileUpload)', () => {
  beforeEach(() => {
    (window as unknown as { jQuery: unknown }).jQuery = { ajaxTransport };
  });
  afterEach(() => {
    setUploadHandler(undefined);
  });

  it('is registered with jQuery once, whatever the number of screens', () => {
    setUploadHandler(vi.fn(async () => undefined));
    setUploadHandler(vi.fn(async () => undefined));
    expect(ajaxTransport.mock.calls.filter((c) => c[0] === '+*').length).toBeLessThanOrEqual(1);
  });

  it('answers a PrimeFaces upload: the handler gets the files and the fields, the widget gets an empty partial response', async () => {
    const handler = vi.fn(async () => undefined);
    setUploadHandler(handler);
    const a = new File(['abc'], 'a.pdf', { type: 'application/pdf' });
    const data = partial([a]);
    const done = await sendOf({ data });
    expect(handler).toHaveBeenCalledTimes(1);
    const [files, fields] = handler.mock.calls[0] as unknown as [File[], FormData];
    expect(files.map((f) => f.name)).toEqual(['a.pdf']);
    expect(fields.get('jakarta.faces.partial.render')).toBe('quotationForm:sdDocList');
    expect(done.status).toBe(200);
    const xml = done.responses['xml'] as Document;
    expect(xml.getElementsByTagName('partial-response')).toHaveLength(1);
    expect(xml.getElementsByTagName('changes')[0]?.childNodes).toHaveLength(0);
  });

  it('hands over every file of the request', async () => {
    const handler = vi.fn(async () => undefined);
    setUploadHandler(handler);
    await sendOf({ data: partial([new File(['1'], 'one.txt'), new File(['2'], 'two.txt')]) });
    expect((handler.mock.calls[0] as unknown as [File[]])[0].map((f) => f.name)).toEqual(['one.txt', 'two.txt']);
  });

  it('does not claim a request that is not a PrimeFaces partial request with form data', () => {
    setUploadHandler(vi.fn(async () => undefined));
    expect(factory({ data: 'a=b' })).toBeUndefined();
    expect(factory({ data: new FormData() })).toBeUndefined();
    expect(factory({})).toBeUndefined();
  });

  it('does not claim anything while no screen owns the upload (the handler is gone)', () => {
    setUploadHandler(vi.fn(async () => undefined));
    setUploadHandler(undefined);
    expect(factory({ data: partial() })).toBeUndefined();
  });

  it('a handler that fails is a server error for the widget', async () => {
    setUploadHandler(async () => {
      throw new Error('boom');
    });
    const done = await sendOf({ data: partial([new File(['x'], 'x.pdf')]) });
    expect(done.status).toBe(500);
    expect(done.text).toBe('error');
  });

  it('an aborted request is never completed', async () => {
    let release: () => void = () => undefined;
    setUploadHandler(() => new Promise<void>((resolve) => (release = resolve)));
    const complete = vi.fn();
    const t = factory({ data: partial([new File(['x'], 'x.pdf')]) });
    t?.send({}, complete);
    t?.abort();
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(complete).not.toHaveBeenCalled();
  });
});
