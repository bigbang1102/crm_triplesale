import { describe, expect, it } from 'vitest';
import { dueMonthLabel, filterCounts, filterItems, money, mockProspectOpportunities, savedDate, wonSummary } from './prospect-opportunities.model';

describe('prospect opportunities (mock data of the design)', () => {
  const items = mockProspectOpportunities();

  it('has the three cards: open (WARM) · won (SUCCESS) · lost (LOST)', () => {
    expect(items.map((o) => [o.status, o.outcome])).toEqual([
      ['WARM', 'open'],
      ['SUCCESS', 'won'],
      ['LOST', 'lost'],
    ]);
  });
  it('counts the pills and filters', () => {
    expect(filterCounts(items)).toEqual([
      { key: 'all', count: 3 },
      { key: 'open', count: 1 },
      { key: 'won', count: 1 },
      { key: 'lost', count: 1 },
    ]);
    expect(filterItems(items, 'won').map((o) => o.status)).toEqual(['SUCCESS']);
    expect(filterItems(items, 'all')).toHaveLength(3);
  });
  it('sums what was won', () => {
    expect(wonSummary(items)).toEqual({ count: 1, amount: 500000 });
    expect(money(500000)).toBe('500,000');
  });
  it('formats dates', () => {
    expect(savedDate('2026-11-09')).toBe('09/11/2026');
    expect(savedDate('')).toBe('-');
    expect(dueMonthLabel('2026-12', 'th')).toBe('ธันวาคม 2026');
    expect(dueMonthLabel('2026-12', 'en')).toBe('December 2026');
    expect(dueMonthLabel('', 'th')).toBe('');
  });
});
