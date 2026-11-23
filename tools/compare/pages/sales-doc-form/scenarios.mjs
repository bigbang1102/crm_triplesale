// Scenarios of the sales-document forms comparison. A scenario is the TEXT of a function body that runs INSIDE the page under test
// (Java replica / Angular app) with (sleep, side, win) in scope, after the prelude of lib/scenario-pre.mjs and pre.mjs (typ, pickCust, createCust,
// fillValid, save …). `S(type, body)` sets the prefix the helpers read (`P`).
// add(name, opts, fn):  opts = { type, w, h, theme, lang, settle, wait, roots, ready, mock, frames }
//   type = qt | bk | ob | aq | ad ; mock = a fault of the fake backend (`?mock=` of the address, see sales-doc.mock.ts)
import customer from './scenarios-customer.mjs';
import payment from './scenarios-payment.mjs';
import attach from './scenarios-attach.mjs';
import save from './scenarios-save.mjs';
import ob from './scenarios-ob.mjs';
import auto from './scenarios-auto.mjs';
import misc from './scenarios-misc.mjs';

const S = (type, body) => `var P = ${JSON.stringify(type)};\n${body}`;

export default function (add) {
  const ALL = ['qt', 'bk', 'ob', 'aq', 'ad'];
  const ITEMS = ['qt', 'bk', 'ob']; // the forms with the item table (SalesDocItems)
  const PAY = ['qt', 'bk']; // the forms with the payment method (SalesDocPayment)
  const SIZES = [[390, 844], [768, 1024], [1024, 768], [1920, 1080]];

  /* ======================================================================================== first paint */
  ALL.forEach((t) => {
    add(`overview-${t}`, { type: t }, S(t, ''));
    add(`overview-${t}-dark`, { type: t, theme: 'dark' }, S(t, ''));
    SIZES.forEach((s) => add(`overview-${t}-${s[0]}`, { type: t, w: s[0], h: s[1] }, S(t, '')));
    add(`overview-${t}-dark-390`, { type: t, theme: 'dark', w: 390, h: 844 }, S(t, ''));
    add(`en-overview-${t}`, { type: t, lang: 'en' }, S(t, ''));
    add(`en-overview-${t}-dark`, { type: t, lang: 'en', theme: 'dark' }, S(t, ''));
    add(`fs-plus-${t}`, { type: t }, S(t, 'fontAdj("2px"); await sleep(600);'));
    add(`fs-minus-${t}`, { type: t }, S(t, 'fontAdj("-2px"); await sleep(600);'));
    add(`fs-plus-${t}-dark-768`, { type: t, theme: 'dark', w: 768, h: 1024 }, S(t, 'fontAdj("2px"); await sleep(600);'));
  });

  /* ======================================================================================== items (qt · bk · ob) */
  ITEMS.forEach((t) => {
    add(`${t}-items-add-row`, { type: t }, S(t, `await addRow(); await addRow();`));
    add(`${t}-items-remove-row`, { type: t }, S(t, `await addRow(); await addRow(); row(1).querySelector('.qt-del').click(); await sleep(150);`));
    add(`${t}-items-remove-all`, { type: t }, S(t, `row(0).querySelector('.qt-del').click(); await sleep(150);`));
    add(`${t}-items-product`, { type: t }, S(t, `setProduct(0, 'ACC-A001'); await sleep(200);`));
    add(`${t}-items-product-dark`, { type: t, theme: 'dark' }, S(t, `setProduct(0, 'ACC-A001'); await sleep(200);`));
    add(`${t}-items-product-en`, { type: t, lang: 'en' }, S(t, `setProduct(0, 'ACC-A002'); await sleep(200);`));
    add(`${t}-items-qty-price`, { type: t }, S(t, `setProduct(0, 'ACC-A002'); typ(cell(row(0), 'qty'), '3'); typ(cell(row(0), 'price'), '1234.5'); await sleep(200);`));
    add(`${t}-items-qty-decimals`, { type: t }, S(t, `setProduct(0, 'ACC-A001'); typ(cell(row(0), 'qty'), '1.23456'); await sleep(200);`));
    add(`${t}-items-two-products`, { type: t }, S(t, `setProduct(0, 'ACC-A001'); await addRow(); setProduct(1, 'PT-BRAKE'); typ(cell(row(1), 'qty'), '4'); await sleep(200);`));
    // the rounding the Java comment tells about: 1092.50 x 7% = 76.475 -> 76.48
    add(`${t}-items-rounding`, { type: t }, S(t, `setProduct(0, 'ACC-A001'); pick(cell(row(0), 'vat'), 'exclude'); await sleep(250);`));
    add(`${t}-items-discount-amount`, { type: t }, S(t, `setProduct(0, 'PT-TIRE'); typ(cell(row(0), 'disc'), '500'); await sleep(200);`));
    add(`${t}-items-discount-percent`, { type: t }, S(t, `setProduct(0, 'PT-TIRE'); typ(cell(row(0), 'disc'), '12.5%'); await sleep(200);`));
    add(`${t}-items-extra-discount`, { type: t }, S(t, `setProduct(0, 'PT-TIRE'); typ($id('Discount'), '100'); await sleep(200);`));
    add(`${t}-items-extra-discount-percent`, { type: t }, S(t, `setProduct(0, 'PT-TIRE'); await addRow(); setProduct(1, 'PT-OIL5W30'); typ($id('Discount'), '5%'); await sleep(200);`));
    add(`${t}-items-vat-exclude`, { type: t }, S(t, `setProduct(0, 'PT-TIRE'); pick($id('VatMode'), 'exclude'); await sleep(250);`));
    add(`${t}-items-vat-exempt`, { type: t }, S(t, `setProduct(0, 'PT-TIRE'); pick($id('VatMode'), 'exempt'); await sleep(250);`));
    add(`${t}-items-vat-mixed`, { type: t }, S(t, `setProduct(0, 'PT-TIRE'); await addRow(); setProduct(1, 'PT-OIL5W30'); pick(cell(row(1), 'vat'), 'exempt'); await sleep(250);`));
    add(`${t}-items-vat-mixed-then-doc`, { type: t }, S(t, `setProduct(0, 'PT-TIRE'); await addRow(); setProduct(1, 'PT-OIL5W30'); pick(cell(row(1), 'vat'), 'exempt'); await sleep(150); pick($id('VatMode'), 'exclude'); await sleep(250);`));
    add(`${t}-items-focus-formats`, { type: t }, S(t, `setProduct(0, 'ACC-A002'); var q = cell(row(0), 'price'); evt(q, 'focusin'); await sleep(100);`));
    // every message of the validation of a row
    [['qty-empty', 'qty', ''], ['qty-zero', 'qty', '0'], ['qty-text', 'qty', 'abc'], ['qty-many-decimals', 'qty', '1.1234567'], ['qty-too-big', 'qty', '10000000'],
     ['price-empty', 'price', ''], ['price-text', 'price', 'x'], ['price-decimals', 'price', '1.234'], ['price-too-big', 'price', '1000000000'],
     ['disc-empty', 'disc', ''], ['disc-text', 'disc', 'abc'], ['disc-over', 'disc', '99999999'], ['disc-percent-over', 'disc', '150%'], ['disc-decimals', 'disc', '1.234']].forEach(([n, f, v]) => {
      add(`${t}-items-invalid-${n}`, { type: t }, S(t, `setProduct(0, 'ACC-A001'); typ(cell(row(0), '${f}'), ${JSON.stringify(v)}); await sleep(250);`));
    });
    add(`${t}-items-invalid-xdisc-text`, { type: t }, S(t, `setProduct(0, 'ACC-A001'); typ($id('Discount'), 'abc'); await sleep(250);`));
    add(`${t}-items-invalid-xdisc-over`, { type: t }, S(t, `setProduct(0, 'ACC-A001'); typ($id('Discount'), '999999'); await sleep(250);`));
    add(`${t}-items-invalid-xdisc-percent`, { type: t }, S(t, `setProduct(0, 'ACC-A001'); typ($id('Discount'), '101%'); await sleep(250);`));
    add(`${t}-items-invalid-dark`, { type: t, theme: 'dark' }, S(t, `setProduct(0, 'ACC-A001'); typ(cell(row(0), 'qty'), '0'); await sleep(250);`));
    add(`${t}-items-invalid-en`, { type: t, lang: 'en' }, S(t, `setProduct(0, 'ACC-A001'); typ(cell(row(0), 'qty'), '0'); await sleep(250);`));
    add(`${t}-items-mask-input`, { type: t }, S(t, `var q = cell(row(0), 'qty'); evt(q, 'focusin'); q.value = '1a2,3-'; evt(q, 'input'); await sleep(150);`));
    add(`${t}-items-390`, { type: t, w: 390, h: 844 }, S(t, `setProduct(0, 'ACC-A001'); await addRow(); setProduct(1, 'PT-BRAKE'); await sleep(200);`));
    add(`${t}-items-materials-error`, { type: t, mock: 'materials-error' }, S(t, `await sleep(200);`));
    add(`${t}-items-materials-empty`, { type: t, mock: 'materials-empty' }, S(t, `await sleep(200);`));
    add(`${t}-items-materials-slow`, { type: t, mock: 'slow-materials', ready: "document.querySelector('.qt-paper')", settle: 300 }, S(t, `await sleep(200);`));
  });

  customer(add, S, ALL);
  payment(add, S);
  attach(add, S);
  save(add, S, ALL);
  ob(add, S);
  auto(add, S);
  misc(add, S);

  // around the breakpoints of the stylesheets (600 640 767 899 1023 1279 1439 1599 1919) and the phone widths
  [[360, 740], [600, 900], [601, 900], [640, 900], [641, 900], [767, 900], [899, 900], [900, 900], [1023, 800], [1279, 800], [1280, 800], [1439, 800], [1440, 900], [1599, 900], [1600, 900], [1919, 1000]].forEach((s) => {
    ['qt', 'ob', 'ad'].forEach((t) => add(`width-${t}-${s[0]}`, { type: t, w: s[0], h: s[1] }, S(t, '')));
  });
  ['bk', 'aq'].forEach((t) => [[600, 900], [767, 900], [1023, 800], [1279, 800], [1599, 900]].forEach((s) => add(`width-${t}-${s[0]}`, { type: t, w: s[0], h: s[1] }, S(t, ''))));
}
