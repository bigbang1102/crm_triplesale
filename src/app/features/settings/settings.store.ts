import { Injectable, computed, inject, resource, signal } from '@angular/core';
import { ApiEntity, ApiPhase, ApiStep, SettingsApi } from './settings.api';
import { SettingsFailure, failureOf } from './settings.errors';
import { valueOf } from './settings.util';

/** กลุ่มของขั้นในแถบ : "ตั้งค่าได้ทันที" หรือ "ต้องมีข้อมูลอื่นก่อน" (ลูกศรเชื่อมขั้นที่ต้องทำต่อกัน) */
export interface StepGroup {
  dependent: boolean;
  /** `linked` = ลูกศรเชื่อมจากขั้นก่อนหน้าในกลุ่ม */
  steps: { step: ApiStep; linked: boolean; linkDone: boolean }[];
}

/** คีย์ localStorage ของนิติบุคคลที่เลือกใน "ใช้กับ" (เก็บแค่ id — ไม่ใช่ข้อมูลลับ) */
export const SETTINGS_ENTITY_KEY = 'ts.settings.entity';

function readSavedEntity(): string | null {
  try {
    return localStorage.getItem(SETTINGS_ENTITY_KEY) || null;
  } catch {
    return null; // storage ถูกบล็อก/โหมดส่วนตัว : ไม่จำ แต่หน้ายังใช้งานได้
  }
}

function saveEntity(id: string): void {
  try {
    localStorage.setItem(SETTINGS_ENTITY_KEY, id);
  } catch {
    /* จำไม่ได้ก็ไม่เป็นไร */
  }
}

/** "รหัส · ชื่อ" ของนิติบุคคลในตัวเลือก "ใช้กับ" (รหัสหรือชื่ออาจว่าง) */
export function entityLabel(e: ApiEntity): string {
  return [e.code, e.name].filter((x): x is string => !!x && !!x.trim()).join(' · ') || e.id;
}

/**
 * ข้อมูลของหน้า Configuration & Master data — ใช้ร่วมกันทั้งหน้าหลักและหน้า v2 :
 *  - นิติบุคคลที่เลือกใช้ได้ ("ใช้กับ") และตัวที่เลือกอยู่ — จาก DB
 *  - phase → ขั้นตอน → ตาราง (แท็บเมนู) พร้อมสถานะ เสร็จ/ล็อก/ขั้นที่ต้องทำก่อน/พร้อมเปิดใช้งาน x/y — ทั้งโครง (แท็บ · ขั้น · ชื่อ · ลำดับ · ตารางในขั้น
 *    จากตาราง menu) และสถานะมาจาก GET /master-setup/steps คำตอบเดียว (docs/guide/menu-api.md ของ configmaster)
 * เก็บไว้ที่ root เพื่อให้เปลี่ยนไปมาระหว่างหน้า v1/v2 แล้วยังเป็นนิติบุคคลเดิม.
 */
@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly api = inject(SettingsApi);

  private readonly entitiesRes = resource({ loader: () => this.api.entities() });
  /** ตัวที่ผู้ใช้เลือกไว้ — จำข้ามการรีเฟรช/เปิดใหม่ (ถ้า id นั้นไม่อยู่ในรายการของผู้ใช้คนนี้ ก็ใช้ตัวแรกเหมือนเดิม) */
  private readonly chosen = signal<string | null>(readSavedEntity());

  /** ตัวเลือก "ใช้กับ" */
  readonly entities = computed(() => (valueOf(this.entitiesRes) ?? []).map((e) => ({ id: e.id, name: entityLabel(e) })));
  /** นิติบุคคลที่เลือก : ที่ผู้ใช้เลือกไว้ (ถ้ายังอยู่ในรายการ) ไม่งั้นตัวแรก ; ยังโหลดไม่เสร็จ/ไม่มี = '' */
  readonly entity = computed(() => {
    const list = this.entities();
    const chosen = this.chosen();
    return chosen && list.some((e) => e.id === chosen) ? chosen : (list[0]?.id ?? '');
  });

  private readonly setupRes = resource({
    params: () => this.entity() || undefined,
    loader: ({ params }) => this.api.setup(params),
  });

  /** phase → ขั้น (แท็บเมนู) ตามคำตอบของ API : ขั้นที่บทบาทนี้ดูไม่ได้ API ไม่ส่งมา · โหลดไม่ได้ = ไม่มีแท็บ (ขึ้นข้อความผิดพลาดแทน) */
  readonly phases = computed<ApiPhase[]>(() => valueOf(this.setupRes)?.phases ?? []);
  readonly steps = computed<ApiStep[]>(() => this.phases().flatMap((p) => p.steps));
  private readonly byKey = computed(() => new Map(this.steps().map((s) => [s.stepKey, s])));
  /** โหลดขั้นตอนของนิติบุคคลที่เลือกแล้ว */
  readonly loaded = computed(() => this.setupRes.hasValue());

  /** พร้อมเปิดใช้งาน x/y — ตัวเลขที่ API คำนวณ (ยังโหลดไม่ได้ = 0/0) */
  readonly goLive = computed(() => {
    const s = valueOf(this.setupRes);
    const done = s?.goLiveDone ?? 0;
    const total = s?.goLiveTotal ?? 0;
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  });

  /** ฟอร์ม สร้าง/แก้ไข/ดู เปิดเป็นหน้าเต็ม → กรอบของหน้า (แท็บหมวด · แถบขั้นตอน) ซ่อนตัว (รายการเป็นคนตั้งค่านี้) */
  readonly fullPage = signal(false);

  readonly busy = computed(() => this.entitiesRes.isLoading() || this.setupRes.isLoading());
  /** ความผิดพลาดแรกที่เจอ (โหลดรายการนิติบุคคล / ขั้นตอน) */
  readonly failure = computed<SettingsFailure | null>(() => {
    const e = this.entitiesRes.error() ?? this.setupRes.error();
    return e ? failureOf(e) : null;
  });
  /** ผู้ใช้ไม่มีนิติบุคคลที่ใช้ได้เลย (ไม่ใช่ error) */
  readonly noEntity = computed(() => !this.entitiesRes.isLoading() && !this.failure() && this.entities().length === 0);

  setEntity(id: string): void {
    this.chosen.set(id);
    saveEntity(id);
  }

  step(key: string): ApiStep | undefined {
    return this.byKey().get(key);
  }

  stepDone(key: string): boolean {
    return this.byKey().get(key)?.done ?? false;
  }

  /** ขั้นที่ต้องมีก่อนแต่ยังไม่เสร็จ (ที่บทบาทนี้ไม่เห็นก็ไม่ถูกนับ — ไม่มีให้ไปต่อ) */
  stepMissing(step: ApiStep): ApiStep[] {
    return step.missingSteps.map((k) => this.byKey().get(k)).filter((s): s is ApiStep => !!s);
  }

  /** ขั้นแรกที่ตั้งค่าตารางนี้ (เฉพาะที่ผู้ใช้เข้าได้ — ขั้นที่ API ไม่ส่งมาไม่นับ ; ขั้นสิทธิ์เริ่มต้นไม่นับ) ; ไม่มี = null */
  stepOfTable(table: string): string | null {
    return this.steps().find((s) => !s.permFields.length && s.tables.some((t) => t.tableKey === table))?.stepKey ?? null;
  }

  /** ตารางนี้มีแถว release ในนิติบุคคลที่เลือกแล้วหรือยัง */
  tableDone(table: string): boolean {
    return this.steps().some((s) => s.tables.some((t) => t.tableKey === table && t.hasRelease));
  }

  phaseDone(phaseKey: string): boolean {
    const p = this.phases().find((x) => x.key === phaseKey);
    return !!p && p.steps.every((s) => s.done);
  }

  /** ชื่อตารางจาก DB (ว่างถ้ายังไม่โหลด → ใช้ key) */
  tableTitle(table: string): string {
    for (const s of this.steps()) for (const t of s.tables) if (t.tableKey === table) return t.title || table;
    return table;
  }

  /** ตารางที่ควรเปิดเมื่อเลือกขั้น : ตารางแรกที่ยังว่างและไม่ใช่ optional → ตารางแรก */
  defaultTable(step: ApiStep): string {
    return (step.tables.find((t) => !t.hasRelease && !t.optional) ?? step.tables[0])?.tableKey ?? '';
  }

  /** ขั้นที่ตั้งค่าได้ทันที = ไม่ต้องรอขั้นอื่นนอกจาก "นิติบุคคล" */
  isFree(step: ApiStep): boolean {
    return step.dependsOn.every((d) => d === 'entity');
  }

  /** จัดขั้นของ phase เป็นกลุ่ม ตั้งค่าได้ทันที / ต้องมีข้อมูลอื่นก่อน (ลูกศรเชื่อมเมื่อขั้นต่อกันตามลำดับ) */
  groupsOf(phaseKey: string): StepGroup[] {
    const inPhase = this.phases().find((p) => p.key === phaseKey)?.steps ?? [];
    const free = inPhase.filter((s) => this.isFree(s));
    const dep = inPhase.filter((s) => !this.isFree(s));
    const out: StepGroup[] = [];
    if (free.length) out.push({ dependent: false, steps: free.map((step) => ({ step, linked: false, linkDone: false })) });
    if (dep.length) {
      out.push({
        dependent: true,
        steps: dep.map((step, i) => {
          const prev = dep[i - 1];
          const linked = !!prev && step.dependsOn.includes(prev.stepKey);
          return { step, linked, linkDone: linked && prev.done };
        }),
      });
    }
    return out;
  }

  /**
   * โหลดขั้นตอนใหม่ (หลังบันทึก : แถว release ใหม่อาจทำให้ขั้นเสร็จ/ปลดล็อกขั้นถัดไป) →
   * ชื่อขั้นที่ "เพิ่งปลดล็อก" (ก่อนหน้านี้ล็อกอยู่ ตอนนี้ตั้งค่าได้แล้ว) ไว้บอกผู้ใช้ใน toast ตาม mockup v33 ("บันทึก X แล้ว · ตั้งค่า … ได้แล้ว")
   */
  async reloadSetup(): Promise<string[]> {
    const entity = this.entity();
    if (!entity) return [];
    const wasLocked = new Set(this.steps().filter((s) => s.locked).map((s) => s.stepKey));
    try {
      const fresh = await this.api.setup(entity);
      this.setupRes.set(fresh);
      return fresh.phases.flatMap((p) => p.steps).filter((s) => wasLocked.has(s.stepKey) && !s.locked).map((s) => s.title);
    } catch {
      this.setupRes.reload(); // โหลดไม่ได้ : ให้หน้าแสดงข้อความผิดพลาด/ปุ่มลองใหม่ตามปกติ
      return [];
    }
  }

  /** ลองใหม่ทั้งหมดที่ล้ม */
  reload(): void {
    this.entitiesRes.reload();
    this.setupRes.reload();
  }
}
