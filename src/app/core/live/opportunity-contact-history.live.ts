/**
 * OP04 — the contact history of an opportunity: `GET /opportunities/{opportunityId}/contact-activities?page=&perPage=` (the list "ประวัติการติดต่อ" at the right of the detail page).
 * The page asks `GET /board/lead/contact-activities?leadId=<id>&page=<n>&perPage=<n>` (its own address) and reads `{ items: [entry], meta: { page, perPage, count } }`, where an entry is
 * the one the Java page read from `contactHistoryList`: `{ id, changeDate, channel, type, content, procedureGroupId / Name, procedureId / Name, employee: { id, code, name, attachFile } }`.
 * Filter: `channels` (`CALL_OUT,LINE`) is sent to the service; the service has no filter of group, step or responsible (see `channelsParam`).
 * One call = one page of the service: the page asks the first page when it opens and the next one when the list is scrolled to its end, while a page comes full
 * (`meta.count` = the number of activities of this page, `meta.perPage` = what was asked: count >= perPage → there may be more).
 *
 * ★ A GUESS: no sample of the answer has been seen. The activities are read from `result` as a list (else `result.items` · `result.data`); an activity is read as
 *   date ← changeDate | contactedAt | contactDate | createdAt | date · channel ← channel (text or { name }) · type (the icon) ← type, else the channel as a key (`Call Out` → `call_out`)
 *   content ← content | detail | description | note · group ← activityGroup | procedureGroup { id, name } (else procedureGroupId / procedureGroupName)
 *   step ← activity | procedure { id, name } (else procedureId / procedureName) · who (beside the time) ← recorder | createdBy, else responsibleEmployee, else employee | salePerson { id, code, name, attachFile }
 * `workRecordDate` (also workRecordedAt | referenceDate) is the "เวลาอ้างอิง" the page shows after the text.
 * An activity with no text shows "ติดต่อด้วย <channel>" (`app.contactHistory.contactVia`) after its icon.
 * A call the service refuses answers an empty page (count 0: nothing more is asked).
 */
import { get, jsonResponse, type RestDeps, type RouteHandler } from './rest';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
const firstOf = (o: Obj, keys: readonly string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return undefined;
};

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;
const DATE_KEYS = ['changeDate', 'contactedAt', 'contactDate', 'createdAt', 'date'] as const;
const CONTENT_KEYS = ['content', 'detail', 'description', 'note'] as const;
const WORK_RECORD_KEYS = ['workRecordDate', 'workRecordedAt', 'referenceDate'] as const;
/** who is shown beside the time: the recorder first; with none, the responsible employee (then the other names a person may come under) */
const WHO_KEYS = ['recorder', 'createdBy', 'responsibleEmployee', 'employee', 'salePerson'] as const;
/** the label of a channel / a place / a person that may come as a text or as `{ name }` */
const labelOf = (v: unknown): string => (isObj(v) ? text(firstOf(v, ['name', 'nameTh', 'label', 'code'])) : text(v));

/** the activities of an answer (a list, or a page of one) */
export function activityRows(json: unknown): Obj[] {
  const result = isObj(json) && 'result' in json ? (json as Obj)['result'] : json;
  const list = Array.isArray(result) ? result : isObj(result) ? (Array.isArray(result['items']) ? result['items'] : Array.isArray(result['data']) ? result['data'] : []) : [];
  return list.filter(isObj);
}

/** one place (group or step) of an activity: `{ id, name }` from the object, else from the flat `<prefix>Id` / `<prefix>Name` */
function placeOf(row: Obj, objectKeys: readonly string[], flat: string): { id: unknown; name: string } {
  for (const key of objectKeys) {
    const o = row[key];
    if (isObj(o)) return { id: o['id'] ?? null, name: labelOf(o) };
  }
  return { id: row[`${flat}Id`] ?? null, name: text(row[`${flat}Name`]) };
}

/** the person of an activity as the page reads it (`id`, `code`, `name`, `attachFile`): the first of WHO_KEYS that is a person with something in it */
function whoOf(row: Obj): Obj {
  for (const key of WHO_KEYS) {
    const o = row[key];
    if (!isObj(o)) continue;
    const who = { id: o['id'], code: text(o['code']), name: labelOf(o), attachFile: text(firstOf(o, ['attachFile', 'avatarUrl', 'avatar'])) };
    if (who.id !== undefined && who.id !== null) return who;
    if (who.code !== '' || who.name !== '') return who;
  }
  return {};
}

/** where a `content` / `channel` may sit when it is not on the activity itself: an object of the activity, or the entries of a list of it */
const NESTED_OBJECTS = ['contact', 'contactInfo', 'contactDetail', 'detail', 'activity'] as const;
const NESTED_LISTS = ['items', 'contacts', 'contactItems', 'details', 'contents'] as const;

/** the text of an activity: its own `content`, else the `content` of an object / of the entries of a list inside it (the texts of a list are joined with a line break) */
function contentOf(row: Obj): string {
  const own = text(firstOf(row, CONTENT_KEYS));
  if (own !== '') return own;
  for (const key of NESTED_OBJECTS) {
    const o = row[key];
    if (isObj(o)) {
      const inner = text(firstOf(o, CONTENT_KEYS));
      if (inner !== '') return inner;
    }
  }
  for (const key of NESTED_LISTS) {
    const list = row[key];
    if (Array.isArray(list)) {
      const texts = list.filter(isObj).map((e) => text(firstOf(e, CONTENT_KEYS))).filter((t) => t !== '');
      if (texts.length > 0) return texts.join('\n');
    }
  }
  return '';
}

/** the channel of an activity: its own, else the one of an object / of the first entry of a list inside it */
function channelOf(row: Obj): string {
  const own = labelOf(row['channel']);
  if (own !== '') return own;
  for (const key of NESTED_OBJECTS) {
    const o = row[key];
    if (isObj(o) && labelOf(o['channel']) !== '') return labelOf(o['channel']);
  }
  for (const key of NESTED_LISTS) {
    const list = row[key];
    if (Array.isArray(list)) for (const e of list) if (isObj(e) && labelOf(e['channel']) !== '') return labelOf(e['channel']);
  }
  return '';
}

/** the key of the icon of a channel: `Call Out` → `call_out` */
const iconKeyOf = (channel: string): string => channel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** one activity as the entry of the history the page reads */
export function historyEntryOf(row: Obj, contactVia = 'ติดต่อด้วย'): Obj {
  const group = placeOf(row, ['activityGroup', 'procedureGroup'], 'procedureGroup');
  const step = placeOf(row, ['activity', 'procedure'], 'procedure');
  const channel = channelOf(row);
  const workRecordDate = text(firstOf(row, WORK_RECORD_KEYS));
  return {
    id: row['id'],
    changeDate: text(firstOf(row, DATE_KEYS)),
    channel,
    type: text(row['type']) || iconKeyOf(channel),
    // no text on the activity: the default is how it was made, "contacted via <channel>" (nothing when there is no channel either)
    content: contentOf(row) || (channel !== '' ? `${contactVia} ${channel}` : ''),
    procedureGroupId: group.id,
    procedureGroupName: group.name,
    procedureId: step.id,
    procedureName: step.name,
    employee: whoOf(row),
    // "เวลาอ้างอิง": the time the work was done, shown after the text (the page draws it from `workRecordDate` when there is one)
    ...(workRecordDate !== '' ? { workRecordDate } : {}),
  };
}

/**
 * the filter of channels the page sends (`channels=call in,Call out`: the values of the filter modal) as the service wants them: `CALL_IN,CALL_OUT` (upper case, one `_` between the
 * words). The service filters by channel only: the group, the step and the responsible of the filter are not sent (the service has no such filter) — the page applies them to the
 * pages it has.
 */
export function channelsParam(value: string | null): string {
  const keys = (value ?? '')
    .split(',')
    .map((c) => c.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, ''))
    .filter((c) => c !== '');
  return [...new Set(keys)].join(',');
}

const positive = (value: string | null, fallback: number, max: number): number => {
  const n = Number((value ?? '').trim());
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
};

export function opportunityContactHistoryRoutes(deps: RestDeps): RouteHandler {
  return async (path, query, init) => {
    if (path !== '/board/lead/contact-activities' || (init?.method ?? 'GET').toUpperCase() !== 'GET') return null;
    const id = (query.get('leadId') ?? '').trim();
    if (id === '') return jsonResponse(400, { status: 400, message: 'leadId required' });
    const page = positive(query.get('page'), 1, Number.MAX_SAFE_INTEGER);
    const perPage = positive(query.get('perPage'), DEFAULT_PER_PAGE, MAX_PER_PAGE);
    const channels = channelsParam(query.get('channels'));
    const u = await get(deps, `/opportunities/${encodeURIComponent(id)}/contact-activities`, { page, perPage, channels });
    const rows = u.ok ? activityRows(u.json) : [];
    return jsonResponse(200, { items: rows.map((r) => historyEntryOf(r, deps.message('app.contactHistory.contactVia'))), meta: { page, perPage, count: rows.length } });
  };
}
