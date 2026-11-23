import { Lang } from '../config/app-config';

/**
 * What the Angular app knows about the signed-in user — built by AuthService at sign-in from the answers of
 * `GET /auth/user-detail` (profile name, employee id, home branch), `GET /me/roles` and the company chosen with
 * `select-org`; kept with the token in the TokenStore (sessionStorage) until the tab closes or the token runs out.
 */
export interface SessionInfo {
  username: string;
  /** `/auth/user-detail` → profile.name */
  profileName: string;
  /** `/auth/user-detail` → employee.id (compared with the lead owner for `_Sup` rules) */
  employeeId: number | null;
  /** `/auth/user-detail` → employee.code ('' when the service gives none): the calendar tab asks for the tasks of this employee */
  employeeCode: string;
  /** active company/branch: the one chosen at login (`select-org`), else the home branch of the employee */
  branch: { id: number | string; code: string; name: string } | null;
  /**
   * Java's `ss_branch_code`: the code of the employee's HOME branch (`user-detail → employee.branch.code`; the chosen company
   * only when that is missing). The dashboard sends it as `ggwBranch` — it can differ from `branch` for multi-company users.
   */
  branchCode: string;
  /** `/me/roles` */
  roles: string[];
  /** how many companies the user may choose (triplesales-api sign-in): more than one = the shell offers "switch company" */
  companyCount?: number;
  lang?: Lang;
}

export interface Branch {
  id: number | string;
  code: string;
  name: string;
  nameTh?: string;
}

/**
 * What the login page gets back from `POST /login_proxy` — the shape the Java page builds from its fetch(): the HTTP status, the
 * parsed JSON ({responseCode: COMPLETE | ORG_REQUIRED | ERROR, username, failMessage, branches} — the token is never included,
 * it stays in the server session) and the body as text.
 */
export interface LoginProxyReply {
  status: number;
  ok: boolean;
  /** null when the body is empty or not JSON */
  data: Record<string, unknown> | null;
  raw: string;
}

export type AuthStatus = 'unknown' | 'anonymous' | 'authenticated';
