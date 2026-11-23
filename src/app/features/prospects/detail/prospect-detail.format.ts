/**
 * Display helpers of the prospect detail page — framework-free (the spec loads them in Node).
 * The page reads the same bean the form does (`ProspectFormView` of prospect-form.bean.ts in view mode), so every value here is a
 * `ContractBean` field; nothing below invents data.
 */
import type { ContractBean } from '../form/prospect-form-types';

/** `-` for an empty value (the form's view mode shows the same dash) */
export function dash(v: unknown): string {
  if (v == null) return '-';
  const s = String(v).trim();
  return s === '' ? '-' : s;
}

/** `yyyy-MM-dd[Thh:mm…]` → `dd/MM/yyyy` ('-' when it is not a date) */
export function dmy(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '-';
}

export type CustomerKind = 'person' | 'juristic';

/** the form keeps the type as `person` / `juristic` (anything else is read as a person, like the form's default panel) */
export function customerKind(c: Pick<ContractBean, 'customer_type'>): CustomerKind {
  return /^(juristic|company|org|organization)/i.test(c.customer_type ?? '') ? 'juristic' : 'person';
}

export type UsageStatus = 'release' | 'draft' | 'block';

/** `usagestatus` of the record: release · draft · block (an empty / unknown value is read as release, like `usageStatusNow()` of the form) */
export function usageStatus(c: Pick<ContractBean, 'usagestatus'>): UsageStatus {
  const s = (c.usagestatus ?? '').toLowerCase();
  return s === 'draft' || s === 'block' ? s : 'release';
}

/** "CS001 ชวัญจิรา" — the code and the name of a person, whichever exist */
export function codeAndName(code: string | null | undefined, name: string | null | undefined): string {
  return dash([code, name].map((x) => (x ?? '').trim()).filter(Boolean).join(' '));
}

export interface SocialChannel {
  key: 'line' | 'facebook' | 'x' | 'instagram';
  /** the account as typed on the form ('' = no account) */
  value: string;
}

/** the four social channels of the record, in the order of the form */
export function socialChannels(c: ContractBean): SocialChannel[] {
  return [
    { key: 'line', value: (c.prospect_line ?? '').trim() },
    { key: 'facebook', value: (c.prospect_facebook ?? '').trim() },
    { key: 'x', value: (c.prospect_twitter ?? '').trim() },
    { key: 'instagram', value: (c.prospect_instragram ?? '').trim() },
  ];
}
