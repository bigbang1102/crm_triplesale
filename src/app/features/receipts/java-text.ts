/**
 * The two string behaviours of the JVM that the receipt servlets relied on and that JavaScript does differently — so that the live
 * backend builds the same URLs and takes the same decisions as `RvApiServlet` / `RvApiService` / `RvDetailNormalizer`.
 * Pure (no Angular, no I/O); also loaded in Node by the comparison harness (only erasable TypeScript syntax here).
 */

/** `String.trim()`: removes every char up to U+0020 (JS `trim()` also removes no-break space, U+2028 …) */
export const javaTrim = (s: string): string => s.replace(/^[\u0000- ]+|[\u0000- ]+$/g, '');

/**
 * `URLEncoder.encode(v, "UTF-8")`: a space is `+`, only `A-Za-z0-9 . - * _` stay. (`encodeURIComponent` also leaves `! ' ( ) ~` alone;
 * the service decodes both, but the URL is then byte for byte what the Java servlet sent.)
 */
export function urlEncode(v: string | null | undefined): string {
  return encodeURIComponent(v ?? '')
    .replace(/[!'()~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, '+');
}
