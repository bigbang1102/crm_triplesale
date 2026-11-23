import { describe, expect, it } from 'vitest';
import {
  EXTRA_INFO_KEYS,
  MAIN_KEYS,
  SATISFACTION_KEYS,
  collapse,
  ensureTaxBranchForJuristic,
  extraInfoBody,
  hasAnyValue,
  isAbsolute,
  isJuristic,
  jtrim,
  mainBody,
  normalizeCustomerType,
  toRelative,
  toRelativeIn,
} from './prospect-payload.live';

/** ProspectApiPayload.java / AttachUrl.java, read line by line: the expectations below are what those classes did */
describe('AttachUrl', () => {
  it('collapse folds the hosts that the backend put in front again and again; a relative path or one host stays', () => {
    expect(collapse('http://h/http://h/http://h/a/b.jpg')).toBe('http://h/a/b.jpg');
    expect(collapse('http://h/a/b.jpg')).toBe('http://h/a/b.jpg');
    expect(collapse('a/b.jpg')).toBe('a/b.jpg');
    expect(collapse('  https://x:51774/https://y/prospect/1/c.pdf ')).toBe('https://y/prospect/1/c.pdf');
    expect(collapse(null)).toBe('');
    expect(collapse(undefined)).toBe('');
    expect(collapse('   ')).toBe('');
    // the host of the outer layer is cut with a case-sensitive pattern: an upper-case scheme is not recognised as a host layer
    expect(collapse('HTTP://h/http://h/a.jpg')).toBe('HTTP://h/http://h/a.jpg');
  });

  it('toRelative is the path without scheme and host (what is sent to the service)', () => {
    expect(toRelative('http://h/http://h/prospect/1/a.jpg')).toBe('prospect/1/a.jpg');
    expect(toRelative('prospect/1/a.jpg')).toBe('prospect/1/a.jpg');
    expect(toRelative('')).toBe('');
    expect(toRelative(null)).toBe('');
  });

  it('isAbsolute: http:// or https:// after a trim, any case', () => {
    expect(isAbsolute(' HTTP://x')).toBe(true);
    expect(isAbsolute('https://x')).toBe(true);
    expect(isAbsolute('ftp://x')).toBe(false);
    expect(isAbsolute('x/http://')).toBe(false);
    expect(isAbsolute(null)).toBe(false);
  });

  it('toRelativeIn changes only the keys that hold a non-blank text, in place', () => {
    const body: Record<string, unknown> = { a: 'http://h/x/y.jpg', b: '  ', c: null, d: 5, e: 'http://h/http://h/z.png' };
    toRelativeIn(body, 'a', 'b', 'c', 'd', 'e', 'missing');
    expect(body).toEqual({ a: 'x/y.jpg', b: '  ', c: null, d: 5, e: 'z.png' });
  });

  it('jtrim is String.trim: everything up to U+0020 goes, a no-break space stays', () => {
    expect(jtrim('\t\n x \u0001')).toBe('x');
    expect(jtrim(' x ')).toBe(' x ');
  });
});

describe('customer type and tax branch', () => {
  it('normalizeCustomerType: blank stays blank, juristic and the legacy company (any case) are juristic, everything else is person', () => {
    expect(normalizeCustomerType('')).toBe('');
    expect(normalizeCustomerType('  ')).toBe('');
    expect(normalizeCustomerType(null)).toBe('');
    expect(normalizeCustomerType('JURISTIC')).toBe('juristic');
    expect(normalizeCustomerType(' company ')).toBe('juristic');
    expect(normalizeCustomerType('person')).toBe('person');
    expect(normalizeCustomerType('whatever')).toBe('person');
    expect(isJuristic('Company')).toBe(true);
    expect(isJuristic('person')).toBe(false);
    expect(isJuristic('')).toBe(false);
  });

  it('a juristic customer without a tax branch (or with "null") gets the head office 00000; others are left alone', () => {
    const a: Record<string, unknown> = { customerType: 'juristic' };
    ensureTaxBranchForJuristic(a);
    expect(a['taxBranch']).toBe('00000');
    const b: Record<string, unknown> = { customerType: 'company', taxBranch: ' NULL ' };
    ensureTaxBranchForJuristic(b);
    expect(b['taxBranch']).toBe('00000');
    const c: Record<string, unknown> = { customerType: 'juristic', taxBranch: '00012' };
    ensureTaxBranchForJuristic(c);
    expect(c['taxBranch']).toBe('00012');
    const d: Record<string, unknown> = { customerType: 'person' };
    ensureTaxBranchForJuristic(d);
    expect(d).toEqual({ customerType: 'person' });
    expect(() => ensureTaxBranchForJuristic(null)).not.toThrow();
  });
});

describe('key lists (copied from ProspectApiPayload.java)', () => {
  it('have the sizes of the Java arrays and no key twice', () => {
    expect(MAIN_KEYS).toHaveLength(104);
    expect(SATISFACTION_KEYS).toHaveLength(34);
    expect(EXTRA_INFO_KEYS).toHaveLength(488);
    for (const list of [MAIN_KEYS, SATISFACTION_KEYS, EXTRA_INFO_KEYS]) expect(new Set(list).size).toBe(list.length);
  });

  it('start and end with the keys of the Java arrays (the comment lines of the source are not keys)', () => {
    expect(MAIN_KEYS[0]).toBe('code');
    expect(MAIN_KEYS).toContain('phoneCountryCode');
    expect(MAIN_KEYS.at(-1)).toBe('employeeId');
    expect(SATISFACTION_KEYS[0]).toBe('customerGender');
    expect(SATISFACTION_KEYS.at(-1)).toBe('satisfactionComment');
    expect(EXTRA_INFO_KEYS[0]).toBe('cbAge');
    expect(EXTRA_INFO_KEYS.at(-1)).toBe('usageStatus');
    expect(EXTRA_INFO_KEYS).toContain('cusSurveyQ19_2_5_1');
  });
});

describe('mainBody (POST /prospects, PUT /prospects/{id})', () => {
  it('keeps only the keys of the DTO, adds the id, and does not change the source', () => {
    const source = { name: 'สมชาย', customerTel: '0812345678', unknownKey: 1, currentCity: 'x', nested: { a: 1 }, customerType: 'person' };
    const body = mainBody(source, 17);
    expect(body).toEqual({ name: 'สมชาย', customerTel: '0812345678', customerType: 'person', id: 17 });
    expect(source).toHaveProperty('unknownKey');
  });

  it('drops null values and reads the document-address keys under the spelling of the answer (senddoc…)', () => {
    const body = mainBody({ name: null, sendDocAddress: null, senddocAddress: '1 ถนน', senddocPostId: '10110', sendDocDistrictName: 'A', senddocDistrictName: 'B', remark: '' }, 5);
    expect(body).toEqual({ sendDocAddress: '1 ถนน', sendDocPostId: '10110', sendDocDistrictName: 'A', remark: '', id: 5 });
  });

  it('cuts yyyy-MM-ddT… to the date for the three date keys only, and only when the T is the 11th character', () => {
    const body = mainBody({ contactDate: '2026-09-15T00:00:00.000+07:00', birthdate: '1990-01-02T10:00', convenientTime: '2026-09-15', remark: '2026-09-15T00:00', name: '2026-9-5T1' }, 1);
    expect(body['contactDate']).toBe('2026-09-15');
    expect(body['birthdate']).toBe('1990-01-02');
    expect(body['convenientTime']).toBe('2026-09-15');
    expect(body['remark']).toBe('2026-09-15T00:00'); // not a date key
    expect(body['name']).toBe('2026-9-5T1');
  });

  it('makes the file addresses relative and gives a juristic customer a tax branch', () => {
    const body = mainBody({ attachFile: 'http://h/http://h/prospect/1/a.jpg', downloadAttachFile: 'http://h/prospect/1/a.jpg', customerType: 'company', taxBranch: '' }, 3);
    expect(body['attachFile']).toBe('prospect/1/a.jpg');
    expect(body['downloadAttachFile']).toBe('prospect/1/a.jpg');
    expect(body['taxBranch']).toBe('00000');
  });

  it('without an id (a new customer) there is no id; without a source the body is empty', () => {
    expect(mainBody({ name: 'x' }, null)).toEqual({ name: 'x' });
    expect(mainBody(null, 4)).toEqual({});
  });
});

describe('extraInfoBody (PUT /prospects/{id}/extra-info)', () => {
  it('is null when neither part has a value', () => {
    expect(extraInfoBody(null, null)).toBeNull();
    expect(extraInfoBody({}, {})).toBeNull();
    expect(extraInfoBody({ notAKey: 'x' }, { customerGender: '', customerAge: null })).toBeNull();
    expect(extraInfoBody({ csVip: '  ' }, null)).toBeNull();
  });

  it('filters sunProspectInfo to the keys of SunProspectInfoDTO and keeps only those that have a value', () => {
    const body = extraInfoBody({ csVip: 'Y', cbAge: null, bogus: 'x', csYearsLoan: 3, crmPurchasePurpose: '' }, null);
    expect(body).toEqual({ sunProspectInfo: { csVip: 'Y', csYearsLoan: 3, crmPurchasePurpose: '' } });
  });

  it('sends satisfaction with EVERY key, as text (the service answers 500 for a missing or null one)', () => {
    const body = extraInfoBody(null, { customerGender: 'F', customerAge: 30, satisfactionComment: null, extra: 'x' });
    const sat = body?.['satisfaction'] as Record<string, string>;
    expect(Object.keys(sat)).toHaveLength(34);
    expect(sat['customerGender']).toBe('F');
    expect(sat['customerAge']).toBe('30');
    expect(sat['satisfactionComment']).toBe('');
    expect(sat['customerJob']).toBe('');
    expect(sat).not.toHaveProperty('extra');
    expect(body).not.toHaveProperty('sunProspectInfo');
  });

  it('hasAnyValue: a non-blank text or any other non-null value counts', () => {
    expect(hasAnyValue(null)).toBe(false);
    expect(hasAnyValue({})).toBe(false);
    expect(hasAnyValue({ a: null, b: '  ' })).toBe(false);
    expect(hasAnyValue({ a: null, b: 0 })).toBe(true);
    expect(hasAnyValue({ a: false })).toBe(true);
    expect(hasAnyValue({ a: ' x ' })).toBe(true);
  });
});
