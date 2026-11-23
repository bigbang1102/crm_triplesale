import { describe, expect, it } from 'vitest';
import type { LostReceiver, PositionRecord } from '@core/permissions/role-model';
import { lostText } from './role-warnings';

const lost = (n: number): LostReceiver[] =>
  Array.from({ length: n }, (_x, i) => ({
    position: { code: `P${i}`, name: `P${i}`, line: '', parent: '', roleIds: [] } as PositionRecord,
    kinds: ['lead', 'opportunity'],
    missing: { lead: [], prospect: [], opportunity: [] },
  }));
const t = (key: string, ...args: (string | number)[]): string => `${key}(${args.join(',')})`;

describe('the text of the "positions lose the right to receive" confirm', () => {
  it('should list a position with the documents it can no longer receive, then say what happens to their documents', () => {
    expect(lostText(t, lost(1)).split('\n')).toEqual(['app.settings.role.lost.item(P0,Lead · Opportunity)', 'app.settings.role.lost.text()']);
  });

  it('should cut a long list at 8 positions and count the rest', () => {
    const lines = lostText(t, lost(19)).split('\n');
    expect(lines).toHaveLength(10);
    expect(lines[8]).toBe('app.settings.role.lost.more(11)');
  });
});
