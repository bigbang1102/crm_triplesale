/**
 * The data of the Smart Doc pages in Datasource: `state.smart-docs.json` (the mockup file server, see MOCKUP.md) holds what
 * `api.state()` of the script gives — the master data (customers, products, staff, branches, warehouses) and the four lists of
 * documents with their numbering. A person may edit the master data in the file (then reload the page).
 *
 * Without the file server the state stays in memory for the session (leaving the page and coming back keeps it), like the other mocks.
 *
 * FAST-DEBT(API): Datasource stands in for triplesales-api (SMD-QT/SO/OB/RV endpoints) · BIG · 2026-11-20
 */
import { persistedState } from '@core/mockup/mockup-datasource';

/** the plain JSON `api.state()` of the script returns (its shape is the prototype's) */
export type SmartDocState = Record<string, unknown>;

const state = persistedState<{ data?: SmartDocState }>('smart-docs', () => ({}));

/** what an earlier session saved, or undefined (= the prototype's samples) — a copy the script may change freely */
export function savedSmartDocs(): SmartDocState | undefined {
  const data = state.get().data;
  return data === undefined ? undefined : structuredClone(data);
}

/** keeps the script's data (saved to Datasource shortly after, when the file server is there) */
export function saveSmartDocs(data: SmartDocState): void {
  state.get().data = structuredClone(data);
  state.touch();
}

/** back to the prototype's samples (and the document removed from Datasource) */
export function resetSmartDocs(): void {
  state.reset();
}
