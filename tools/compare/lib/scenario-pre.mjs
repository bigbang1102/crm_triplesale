// Helpers that every scenario can use. The text of a scenario function is run INSIDE the page under test with `sleep`, `side`
// ('java' | 'ng') and `win` in scope, after this prelude — so these names are free variables in a scenarios.mjs file.
export const PRE = `
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var need = function (el, what) { if (typeof el === 'string') { var q = el; el = $(q); if (!el) throw new Error('no element ' + (what || q)); } return el; };
var click = function (el) { need(el).click(); };
var typeIn = function (el, v) { el = need(el); el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
var pick = function (el, v) { el = need(el); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
var key = function (k, target) { (target || document).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); };
var waitFor = async function (fn, ms) { var t = Date.now(); while (!fn() && Date.now() - t < (ms || 6000)) await sleep(80); return !!fn(); };
// documents of iframes: fdoc('#calendarFrame') / fclick('#calendarFrame', '#gcNext') / ftype(sel, q, value)
var fdoc = function (sel) { var f = $(sel); return f && f.contentDocument; };
var fneed = function (sel, q) { var d = fdoc(sel); var el = d && d.querySelector(q); if (!el) throw new Error('no element ' + q + ' in ' + sel); return el; };
var fclick = function (sel, q) { fneed(sel, q).click(); };
var ftype = function (sel, q, v) { var el = fneed(sel, q); el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
// the A A A buttons: Java sets --fs-adj, the Angular shell --ts-fs-adj (the same value on <html>)
var fontAdj = function (v) { document.documentElement.style.setProperty('--fs-adj', v); document.documentElement.style.setProperty('--ts-fs-adj', v); };
`;
