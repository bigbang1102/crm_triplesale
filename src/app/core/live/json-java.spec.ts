import { describe, expect, it } from 'vitest';
import { isJArr, isJObj, javaNumberText, parseJava, toJavaJson, JNum } from './json-java';

describe('json-java (JSON the way Parsson reads it)', () => {
  it('writes a number the way JsonNumber.toString() does: ints plain, anything else as BigDecimal.toString()', () => {
    const cases: [string, string][] = [
      ['0', '0'],
      ['-0', '0'],
      ['123456789012345678901234567890', '123456789012345678901234567890'],
      ['12.50', '12.50'],
      ['1.0', '1.0'],
      ['100000.00', '100000.00'],
      ['-3.14', '-3.14'],
      ['0.000001', '0.000001'],
      ['0.0000001', '1E-7'],
      ['1e3', '1E+3'],
      ['1.5E3', '1.5E+3'],
      ['25e-1', '2.5'],
      ['-0.00', '0.00'],
    ];
    for (const [raw, text] of cases) expect(javaNumberText(raw), raw).toBe(text);
  });

  it('keeps the order of the keys (JS would put integer-like keys first) and the text of the numbers', () => {
    const v = parseJava('{"b":1,"2":"x","a":12.50,"1":[true,false,null]}');
    expect(isJObj(v)).toBe(true);
    expect([...(v as Map<string, unknown>).keys()]).toEqual(['b', '2', 'a', '1']);
    expect(((v as Map<string, unknown>).get('a') as JNum).text).toBe('12.50');
    expect(toJavaJson(v!)).toBe('{"b":1,"2":"x","a":12.50,"1":[true,false,null]}');
  });

  it('parses strings with escapes and writes them back the compact way (only " \\ and control characters are escaped)', () => {
    const v = parseJava('{"s":"a\\"b\\\\c\\/d\\u0041\\n\\u0001 ไทย"}') as Map<string, string>;
    expect(v.get('s')).toBe('a"b\\c/dA\n\u0001 ไทย');
    expect(toJavaJson(v)).toBe('{"s":"a\\"b\\\\c/dA\\n\\u0001 ไทย"}');
  });

  it('answers undefined for blank text or text that is not one JSON value', () => {
    for (const bad of ['', '   ', null, undefined, '{', '{"a":}', '[1,]', 'abc', '{"a":1} x', "{'a':1}"]) expect(parseJava(bad as string)).toBeUndefined();
  });

  it('reads scalars and arrays at the top', () => {
    expect(parseJava(' "x" ')).toBe('x');
    expect(parseJava('true')).toBe(true);
    expect(parseJava('null')).toBeNull();
    expect(isJArr(parseJava('[1, [2], {}]'))).toBe(true);
    expect(toJavaJson(parseJava('[1, [2], {} ]')!)).toBe('[1,[2],{}]');
  });
});
