/**
 * The options of the dropdowns (`GET /api/v1/prospects/options` …), kept in sessionStorage for the length of the session so that a page that needs
 * the same list does not ask again. Framework-free (the specs and the harness use it too).
 *
 *   key    `ts.options:<username>:<company>:<lang>:<set>[:<scope>]`
 *   value  the rows as JSON, only when there is something in them (an empty or failed answer is never kept: the next page asks again)
 *
 * It goes with the person (username), the company (what `PUT /me/session/company/{id}` chose) and the language, and is forgotten at sign-out
 * (`clearSessionUi` → `clearOptionCache`). Storage that is blocked or full is not an error: there is just no cache.
 */
import type { RestDeps } from './rest';

const PREFIX = 'ts.options:';

/** the key of one list for the signed-in person (`scope` = what narrows it, e.g. the province of the districts) */
export function optionKey(deps: RestDeps, set: string, scope = ''): string {
  const u = deps.user;
  return `${PREFIX}${u.username}:${u.branchId ?? ''}:${deps.lang()}:${set}${scope ? ':' + scope : ''}`;
}

/** the rows kept under `key`, or null when there are none (or what is stored is not a list) */
export function readOptions<T>(key: string): T[] | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) && v.length > 0 ? (v as T[]) : null;
  } catch {
    return null;
  }
}

/** keeps the rows — only a list with something in it */
export function writeOptions(key: string, rows: readonly unknown[]): void {
  if (rows.length === 0) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(rows));
  } catch {
    /* blocked or full: no cache */
  }
}

/** what else forgets with the lists (the in-memory copies of a module that keeps them) */
const RESETS: Array<() => void> = [];
export const onClearOptionCache = (reset: () => void): void => void RESETS.push(reset);

/** forgets every kept list (sign-out) */
export function clearOptionCache(): void {
  for (const reset of RESETS) reset();
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(PREFIX)) sessionStorage.removeItem(key);
  } catch {
    /* nothing to clear */
  }
}
