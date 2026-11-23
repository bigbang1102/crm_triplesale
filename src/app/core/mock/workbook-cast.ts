/**
 * The cast of a company of the Seed Workbook (A1 · B1 · B2), made from the documents the importer put on the file server
 * (`seed.workbook.crm.<company>` and `seed.workbook.master`, see tools/lib/workbook-crm.mjs) in the shape the mock pages already read:
 *
 *   org     → the `seed.org` document   (employees · activity groups · who is in each group · positions · the name pools)
 *   cast    → the `seed.crm` document   (the customers and the opportunities — what the pages call "leads" of the cast)
 *   shared  → what `ref.shared` holds   (sale groups · products = the pipelines · the steps of each group)
 *
 * A company that has no such document keeps the cast of the formulas. Framework-free and deterministic.
 */
import type { CastDocument, CastLeadRow, CastProspectRow, SeedEmployee, SeedGroup } from './crm-seed';
import type { OrgDocument } from './org-seed';

/** a row of the workbook: any column by name, and the ones the code reads as properties */
interface Row {
  [column: string]: unknown;
  code?: unknown;
  name?: unknown;
  lastname?: unknown;
  customertel?: unknown;
  prospect_email?: unknown;
  prospect_phone1?: unknown;
  current_city?: unknown;
  marketingchanel?: unknown;
  contact_date?: unknown;
  txNo?: unknown;
  employee?: unknown;
  prospect?: unknown;
  amount?: unknown;
  opp_status?: unknown;
  createtime?: unknown;
  orderno?: unknown;
  waitlist_status?: unknown;
  res_employee?: unknown;
}

export interface WorkbookCrmDocument {
  company: string;
  prospects: Row[];
  leads: Row[];
  opportunities: Row[];
}

export type WorkbookMaster = Record<string, Row[]>;

export interface WorkbookCast {
  org: OrgDocument;
  cast: CastDocument;
  shared: { saleGroups: Row[]; products: Row[]; groupSteps: Record<string, string[]> };
  /** the steps of each group by the ID of the group (the pages of the opportunities keep them that way) */
  stepsByGroupId: Record<string, string[]>;
  /** the probability (0..100) of each step by its name, from the pipelines of the company: a step of 100 / 0 closes the opportunity that enters it */
  stepProbability: Record<string, number>;
  /** the opportunities left out (no customer / no step) — told about by the loader */
  skipped: number;
}

/** the ids of the groups and sale groups of a company: ranges that do not meet the ids of the formulas (101…) or of another company */
const ID_BASE: Readonly<Record<string, number>> = { A1: 2100, B1: 2200, B2: 2300 };
const FALLBACK_ID_BASE = 2400;
const SALE_GROUP_ID_BASE = 1_004_500_000;
const PRODUCT_ID_BASE = 1_004_600_000;
const MANAGER_LEVELS: readonly string[] = ['ผู้บริหาร', 'ผู้จัดการ', 'หัวหน้างาน'];
const DEFAULT_TEAM = 'ทั่วไป';
const DEFAULT_PROVINCE = 'กรุงเทพมหานคร';
const DEFAULT_DATE = '2026-01-01';
const INTERESTS: readonly string[] = ['HOT', 'WARM', 'COLD', 'INACTIVE', 'NEW'];

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const rows = (master: WorkbookMaster, sheet: string, company: string): Row[] => (master[sheet] ?? []).filter((r) => text(r['businessentity (code)']) === company);
const byCode = (list: Row[], key = 'code'): Map<string, Row> => new Map(list.map((r) => [text(r[key]), r]));
const unique = (list: string[]): string[] => [...new Set(list.filter((s) => s !== ''))];
const dayOf = (v: unknown, fallback = DEFAULT_DATE): string => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(text(v));
  return m ? m[1] : fallback;
};

/** the first value of a list or a fallback when it is empty */
const orElse = <T>(list: T[], fallback: T): T[] => (list.length ? list : [fallback]);

function employeesOf(master: WorkbookMaster, company: string): SeedEmployee[] {
  const positions = byCode(rows(master, '08_position', company));
  const departments = byCode(rows(master, '05_positionorganize', company));
  const groups = byCode(rows(master, '16_salegroup', company));
  const salegroupOf = new Map(rows(master, '17_saleperson', company).map((s) => [text(s['employee (code)']), text(s['salegroup (code)'])]));
  const positionOf = new Map(rows(master, '12_employee_position', company).map((p) => [text(p['employee (code)']), text(p['position (code)'])]));
  return rows(master, '11_employee', company).map((e) => {
    const position = positions.get(positionOf.get(text(e.code)) ?? '');
    const team = text(groups.get(salegroupOf.get(text(e.code)) ?? '')?.['name']) || text(departments.get(text(position?.['positionorganize (code)']))?.['name']) || DEFAULT_TEAM;
    return { code: text(e.code), name: text(e.name), team, role: MANAGER_LEVELS.includes(text(position?.['employee_level'])) ? 'Sup' : 'Staff' };
  });
}

/** the activity groups of the company in the order of its pipelines, then the rest */
function groupsOf(master: WorkbookMaster, company: string): { groups: SeedGroup[]; idOf: Map<string, number>; steps: Record<string, string[]> } {
  const base = ID_BASE[company] ?? FALLBACK_ID_BASE;
  const raw = rows(master, '20_activitygroup', company);
  const groups: SeedGroup[] = raw.map((g, i) => ({ id: base + i + 1, code: text(g.code).split('-').pop() ?? text(g.code), name: text(g.name) }));
  const idOf = new Map(raw.map((g, i) => [text(g.code), base + i + 1]));
  const steps: Record<string, string[]> = {};
  const activities = rows(master, '22_activity', company);
  raw.forEach((g, i) => {
    const key = groups[i].code;
    steps[key] = activities.filter((a) => text(a['activitygroup (code)']) === text(g.code)).map((a) => text(a.name));
  });
  return { groups, idOf, steps };
}

function membersOf(master: WorkbookMaster, company: string, idOf: Map<string, number>): Record<string, string[]> {
  const positionOfEmployee = new Map(rows(master, '12_employee_position', company).map((p) => [text(p['employee (code)']), text(p['position (code)'])]));
  const result: Record<string, string[]> = {};
  for (const [groupCode, id] of idOf) {
    const positions = new Set(rows(master, '21_activitygroup_position', company).filter((p) => text(p['activitygroup (code)']) === groupCode).map((p) => text(p['position (code)'])));
    result[String(id)] = [...positionOfEmployee].filter(([, position]) => positions.has(position)).map(([employee]) => employee);
  }
  return result;
}

function positionsOf(master: WorkbookMaster, company: string): Record<string, string[]> {
  const names = byCode(rows(master, '08_position', company));
  const result: Record<string, string[]> = {};
  for (const p of rows(master, '12_employee_position', company)) {
    const name = text(names.get(text(p['position (code)']))?.['name']);
    if (name) result[text(p['employee (code)'])] = [...(result[text(p['employee (code)'])] ?? []), name];
  }
  return result;
}

function statusOf(oppStatus: string): CastLeadRow['status'] {
  if (oppStatus === 'sold') return 'SUCCESS';
  return oppStatus === 'lost' ? 'LOST' : 'ACTIVE';
}

function interestOf(oppStatus: string, status: CastLeadRow['status']): string {
  if (status !== 'ACTIVE') return status;
  const upper = oppStatus.toUpperCase();
  return INTERESTS.includes(upper) ? upper : 'NEW';
}

/** the cast, the people and the groups of `company`; undefined when the company has no customers in the workbook */
export function buildWorkbookCast(company: string, crm: WorkbookCrmDocument | undefined, master: WorkbookMaster | undefined): WorkbookCast | undefined {
  if (!crm || !master || crm.prospects.length === 0) return undefined;
  const employees = employeesOf(master, company);
  if (employees.length === 0) return undefined;
  const { groups, idOf, steps } = groupsOf(master, company);
  if (groups.length === 0) return undefined;
  const channelName = new Map(rows(master, '37_marketingchanel', company).map((c) => [text(c.code), text(c.name)]));
  const known = new Set(employees.map((e) => e.code));

  const prospects: CastProspectRow[] = crm.prospects.map((p, i) => {
    const firstName = text(p.name);
    const lastName = text(p.lastname);
    return {
      id: i + 1,
      code: text(p.code),
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim(),
      phone: text(p.customertel) || text(p.prospect_phone1),
      email: text(p.prospect_email),
      province: text(p.current_city) || DEFAULT_PROVINCE,
      source: channelName.get(text(p.marketingchanel)) ?? text(p.marketingchanel),
      createdDate: dayOf(p.contact_date),
    };
  });
  const prospectId = new Map(prospects.map((p) => [p.code, p.id]));

  const groupIndex = new Map([...idOf.keys()].map((code, i) => [code, i]));
  let skipped = 0;
  const leads: CastLeadRow[] = [];
  for (const o of crm.opportunities) {
    const customer = prospectId.get(text(o.prospect));
    const step = o['currentStep'] as Row | null | undefined;
    if (customer === undefined) {
      skipped += 1;
      continue;
    }
    const owner = [...((o['responsible'] as unknown[] | undefined) ?? []).map(text), text(o.employee)].find((c) => known.has(c)) ?? employees[0].code;
    const status = statusOf(text(o.opp_status));
    const history = (o['activityStatus'] as Row[] | undefined) ?? [];
    const created = dayOf(o.createtime);
    leads.push({
      id: leads.length + 1,
      code: text(o.txNo),
      prospectId: customer,
      ownerCode: owner,
      groupIdx: groupIndex.get(text(step?.['activitygroup'])) ?? 0,
      interest: interestOf(text(o.opp_status), status),
      status,
      createdDate: created,
      lastContactDate: dayOf(history[history.length - 1]?.['changedate'], created),
      amount: Number(o.amount) || 0,
    });
  }

  const pipelines = rows(master, '23_opportunityconfig', company);
  const pipelineGroups = rows(master, '24_oc_grouppipeline', company);
  const products = pipelines.map((c, i) => ({
    id: PRODUCT_ID_BASE + (ID_BASE[company] ?? FALLBACK_ID_BASE) * 10 + i,
    code: text(c.code),
    name: text(c.name),
    usesWorkflowStep: true,
    groupIds: pipelineGroups
      .filter((g) => text(g['opportunityconfig (code)']) === text(c.code))
      .sort((a, b) => Number(a.orderno) - Number(b.orderno))
      .flatMap((g) => idOf.get(text(g['activitygroup (code)'])) ?? []),
  }));
  // the pages find the sale group of an employee by the NAME of the team and expect to find it: every team an employee has is a sale group (the real
  // ones first, then the departments of the people who are in no sale group)
  const realGroups = rows(master, '16_salegroup', company).map((g) => ({ code: text(g.code), name: text(g.name) }));
  const teamNames = unique(employees.map((e) => e.team)).filter((t) => !realGroups.some((g) => g.name === t));
  const saleGroups = [...realGroups, ...teamNames.map((name, i) => ({ code: `${company}-TEAM-${i + 1}`, name }))].map((g, i) => ({
    id: SALE_GROUP_ID_BASE + (ID_BASE[company] ?? FALLBACK_ID_BASE) * 10 + i,
    ...g,
  }));

  const org: OrgDocument = {
    employees,
    groups,
    groupMembers: membersOf(master, company, idOf),
    employeePositions: positionsOf(master, company),
    names: {
      firstNames: orElse(unique(prospects.map((p) => p.firstName)), 'ลูกค้า'),
      lastNames: orElse(unique(prospects.map((p) => p.lastName)), 'ทดสอบ'),
      provinces: orElse(unique(prospects.map((p) => p.province)), DEFAULT_PROVINCE),
      sources: orElse(unique(prospects.map((p) => p.source)), 'อื่น ๆ'),
    },
  };
  const stepsByGroupId = Object.fromEntries(groups.map((g) => [String(g.id), steps[g.code] ?? []]));
  const activityName = new Map(rows(master, '22_activity', company).map((a) => [text(a.code), text(a.name)]));
  const stepProbability: Record<string, number> = {};
  for (const step of rows(master, '25_oc_steppipeline', company)) {
    const name = activityName.get(text(step['activity (code)']));
    const probability = Number(step['probability']);
    if (name && Number.isFinite(probability)) stepProbability[name] = probability;
  }
  return { org, cast: { prospects, leads }, shared: { saleGroups, products, groupSteps: steps }, stepsByGroupId, stepProbability, skipped };
}

/* ---------------------------------------------------------------------------------------------------------------- the Lead menu */

export interface WorkbookLeadRef {
  leads: Row[];
  owners: { code: string; name: string }[];
  ownerOfEmployee: Record<string, string>;
  superiors: Record<string, string[]>;
  sources: string[];
  salesLines: string[];
  salesTeams: Record<string, string[]>;
}

/** the status of the Lead menu of a status of the workbook (a duplicate is one that was not taken) */
const LEAD_STATUS: Readonly<Record<string, string>> = { new: 'new', contacting: 'contacting', inactive: 'inactive', disqualified: 'disqualified', duplicate: 'disqualified', converted: 'converted' };
const LEAD_ID_BASE = 100;
const DEFAULT_PHONE_CODE = '+66';

/** who is above whom: an employee's superiors are the people who hold the commander positions of their position */
function superiorsOf(master: WorkbookMaster, company: string): Record<string, string[]> {
  const commanders = new Map(rows(master, '08_position', company).map((p) => [text(p.code), [text(p['commander_position1 (code)']), text(p['commander_position2 (code)'])].filter((c) => c !== '')]));
  const positionOf = new Map(rows(master, '12_employee_position', company).map((p) => [text(p['employee (code)']), text(p['position (code)'])]));
  const holders = new Map<string, string[]>();
  for (const [employee, position] of positionOf) holders.set(position, [...(holders.get(position) ?? []), employee]);
  const result: Record<string, string[]> = {};
  for (const [employee, position] of positionOf) {
    const above = unique((commanders.get(position) ?? []).flatMap((c) => holders.get(c) ?? []));
    if (above.length) result[employee] = above;
  }
  return result;
}

/** the lists the Lead menu reads (`ref.leads`) for a company: its leads, the people who can own them and who is above whom */
export function buildWorkbookLeadRef(company: string, crm: WorkbookCrmDocument, master: WorkbookMaster, made: WorkbookCast): WorkbookLeadRef {
  const known = new Set(made.org.employees.map((e) => e.code));
  const leads: Row[] = crm.leads.map((l, i) => {
    const owner = text(l['res_employee']);
    const queued = text(l['waitlist_status']) === 'wait' || owner === '' || !known.has(owner);
    const contactDate = dayOf(l['contact_date']);
    return {
      id: LEAD_ID_BASE + i,
      code: text(l.code),
      createdDate: contactDate,
      status: LEAD_STATUS[text(l['lead_status'])] ?? 'new',
      name: text(l.name) || `${text(l['firstname'])} ${text(l['lastname'])}`.trim(),
      phoneCode: DEFAULT_PHONE_CODE,
      phone: text(l['mobilephone']) || text(l['phone']),
      email: text(l['email']),
      source: text(l['leadsource']),
      ownerCode: queued ? '' : owner,
      address: text(l['address']),
      country: text(l['country']),
      province: text(l['city']),
      district: text(l['district']),
      subdistrict: text(l['subdistrict']),
      postcode: text(l['postid']),
      taxId: text(l['taxid']),
      firstContactDate: contactDate,
      contacts: [],
      items: [],
    };
  });
  const teams = unique(made.shared.saleGroups.map((g) => text(g.name)));
  const line = text(master['04_branch']?.find((b) => text(b['businessentity (code)']) === company)?.['name']) || company;
  return {
    leads,
    owners: made.org.employees.map((e) => ({ code: e.code, name: e.name })),
    ownerOfEmployee: Object.fromEntries(made.org.employees.map((e) => [e.code, e.code])),
    superiors: superiorsOf(master, company),
    sources: orElse(unique(leads.map((l) => text(l['source']))), 'อื่น ๆ'),
    salesLines: [`สายงานขาย ${company}`],
    salesTeams: { [`สายงานขาย ${company}`]: teams },
  };
}
