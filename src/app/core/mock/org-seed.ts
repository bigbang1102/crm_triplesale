/**
 * The people and the activity groups of the cast as a document of the shared Datasource (`seed.org.json`, made by `npm run mockup:seed`):
 *   - employees      (SEED_EMPLOYEES: code · name · team · role)
 *   - groups         (SEED_GROUPS: id · code · name — the activity groups, in the order of the workflow)
 *   - groupMembers   (activity group id → employee codes: who is in the Wait List of each group — SEED_GROUP_MEMBERS)
 *   - employeePositions (employee code → the positions they hold — SEED_EMPLOYEE_POSITIONS, Settings › Roles)
 *   - names          (firstNames · lastNames · provinces · sources — the pools the sample customers are made from: SEED_FIRST_NAMES …)
 *
 * The lists are replaced IN PLACE (the pages hold the same arrays), and the file server is read before the pages load. A document that does not fit
 * is refused as a whole (the built-in lists stay) and the reason is returned. Framework-free.
 */
import { SEED_EMPLOYEES, SEED_FIRST_NAMES, SEED_GROUPS, SEED_LAST_NAMES, SEED_PROVINCES, SEED_SOURCES, type SeedEmployee, type SeedGroup } from './crm-seed';
import { SEED_GROUP_MEMBERS } from './activity-group-seed';
import { SEED_EMPLOYEE_POSITIONS } from './role-store';

export interface OrgDocument {
  employees: SeedEmployee[];
  groups: SeedGroup[];
  groupMembers?: Record<string, string[]>;
  employeePositions?: Record<string, string[]>;
  names?: SeedNames;
}

export interface SeedNames {
  firstNames: string[];
  lastNames: string[];
  provinces: string[];
  sources: string[];
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** what the code starts with: the way back when the document goes (and for the tests) */
const BUILT_IN: Required<OrgDocument> = {
  employees: copy(SEED_EMPLOYEES),
  groups: copy(SEED_GROUPS),
  groupMembers: copy(SEED_GROUP_MEMBERS) as Record<string, string[]>,
  employeePositions: copy(SEED_EMPLOYEE_POSITIONS),
  names: copy({ firstNames: SEED_FIRST_NAMES, lastNames: SEED_LAST_NAMES, provinces: SEED_PROVINCES, sources: SEED_SOURCES }),
};

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const rec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCodes = (v: unknown, known: ReadonlySet<string>): v is string[] => Array.isArray(v) && v.every((c) => typeof c === 'string' && known.has(c));

function replaceAll<T>(target: T[], rows: readonly T[]): void {
  target.splice(0, target.length, ...rows);
}

function replaceRecord<T>(target: Record<string, T>, source: Record<string, T>): void {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, source);
}

function problemOf(doc: Partial<OrgDocument>): string | undefined {
  const { employees, groups, groupMembers, employeePositions, names } = doc;
  if (!Array.isArray(employees) || !Array.isArray(groups) || employees.length === 0 || groups.length === 0) return 'seed.org: "employees" and "groups" must be lists with at least one row';
  if (!employees.every((e) => isRecord(e) && [e['code'], e['name'], e['team'], e['role']].every(isText))) return 'seed.org: every employee needs code, name, team and role';
  if (new Set(employees.map((e) => e.code)).size !== employees.length) return 'seed.org: an employee code is repeated';
  if (!groups.every((g) => isRecord(g) && Number.isInteger(g['id']) && isText(g['code']) && isText(g['name']))) return 'seed.org: every group needs an integer id, a code and a name';
  if (new Set(groups.map((g) => g.id)).size !== groups.length) return 'seed.org: a group id is repeated';
  const codes = new Set(employees.map((e) => e.code));
  const ids = new Set(groups.map((g) => String(g.id)));
  if (groupMembers !== undefined && !(isRecord(groupMembers) && Object.entries(groupMembers).every(([id, list]) => ids.has(id) && isCodes(list, codes)))) return 'seed.org: groupMembers must list known employees under known group ids';
  if (employeePositions !== undefined && !(isRecord(employeePositions) && Object.entries(employeePositions).every(([code, list]) => codes.has(code) && Array.isArray(list) && list.every((p) => typeof p === 'string')))) {
    return 'seed.org: employeePositions must list position codes under known employees';
  }
  if (names !== undefined && !(rec(names) && ['firstNames', 'lastNames', 'provinces', 'sources'].every((k) => Array.isArray(names[k]) && (names[k] as unknown[]).length > 0 && (names[k] as unknown[]).every(isText)))) {
    return 'seed.org: names needs firstNames, lastNames, provinces and sources, each a list of text with at least one entry';
  }
  return undefined;
}

/**
 * Takes the people and the groups from a document of the Datasource (`undefined` = the lists of the code). Returns why a document was refused;
 * a refused or missing document leaves the lists of the code.
 */
export function setOrgDocument(doc: unknown): string | undefined {
  const problem = doc === undefined || doc === null ? undefined : problemOf(isRecord(doc) ? (doc as Partial<OrgDocument>) : {});
  const use: Required<OrgDocument> = doc === undefined || doc === null || problem ? BUILT_IN : { ...BUILT_IN, ...(doc as OrgDocument), groupMembers: (doc as OrgDocument).groupMembers ?? {}, employeePositions: (doc as OrgDocument).employeePositions ?? {}, names: (doc as OrgDocument).names ?? BUILT_IN.names };
  replaceAll(SEED_EMPLOYEES, copy(use.employees));
  replaceAll(SEED_GROUPS, copy(use.groups));
  replaceRecord(SEED_GROUP_MEMBERS as Record<string, string[]>, copy(use.groupMembers));
  replaceRecord(SEED_EMPLOYEE_POSITIONS, copy(use.employeePositions));
  replaceAll(SEED_FIRST_NAMES, [...use.names.firstNames]);
  replaceAll(SEED_LAST_NAMES, [...use.names.lastNames]);
  replaceAll(SEED_PROVINCES, [...use.names.provinces]);
  replaceAll(SEED_SOURCES, [...use.names.sources]);
  return problem;
}
