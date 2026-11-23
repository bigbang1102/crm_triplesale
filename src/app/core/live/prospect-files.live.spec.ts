import { describe, expect, it } from 'vitest';
import {
  ALLOWED_UPLOAD_EXT,
  allowedUploadExtText,
  checkTarget,
  docProxy,
  encodeIllegalChars,
  isAllowedUploadName,
  javaUrlEncode,
  probe,
  toUri,
  uploadAcceptAttr,
  verifyFailMessage,
  type FileIo,
} from './prospect-files.live';

/** a file server that answers by method + address; `calls` = what was asked */
function server(answer: (method: string, url: string, init?: RequestInit) => Response | Error) {
  const calls: { method: string; url: string; range?: string }[] = [];
  const io: FileIo = {
    fetch: async (url, init) => {
      calls.push({ method: init?.method ?? 'GET', url, range: (init?.headers as Record<string, string> | undefined)?.['Range'] });
      const r = answer(init?.method ?? 'GET', url, init);
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return { io, calls };
}
const status = (s: number, body = ''): Response => new Response(body || null, { status: s });

describe('what may be uploaded (FileServerAccess.ALLOWED_EXT)', () => {
  it('is the list of the Java class, sorted for the text and for the accept of the input', () => {
    expect(ALLOWED_UPLOAD_EXT).toHaveLength(17);
    expect(allowedUploadExtText()).toBe('.7z, .csv, .doc, .docx, .gif, .jpeg, .jpg, .pdf, .png, .ppt, .pptx, .rar, .txt, .webp, .xls, .xlsx, .zip');
    expect(uploadAcceptAttr()).toBe('.7z,.csv,.doc,.docx,.gif,.jpeg,.jpg,.pdf,.png,.ppt,.pptx,.rar,.txt,.webp,.xls,.xlsx,.zip');
  });

  it('a name is allowed with a dot that is not its first character and an extension of the list, whatever the case', () => {
    expect(isAllowedUploadName('a.pdf')).toBe(true);
    expect(isAllowedUploadName('รายงาน ปี 2569.PDF')).toBe(true);
    expect(isAllowedUploadName('a.b.7Z')).toBe(true);
    expect(isAllowedUploadName('.pdf')).toBe(false); // the dot is the first character
    expect(isAllowedUploadName('pdf')).toBe(false);
    expect(isAllowedUploadName('virus.exe')).toBe(false);
    expect(isAllowedUploadName('a.pdf.exe')).toBe(false);
    expect(isAllowedUploadName('')).toBe(false);
    expect(isAllowedUploadName(null)).toBe(false);
  });
});

describe('the address of a file', () => {
  it('encodeIllegalChars: only what a URI does not allow becomes UTF-8 %XX; %XX and the separators stay; a lone % is %25', () => {
    expect(encodeIllegalChars('http://h/a b.pdf')).toBe('http://h/a%20b.pdf');
    expect(encodeIllegalChars('http://h/สน.94.pdf')).toBe('http://h/%E0%B8%AA%E0%B8%99.94.pdf');
    expect(encodeIllegalChars('http://h/a%20b%2Fc.pdf?x=1&y=2#z')).toBe('http://h/a%20b%2Fc.pdf?x=1&y=2#z');
    expect(encodeIllegalChars('http://h/100%.pdf')).toBe('http://h/100%25.pdf');
    expect(encodeIllegalChars('http://h/a%2')).toBe('http://h/a%252');
    expect(encodeIllegalChars('x"<>[]{}|\\^`')).toBe('x%22%3C%3E%5B%5D%7B%7D%7C%5C%5E%60');
    expect(encodeIllegalChars("a-_.!~*'();/?:@&=+$,#")).toBe("a-_.!~*'();/?:@&=+$,#");
  });

  it('toUri collapses a doubled host, trims, encodes, and gives scheme / host / the path decoded and raw', () => {
    const u = toUri('  http://h:51774/http://h:51774/prospect/17/สน 94.pdf ');
    expect(u).toMatchObject({ scheme: 'http', host: 'h', rawPath: '/prospect/17/%E0%B8%AA%E0%B8%99%2094.pdf', path: '/prospect/17/สน 94.pdf', href: 'http://h:51774/prospect/17/%E0%B8%AA%E0%B8%99%2094.pdf' });
    const rel = toUri('prospect/17/a.pdf');
    expect(rel).toMatchObject({ scheme: null, host: null, path: 'prospect/17/a.pdf' });
  });

  it('checkTarget: a relative address, another scheme or no host is BAD_URL; an address that is not a file is BLOCKED_EXT; a file passes', () => {
    expect(checkTarget(toUri('prospect/17/a.pdf'))).toBe('BAD_URL');
    expect(checkTarget(toUri('ftp://h/a.pdf'))).toBe('BAD_URL');
    expect(checkTarget(toUri('http:///a.pdf'))).toBe('BAD_URL');
    expect(checkTarget(toUri('http://h/triplesale-service/api/v1/leads'))).toBe('BLOCKED_EXT');
    expect(checkTarget(toUri('http://h/leads;x.pdf'))).toBe('BLOCKED_EXT'); // a path parameter
    expect(checkTarget(toUri('http://h/a%3Bb/x.pdf'))).toBe('BLOCKED_EXT');
    expect(checkTarget(toUri('http://h/a/../x.pdf'))).toBe('BLOCKED_EXT');
    expect(checkTarget(toUri('http://h/.pdf'))).toBe('BLOCKED_EXT'); // the dot is the first character
    expect(checkTarget(toUri('http://h/a.verylongextension'))).toBe('BLOCKED_EXT');
    expect(checkTarget(toUri('HTTPS://H/prospect/1/a.html'))).toBeNull(); // any extension is a file (it is sent as a download)
    expect(checkTarget(toUri('http://h/prospect/1/a.pdf?x=1'))).toBeNull();
  });

  it('javaUrlEncode is URLEncoder: a space is +, only letters digits . - * _ stay', () => {
    expect(javaUrlEncode('a b/ก~*-_.!')).toBe('a+b%2F%E0%B8%81%7E*-_.%21');
  });
});

describe('probe (FileServerAccess.probe): can the stored file be opened?', () => {
  it('HEAD 200 is OK and nothing else is asked', async () => {
    const s = server(() => status(200));
    expect(await probe(s.io, 'http://h/http://h/prospect/1/a.pdf')).toEqual({ ok: true, reason: 'OK', status: 200, detail: '' });
    expect(s.calls).toEqual([{ method: 'HEAD', url: 'http://h/prospect/1/a.pdf', range: undefined }]);
  });

  it('HEAD 404 is HTTP_404 straight away (404 does not mean "no HEAD")', async () => {
    const s = server(() => status(404));
    expect(await probe(s.io, 'http://h/prospect/1/a.pdf')).toMatchObject({ ok: false, reason: 'HTTP_404', status: 404 });
    expect(s.calls).toHaveLength(1);
  });

  it('HEAD refused with 400 / 403 / 405 / 501 is asked again with GET of one byte; its status decides', async () => {
    for (const refused of [400, 403, 405, 501]) {
      const ok = server((m) => (m === 'HEAD' ? status(refused) : status(206)));
      expect(await probe(ok.io, 'http://h/prospect/1/a.pdf')).toMatchObject({ ok: true, reason: 'OK', status: 206 });
      expect(ok.calls).toEqual([
        { method: 'HEAD', url: 'http://h/prospect/1/a.pdf', range: undefined },
        { method: 'GET', url: 'http://h/prospect/1/a.pdf', range: 'bytes=0-0' },
      ]);
    }
    const missing = server((m) => (m === 'HEAD' ? status(403) : status(404)));
    expect(await probe(missing.io, 'http://h/prospect/1/a.pdf')).toMatchObject({ ok: false, reason: 'HTTP_404', status: 404 });
    const broken = server((m) => (m === 'HEAD' ? status(405) : status(500)));
    expect(await probe(broken.io, 'http://h/prospect/1/a.pdf')).toMatchObject({ ok: false, reason: 'HTTP_500', status: 500 });
  });

  it('another failing status of HEAD (500, 302 …) is not asked again', async () => {
    const s = server(() => status(500));
    expect(await probe(s.io, 'http://h/prospect/1/a.pdf')).toMatchObject({ ok: false, reason: 'HTTP_500' });
    expect(s.calls).toHaveLength(1);
  });

  it('no answer (network error, CORS) is NETWORK; a bad or blocked address is not asked at all', async () => {
    expect(await probe(server(() => new TypeError('Failed to fetch')).io, 'http://h/prospect/1/a.pdf')).toMatchObject({ ok: false, reason: 'NETWORK', status: 0 });
    const s = server(() => status(200));
    expect(await probe(s.io, 'prospect/1/a.pdf')).toMatchObject({ ok: false, reason: 'BAD_URL', status: 0 });
    expect(await probe(s.io, 'http://h/api/leads')).toMatchObject({ ok: false, reason: 'BLOCKED_EXT', status: 0 });
    expect(s.calls).toHaveLength(0);
  });

  it('verifyFailMessage says why, with the code at the end for the administrator', () => {
    const tail = ' ไฟล์อาจดาวน์โหลด/แสดงไม่ได้ กรุณาลองใหม่หรือแจ้งผู้ดูแลระบบ [';
    const p = (reason: string, st = 0) => ({ ok: false, reason, status: st, detail: '' });
    expect(verifyFailMessage(p('BLOCKED_HOST'))).toBe('อัปโหลดสำเร็จ แต่ตรวจสอบไฟล์บน O2O ไม่ผ่าน — ที่อยู่ของ file server ไม่อยู่ในรายการที่ระบบอนุญาตให้เปิดไฟล์' + tail + 'BLOCKED_HOST]');
    expect(verifyFailMessage(p('BLOCKED_EXT'))).toBe('อัปโหลดสำเร็จ แต่ตรวจสอบไฟล์บน O2O ไม่ผ่าน — ที่อยู่ไฟล์ที่ระบบหลังบ้านตอบกลับมาไม่ได้ชี้ไปที่ไฟล์' + tail + 'BLOCKED_EXT]');
    expect(verifyFailMessage(p('BAD_URL'))).toBe('อัปโหลดสำเร็จ แต่ตรวจสอบไฟล์บน O2O ไม่ผ่าน — ที่อยู่ไฟล์ที่ระบบหลังบ้านตอบกลับมาไม่ถูกต้อง' + tail + 'BAD_URL]');
    expect(verifyFailMessage(p('NETWORK'))).toBe('อัปโหลดสำเร็จ แต่ตรวจสอบไฟล์บน O2O ไม่ผ่าน — เครื่องระบบเชื่อมต่อ file server ไม่ได้ (เครือข่าย/ไฟร์วอลล์/ใบรับรอง)' + tail + 'NETWORK]');
    expect(verifyFailMessage(p('HTTP_404', 404))).toBe(
      'อัปโหลดสำเร็จ แต่ตรวจสอบไฟล์บน O2O ไม่ผ่าน — ไม่พบไฟล์ที่ file server หลังอัปโหลด (ไฟล์อาจไม่ถูกเก็บ หรือที่อยู่ไฟล์ที่ระบบหลังบ้านตอบกลับชี้ผิดที่)' + tail + 'HTTP_404]',
    );
    expect(verifyFailMessage(p('HTTP_500', 500))).toBe('อัปโหลดสำเร็จ แต่ตรวจสอบไฟล์บน O2O ไม่ผ่าน — file server ตอบกลับผิดปกติ' + tail + 'HTTP_500]');
  });
});

describe('GET /docproxy?url= (DocProxy)', () => {
  const reasonOf = (r: Response): string | null => r.headers.get('X-DocProxy-Reason');

  it('no address is 400 MISSING_URL, with the reason in the header and in the text', async () => {
    const s = server(() => status(200));
    for (const url of [null, '', '   ']) {
      const r = await docProxy(s.io, url);
      expect(r.status).toBe(400);
      expect(reasonOf(r)).toBe('MISSING_URL');
      expect(await r.text()).toBe('MISSING_URL');
      expect(r.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(s.calls).toHaveLength(0);
  });

  it('an address that is not a file of http(s) is 403 BAD_URL / BLOCKED_EXT and is not fetched', async () => {
    const s = server(() => status(200));
    const rel = await docProxy(s.io, 'prospect/1/a.pdf');
    expect([rel.status, reasonOf(rel)]).toEqual([403, 'BAD_URL']);
    const api = await docProxy(s.io, 'http://h/triplesale-service/api/v1/leads');
    expect([api.status, reasonOf(api)]).toEqual([403, 'BLOCKED_EXT']);
    expect(s.calls).toHaveLength(0);
  });

  it('the file server answering anything but 200 is 502 UPSTREAM_<status>; no answer is 502 NETWORK', async () => {
    const r404 = await docProxy(server(() => status(404)).io, 'http://h/prospect/1/missing.pdf');
    expect([r404.status, reasonOf(r404)]).toEqual([502, 'UPSTREAM_404']);
    const r206 = await docProxy(server(() => status(206)).io, 'http://h/prospect/1/a.pdf');
    expect([r206.status, reasonOf(r206)]).toEqual([502, 'UPSTREAM_206']);
    const down = await docProxy(server(() => new TypeError('Failed to fetch')).io, 'http://h/prospect/1/a.pdf');
    expect([down.status, reasonOf(down)]).toEqual([502, 'NETWORK']);
  });

  it('PDF and pictures are inline with the content type of their extension (not the one of the file server)', async () => {
    const cases: [string, string][] = [['a.pdf', 'application/pdf'], ['A.PNG', 'image/png'], ['a.jpg', 'image/jpeg'], ['a.JPEG', 'image/jpeg'], ['a.gif', 'image/gif'], ['a.webp', 'image/webp']];
    for (const [name, type] of cases) {
      const s = server(() => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'text/html' } }));
      const r = await docProxy(s.io, `http://h/prospect/1/${name}`);
      expect(r.status).toBe(200);
      expect(r.headers.get('Content-Type')).toBe(type);
      expect(r.headers.get('Content-Disposition')).toBe('inline');
      expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(r.headers.get('Cache-Control')).toBe('private, max-age=300');
      expect(r.headers.get('Content-Security-Policy')).toBeNull();
      expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([1, 2, 3]);
    }
  });

  it('every other file is an attachment: octet-stream, the name UTF-8 encoded (a space is %20), sandboxed — a .html cannot run in the app', async () => {
    const s = server(() => new Response('<script>alert(1)</script>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
    const r = await docProxy(s.io, 'http://h/prospect/1/รายงาน ปี.html');
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(r.headers.get('Content-Disposition')).toBe("attachment; filename*=UTF-8''%E0%B8%A3%E0%B8%B2%E0%B8%A2%E0%B8%87%E0%B8%B2%E0%B8%99%20%E0%B8%9B%E0%B8%B5.html");
    expect(r.headers.get('Content-Security-Policy')).toBe('sandbox');
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    // the file server is asked with the illegal characters encoded
    expect(s.calls[0].url).toBe('http://h/prospect/1/%E0%B8%A3%E0%B8%B2%E0%B8%A2%E0%B8%87%E0%B8%B2%E0%B8%99%20%E0%B8%9B%E0%B8%B5.html');
    const docx = await docProxy(server(() => status(200, 'x')).io, 'http://h/prospect/1/a.docx');
    expect(docx.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(docx.headers.get('Content-Disposition')).toBe("attachment; filename*=UTF-8''a.docx");
  });

  it('a doubled host in the address is folded before the file server is asked', async () => {
    const s = server(() => status(200, 'x'));
    await docProxy(s.io, 'http://h/http://h/prospect/1/a.pdf');
    expect(s.calls).toEqual([{ method: 'GET', url: 'http://h/prospect/1/a.pdf', range: undefined }]);
  });
});
