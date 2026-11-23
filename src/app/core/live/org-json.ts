/**
 * The org.json semantics the Java servlets relied on (the shaded org.json of PrimeFaces: `optString`, `optLong`, `getInt` of a string,
 * `firstNonNull*` …), for the live backends that read an answer of the REST services the way the Java code did. Pure (no Angular, no I/O).
 */

export type JObj = Record<string, unknown>;

// ---- org.json semantics ----------------------------------------------------------------------------------------------

export const isObj = (v: unknown): v is JObj => typeof v === 'object' && v !== null && !Array.isArray(v);
export const isArr = (v: unknown): v is unknown[] => Array.isArray(v);
export const has = (o: JObj, k: string): boolean => Object.hasOwn(o, k);
/** org.json `has(k) && !isNull(k)` */
export const hasVal = (o: JObj, k: string): boolean => has(o, k) && o[k] !== null;


/** the int the JVM would give: NaN → 0, saturating at the int range, truncated toward zero */
export const i32 = (n: number): number => (Number.isNaN(n) ? 0 : Math.max(-2147483648, Math.min(2147483647, Math.trunc(n))));

/** `Double.parseDouble` for a string (it trims, accepts exponents, a trailing d/f, NaN, Infinity) — undefined where Java throws */
export function javaParseDouble(s: string): number | undefined {
  const t = s.trim();
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[dDfF]?$/.test(t)) return parseFloat(t);
  if (/^[+-]?Infinity$/.test(t)) return t.startsWith('-') ? -Infinity : Infinity;
  if (t === 'NaN') return NaN;
  return undefined;
}

/** `JSONObject.getInt(key)` of a value: a number is truncated, a string goes through `Integer.parseInt`; anything else throws (undefined) */
export function orgGetInt(v: unknown): number | undefined {
  if (typeof v === 'number') return i32(v);
  if (typeof v === 'string' && /^[+-]?\d+$/.test(v)) {
    const n = Number(v);
    return n >= -2147483648 && n <= 2147483647 ? n : undefined;
  }
  return undefined;
}

/** `JSONObject.getDouble(key)` of a value */
export function orgGetDouble(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return javaParseDouble(v);
  return undefined;
}

/** `firstNonNullString`: the first key that holds a primitive, as text (nested objects / arrays are skipped) */
export function firstNonNullString(o: JObj, ...keys: string[]): string | null {
  for (const k of keys) {
    if (!hasVal(o, k)) continue;
    const v = o[k];
    if (isObj(v) || isArr(v)) continue;
    return String(v);
  }
  return null;
}

/** `firstNonNullInt`: `getInt`, else `(int) Math.round(getDouble)`, else the next key; 0 when nothing fits */
export function firstNonNullInt(o: JObj, ...keys: string[]): number {
  for (const k of keys) {
    if (!hasVal(o, k)) continue;
    const a = orgGetInt(o[k]);
    if (a !== undefined) return a;
    const d = orgGetDouble(o[k]);
    if (d !== undefined) return i32(Math.round(d));
  }
  return 0;
}

/** `firstNonNullDouble`: `getDouble`, else the next key; 0.0 when nothing fits */
export function firstNonNullDouble(o: JObj, ...keys: string[]): number {
  for (const k of keys) {
    if (!hasVal(o, k)) continue;
    const d = orgGetDouble(o[k]);
    if (d !== undefined) return d;
    const a = orgGetInt(o[k]);
    if (a !== undefined) return a;
  }
  return 0;
}

/** `optString(key, def)`: a missing / null key gives the default, other values their `toString()` */
export function optString(o: JObj, key: string, def = ''): string {
  const v = o[key];
  if (v === undefined || v === null) return def;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** `optInt(key, def)`: `getInt` (a number is truncated, a string goes through `Integer.parseInt`), the default when that throws */
export function optInt(o: JObj, key: string, def = 0): number {
  return orgGetInt(o[key]) ?? def;
}

/** `optLong(key, def)` */
export function optLong(o: JObj, key: string, def = 0): number {
  const v = o[key];
  if (typeof v === 'number') return Math.trunc(v);
  if (typeof v === 'string' && /^[+-]?\d+$/.test(v)) return Number(v);
  return def;
}

/** Java `new JSONObject(text)` / `new JSONArray(text)`: the parsed value, `undefined` where Java would throw */
export function parseJson(text: string | null | undefined): unknown {
  if (text == null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
