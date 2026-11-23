/**
 * Which company's data the mockup shows. The user signs in to ONE company (the choice on the login, or the only company of the account);
 * everything the pages show is that company's and nobody else's:
 *
 *   - the people of the cast (customers, opportunities): each belongs to a company (`bucketBelongs`), so a company sees its own share;
 *   - what a user adds or changes (the journals, the saved states, the shared database, the sales documents): kept in documents of the
 *     company (`serverDocName` / `localDocName`) — another company never reads or replays them.
 *
 * The company is read from the session the app already keeps (sessionStorage `ts_auth` › `session.branchCode`), so there is nothing
 * to set up or to keep in step. No company known (not signed in, a test) = nothing is filtered. A company that has no share of the cast
 * (any code but SUN / ACE) sees all of it. Framework-free.
 */

export const DEFAULT_COMPANY = 'SUN';

/** the share (a range of 0..99) of the cast each company owns; the ranges do not overlap, so no person is in two companies */
export const COMPANY_SHARE: Readonly<Record<string, readonly [number, number]>> = {
  SUN: [0, 60],
  ACE: [60, 100],
};

const SESSION_KEY = 'ts_auth';
const SCOPED_DOC = /^(journal\.|state\.|ts\.mock\.)/;
const SCOPED_EXACT: ReadonlySet<string> = new Set(['shared-db', 'sales-docs']);
const SUFFIX = '__';

let lastRaw: string | null | undefined;
let lastCompany = '';

/** the code of the company the user signed in to ('' = none known), upper case */
export function currentCompany(): string {
  let raw: string | null = null;
  try {
    raw = globalThis.sessionStorage?.getItem(SESSION_KEY) ?? null;
  } catch {
    raw = null; // storage blocked: no company known
  }
  if (raw === lastRaw) return lastCompany;
  lastRaw = raw;
  lastCompany = '';
  if (raw) {
    try {
      const code = (JSON.parse(raw) as { session?: { branchCode?: unknown } }).session?.branchCode;
      lastCompany = typeof code === 'string' ? code.trim().toUpperCase() : '';
    } catch {
      lastCompany = '';
    }
  }
  return lastCompany;
}

/** a hash of a person's id, 0..99 (the same everywhere; not the seed hash of crm-seed, which imports this file) */
function bucketOf(id: number): number {
  let h = (Math.imul(id + 1, 2654435761) ^ Math.imul(4242, 40503)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) % 100;
}

/** does the person (customer) `id` of the cast belong to `company`? ('' or a company with no share = yes) */
export function bucketBelongs(company: string, id: number): boolean {
  const range = COMPANY_SHARE[company];
  if (!range) return true;
  const b = bucketOf(id);
  return b >= range[0] && b < range[1];
}

/** `isMine(id)`: the filter of the cast for the company now (a function so the company is read once, not for every person) */
export function castFilter(): (id: number) => boolean {
  const company = currentCompany();
  return (id) => bucketBelongs(company, id);
}

/** does something the user added (stamped with the company it was added in) belong to the company now? no stamp / no company = yes */
export function stampBelongs(stamp: string | undefined): boolean {
  const company = currentCompany();
  return !company || !stamp || stamp === company;
}

/* ------------------------------------------------------------------------------------------ the documents of the file server */

const slugOf = (company: string): string => company.toLowerCase().replace(/[^a-z0-9._-]/g, '-');

const isScoped = (name: string): boolean => SCOPED_DOC.test(name) || SCOPED_EXACT.has(name);

/** the name a document has on the server for the company now: the default company keeps the plain name, another one gets `<name>__<company>` */
export function serverDocName(name: string): string {
  const company = currentCompany();
  if (!company || company === DEFAULT_COMPANY || !isScoped(name)) return name;
  return `${name}${SUFFIX}${slugOf(company)}`;
}

/**
 * The name a document of the server has in the app, or undefined when it is another company's: `journal.x` is the default company's,
 * `journal.x__ace` is ACE's (and is `journal.x` to ACE). Documents that are not company data (users, seeds, references …) keep their name.
 */
export function localDocName(serverName: string): string | undefined {
  const company = currentCompany();
  const mine = !company || company === DEFAULT_COMPANY ? DEFAULT_COMPANY.toLowerCase() : slugOf(company);
  const at = serverName.lastIndexOf(SUFFIX);
  if (at > 0) {
    const base = serverName.slice(0, at);
    if (isScoped(base)) return serverName.slice(at + SUFFIX.length) === mine && mine !== DEFAULT_COMPANY.toLowerCase() ? base : undefined;
  }
  if (!isScoped(serverName)) return serverName;
  return mine === DEFAULT_COMPANY.toLowerCase() ? serverName : undefined;
}

/* ------------------------------------------------------------------------------------------ the company the documents were loaded for */

let loadedFor: string | undefined;

/** the app loaded its documents now: for the company known at that moment ('' = none) */
export function markDocumentsLoaded(): void {
  loadedFor = currentCompany();
}

/** the company changed after the documents were loaded (the user signed in / chose a company since): they are another company's — load the app again */
export const documentsAreStale = (): boolean => loadedFor !== undefined && (loadedFor || DEFAULT_COMPANY) !== (currentCompany() || DEFAULT_COMPANY);

/** for the tests */
export function resetCompanyScopeForTests(): void {
  lastRaw = undefined;
  lastCompany = '';
  loadedFor = undefined;
}
