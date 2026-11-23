/**
 * JSON the way the Java servers read it (jakarta.json / Parsson), for a live backend whose output is TEXT: `JSON.parse` loses what the
 * Java code kept — the text of a number ("12.50" stays "12.50", not 12.5; a long stays exact), the order of the keys of an object (JS puts
 * integer-like keys first) — and `JsonValue.toString()` of a nested value has its own (compact) format.
 *
 * A node is: string · boolean · null · `JNum` (a number, its text already the one `JsonNumber.toString()` gives) · array · `JObj` (a Map: the
 * order of the keys is the order of the document). No Angular imports (the specs and the comparison harness load it in Node).
 */

export class JNum {
  constructor(readonly text: string) {}
}
export type JObj = Map<string, JNode>;
export type JNode = string | boolean | null | JNum | JNode[] | JObj;

export const isJObj = (n: unknown): n is JObj => n instanceof Map;
export const isJArr = (n: unknown): n is JNode[] => Array.isArray(n);

/** `JsonNumber.toString()`: an integer literal is an int / long (plain digits); anything else is a BigDecimal (`BigDecimal.toString()`) */
export function javaNumberText(raw: string): string {
  if (/^-?\d+$/.test(raw)) return BigInt(raw).toString(); // "-0" -> "0"
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(raw);
  if (!m) return raw;
  const [, sign, intPart, frac = '', exp = '0'] = m;
  const digits = (intPart + frac).replace(/^0+(?=\d)/, '');
  const scale = frac.length - Number(exp);
  const isZero = /^0+$/.test(digits);
  const coeff = isZero ? '0' : digits;
  const minus = sign && !isZero ? '-' : ''; // (BigDecimal has no negative zero)
  if (scale === 0) return minus + coeff;
  const adjusted = coeff.length - 1 - scale;
  if (scale > 0 && adjusted >= -6) {
    return minus + (coeff.length > scale ? `${coeff.slice(0, coeff.length - scale)}.${coeff.slice(coeff.length - scale)}` : `0.${'0'.repeat(scale - coeff.length)}${coeff}`);
  }
  const mant = coeff.length > 1 ? `${coeff[0]}.${coeff.slice(1)}` : coeff;
  return `${minus}${mant}E${adjusted >= 0 ? '+' : '-'}${Math.abs(adjusted)}`;
}

/** the document as nodes; `undefined` when it is blank or not JSON (the Java `parseObject` logged and returned null) */
export function parseJava(text: string | null | undefined): JNode | undefined {
  if (text == null || !text.trim()) return undefined;
  let i = 0;
  const fail = (): never => {
    throw new SyntaxError('bad JSON at ' + i);
  };
  const ws = (): void => {
    while (i < text.length && ' \t\n\r'.includes(text[i])) i++;
  };
  const str = (): string => {
    // text[i] === '"'
    i++;
    let out = '';
    for (;;) {
      if (i >= text.length) fail();
      const c = text[i++];
      if (c === '"') return out;
      if (c === '\\') {
        const e = text[i++];
        if (e === 'u') {
          const h = text.slice(i, i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(h)) fail();
          out += String.fromCharCode(parseInt(h, 16));
          i += 4;
        } else {
          const map: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
          if (!(e in map)) fail();
          out += map[e];
        }
      } else if (c < ' ') {
        fail();
      } else out += c;
    }
  };
  const value = (): JNode => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      const o: JObj = new Map();
      ws();
      if (text[i] === '}') {
        i++;
        return o;
      }
      for (;;) {
        ws();
        if (text[i] !== '"') fail();
        const k = str();
        ws();
        if (text[i++] !== ':') fail();
        o.set(k, value());
        ws();
        const d = text[i++];
        if (d === '}') return o;
        if (d !== ',') fail();
      }
    }
    if (c === '[') {
      i++;
      const a: JNode[] = [];
      ws();
      if (text[i] === ']') {
        i++;
        return a;
      }
      for (;;) {
        a.push(value());
        ws();
        const d = text[i++];
        if (d === ']') return a;
        if (d !== ',') fail();
      }
    }
    if (c === '"') return str();
    if (text.startsWith('true', i)) return (i += 4), true;
    if (text.startsWith('false', i)) return (i += 5), false;
    if (text.startsWith('null', i)) return (i += 4), null;
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i, i + 400));
    if (!m) return fail();
    i += m[0].length;
    return new JNum(javaNumberText(m[0]));
  };
  try {
    const v = value();
    ws();
    return i === text.length ? v : undefined;
  } catch {
    return undefined;
  }
}

const ESC: Record<string, string> = { '"': '\\"', '\\': '\\\\', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t' };
const quote = (s: string): string =>
  `"${s.replace(/["\\\u0000-\u001f]/g, (c) => ESC[c] ?? `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}"`;

/** `JsonValue.toString()`: compact JSON */
export function toJavaJson(n: JNode): string {
  if (n === null) return 'null';
  if (typeof n === 'string') return quote(n);
  if (typeof n === 'boolean') return n ? 'true' : 'false';
  if (n instanceof JNum) return n.text;
  if (Array.isArray(n)) return `[${n.map(toJavaJson).join(',')}]`;
  return `{${[...n].map(([k, v]) => `${quote(k)}:${toJavaJson(v)}`).join(',')}}`;
}
