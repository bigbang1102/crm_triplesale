/**
 * The files the report servlets stream (`/rvreport?txno=`, `/rvreceipt?id=`) as the fake backend makes them: a one-page PDF and a small
 * PNG, both VALID files (a PDF viewer / an image tab opens them), built byte by byte so that the two sides of the comparison — the
 * Java replica served by the harness and the Angular page — get the same bytes. Framework-free.
 */

const ASCII = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

/** PDF string literal: parentheses and backslashes escaped, anything outside printable ASCII shown as "?" (the built-in fonts have no Thai) */
const pdfText = (s: string): string => s.replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1');

/** a one-page A4 PDF with the given lines of text (Helvetica); the xref offsets are exact */
export function makePdf(title: string, lines: string[]): Uint8Array {
  const content = [
    'BT /F1 18 Tf 56 780 Td (' + pdfText(title) + ') Tj ET',
    ...lines.map((l, i) => 'BT /F1 11 Tf 56 ' + (750 - i * 18) + ' Td (' + pdfText(l) + ') Tj ET'),
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return ASCII(out);
}

let crcTable: Uint32Array | undefined;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const be32 = (n: number): Uint8Array => Uint8Array.of((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** a PNG chunk: length, type, data, CRC of type + data */
const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const body = concat(ASCII(type), data);
  return concat(be32(data.length), body, be32(crc32(body)));
};

/**
 * A `w`×`h` RGB PNG: a white sheet with a purple band on top and a seed-dependent grey block (so that different receipts are
 * different images). The pixel data is one stored (uncompressed) zlib block — small and trivially valid.
 */
export function makePng(seed: number, w = 120, h = 80): Uint8Array {
  const raw = new Uint8Array((w * 3 + 1) * h);
  const grey = 90 + (seed % 120);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      let rgb: [number, number, number] = [255, 255, 255];
      if (y < 8) rgb = [0x35, 0x23, 0x6a];
      else if (y > 30 && y < 50 && x > 20 && x < 20 + (seed % 60) + 30) rgb = [grey, grey, grey];
      raw.set(rgb, row + 1 + x * 3);
    }
  }
  let a = 1;
  let b = 0;
  for (const v of raw) {
    a = (a + v) % 65521;
    b = (b + a) % 65521;
  }
  const len = raw.length;
  const zlib = concat(Uint8Array.of(0x78, 0x01, 0x01, len & 255, len >>> 8, ~len & 255, (~len >>> 8) & 255), raw, be32(((b << 16) | a) >>> 0));
  const ihdr = concat(be32(w), be32(h), Uint8Array.of(8, 2, 0, 0, 0));
  return concat(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), chunk('IHDR', ihdr), chunk('IDAT', zlib), chunk('IEND', new Uint8Array(0)));
}

/** the plain-text body a servlet prints for an error (RvJasperReportServlet.writeText / HttpServletResponse.sendError) */
export const textBody = (s: string): Uint8Array => new TextEncoder().encode(s);
