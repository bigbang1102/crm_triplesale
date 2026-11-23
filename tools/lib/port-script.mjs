/**
 * Script-level helpers of the "generate the page 1:1 from the Java file" generators that do NOT depend on the page
 * (first used by tools/sync-activities.mjs and tools/lib/work-modal.mjs; port.mjs has the swap helpers, port-kit.mjs the
 * stylesheet adaptation and the engine frame). Everything works on the TEXT of a Java page script (sloppy ES5 in a browser
 * global scope) and turns it into the body of an `export function startX(env)` engine.
 *
 *   elMessages(js, what)            `'#{commonBean.msg['k']}'` inside a JS string literal -> `'' + env.t("k") + ''`
 *   fsAdj(js)                       `var(--fs-adj,0px)` (A A A font buttons) -> `var(--ts-fs-adj,0px)` (the token of the Angular shell)
 *   swapCalls(js, what, name, repl) every BARE call `name(` (not `.name(`, not `xname(`) -> `repl(`; at least one must exist
 *   windowNames(js)                 the names the script assigns on `window` (`window.x = …`) — destroy() must delete them again
 *   codeOf(js)                      the code without comments (for the "nothing left over" checks)
 *   assertPortable(js, what, o)     the checks every engine must pass: no EL, no timer / XHR / storage / location / window.open / Java link left
 *
 * The Java files are only READ. A swap that no longer matches stops the run on purpose: the original changed in a place the
 * port depends on.
 */

/** the code of a script without comments (line comments after code too) — only for checks, never for output */
export function codeOf(js) {
  return js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/[^\n'"]*$/gm, '');
}

/**
 * Message lookups of Facelets inside the string literals of a script:
 *   label:'#{commonBean.msg['label.x']}'            ->  label:'' + env.t("label.x") + ''
 *   text: '#{commonBean.msg["k"]}: '+m              ->  text: '' + env.t("k") + ': '+m
 *   "…#{commonBean.msg['k']}…"                      ->  "…" + env.t("k") + "…"
 * The quote of the surrounding literal is found with a per-line string state machine; every EL must sit inside a literal that is
 * closed on the same line (all of them do in the Java pages — anything else stops the run).
 */
export function elMessages(js, what) {
  const EL = /#\{commonBean\.msg\[(['"])([\w.]+)\1\]\}/g;
  let count = 0;
  const out = js.split('\n').map((line, i) => {
    if (!line.includes('#{commonBean.msg[')) return line;
    const keys = [];
    const ph = line.replace(EL, (_m, _q, k) => (keys.push(k), '\u0001'));
    let q = '';
    let res = '';
    let n = 0;
    for (let k = 0; k < ph.length; k++) {
      const c = ph[k];
      if (q) {
        if (c === '\\') {
          res += c + (ph[k + 1] ?? '');
          k++;
          continue;
        }
        if (c === q) q = '';
        if (c === '\u0001') {
          res += `${q} + env.t(${JSON.stringify(keys[n++])}) + ${q}`;
          count++;
          continue;
        }
        res += c;
        continue;
      }
      if (c === '/' && ph[k + 1] === '/') {
        // the rest of the line is a comment: an EL there is not code
        res += ph.slice(k).replace(/\u0001/g, () => `#{commonBean.msg['${keys[n++]}']}`);
        q = '';
        k = ph.length;
        break;
      }
      if (c === '"' || c === "'") q = c;
      if (c === '\u0001') throw new Error(`${what}: a message lookup outside a string literal (line ${i + 1}): ${line.trim().slice(0, 120)}`);
      res += c;
    }
    if (q) throw new Error(`${what}: unbalanced quotes on a line with a message lookup (line ${i + 1}): ${line.trim().slice(0, 120)}`);
    if (n !== keys.length) throw new Error(`${what}: message lookups left on line ${i + 1}`);
    return res;
  });
  if (!count) throw new Error(`${what}: no message lookup found`);
  return out.join('\n');
}

/** the A A A font buttons: Java sets --fs-adj on <html>, the Angular shell --ts-fs-adj */
export const fsAdj = (js) => js.replace(/--fs-adj/g, '--ts-fs-adj');

/** a bare call of a global function: `name(` but not `obj.name(`, `xname(` or `$name(` */
export function swapCalls(js, what, name, repl) {
  const re = new RegExp(`(^|[^.\\w$])${name.replace(/[$]/g, '\\$')}\\(`, 'gm');
  let n = 0;
  const out = js.replace(re, (_m, pre) => (n++, `${pre}${repl}(`));
  if (!n) throw new Error(`${what} changed — no bare call of ${name}() found`);
  return { text: out, count: n };
}

/** the names assigned on window: `window.x = …` / `window.x=…` (not `==`) */
export function windowNames(js) {
  return [...new Set([...codeOf(js).matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)].map((m) => m[1]))];
}

/**
 * The checks every engine must pass before it is written (see porting guide §3.2): no EL left, no unmanaged timer / observer /
 * XHR / storage / cookie, no page-address or Java-page access, no bare fetch / swal / echarts call.
 * @param {object} [o]
 * @param {string[]} [o.allow]   extra words that may stay (each with a reason at the call site)
 * @param {string[]} [o.bare]    functions that must not be called bare any more (default: fetch, swal)
 * @param {string[]} [o.javaLinks]  literals of Java page links that stay on purpose (given to env.navigate / env.href; the host maps them)
 */
export function assertPortable(js, what, o = {}) {
  const code = codeOf(js);
  if (/#\{/.test(code)) throw new Error(`${what}: EL left over in code: ` + code.match(/.{0,40}#\{.{0,40}/)[0]);
  const banned = /\b(setInterval|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|window\.open|window\.location|location\.(href|pathname|reload|assign|replace)|navigator\.sendBeacon)\b/;
  const m = banned.exec(code);
  if (m && !(o.allow ?? []).includes(m[1])) throw new Error(`${what}: ${m[1]} left in the code — route it through env: ` + code.match(new RegExp(`.{0,40}${m[1].replace(/\./g, '\\.')}.{0,40}`))[0]);
  // links of the Java app that are passed to env.navigate()/env.href() on purpose (the host maps them with javaLinkToRoute): the exact literals
  let linkCode = code;
  for (const l of o.javaLinks ?? []) linkCode = linkCode.split(l).join('');
  const java = linkCode.match(/.{0,40}\.(face|xhtml)\b.{0,40}/);
  if (java) throw new Error(`${what}: a Java page link is left: ` + java[0]);
  for (const fn of o.bare ?? ['fetch', 'swal']) {
    const bare = new RegExp(`(^|[^.\\w$'"])${fn}\\(`, 'm').exec(code);
    if (bare) throw new Error(`${what}: a bare ${fn}() call is left: ` + code.match(new RegExp(`.{0,40}\\b${fn}\\(.{0,40}`))[0]);
  }
}
