/**
 * Seed Workbook (Seed_Workbook_TripleSales.xlsx) → the identity documents of the mockup: groups · branches (the companies) · roles · users.
 * Pure functions over the sheets ({ "<sheet>": [[header...], [row...]] }, see tools/lib/xlsx-to-json.py) — no file or network access, so they are tested.
 *
 *   entity group (01)        → a group of groups.json: the code the user types at the first sign-in
 *   business entity (02)     → a company of branches.json
 *   role (06) + role-permission (07)                 → a role group of roles.json, `<company>:<role code>` = the permission codes of the role
 *   employee (11) + position (08) + position-role (10) → the role groups of the employee in the company
 *   user (15)                → an account of users.json (one membership per company the user has an employee in)
 */

export const TEST_PASSWORD = 'Test@1234';
/** ids of the companies / employees of the workbook: far from the ids of the hand-made accounts (1…1012) */
const BRANCH_ID_BASE = 1004400700;
const EMPLOYEE_ID_BASE = 2000;
const GROUP_INTERNAL_BASE = 2000;

/** the rows of a sheet as objects keyed by the header; empty rows are dropped */
export function rows(sheets, name) {
  const [header, ...body] = sheets[name] ?? [];
  if (!header) throw new Error(`the workbook has no sheet "${name}"`);
  return body.filter((r) => r.some((c) => c !== null && c !== undefined && c !== '')).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? null])));
}

const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
const entityOf = (r) => text(r['businessentity (code)']);

export function buildGroups(sheets) {
  return rows(sheets, '01_entitygroup').map((g, i) => ({
    code: text(g.code),
    internalCode: `g${GROUP_INTERNAL_BASE + i + 1}`,
    name: `กลุ่ม ${text(g.name)} (ชุดข้อมูล Seed Workbook)`,
  }));
}

export function buildBranches(sheets) {
  return rows(sheets, '02_businessentity').map((b, i) => ({
    id: BRANCH_ID_BASE + i + 1,
    code: text(b.code),
    name: text(b.name_eng) || text(b.name),
    nameTh: text(b.name),
  }));
}

/** the role groups: one per (company, role) with the permission codes the workbook gives it */
export function buildRoles(sheets) {
  const permissions = new Map();
  for (const rp of rows(sheets, '07_rolepermission')) {
    const key = `${entityOf(rp)}:${text(rp['role (code)'])}`;
    permissions.set(key, [...(permissions.get(key) ?? []), text(rp['permission (code)'])]);
  }
  return rows(sheets, '06_role').flatMap((r) => {
    const company = entityOf(r);
    if (!company) return [];
    const code = `${company}:${text(r.code)}`;
    return [{ code, name: text(r.name), description: `${text(r.name_en)} — ${text(r.description)}`.slice(0, 400), grant: [...new Set(permissions.get(code) ?? [])] }];
  });
}

/** the role group codes each employee has in their company: the roles of the positions of the employee */
export function roleGroupsOfEmployees(sheets) {
  const rolesOfPosition = new Map();
  for (const pr of rows(sheets, '10_position_role')) {
    const key = text(pr['position (code)']);
    rolesOfPosition.set(key, [...(rolesOfPosition.get(key) ?? []), `${entityOf(pr)}:${text(pr['role (code)'])}`]);
  }
  const result = new Map();
  for (const ep of rows(sheets, '12_employee_position')) {
    const key = text(ep['employee (code)']);
    result.set(key, [...new Set([...(result.get(key) ?? []), ...(rolesOfPosition.get(text(ep['position (code)'])) ?? [])])]);
  }
  return result;
}

/**
 * Mockup-only grant (21/11/2026, the owner asked for it): the sales-side accounts of A1 (those that hold an OPP_* role) also get `OPP_CREATOR`, the role
 * the workbook defines for `Pipeline_Opportunity_Create` but gives to no position, so that "สร้าง Opportunity" can be tried with a real account.
 */
const EXTRA_ROLE_GROUPS = [{ company: 'A1', role: 'A1:OPP_CREATOR', whenHolding: /^A1:OPP_/ }];
export const withExtraRoles = (company, roleGroups) =>
  EXTRA_ROLE_GROUPS.reduce((list, x) => (x.company === company && list.some((r) => x.whenHolding.test(r)) && !list.includes(x.role) ? [...list, x.role] : list), roleGroups);

/** the accounts: the user sheet joined with the employees (one membership per company) and the group of the company */
export function buildUsers(sheets, password = TEST_PASSWORD) {
  const groupOfEntity = new Map(rows(sheets, '02_businessentity').map((b) => [text(b.code), text(b['entitygroup (code)'])]));
  const positionName = new Map(rows(sheets, '08_position').map((p) => [text(p.code), text(p.name)]));
  const positionOfEmployee = new Map(rows(sheets, '12_employee_position').map((p) => [text(p['employee (code)']), text(p['position (code)'])]));
  const roleGroups = roleGroupsOfEmployees(sheets);
  const employees = rows(sheets, '11_employee');
  const idOf = new Map(employees.map((e, i) => [text(e.code), EMPLOYEE_ID_BASE + i + 1]));
  return rows(sheets, '15_user').map((u) => {
    const mine = employees.filter((e) => text(e.username) === text(u.username) || text(e['username (user)']) === text(u.username));
    const memberships = mine.map((e) => ({
      company: entityOf(e),
      employeeId: idOf.get(text(e.code)),
      employeeCode: text(e.code),
      roleGroups: withExtraRoles(entityOf(e), roleGroups.get(text(e.code)) ?? []),
      status: text(e.usagestatus) === 'release' || !text(e.usagestatus) ? 'release' : 'block',
    }));
    const home = memberships[0];
    return {
      username: text(u.username),
      password,
      profileName: text(u['display name']),
      employeeId: home?.employeeId ?? 0,
      employeeCode: home?.employeeCode ?? '',
      roleGroups: home?.roleGroups ?? [],
      branches: memberships.map((m) => m.company),
      group: groupOfEntity.get(home?.company ?? '') ?? '',
      memberships,
      note: mine.map((e) => `${entityOf(e)} · ${positionName.get(positionOfEmployee.get(text(e.code)) ?? '') ?? ''} (${text(e.code)})`).join(' / '),
    };
  });
}

/** everything the identity import adds */
export function buildIdentity(sheets) {
  return { groups: buildGroups(sheets), branches: buildBranches(sheets), roles: buildRoles(sheets), users: buildUsers(sheets) };
}

/** appends the entries of `incoming` whose `key` the list does not have; what is there is never touched. Returns { list, added } */
export function mergeByKey(existing, incoming, key) {
  const have = new Set((existing ?? []).map((e) => String(e[key]).toLowerCase()));
  const fresh = incoming.filter((e) => !have.has(String(e[key]).toLowerCase()));
  return { list: [...(existing ?? []), ...fresh], added: fresh.length };
}
