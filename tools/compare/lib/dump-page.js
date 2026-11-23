// Runs INSIDE the page under test (injected by the runner). Serialises documents so that the Java page and the Angular page can be
// compared line by line: structure, attributes, text, geometry, key computed styles, and a checksum of every <canvas> (ECharts).
//
//   await __cmp.dump([{ name: 'main', roots: ['.root'] }, { name: 'cal', frame: '#calendarFrame', roots: ['body'] }])  ->  string
//
// Deliberate normalisations (things that differ for reasons that are not the page): the theme attribute (Java <body>, Angular <html>),
// the Angular scope attributes, srcdoc contents (frames are dumped as documents of their own), ECharts instance ids, whitespace in
// attribute values.
(function () {
  if (window.__cmp) return;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const normStyle = (v) => {
    const out = [];
    let cur = '', depth = 0, q = '';
    for (const ch of v) {
      if (q) { cur += ch; if (ch === q) q = ''; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ';' && depth === 0) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/^([\w-]+)\s*:\s*/, '$1:').replace(/,\s+/g, ',').replace(/--ts-fs-adj/g, '--fs-adj')).join(';');
  };
  const sum = (str) => {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16) + ':' + str.length;
  };
  // window.__cmpState (a page's prelude sets it): the state of the form controls is compared as a user (and a post) sees it — `.value` / `.checked` / `.selected`
  // properties — instead of the attributes the markup was written with (a server that does not draw a control again leaves its `value` / `selected` attribute as
  // it was; a framework that binds the attribute does not)
  const stateOf = (el) => {
    if (window.__cmpState !== true) return null;
    const t = el.tagName;
    if (t === 'OPTION') return { drop: ['selected'], add: ['.selected=' + el.selected] };
    if (t === 'SELECT') return { drop: [], add: ['.value=' + el.value] };
    if (t === 'TEXTAREA') return { drop: ['value'], add: ['.value=' + el.value] };
    if (t === 'INPUT') {
      const ty = (el.getAttribute('type') || 'text').toLowerCase();
      if (ty === 'checkbox' || ty === 'radio') return { drop: ['checked'], add: ['.checked=' + el.checked] };
      if (ty === 'hidden' || ty === 'file' || ty === 'submit' || ty === 'button') return null;
      return { drop: ['value'], add: ['.value=' + el.value] };
    }
    return null;
  };
  const attrsOf = (el) => {
    const st = stateOf(el);
    return [...el.attributes]
      .filter((a) => !/^(_ng|ng-|ngh|nghm)/.test(a.name) && !(st && st.drop.includes(a.name)))
      .map((a) => a.name + '=' + (a.name === 'style' ? normStyle(a.value) : a.name === 'srcdoc' ? 'SRCDOC' : a.name === '_echarts_instance_' ? 'EC' : a.value.replace(/\s+/g, ' ').trim()))
      .concat(st ? st.add : [])
      .sort()
      .join(' ');
  };

  async function dump(docs, opts = {}) {
    const lines = [];
    for (const target of docs) {
      let doc = document;
      if (target.frame) {
        const f = document.querySelector(target.frame);
        if (!f || !f.contentDocument) { lines.push('DOC ' + target.name + ' (missing frame ' + target.frame + ')'); continue; }
        doc = f.contentDocument;
      }
      const win = doc.defaultView;
      if (!doc.getElementById('__noanim')) {
        const st = doc.createElement('style');
        st.id = '__noanim';
        st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
        doc.head.appendChild(st);
        await sleep(150);
      }
      const walk = (el, d) => {
        const r = el.getBoundingClientRect();
        const cs = win.getComputedStyle(el);
        const vis = r.width > 0 || r.height > 0;
        let canvas = '';
        if (el.tagName === 'CANVAS') {
          try { canvas = ' canvas=' + sum(el.toDataURL()) + ' ' + el.width + 'x' + el.height; } catch (e) { canvas = ' canvas=ERR'; }
        }
        lines.push(
          ' '.repeat(d) + '<' + el.tagName.toLowerCase() + ' ' + attrsOf(el) + '> ' +
            (vis ? [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 10) / 10).join(',') : 'hidden') +
            ' ' + cs.fontSize + ' ' + cs.color + ' ' + cs.backgroundColor +
            ' |' + [cs.fontWeight, cs.lineHeight, cs.textDecorationLine, cs.opacity, cs.display, cs.fontFamily.split(',')[0], cs.margin, cs.padding,
              cs.borderTopWidth + cs.borderTopStyle + cs.borderTopColor, cs.borderBottomWidth, cs.boxShadow === 'none' ? '' : cs.boxShadow, cs.borderRadius, cs.letterSpacing, cs.textAlign,
              cs.position, cs.overflow, cs.zIndex, cs.cursor, cs.transform === 'none' ? '' : cs.transform, cs.backgroundImage === 'none' ? '' : cs.backgroundImage.replace(/url\("https?:\/\/[^\/"]+\/(?:triplesale\/|assets\/)?/g, 'url("').slice(0, 90), cs.pointerEvents].join('/') + canvas,
        );
        for (const n of el.childNodes) {
          if (n.nodeType === 1) {
            if (n.tagName === 'SCRIPT' || n.tagName === 'STYLE') continue; // code is compared elsewhere (the generator swaps)
            walk(n, d + 1);
          } else if (n.nodeType === 3) {
            const t = norm(n.textContent);
            if (t) lines.push(' '.repeat(d + 1) + '#text ' + t);
          }
        }
      };
      lines.push('DOC ' + target.name + ' VP ' + win.innerWidth + ',' + win.innerHeight + ' theme=' + doc.documentElement.getAttribute('data-theme') + '/' + doc.body.getAttribute('data-theme'));
      for (const sel of target.roots) {
        const els = doc.querySelectorAll(sel);
        lines.push('ROOT ' + sel + ' x' + els.length);
        els.forEach((el) => walk(el, 0));
      }
    }
    if (typeof window.__extra === 'function') { await sleep(150); lines.push(...(await window.__extra())); }
    return lines.join('\n');
  }

  // the code of a scenario: a function body with (sleep, side, win) in scope
  async function run(code, side) {
    const fn = new Function('sleep', 'side', 'win', 'return (async function(){' + code + '\n})()');
    return fn(sleep, side, window);
  }

  window.__cmp = { dump, run, sleep };
})();
