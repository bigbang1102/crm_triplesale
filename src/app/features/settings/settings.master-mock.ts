/**
 * The Master-data service (configmaster `/master-setup/*`, `/master-tables/*`) as a mock: what the Configuration & Master data page
 * needs when there is no configmaster behind it (the mockup).
 *
 * Everything is derived from the two files the page's own config comes from — `settings.config.response.json` (the tree of phases → steps →
 * tables, the dependencies between steps) and `settings.tables.response.json` (the tabs and fields of each table) — so the page shows the
 * same tables and forms it shows with the real service. Records are kept in memory; the writes (create / update / delete) are journaled
 * by `settings.api.ts` (core/mockup/mockup-journal.ts) so they survive a reload.
 *
 * Framework-free except for `ApiError` (the error the HTTP layer throws for a refused call).
 */
import { ApiError } from '@core/http/api-error';
import { reference } from '@core/mock/reference';
import { rolesOf } from '@core/mock/role-store';
import { journaledSync } from '@core/mockup/mockup-journal';
import type { ApiColumn, ApiColumnType, ApiControl, ApiField, ApiFieldType, ApiFormDef, ApiRow, ApiSection, ApiSetup, ApiStep, ApiTable } from './settings.api';
import { buildSettingsModel, parseOptions, type ConfigField, type ConfigTable, type FieldType, type SettingsModel, type SettingsStep } from './settings-config.model';
import { SETTINGS_CONFIG_RESPONSE, SETTINGS_TABLE_RESPONSES } from './settings.config.mock';

type Json = Record<string, unknown>;
type Query = Record<string, string | number | boolean | undefined | null>;

interface MockRecord {
  id: string;
  /** `''` for a Master shared by every legal entity (scope `system`) */
  entityId: string;
  values: Json;
  items: Record<string, ({ id: string } & Json)[]>;
  createdAt: string;
  updatedAt: string;
}

export const MOCK_ENTITIES = reference('settings.entities', [
  { id: 'ent-sun', code: 'SUN', name: 'SUN GATEWAY' },
  { id: 'ent-ace', code: 'ACE', name: 'ACE' },
]);

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 200;
const NOW = '2026-10-20T09:00:00Z';

const fieldKind = (type: FieldType): { control: ApiControl; type: ApiFieldType } => {
  if (type.startsWith('Select:')) return { control: 'select', type: type.endsWith('int') ? 'integer' : 'text' };
  if (type.startsWith('Radio:')) return { control: 'radio', type: type.endsWith('int') ? 'integer' : 'text' };
  switch (type) {
    case 'int':
      return { control: 'number', type: 'integer' };
    case 'long':
      return { control: 'number', type: 'bigint' };
    case 'double':
      return { control: 'number', type: 'numeric' };
    case 'boolean':
      return { control: 'checkbox', type: 'boolean' };
    case 'Date':
      return { control: 'date', type: 'date' };
    case 'Timestamp':
    case 'Time':
      return { control: 'date', type: 'timestamp' };
    case 'Reference':
      return { control: 'reference', type: 'uuid' };
    case 'Upload':
      return { control: 'file', type: 'text' };
    default:
      return { control: 'text', type: 'text' };
  }
};

const columnType = (type: FieldType): ApiColumnType => {
  if (type.startsWith('Select:') || type.startsWith('Radio:')) return 'enum';
  if (type === 'int' || type === 'long' || type === 'double') return 'number';
  if (type === 'boolean') return 'boolean';
  if (type === 'Date') return 'date';
  if (type === 'Timestamp' || type === 'Time') return 'datetime';
  if (type === 'Reference') return 'reference';
  return 'text';
};

/** an error of the service: the same body the real one sends (`{ status, message: <code>, error: { code, description, details } }`) */
function refused(status: number, code: string, description: string, details: { field: string; message: string }[] = []): ApiError {
  const body = { status, message: code, error: { code, description, details } };
  return new ApiError(status, description, { code, body });
}

const asText = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export class MasterMock {
  private readonly model: SettingsModel = buildSettingsModel(SETTINGS_CONFIG_RESPONSE);
  private readonly defs: Record<string, ConfigTable> = SETTINGS_TABLE_RESPONSES;
  private readonly records = new Map<string, MockRecord[]>();
  private seq = 1;

  /** `GET`: the set-up of an entity, the columns of a table, its rows, its form, one row, its usage, the options of a field */
  get(path: string, params: Query = {}): { status: number; result: unknown; meta?: unknown } {
    const parts = path.replace(/^\/+/, '').split('/').map(decodeURIComponent);
    if (parts[0] === 'master-setup') {
      if (parts[1] === 'entities') return ok(MOCK_ENTITIES.map((e) => ({ ...e })));
      if (parts[1] === 'steps') return ok(this.setup(asText(params['entityId'])));
    }
    if (parts[0] !== 'master-tables' || !parts[1]) throw refused(404, 'NOT_FOUND', 'unknown route');
    const key = parts[1];
    const def = this.def(key);
    if (parts.length === 2) return ok(this.table(key, def));
    if (parts[2] === 'form') return ok(this.form(key, def, asText(params['mode']) || 'create', asText(params['entityId'])));
    if (parts[2] === 'fields' && parts[4] === 'options') return this.options(key, def, parts[3], params);
    if (parts[2] === 'records' && parts.length === 3) return this.rows(key, params);
    if (parts[2] === 'records' && parts.length === 4) return ok(this.record(key, parts[3], asText(params['entityId'])));
    if (parts[2] === 'records' && parts[4] === 'usage') return ok(this.usage(key, parts[3]));
    throw refused(404, 'NOT_FOUND', 'unknown route');
  }

  /** `POST /master-tables/{key}/records` */
  post(path: string, body: Json): { status: number; result: unknown } {
    const key = this.keyOf(path);
    const def = this.def(key);
    const entityId = asText(body['entityId']);
    this.ensureOpen(key, entityId);
    const { values, items } = this.checked(def, body, entityId);
    const id = `rec-${String(this.seq++).padStart(5, '0')}`;
    const record: MockRecord = { id, entityId: this.scopeOf(key) === 'system' ? '' : entityId, values, items, createdAt: NOW, updatedAt: NOW };
    this.records.set(key, [...this.list(key), record]);
    return { status: 201, result: { id } };
  }

  /** `PUT /master-tables/{key}/records/{id}` (an item tab that is sent replaces the whole tab; one that is not is left alone) */
  put(path: string, body: Json): { status: number; result: unknown } {
    const key = this.keyOf(path);
    const id = this.idOf(path);
    const def = this.def(key);
    const entityId = asText(body['entityId']);
    const old = this.find(key, id, entityId);
    const { values, items } = this.checked(def, body, entityId);
    const next: MockRecord = { ...old, values: { ...old.values, ...values }, items: { ...old.items, ...items }, updatedAt: NOW };
    this.records.set(key, this.list(key).map((r) => (r.id === id ? next : r)));
    return { status: 200, result: { id } };
  }

  /** `DELETE /master-tables/{key}/records/{id}` — refused (409) while another row refers to it */
  delete(path: string, params: Query = {}): { status: number; result: unknown } {
    const key = this.keyOf(path);
    const id = this.idOf(path);
    this.find(key, id, asText(params['entityId']));
    if (this.usage(key, id).total > 0) throw refused(409, 'RECORD_IN_USE', 'Record is in use');
    this.records.set(key, this.list(key).filter((r) => r.id !== id));
    return { status: 200, result: { id } };
  }

  /* ================================================================================================ the definitions */

  private def(key: string): ConfigTable {
    const def = this.defs[key];
    if (!def || !this.model.tables[key]) throw refused(404, 'MASTER_TABLE_NOT_FOUND', `Unknown master table: ${key}`);
    return def;
  }

  private scopeOf = (key: string): string => this.model.tables[key]?.scope ?? 'entity';
  private titleOf = (key: string): string => this.model.tableNames[key]?.th ?? key;
  private stepOf = (key: string): SettingsStep | undefined => this.model.steps.find((s) => s.tables.includes(key));
  private list = (key: string): MockRecord[] => this.records.get(key) ?? [];

  private keyOf(path: string): string {
    const m = /^\/?master-tables\/([^/]+)\/records/.exec(path);
    if (!m) throw refused(404, 'NOT_FOUND', 'unknown route');
    return decodeURIComponent(m[1]);
  }

  private idOf(path: string): string {
    const m = /\/records\/([^/?]+)/.exec(path);
    if (!m) throw refused(404, 'NOT_FOUND', 'unknown route');
    return decodeURIComponent(m[1]);
  }

  private inScope(key: string, entityId: string): MockRecord[] {
    return this.scopeOf(key) === 'system' ? this.list(key) : this.list(key).filter((r) => r.entityId === entityId);
  }

  private find(key: string, id: string, entityId: string): MockRecord {
    const found = this.inScope(key, entityId).find((r) => r.id === id);
    if (!found) throw refused(404, 'RECORD_NOT_FOUND', 'Record not found');
    return found;
  }

  private isReleased = (r: MockRecord): boolean => (r.values['usagestatus'] ?? 'release') === 'release';

  /** the Roles are kept by the role store (Settings › Role), not by this mock: a released Role is what makes that step done */
  private hasRelease(table: string, entityId: string): boolean {
    return table === 'role' ? rolesOf().some((r) => r.status === 'release') : this.inScope(table, entityId).some(this.isReleased);
  }

  /* ================================================================================================ the set-up of an entity */

  private setup(entityId: string): ApiSetup {
    const done = new Map<string, boolean>();
    for (const step of this.model.steps) {
      const needed = step.tables.filter((t) => !step.optional.includes(t));
      done.set(step.id, needed.every((t) => this.hasRelease(t, entityId)));
    }
    const apiStep = (step: SettingsStep): ApiStep => {
      const missing = step.deps.filter((d) => done.get(d) !== true);
      return {
        stepKey: step.id,
        phaseKey: step.phase,
        title: step.name.th,
        goLive: step.goLive,
        done: done.get(step.id) === true,
        locked: missing.length > 0,
        missingSteps: missing,
        tables: step.tables.map((t) => ({ tableKey: t, title: this.titleOf(t), hasRelease: this.hasRelease(t, entityId), optional: step.optional.includes(t) })),
        visible: true,
        editable: true,
        note: step.note?.th ?? null,
        editLevel: 'S',
        dependsOn: step.deps,
        permFields: step.permFields ?? [],
      };
    };
    const goLive = this.model.steps.filter((s) => s.goLive);
    return {
      phases: this.model.phases.map((p) => ({ key: p.id, title: p.name.th, steps: this.model.steps.filter((s) => s.phase === p.id).map(apiStep) })),
      goLiveDone: goLive.filter((s) => done.get(s.id) === true).length,
      goLiveTotal: goLive.length,
    };
  }

  /** a create is refused while a step it depends on is not done (the 'PREREQUISITE_NOT_MET' gate of the real service) */
  private ensureOpen(key: string, entityId: string): void {
    const missing = this.missingSteps(key, entityId);
    if (missing.length) throw refused(409, 'PREREQUISITE_NOT_MET', 'Prerequisite not met', missing.map((m) => ({ field: m.stepKey, message: m.title })));
  }

  private missingSteps(key: string, entityId: string): { stepKey: string; title: string }[] {
    const step = this.stepOf(key);
    if (!step) return [];
    const setup = this.setup(entityId);
    const byKey = new Map(setup.phases.flatMap((p) => p.steps).map((s) => [s.stepKey, s]));
    return step.deps.filter((d) => byKey.get(d)?.done !== true).map((d) => ({ stepKey: d, title: byKey.get(d)?.title ?? d }));
  }

  /* ================================================================================================ the table, the rows */

  private mainFields(def: ConfigTable): ConfigField[] {
    return def.tabs.find((t) => t.kind === 'form')?.fields ?? [];
  }

  private column(f: ConfigField): ApiColumn {
    const type = columnType(f.type);
    return {
      field: f.name,
      label: f.label.th,
      type,
      required: f.required === true,
      width: type === 'text' ? 180 : 130,
      sortable: type !== 'reference',
      ...(type === 'enum' ? { options: parseOptions(f.ref).map((o) => ({ value: o.value, text: o.label })) } : {}),
    };
  }

  private table(key: string, def: ConfigTable): ApiTable {
    const main = this.mainFields(def);
    const summary = this.model.tables[key];
    const names = new Set<string>();
    const shown: ConfigField[] = [];
    for (const f of [...main.filter((x) => x.name === 'code' || x.name === 'name'), ...summary.listColumns, ...main.filter((x) => x.name === 'usagestatus')]) {
      if (!names.has(f.name)) {
        names.add(f.name);
        shown.push(f);
      }
    }
    return {
      table: key,
      title: this.titleOf(key),
      scope: summary.scope,
      provisional: false,
      defaultSort: names.has('code') ? 'code,asc' : `${shown[0]?.name ?? 'id'},asc`,
      perPage: DEFAULT_PER_PAGE,
      perPageMax: MAX_PER_PAGE,
      searchFields: ['code', 'name'].filter((n) => names.has(n)),
      version: 1,
      columns: shown.map((f) => this.column(f)),
    };
  }

  /** the text a reference shows: `code · name` of the row it points at */
  private shownRef(ref: string | undefined, id: unknown): string {
    if (!ref || !asText(id)) return '';
    const row = this.list(ref).find((r) => r.id === id);
    return row ? [asText(row.values['code']), asText(row.values['name'])].filter(Boolean).join(' · ') : asText(id);
  }

  private flat(key: string, def: ConfigTable, r: MockRecord): ApiRow {
    const out: ApiRow = { id: r.id };
    for (const f of this.mainFields(def)) out[f.name] = f.type === 'Reference' ? this.shownRef(f.ref, r.values[f.name]) : (r.values[f.name] ?? null);
    out['usagestatus'] ??= 'release';
    return out;
  }

  private rows(key: string, q: Query): { status: number; result: ApiRow[]; meta: unknown } {
    const def = this.def(key);
    const perPage = Math.min(Math.max(Number(q['perPage']) || DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
    const needle = asText(q['q']).trim().toLowerCase();
    const status = asText(q['status']);
    let rows = this.inScope(key, asText(q['entityId'])).map((r) => this.flat(key, def, r));
    if (status) rows = rows.filter((r) => r['usagestatus'] === status);
    if (needle) rows = rows.filter((r) => ['code', 'name'].some((n) => asText(r[n]).toLowerCase().includes(needle)));
    const [field, dir] = (asText(q['sort']) || this.table(key, def).defaultSort).split(',');
    rows.sort((a, b) => asText(a[field]).localeCompare(asText(b[field]), 'th', { numeric: true }) * (dir === 'desc' ? -1 : 1));
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const page = Math.min(Math.max(Number(q['page']) || 1, 1), totalPages);
    return { status: 200, result: rows.slice((page - 1) * perPage, page * perPage), meta: { page, perPage, total, totalPages } };
  }

  /* ================================================================================================ the form, one row */

  private apiField(f: ConfigField): ApiField {
    const kind = fieldKind(f.type);
    return {
      field: f.name,
      label: f.label.th,
      control: kind.control,
      type: kind.type,
      required: f.required === true,
      ...(kind.control === 'select' || kind.control === 'radio' ? { options: parseOptions(f.ref).map((o) => ({ value: o.value, text: o.label })) } : {}),
      ...(kind.control === 'reference' && f.ref ? { reference: { table: f.ref, scope: this.scopeOf(f.ref), excludeSelf: false } } : {}),
    };
  }

  private form(key: string, def: ConfigTable, mode: string, entityId: string): ApiFormDef {
    const sections: ApiSection[] = def.tabs.map((t) => ({ key: t.id, kind: t.kind === 'form' ? 'main' : 'item', title: t.name.th, fields: t.fields.map((f) => this.apiField(f)) }));
    const missing = mode === 'create' ? this.missingSteps(key, entityId) : [];
    return {
      table: key,
      title: this.titleOf(key),
      mode,
      editLevel: 'S',
      canEdit: true,
      writeEnabled: true,
      version: 1,
      sections,
      ...(mode === 'create' ? { precheck: { canCreate: missing.length === 0, missingSteps: missing, missingReferences: [] } } : {}),
    };
  }

  private record(key: string, id: string, entityId: string): { id: string; values: Json; items: MockRecord['items']; system: Record<string, string> } {
    const r = this.find(key, id, entityId);
    return { id: r.id, values: { ...r.values }, items: r.items, system: { createdAt: r.createdAt, updatedAt: r.updatedAt } };
  }

  /** the rows other tables hold that refer to this one */
  private usage(key: string, id: string): { total: number; items: { table: string; title: string; id: string; code: string | null; name: string | null }[] } {
    const items: { table: string; title: string; id: string; code: string | null; name: string | null }[] = [];
    for (const [other, def] of Object.entries(this.defs)) {
      const refs = this.mainFields(def).filter((f) => f.type === 'Reference' && f.ref === key).map((f) => f.name);
      if (!refs.length) continue;
      for (const r of this.list(other)) {
        if (refs.some((n) => r.values[n] === id)) items.push({ table: other, title: this.titleOf(other), id: r.id, code: asText(r.values['code']) || null, name: asText(r.values['name']) || null });
      }
    }
    return { total: items.length, items: items.slice(0, 50) };
  }

  private options(key: string, def: ConfigTable, field: string, q: Query): { status: number; result: unknown; meta: unknown } {
    const section = def.tabs.find((t) => t.id === (asText(q['section']) || 'main')) ?? def.tabs[0];
    const f = section.fields.find((x) => x.name === field);
    if (!f || f.type !== 'Reference' || !f.ref) throw refused(404, 'FIELD_NOT_FOUND', `Unknown field: ${field}`);
    const entityId = asText(q['entityId']);
    const needle = asText(q['q']).trim().toLowerCase();
    const picked = asText(q['selected']);
    let rows = this.inScope(f.ref, entityId).filter((r) => this.isReleased(r) || r.id === picked);
    if (asText(q['excludeId'])) rows = rows.filter((r) => r.id !== q['excludeId']);
    if (needle) rows = rows.filter((r) => [r.values['code'], r.values['name']].some((v) => asText(v).toLowerCase().includes(needle)));
    rows = [...rows.filter((r) => r.id === picked), ...rows.filter((r) => r.id !== picked)];
    const perPage = Math.min(Math.max(Number(q['perPage']) || DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const page = Math.min(Math.max(Number(q['page']) || 1, 1), totalPages);
    const items = rows.slice((page - 1) * perPage, page * perPage).map((r) => ({ id: r.id, code: asText(r.values['code']) || null, name: asText(r.values['name']) || null }));
    return { status: 200, result: items, meta: { page, perPage, total, totalPages } };
  }

  /* ================================================================================================ the checks of a write */

  private checked(def: ConfigTable, body: Json, entityId: string): { values: Json; items: MockRecord['items'] } {
    const values: Json = { ...((body['values'] as Json | undefined) ?? {}) };
    const details: { field: string; message: string }[] = [];
    for (const f of this.mainFields(def)) {
      if (f.required && asText(values[f.name]).trim() === '' && !(f.name === 'usagestatus')) details.push({ field: f.name, message: 'required' });
    }
    const sent = (body['items'] as MockRecord['items'] | undefined) ?? {};
    const items: MockRecord['items'] = {};
    for (const [tab, list] of Object.entries(sent)) {
      const tabDef = def.tabs.find((t) => t.id === tab && t.kind === 'rows');
      if (!tabDef) continue;
      items[tab] = list.map((row, i) => {
        for (const f of tabDef.fields) if (f.required && asText(row[f.name]).trim() === '') details.push({ field: `${tab}[${i}].${f.name}`, message: 'required' });
        return { ...row, id: asText(row['id']) || `item-${this.seq++}` } as { id: string } & Json;
      });
    }
    if (details.length) throw refused(422, 'VALIDATION_ERROR', 'Validation failed', details);
    if (!entityId && this.scopeOf(asText(def.name)) !== 'system') throw refused(403, 'FORBIDDEN', 'No access to the entity');
    values['usagestatus'] ??= 'release';
    return { values, items };
  }
}

const ok = (result: unknown): { status: number; result: unknown } => ({ status: 200, result });

let journaled: MasterMock | undefined;
/** one mock for the whole session of the app (until the page is loaded again), with its writes kept in Datasource/journal.settings.json (mockup file server) and replayed at the next start */
export const journaledMasterMock = (): MasterMock =>
  (journaled ??= journaledSync('settings', { make: () => new MasterMock(), writes: ['post', 'put', 'delete'], context: () => ({ get: () => 0, set: () => undefined }) }));

export function resetMasterMock(): void {
  journaled = undefined;
}
