/**
 * The reports of the report registry and their roles.
 *
 * Java: every report is a key `triplesale.report.<CODE>.jasper` in `report_config.properties`; the role that lets a user see and open it is
 * `Report_<CODE>_View` (`CommonBean.getReportPermJson` answers `{ "<CODE>": hasRole(...) }` for every code of that file). The page lists only
 * the reports of its data file that are in this registry AND permitted.
 */
export const REPORT_CODES = [
  'CRMG10',
  'CRMG11',
  'CRMG12',
  'CRMG13',
  'CRMG14',
  'SUN-LD-01',
  'SUN-LD-02',
  'SUN-LD-03',
  'SUN-LD-04',
  'SUN-LD-05',
  'SUN-LD-06',
  'SUN-LD-07',
  'SUN-LD-09',
  'GGW-LD-01',
  'GGW-LD-02',
] as const;

export const reportRole = (code: string): string => `Report_${code}_View`;

/** the roles of every report (what the mock accounts that may see everything get) */
export const ALL_REPORT_ROLES: readonly string[] = REPORT_CODES.map(reportRole);
