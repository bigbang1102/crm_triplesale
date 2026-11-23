/**
 * Starts the file layer of the mockup before the app: finds the file server, loads Datasource/, hands the accounts to the fake sign-in and
 * mirrors the `ts.mock.*` keys of sessionStorage (the state some mock backends already keep there) into Datasource/ — so those pages keep
 * their data across a reload AND a restart without being changed.
 *
 * Without the server nothing is shown: the app does not start and a page says the data is not there (mockup-unavailable.ts).
 */
import { buildAccounts, type MockupBranch, type MockupRoleGroup, type MockupUser } from './mockup-users';
import { loadDatasource, mockupServerUp, noteDocument, readChangeCursor, removeDocument, saveDocument } from './mockup-client';
import { startLive } from './mockup-live';
import { onDocumentChanged, onDocumentFamilyChanged } from './mockup-registry';
import { showMockupUnavailable, type MockupUnavailable } from './mockup-unavailable';
import { currentCompany, markDocumentsLoaded } from '../mock/company-scope';
import { applyWorkbookCast } from './mockup-workbook';
import { setDatasource } from './mockup-datasource';
import { setMockAccounts } from '../http/auth-api.mock';
import { KNOWN_ROLES } from '../permissions/all-roles';
import { setCastDocument } from '../mock/crm-seed';
import { setOrgDocument } from '../mock/org-seed';
import { setRoleCatalog } from '../permissions/role-model';
import { onSharedDbChange, setSharedDb, type SharedDbState } from '../mock/shared-db';

const MIRRORED_PREFIX = 'ts.mock.';
/** the switches that make a mock fail on purpose (a test knob): not data, so they are not kept */
const KNOB_SUFFIX = '.config';
const MIRROR_DELAY_MS = 300;

/**
 * The parts of a mirrored key that belong to the person at the keyboard, not to the data (what the Java app kept in the HttpSession): the filter they
 * set on a list. They stay in their own tab — never sent to the server, never replaced by what somebody else did there.
 */
const OWN_FIELDS: Record<string, readonly string[]> = { 'ts.mock.leads.state': ['filterState'] };

const withoutOwnFields = (key: string, value: unknown): unknown => {
  const own = OWN_FIELDS[key];
  if (!own || !value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([field]) => !own.includes(field)));
};

/** a mirrored key as a document: JSON text stays JSON (readable in the file), anything else is kept as text */
export function keyToDocument(raw: string, key = ''): { kind: 'session-key'; json?: unknown; text?: string } {
  try {
    return { kind: 'session-key', json: withoutOwnFields(key, JSON.parse(raw)) };
  } catch {
    return { kind: 'session-key', text: raw };
  }
}

/** the text to put in the key for a document; `current` (what the tab holds now) gives back the fields that are the tab's own */
export function documentToKey(doc: unknown, key = '', current: string | null = null): string | undefined {
  if (!doc || typeof doc !== 'object' || (doc as { kind?: unknown }).kind !== 'session-key') return undefined;
  const { json, text } = doc as { json?: unknown; text?: unknown };
  if (typeof text === 'string') return text;
  if (json === undefined) return undefined;
  const own = OWN_FIELDS[key];
  if (own && current && json && typeof json === 'object' && !Array.isArray(json)) {
    try {
      const mine = JSON.parse(current) as Record<string, unknown>;
      return JSON.stringify({ ...(json as Record<string, unknown>), ...Object.fromEntries(own.filter((f) => f in mine).map((f) => [f, mine[f]])) });
    } catch {
      // what the tab holds is not JSON: the document wins
    }
  }
  return JSON.stringify(json);
}

const isMirrored = (key: string): boolean => key.startsWith(MIRRORED_PREFIX) && !key.endsWith(KNOB_SUFFIX);

function restoreSessionKeys(all: Record<string, unknown>): void {
  for (const [name, doc] of Object.entries(all)) {
    const value = isMirrored(name) ? documentToKey(doc, name, sessionStorage.getItem(name)) : undefined;
    if (value !== undefined) sessionStorage.setItem(name, value);
  }
}

/** every write of a mirrored key to sessionStorage is also written to Datasource/ (debounced per key); what the others write comes in the same way */
function mirrorSessionKeys(): void {
  const proto = Storage.prototype;
  const setItem = proto.setItem;
  const removeItem = proto.removeItem;
  // somebody else changed a mirrored key (the state of a mock page): this page's copy follows — written WITHOUT the mirror, or it would be sent back
  onDocumentFamilyChanged(MIRRORED_PREFIX, (name, doc) => {
    if (!isMirrored(name)) return;
    const value = documentToKey(doc, name, sessionStorage.getItem(name));
    if (value === undefined) removeItem.call(sessionStorage, name);
    else setItem.call(sessionStorage, name, value);
  });
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const later = (key: string, job: () => void): void => {
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(job, MIRROR_DELAY_MS));
  };
  proto.setItem = function (this: Storage, key: string, value: string): void {
    setItem.call(this, key, value);
    if (this === sessionStorage && isMirrored(key)) later(key, () => void saveDocument(key, keyToDocument(value, key)));
  };
  proto.removeItem = function (this: Storage, key: string): void {
    removeItem.call(this, key);
    if (this === sessionStorage && isMirrored(key)) later(key, () => void removeDocument(key));
  };
}

function startAccounts(all: Record<string, unknown>): void {
  const users = all['users'];
  if (!Array.isArray(users) || users.length === 0) return;
  const groups = Array.isArray(all['roles']) ? (all['roles'] as MockupRoleGroup[]) : [];
  const branches = Array.isArray(all['branches']) ? (all['branches'] as MockupBranch[]) : [];
  setMockAccounts(buildAccounts(users as MockupUser[], groups, branches, KNOWN_ROLES));
}

/** shows the page that says there is no data and never lets the start of the app finish */
function blockApp(kind: MockupUnavailable): Promise<never> {
  showMockupUnavailable(kind);
  return new Promise<never>(() => undefined);
}

/** true when the file server is there and the data was loaded from it (else the app does not start at all) */
export async function startMockup(): Promise<boolean> {
  // the data lives only on the shared file server: without it there is nothing to show, so the app does not start (a page says why, with a retry)
  if (!(await mockupServerUp())) return blockApp('down');
  // where the changes of the others are NOW, before the documents are read: whatever happens while they are read is then heard of
  const cursor = await readChangeCursor();
  const all = await loadDatasource();
  if (Object.keys(all).length === 0) return blockApp('empty');
  // a company of the Seed Workbook gets its own people, groups, customers and opportunities in place of the cast of the formulas
  const workbook = applyWorkbookCast(all, currentCompany());
  if (workbook) console.info(`[mockup] ${workbook.company}: cast of the Seed Workbook — ${workbook.prospects} customers, ${workbook.leads} opportunities (${workbook.skipped} left out: no customer)`);
  setDatasource(all, true);
  markDocumentsLoaded();
  restoreSessionKeys(all);
  mirrorSessionKeys();
  startAccounts(all);
  // the people and the groups first: the customers and the leads are checked against them
  startOrg(all);
  startRoleCatalog(all);
  startCast(all);
  startSharedDb(all);
  // what was read is the base of each later save: when somebody saved the same document meanwhile, the two are merged (mockup-merge.ts)
  if (cursor) for (const [name, doc] of Object.entries(all)) if (!name.startsWith('journal.')) noteDocument(name, doc, cursor.rev);
  if (cursor) startLive(cursor); // from now on the changes of the others reach this page at once
  return true;
}

const ROLES_DOC = 'seed.roles';
const ORG_DOC = 'seed.org';

/** the permissions, the standard roles and the positions of the chart come from the shared Datasource when it has them (`seed.roles.json`); a document that does not fit is told about and ignored */
function startRoleCatalog(all: Record<string, unknown>): void {
  const problem = setRoleCatalog(all[ROLES_DOC]);
  if (problem) console.warn(`${problem} — the catalog of roles comes from the built-in one instead.`);
}
const CAST_DOC = 'seed.crm';

/** the employees and the activity groups come from the shared Datasource when it has them (`seed.org.json`); a document that does not fit is told about and ignored */
function startOrg(all: Record<string, unknown>): void {
  const problem = setOrgDocument(all[ORG_DOC]);
  if (problem) console.warn(`${problem} — the employees and groups come from the built-in lists instead.`);
}

/** the customers and the leads of the cast come from the shared Datasource when it has them (`seed.crm.json`); a document that does not fit is told about and ignored */
function startCast(all: Record<string, unknown>): void {
  const problem = setCastDocument(all[CAST_DOC]);
  if (problem) console.warn(`${problem} — the customers and leads come from the built-in formulas instead.`);
}

const SHARED_DB_DOC = 'shared-db';

/** the customers / leads the user changed, which every mock page shows (core/mock/shared-db.ts): loaded now, saved when they change */
function startSharedDb(all: Record<string, unknown>): void {
  const doc = all[SHARED_DB_DOC];
  setSharedDb(doc && typeof doc === 'object' ? (doc as Partial<SharedDbState>) : undefined);
  // somebody else changed it: it is the database now (`setSharedDb` does not tell the listeners below, so it is not sent back)
  onDocumentChanged(SHARED_DB_DOC, (value) => setSharedDb(value && typeof value === 'object' ? (value as Partial<SharedDbState>) : undefined));
  let timer: ReturnType<typeof setTimeout> | undefined;
  onSharedDbChange((s) => {
    clearTimeout(timer);
    timer = setTimeout(() => void saveDocument(SHARED_DB_DOC, s), MIRROR_DELAY_MS);
  });
}
