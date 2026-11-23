import { describe, expect, it } from 'vitest';
import { historyTime, mockProspectHistory, newestFirst, shown } from './prospect-history.model';

describe('prospect history (mock data of the design)', () => {
  it('starts with the three edits of the design and has enough older ones to scroll', () => {
    const rows = mockProspectHistory();
    expect(rows.slice(0, 3).map((r) => r.field)).toEqual(['เบอร์โทร', 'LINE', 'ผู้รับผิดชอบ']);
    expect(rows).toHaveLength(30);
    expect(new Set(rows.map((r) => r.id)).size).toBe(30);
    expect(rows[0]).toMatchObject({ oldValue: '089-999-9999', newValue: '081-234-5678', editor: 'MK01 ชวัญจิรา' });
  });
  it('formats the time as dd/MM/yyyy HH:mm', () => {
    expect(historyTime('2026-07-02T10:14:00')).toBe('02/07/2026 10:14');
    expect(historyTime('2026-06-28 16:02')).toBe('28/06/2026 16:02');
    expect(historyTime('')).toBe('-');
  });
  it('shows the newest first and an empty value as a dash', () => {
    const e = (id: string, at: string) => ({ id, at, field: 'f', oldValue: '', newValue: '', editor: '' });
    expect(newestFirst([e('a', '2026-01-01T09:00'), e('b', '2026-03-01T09:00'), e('c', 'x')]).map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(shown('  ')).toBe('-');
    expect(shown('x')).toBe('x');
  });
});
