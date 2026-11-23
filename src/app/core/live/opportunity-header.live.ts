/**
 * OP10 — change ONE field of the head of an opportunity: `PATCH /opportunities/{opportunityId}` with `{ version, <one field> }`; the answer is `{ result: { id, version, updatedAt } }`
 * (no head: the page keeps what it shows). The page saves each field with `POST /board/lead-update?action=…` (form: leadId + the value), so the actions that are fields of the head go here:
 *
 *   demand        demand=<text>                  → { demand }
 *   amount        amount=<number>                → { amount: "<string>" }     a masked / empty amount is NOT sent back (the service answers 422)
 *   active-status activeStatus=hot|warm|cold…    → { status: "HOT" }          only HOT · WARM · COLD · INACTIVE (SOLD · LOST = 422 at the service: not sent)
 *   target-month  month=1..12                    → { targetMonth, targetYearId }   as a PAIR: the year is the one the detail carried
 *   target-year   yearCode=<uuid>                → { targetMonth, targetYearId }   as a PAIR: the month is the one the detail carried
 *   tags          tagIds=<id>,<id>               → { tagIds: [...] }          the whole set (empty = clear), at most 5
 *
 * `version` is the one kept from the detail (and renewed from each answer: `result.version`), shared with OP11 / OP12 (opportunity-sale-person.live.ts). Any other action — `assign` and the
 * rest — goes on to the next route. A value the service would refuse is answered here with 422 and no call.
 * ★ A GUESS on where the target year comes from (`header.targetYear.id`): not seen on a sample with a value (it was null on DEV).
 */
import { keepVersion, targetsOf, versionOf } from './opportunity-sale-person.live';
import { jsonResponse, passThrough, service, type RestDeps, type RouteHandler } from './rest';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const STATUSES = new Set(['HOT', 'WARM', 'COLD', 'INACTIVE']);
const refuse = (message: string): Response => jsonResponse(422, { status: 422, message });

/** `req.getParameter`: the query string first, then the form body of a POST */
function param(query: URLSearchParams, init: RequestInit | undefined): (name: string) => string {
  let form: URLSearchParams | null = null;
  const b = init?.body;
  if ((init?.method ?? 'GET').toUpperCase() === 'POST' && (typeof b === 'string' || b instanceof URLSearchParams)) form = new URLSearchParams(typeof b === 'string' ? b : b.toString());
  return (name) => ((query.has(name) ? query.get(name) : form?.get(name) ?? '') ?? '').trim();
}

export function opportunityHeaderRoutes(deps: RestDeps): RouteHandler {
  return async (path, query, init) => {
    if (path !== '/board/lead-update' || (init?.method ?? 'GET').toUpperCase() !== 'POST') return null;
    const p = param(query, init);
    const action = p('action');
    const id = p('leadId');
    if (id === '' || !['demand', 'amount', 'active-status', 'target-month', 'target-year', 'tags'].includes(action)) return null;

    let field: Obj;
    switch (action) {
      case 'demand':
        field = { demand: p('demand') };
        break;
      case 'amount': {
        const a = p('amount');
        if (a === '' || /\*/.test(a) || !Number.isFinite(Number(a))) return refuse('amount is masked or not a number: not sent');
        field = { amount: a };
        break;
      }
      case 'active-status': {
        const st = p('activeStatus').toUpperCase();
        if (!STATUSES.has(st)) return refuse('status must be HOT · WARM · COLD · INACTIVE');
        field = { status: st };
        break;
      }
      case 'target-month': {
        const month = Number(p('month'));
        const t = targetsOf(id);
        if (!Number.isInteger(month) || month < 1 || month > 12) return refuse('targetMonth must be 1..12');
        if (!t.yearId) return refuse('the target year of the opportunity is not known: the month goes with it');
        field = { targetMonth: month, targetYearId: t.yearId };
        break;
      }
      case 'target-year': {
        const yearId = p('yearCode');
        const t = targetsOf(id);
        if (yearId === '' || t.month === undefined) return refuse('the target year goes with the month of the opportunity (not known)');
        field = { targetMonth: t.month, targetYearId: yearId };
        break;
      }
      default: {
        const ids = p('tagIds').split(',').map((x) => x.trim()).filter((x) => x !== '');
        if (ids.length > 5) return refuse('at most 5 tags');
        field = { tagIds: ids };
      }
    }

    const known = versionOf(id);
    if (known === undefined) console.warn('[opportunity-header] no version known for opportunity ' + id + ': sent without it');
    const u = await service(deps, 'PATCH', `/opportunities/${encodeURIComponent(id)}`, { body: { ...(known !== undefined ? { version: known } : {}), ...field }, headers: { 'Content-Type': 'application/json' } });
    if (u.ok) {
      const result = isObj(u.json) && isObj(u.json['result']) ? u.json['result'] : null;
      const next = result && typeof result['version'] === 'number' ? result['version'] : known !== undefined ? known + 1 : undefined;
      if (next !== undefined) keepVersion(id, next);
    }
    return passThrough(u);
  };
}
