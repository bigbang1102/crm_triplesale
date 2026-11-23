/**
 * What the Smart Doc host decides by itself (framework-free so the spec runs in Node). The page itself — list, forms, pop-ups, print —
 * is generated from the BA's prototype (`tools/sync-smart-doc.mjs` → smart-doc.{html,css,engine.ts}).
 */
import type { SmartDocKey } from './smart-doc.engine';

/** The documents in the order of the BA's document menu: ใบเสนอราคา → ใบจอง → ใบส่งสินค้า → ใบรับเงิน. */
export const SMART_DOC_KEYS: readonly SmartDocKey[] = ['qt', 'so', 'do', 'rv'];

/** The route of a document's list (`/sales/smart-doc/:doc` — page-registry id `smart-doc`). */
export const SMART_DOC_ROUTE = '/sales/smart-doc';

/** the `:doc` of the URL, or undefined when it is not one of the four documents */
export const smartDocKey = (value: string | null | undefined): SmartDocKey | undefined =>
  SMART_DOC_KEYS.find((key) => key === value);

/**
 * The events after which the host compares the script's data with what was saved: everything the prototype changes starts from a
 * click (save, approve, delete, convert …), a typed value or a choice.
 */
export const SAVE_EVENTS = ['click', 'change', 'input', 'keyup'] as const;

/** how long the host waits after such an event: the script finishes its own work (pop-ups close, lists re-render) first */
export const SAVE_DELAY_MS = 300;
