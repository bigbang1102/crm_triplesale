/**
 * Lead_Prospect_OPP_GenFormat.xlsx + the master sheets of Seed_Workbook_TripleSales.xlsx → documents of the shared file server, one per company:
 *
 *   seed.workbook.crm.<company>      { company, prospects: [...], leads: [...], opportunities: [...] }  (the children of each row embedded)
 *   seed.workbook.master             { <sheet>: [row, ...] }  the master data the rows point at (employees · positions · sale groups · pipeline · waitlists …)
 *
 * Pure functions over the sheets ({ "<sheet>": [[...], ...] }, see tools/lib/xlsx-to-json.py). The fields keep the names of the Gen format (a
 * column that appears twice — a text and a reference — gets `_ref` on the second one) and an empty cell is left out. Dates stay the ISO text the
 * workbook has; amounts stay numbers.
 *
 * STATUS: the documents are staged on the server; the pages of the mockup still draw the cast of core/mock/crm-seed.ts (180 customers · 240 leads,
 * employees E101…, groups of seed.org) — reading these documents needs that cast to become a per-company list (see MOCKUP.md).
 */

/** the rows above the data of a sheet of the Gen format: header · label · type (main sheets) / header · type (the item sheets) */
const MAIN_SKIP = 3;
const ITEM_SKIP = 2;
const PARENT_COLUMN = /^\[parent\] /;

/** the header with a repeated name made unique (`country`, `country_ref`) */
function uniqueHeader(header) {
  const seen = new Map();
  return header.map((h) => {
    const name = String(h ?? '');
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    return n === 0 ? name : `${name}_ref`;
  });
}

/** a sheet as objects without the empty cells; `skip` = the rows before the data */
export function records(sheets, name, skip) {
  const [header, ...rest] = sheets[name] ?? [];
  if (!header) throw new Error(`the workbook has no sheet "${name}"`);
  const keys = uniqueHeader(header);
  return rest
    .slice(skip - 1)
    .filter((r) => r.some((c) => c !== null && c !== undefined && c !== ''))
    .map((r) => Object.fromEntries(keys.flatMap((k, i) => (r[i] === null || r[i] === undefined || r[i] === '' ? [] : [[k, r[i]]]))));
}

/** the rows of an item sheet grouped by the key of the parent, the parent column dropped from each */
function childrenOf(sheets, name) {
  const grouped = new Map();
  for (const row of records(sheets, name, ITEM_SKIP)) {
    const parentKey = Object.keys(row).find((k) => PARENT_COLUMN.test(k));
    if (!parentKey) continue;
    const { [parentKey]: parent, ...rest } = row;
    grouped.set(String(parent), [...(grouped.get(String(parent)) ?? []), rest]);
  }
  return grouped;
}

const attach = (items) => (parent) => items.get(String(parent)) ?? [];

/** the CRM documents: { <company>: { company, prospects, leads, opportunities } } */
export function buildCrm(sheets) {
  const leadSocial = attach(childrenOf(sheets, 'Lead.SocialItem'));
  const prospectSocial = attach(childrenOf(sheets, 'Prospect.SocialItem'));
  const latest = attach(childrenOf(sheets, 'Prospect.LatestOpportunity'));
  const activity = attach(childrenOf(sheets, 'Opp.Activitystatusitem'));
  const responsible = attach(childrenOf(sheets, 'Opp.Responsibleitem'));
  const step = attach(childrenOf(sheets, 'Opp.CurrentStepItem'));
  const sharing = attach(childrenOf(sheets, 'Opp.SharingGroupItem'));
  const peers = attach(childrenOf(sheets, 'Opp.PeerSharingItem'));
  const companies = {};
  const bucket = (company) => (companies[company] ??= { company, prospects: [], leads: [], opportunities: [] });
  for (const lead of records(sheets, 'Lead', MAIN_SKIP)) bucket(lead.businessentity).leads.push({ ...lead, social: leadSocial(lead.code) });
  for (const p of records(sheets, 'Prospect', MAIN_SKIP)) bucket(p.businessentity).prospects.push({ ...p, social: prospectSocial(p.code), latestOpportunities: latest(p.code) });
  for (const o of records(sheets, 'Opportunity', MAIN_SKIP)) {
    bucket(o.businessentity).opportunities.push({
      ...o,
      activityStatus: activity(o.txNo),
      responsible: responsible(o.txNo).map((r) => r.res_employee),
      currentStep: step(o.txNo)[0] ?? null,
      sharingGroups: sharing(o.txNo),
      peerSharing: peers(o.txNo),
    });
  }
  return companies;
}

/** the master sheets the CRM rows point at (Seed Workbook), as { <sheet>: [row, ...] } */
const MASTER_SHEETS = [
  '04_branch', '05_positionorganize', '08_position', '11_employee', '12_employee_position', '16_salegroup', '17_saleperson',
  '18_materialgroup', '19_material', '20_activitygroup', '21_activitygroup_position', '22_activity', '23_opportunityconfig', '24_oc_grouppipeline', '25_oc_steppipeline',
  '29_oppsharinggroup', '31_waitlisttype', '34_waitlist', '36_marketinggroup', '37_marketingchanel', '38_customertype',
];

export function buildMaster(seedSheets) {
  return Object.fromEntries(
    MASTER_SHEETS.filter((n) => seedSheets[n]).map((n) => {
      const [header, ...body] = seedSheets[n];
      const keys = uniqueHeader(header);
      return [n, body.filter((r) => r.some((c) => c !== null && c !== '')).map((r) => Object.fromEntries(keys.flatMap((k, i) => (r[i] === null || r[i] === undefined || r[i] === '' ? [] : [[k, r[i]]]))))];
    }),
  );
}

/** the documents to put on the server: { <document name>: document } */
export function buildCrmDocuments(lpoSheets, seedSheets) {
  const docs = { 'seed.workbook.master': buildMaster(seedSheets) };
  for (const [company, doc] of Object.entries(buildCrm(lpoSheets))) docs[`seed.workbook.crm.${company.toLowerCase()}`] = doc;
  return docs;
}
