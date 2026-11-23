/**
 * Fake of the two REST APIs the sign-in talks to — the auth service and triplesale-service — with their real answer shapes
 * (`{status, message, result:{…}}`; errors `{timestamp, status, message, error}` as the UAT gateway sends them). Framework-free on
 * purpose: the dev mock backend (mock-backend.interceptor.ts) and the Node server of the comparison harness
 * import this one file.
 *
 * Endpoints (path after the API base):  auth: POST /auth/login · POST /auth/select-org
 *                                        service: GET /master-data/branches · GET /auth/user-detail · GET /me/roles
 *
 * Accounts (any password except "wrong", which the auth service answers with 401 "Invalid user credentials"):
 *   demo / viewer / admin / anything else   signed in at once (single company, SUN)
 *   multi                                    must choose a company (SUN, ACE)
 *   multimix                                 …among companies of odd shape (no code, no name, markup in the name)
 *
 * Accounts that make a call fail, to see every message of the login page without a broken backend:
 *   down        the auth service gives no answer (what a dropped connection looks like)
 *   err500      login answers 500 without a message     html500   …500 with an HTML error page      nojson   …200 that is not JSON
 *   disabled    login answers 403 with a message of its own
 *   nobranch    the company list is empty                branchfail / branchdown   …the list answers 500 / gives no answer
 *   selectfail / selectdown                              choosing the company answers 500 / gives no answer
 *   expire      choosing the company answers 401 (the token ran out while the page waited)
 */
import { reference } from '../mock/reference';
import type { MockupAccounts } from '../mockup/mockup-users';

export interface MockBranch {
  id: number | string;
  code?: string;
  name?: string;
  nameTh?: string;
}

/** a call as the fake sees it; `path` is relative to the API base (no host, no `/api/v1`) */
export interface ApiRequest {
  api: 'auth' | 'service';
  method: string;
  path: string;
  body: unknown;
  /** the token after "Bearer ", null when the call carries none */
  bearer: string | null;
}

export interface ApiReply {
  /** 0 = no answer at all (the connection is dropped) */
  status: number;
  /** a JSON object, or a plain string for the answers that are not JSON */
  body?: unknown;
}

export interface MockProfile {
  profileName: string;
  employeeId: number;
  /** the code of the employee; derived from the id (E001) when the account has none */
  employeeCode?: string;
  roles: string[];
}

/**
 * The accounts of the mockup (Datasource/users.json …), once the app has loaded them: a name that is not in them cannot sign in, the
 * password must match, a disabled account is refused, and the companies / roles are the ones of the account. `null` = the built-in demo accounts.
 */
let accounts: MockupAccounts | null = null;
export const setMockAccounts = (value: MockupAccounts | null): void => {
  accounts = value;
};
export const mockAccounts = (): MockupAccounts | null => accounts;

export const DEFAULT_BRANCH = { id: 1004400123, code: 'SUN', name: 'SUN GATEWAY' };
const SUN: MockBranch = { ...DEFAULT_BRANCH, nameTh: 'ซัน เกตเวย์' };
const ACE: MockBranch = { id: 1004400456, code: 'ACE', name: 'ACE CLOUD', nameTh: 'เอซ คลาวด์' };

/** accounts that go through the company step, and the companies they may choose */
const isBranchTable = (doc: unknown): boolean =>
  typeof doc === 'object' && doc !== null && !Array.isArray(doc) && Object.values(doc).every((rows) => Array.isArray(rows) && rows.every((r) => typeof r === 'object' && r !== null && typeof (r as { id?: unknown }).id === 'number'));

/**
 * The companies of each account: `ref.login.json` › `branches` of the shared Datasource when it has it (the rows differ on purpose — a missing code, a
 * missing name — so only "a list of objects with an id per account" is checked). Read when asked, not at load: this module loads before the Datasource does.
 */
export const mockBranches = (): Record<string, MockBranch[]> => reference<Record<string, MockBranch[]>>('login.branches', DEFAULT_BRANCHES, undefined, isBranchTable);
/** asks for the list, so that the export of the seed documents finds it */
export const registerReferenceLists = (): void => void mockBranches();
const DEFAULT_BRANCHES: Record<string, MockBranch[]> = {
  multi: [SUN, ACE],
  multimix: [
    { id: 11, code: 'T&C', name: 'Tom & "Jerry" <b>Co</b>', nameTh: '' },
    { id: 12, name: 'No code company' },
    { id: 13, code: 'NOC', nameTh: 'ไม่มีชื่ออังกฤษ' },
    { id: 14 },
    { id: 15, code: 'ONLY' },
  ],
  nobranch: [],
  branchfail: [SUN, ACE],
  branchdown: [SUN, ACE],
  selectfail: [SUN, ACE],
  selectdown: [SUN, ACE],
  expire: [SUN, ACE],
};

/* ------------------------------------------------------------------ tokens (opaque to the app, readable here) */
interface TokenClaims {
  /** lower-cased account name */
  k: string;
  /** the name as typed */
  u: string;
  /** the company chosen with select-org */
  o?: string;
  /** a token that may only be used to choose the company */
  p?: boolean;
}
const encode = (c: TokenClaims) => `mock.${c.p ? 'pending' : 'access'}.${encodeURIComponent(JSON.stringify(c))}`;
function decode(token: string | null): TokenClaims | null {
  const m = /^mock\.(pending|access)\.(.+)$/.exec(token ?? '');
  if (!m) return null;
  try {
    const c = JSON.parse(decodeURIComponent(m[2])) as TokenClaims;
    return (m[1] === 'pending') === !!c.p ? c : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ answers */
const stamp = () => new Date().toISOString();
const failure = (status: number, message: string, error?: string): ApiReply => ({
  status,
  body: error === undefined ? { timestamp: stamp(), status, message } : { timestamp: stamp(), status, message, error },
});
const unauthorized = (): ApiReply => failure(401, 'Unauthorized', 'Unauthorized');
const success = (result: unknown): ApiReply => ({ status: 200, body: { status: 200, message: 'success', result } });

const TOKEN_TTL_S = 3600;

export function handleApi(req: ApiRequest, profileOf: (userKey: string, username: string) => MockProfile): ApiReply {
  const route = `${req.method.toUpperCase()} ${req.api}:${req.path.split('?')[0]}`;
  switch (route) {
    case 'POST auth:/auth/login':
      return login(req.body);
    case 'POST auth:/auth/select-org':
      return selectOrg(req);
    case 'GET service:/master-data/branches':
      return branches(req);
    case 'GET service:/auth/user-detail':
      return userDetail(req, profileOf);
    case 'GET service:/me/roles':
      return roles(req, profileOf);
    default: {
      // not mocked yet: a signed-in caller learns it (501), anyone else is simply unauthorized
      const claims = decode(req.bearer);
      return claims && !claims.p ? failure(501, `Mock backend: ${req.method} ${req.api}:${req.path} is not implemented`) : unauthorized();
    }
  }
}

function login(input: unknown): ApiReply {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const username = typeof body['username'] === 'string' ? body['username'].trim() : '';
  const password = typeof body['password'] === 'string' ? body['password'] : '';
  if (!username || !password) {
    const missing = [!password && 'ต้องมี password', !username && 'ต้องมี username'].filter(Boolean).join(', ');
    return failure(400, 'request ไม่ถูกต้อง', missing);
  }

  const key = username.toLowerCase();
  switch (key) {
    case 'down':
      return { status: 0 };
    case 'err500':
      return failure(500, 'Internal Server Error');
    case 'html500':
      return { status: 500, body: '<html><body><h1>HTTP Status 500 – Internal Server Error</h1></body></html>' };
    case 'nojson':
      return { status: 200, body: 'OK' };
    case 'disabled':
      return failure(403, 'Forbidden', 'บัญชีนี้ถูกปิดการใช้งาน');
  }
  if (password === 'wrong') return failure(401, 'Unauthorized', 'Invalid user credentials');
  const account = accounts?.find(username);
  if (accounts) {
    if (!account || account.password !== password) return failure(401, 'Unauthorized', 'Invalid user credentials');
    if (account.disabled) return failure(403, 'Forbidden', 'บัญชีนี้ถูกปิดการใช้งาน');
  }

  const needOrg = account ? branchesFor(key).length > 1 : !!mockBranches()[key];
  const claims: TokenClaims = { k: key, u: username, p: needOrg };
  return success({
    access_token: encode(claims),
    refresh_token: `mock.refresh.${key}`,
    expires_in: TOKEN_TTL_S,
    token_type: 'Bearer',
    requires_org_selection: needOrg,
  });
}

/** the companies of an account of the Datasource (the first is the home company); the built-in accounts use mockBranches() */
function branchesFor(key: string): MockBranch[] {
  const account = accounts?.find(key);
  if (!account) return mockBranches()[key] ?? [SUN, ACE];
  const list = accounts?.branchesOf(account) ?? [];
  return list.length > 0 ? list : [SUN];
}

function branches(req: ApiRequest): ApiReply {
  const claims = decode(req.bearer);
  if (!claims) return unauthorized();
  if (claims.k === 'branchfail') return failure(500, 'Internal Server Error');
  if (claims.k === 'branchdown') return { status: 0 };
  return success(branchesFor(claims.k));
}

function selectOrg(req: ApiRequest): ApiReply {
  const claims = decode(req.bearer);
  if (!claims?.p) return unauthorized();
  const org = String((req.body as { org?: unknown } | null)?.org ?? '').trim();
  if (claims.k === 'expire') return failure(401, 'Unauthorized', 'Token expired');
  if (claims.k === 'selectfail') return failure(500, 'Internal Server Error');
  if (claims.k === 'selectdown') return { status: 0 };
  const allowed = accounts?.find(claims.k) ? branchesFor(claims.k) : (mockBranches()[claims.k] ?? []);
  if (!allowed.some((b) => String(b.id) === org)) return failure(400, 'Bad Request');
  return success({
    access_token: encode({ k: claims.k, u: claims.u, o: org }),
    refresh_token: `mock.refresh.${claims.k}`,
    expires_in: TOKEN_TTL_S,
    token_type: 'Bearer',
    requires_org_selection: false,
  });
}

function userDetail(req: ApiRequest, profileOf: (k: string, u: string) => MockProfile): ApiReply {
  const claims = decode(req.bearer);
  if (!claims || claims.p) return unauthorized();
  const who = profileOf(claims.k, claims.u);
  // the company the user chose (select-org) is the one shown; else the home company
  const chosen = branchesFor(claims.k);
  const home = (claims.o ? chosen.find((b) => String(b.id) === claims.o) : undefined) ?? (accounts?.find(claims.k) ? chosen[0] : mockBranches()[claims.k]?.[0]) ?? DEFAULT_BRANCH;
  return success({
    employee: { id: who.employeeId, code: who.employeeCode ?? (who.employeeId != null ? 'E' + String(who.employeeId).padStart(3, '0') : ''), branch: { id: home.id, code: home.code, name: home.name } },
    profile: { name: who.profileName },
  });
}

function roles(req: ApiRequest, profileOf: (k: string, u: string) => MockProfile): ApiReply {
  const claims = decode(req.bearer);
  if (!claims || claims.p) return unauthorized();
  return success(profileOf(claims.k, claims.u).roles);
}
