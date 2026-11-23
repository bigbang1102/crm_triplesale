import { afterEach, describe, expect, it } from 'vitest';
import { createMockLeadDetail } from './opportunity-detail.mock';
import { SINGLE_MODE_HIDDEN, accessInSingleMode, setSingleMode } from './opportunity-detail.single-mode';

describe('single opportunity: the buttons it does not have', () => {
  afterEach(() => setSingleMode(true));

  it('should hide the close, the workflow and the add-product buttons even for a person who may use them', () => {
    const everything = (): boolean => true;
    for (const code of SINGLE_MODE_HIDDEN) expect(accessInSingleMode(code, everything), code).toBe(false);
    expect([...SINGLE_MODE_HIDDEN].sort()).toEqual(['PL-OP-DT-11', 'PL-OP-DT-16', 'PL-OP-DT-18', 'PL-OP-DT-19', 'PL-OP-DT-20', 'PL-OP-DT-27']);
  });

  it('should leave the other buttons to the permission of the person', () => {
    expect(accessInSingleMode('PL-OP-DT-17', () => true)).toBe(true);
    expect(accessInSingleMode('PL-OP-DT-17', () => false)).toBe(false);
  });

  it('should show them again when single mode is off (the generated Java page as it is)', () => {
    setSingleMode(false);
    expect(accessInSingleMode('PL-OP-DT-20', () => true)).toBe(true);
  });
});

describe('the deal value without Company Financial', () => {
  const masked = createMockLeadDetail({ delayMs: 0, employeeId: 1001, canSeeFinancial: false });
  const update = (b: Record<string, string>): RequestInit => ({ method: 'POST', body: new URLSearchParams({ leadId: '29', ...b }).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });

  it('should be masked on reading and refused on writing (403 FIELD_NOT_EDITABLE)', async () => {
    const lead = (await (await masked.fetch('../board/lead?id=29')).json()) as { amount: unknown };
    expect(lead.amount).toBe('*****');
    const res = await masked.fetch('board/lead-update', update({ action: 'amount', amount: '100' }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('FIELD_NOT_EDITABLE');
  });

  it('should be shown, and editable, with the permission (the default)', async () => {
    const full = createMockLeadDetail({ delayMs: 0, employeeId: 1001 });
    expect(typeof ((await (await full.fetch('../board/lead?id=29')).json()) as { amount: unknown }).amount).toBe('number');
    expect((await full.fetch('board/lead-update', update({ action: 'amount', amount: '100' }))).status).toBe(200);
  });
});
