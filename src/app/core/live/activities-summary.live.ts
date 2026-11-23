/**
 * One item of `GET /contact-activity-summaries` (view BY_OPPORTUNITY) as the item the parser of the old list reads (`ContactActivityItem`).
 * The columns of the tab "by opportunity", in the order of the table:
 *
 *   ติดต่อล่าสุด          lastActivityAt              → lastContactDate
 *   ชื่อผู้ติดต่อ         responsible.name            → contactName (+ code, avatar)
 *   ชื่อลูกค้า            prospect.name               → prospectName (+ id, code, avatar)
 *   ขั้นตอนปัจจุบัน       activity.name               → procedureName (+ id)
 *   Note · LINE · FB · WhatsApp · Email · SMS · Call · Visit   activity.summary → the counters, one after the other
 *   วันที่มอบหมาย         assignedAt                  → assignDate
 *   สถานะ               opportunity.status          → leadStatus / activeStatus (the badge)
 *
 * The id of the row is `opportunity.id` (else `id`). `activity.summary` is read as the counters of the eight channels: an object by the name of the channel
 * (`note`, `line`, `facebook` | `fb`, `whatsapp`, `email`, `sms`, `call`, `visit`), a list of `{ channel | type | name, count | total }`, a list of numbers or an object whose
 * names are not channels — those two in the order of the columns ("ใส่ไปเรื่อย ๆ").
 * ★ The shape of `activity.summary` has not been seen: check it against a real answer.
 */
import { isObj, type JObj } from './org-json';

/** the columns of the channels in the order of the table: the name of the counter in the old list, and the other names a service may use for it */
const CHANNELS: readonly (readonly [key: string, aliases: readonly string[]])[] = [
  ['note', ['note', 'notes']],
  ['line', ['line']],
  ['facebook', ['facebook', 'fb']],
  ['whatsapp', ['whatsapp', 'whatsApp']],
  ['email', ['email', 'mail']],
  ['sms', ['sms']],
  ['call', ['call', 'phone', 'tel']],
  ['visit', ['visit']],
];

const text = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
const count = (v: unknown): number => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.max(0, Math.trunc(Number(v))) : 0);
const named = (v: unknown, keys: readonly string[]): string => {
  if (!isObj(v)) return text(v);
  for (const k of keys) if (text(v[k]) !== '') return text(v[k]);
  return '';
};

/** the channel a name stands for (`Facebook`, `FB`, `call_out` → `call`), or undefined when it is none of the eight */
function channelOfName(name: string): string | undefined {
  // `visitCount` / `call_total` name the counter of a channel too
  const lower = name.toLowerCase().replace(/(count|total)$/, '').replace(/[_\s]+$/, '');
  return CHANNELS.find(([, aliases]) => aliases.some((a) => lower === a.toLowerCase() || lower.startsWith(`${a.toLowerCase()}_`) || lower.startsWith(`${a.toLowerCase()} `)))?.[0];
}

/** the counters of the channels (all eight, 0 where the summary has none) */
export function channelCounts(summary: unknown, inOrder = true): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(CHANNELS.map(([key]) => [key, 0]));
  const entries: [string | undefined, number][] = [];
  if (Array.isArray(summary)) {
    for (const e of summary) entries.push(isObj(e) ? [channelOfName(named(e, ['channel', 'type', 'name', 'key'])), count(e['count'] ?? e['total'] ?? e['value'])] : [undefined, count(e)]);
  } else if (isObj(summary)) {
    for (const [k, v] of Object.entries(summary)) entries.push([channelOfName(k), count(isObj(v) ? (v['count'] ?? v['total']) : v)]);
  }
  const byName = entries.filter(([channel]) => channel !== undefined);
  if (byName.length > 0) {
    for (const [channel, n] of byName) out[channel as string] += n;
    return out;
  }
  // no name is a channel: the values go into the columns in order (only where the list is known to be the counters: `activity.summary`)
  if (!inOrder) return out;
  entries.slice(0, CHANNELS.length).forEach(([, n], i) => {
    out[CHANNELS[i][0]] = n;
  });
  return out;
}

/**
 * the counters of an item: the fields of the item itself (`visitCount`, `noteCount` …), else its `summary` (by the name of the channel only), else `activity.summary` (by name, or in the
 * order of the columns)
 */
function countersOf(item: JObj, activity: JObj): Record<string, number> {
  const own = Object.fromEntries(CHANNELS.map(([key, aliases]) => [key, count(aliases.map((a) => item[`${a}Count`]).find((v) => v !== undefined && v !== null))]));
  const total = (c: Record<string, number>): number => Object.values(c).reduce((a, b) => a + b, 0);
  const summary = channelCounts(item['summary'], false);
  // `visitCount` is on the item while the other counters are in its `summary`: each channel takes the larger of the two
  const merged = Object.fromEntries(CHANNELS.map(([key]) => [key, Math.max(own[key], summary[key])]));
  return total(merged) > 0 ? merged : channelCounts(activity['summary']);
}

/** a date of the service (ISO with `Z` or an offset) as the local time of Thailand without an offset, so that the page cuts the right day (23:00Z is already the next day there) */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
function bangkokTime(value: unknown): string {
  const raw = text(value);
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(raw)) return raw;
  const time = Date.parse(raw);
  return Number.isNaN(time) ? raw : new Date(time + BANGKOK_OFFSET_MS).toISOString().slice(0, 19);
}

/**
 * who is responsible: `responsible` of the item; when it is null (an opportunity not assigned as a whole), `opportunity.responsible`, else the first child that has one. When nobody
 * has one the contact stays empty (the data has none).
 */
function responsibleOf(item: JObj): JObj {
  const own = [item['responsible'], isObj(item['opportunity']) ? item['opportunity']['responsible'] : undefined];
  const kids = Array.isArray(item['children']) ? item['children'].map((k) => (isObj(k) ? k['responsible'] : undefined)) : [];
  return [...own, ...kids].find((r): r is JObj => isObj(r) && text(r['name']) !== '') ?? {};
}

/** one item of the list as the item the parser reads; what the item already says in the old names (`leadId`, `contactName` …) is kept */
export function summaryItemOf(item: unknown): unknown {
  if (!isObj(item)) return item;
  const opportunity = isObj(item['opportunity']) ? item['opportunity'] : {};
  const responsible = responsibleOf(item);
  const prospect = isObj(item['prospect']) ? item['prospect'] : {};
  const activity = isObj(item['activity']) ? item['activity'] : {};
  const status = named(opportunity['status'], ['code', 'name']);
  const kids = Array.isArray(item['children']) ? item['children'].map(summaryItemOf) : [];
  const children = Array.isArray(item['children']) ? { children: kids } : {};
  const mapped: JObj = {
    leadId: opportunity['id'] ?? item['opportunityId'] ?? item['id'],
    txNo: text(opportunity['txno'] ?? opportunity['txNo']),
    contactCode: text(responsible['code']),
    contactId: responsible['id'],
    contactName: text(responsible['name']),
    contactAvatar: text(responsible['avatarUrl'] ?? responsible['avatar']),
    prospectId: prospect['id'],
    prospectCode: text(prospect['code']),
    prospectName: text(prospect['name']),
    prospectAvatar: text(prospect['avatarUrl'] ?? prospect['avatar']),
    procedureId: activity['id'],
    procedureName: text(activity['name']),
    // a date that is null in the answer stays empty on the row (the data has none; it is not taken from a child)
    lastContactDate: bangkokTime(item['lastActivityAt']),
    assignDate: bangkokTime(item['assignedAt']),
    leadStatus: status,
    activeStatus: status,
    ...countersOf(item, activity),
  };
  // what the item has under the names of the old list wins; the empty ones are not written
  const out: JObj = { ...item };
  for (const [k, v] of Object.entries(mapped)) if (v !== undefined && v !== '' && (out[k] === undefined || out[k] === null || out[k] === '')) out[k] = v;
  return { ...out, ...children };
}
