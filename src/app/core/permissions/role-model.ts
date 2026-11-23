/**
 * โมเดลของ Role / Permission / ตำแหน่งงาน (ตั้งค่า › องค์กรและคน › "Role สิทธิ์") — ไม่ผูก framework (spec ใช้ใน Node ได้).
 *
 * ที่มา: ต้นแบบหน้าจอ `master-setup_role-permission_v4.html` + `Default_Role_by_Action_v8.xlsx` (ข้อมูลอยู่ที่ `role-catalog.json`):
 *  - Permission เป็นรหัสละ 1 สิทธิ์ แบ่งเป็น 11 กลุ่ม ; บางตัว "ต้องมีอย่างอื่นก่อน" (เช่น Edit ต้องมี View) → ติ๊กแล้วระบบติ๊กตัวที่ต้องมีให้ · เอาออกแล้วเอาตัวที่พึ่งพาออกด้วย
 *  - Role = ชุด Permission ; ตำแหน่งงานมีได้หลาย Role (สิทธิ์รวมกันเสมอ ไม่มีการห้าม) ; พนักงานทุกคนในตำแหน่งได้สิทธิ์ชุดเดียวกัน
 *  - ชุดสิทธิ์ขั้นต่ำของ "ผู้รับ" (BR-LDP-16 / OP-31): ระบบนับว่ารับงานของเอกสารนั้นได้เมื่อมี **View + Edit ของเอกสารนั้น** (Lead / Prospect / Opportunity)
 *    — ตามหมายเหตุข้อ 5 ของ Default_Role_by_Action_v8 และ `ELIG` ของต้นแบบ v4
 */
import catalog from './role-catalog.json';

export type DocKind = 'lead' | 'prospect' | 'opportunity';

export interface PermissionDef {
  code: string;
  group: string;
  description: string;
}

export interface PermissionGroup {
  id: string;
  name: string;
  hint: string;
}

export type RoleStatus = 'release' | 'draft' | 'block';

export interface RoleRecord {
  id: string;
  code: string;
  name: string;
  nameEn: string;
  category: string;
  description: string;
  status: RoleStatus;
  permissions: readonly string[];
}

export interface PositionRecord {
  code: string;
  name: string;
  /** สายงาน (MD / MKT / CS / อื่นๆ) */
  line: string;
  /** ตำแหน่งเบื้องบน (รหัสหรือข้อความจากผัง) */
  parent: string;
  /** id ของ Role ที่ตำแหน่งนี้มี */
  roleIds: readonly string[];
}

export interface RoleCatalog {
  groups: PermissionGroup[];
  permissions: PermissionDef[];
  roles: { code: string; name: string; nameEn: string; description: string; category: string; permissions: string[] }[];
  templates: { key: string; name: string; roles: string[]; optional: string[] }[];
  positions: { code: string; line: string; parent: string; roles: string[] }[];
}

/**
 * The catalog: the permissions in their groups, the standard roles, the example positions, the positions of the chart. Plain lists the screens read —
 * the shared Datasource may replace what is in them (`seed.roles.json` — `setRoleCatalog`, IN PLACE, before the pages load). The file `role-catalog.json`
 * is what the code starts with. What a permission needs first (`dependenciesBy`) is a rule of the code, worked out again for every code of the catalog.
 */
const BUILT_IN = JSON.parse(JSON.stringify(catalog)) as RoleCatalog;
export const ROLE_CATALOG: RoleCatalog = JSON.parse(JSON.stringify(catalog)) as RoleCatalog;
export const PERMISSIONS: PermissionDef[] = ROLE_CATALOG.permissions;
export const PERMISSION_GROUPS: PermissionGroup[] = ROLE_CATALOG.groups;

const BY_CODE = new Map<string, PermissionDef>();
export const isPermission = (code: string): boolean => BY_CODE.has(code);
export const permissionOf = (code: string): PermissionDef | undefined => BY_CODE.get(code);

/** เอกสารที่ "รับงาน" ได้ + สิทธิ์ที่ต้องมีครบ (ชุดขั้นต่ำของผู้รับ) */
export const RECEIVER_DOCS: readonly { kind: DocKind; label: string; required: readonly string[] }[] = [
  { kind: 'lead', label: 'Lead', required: ['Pipeline_Lead_View', 'Pipeline_Lead_Edit'] },
  { kind: 'prospect', label: 'Prospect', required: ['Pipeline_Prospect_View', 'Pipeline_Prospect_Edit'] },
  { kind: 'opportunity', label: 'Opportunity', required: ['Pipeline_Opportunity_View', 'Pipeline_Opportunity_Edit'] },
];

export const docLabel = (kind: DocKind): string => RECEIVER_DOCS.find((d) => d.kind === kind)?.label ?? kind;

const DOC_RE = '(Lead|Prospect|Opportunity)';

/** สิทธิ์ที่ "ต้องมีก่อน" ของสิทธิ์หนึ่ง (กติกาการพึ่งพาของต้นแบบ — ข้อเสนอ ยังไม่ยืนยัน) */
function dependenciesBy(code: string): string[] {
  const dep: string[] = [];
  const add = (c: string): void => void dep.push(c);
  if (code.startsWith('Pipeline_')) add('MODULE_Pipeline');
  if (code.startsWith('Chat_')) add('MODULE_Chat_Box');
  if (new RegExp(`^Pipeline_${DOC_RE}_Assign$`).test(code)) add('Pipeline_Wait_list_Access');
  if (code === 'Pipeline_Lead_Convert_Prospect') add('Pipeline_Prospect_Create');
  const doc = new RegExp(`^Pipeline_${DOC_RE}_(.+)$`).exec(code);
  if (doc) {
    const [, kind, action] = doc;
    if (action !== 'View') add(`Pipeline_${kind}_View`);
    if (/^Attachment_(Download|Upload)$/.test(action)) add(`Pipeline_${kind}_Attachment_View`);
    if (action === 'Contact_Activity_Create') add(`Pipeline_${kind}_Contact_View`);
  }
  const schedule = /^Pipeline_Schedule_(Appointment|Task)_(.+)$/.exec(code);
  if (schedule) {
    const [, what, action] = schedule;
    if (action !== 'View') add(`Pipeline_Schedule_${what}_View`);
    if (action === 'Add_Edit_For_Other') add(`Pipeline_Schedule_${what}_Add_Edit`);
  }
  const sales = /^Pipeline_Document_(.+)_(Create|Edit|Block)$/.exec(code);
  if (sales) add(`Pipeline_Document_${sales[1]}_View`);
  if (code.startsWith('Dashboard_')) dep.push('MODULE_Pipeline', 'Pipeline_Dashboard_Access');
  if (code.startsWith('AI_') && code !== 'AI_ACCESS_USE') add('AI_ACCESS_USE');
  if (code === 'Chat_Reply_Unassigned' || code === 'Chat_New_Assigner') add('Chat_View_Unassigned');
  if (['Chat_Reply_Assigned', 'Chat_Change_Assigned', 'Chat_Revoke_Assigned'].includes(code)) add('Chat_View_Assigned');
  return dep;
}

const DEPENDENCIES = new Map<string, readonly string[]>();

/** the lookups of the catalog, again (after the lists were replaced) */
function indexCatalog(): void {
  BY_CODE.clear();
  for (const p of PERMISSIONS) BY_CODE.set(p.code, p);
  DEPENDENCIES.clear();
  for (const p of PERMISSIONS) DEPENDENCIES.set(p.code, dependenciesBy(p.code).filter((d) => d !== p.code && BY_CODE.has(d)));
}
indexCatalog();

export const dependenciesOf = (code: string): readonly string[] => DEPENDENCIES.get(code) ?? [];

/** ติ๊กสิทธิ์: คืนชุดใหม่ + รายการที่เพิ่ม (ตัวที่ติ๊กอยู่หน้าสุด ตามด้วยตัวที่ต้องมีก่อน) */
export function grant(set: ReadonlySet<string>, code: string): { set: Set<string>; added: string[] } {
  const next = new Set(set);
  const added: string[] = [];
  const visit = (c: string): void => {
    if (next.has(c) || !BY_CODE.has(c)) return;
    next.add(c);
    added.push(c);
    for (const d of dependenciesOf(c)) visit(d);
  };
  visit(code);
  return { set: next, added };
}

/** เอาสิทธิ์ออก: เอาตัวที่ต้องพึ่งมันออกด้วย (ซ้ำถึงที่สุด) */
export function revoke(set: ReadonlySet<string>, code: string): { set: Set<string>; removed: string[] } {
  const next = new Set(set);
  const removed: string[] = [];
  const visit = (c: string): void => {
    if (!next.has(c)) return;
    next.delete(c);
    removed.push(c);
    for (const p of PERMISSIONS) if (next.has(p.code) && dependenciesOf(p.code).includes(c)) visit(p.code);
  };
  visit(code);
  return { set: next, removed };
}

/** ชุดที่ปิดด้วยสิทธิ์ที่ต้องมีก่อนแล้ว (ใช้ตอนนำเข้า Role มาตรฐาน) — ตัดรหัสที่ไม่รู้จักทิ้ง */
export function closed(codes: readonly string[]): string[] {
  let set = new Set<string>();
  for (const c of codes) set = grant(set, c).set;
  return PERMISSIONS.map((p) => p.code).filter((c) => set.has(c));
}

/* ================================================================================================ ผู้รับงาน */

/** สิทธิ์ของชุดที่ยังขาดสำหรับการเป็นผู้รับของเอกสารนั้น (ว่าง = รับงานได้) */
export const missingForReceiver = (permissions: ReadonlySet<string>, kind: DocKind): string[] => (RECEIVER_DOCS.find((d) => d.kind === kind)?.required ?? []).filter((c) => !permissions.has(c));

export const canReceive = (permissions: ReadonlySet<string>, kind: DocKind): boolean => missingForReceiver(permissions, kind).length === 0;

export type ReceiverMissing = Record<DocKind, string[]>;

export const receiverMissing = (permissions: ReadonlySet<string>): ReceiverMissing => ({
  lead: missingForReceiver(permissions, 'lead'),
  prospect: missingForReceiver(permissions, 'prospect'),
  opportunity: missingForReceiver(permissions, 'opportunity'),
});

/* ================================================================================================ สิทธิ์รวมของ Role / ตำแหน่ง */

export const setOfRole = (role: Pick<RoleRecord, 'permissions'> | undefined): Set<string> => new Set(role?.permissions ?? []);

/** สิทธิ์รวมของตำแหน่ง = รวมของทุก Role ที่ release (Role ที่ไม่ใช่ release ยังไม่ให้สิทธิ์ — คืนมาแจ้งเตือน) */
export function positionPermissions(position: Pick<PositionRecord, 'roleIds'>, roles: readonly RoleRecord[]): { set: Set<string>; inactive: RoleRecord[] } {
  const set = new Set<string>();
  const inactive: RoleRecord[] = [];
  for (const id of position.roleIds) {
    const role = roles.find((r) => r.id === id);
    if (!role) continue;
    if (role.status !== 'release') inactive.push(role);
    else for (const c of role.permissions) set.add(c);
  }
  return { set, inactive };
}

export interface LostReceiver {
  position: PositionRecord;
  kinds: DocKind[];
  missing: ReceiverMissing;
}

/**
 * ตำแหน่งที่ "หมดสิทธิ์เป็นผู้รับ" เมื่อเปลี่ยนจาก `before` เป็น `after` (เคยรับงานประเภทนั้นได้ แล้วรับไม่ได้) — ใช้เตือนก่อนบันทึก Role / ตำแหน่ง
 * (พนักงานในตำแหน่งที่ถือใบอยู่ไม่ถูกเอาใบคืน แต่จะรับใบใหม่ไม่ได้)
 */
export function lostReceivers(before: readonly PositionRecord[], beforeRoles: readonly RoleRecord[], after: readonly PositionRecord[], afterRoles: readonly RoleRecord[]): LostReceiver[] {
  const out: LostReceiver[] = [];
  for (const b of before) {
    const a = after.find((p) => p.code === b.code);
    if (!a) continue;
    const was = positionPermissions(b, beforeRoles).set;
    const now = positionPermissions(a, afterRoles).set;
    const kinds = RECEIVER_DOCS.map((d) => d.kind).filter((k) => canReceive(was, k) && !canReceive(now, k));
    if (kinds.length) out.push({ position: a, kinds, missing: receiverMissing(now) });
  }
  return out;
}

/* ================================================================================================ คำเตือนของสิทธิ์รวม (บันทึกได้ แค่บอกว่าจะเกิดอะไรขึ้น) */

export type WarningLevel = 'error' | 'warn' | 'info';

export interface PermissionWarning {
  level: WarningLevel;
  /** สิ่งที่พบ */
  finding: string;
  /** ผลที่จะเกิด */
  effect: string;
}

const ANY_VIEW = ['Pipeline_Lead_View', 'Pipeline_Prospect_View', 'Pipeline_Opportunity_View'] as const;
const OWNER_ACTION = /_(Change_Assign|Change_Sales_Person|Share_Sharing_Employee|WorkflowStep_Rework|WorkflowStep_Close|Close)$|_Revoke_/;

export function warningsOf(set: ReadonlySet<string>): PermissionWarning[] {
  const w: PermissionWarning[] = [];
  const has = (c: string): boolean => set.has(c);
  const anyView = ANY_VIEW.some(has);
  if (has('Pipeline_Wait_list_Access') && !anyView) w.push({ level: 'error', finding: 'มี Wait_list_Access แต่ไม่มี View ของ Lead / Prospect / Opportunity เลย', effect: 'เข้าหน้า Wait List ได้ แต่ไม่เห็นงาน' });
  if (has('Pipeline_Opportunity_Edit') && !has('Pipeline_Opportunity_Company_Financial_Data')) w.push({ level: 'warn', finding: 'มี Opportunity_Edit แต่ไม่มี Opportunity_Company_Financial_Data', effect: 'แก้ดีลได้ ยกเว้นมูลค่าดีล' });
  if (has('Pipeline_Opportunity_Create') && !has('Pipeline_Prospect_View')) w.push({ level: 'warn', finding: 'มี Opportunity_Create แต่ไม่มี Prospect_View', effect: 'สร้างดีลจากหน้า Prospect ไม่ได้' });
  if (has('Chat_New_Assigner') && !has('Pipeline_Lead_Create') && !has('Pipeline_Prospect_Create')) w.push({ level: 'warn', finding: 'มี Chat_New_Assigner แต่ไม่มี Lead_Create และ Prospect_Create', effect: 'ผูกแชทกับเอกสารเดิมได้ แต่สร้างเอกสารใหม่จากแชทไม่ได้' });
  if (has('Chat_View_Assigned') && !anyView) w.push({ level: 'warn', finding: 'มี Chat_View_Assigned แต่ไม่มี View ของ Lead / Prospect / Opportunity', effect: 'เห็นแชท แต่เปิดเอกสารที่แชทผูกอยู่ไม่ได้' });
  if (anyView && !has('Chat_View_Assigned')) w.push({ level: 'warn', finding: 'มี View ของเอกสาร แต่ไม่มี Chat_View_Assigned', effect: 'เปิดเอกสารได้ แต่ไม่เห็นแท็บแชทของลูกค้า' });
  if (has('Pipeline_Customer_Support_Opportunity_All_View_Only') && [...set].some((c) => OWNER_ACTION.test(c) && c.startsWith('Pipeline_Opportunity_'))) {
    w.push({ level: 'info', finding: 'มี Customer Support คู่กับ action ระดับเจ้าของ', effect: 'action เหล่านั้นใช้ได้เฉพาะดีลที่ตัวเองเป็นเจ้าของหรือหัวหน้า ไม่ใช่ทั้งบริษัท' });
  }
  return w;
}

/* ================================================================================================ ข้อมูลตั้งต้น */

export const roleIdOf = (code: string): string => `role-${code}`;

/** Role มาตรฐานทั้งหมดของแคตตาล็อก (ปิดด้วยสิทธิ์ที่ต้องมีก่อนแล้ว) */
export const standardRoles = (): RoleRecord[] =>
  ROLE_CATALOG.roles.map((r) => ({ id: roleIdOf(r.code), code: r.code, name: r.name, nameEn: r.nameEn, category: r.category, description: r.description, status: 'release', permissions: closed(r.permissions) }));

/** ตำแหน่งงานตั้งต้น: 25 ตำแหน่งของผัง (ชื่อ = รหัส) พร้อม Role ตาม Default_Role_by_Action_v8 */
export const standardPositions = (): PositionRecord[] =>
  ROLE_CATALOG.positions.map((p) => ({ code: p.code, name: p.code, line: p.line, parent: p.parent, roleIds: p.roles.map(roleIdOf) }));

/* ================================================================================================ the catalog from the Datasource */

const text = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const rec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texts = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const unique = (list: readonly string[]): boolean => new Set(list).size === list.length;

function catalogProblem(doc: Record<string, unknown>): string | undefined {
  const { groups, permissions, roles, templates, positions } = doc as Partial<Record<keyof RoleCatalog, unknown>>;
  if (![groups, permissions, roles, templates, positions].every(Array.isArray)) return 'seed.roles: "groups", "permissions", "roles", "templates" and "positions" must be lists';
  const g = groups as unknown[];
  const p = permissions as unknown[];
  const r = roles as unknown[];
  if (!g.length || !p.length) return 'seed.roles: needs at least one group and one permission';
  if (!g.every((x) => rec(x) && text(x['id']) && text(x['name']) && typeof x['hint'] === 'string') || !unique(g.map((x) => (x as PermissionGroup).id))) return 'seed.roles: every group needs an id (once), a name and a hint';
  const groupIds = new Set(g.map((x) => (x as PermissionGroup).id));
  if (!p.every((x) => rec(x) && text(x['code']) && typeof x['description'] === 'string' && typeof x['group'] === 'string' && groupIds.has(x['group'])) || !unique(p.map((x) => (x as PermissionDef).code))) {
    return 'seed.roles: every permission needs a code (once), a description (it may be empty) and one of the groups';
  }
  const codes = new Set(p.map((x) => (x as PermissionDef).code));
  if (!r.every((x) => rec(x) && [x['code'], x['name']].every(text) && [x['nameEn'], x['description'], x['category']].every((t) => typeof t === 'string') && texts(x['permissions']) && x['permissions'].every((c) => codes.has(c))) || !unique(r.map((x) => (x as RoleCatalog['roles'][number]).code))) {
    return 'seed.roles: every role needs a code (once), a name and permissions that are in the catalog';
  }
  const roleCodes = new Set(r.map((x) => (x as RoleCatalog['roles'][number]).code));
  const inRoles = (x: unknown): boolean => texts(x) && x.every((c) => roleCodes.has(c));
  if (!(templates as unknown[]).every((x) => rec(x) && text(x['key']) && text(x['name']) && inRoles(x['roles']) && inRoles(x['optional']))) return 'seed.roles: every example position needs a key, a name and roles that are in the catalog';
  if (!(positions as unknown[]).every((x) => rec(x) && text(x['code']) && typeof x['line'] === 'string' && typeof x['parent'] === 'string' && inRoles(x['roles'])) || !unique((positions as unknown[]).map((x) => (x as RoleCatalog['positions'][number]).code))) {
    return 'seed.roles: every position needs a code (once), a line, a parent and roles that are in the catalog';
  }
  return undefined;
}

/**
 * Takes the catalog from a document of the Datasource (`undefined` = the one of the code). The lists are replaced in place and the lookups made again.
 * A document that does not fit is refused as a whole (the reason is returned) and the catalog of the code stays.
 */
export function setRoleCatalog(doc: unknown): string | undefined {
  const problem = doc === undefined || doc === null ? undefined : catalogProblem(rec(doc) ? doc : {});
  const use: RoleCatalog = doc === undefined || doc === null || problem ? BUILT_IN : (doc as RoleCatalog);
  const copy = JSON.parse(JSON.stringify(use)) as RoleCatalog;
  ROLE_CATALOG.groups.splice(0, ROLE_CATALOG.groups.length, ...copy.groups);
  ROLE_CATALOG.permissions.splice(0, ROLE_CATALOG.permissions.length, ...copy.permissions);
  ROLE_CATALOG.roles.splice(0, ROLE_CATALOG.roles.length, ...copy.roles);
  ROLE_CATALOG.templates.splice(0, ROLE_CATALOG.templates.length, ...copy.templates);
  ROLE_CATALOG.positions.splice(0, ROLE_CATALOG.positions.length, ...copy.positions);
  indexCatalog();
  return problem;
}
