// Line diff of two dumps (Java side / Angular side) and a per-element summary of style differences.
//
// A dump line is   <indent><tag attrs> <rect|hidden> <fontSize> <color> <bg> |<computed style columns>[ canvas=<sum> WxH]
// modes: dom   = structure + attributes + text · style = also colours / fonts (no geometry) · all = everything

import { javaLinkToRoute } from '../../../src/app/core/navigation/java-links.ts'; // (Node strips the types)

// places where the port deliberately differs from the Java page (shell-level; a page adds its own via page.normalize)
const baseNorm = (l) =>
  l
    .replace(/http:\/\/(?:localhost|127\.0\.0\.1):\d+\//g, 'ORIGIN/')
    .replace(/ORIGIN\/triplesale\//g, 'ORIGIN/')
    .replace(/ORIGIN\/images\//g, 'ORIGIN/assets/images/')
    // links between pages: Java `/triplesale/pages/lead_detail.face?…&param_lead_id=7` = the route `/crm/opportunities/7` here (core/navigation/java-links.ts)
    .replace(/(?:\/triplesale)?\/pages\/[A-Za-z0-9_]+\.(?:face|xhtml)(?:\?[^"'`\s)<>]*)?/g, (m) => javaLinkToRoute(m) ?? m)
    // the context path of Java (/triplesale) is not part of the URLs here; Java's web/images/ is public/assets/images/ (mirror, byte-identical files)
    .replace(/(["'=(\s])\/triplesale\/images\//g, '$1assets/images/')
    .replace(/(["'=(\s])\/triplesale\//g, '$1/')
    // the theme sits on <html> in Angular and on <body> in Java
    .replace(/^DOC (\S+) VP ([\d,]+) theme=.*$/, 'DOC $1 VP $2')
    // the font is declared under another name (same file)
    .replace('/NotoSansThai/', '/"Noto Sans Thai"/');

const LINE = /^(\s*<[^ ]+ .*?>) (hidden|-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+) (.*)$/;

export function makeStrip(mode, pageNorm) {
  return (l) => {
    // the page's own rules first (they know the raw URLs of the page), then the shell-level ones
    const n = baseNorm(pageNorm ? pageNorm(l) : l);
    const m = LINE.exec(n);
    if (!m) return n;
    if (mode === 'dom') return m[1];
    if (m[2] === 'hidden') return m[1] + ' hidden';
    if (mode === 'style') return m[1] + ' ' + m[3];
    return n;
  };
}

/** @returns {{ja:number, ng:number, diffs:number, out:string[]}} */
export function compareDumps(javaText, ngText, { mode = 'all', limit = 20, normalize } = {}) {
  const strip = makeStrip(mode, normalize);
  const a = javaText.split('\n');
  const b = ngText.split('\n');
  const out = [];
  let diffs = 0;
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const x = strip(a[i] ?? '');
    const y = strip(b[j] ?? '');
    if (x === y) { i++; j++; continue; }
    diffs++;
    if (out.length < limit) {
      let p = 0;
      while (p < x.length && p < y.length && x[p] === y[p]) p++;
      let s = 0;
      while (s < x.length - p && s < y.length - p && x[x.length - 1 - s] === y[y.length - 1 - s]) s++;
      const head = x.slice(0, 80).replace(/\s+/g, ' ');
      out.push(`#${i}/${j} ${head}\n   java: ${x.slice(Math.max(0, p - 30), x.length - s + 20)}\n   ng  : ${y.slice(Math.max(0, p - 30), y.length - s + 20)}`);
    }
    // re-synchronise after an inserted / missing line
    let found = false;
    for (let k = 1; k < 8 && !found; k++) {
      if (strip(a[i + k] ?? '\u0000') === y) { i += k; found = true; }
      else if (strip(b[j + k] ?? '\u0000') === x) { j += k; found = true; }
    }
    if (!found) { i++; j++; }
  }
  return { ja: a.length, ng: b.length, diffs, out };
}

/* ---- per element / property summary of the style columns ---- */
const FIELDS = ['fontWeight', 'lineHeight', 'textDecoration', 'opacity', 'display', 'fontFamily', 'margin', 'padding', 'borderTop', 'borderBottomWidth', 'boxShadow', 'borderRadius', 'letterSpacing', 'textAlign', 'position', 'overflow', 'zIndex', 'cursor', 'transform', 'backgroundImage', 'pointerEvents'];
const SLINE = /^(\s*)<([^ ]+) (.*?)> (hidden|-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+) (\S+(?: \S+)*?) (rgba?\([^)]*\)|transparent) (rgba?\([^)]*\)|transparent) \|(.*?)( canvas=.*)?$/;
const parse = (l) => {
  const m = SLINE.exec(l.replace('/NotoSansThai/', '/"Noto Sans Thai"/'));
  if (!m) return null;
  const cls = /(?:^|\s)class=(\S+)/.exec(m[3])?.[1] ?? '';
  const id = /(?:^|\s)id=(\S+)/.exec(m[3])?.[1] ?? '';
  const f = m[8].split('/');
  const st = { fontSize: m[5], color: m[6], bg: m[7] };
  FIELDS.forEach((n, i) => (st[n] = f[i]));
  return { key: m[2] + (id ? '#' + id : '') + (cls ? '.' + cls.split(/\s+/)[0] : ''), rect: m[4], st };
};

/** lines are aligned by position (use after the structure matches); geom = compare the rectangles instead of the styles */
export function styleSummary(javaText, ngText, { geom = false, max = 60 } = {}) {
  const a = javaText.split('\n').map(parse);
  const b = ngText.split('\n').map(parse);
  const agg = new Map();
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (!a[i] || !b[i] || a[i].key !== b[i].key) continue;
    const props = geom ? { rect: [a[i].rect, b[i].rect] } : Object.fromEntries(Object.keys(a[i].st).map((k) => [k, [a[i].st[k], b[i].st[k]]]));
    for (const [k, [x, y]] of Object.entries(props)) {
      if (x === y) continue;
      const key = `${a[i].key} :: ${k}`;
      const e = agg.get(key) ?? { n: 0, ex: `${x}  →  ${y}` };
      e.n++;
      agg.set(key, e);
    }
  }
  return [...agg.entries()].slice(0, max).map(([k, v]) => `  ${String(v.n).padStart(3)}× ${k}\n        ${v.ex}`);
}
