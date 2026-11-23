/**
 * Fake backend of the sales-document list (dev / `mock: true`, the unit tests). The Java page has no list API yet and shows an empty
 * table for every type — so does this one. Framework-free (the comparison harness may load it in Node).
 */
import type { SalesDocRow, SalesDocType } from '../sales-doc-types';
import { storedSalesDocRows } from '../sales-doc-store';
import type { SalesDocListBackend } from './sales-doc-list-backend';

export function createMockSalesDocList(): SalesDocListBackend {
  return {
    // the documents the user saved in this session / the mockup (sales-doc-store.ts); none until one is saved, like the Java page
    list: (type: SalesDocType): Promise<SalesDocRow[]> => Promise.resolve(storedSalesDocRows(type)),
  };
}
