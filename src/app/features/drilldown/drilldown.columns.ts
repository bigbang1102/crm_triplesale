/**
 * How DrilldownApiService decides which columns a report shows and in which order — shared by the mock backend now and by the live
 * adapter later (it feeds `planColumns` the keys of the first rows the REST service answers; the mock feeds it the whole dictionary).
 *
 * A port of `ReportDef` (labels, hidden keys, composite columns, planColumns, mockColumns) and of the helpers around it
 * (normalizeKey, humanize, findReport). Framework-free: the comparison harness loads it in Node.
 */
import { HIDDEN_LABELS, REPORTS, type ReportDef } from './drilldown.reports';

/** `{ key, label }` of one column as the service sends it (the answer adds `mapped`: the title came from the dictionary) */
export interface PlannedColumn {
  key: string;
  label: string;
}

/** a report with its dictionary compiled the way `ReportDef`'s constructor does */
export interface Report {
  readonly def: ReportDef;
  /** normalized field -> column title (LinkedHashMap: the order of the table header) */
  readonly labels: ReadonlyMap<string, string>;
  /** normalized fields whose title is on the hidden list */
  readonly hiddenKeys: ReadonlySet<string>;
  /** normalized virtual key -> normalized source fields */
  readonly composites: ReadonlyMap<string, readonly string[]>;
  /** normalized fields a composite column swallowed */
  readonly compositeSources: ReadonlySet<string>;
}

/** letters and digits only, lower case — "CASE_MONTH_TXT", "case_month_txt" and "caseMonthTxt" are one key */
export function normalizeKey(key: string | null | undefined): string {
  return Array.from(key ?? '')
    .filter((c) => /[\p{L}\p{Nd}]/u.test(c))
    .join('')
    .toLowerCase();
}

/** fallback title of a field the dictionary does not know: SEND_BANK_DATE_TXT -> "Send bank date txt" */
export function humanize(key: string | null | undefined): string {
  if (!key) return '';
  let spaced = key.replace(/_/g, ' ').replace(/-/g, ' ').trim();
  spaced = spaced.replace(/(?<=[a-z0-9])(?=[A-Z])/g, ' ');
  spaced = spaced.replace(/\s+/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function compile(def: ReportDef): Report {
  const labels = new Map<string, string>();
  for (const [key, title] of def.labels) labels.set(normalizeKey(key), title);
  // hidden by TITLE, not by field: the dictionary maps several fields to one title (in case the service names a field differently)
  const hiddenKeys = new Set<string>();
  for (const [key, title] of labels) if (HIDDEN_LABELS.includes(title)) hiddenKeys.add(key);
  const composites = new Map<string, readonly string[]>();
  const compositeSources = new Set<string>();
  for (const row of def.composites) {
    const sources = row.slice(1).map(normalizeKey);
    for (const s of sources) compositeSources.add(s);
    composites.set(normalizeKey(row[0]), sources);
  }
  return { def, labels, hiddenKeys, composites, compositeSources };
}

const COMPILED: readonly Report[] = REPORTS.map(compile);

/** the 11 reports in the order of the registry */
export const allReports = (): readonly Report[] => COMPILED;

/** the report for a code — "T-CS-01", "t-cs-01" and "tcs01" all find it (none: undefined) */
export function findReport(code: string | null | undefined): Report | undefined {
  if (!code || !code.trim()) return undefined;
  const want = normalizeKey(code);
  return COMPILED.find((r) => normalizeKey(r.def.code) === want || r.def.apiPath === want);
}

/** the title of a field (undefined = the dictionary does not know it) */
export const labelOf = (r: Report, rawKey: string): string | undefined => r.labels.get(normalizeKey(rawKey));

/**
 * The columns of a report = the order of the dictionary (the header spec), NOT the order of the fields the service sent. Rules:
 * a title that repeats takes the first field that really arrived; a composite column shows when at least one source arrived; a field
 * that arrived but is not in the dictionary follows at the end (no data is dropped).
 *
 * @param rawKeys the fields as the service sent them (the mock passes the whole dictionary)
 * @returns the keys to emit, in order (a composite column is its normalized virtual key)
 */
export function planColumns(r: Report, rawKeys: readonly string[]): string[] {
  const available = new Map<string, string>();
  for (const raw of rawKeys) if (!available.has(normalizeKey(raw))) available.set(normalizeKey(raw), raw);
  // the sources of a composite column count as used from the start: they never show as single columns
  const used = new Set<string>(r.compositeSources);
  const emittedLabels = new Set<string>();
  const plan: string[] = [];
  const emit = (title: string): boolean => {
    if (emittedLabels.has(title)) return false;
    emittedLabels.add(title);
    return true;
  };

  for (const [key, title] of r.labels) {
    if (r.hiddenKeys.has(key)) {
      used.add(key);
      continue;
    }
    const sources = r.composites.get(key);
    if (sources) {
      if (sources.some((s) => available.has(s)) && emit(title)) plan.push(key);
      continue;
    }
    if (r.compositeSources.has(key)) continue;
    used.add(key);
    if (available.has(key) && emit(title)) plan.push(available.get(key)!);
  }
  for (const [nk, raw] of available) if (!used.has(nk)) plan.push(raw);
  return plan;
}

/** the columns of the sample-data mode: the same plan as the real API gets, over the whole dictionary */
export function mockColumns(r: Report): PlannedColumn[] {
  const dictKeys = [...r.labels.keys()].filter((k) => !r.composites.has(k));
  return planColumns(r, dictKeys).map((key) => ({ key, label: labelOf(r, key) ?? humanize(key) }));
}
