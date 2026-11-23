/**
 * What `LoginProxyServlet` (POST /login_proxy) answered the login page, for each account of the REST API fake
 * (core/http/auth-api.mock.ts) — worked out by reading LoginProxyServlet.java, status code and Thai message word for word.
 *
 * The servlet is gone (the SPA talks to the APIs itself, AuthService.proxy() does its job), so this is the REFERENCE the
 * replacement is held to:
 *   - auth.service.spec.ts runs the same requests through AuthService against the API fake and expects the same answers;
 *   - the comparison harness (Node) gives it to the real Java login page as its /login_proxy, so the Java page and the
 *     Angular page can be compared on the same accounts.
 * Framework-free on purpose (no Angular imports).
 *
 * Differences that are not differences: the text of a Java exception ("Connection refused") is replaced by what a browser
 * says when a request gets no answer ("Failed to fetch").
 */
import { mockBranches } from '../http/auth-api.mock';

/** where the half-finished sign-in (ss_pending_token / ss_pending_username of the servlet) is kept */
export interface ReferenceStore {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  del(key: string): void;
}

export interface ServletReply {
  status: number;
  /** the JSON body the page got */
  body: Record<string, unknown>;
}

const PENDING_KEY = 'ts.reference.pending';
const SESSION_GONE = 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
const NO_ANSWER = 'Failed to fetch';

const err = (status: number, failMessage: string): ServletReply => ({ status, body: { responseCode: 'ERROR', failMessage } });

function readPending(store: ReferenceStore): { key: string; username: string } | null {
  const raw = store.get(PENDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { key: string; username: string };
  } catch {
    return null;
  }
}

/** The body is what the page sent: {username,password} | {action:'branches'} | {action:'select-org',org}. */
export function servletReply(input: unknown, store: ReferenceStore): ServletReply {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const action = String(body['action'] ?? 'login').trim().toLowerCase();
  if (action === 'branches') return branches(store);
  if (action === 'select-org') return selectOrg(String(body['org'] ?? '').trim(), store);
  return login(String(body['username'] ?? '').trim(), String(body['password'] ?? ''), store);
}

function login(username: string, password: string, store: ReferenceStore): ServletReply {
  if (!username || !password) return err(400, 'กรุณาระบุ Username และ Password');

  const key = username.toLowerCase();
  switch (key) {
    case 'down':
      return err(502, `เชื่อมต่อระบบยืนยันตัวตนไม่ได้: ${NO_ANSWER}`);
    case 'err500':
    case 'html500': // the body of the answer is not read when it is not JSON: the status is all there is
      return err(500, 'เข้าสู่ระบบไม่สำเร็จ (HTTP 500)');
    case 'nojson': // 200 without an access token: the servlet keeps the upstream status and says so
      return err(200, 'เข้าสู่ระบบไม่สำเร็จ (HTTP 200)');
    case 'disabled': // the `error` text of the auth service is shown as it is
      return err(403, 'บัญชีนี้ถูกปิดการใช้งาน');
  }
  if (password === 'wrong') return err(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');

  if (mockBranches()[key]) {
    store.set(PENDING_KEY, JSON.stringify({ key, username }));
    return { status: 200, body: { responseCode: 'ORG_REQUIRED', username } };
  }
  return { status: 200, body: { responseCode: 'COMPLETE', username } };
}

function branches(store: ReferenceStore): ServletReply {
  const pending = readPending(store);
  if (!pending) return err(401, SESSION_GONE);
  if (pending.key === 'branchfail') return err(500, 'โหลดรายชื่อบริษัทไม่สำเร็จ (HTTP 500)');
  if (pending.key === 'branchdown') return err(502, 'เชื่อมต่อระบบไม่ได้ระหว่างโหลดรายชื่อบริษัท');
  return { status: 200, body: { responseCode: 'COMPLETE', branches: mockBranches()[pending.key] ?? [] } };
}

function selectOrg(org: string, store: ReferenceStore): ServletReply {
  const pending = readPending(store);
  if (!pending) return err(401, SESSION_GONE);
  if (!org) return err(400, 'กรุณาเลือกบริษัท');
  if (pending.key === 'expire') return err(401, 'Token expired');
  if (pending.key === 'selectfail') return err(500, 'เลือกบริษัทไม่สำเร็จ (HTTP 500)');
  if (pending.key === 'selectdown') return err(502, `เชื่อมต่อระบบยืนยันตัวตนไม่ได้: ${NO_ANSWER}`);
  if (!(mockBranches()[pending.key] ?? []).some((b) => String(b.id) === org)) return err(400, 'เลือกบริษัทไม่สำเร็จ (HTTP 400)');
  store.del(PENDING_KEY);
  return { status: 200, body: { responseCode: 'COMPLETE', username: pending.username } };
}
