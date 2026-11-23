/**
 * The file-server half of the prospect servlets, ported from the Java `FileServerAccess` (the extensions that may be uploaded, the
 * address of a file, the "is this a file" check, the probe that finds out whether a stored file can be opened) and `DocProxy`
 * (`GET /docproxy?url=` — the file of the file server, with the headers that decide whether the browser may show it).
 *
 * What the servlets did on the SERVER the browser now does itself, with the global `fetch` (never the app's HttpClient: that one carries the
 * Bearer token of the REST services, the file server must not get it, and it only reads text):
 *   - the probe after an upload is a HEAD request to the file server (GET with `Range: bytes=0-0` when HEAD is refused);
 *   - `/docproxy` fetches the file and answers it with the headers of the servlet. A browser needs CORS on the file server for this — the
 *     server-side proxy existed because the file server has none (an open question for the owners, see INTEGRATION.md).
 * The host allow-list of the servlet (`BLOCKED_HOST`) is not ported: it protected the SERVER from being used as an open proxy; a request from the
 * browser can reach nothing the user's browser could not reach anyway. The scheme / "is a file" checks stay.
 */
import { collapse, jtrim } from './prospect-payload.live';

/** how the file server is reached: the global `fetch` in the app, a stand-in in the specs */
export interface FileIo {
  fetch(url: string, init?: RequestInit): Promise<Response>;
}
export const browserFileIo: FileIo = { fetch: (url, init) => globalThis.fetch(url, init) };

export const REASON_OK = 'OK';
export const REASON_BAD_URL = 'BAD_URL';
export const REASON_BLOCKED_EXT = 'BLOCKED_EXT';
export const REASON_NETWORK = 'NETWORK';
export const REASON_HTTP_PREFIX = 'HTTP_';
/** kept for the text of the message: the browser has no host allow-list, so this reason is never produced */
export const REASON_BLOCKED_HOST = 'BLOCKED_HOST';

/* ---------------------------------------------------------------- what may be uploaded */

/** `FileServerAccess.ALLOWED_EXT` */
export const ALLOWED_UPLOAD_EXT: readonly string[] = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.ppt', '.pptx', '.zip', '.rar', '.7z'];
const ALLOWED_SET: ReadonlySet<string> = new Set(ALLOWED_UPLOAD_EXT);
/** the extensions sorted like a Java TreeSet of strings */
const SORTED = [...ALLOWED_UPLOAD_EXT].sort();

/** `isAllowedUploadName`: the name has an extension (a dot that is not the first character) of the list, whatever its case */
export function isAllowedUploadName(fileName: string | null | undefined): boolean {
  if (fileName == null) return false;
  const dot = fileName.lastIndexOf('.');
  return dot > 0 && ALLOWED_SET.has(fileName.substring(dot).toLowerCase());
}
/** `allowedUploadExtText`: for the message to the user */
export const allowedUploadExtText = (): string => SORTED.join(', ');
/** `uploadAcceptAttr`: the `accept` of the file input (`commonBean.uploadAcceptExt`) */
export const uploadAcceptAttr = (): string => SORTED.join(',');

/* ---------------------------------------------------------------- the address of a file */

/** what `java.net.URI` gave the servlet */
export interface FileUri {
  scheme: string | null;
  host: string | null;
  /** the decoded path */
  path: string;
  rawPath: string;
  /** the address to fetch */
  href: string;
}

/** the characters a URI may hold as they are (unreserved + the separators) */
const URI_SAFE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'();/?:@&=+$,#";
const HEX = '0123456789ABCDEF';
const isHexDigit = (ch: string): boolean => /^[0-9a-fA-F]$/.test(ch);
const UTF8 = new TextEncoder();

/** `FileServerAccess.encodeIllegalChars`: only what a URI does not allow (spaces, Thai letters, `" < > [ ] …`) as UTF-8 %XX; a %XX and the separators stay */
export function encodeIllegalChars(url: string): string {
  let out = '';
  let i = 0;
  while (i < url.length) {
    const ch = url.charAt(i);
    if (ch === '%' && i + 2 < url.length && isHexDigit(url.charAt(i + 1)) && isHexDigit(url.charAt(i + 2))) {
      out += url.slice(i, i + 3);
      i += 3;
      continue;
    }
    if (URI_SAFE_CHARS.includes(ch)) {
      out += ch;
      i++;
      continue;
    }
    const cp = url.codePointAt(i) as number;
    for (const b of UTF8.encode(String.fromCodePoint(cp))) out += '%' + HEX[(b >> 4) & 0xf] + HEX[b & 0xf];
    i += cp > 0xffff ? 2 : 1;
  }
  return out;
}

/** `FileServerAccess.toUri`: the raw address of the backend → the address to fetch (collapsed, trimmed, illegal characters encoded) */
export function toUri(raw: string): FileUri {
  const href = encodeIllegalChars(jtrim(collapse(raw)));
  const m = /^(?:([A-Za-z][A-Za-z0-9+.-]*):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?[^#]*)?(?:#.*)?$/.exec(href);
  if (!m) throw new Error('not a URI');
  let host: string | null = null;
  if (m[2] !== undefined) {
    const authority = m[2];
    const hostPort = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority;
    if (hostPort.startsWith('[')) {
      const end = hostPort.indexOf(']');
      host = end > 0 ? hostPort.slice(0, end + 1) : null;
    } else host = hostPort.replace(/:\d*$/, '');
    if (host === '') host = null;
  }
  const rawPath = m[3] ?? '';
  let path = rawPath;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    /* a bad escape stays as it is */
  }
  return { scheme: m[1] ?? null, host, path, rawPath, href };
}

/** `isFilePath`: the address ends in a file name with an extension — an API endpoint does not; `;` (path parameter) and `..` are refused */
function isFilePath(uri: FileUri): boolean {
  const { path, rawPath } = uri;
  if (path.includes(';') || rawPath.toLowerCase().includes('%3b')) return false;
  if (path.split('/').some((seg) => seg === '..')) return false;
  const last = path.substring(path.lastIndexOf('/') + 1);
  const dot = last.lastIndexOf('.');
  return dot > 0 && /^[A-Za-z0-9]{1,10}$/.test(last.substring(dot + 1));
}

/** `checkTarget` without the host allow-list: null = may be fetched, else the reason (BAD_URL / BLOCKED_EXT) */
export function checkTarget(uri: FileUri): string | null {
  const scheme = uri.scheme?.toLowerCase();
  if (!scheme || !uri.host || (scheme !== 'http' && scheme !== 'https')) return REASON_BAD_URL;
  if (!isFilePath(uri)) return REASON_BLOCKED_EXT;
  return null;
}

const timeout = (ms: number): AbortSignal | undefined => (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(ms) : undefined);
const PROBE_TIMEOUT_MS = 10000;
const FETCH_TIMEOUT_MS = 20000;
/** HEAD answered with these = the server may not support HEAD, not "the file is missing": ask again with GET */
const HEAD_UNSUPPORTED_STATUS: ReadonlySet<number> = new Set([400, 403, 405, 501]);
const isSuccess = (status: number): boolean => status >= 200 && status < 300;

/** the result of the check of a stored file */
export interface Probe {
  ok: boolean;
  /** OK / BAD_URL / BLOCKED_EXT / NETWORK / HTTP_<status> */
  reason: string;
  /** HTTP status of the file server (0 = not asked / no answer) */
  status: number;
  detail: string;
}

/** `FileServerAccess.probe`: can the stored file be opened? HEAD first; GET of one byte when HEAD is refused. Never throws. */
export async function probe(io: FileIo, rawUrl: string): Promise<Probe> {
  let uri: FileUri;
  try {
    uri = toUri(rawUrl);
  } catch {
    return { ok: false, reason: REASON_BAD_URL, status: 0, detail: 'ไม่ใช่ URL ที่ถูกต้อง' };
  }
  const blocked = checkTarget(uri);
  if (blocked !== null) return { ok: false, reason: blocked, status: 0, detail: `host=${uri.host ?? ''}` };
  try {
    let status = (await io.fetch(uri.href, { method: 'HEAD', signal: timeout(PROBE_TIMEOUT_MS) })).status;
    if (!isSuccess(status) && HEAD_UNSUPPORTED_STATUS.has(status)) {
      const r = await io.fetch(uri.href, { method: 'GET', headers: { Range: 'bytes=0-0' }, signal: timeout(PROBE_TIMEOUT_MS) });
      status = r.status;
      await r.body?.cancel().catch(() => undefined); // the body is not read: a server that ignores Range would send the whole file
    }
    if (isSuccess(status)) return { ok: true, reason: REASON_OK, status, detail: '' };
    return { ok: false, reason: REASON_HTTP_PREFIX + status, status, detail: `host=${uri.host ?? ''}` };
  } catch (e) {
    return { ok: false, reason: REASON_NETWORK, status: 0, detail: String(e) };
  }
}

/** `ProspectAttachmentsServlet.verifyFailMessage`: why the stored file could not be checked, in words (+ the code for the administrator) */
export function verifyFailMessage(p: Probe): string {
  let cause: string;
  if (p.reason === REASON_BLOCKED_HOST) cause = 'ที่อยู่ของ file server ไม่อยู่ในรายการที่ระบบอนุญาตให้เปิดไฟล์';
  else if (p.reason === REASON_BLOCKED_EXT) cause = 'ที่อยู่ไฟล์ที่ระบบหลังบ้านตอบกลับมาไม่ได้ชี้ไปที่ไฟล์';
  else if (p.reason === REASON_BAD_URL) cause = 'ที่อยู่ไฟล์ที่ระบบหลังบ้านตอบกลับมาไม่ถูกต้อง';
  else if (p.reason === REASON_NETWORK) cause = 'เครื่องระบบเชื่อมต่อ file server ไม่ได้ (เครือข่าย/ไฟร์วอลล์/ใบรับรอง)';
  else if (p.status === 404) cause = 'ไม่พบไฟล์ที่ file server หลังอัปโหลด (ไฟล์อาจไม่ถูกเก็บ หรือที่อยู่ไฟล์ที่ระบบหลังบ้านตอบกลับชี้ผิดที่)';
  else cause = 'file server ตอบกลับผิดปกติ';
  return `อัปโหลดสำเร็จ แต่ตรวจสอบไฟล์บน O2O ไม่ผ่าน — ${cause} ไฟล์อาจดาวน์โหลด/แสดงไม่ได้ กรุณาลองใหม่หรือแจ้งผู้ดูแลระบบ [${p.reason}]`;
}

/* ---------------------------------------------------------------- GET /docproxy?url= */

/** the extensions that are sent inline (the page previews them with img / iframe); everything else is a download */
const INLINE_EXT: ReadonlySet<string> = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp']);
const extOf = (fileName: string): string => {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? '' : fileName.substring(dot + 1).toLowerCase();
};
function contentTypeOf(fileName: string): string {
  const p = fileName.toLowerCase();
  if (p.endsWith('.pdf')) return 'application/pdf';
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
  if (p.endsWith('.gif')) return 'image/gif';
  if (p.endsWith('.webp')) return 'image/webp';
  if (p.endsWith('.csv')) return 'text/csv';
  if (p.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

/** `URLEncoder.encode(s, UTF_8)`: a space is `+`, only `A-Za-z0-9 . - * _` stay */
export const javaUrlEncode = (s: string): string => new URLSearchParams({ k: s }).toString().slice(2);

/** a failed `/docproxy`: the status, the reason in the body and in `X-DocProxy-Reason` (the page shows it to the user) */
function fail(status: number, reason: string): Response {
  return new Response(reason, {
    status,
    headers: { 'X-DocProxy-Reason': reason, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=UTF-8' },
  });
}

/**
 * `DocProxy.doGet`: the file at `url` with the headers of the servlet — PDF and pictures inline (the content type from the extension, not from
 * the file server), everything else an attachment (`application/octet-stream`, `Content-Security-Policy: sandbox`). The failures keep the status
 * and reason of the servlet: 400 MISSING_URL / BAD_URL, 403 BAD_URL / BLOCKED_EXT, 502 UPSTREAM_<status> / NETWORK.
 */
export async function docProxy(io: FileIo, urlParam: string | null): Promise<Response> {
  const urlStr = collapse(urlParam);
  if (urlStr === '') return fail(400, 'MISSING_URL');
  let uri: FileUri;
  try {
    uri = toUri(urlStr);
  } catch {
    return fail(400, REASON_BAD_URL);
  }
  const blocked = checkTarget(uri);
  if (blocked !== null) return fail(403, blocked);
  try {
    const up = await io.fetch(uri.href, { method: 'GET', signal: timeout(FETCH_TIMEOUT_MS) });
    if (up.status !== 200) {
      await up.body?.cancel().catch(() => undefined);
      return fail(502, `UPSTREAM_${up.status}`);
    }
    const fileName = uri.path.substring(uri.path.lastIndexOf('/') + 1);
    const headers: Record<string, string> = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=300' };
    if (INLINE_EXT.has(extOf(fileName))) {
      headers['Content-Type'] = contentTypeOf(fileName);
      headers['Content-Disposition'] = 'inline';
    } else {
      headers['Content-Type'] = 'application/octet-stream';
      headers['Content-Disposition'] = `attachment; filename*=UTF-8''${javaUrlEncode(fileName).replace(/\+/g, '%20')}`;
      headers['Content-Security-Policy'] = 'sandbox';
    }
    return new Response(await up.arrayBuffer(), { status: 200, headers });
  } catch {
    return fail(502, REASON_NETWORK);
  }
}
