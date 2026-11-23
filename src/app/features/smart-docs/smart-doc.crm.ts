/**
 * The quotation's customers (ลูกค้ามุ่งหวัง · ggwprospect) are the customers of CRM (ลูกค้าเป้าหมาย): the people of `core/mock/crm-seed`
 * with what the user changed in `core/mock/shared-db` — the same customers the prospect list, the opportunities, the activities and
 * the schedule show. Framework-free (the spec runs in Node).
 *
 *   - start: the list the script searches = the CRM customers (name, phone, e-mail, province always as CRM has them now) with the
 *     fields only a quotation keeps (tax id, address, postcode, country, fax — saved in Smart Doc's own state), after the prototype's
 *     sample customers;
 *   - after a user action: a CRM customer whose name / phone / e-mail / province was edited in the quotation is updated in CRM, and a
 *     customer created in the quotation becomes a CRM customer (so it is in the CRM prospect list too).
 *
 * The business partners of the booking / delivery / receipt (businesspartner) are not CRM's: they stay in Smart Doc's state.
 *
 * FAST-DEBT(REQ): the prototype's sample customers (P26-001xx) stay in Smart Doc only — they are not pushed into CRM · BIG · 2026-11-20
 * FAST-DEBT(API): CRM has no tax id / address for a customer yet (spec ggwprospect has them): kept by Smart Doc per customer code · BIG · 2026-11-20
 */
import { prospectIds, seedProspect } from '@core/mock/crm-seed';
import { sharedDb, splitName, upsertSharedProspect } from '@core/mock/shared-db';

/** a customer as the prototype's script keeps it (`prospects` of the quotation) */
export interface SmartDocProspect {
  code: string;
  name: string;
  taxId: string;
  addr: string;
  prov: string;
  zip: string;
  country: string;
  tel: string;
  email: string;
  fax: string;
}

interface CrmEntry {
  id: number;
  prospect: SmartDocProspect;
}

/** the ids of the CRM customers a quotation creates (the Leads page uses 2000+, the prospect form 1000+) */
const FIRST_ID = 3000;
const LAST_ID = 3999;
const DEFAULT_COUNTRY = 'ไทย';
const SOURCE = 'Smart Doc';

const digits = (text: string): string => text.replace(/\D/g, '');
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** `0812345678` → `081-234-5678` (CRM's way of writing a phone); a number of another length is kept as typed */
export function crmPhone(tel: string): string {
  const d = digits(tel);
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return tel.trim();
}

/** a value of the script's list as a customer (anything that is not a text becomes empty) */
export function asProspect(value: unknown): SmartDocProspect {
  const o = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    code: text(o['code']),
    name: text(o['name']),
    taxId: text(o['taxId']),
    addr: text(o['addr']),
    prov: text(o['prov']),
    zip: text(o['zip']),
    country: text(o['country']),
    tel: text(o['tel']),
    email: text(o['email']),
    fax: text(o['fax']),
  };
}

/** the CRM customers now, by code */
function crmIndex(): Map<string, CrmEntry> {
  const index = new Map<string, CrmEntry>();
  for (const id of prospectIds()) {
    const p = seedProspect(id);
    index.set(p.code, {
      id,
      prospect: {
        code: p.code,
        name: p.fullName,
        taxId: '',
        addr: '',
        prov: p.province,
        zip: '',
        country: DEFAULT_COUNTRY,
        tel: digits(p.phone),
        email: p.email,
        fax: '',
      },
    });
  }
  return index;
}

export const crmProspectCodes = (): Set<string> => new Set(crmIndex().keys());

/**
 * The list the script starts with: the customers of `saved` that are not CRM's (the prototype's samples) first, then every CRM
 * customer — CRM's name / phone / e-mail / province, the other fields from `saved` when it has them.
 */
export function mergeProspects(saved: readonly unknown[]): SmartDocProspect[] {
  const crm = crmIndex();
  const kept = new Map(saved.map(asProspect).map((p) => [p.code, p]));
  const local = [...kept.values()].filter((p) => !crm.has(p.code));
  const fromCrm = [...crm.values()].map(({ prospect }) => {
    const own = kept.get(prospect.code);
    return own
      ? {
          ...own,
          name: prospect.name,
          tel: prospect.tel,
          email: prospect.email,
          prov: prospect.prov,
        }
      : prospect;
  });
  return [...local, ...fromCrm];
}

const sameForCrm = (a: SmartDocProspect, b: SmartDocProspect): boolean =>
  a.name.trim() === b.name.trim() &&
  digits(a.tel) === digits(b.tel) &&
  a.email.trim() === b.email.trim() &&
  a.prov.trim() === b.prov.trim();

const patchOf = (p: SmartDocProspect) => ({
  fullName: p.name.trim(),
  ...splitName(p.name),
  phone: crmPhone(p.tel),
  email: p.email.trim(),
  province: p.prov.trim(),
});

function nextCrmId(): number {
  const used = sharedDb().addedProspects.filter((id) => id >= FIRST_ID && id <= LAST_ID);
  return used.length ? Math.max(...used) + 1 : FIRST_ID;
}

/** `YYYY-MM-DD` of today in Bangkok (CRM's createdDate) */
const today = (): string => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });

export interface CrmSync {
  /** codes of the customers created in CRM */
  created: string[];
  /** codes of the CRM customers updated */
  updated: string[];
}

/**
 * Writes back to CRM what the quotation did to its customers. `local` = the codes that were not CRM's when the page opened (the
 * prototype's samples): those stay in Smart Doc; any other code CRM does not know was created in the quotation and is added.
 */
export function syncProspectsToCrm(list: readonly unknown[], local: ReadonlySet<string>): CrmSync {
  const crm = crmIndex();
  const out: CrmSync = { created: [], updated: [] };
  for (const p of list.map(asProspect)) {
    if (!p.code || !p.name.trim()) continue;
    const known = crm.get(p.code);
    if (known) {
      if (sameForCrm(p, known.prospect)) continue;
      upsertSharedProspect(known.id, patchOf(p));
      out.updated.push(p.code);
    } else if (!local.has(p.code)) {
      upsertSharedProspect(
        nextCrmId(),
        { code: p.code, ...patchOf(p), source: SOURCE, createdDate: today() },
        true,
      );
      out.created.push(p.code);
    }
  }
  return out;
}
