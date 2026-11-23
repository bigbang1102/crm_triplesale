/**
 * OP06 — the appointments and the tasks of an opportunity, TWO endpoints:
 *   GET /opportunities/{opportunityId}/appointments   (permission `Pipeline_Schedule_Appointment_View`)
 *   GET /opportunities/{opportunityId}/tasks          (permission `Pipeline_Schedule_Task_View`)
 * The page reads them as `appointmentList` / `taskList` of the lead it loaded (`GET /board/lead`: the table of appointments, the table of tasks), so the detail route
 * asks both (at the same time, no query: the page is the first) and puts them in the lead. A call the service refuses (403 …) gives an empty list for that table
 * (`[schedules] <status>` in the console); the other one still fills.
 *
 * ★ A GUESS: no sample of the answer has been seen (the spec says: its own envelope, `meta.total`, `meta.maskedFields`; a masked `time` is null). Rows are read
 * from `result` as a list (else `result.items` · `result.data`) and given the names the page reads: `date` ← date | appointmentDate · `time` ← time | appointmentTime ·
 * both null → `allDay: true` · `activity` (the step of the row: an object `{ id, name }`, or its name as a text) → `procedureId` / `procedureName` (the column "ขั้นตอน"), `activityGroup`
 * (same shapes) → `procedureGroupId` / `procedureGroupName` (the colour of the row) · `title` ← topic | title | subject · `detail` ← detail | description · `taskAssigneeId|Code|Name` ← the object `taskAssignee` (else `assignee`); the rest goes through.
 */
import { get, type RestDeps } from './rest';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const firstOf = (o: Obj, keys: readonly string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return undefined;
};

/** the rows of one answer with the names the page reads */
export function scheduleRows(json: unknown): Obj[] {
  const result = isObj(json) && 'result' in json ? (json as Obj)['result'] : json;
  const list = Array.isArray(result) ? result : isObj(result) ? (Array.isArray(result['items']) ? result['items'] : Array.isArray(result['data']) ? result['data'] : []) : [];
  return list.filter(isObj).map((r) => {
    const out: Obj = { ...r };
    const put = (key: string, v: unknown): void => {
      if (v !== undefined && (out[key] === undefined || out[key] === null || out[key] === '')) out[key] = v;
    };
    put('date', firstOf(r, ['appointmentDate']));
    put('time', firstOf(r, ['appointmentTime']));
    put('title', firstOf(r, ['topic', 'subject']));
    put('detail', firstOf(r, ['description']));
    // TEMPORARY: the data on DEV is still wrong (rows come with no date and no time) — both null: "all day" for now (the page draws the label "ทั้งวัน" for `allDay`). Take it out when the data is right
    // the service says it is all day (`allDay`, also read as allDays | isAllDay | all_day): the page draws "ทั้งวัน" whatever the time is
    const flag = firstOf(r, ['allDay', 'allDays', 'isAllDay', 'all_day']);
    if (flag !== undefined) out['allDay'] = flag === true || flag === 1 || (typeof flag === 'string' && ['true', '1', 'y', 'yes'].includes(flag.trim().toLowerCase()));
    const none = (v: unknown): boolean => v === undefined || v === null || v === '';
    if (none(out['date']) && none(out['time'])) out['allDay'] = true; // also when the service says `allDay: false` (the data is wrong: no date and no time)
    // the step the row belongs to: `activity` is `{ id, name }` (else the name as a text); `activityGroup` the same for the group
    const named = (v: unknown): { id?: unknown; name?: unknown } => (isObj(v) ? { id: v['id'], name: firstOf(v, ['name', 'nameTh']) } : typeof v === 'string' && v.trim() !== '' ? { name: v.trim() } : {});
    const activity = named(r['activity']);
    put('procedureId', activity.id);
    put('procedureName', activity.name);
    const group = named(r['activityGroup']);
    put('procedureGroupId', group.id);
    put('procedureGroupName', group.name);
    const who = isObj(r['taskAssignee']) ? r['taskAssignee'] : isObj(r['assignee']) ? r['assignee'] : null;
    if (who) {
      put('taskAssigneeId', who['id']);
      put('taskAssigneeCode', who['code']);
      put('taskAssigneeName', firstOf(who, ['name', 'fullName']));
    }
    return out;
  });
}

/** both lists of an opportunity: `{ appointmentList, taskList }` (an empty list for a call that did not answer) */
export async function fetchOpportunitySchedules(deps: RestDeps, id: string): Promise<{ appointmentList: Obj[]; taskList: Obj[] }> {
  const ask = async (kind: 'appointments' | 'tasks'): Promise<Obj[]> => {
    const u = await get(deps, `/opportunities/${encodeURIComponent(id)}/${kind}`);
    if (!u.ok) {
      console.warn('[schedules] ' + kind + ' ' + u.status + ' for opportunity ' + id);
      return [];
    }
    return scheduleRows(u.json);
  };
  const [appointmentList, taskList] = await Promise.all([ask('appointments'), ask('tasks')]);
  return { appointmentList, taskList };
}
