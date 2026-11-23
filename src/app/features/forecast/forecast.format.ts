import { ForecastCategory } from './forecast.types';

/** ตัวช่วยจัดรูปของหน้า Forecast — ย้ายมาจาก "Helpers" ของต้นแบบ (B / sgn / dcls / mName / mShort) ; framework-free */

export type Lang = 'th' | 'en';

/** ลำดับหมวดของต้นแบบ (`CATS`) ; สีอยู่ใน forecast.scss (`--fc-cat-*`) */
export const CATEGORIES: readonly ForecastCategory[] = ['committed', 'bestcase', 'pipeline', 'closed', 'omitted'];
export const CATEGORY_LABEL: Record<ForecastCategory, string> = {
  committed: 'Committed',
  bestcase: 'Best Case',
  pipeline: 'Pipeline',
  closed: 'Closed',
  omitted: 'Omitted',
};
/** สีของหมวด = ตัวแปร CSS ของหน้า (ไม่ฮาร์ดโค้ดสีใน TS) */
export const CATEGORY_COLOR: Record<ForecastCategory, string> = {
  committed: 'var(--fc-cat-committed)',
  bestcase: 'var(--fc-cat-bestcase)',
  pipeline: 'var(--fc-cat-pipeline)',
  closed: 'var(--fc-cat-closed)',
  omitted: 'var(--fc-cat-omitted)',
};
/** class ของป้ายหมวด (`catChip`) */
export const CATEGORY_CHIP: Record<ForecastCategory, string> = {
  committed: '',
  bestcase: 'c-blue',
  pipeline: 'c-grey',
  closed: 'c-good',
  omitted: 'c-bad',
};

/** 1,250,000 */
export function B(n: number | string | null | undefined): string {
  return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** +150,000 · −50,000 · ±0 */
export function sgn(v: number | string | null | undefined): string {
  const n = Math.round(Number(v || 0));
  return (n > 0 ? '+' : n < 0 ? '−' : '±') + B(Math.abs(n));
}

/** class สีของผลต่าง */
export function dcls(n: number | null | undefined): 'up' | 'down' | 'flat' {
  const v = Number(n || 0);
  return v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
}

const z = (n: number): string => String(n).padStart(2, '0');
const locale = (lang: Lang): string => (lang === 'en' ? 'en-US' : 'th-TH');

/** `YYYY-MM` → "พ.ย. 69" / "Nov 26" */
export function monthName(m: string, lang: Lang): string {
  const [y, mm] = m.split('-').map(Number);
  return new Date(y, mm - 1, 1).toLocaleDateString(locale(lang), { month: 'short', year: '2-digit' });
}

/** `YYYY-MM` → "พ.ย." / "Nov" */
export function monthShort(m: string, lang: Lang): string {
  return new Date(2026, Number(m.slice(5)) - 1, 1).toLocaleDateString(locale(lang), { month: 'short' });
}

/** เลขเดือน 1–12 → "พฤศจิกายน" / "November" */
export function monthLong(month: number, lang: Lang): string {
  return new Date(2026, month - 1, 1).toLocaleDateString(locale(lang), { month: 'long' });
}

/** ปีที่แสดง : ไทย = พ.ศ. (ต้นแบบ) · อังกฤษ = ค.ศ. */
export function yearLabel(year: number | string, lang: Lang): string {
  return String(Number(year) + (lang === 'en' ? 0 : 543));
}

export function yearMonths(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${z(i + 1)}`);
}

/** เลื่อน `YYYY-MM` ไป n เดือน */
export function addMonths(m: string, n: number): string {
  const [y, mm] = m.split('-').map(Number);
  const d = new Date(y, mm - 1 + n, 1);
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}`;
}

export function clientMonth(now = new Date()): string {
  return `${now.getFullYear()}-${z(now.getMonth() + 1)}`;
}

/** ISO date-time ของ API → `dd/MM/yyyy HH:mm` (รูปของต้นแบบ) ; อ่านไม่ออก = คืนข้อความเดิม */
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`;
}
