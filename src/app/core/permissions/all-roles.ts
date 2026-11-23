import { ALL_REPORT_ROLES } from './report-roles';
import { PIPELINE_DOC_ROLES, ROLE, SUPPORTING_DOC_ROLE_PREFIX } from './roles';

/**
 * Every role key the app knows: all of `ROLE`, the View / Create / Edit roles of the supporting documents (the old
 * `CRM_Document_*` and the new `Pipeline_Document_*` names) and the `Report_<CODE>_View` of every report. Framework-free (the fake sign-in and the comparison harness load it in Node).
 * `super_admin` is not in it: a list of the roles is not the right to pass every check.
 */
export const KNOWN_ROLES: readonly string[] = [
  ...(Object.values(ROLE) as string[]),
  ...Object.values(SUPPORTING_DOC_ROLE_PREFIX).flatMap((p) => [
    `${p}_View`,
    `${p}_Create`,
    `${p}_Edit`,
  ]),
  ...PIPELINE_DOC_ROLES,
  ...ALL_REPORT_ROLES,
];
