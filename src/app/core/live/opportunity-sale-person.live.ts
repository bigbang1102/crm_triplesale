/**
 * The two saves of the opportunity detail that change WHO looks after an opportunity (both are `POST /board/lead-update?action=assign` on the page):
 *
 *   OP12 — the modal "เปลี่ยนพนักงานขาย":   form action=assign, leadId, saleGroupId, salePersonId[, employeeId = the CURRENT one]
 *     → POST /opportunities/{leadId}/sale-person   { version, salePersonId }
 *   OP11 — the modal "เพิ่ม / เปลี่ยนผู้รับผิดชอบ": the same form, marked `op=responsible`, employeeId = the new responsible
 *     → POST /opportunities/{leadId}/responsible   { version, responsibleEmployeeId }
 *   both with the header `Idempotency-Key: <uuid>`.
 *
 * Only an `assign` that carries a `salePersonId` (OP12) or is marked `op=responsible` with an `employeeId` (OP11) is answered here (the sales team is not a field of either
 * call: the service knows the team of the person). Any other call goes on to the next route (the old `lead-update`). `X-Expected-Company` is
 * added by the HTTP interceptor; the Idempotency-Key is made here, once per save. The status and the body of the service are passed on untouched.
 *
 * `version` = the optimistic-lock number of the opportunity, read from the answer of the detail (`header.version`, else `version`) when the page loaded it
 * (`rememberOpportunityVersion`) and renewed from the answer of this call (`result.version`, else +1). ★ A GUESS: no sample of the answer has been seen; without a
 * known version the field is left out and the service decides. `reason` is not asked by the modal (it has no field for it): left out.
 */
import { passThrough, service, type RestDeps, type RouteHandler } from './rest';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const VERSIONS = new Map<string, number>();
/** what the detail carried of the target month / year (OP10 changes them as a PAIR) */
const TARGETS = new Map<string, { month?: number; yearId?: string }>();

/** the version OP10 / OP11 / OP12 send (undefined = not known) and its renewal after a call that the service accepted */
export const versionOf = (id: string): number | undefined => VERSIONS.get(id);
export const keepVersion = (id: string, n: number): void => void VERSIONS.set(id, n);
export const targetsOf = (id: string): { month?: number; yearId?: string } => TARGETS.get(id) ?? {};
export const keepTargets = (id: string, t: { month?: number; yearId?: string }): void => void TARGETS.set(id, { ...TARGETS.get(id), ...t });

/**
 * keeps the version of the opportunity the detail was loaded with: `body` = the `result` of GET /opportunities/{id}, `meta` = its `meta`. Read from `result.header.version`,
 * else `result.version`, else `meta.version` (★ a guess: where the service puts it has not been seen).
 */
export function rememberOpportunityVersion(id: string, body: unknown, meta: unknown = null): void {
  const header = isObj(body) && isObj(body['header']) ? body['header'] : null;
  if (id !== '' && header) {
    const m = Number(header['targetMonth']);
    const ty = header['targetYear'];
    keepTargets(id, { ...(Number.isFinite(m) && header['targetMonth'] !== null && header['targetMonth'] !== '' ? { month: m } : {}), ...(isObj(ty) && ty['id'] !== undefined && ty['id'] !== null ? { yearId: String(ty['id']) } : {}) });
  }
  const candidates = [header?.['version'], isObj(body) ? body['version'] : undefined, isObj(meta) ? meta['version'] : undefined];
  for (const v of candidates) {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (id !== '' && Number.isFinite(n)) {
      VERSIONS.set(id, n);
      return;
    }
  }
}

const newKey = (): string => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** `req.getParameter`: the query string first, then the form body of a POST */
function param(query: URLSearchParams, init: RequestInit | undefined): (name: string) => string {
  let form: URLSearchParams | null = null;
  const b = init?.body;
  if ((init?.method ?? 'GET').toUpperCase() === 'POST' && (typeof b === 'string' || b instanceof URLSearchParams)) form = new URLSearchParams(typeof b === 'string' ? b : b.toString());
  return (name) => (query.has(name) ? query.get(name) : form?.get(name) ?? '')?.trim() ?? '';
}

export function opportunitySalePersonRoutes(deps: RestDeps): RouteHandler {
  return async (path, query, init) => {
    if (path !== '/board/lead-update' || (init?.method ?? 'GET').toUpperCase() !== 'POST') return null;
    const p = param(query, init);
    if (p('action') !== 'assign' || p('leadId') === '') return null;
    const responsible = p('op') === 'responsible';
    if (responsible ? p('employeeId') === '' : p('salePersonId') === '') return null;
    const id = p('leadId');
    const known = VERSIONS.get(id);
    if (known === undefined) console.warn('[' + (responsible ? 'responsible' : 'sale-person') + '] no version known for opportunity ' + id + ' (GET /opportunities/{id} carried none in result.header.version · result.version · meta.version): sent without it');
    const body: Obj = { ...(known !== undefined ? { version: known } : {}), ...(responsible ? { responsibleEmployeeId: p('employeeId') } : { salePersonId: p('salePersonId') }) };
    const u = await service(deps, 'POST', `/opportunities/${encodeURIComponent(id)}/${responsible ? 'responsible' : 'sale-person'}`, {
      body,
      headers: { 'Idempotency-Key': newKey(), 'Content-Type': 'application/json' },
    });
    if (u.ok) {
      const result = isObj(u.json) && isObj(u.json['result']) ? u.json['result'] : null;
      const next = result && typeof result['version'] === 'number' ? result['version'] : known !== undefined ? known + 1 : undefined;
      if (next !== undefined) VERSIONS.set(id, next);
    }
    return passThrough(u);
  };
}
