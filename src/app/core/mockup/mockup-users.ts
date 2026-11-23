/**
 * The accounts of the mockup sign-in, read from Datasource/users.json · roles.json · branches.json (framework-free: the fake auth API
 * and its tests use it).
 *
 *   users.json     [{ username, password, profileName, employeeId, employeeCode, roleGroups: ['sales'], extraRoles?: [...], branches?: ['SUN'], disabled? }]
 *   roles.json     [{ code, name, description?, grant: ['Pipeline_*', 'Report_*_View', 'super_admin'], deny?: ['*_Delete'] }]
 *   branches.json  [{ id, code, name, nameTh }]
 *
 * A role group is a named set of permission keys. `grant` / `deny` are exact keys or patterns where `*` is any text; a pattern is matched
 * against every key the app knows (`KNOWN_ROLES`), an exact key that the app does not know is granted as it is (e.g. `super_admin`).
 * `deny` wins over `grant`, across all the groups of the user. The roles of a user = the groups' keys + `extraRoles`.
 */

export interface MockupUser {
  username: string;
  password: string;
  profileName: string;
  employeeId: number;
  employeeCode?: string;
  roleGroups: string[];
  extraRoles?: string[];
  /** codes of the companies the user may choose; more than one = the sign-in asks to pick one */
  branches?: string[];
  disabled?: boolean;
  /** one employee per company, each with its own role groups (multi-tenant sign-in); `status` other than `release` = the employee is closed there */
  memberships?: MockupMembership[];
  /** false = no right to use Triple Sales at all (the identity provider's `NO_SYSTEM_ACCESS`) */
  systemAccess?: boolean;
}

export interface MockupMembership {
  company: string;
  employeeId?: number;
  employeeCode?: string;
  roleGroups?: string[];
  extraRoles?: string[];
  status?: 'release' | 'block';
}

/** who a user is, and what they may do, in one company */
export interface MockupMembershipSession {
  profileName: string;
  employeeId: number | null;
  employeeCode: string;
  roles: string[];
}

export interface MockupRoleGroup {
  code: string;
  name: string;
  description?: string;
  grant: string[];
  deny?: string[];
}

export interface MockupBranch {
  id: number | string;
  code: string;
  name: string;
  nameTh?: string;
}

const hasWildcard = (p: string): boolean => p.includes('*');
const matcher = (pattern: string): RegExp => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);

/** the permission keys of a user */
export function resolveRoles(user: MockupUser, groups: readonly MockupRoleGroup[], known: readonly string[]): string[] {
  const picked = groups.filter((g) => user.roleGroups.includes(g.code));
  const granted = new Set<string>(user.extraRoles ?? []);
  const denied: RegExp[] = [];
  for (const group of picked) {
    for (const rule of group.grant) {
      if (hasWildcard(rule)) for (const key of known.filter((k) => matcher(rule).test(k))) granted.add(key);
      else granted.add(rule);
    }
    for (const rule of group.deny ?? []) denied.push(matcher(rule));
  }
  return [...granted].filter((key) => !denied.some((d) => d.test(key)));
}

export interface MockupAccounts {
  find(username: string): MockupUser | undefined;
  rolesOf(user: MockupUser): string[];
  /** the companies a user may choose (the catalogue entries of `user.branches`); the first is the home company */
  branchesOf(user: MockupUser): MockupBranch[];
  /** the employee and the roles of `username` in the company `companyCode` (no such membership = undefined) */
  membershipSession(username: string, companyCode: string): MockupMembershipSession | undefined;
}

export function buildAccounts(users: readonly MockupUser[], groups: readonly MockupRoleGroup[], branches: readonly MockupBranch[], known: readonly string[]): MockupAccounts {
  const byName = new Map(users.map((u) => [u.username.trim().toLowerCase(), u]));
  const byCode = new Map(branches.map((b) => [b.code, b]));
  return {
    find: (username) => byName.get(username.trim().toLowerCase()),
    rolesOf: (user) => resolveRoles(user, groups, known),
    branchesOf: (user) => (user.branches ?? []).flatMap((code) => byCode.get(code) ?? []),
    membershipSession: (username, companyCode) => {
      const user = byName.get(username.trim().toLowerCase());
      if (!user) return undefined;
      const m: MockupMembership | undefined = user.memberships?.find((x) => x.company === companyCode) ?? ((user.branches ?? []).includes(companyCode) ? { company: companyCode } : undefined);
      if (!m) return undefined;
      const roles = resolveRoles({ ...user, roleGroups: m.roleGroups ?? user.roleGroups, extraRoles: m.extraRoles ?? user.extraRoles }, groups, known);
      return { profileName: user.profileName, employeeId: m.employeeId ?? user.employeeId ?? null, employeeCode: m.employeeCode ?? user.employeeCode ?? '', roles };
    },
  };
}
