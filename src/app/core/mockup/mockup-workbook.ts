/**
 * Gives a company of the Seed Workbook (A1 · B1 · B2) its own cast before the app starts. The importer (tools/mockup-import-workbook.mjs) put the
 * CRM rows of each company on the file server as `seed.workbook.crm.<company>` (+ `seed.workbook.master`); this turns them into the documents the mock
 * pages already read — `seed.org`, `seed.crm` and the lists of `ref.shared` — in the documents the app has just loaded, so nothing else changes:
 * the pages ask `crm-seed.ts` and `reference()` as before and get the people, groups, customers and opportunities of the company.
 *
 * A company with no such document (SUN, ACE, a test) is left alone. Framework-free.
 */
import { buildWorkbookForecast } from '../mock/workbook-forecast';
import { buildWorkbookCast, buildWorkbookLeadRef, type WorkbookCrmDocument, type WorkbookMaster } from '../mock/workbook-cast';

export const WORKBOOK_MASTER_DOC = 'seed.workbook.master';
export const workbookCrmDoc = (company: string): string => `seed.workbook.crm.${company.toLowerCase()}`;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export interface WorkbookCastApplied {
  company: string;
  prospects: number;
  leads: number;
  skipped: number;
}

/** replaces `seed.org`, `seed.crm` and the lists of `ref.shared` in `all` with those of the company; undefined = nothing to apply */
export function applyWorkbookCast(all: Record<string, unknown>, company: string): WorkbookCastApplied | undefined {
  if (!company) return undefined;
  const crm = all[workbookCrmDoc(company)];
  const master = all[WORKBOOK_MASTER_DOC];
  if (!isRecord(crm) || !isRecord(master)) return undefined;
  const made = buildWorkbookCast(company, crm as unknown as WorkbookCrmDocument, master as unknown as WorkbookMaster);
  if (!made) return undefined;
  all['seed.org'] = made.org;
  all['seed.crm'] = made.cast;
  const shared = isRecord(all['ref.shared']) ? all['ref.shared'] : {};
  const oldSteps = isRecord(shared['groupSteps']) ? shared['groupSteps'] : {};
  // `reference()` keeps a list of the document only when it has every key of the code's own (it may add keys): the steps of the formulas stay, the company's are added
  all['ref.shared'] = { ...shared, saleGroups: made.shared.saleGroups, products: made.shared.products, groupSteps: { ...oldSteps, ...made.shared.groupSteps } };
  // the pages that keep their own lists of products / groups / teams (ids 101… of the formulas) get the company's
  const products = made.shared.products.map((p) => ({ id: p['id'], code: p['code'], name: p['name'], usesWorkflowStep: true, groups: p['groupIds'] }));
  const keyed = (name: string, key: string): Record<string, unknown> => {
    const doc = isRecord(all[name]) ? all[name] : {};
    return isRecord(doc[key]) ? doc[key] : {};
  };
  const patchDoc = (name: string, lists: Record<string, unknown>): void => {
    all[name] = { ...(isRecord(all[name]) ? all[name] : {}), ...lists };
  };
  patchDoc('ref.opportunities', {
    products: products.map(({ id, code, name, groups }) => ({ id, code, name, groups })),
    saleGroups: made.shared.saleGroups,
    groupSteps: { ...keyed('ref.opportunities', 'groupSteps'), ...made.stepsByGroupId },
  });
  patchDoc('ref.prospects', {
    products: products.map((p) => ({ ...p, en: p.name })),
    groupEmployees: { ...keyed('ref.prospects', 'groupEmployees'), ...(made.org.groupMembers ?? {}) },
  });
  patchDoc('ref.opportunityDetail', { teams: made.shared.saleGroups, stepProbability: made.stepProbability });
  // the Lead menu: its leads, its owners and who is above whom (the maps keep the keys of the formulas — see above)
  const lead = buildWorkbookLeadRef(company, crm as unknown as WorkbookCrmDocument, master as unknown as WorkbookMaster, made);
  patchDoc('ref.leads', {
    leads: lead.leads,
    owners: lead.owners,
    sources: lead.sources,
    salesLines: lead.salesLines,
    ownerOfEmployee: { ...keyed('ref.leads', 'ownerOfEmployee'), ...lead.ownerOfEmployee },
    superiors: { ...keyed('ref.leads', 'superiors'), ...lead.superiors },
    salesTeams: { ...keyed('ref.leads', 'salesTeams'), ...lead.salesTeams },
  });
  // the Forecast: the open and closed opportunities of the company as deals, its salespeople as the employees
  const forecast = buildWorkbookForecast(company, made.org, made.cast.prospects, made.cast.leads);
  if (forecast) all['ref.forecast'] = { ...(isRecord(all['ref.forecast']) ? all['ref.forecast'] : {}), ...forecast };
  return { company, prospects: made.cast.prospects.length, leads: made.cast.leads.length, skipped: made.skipped };
}
