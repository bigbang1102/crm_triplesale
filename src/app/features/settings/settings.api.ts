import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@core/config/config.service';
import { QueryParams, toParams } from '@core/http/api-client';
import { Envelope, PageMeta } from '@shared/models/api';
import type { MasterMock } from './settings.master-mock';

/**
 * API ของหน้า Configuration & Master data = โปรเจกต์ configmaster (`/master-setup/*`, `/master-tables/*` ; dev : http://localhost:8085/api/v1
 * เรียกผ่านเส้นทาง `/master-service` ของ proxy.conf.json — ดู ConfigService.masterUrl) — สัญญาอยู่ที่
 * docs/guide/api-flow-config-page.md ของ configmaster (ทุกด่านที่ไม่ผ่าน + เหตุผล) ; ทุก HTTP call ของหน้านี้อยู่ที่ไฟล์นี้ที่เดียว.
 * ผ่าน HttpClient ของแอป จึงได้ Bearer token + แปลง error เป็น ApiError ให้เอง (core/http/interceptors.ts).
 * หน้านี้ไม่มีข้อมูลจำลอง : ทุกอย่างบนหน้ามาจากไฟล์นี้ (settings.store.ts เก็บของที่ใช้ร่วมกัน · list/master-list.ts เก็บรายการ).
 */

/** นิติบุคคลที่เลือกใน "ใช้กับ" (code / name อาจเป็น null ถ้าข้อมูลยังไม่กรอก) */
export interface ApiEntity {
  id: string;
  code: string | null;
  name: string | null;
}

export interface ApiStepTable {
  tableKey: string;
  title: string;
  hasRelease: boolean;
  optional: boolean;
}

/** 1 ขั้นตอนของนิติบุคคลที่เลือก (ขั้นที่บทบาทนี้ดูไม่ได้จะไม่อยู่ใน response เลย) */
export interface ApiStep {
  stepKey: string;
  phaseKey: string;
  title: string;
  goLive: boolean;
  /** ทุกตารางที่ไม่ optional มีแถว release ในนิติบุคคลนี้ */
  done: boolean;
  /** ขั้นที่ต้องมีก่อนยังไม่เสร็จ (ล็อกการ "สร้าง") */
  locked: boolean;
  /** stepKey ของขั้นที่ต้องทำก่อนแต่ยังไม่เสร็จ */
  missingSteps: string[];
  tables: ApiStepTable[];
  visible: boolean;
  editable: boolean;
  /** หมายเหตุของขั้น (แสดงใน tip ของเครื่องหมายตกใจ) */
  note: string | null;
  /** ผู้ตั้งค่า : S = ทีม ACE · E = ผู้ตั้งค่านิติบุคคล · U = ผู้ใช้ทั่วไป */
  editLevel: string;
  /** ขั้นที่ต้องมีก่อนทั้งหมด (`missingSteps` คือเฉพาะที่ยังไม่เสร็จ) */
  dependsOn: string[];
  /** ขั้น "สิทธิ์เริ่มต้น" ตั้งเป็นฟิลด์ของนิติบุคคล ไม่ใช่รายการ → รายชื่อฟิลด์ ; ขั้นปกติ = [] */
  permFields: string[];
}

export interface ApiPhase {
  key: string;
  title: string;
  steps: ApiStep[];
}

export interface ApiSetup {
  phases: ApiPhase[];
  goLiveDone: number;
  goLiveTotal: number;
}

export type ApiColumnType = 'text' | 'number' | 'date' | 'datetime' | 'boolean' | 'enum' | 'reference' | 'action';

export interface ApiColumn {
  field: string;
  label: string;
  type: ApiColumnType;
  required: boolean;
  width: number;
  sortable: boolean;
  options?: { value: string; text: string }[];
}

/** ฟิลด์ที่ต้องแสดงของ Master (ตรวจก่อนดึงข้อมูล) */
export interface ApiTable {
  table: string;
  title: string;
  scope: string;
  provisional: boolean;
  defaultSort: string;
  perPage: number;
  perPageMax: number;
  searchFields: string[];
  version: number;
  columns: ApiColumn[];
}

/** 1 แถว : key = ApiColumn.field (reference = "รหัส · ชื่อ" ที่ server ประกอบให้แล้ว) + id */
export type ApiRow = Record<string, unknown> & { id: string };

export interface ApiRows {
  rows: ApiRow[];
  meta: PageMeta;
}

// ───────────────────────── ฟอร์ม สร้าง / แก้ไข / ดู ─────────────────────────

/** `readonly` = ฟิลด์ระบบที่ผู้ใช้แก้ไม่ได้ (แก้ไขเมื่อ · สร้างเมื่อ · สร้างโดย · แก้ไขโดย · กลุ่มนิติบุคคล · นิติบุคคล) — ไม่เป็นส่วนของค่าที่ส่งบันทึก */
export type ApiControl = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'segment' | 'radio' | 'checkbox' | 'reference' | 'file' | 'readonly';
export type ApiFieldType = 'text' | 'uuid' | 'boolean' | 'integer' | 'bigint' | 'numeric' | 'date' | 'timestamp';
/** ชนิดฟิลด์ระบบ (`ApiField.system`) : ENTITY_SHARED = Master ข้อมูลกลาง ใช้ร่วมทุกนิติบุคคล */
export type ApiSystemKind = 'UPDATED_AT' | 'CREATED_AT' | 'UPDATED_BY' | 'CREATED_BY' | 'ENTITYGROUP' | 'ENTITY' | 'ENTITY_SHARED';

/** 1 ช่องของฟอร์ม — `field` คือ key ใน values{} / rows[] ที่ส่งกลับตอนบันทึก ; maxLength = ค่าที่ server จะตรวจจริง (น้อยกว่าของ spec กับคอลัมน์) */
export interface ApiField {
  field: string;
  label: string;
  control: ApiControl;
  type: ApiFieldType;
  required: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  decimals?: number;
  pattern?: string;
  format?: string;
  options?: { value: string; text: string }[];
  reference?: { table: string; scope: string; excludeSelf: boolean };
  defaultValue?: string;
  /** แสดงตัวนับ x/maxLength */
  counter?: boolean;
  uniqueInRows?: boolean;
  /** กติกาเป็นข้อความไทย (ใต้ช่อง) */
  hint?: string;
  /** ข้อความผิดพลาดไทยของช่องนี้ */
  errorText?: string;
  /** เลขกลุ่มข้อมูล (`ApiSection.groups[].seq`) ที่ช่องนี้อยู่ — เฉพาะแท็บหลักที่ API ส่งผังฟอร์มมา */
  group?: number;
  /** ชนิดฟิลด์ระบบ (เฉพาะ `control: 'readonly'`) */
  system?: ApiSystemKind;
  /** ค่าที่แสดงในช่องระบบที่รู้ตั้งแต่เปิดฟอร์ม : "รหัส · ชื่อ" ของกลุ่มนิติบุคคล/นิติบุคคลที่เลือก */
  shown?: string;
}

/** กลุ่มข้อมูล (section ในแท็บหลัก) : seq = เลขกลุ่มตาม spec ; title = ชื่อกลุ่มไม่รวมเลข */
export interface ApiGroup {
  seq: number;
  title: string;
}

/** 1 แท็บของฟอร์ม : main = แถวหลัก ; item = ตารางลูก (หลายแถว) */
export interface ApiSection {
  key: string;
  kind: 'main' | 'item';
  title: string;
  fields: ApiField[];
  /** กลุ่มข้อมูลของแท็บหลัก (เรียงตามเลข) ; ไม่มี = ไม่แบ่งกลุ่ม (ฟอร์มแบบเดิม) */
  groups?: ApiGroup[];
}

export interface ApiPrecheck {
  canCreate: boolean;
  missingSteps: { stepKey: string; title: string }[];
  missingReferences: { tableKey: string; title: string }[];
}

export type FormMode = 'create' | 'edit' | 'view';

/** ผลของ GET …/form : ช่องที่ต้องแสดง + (mode=create) ผลตรวจก่อนสร้าง */
export interface ApiFormDef {
  table: string;
  title: string;
  mode: string;
  editLevel: string;
  canEdit: boolean;
  writeEnabled: boolean;
  version: number;
  sections: ApiSection[];
  precheck?: ApiPrecheck;
}

/** แถวเดียวสำหรับหน้าแก้ไข/ดู : ค่าของแท็บหลัก + แถวของแท็บ item (แต่ละแถวมี id) */
export interface ApiRecord {
  id: string;
  values: Record<string, unknown>;
  items: Record<string, ({ id: string } & Record<string, unknown>)[]>;
  /** ค่าของฟิลด์ระบบที่มาจากแถวนี้ (key = `ApiField.field` ของช่อง readonly ; เวลาเป็น ISO-8601, ผู้ใช้เป็น id) — เฉพาะที่มีค่า */
  system?: Record<string, string>;
}

/** 1 แถวของ Master อื่นที่อ้างถึงแถวนี้ ("ใช้อยู่ใน") : table = table_key ; title = ชื่อไทยของ Master นั้น */
export interface ApiUsageItem {
  table: string;
  title: string;
  id: string;
  code: string | null;
  name: string | null;
}

/** ผลของ `GET …/records/{id}/usage` : total = จำนวนทั้งหมด ; items = ไม่เกิน 50 แถวแรก */
export interface ApiUsage {
  total: number;
  items: ApiUsageItem[];
}

export interface ApiOption {
  id: string;
  code: string | null;
  name: string | null;
}

export interface ApiOptions {
  items: ApiOption[];
  meta: PageMeta;
}

export interface OptionsQuery {
  entityId: string;
  /** แท็บที่ช่องอยู่ (ค่าเริ่มต้นของ server = main) */
  section?: string;
  q?: string;
  /** ค่าที่เลือกอยู่ — server ใส่เป็นแถวแรกเสมอ (ใช้หาป้ายของค่าเดิม) */
  selected?: string;
  /** ตัดแถวนี้ออก (ช่องที่อ้างตัวเองไม่ได้) */
  excludeId?: string;
  page?: number;
  perPage?: number;
}

/** body ของ POST / PUT : แท็บ item ที่ส่งมา = แทนที่ทั้งแท็บ ; ไม่ส่ง = ไม่แตะ */
export interface ApiWrite {
  entityId: string;
  values: Record<string, unknown>;
  items?: Record<string, Record<string, unknown>[]>;
}

export interface RecordsQuery {
  entityId: string;
  page?: number;
  perPage?: number;
  /** `field,asc|desc` */
  sort?: string;
  /** ค้นหา (server ตัดช่องว่าง/ตรวจความยาว) */
  q?: string;
  status?: string;
}

const enc = (s: string): string => encodeURIComponent(s);

@Injectable({ providedIn: 'root' })
export class SettingsApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ConfigService);
  private mockServer?: Promise<MasterMock>;

  /**
   * Only with `features.masterMock` (the mockup's dev config — NOT `mock`: this page never shows sample data because of `mock`): there is no configmaster,
   * the Master-data service of settings.master-mock.ts answers (its writes are kept in Datasource/journal.settings.json).
   */
  private mock(): Promise<MasterMock> | undefined {
    if (this.config.value.features.masterMock !== true) return undefined;
    return (this.mockServer ??= import('./settings.master-mock').then((m) => m.journaledMasterMock()));
  }

  /** ตัวเลือก "ใช้กับ" — นิติบุคคลที่ผู้ใช้เข้าถึงได้ */
  async entities(): Promise<ApiEntity[]> {
    return (await this.get<ApiEntity[]>('/master-setup/entities')).result ?? [];
  }

  /** ความคืบหน้าขั้นตอนตั้งค่าของนิติบุคคล (✓ · ล็อก · พร้อมเปิดใช้งาน x/y) */
  async setup(entityId: string): Promise<ApiSetup> {
    return (await this.get<ApiSetup>('/master-setup/steps', { entityId })).result;
  }

  /** คอลัมน์ของตาราง (ยังไม่แตะข้อมูล) */
  async table(tableKey: string): Promise<ApiTable> {
    return (await this.get<ApiTable>(`/master-tables/${enc(tableKey)}`)).result;
  }

  /** แถวของตาราง : แบ่งหน้า / ค้นหา / เรียง ที่ server */
  async records(tableKey: string, query: RecordsQuery): Promise<ApiRows> {
    const body = await this.get<ApiRow[]>(`/master-tables/${enc(tableKey)}/records`, { ...query });
    const rows = body.result ?? [];
    return { rows, meta: body.meta ?? { page: 1, perPage: rows.length, total: rows.length, totalPages: 1 } };
  }

  /**
   * ฟอร์มของ Master : ช่องที่ต้องแสดง + สิทธิ์ (`canEdit`) + เปิดให้เขียนไหม (`writeEnabled`) ;
   * mode=create ต้องส่ง `entityId` และ response จะมี `precheck` (ขั้นที่ต้องทำก่อน · Master ที่ต้องมีข้อมูลก่อน)
   */
  async form(tableKey: string, mode: FormMode, entityId?: string): Promise<ApiFormDef> {
    return (await this.get<ApiFormDef>(`/master-tables/${enc(tableKey)}/form`, { mode, entityId })).result;
  }

  /** แถวเดียวสำหรับหน้าแก้ไข/ดู (ต้องอยู่ในขอบเขตนิติบุคคลที่ส่ง ไม่งั้น 404) */
  async record(tableKey: string, id: string, entityId: string): Promise<ApiRecord> {
    return (await this.get<ApiRecord>(`/master-tables/${enc(tableKey)}/records/${enc(id)}`, { entityId })).result;
  }

  /** "ใช้อยู่ใน" : แถวของ Master อื่นที่อ้างถึงแถวนี้ (ในขอบเขตนิติบุคคลที่ส่ง) — ใช้ในแท็บ "ใช้อยู่ใน" ของฟอร์มและหน้า "ลบ" */
  async usage(tableKey: string, id: string, entityId: string): Promise<ApiUsage> {
    return (await this.get<ApiUsage>(`/master-tables/${enc(tableKey)}/records/${enc(id)}/usage`, { entityId })).result;
  }

  /** ตัวเลือกของช่อง reference (เฉพาะแถว release ในขอบเขตเดียวกับนิติบุคคลที่เลือก) */
  async options(tableKey: string, field: string, query: OptionsQuery): Promise<ApiOptions> {
    const body = await this.get<ApiOption[]>(`/master-tables/${enc(tableKey)}/fields/${enc(field)}/options`, { ...query });
    const items = body.result ?? [];
    return { items, meta: body.meta ?? { page: 1, perPage: items.length, total: items.length, totalPages: 1 } };
  }

  /** บันทึก "สร้าง" (ตรวจ 9 ด่านก่อนเขียน — ดู api-flow-config-page.md ข้อ 4.5) → id ของแถวใหม่ */
  async create(tableKey: string, body: ApiWrite): Promise<string> {
    const mock = this.mock();
    if (mock) return ((await mock).post(`/master-tables/${enc(tableKey)}/records`, body as unknown as Record<string, unknown>).result as { id: string }).id;
    const r = await firstValueFrom(this.http.post<Envelope<{ id: string }>>(this.config.masterUrl(`/master-tables/${enc(tableKey)}/records`), body));
    return r.result.id;
  }

  /** บันทึก "แก้ไข" (แท็บ item ที่ส่ง = แทนที่ทั้งแท็บ) */
  async update(tableKey: string, id: string, body: ApiWrite): Promise<string> {
    const mock = this.mock();
    if (mock) return ((await mock).put(`/master-tables/${enc(tableKey)}/records/${enc(id)}`, body as unknown as Record<string, unknown>).result as { id: string }).id;
    const r = await firstValueFrom(this.http.put<Envelope<{ id: string }>>(this.config.masterUrl(`/master-tables/${enc(tableKey)}/records/${enc(id)}`), body));
    return r.result.id;
  }

  /**
   * "ลบ" : ลบแถว + แถวของแท็บ item ทั้งหมดออกจากตารางจริง (ลบถาวร) — ต้องอยู่ในขอบเขตนิติบุคคลที่ส่ง (ไม่งั้น 404) ;
   * ถูกรายการอื่นอ้างอิงอยู่ → 409 `RECORD_IN_USE` (ไม่ลบอะไรเลย) ; `entityId` ไปกับ query เพราะ DELETE ไม่มี body
   */
  async remove(tableKey: string, id: string, entityId: string): Promise<string> {
    const mock = this.mock();
    if (mock) return ((await mock).delete(`/master-tables/${enc(tableKey)}/records/${enc(id)}`, { entityId }).result as { id: string }).id;
    const r = await firstValueFrom(
      this.http.delete<Envelope<{ id: string }>>(this.config.masterUrl(`/master-tables/${enc(tableKey)}/records/${enc(id)}`), { params: toParams({ entityId }) }),
    );
    return r.result.id;
  }

  private async get<T>(path: string, params?: QueryParams): Promise<Envelope<T>> {
    const mock = this.mock();
    if (mock) return (await mock).get(path, (params ?? {}) as Record<string, string | number | boolean | undefined | null>) as Envelope<T>;
    return firstValueFrom(this.http.get<Envelope<T>>(this.config.masterUrl(path), { params: toParams(params) }));
  }
}
