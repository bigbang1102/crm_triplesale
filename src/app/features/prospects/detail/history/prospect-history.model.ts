/**
 * The "ประวัติการแก้ไข" tab of the prospect detail page — framework-free (the spec loads it in Node).
 * The edit history of a prospect has no API yet; until it exists the tab shows `mockProspectHistory()` in both modes. The shape below is what the table needs,
 * so the live adapter only has to fill it.
 */
export interface ProspectHistoryEntry {
  id: string;
  /** `yyyy-MM-ddTHH:mm[:ss]` of the edit (local time, no zone) */
  at: string;
  /** the field that was changed, as it is named on screen ("เบอร์โทร", "LINE", "ผู้รับผิดชอบ") */
  field: string;
  oldValue: string;
  newValue: string;
  /** who changed it ("MK01 ชวัญจิรา") */
  editor: string;
}

/** `2026-07-02T10:14:00` → `02/07/2026 10:14` ('-' when it is not a date-time) */
export function historyTime(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : '-';
}

/** the newest edit first (what the table shows); an entry with no readable time goes last */
export function newestFirst(entries: readonly ProspectHistoryEntry[]): ProspectHistoryEntry[] {
  const key = (e: ProspectHistoryEntry): string => (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(e.at) ? e.at.replace(' ', 'T') : '');
  return [...entries].sort((a, b) => key(b).localeCompare(key(a)));
}

/** an empty value is shown as "-" */
export function shown(v: string): string {
  return v.trim() === '' ? '-' : v;
}

/* ---------------------------------------------------------------------------------------------------- mock data */
const FIELDS: readonly [field: string, a: string, b: string][] = [
  ['เบอร์มือถือ #1', '081-111-2222', '081-222-3333'],
  ['อีเมล', 'old@example.com', 'new@example.com'],
  ['Facebook', 'Mallica J', 'Mallica Jittapornchaiwattana'],
  ['ที่อยู่ปัจจุบัน', '99 ถนนสาทรใต้', '11 ซอยสาทร 11 ถ.สาทรใต้'],
  ['หมายเหตุ', '', 'ติดต่อหลัง 17:00 น.'],
  ['แหล่งที่มา', 'Social Advertisement', 'แนะนำมาจาก ธอส'],
];
const EDITORS = ['MK01 ชวัญจิรา', 'CS0001 ชวัญจิรา', 'LE0001 ชวัญจิรา'];

/**
 * The three edits of the design, then older ones (27 more, one every few hours back from 28/06/2026) so that a long table can be looked at: it must scroll inside
 * its box with the header row staying put. The same for every prospect until the API exists.
 */
export function mockProspectHistory(): ProspectHistoryEntry[] {
  const rows: ProspectHistoryEntry[] = [
    { id: 'h3', at: '2026-07-02T10:14:00', field: 'เบอร์โทร', oldValue: '089-999-9999', newValue: '081-234-5678', editor: 'MK01 ชวัญจิรา' },
    { id: 'h2', at: '2026-07-02T10:14:00', field: 'LINE', oldValue: '@updatedTest', newValue: '@updatedTestV2', editor: 'MK01 ชวัญจิรา' },
    { id: 'h1', at: '2026-06-28T16:02:00', field: 'ผู้รับผิดชอบ', oldValue: 'CS0001 ชวัญจิรา', newValue: 'MK01 ชวัญจิรา', editor: 'CS0001 ชวัญจิรา' },
  ];
  const base = Date.UTC(2026, 5, 28, 16, 2);
  for (let i = 0; i < 27; i++) {
    const [field, oldValue, newValue] = FIELDS[i % FIELDS.length];
    const d = new Date(base - (i + 1) * 7 * 3_600_000);
    const two = (n: number): string => String(n).padStart(2, '0');
    rows.push({
      id: `m${i}`,
      at: `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}T${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:00`,
      field,
      oldValue,
      newValue,
      editor: EDITORS[i % EDITORS.length],
    });
  }
  return rows;
}
