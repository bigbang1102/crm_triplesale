import { describe, expect, it } from 'vitest';
import { currencySymbol, normalizeRvDetail, normalizeRvDetailJson, rvApproveReply } from './receipts.logic';

const detail = (result: Record<string, unknown>) => normalizeRvDetail({ status: 200, result }).result as Record<string, any>;

describe('currencySymbol (RvDetailNormalizer.currencySymbol)', () => {
  it('THB, an empty or a missing code is the baht sign', () => {
    expect(currencySymbol('THB')).toBe('฿');
    expect(currencySymbol('thb')).toBe('฿');
    expect(currencySymbol('  ')).toBe('฿');
    expect(currencySymbol(null)).toBe('฿');
    expect(currencySymbol(undefined)).toBe('฿');
  });
  it('any other currency is written with its upper-case code and a space ("USD 1,000.00" cannot be misread)', () => {
    expect(currencySymbol('usd')).toBe('USD ');
    expect(currencySymbol(' EUR ')).toBe('EUR ');
  });
});

describe('normalizeRvDetail (RvDetailNormalizer.normalizeJson)', () => {
  it('adds the currency symbol of the receipt', () => {
    expect(detail({ currency_code: 'USD' })['currency_symbol']).toBe('USD ');
    expect(detail({})['currency_symbol']).toBe('฿');
  });

  it('fills the remark from the description when the backend sent only that', () => {
    expect(detail({ description: ' ค่ามัดจำ ' })['remark']).toBe('ค่ามัดจำ');
    expect(detail({ remark: 'หมายเหตุจริง', description: 'x' })['remark']).toBe('หมายเหตุจริง');
    expect(detail({ remark: '   ', description: 'x' })['remark']).toBe('x');
    expect(detail({ remark: '', description: '' })['remark']).toBe('');
  });

  it('reads the amount of a payment from medium_amount first, then amount; 0 is a real amount', () => {
    const r = detail({
      netamount_after_vat: 100,
      payment_items: [{ medium_amount: 60 }, { amount: 40 }, { medium_amount: 0, amount: 999 }],
    });
    expect(r['payment_items'].map((p: any) => [p.amount, p.amount_available])).toEqual([[60, true], [40, true], [0, true]]);
    expect(r['payments_total']).toBe(100);
  });

  it('accepts an amount sent as text ("27,300.00") and marks an unreadable or missing one as not available', () => {
    const r = detail({
      netamount_after_vat: 27300,
      payment_items: [{ medium_amount: '27,300.00' }, { medium_amount: 'abc' }, { medium_amount: null }, { medium_amount: ' ' }, {}],
    });
    expect(r['payment_items'].map((p: any) => [p.amount, p.amount_available])).toEqual([[27300, true], [0, false], [0, false], [0, false], [0, false]]);
    expect(r['payments_total']).toBe(27300);
    expect(r['change_amount']).toBe(0);
  });

  it('change = received − bill; none when nothing is to be given back (a difference below half a satang is the same money)', () => {
    expect(detail({ netamount_after_vat: 27514, payment_items: [{ medium_amount: 28000 }] })['change_amount']).toBe(486);
    expect(detail({ netamount_after_vat: 100, payment_items: [{ medium_amount: 100 }] })['change_amount']).toBe(0);
    expect(detail({ netamount_after_vat: 100, payment_items: [{ medium_amount: 100.004 }] })['change_amount']).toBe(0);
    expect(detail({ netamount_after_vat: 100, payment_items: [{ medium_amount: 100.006 }] })['change_amount']).toBeCloseTo(0.006, 6);
    expect(detail({ netamount_after_vat: 100, payment_items: [{ medium_amount: 40 }] })['change_amount']).toBe(0);
  });

  it('the bill is netamount_after_vat, and pay_amount when that is missing or not positive', () => {
    expect(detail({ pay_amount: 90, payment_items: [{ medium_amount: 100 }] })['change_amount']).toBe(10);
    expect(detail({ netamount_after_vat: 0, pay_amount: 95, payment_items: [{ medium_amount: 100 }] })['change_amount']).toBe(5);
    expect(detail({ netamount_after_vat: '120', payment_items: [{ medium_amount: 150 }] })['change_amount']).toBe(30);
  });

  it('without payment_items there are no totals; a reply without a result object is returned as it is; the input is not changed', () => {
    const r = detail({ txno: 'RV:1' });
    expect('payments_total' in r).toBe(false);
    expect('change_amount' in r).toBe(false);
    const noResult = { status: 502, message: 'x' };
    expect(normalizeRvDetail(noResult)).toBe(noResult);
    const list = { result: [1, 2] };
    expect(normalizeRvDetail(list)).toBe(list);
    const input = { result: { payment_items: [{ medium_amount: 5 }] } };
    normalizeRvDetail(input);
    expect(input).toEqual({ result: { payment_items: [{ medium_amount: 5 }] } });
  });
});

describe('normalizeRvDetail — values the way the org.json getters of the servlet read them', () => {
  it('the bill is read by Double.parseDouble: a text with a thousands separator is not a number there (the amount to pay is used), a plain text is', () => {
    expect(detail({ netamount_after_vat: '1,000.00', pay_amount: 90, payment_items: [{ medium_amount: 100 }] })['change_amount']).toBe(10);
    expect(detail({ netamount_after_vat: ' 1000.00 ', pay_amount: 90, payment_items: [{ medium_amount: 1500 }] })['change_amount']).toBe(500);
    // (only the payment amounts drop the commas)
    expect(detail({ netamount_after_vat: 10, payment_items: [{ medium_amount: '1,5,0' }] })['payments_total']).toBe(150);
  });

  it('currency_code that is not a text is read as its text (optString): 840 is the currency "840"', () => {
    expect(detail({ currency_code: 840 })['currency_symbol']).toBe('840 ');
    expect(detail({ currency_code: null })['currency_symbol']).toBe('฿');
  });

  it('payment amounts: a text Double.valueOf takes ("1e3", "12d"), but not a boolean / object / array; the value of a key that is null is skipped', () => {
    const r = detail({ payment_items: [{ medium_amount: '1e3' }, { medium_amount: '12d' }, { medium_amount: true }, { medium_amount: { a: 1 } }, { medium_amount: [5] }, { medium_amount: null, amount: 7 }] });
    expect(r['payment_items'].map((p: any) => [p.amount, p.amount_available])).toEqual([[1000, true], [12, true], [0, false], [0, false], [0, false], [7, true]]);
  });

  it('only objects of payment_items are normalised (the others stay as they are); a copy is made, never the caller\'s items', () => {
    const items = [{ medium_amount: 5 }, 'x', [1]];
    const out = detail({ payment_items: items });
    expect(out['payment_items'][1]).toBe('x');
    expect(out['payment_items'][2]).toEqual([1]);
    expect(items[0]).toEqual({ medium_amount: 5 });
  });

  it('an amount that is not a finite number ("NaN") makes the whole normalisation give up: the reply is returned as it is', () => {
    const reply = { result: { payment_items: [{ medium_amount: 5 }, { medium_amount: 'NaN' }] } };
    expect(normalizeRvDetail(reply)).toBe(reply);
    expect(normalizeRvDetail({ result: { payment_items: [{ amount: '-Infinity' }] } }).result).not.toHaveProperty('currency_symbol');
  });
});

describe('normalizeRvDetailJson (RvDetailNormalizer.normalizeJson on the text)', () => {
  it('normalises the text of an answer that has an object result', () => {
    const out = JSON.parse(normalizeRvDetailJson('{"status":200,"result":{"currency_code":"USD","description":"d","payment_items":[{"medium_amount":"5"}],"netamount_after_vat":3}}'));
    expect(out.result).toMatchObject({ currency_symbol: 'USD ', remark: 'd', payments_total: 5, change_amount: 2 });
    expect(out.result.payment_items).toEqual([{ medium_amount: '5', amount_available: true, amount: 5 }]);
    expect(out.status).toBe(200);
  });

  it('returns the text as it came when it is not an object, has no object result, is not JSON, or cannot be normalised', () => {
    for (const t of ['', 'x', '[1]', ' {"status":1}', '{"result":null}', '{"result":[]}', '{"result":"x"}', '{bad', '{"result":{"payment_items":[{"amount":"NaN"}]}}']) {
      expect(normalizeRvDetailJson(t), t).toBe(t);
    }
  });

  it('whitespace before the { does not matter for the check (String.trim)', () => {
    expect(JSON.parse(normalizeRvDetailJson('\n {"result":{}}')).result).toEqual({ currency_symbol: '฿' });
  });
});

describe('rvApproveReply (POST /api/v1/rv/approve)', () => {
  it('a receipt waiting at new1 is approved now: result and hopDone are true', () => {
    expect(rvApproveReply('new1', 'RV:1')).toMatchObject({ result: true, status: 200, hopDone: true, txno: 'RV:1' });
  });
  it('new / waitToFlow: the call goes through but nothing is approved yet (hopDone false, with the reason)', () => {
    for (const st of ['new', 'waitToFlow']) {
      const r = rvApproveReply(st, 'RV:1');
      expect(r.result).toBe(true);
      expect(r.hopDone).toBe(false);
      expect(r.message).not.toBe('');
    }
  });
  it('approved already / being approved / cancelled: hopDone false', () => {
    for (const st of ['ActionWaitProcess', 'active', 'active1', 'active2', 'cancel']) expect(rvApproveReply(st, 'RV:1').hopDone).toBe(false);
  });
  it('an unknown number: result false, status 404', () => {
    expect(rvApproveReply(null, 'RV:X')).toMatchObject({ result: false, status: 404, txno: 'RV:X' });
  });
});
