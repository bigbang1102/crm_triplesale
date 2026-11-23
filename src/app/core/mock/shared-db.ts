/**
 * The shared database of the mock pages: what the user changed about the CUSTOMERS and LEADS of the cast, seen by every page.
 *
 * Every mock builds its people from `@core/mock/crm-seed` (`seedProspect(n)`, `seedLead(n)`), which is deterministic. This is the layer on
 * top of it: edits of a seed person, people the user added, leads the user opened. `crm-seed` applies it, so a customer saved in the prospect
 * form is the same customer in the prospect list, the opportunity list, the activities, the schedule, the documents and the receipts.
 *
 * Framework-free. In the mockup it is kept in Datasource/shared-db.json (core/mockup/mockup-bootstrap.ts loads it and saves on change).
 * Every write is an upsert by id, so applying the same write twice (a journal replay of a page) leaves the same data.
 */
import type { PositionRecord, RoleRecord } from '../permissions/role-model';
import { SEED_GROUP_MEMBERS } from './activity-group-seed';
import { currentCompany } from './company-scope';

export interface ProspectPatch {
  /** the company the customer was added in (no stamp = every company) */
  company?: string;
  /** the employee (code `E10x`) who took the customer out of the Wait List — empty for the cast, which has no owner in the mock */
  ownerCode?: string;
  code?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  province?: string;
  source?: string;
  createdDate?: string;
  /** the address the pages load the customer's picture from (a file the user chose in the form); none = the picture of the seed */
  avatar?: string;
}

export interface LeadPatch {
  /** the company the lead was opened in (no stamp = every company) */
  company?: string;
  /** only for a lead the user opened: the customer it belongs to */
  prospectId?: number;
  ownerCode?: string;
  groupIdx?: number;
  status?: 'ACTIVE' | 'SUCCESS' | 'LOST';
  interest?: string;
  amount?: number;
  createdDate?: string;
}

/** a customer / opportunity waiting in the Wait List: since when, and who gave it up with what reason (empty = it came in without an owner) */
export interface WaitEntry {
  /** `YYYY-MM-DD` */
  since: string;
  fromCode: string;
  reason: string;
}

/** the two queues kept here: the customers (prospects) and the opportunities, by id (the Leads' own queue lives in features/leads) */
export interface WaitlistState {
  prospects: Record<string, WaitEntry>;
  opportunities: Record<string, WaitEntry>;
}

/** one line of the history of who had a customer / an opportunity (flow §4.7 PR-36, §5.7): who · when · from whom → whom · why */
export interface WaitHistoryEntry {
  action: 'queueIn' | 'take' | 'give' | 'change' | 'return';
  /** `YYYY-MM-DD HH:mm` */
  at: string;
  byCode: string;
  /** employee code, empty = the queue */
  fromCode: string;
  toCode: string;
  reason: string;
}

/** Roles, positions and who holds which position (Settings › Role) — `null` until the user first changes them: the seed of `role-store` applies */
export interface RoleModelDoc {
  roles: RoleRecord[];
  positions: PositionRecord[];
  /** employee code (`E10x`) → the codes of the positions they hold (the permissions of all of them add up) */
  employeePositions: Record<string, string[]>;
}

export interface SharedDbState {
  roleModel: RoleModelDoc | null;
  /** activity group id → the employee codes in it (the members of its Wait List) */
  groupMembers: Record<string, string[]>;
  /** by `prospect:<id>` / `opportunity:<id>`, oldest first */
  waitHistory: Record<string, WaitHistoryEntry[]>;
  waitlist: WaitlistState;
  prospects: Record<string, ProspectPatch>;
  /** ids of the customers the user added (beyond the cast of the seed), in the order they were added */
  addedProspects: number[];
  leads: Record<string, LeadPatch>;
  addedLeads: number[];
}

/**
 * What waits in the Wait List at the start: four customers and four opportunities of the cast (their pages still show the owner they had —
 * FAST-DEBT(REQ): the generated pages do not know the queue; an item taken out of it gets its owner here and every page follows) · somyot · 2026-11-20
 */
const seedWaitlist = (): WaitlistState => ({
  prospects: Object.fromEntries([177, 178, 179, 180].map((id, i) => [String(id), { since: `2026-10-${String(8 + i * 2).padStart(2, '0')}`, fromCode: '', reason: '' }])),
  opportunities: Object.fromEntries([237, 238, 239, 240].map((id, i) => [String(id), { since: `2026-10-${String(6 + i * 3).padStart(2, '0')}`, fromCode: '', reason: '' }])),
});

const seedGroupMembers = (): Record<string, string[]> => Object.fromEntries(Object.entries(SEED_GROUP_MEMBERS).map(([id, codes]) => [id, [...codes]]));

const empty = (): SharedDbState => ({ roleModel: null, groupMembers: seedGroupMembers(), waitHistory: {}, waitlist: seedWaitlist(), prospects: {}, addedProspects: [], leads: {}, addedLeads: [] });

let state: SharedDbState = empty();
let version = 0;
const listeners = new Set<(s: SharedDbState) => void>();

const changed = (): void => {
  version++;
  for (const l of listeners) l(state);
};

/** replaces the data (the file at start, an empty one for the tests); does not notify */
export function setSharedDb(doc: Partial<SharedDbState> | undefined): void {
  state = { ...empty(), ...(doc ?? {}) };
  version++;
}

export const sharedDb = (): Readonly<SharedDbState> => state;

/** grows with every change: a mock that keeps a list built from the cast rebuilds it when this moves */
export const sharedDbVersion = (): number => version;

export function onSharedDbChange(listener: (s: SharedDbState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** forget everything (tests, "start again") */
export function resetSharedDb(): void {
  state = empty();
  changed();
}

export const roleModelDoc = (): RoleModelDoc | null => state.roleModel;

export function setRoleModelDoc(doc: RoleModelDoc | null): void {
  state = { ...state, roleModel: doc };
  changed();
}

export const groupMembersOf = (groupId: number): readonly string[] => state.groupMembers[String(groupId)] ?? [];

export function setGroupMembers(groupId: number, codes: readonly string[]): void {
  state = { ...state, groupMembers: { ...state.groupMembers, [String(groupId)]: [...new Set(codes)] } };
  changed();
}

export const waitHistoryOf = (key: string): readonly WaitHistoryEntry[] => state.waitHistory[key] ?? [];

export function appendWaitHistory(key: string, entry: WaitHistoryEntry): void {
  state = { ...state, waitHistory: { ...state.waitHistory, [key]: [...(state.waitHistory[key] ?? []), entry] } };
  changed();
}

export const waitlistOf = (): Readonly<WaitlistState> => state.waitlist;

/** puts a customer / opportunity into its queue (or refreshes its entry) */
export function enqueue(kind: keyof WaitlistState, id: number, entry: WaitEntry): void {
  state = { ...state, waitlist: { ...state.waitlist, [kind]: { ...state.waitlist[kind], [String(id)]: entry } } };
  changed();
}

/** takes it out of its queue; false when it was not waiting (someone got there first) */
export function dequeue(kind: keyof WaitlistState, id: number): boolean {
  if (!(String(id) in state.waitlist[kind])) return false;
  const { [String(id)]: _gone, ...rest } = state.waitlist[kind];
  state = { ...state, waitlist: { ...state.waitlist, [kind]: rest } };
  changed();
  return true;
}

export const prospectPatchOf = (id: number): ProspectPatch | undefined => state.prospects[String(id)];
export const leadPatchOf = (id: number): LeadPatch | undefined => state.leads[String(id)];

/** adds a customer, or lays `patch` over what is known of it (`added`: it is not one of the cast of the seed) */
export function upsertSharedProspect(id: number, patch: ProspectPatch, added = false): void {
  const merged = { ...(state.prospects[String(id)] ?? {}), ...definedOnly(patch), ...stampOf(added, state.prospects[String(id)]?.company) };
  state = {
    ...state,
    prospects: { ...state.prospects, [String(id)]: merged },
    addedProspects: added && !state.addedProspects.includes(id) ? [...state.addedProspects, id] : state.addedProspects,
  };
  changed();
}

/** adds a lead, or lays `patch` over it */
export function upsertSharedLead(id: number, patch: LeadPatch, added = false): void {
  const merged = { ...(state.leads[String(id)] ?? {}), ...definedOnly(patch), ...stampOf(added, state.leads[String(id)]?.company) };
  state = {
    ...state,
    leads: { ...state.leads, [String(id)]: merged },
    addedLeads: added && !state.addedLeads.includes(id) ? [...state.addedLeads, id] : state.addedLeads,
  };
  changed();
}

/** a thing that is added is stamped with the company now, once (a later write keeps the stamp it has) */
function stampOf(added: boolean, had: string | undefined): { company?: string } {
  const company = had ?? (added ? currentCompany() : '');
  return company ? { company } : {};
}

function definedOnly<T extends object>(patch: T): T {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== '')) as T;
}

/** `"สมชาย ใจดี"` → first / last name (the first word / the rest) */
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const [firstName = '', ...rest] = fullName.trim().split(/\s+/);
  return { firstName, lastName: rest.join(' ') };
}
