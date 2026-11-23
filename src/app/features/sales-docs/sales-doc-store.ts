/**
 * The sales documents the user saved in the mockup (quotation · booking · delivery note · auto-dealer quotation · booking).
 *
 * The Java forms have NO save API: they validate, build the document payload (`SalesDocPayload.build`, written to `console.debug` as
 * `[qt] document payload`) and open the "saved" pop-up with a provisional number. In the mockup the host listens for that payload
 * (`captureSalesDocSaves`) and keeps the document, so the list of the type shows it — nothing of the generated engines changes.
 * Kept in Datasource/sales-docs.json when the mockup file server is up (core/mockup), in memory otherwise.
 *
 * Limits (the Java page has no way to do them either): a saved document cannot be opened again from the list, edited or deleted.
 */
import { datasourceDoc, mockupEnabled } from '@core/mockup/mockup-datasource';
import { saveDocument } from '@core/mockup/mockup-client';
import { SALES_DOC_TYPES, type SalesDocRow, type SalesDocType } from './sales-doc-types';

export interface StoredSalesDoc {
  type: SalesDocType;
  row: SalesDocRow;
  /** what the form built (`SalesDocPayload.build`): header + lines */
  payload: unknown;
  /** what the form showed when it was saved (label → value, the item table): what the detail page of the document shows */
  snapshot?: SalesDocSnapshot;
}

/** the screen of a form at the moment it was saved */
export interface SalesDocSnapshot {
  fields: { label: string; value: string }[];
  /** the item table: the column names and the text of each row */
  lines: { columns: string[]; rows: string[][] };
}

const DOC_NAME = 'sales-docs';
const SAVED_STATUS = 'บันทึกแล้ว';
const PAYLOAD_TAG = /^\[(qt|bk|ob|aq|ad)\] document payload/;
const SEQ_WIDTH = 5;

let docs: StoredSalesDoc[] | undefined;

const all = (): StoredSalesDoc[] => (docs ??= (datasourceDoc<StoredSalesDoc[]>(DOC_NAME) ?? []).slice());

const asText = (v: unknown): string => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));

/** the rows of a type, the newest first */
export const storedSalesDocRows = (type: SalesDocType): SalesDocRow[] =>
  all()
    .filter((d) => d.type === type)
    .map((d) => d.row)
    .reverse();

/** the sales order payload has no customer name (only the code) and carries the sale person as { name } */
const personName = (v: unknown): string => (typeof v === 'object' && v !== null ? asText((v as { name?: unknown }).name) : asText(v));
const customerOnScreen = (type: SalesDocType): string => (typeof document === 'undefined' ? '' : textOf(document.getElementById(`${type}CName`)));

/** keeps a document from its payload and gives the row of the list (undefined when the payload is not one) */
export function recordSalesDoc(type: SalesDocType, payload: unknown): SalesDocRow | undefined {
  const header = (payload as { header?: Record<string, unknown> } | null)?.header;
  if (!header) return undefined;
  const date = asText(header['doc_date']);
  const yymm = date.length >= 7 ? `${date.slice(2, 4)}${date.slice(5, 7)}` : '0000';
  // the highest number of the type + 1 (not the count: a deleted document must not give its number to the next one)
  const last = all().filter((d) => d.type === type).reduce((max, d) => Math.max(max, Number(/(\d+)$/.exec(d.row.no)?.[1] ?? 0)), 0);
  const seq = String(last + 1).padStart(SEQ_WIDTH, '0');
  const row: SalesDocRow = {
    no: `${type.toUpperCase()}:M00-${yymm}-${seq}`,
    date,
    customer: asText(header['prospect_name']) || customerOnScreen(type) || '-',
    ...(asText(header['refdocno']) ? { ref: asText(header['refdocno']) } : {}),
    employee: personName(header['saleperson']),
    total: typeof header['netamount_after_vat'] === 'number' ? header['netamount_after_vat'] : asText(header['netamount_after_vat']),
    status: SAVED_STATUS,
  };
  const snapshot = snapshotFromScreen(type);
  docs = [...all(), { type, row, payload, ...(snapshot ? { snapshot } : {}) }];
  persist();
  return row;
}

/** one document of a type by its number */
export const findSalesDoc = (type: SalesDocType, no: string): StoredSalesDoc | undefined => all().find((d) => d.type === type && d.row.no === no);

const persist = (): void => {
  if (mockupEnabled()) void saveDocument(DOC_NAME, docs);
};

/** removes a document; false when there is none of that number */
export function deleteSalesDoc(type: SalesDocType, no: string): boolean {
  const before = all();
  docs = before.filter((d) => !(d.type === type && d.row.no === no));
  if (docs.length === before.length) return false;
  persist();
  return true;
}

/** the part of a document the user may edit on the detail page (the columns of the list + the fields of the snapshot) */
export interface SalesDocEdit {
  date?: string;
  customer?: string;
  employee?: string;
  total?: number | string;
  status?: string;
  fields?: { label: string; value: string }[];
}

/** changes a document; undefined when there is none of that number */
export function updateSalesDoc(type: SalesDocType, no: string, edit: SalesDocEdit): SalesDocRow | undefined {
  const current = findSalesDoc(type, no);
  if (!current) return undefined;
  const { fields, ...columns } = edit;
  const row: SalesDocRow = { ...current.row, ...Object.fromEntries(Object.entries(columns).filter(([, v]) => v !== undefined)) };
  const snapshot = fields && current.snapshot ? { ...current.snapshot, fields } : current.snapshot;
  docs = all().map((d) => (d === current ? { ...d, row, ...(snapshot ? { snapshot } : {}) } : d));
  persist();
  return row;
}

/**
 * Listens for the payload the forms write to `console.debug` when the user saves; returns the function that stops listening.
 * (The generated engines are not edited: the line they already write is the hand-over.)
 */
export function captureSalesDocSaves(): () => void {
  const original = console.debug;
  console.debug = (...args: unknown[]): void => {
    const tag = typeof args[0] === 'string' ? PAYLOAD_TAG.exec(args[0]) : null;
    if (tag && (SALES_DOC_TYPES as readonly string[]).includes(tag[1])) recordSalesDoc(tag[1] as SalesDocType, args[1]);
    original.apply(console, args);
  };
  const stopDom = typeof MutationObserver === 'undefined' ? undefined : watchSavedPopup();
  return () => {
    console.debug = original;
    stopDom?.();
  };
}

/* ------------------------------------------------------------------------------------------ forms that write no payload (ob · aq · ad) */

/** the forms that open the "saved" pop-up without building a payload: what they hold on screen at that moment is the document */
const POPUP_ONLY_TYPES: readonly SalesDocType[] = ['ob', 'aq', 'ad'];
const TOTAL_FIELDS = ['Grand', 'NetPrice', 'GrandTotalNet', 'NetPayment'] as const;

const elementOf = (prefix: string, suffix: string): HTMLElement | null => document.getElementById(`${prefix}${suffix}`);
const textOf = (el: HTMLElement | null): string => (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : (el?.textContent ?? '')).trim();

/** `dd/MM/yyyy` → `yyyy-MM-dd`; anything else is left as it is */
function isoDate(value: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : value;
}

const SNAPSHOT_FIELD_LIMIT = 80;
/** the "— เลือก —" option of a dropdown that nothing was picked in */
const PLACEHOLDER = /^[—–-]\s*เลือก/;
const LABEL_EXTRA = [['ลูกค้า', 'CName'], ['รหัสลูกค้า', 'CCode'], ['เลขประจำตัวผู้เสียภาษี', 'CTaxId'], ['ที่อยู่', 'CAddr']] as const;

const controlText = (el: Element | null): string => {
  if (el instanceof HTMLSelectElement) return (el.selectedOptions[0]?.text ?? '').trim();
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) return el.checked ? '✓' : '';
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value.trim();
  return (el?.textContent ?? '').trim();
};

/** the item table of the form of `type` (its tbody has no common id: Items / the rows of the car) */
function itemBody(type: SalesDocType): HTMLTableSectionElement | null {
  const direct = document.querySelector<HTMLTableSectionElement>(`tbody[id^="${type}"][id$="Items"]`);
  if (direct) return direct;
  return [...document.querySelectorAll<HTMLTableSectionElement>(`tbody[id^="${type}"]`)].find((b) => b.querySelector('select[id^="odsAuto"], input')) ?? null;
}

/** what the form of `type` shows now: the labelled fields with a value and the item table; undefined when the form is not on the page */
export function snapshotFromScreen(type: SalesDocType): SalesDocSnapshot | undefined {
  if (typeof document === 'undefined') return undefined;
  const fields: { label: string; value: string }[] = [];
  for (const [label, suffix] of LABEL_EXTRA) {
    const value = textOf(elementOf(type, suffix));
    if (value) fields.push({ label, value });
  }
  for (const label of document.querySelectorAll<HTMLLabelElement>(`label[for^="${type}"]`)) {
    if (fields.length >= SNAPSHOT_FIELD_LIMIT) break;
    const control = document.getElementById(label.htmlFor);
    const value = controlText(control);
    const name = (label.textContent ?? '').replace(/\*/g, '').trim();
    if (name && value && !PLACEHOLDER.test(value) && value !== '0' && value !== '0.00' && value !== '0.0' && !fields.some((f) => f.label === name && f.value === value)) fields.push({ label: name, value });
  }
  const body = itemBody(type);
  const columns = [...(body?.closest('table')?.querySelectorAll('thead th') ?? [])].map((th) => (th.textContent ?? '').trim());
  const rows = [...(body?.querySelectorAll('tr') ?? [])]
    .map((tr) => [...tr.children].map((td) => (td.querySelector('select, input, textarea') ? controlText(td.querySelector('select, input, textarea')) : (td.textContent ?? '').trim())))
    .filter((r) => r.some((c) => c !== ''));
  return fields.length || rows.length ? { fields, lines: { columns, rows } } : undefined;
}

/** a payload (the part the list needs) read from the fields of the form of `type` */
export function payloadFromScreen(type: SalesDocType): unknown {
  const employee = elementOf(type, 'DocEmployee');
  const total = TOTAL_FIELDS.map((f) => textOf(elementOf(type, f))).find((t) => t !== '');
  return {
    header: {
      doc_date: isoDate(textOf(elementOf(type, 'DocDate'))),
      prospect_name: textOf(elementOf(type, 'CName')),
      refdocno: textOf(elementOf(type, 'RefNo')),
      saleperson: employee instanceof HTMLSelectElement ? (employee.selectedOptions[0]?.text ?? '').trim() : textOf(employee),
      netamount_after_vat: total === undefined ? '' : Number(total.replace(/[^0-9.]/g, '')),
    },
  };
}

/** watches for the number of the "saved" pop-up of ob / aq / ad being written (the pop-up opens) and keeps the document then */
function watchSavedPopup(): () => void {
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      const el = r.target instanceof Element ? r.target : r.target.parentElement;
      const type = POPUP_ONLY_TYPES.find((t) => el?.id === `${t}SavedNo`);
      if (type && el?.textContent) recordSalesDoc(type, payloadFromScreen(type));
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

/** forget everything (tests) */
export function resetSalesDocStore(): void {
  docs = undefined;
}
