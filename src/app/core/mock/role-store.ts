/**
 * Role / ตำแหน่งงาน ของ mockup (ตั้งค่า › องค์กรและคน › "Role สิทธิ์") และ "ผู้รับงานได้ไหม" ของพนักงาน — ไม่ผูก framework.
 *
 * ข้อมูลอยู่ในฐานร่วม `shared-db.roleModel` (บันทึกลง Datasource/shared-db.json) ; ยังไม่เคยแก้ = ใช้ข้อมูลตั้งต้น (Role มาตรฐาน 69 + ตำแหน่งงาน 25 ตามผัง).
 * พนักงานตั้งต้น E101–E108 ถูกจับคู่กับตำแหน่ง (`SEED_EMPLOYEE_POSITIONS`) → สิทธิ์ของเขา = สิทธิ์รวมของ Role ในตำแหน่ง (ไม่มีการห้าม).
 * ผู้รับงาน (BR-LDP-16 / OP-31): รับงานเอกสารประเภทใดได้ เมื่อสิทธิ์รวมมี View + Edit ของเอกสารประเภทนั้น (`canReceive` ใน role-model).
 * FAST-DEBT(API): ยังไม่มี backend — เขียนลงฐานร่วมโดยตรง ; สิทธิ์เข้าสู่ระบบของบัญชีทดลอง (Datasource/roles.json) แยกจากชุดนี้ · somyot · 2026-11-20
 */
import {
  PERMISSIONS,
  canReceive,
  grant,
  lostReceivers,
  positionPermissions,
  revoke,
  roleIdOf,
  setOfRole,
  standardPositions,
  standardRoles,
  type DocKind,
  type LostReceiver,
  type PositionRecord,
  type RoleRecord,
  type RoleStatus,
} from '../permissions/role-model';
import { SEED_EMPLOYEES } from './crm-seed';
import { roleModelDoc, setRoleModelDoc, sharedDbVersion, type RoleModelDoc } from './shared-db';

/**
 * พนักงานตั้งต้น → ตำแหน่งงาน (ถือได้หลายตำแหน่ง สิทธิ์รวมกัน) : สาย MKT (Online) รับ Lead ได้ ; ทีม CS รับ Prospect ได้ ; ตำแหน่งอื่นรับโอกาสขาย (ไม่รับ Prospect/Lead — ตามผัง Default_Role_by_Action_v8).
 * FAST-DEBT(REQ): ตัวอย่างจับคู่เอง ผังจริงของพนักงานอยู่ที่ขั้น "พนักงาน" ของตั้งค่า · somyot · 2026-11-20
 */
export const SEED_EMPLOYEE_POSITIONS: Record<string, string[]> = {
  E101: ['CS-Sup'],
  E102: ['CS', 'Online'], // two positions: customer service and online marketing — the only one of the first four who can also receive Leads
  E103: ['CS'],
  E104: ['AN'],
  E105: ['PLS Associate'],
  E106: ['LS'],
  E107: ['Online'],
  E108: ['CRM'],
};

const seedDoc = (): RoleModelDoc => ({ roles: standardRoles(), positions: standardPositions(), employeePositions: Object.fromEntries(Object.entries(SEED_EMPLOYEE_POSITIONS).map(([code, list]) => [code, [...list]])) });

const doc = (): RoleModelDoc => roleModelDoc() ?? seedDoc();

export const rolesOf = (): readonly RoleRecord[] => doc().roles;
export const positionsOf = (): readonly PositionRecord[] => doc().positions;
export const roleById = (id: string): RoleRecord | undefined => doc().roles.find((r) => r.id === id);
export const roleByCode = (code: string): RoleRecord | undefined => doc().roles.find((r) => r.code === code);
export const positionByCode = (code: string): PositionRecord | undefined => doc().positions.find((p) => p.code === code);

/** grows with every change of the model: a view built from it rebuilds when this moves */
export const roleModelVersion = (): number => sharedDbVersion();

/** forget the changes (tests, "start again") */
export const resetRoleModel = (): void => setRoleModelDoc(null);

const save = (next: Partial<RoleModelDoc>): void => setRoleModelDoc({ ...doc(), ...next });

/** positions that hold the role (the codes) */
export const positionsUsing = (roleId: string): PositionRecord[] => positionsOf().filter((p) => p.roleIds.includes(roleId));

/* ================================================================================================ Role */

export interface RoleInput {
  /** empty = a new role */
  id?: string;
  code: string;
  name: string;
  nameEn?: string;
  category?: string;
  description?: string;
  status: RoleStatus;
  /** a copy: the permissions of the role it is copied from (empty for a new one) */
  permissions?: readonly string[];
}

export type RoleSaveResult = { ok: true; id: string; lost: LostReceiver[] } | { ok: false; error: 'codeRequired' | 'nameRequired' | 'codeTaken' | 'unknown' };

const codeOk = (input: RoleInput): RoleSaveResult | undefined => {
  if (!input.code.trim()) return { ok: false, error: 'codeRequired' };
  if (!input.name.trim()) return { ok: false, error: 'nameRequired' };
  return roleByCode(input.code.trim()) && roleByCode(input.code.trim())?.id !== input.id ? { ok: false, error: 'codeTaken' } : undefined;
};

/** adds a role or changes its data (the permissions are set with `setRolePermissions`); `lost` = the positions that can no longer receive work (the screen warns first) */
export function saveRole(input: RoleInput): RoleSaveResult {
  const refused = codeOk(input);
  if (refused) return refused;
  const code = input.code.trim();
  const before = rolesOf();
  const existing = input.id ? before.find((r) => r.id === input.id) : undefined;
  if (input.id && !existing) return { ok: false, error: 'unknown' };
  const record: RoleRecord = {
    id: existing?.id ?? roleIdOf(code),
    code,
    name: input.name.trim(),
    nameEn: input.nameEn ?? existing?.nameEn ?? '',
    category: input.category ?? existing?.category ?? '',
    description: input.description ?? existing?.description ?? '',
    status: input.status,
    permissions: existing?.permissions ?? input.permissions ?? [],
  };
  const roles = existing ? before.map((r) => (r.id === record.id ? record : r)) : [...before, record];
  const lost = lostReceivers(positionsOf(), before, positionsOf(), roles);
  save({ roles });
  return { ok: true, id: record.id, lost };
}

/** what ticking / unticking would do to a role: the permissions it would have, what comes or goes with it, and the positions that would lose the right to receive work */
export interface PermissionPlan {
  roleId: string;
  permissions: string[];
  added: string[];
  removed: string[];
  lost: LostReceiver[];
}

function planFrom(role: RoleRecord, set: ReadonlySet<string>, added: string[], removed: string[]): PermissionPlan {
  const permissions = PERMISSIONS.map((p) => p.code).filter((c) => set.has(c));
  const roles = rolesOf().map((r) => (r.id === role.id ? { ...role, permissions } : r));
  return { roleId: role.id, permissions, added, removed, lost: lostReceivers(positionsOf(), rolesOf(), positionsOf(), roles) };
}

/** ticks (`on`) or unticks one permission of a role (with the ones it needs / the ones that need it) — nothing is saved until `applyPlan` */
export function planRolePermission(roleId: string, code: string, on: boolean): PermissionPlan | undefined {
  const role = roleById(roleId);
  if (!role) return undefined;
  const current = setOfRole(role);
  if (on) {
    const r = grant(current, code);
    return planFrom(role, r.set, r.added, []);
  }
  const r = revoke(current, code);
  return planFrom(role, r.set, [], r.removed);
}

/** ticks or unticks every permission of a group at once */
export function planGroupPermissions(roleId: string, group: string, on: boolean): PermissionPlan | undefined {
  const role = roleById(roleId);
  if (!role) return undefined;
  let set = setOfRole(role);
  const added: string[] = [];
  const removed: string[] = [];
  for (const p of PERMISSIONS.filter((x) => x.group === group)) {
    if (on) {
      const r = grant(set, p.code);
      set = r.set;
      added.push(...r.added);
    } else {
      const r = revoke(set, p.code);
      set = r.set;
      removed.push(...r.removed);
    }
  }
  return planFrom(role, set, added, removed);
}

/** saves a plan */
export function applyPlan(plan: PermissionPlan | undefined): PermissionPlan | undefined {
  if (!plan) return undefined;
  save({ roles: rolesOf().map((r) => (r.id === plan.roleId ? { ...r, permissions: plan.permissions } : r)) });
  return plan;
}

export const setRolePermission = (roleId: string, code: string, on: boolean): PermissionPlan | undefined => applyPlan(planRolePermission(roleId, code, on));
export const setGroupPermissions = (roleId: string, group: string, on: boolean): PermissionPlan | undefined => applyPlan(planGroupPermissions(roleId, group, on));

/** the positions that could no longer receive work if the role took this status (a role that is not released gives nothing) */
export function lostIfStatus(roleId: string, status: RoleStatus): LostReceiver[] {
  const before = rolesOf();
  return lostReceivers(positionsOf(), before, positionsOf(), before.map((r) => (r.id === roleId ? { ...r, status } : r)));
}

export type RoleDeleteResult = { ok: true } | { ok: false; usedBy: PositionRecord[] };

/** a role a position still holds cannot be deleted (block it instead) */
export function deleteRole(roleId: string): RoleDeleteResult {
  const usedBy = positionsUsing(roleId);
  if (usedBy.length) return { ok: false, usedBy };
  save({ roles: rolesOf().filter((r) => r.id !== roleId) });
  return { ok: true };
}

/** adds the standard roles the company does not have yet; returns how many */
export function importStandardRoles(): number {
  const have = new Set(rolesOf().map((r) => r.code));
  const add = standardRoles().filter((r) => !have.has(r.code));
  if (add.length) save({ roles: [...rolesOf(), ...add] });
  return add.length;
}

/* ================================================================================================ ตำแหน่งงาน */

/** sets the roles of a position (the ones that are not in the company are ignored); `lost` = what it can no longer receive */
export function setPositionRoles(positionCode: string, roleIds: readonly string[]): { ok: boolean; lost: LostReceiver[] } {
  const before = positionsOf();
  if (!before.some((p) => p.code === positionCode)) return { ok: false, lost: [] };
  const known = new Set(rolesOf().map((r) => r.id));
  const ids = [...new Set(roleIds)].filter((id) => known.has(id));
  const positions = before.map((p) => (p.code === positionCode ? { ...p, roleIds: ids } : p));
  const lost = lostReceivers(before, rolesOf(), positions, rolesOf());
  save({ positions });
  return { ok: true, lost };
}

/** the permissions of every employee of the position (all the released roles together) */
export const permissionsOfPosition = (positionCode: string): Set<string> => {
  const position = positionByCode(positionCode);
  return position ? positionPermissions(position, rolesOf()).set : new Set();
};

/** the positions an employee holds (several: their permissions add up, nothing is forbidden) */
export const positionsOfEmployee = (employeeCode: string): PositionRecord[] =>
  (doc().employeePositions[employeeCode] ?? []).flatMap((code) => positionByCode(code) ?? []);

export const permissionsOfEmployee = (employeeCode: string): Set<string> => {
  const all = new Set<string>();
  for (const position of positionsOfEmployee(employeeCode)) for (const c of positionPermissions(position, rolesOf()).set) all.add(c);
  return all;
};

/* ================================================================================================ ผู้รับงาน */

/** whether the employee may be given (or take) a document of that kind: View + Edit of it through the roles of the position */
export const canReceiveWork = (kind: DocKind, employeeCode: string): boolean => canReceive(permissionsOfEmployee(employeeCode), kind);

/** the employees of the cast who can receive that kind of document */
export const receiversOf = (kind: DocKind): { code: string; name: string }[] => SEED_EMPLOYEES.filter((e) => canReceiveWork(kind, e.code)).map((e) => ({ code: e.code, name: e.name }));

/** employees (of the cast) in a position */
export const employeesOfPosition = (positionCode: string): { code: string; name: string }[] =>
  SEED_EMPLOYEES.filter((e) => (doc().employeePositions[e.code] ?? []).includes(positionCode)).map((e) => ({ code: e.code, name: e.name }));
