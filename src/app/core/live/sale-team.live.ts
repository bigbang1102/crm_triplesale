/**
 * The sales teams, sales people and responsibles of the modals of the opportunity detail ("change the sales employee": `GET /board/sale-groups`, `GET /board/sale-persons?saleGroupId=`;
 * "add the responsible": `GET /board/employees` = the list `responsibleFilter`),
 * from the lists of `GET /opportunities/filter-options?sets=…` (OP07) kept in sessionStorage (as `pipelines`, see options-cache.ts):
 *   - the opportunities page keeps every set it asks (`keepFilterSets`);
 *   - the modal reads them from the session; a set that is NOT there is asked of `filter-options?sets=<only the missing ones>` and kept;
 *   - the people of a team: the code of the chosen team (looked up in `saleGroups`) is compared with the team code of each person.
 * A set that cannot be had (the call failed, or the answer has no such list) → `null`: the next route answers as before (master-data).
 *
 * ★ A GUESS: no sample of the answer has been seen. A list is read from `result.<name>` (an array or a page `{ items | data | rows | content | list }`):
 *   saleGroups → saleGroups | teams | saleTeams, salePersons → salePersons | salesPersons | salePeople | sales; a row is `{ id, code, name }`; the team of a person is its
 *   `saleGroup.code` · `saleGroupCode` · `teamCode` · `groupCode` (else `saleGroup.id` · `saleGroupId` against the id of the team). Check the names against a real answer.
 */
import { optionKey, readOptions, writeOptions } from './options-cache';
import { get, jsonResponse, type RestDeps, type RouteHandler } from './rest';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

/** the set asked of filter-options → the names it may come under in the answer */
const SET_NAMES: Readonly<Record<string, readonly string[]>> = {
  pipelines: ['pipelines'],
  provinces: ['provinces'], // not asked (not in the sets); kept when the answer carries it
  tags: ['tags', 'tagOptions'],
  responsibleFilter: ['responsiblies', 'responsibleFilter', 'employees', 'responsibles', 'owners'],
  saleGroups: ['saleGroups', 'teams', 'saleTeams'],
  salePersons: ['salePersons', 'salesPersons', 'salePeople', 'sales'],
  fiscalYears: ['fiscalYears'],
};
/** every set of `GET /opportunities/filter-options` the pages ask (the opportunities page and the detail): `sets=` is the ones of these that are not in the session */
export const FILTER_OPTION_SETS: readonly string[] = ['pipelines', 'tags', 'saleGroups', 'salePersons', 'responsibleFilter', 'fiscalYears'];
const PAGE_KEYS = ['items', 'data', 'rows', 'content', 'list'] as const;

function listOf(result: Obj, names: readonly string[]): unknown[] | null {
  for (const n of names) {
    const v = result[n];
    if (Array.isArray(v)) return v;
    if (isObj(v)) for (const k of PAGE_KEYS) if (Array.isArray(v[k])) return v[k] as unknown[];
  }
  return null;
}

/** keeps every list of the answer that is there (a list with no rows is not kept) */
export function keepFilterSets(deps: RestDeps, result: Obj): void {
  for (const [set, names] of Object.entries(SET_NAMES)) {
    const rows = listOf(result, names);
    if (rows && rows.length > 0) writeOptions(optionKey(deps, set), rows);
  }
}

const IN_FLIGHT = new Map<string, Promise<boolean>>();

/**
 * the kept rows of each set (null = not kept: never asked, or it came empty); the sets that are not kept are asked together in ONE call (the ones that come
 * are kept). `failed` = the call was made and the service did not answer it (a call that answered without a list is not a failure).
 */
export async function askSets(deps: RestDeps, sets: readonly string[]): Promise<{ rows: Record<string, Obj[] | null>; failed: boolean }> {
  const read = (): Record<string, Obj[] | null> =>
    Object.fromEntries(sets.map((s) => [s, readOptions<unknown>(optionKey(deps, s))?.filter(isObj) ?? null]));
  let rows = read();
  let failed = false;
  const missing = sets.filter((s) => rows[s] === null);
  if (missing.length > 0) {
    const key = optionKey(deps, 'filterOptionsAsked', missing.join(','));
    let call = IN_FLIGHT.get(key);
    if (!call) {
      call = (async (): Promise<boolean> => {
        const u = await get(deps, '/opportunities/filter-options', { sets: missing.join(',') });
        if (!u.ok || !isObj(u.json)) return false;
        const result = 'result' in u.json ? (u.json as Obj)['result'] : u.json;
        if (isObj(result)) keepFilterSets(deps, result);
        return true;
      })().finally(() => IN_FLIGHT.delete(key));
      IN_FLIGHT.set(key, call);
    }
    failed = !(await call);
    rows = read();
  }
  return { rows, failed };
}

export const ensureSets = async (deps: RestDeps, sets: readonly string[]): Promise<Record<string, Obj[] | null>> => (await askSets(deps, sets)).rows;

/** a fiscal year for the dropdown of the target year: the value is the id, the label is `yearValue` (else the name / code / year) */
const yearRow = (r: Obj): Obj => ({ ...r, id: r['id'], code: str(r['id']) || str(r['code']), name: str(r['yearValue']) || str(r['name']) || str(r['nameTh']) || str(r['code']) || str(r['year']) });

const teamRow = (r: Obj): Obj => ({ ...r, id: r['id'], code: str(r['code']), name: str(r['name']) || str(r['nameTh']) || str(r['code']) });

/** the team of a person: its code (else its id) */
function teamOf(p: Obj): { code: string; id: string } {
  const g = isObj(p['saleGroup']) ? p['saleGroup'] : isObj(p['team']) ? p['team'] : null;
  return {
    code: str(g?.['code']) || str(p['saleGroupCode']) || str(p['teamCode']) || str(p['groupCode']),
    id: str(g?.['id']) || str(p['saleGroupId']) || str(p['teamId']),
  };
}

/** the people of the team of this id: those whose team code is the code of the team (a person with no team code is compared by the id of the team) */
export function peopleOfTeam(groups: readonly Obj[], people: readonly Obj[], saleGroupId: string): Obj[] | null {
  const team = groups.find((g) => str(g['id']) === saleGroupId);
  if (!team) return null;
  const code = str(team['code']);
  return people
    .filter((p) => {
      const t = teamOf(p);
      return t.code !== '' ? code !== '' && t.code === code : t.id !== '' && t.id === saleGroupId;
    })
    .map(teamRow);
}

/**
 * ★ For now the sales people are NOT filtered by the team: `/board/sale-persons` answers every person (the `saleGroupId` is ignored). Set to true to give only
 * the people of the team again (`peopleOfTeam`: the code of the team against the team code of each person).
 */
const FILTER_PEOPLE_BY_TEAM = false;

/** the addresses of the two modals; null (the next route answers) when a list is not to be had */
export function saleTeamRoutes(deps: RestDeps): RouteHandler {
  return async (path, query, init) => {
    if ((init?.method ?? 'GET').toUpperCase() !== 'GET') return null;
    if (path === '/board/sale-groups') {
      const got = await ensureSets(deps, ['saleGroups']);
      return got['saleGroups'] ? jsonResponse(200, got['saleGroups'].map(teamRow)) : null;
    }
    if (path === '/board/fiscal-years') {
      // the years of "เป้าหมายในเดือน": the `fiscalYears` list (session first, else filter-options?sets=fiscalYears). The page sends the value of the option as `yearCode`,
      // which the service wants as the id of the year (target-year → targetYearId): `code` is the id
      const got = await ensureSets(deps, ['fiscalYears']);
      return got['fiscalYears'] ? jsonResponse(200, got['fiscalYears'].map(yearRow)) : null;
    }
    if (path === '/board/employees') {
      // the "ผู้รับผิดชอบ" dropdown of the modal "เพิ่มผู้รับผิดชอบ": the `responsibleFilter` list (session first, else filter-options?sets=responsibleFilter)
      const got = await ensureSets(deps, ['responsibleFilter']);
      return got['responsibleFilter'] ? jsonResponse(200, got['responsibleFilter'].map(teamRow)) : null;
    }
    if (path === '/board/sale-persons') {
      const groupId = (query.get('saleGroupId') ?? '').trim();
      if (!FILTER_PEOPLE_BY_TEAM || groupId === '') {
        const got = await ensureSets(deps, ['salePersons']);
        return got['salePersons'] ? jsonResponse(200, got['salePersons'].map(teamRow)) : null;
      }
      const got = await ensureSets(deps, ['saleGroups', 'salePersons']);
      if (!got['saleGroups'] || !got['salePersons']) return null;
      const people = peopleOfTeam(got['saleGroups'], got['salePersons'], groupId);
      return people ? jsonResponse(200, people) : null;
    }
    return null;
  };
}
