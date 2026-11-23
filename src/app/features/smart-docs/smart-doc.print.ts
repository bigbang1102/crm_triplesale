/**
 * The English copy of a printed Smart Doc document (the print tab offers ไทย / English — the document's language is the
 * customer's, not the screen's): the prototype's print view (Thai) put in English with the page's dictionary, the amount in
 * words in English and the company's English name of the letterhead (settings › นิติบุคคล).
 *
 * Customers, products, units and addresses stay as they were entered (Thai) until the masters give their English names.
 * FAST-DEBT(REQ): the language is chosen in the print tab each time — no document / customer language yet · BIG · 2026-11-23
 */
import { currentLetterhead, letterheadLinesEn } from '@core/mock/company-letterhead';
import { SMART_DOC_EN, SMART_DOC_EN_IN, SMART_DOC_KEEP_ATTRS } from './smart-doc.i18n';
import { PageTranslator, translator } from './smart-doc.translate';

const toEnglish = translator(SMART_DOC_EN);

/** the print view's content (Thai) as English HTML */
export function englishPaper(paper: HTMLElement): string {
  const box = document.createElement('div');
  box.innerHTML = paper.innerHTML;
  const pass = new PageTranslator(box, toEnglish, SMART_DOC_KEEP_ATTRS, SMART_DOC_EN_IN);
  pass.setEnglish(true);
  pass.stop();
  for (const words of Array.from(box.querySelectorAll<HTMLElement>('[data-amount]'))) {
    const amount = Number(words.dataset['amount']);
    if (Number.isFinite(amount)) words.textContent = `( ${amountInWordsEn(amount)} )`;
  }
  for (const name of Array.from(box.querySelectorAll<HTMLElement>('.pp-coname[data-en]'))) {
    name.textContent = name.dataset['en'] || name.textContent;
  }
  // the lines under the company name in English (ADDRESS_EN …) when a letterhead is kept
  const letterhead = currentLetterhead();
  const lines = box.querySelector<HTMLElement>('.pp-coname[data-en]')?.nextElementSibling;
  if (letterhead && lines) {
    lines.innerHTML = letterheadLinesEn(letterhead)
      .map((line) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
      .join('<br>');
  }
  return box.innerHTML;
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

/** 0–999 in words */
function hundreds(n: number): string {
  const parts: string[] = [];
  if (n >= 100) parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
  const rest = n % 100;
  if (rest >= 20)
    parts.push(TENS[Math.floor(rest / 10)] + (rest % 10 ? `-${ONES[rest % 10]}` : ''));
  else if (rest > 0) parts.push(ONES[rest]);
  return parts.join(' ');
}

/** a whole number in words: 903496 → Nine Hundred Three Thousand Four Hundred Ninety-Six */
export function numberInWordsEn(whole: number): string {
  if (whole === 0) return 'Zero';
  const groups: string[] = [];
  let n = whole;
  for (let i = 0; n > 0 && i < SCALES.length; i++, n = Math.floor(n / 1000)) {
    const g = n % 1000;
    if (g) groups.unshift(hundreds(g) + (SCALES[i] ? ` ${SCALES[i]}` : ''));
  }
  return groups.join(' ');
}

/** an amount in baht in words, as on a Thai document's English form: … Baht Only / … Baht and … Satang */
export function amountInWordsEn(amount: number): string {
  const satangAll = Math.round(Math.abs(amount) * 100);
  const baht = Math.floor(satangAll / 100);
  const satang = satangAll % 100;
  const sign = amount < 0 ? 'Minus ' : '';
  if (!satang) return `${sign}${numberInWordsEn(baht)} Baht Only`;
  return baht
    ? `${sign}${numberInWordsEn(baht)} Baht and ${numberInWordsEn(satang)} Satang`
    : `${sign}${numberInWordsEn(satang)} Satang`;
}
