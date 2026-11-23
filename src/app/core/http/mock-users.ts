/**
 * The accounts of the fake sign-in (framework-free: the dev mock interceptor and the comparison harness' fake REST services both use it).
 *
 *   demo    all permissions                     multi   asks to pick a company (2-step login)
 *   viewer  Lead + Calendar only                admin    super_admin
 *   (any other name behaves like "demo" under its own name; the accounts that make a sign-in call fail on purpose are in auth-api.mock.ts)
 */
import { KNOWN_ROLES } from '../permissions/all-roles';
import { ROLE } from '../permissions/roles';
import { mockAccounts, type MockProfile } from './auth-api.mock';

export const ALL_ROLES: string[] = [...KNOWN_ROLES];

export const USERS: Record<string, MockProfile> = {
  demo: { profileName: 'สมชาย ใจดี (ทดลอง)', employeeId: 1001, roles: ALL_ROLES },
  multi: { profileName: 'วิภา สุขสันต์ (ทดลอง)', employeeId: 1002, roles: ALL_ROLES },
  viewer: {
    profileName: 'ผู้ชม (ทดลอง)',
    employeeId: 1003,
    // Lead + Calendar only, under both names: the old keys are what the Java menu asks for, the Pipeline_* / MODULE_Pipeline ones what
    // the left rail and the top tabs of the Angular app ask for
    roles: [
      ROLE.moduleCrm,
      ROLE.featureLead,
      ROLE.featureCalendar,
      ROLE.leadView,
      ROLE.scheduleView,
      ROLE.modulePipeline,
      ROLE.pipelineOpportunityView,
      ROLE.pipelineScheduleAppointmentView,
      ROLE.pipelineScheduleTaskView,
    ],
  },
  admin: { profileName: 'ผู้ดูแลระบบ (ทดลอง)', employeeId: 1, roles: ['super_admin'] },
};

/** the profile of an account; a name that is not listed behaves like "demo" under its own name */
export const profileOf = (key: string, username: string): MockProfile => {
  // the accounts of the Datasource (users.json + roles.json), when the mockup file server gave them: the roles come from the role groups
  const accounts = mockAccounts();
  const account = accounts?.find(key);
  if (accounts && account) {
    return { profileName: account.profileName, employeeId: account.employeeId, employeeCode: account.employeeCode, roles: accounts.rolesOf(account) };
  }
  return USERS[key] ?? { ...USERS['demo'], profileName: username };
};
