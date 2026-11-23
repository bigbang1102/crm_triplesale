import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, resource, signal, untracked } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { TsIcon } from '@shared/ui/icon/icon';
import { ApiField, ApiFormDef, ApiSection, ApiUsage, FormMode, SettingsApi } from '../settings.api';
import { SettingsFailure, failureMessage, failureOf } from '../settings.errors';
import { formatDateTime, valueOf } from '../settings.util';
import { fieldMessage } from './master-form.errors';
import {
  FieldValue,
  FormGroup,
  FormState,
  blankRow,
  copyState,
  dirtyKey,
  groupsOf,
  initialState,
  itemPath,
  itemSections,
  mainPath,
  mainSection,
  missingRequired,
  placeErrors,
  toWrite,
} from './master-form.logic';
import { FieldContext, MasterField } from './master-field';

/** ทำไมฟอร์ม "สร้าง" เปิดไม่ได้ (ผลตรวจก่อนสร้างของ API — เรียงตามลำดับเหตุผลใน api-flow-config-page.md ข้อ 4.3) */
interface Blocked {
  kind: 'notWritable' | 'viewOnly' | 'steps';
  steps: { stepKey: string; title: string }[];
}

let nextUid = 0;

/** แท็บ "ใช้อยู่ใน" (ไม่ใช่ section ของ API) */
export const USED_TAB = 'used';
const USED_SHOWN = 12;

/** แท็บที่ error path นี้อยู่ : `values.<field>` → main ; `items.<key>[n].<field>` → <key> */
function tabOf(path: string): string {
  const m = /^items\.(.+?)\[\d+\]/.exec(path);
  return m ? m[1] : 'main';
}

/**
 * ฟอร์ม สร้าง / แก้ไข / ดู ของ Master — วาดจาก `GET …/form` (ช่องมาจาก conf_master_form_field ไม่รู้จักตารางใดเป็นพิเศษ)
 * - สร้าง : ตรวจก่อน (precheck) ถ้าสร้างไม่ได้แสดงเหตุผลแทนฟอร์ม ; ผ่านแล้วกรอก → POST
 * - คัดลอกเป็นรายการใหม่ : คือ "สร้าง" ที่ใส่ค่าของแถวต้นฉบับ (`copyFrom`) ให้ก่อน (ดู `copyState`) — บันทึกด้วย POST เหมือนสร้าง จึงเป็นแถวใหม่เสมอ ไม่แตะแถวต้นฉบับ
 * - แก้ไข : โหลดแถว (`GET …/records/{id}`) + ฟอร์มพร้อมกัน → PUT (แท็บ item ส่งครบทุกแท็บ : API แทนที่ทั้งแท็บ)
 * - ดู : อ่านอย่างเดียว
 * ผิดกติกา (422) แสดงใต้ช่องที่ผิดตาม `error.details[].field` ; ปฏิเสธทั้งคำขอ (403/409/404/503) แสดงเป็นข้อความด้านบนของฟอร์ม.
 * ฝั่งนี้ตรวจเองแค่ "ช่องบังคับว่าง" — ที่เหลือ server ตัดสิน (ด่าน ⑦–⑧).
 */
@Component({
  selector: 'ts-master-form',
  imports: [MasterField, NgTemplateOutlet, TsIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './master-form.html',
  styleUrl: './master-form.scss',
})
export class MasterForm {
  private readonly api = inject(SettingsApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly t = inject(I18n).t;

  readonly table = input.required<string>();
  readonly mode = input.required<FormMode>();
  readonly entityId = input.required<string>();
  /** แถวที่แก้/ดู (ไม่ใช้ตอนสร้าง) */
  readonly recordId = input<string | null>(null);
  /** แถวต้นฉบับที่คัดลอก (ใช้ตอน mode = create เท่านั้น ; null = สร้างใหม่เปล่า ๆ) — ค่าของแถวนี้ถูกใส่ในฟอร์มสร้าง แล้วบันทึกเป็นแถวใหม่ */
  readonly copyFrom = input<string | null>(null);
  /** 'delete' = หน้า "ลบ" (mockup v33 : ลบ + "ใช้อยู่ใน" + เปลี่ยนเป็น block) — ใช้ฟอร์มตัวเดียวกัน (mode = edit) แต่แสดงหน้าลบแทนช่อง ; null = ฟอร์มปกติ */
  readonly intent = input<'delete' | null>(null);
  /** ชื่อขั้นตอนและชื่อตาราง : แสดงใน breadcrumb ของหน้า (ขั้นตอน / ตาราง / สร้างใหม่) */
  readonly stepTitle = input('');
  readonly tableTitle = input('');
  /** ขั้นตอนที่ตั้งค่า Master นี้ (stepKey ของขั้นที่ผู้ใช้เข้าได้) — ใช้ทำลิงก์ "ไปสร้าง" ใต้ช่องที่ยังไม่มีข้อมูลให้เลือก ; null = ผู้ใช้ไม่มีสิทธิ์/ไม่มีขั้นนั้น */
  readonly refStep = input<(tableKey: string) => string | null>(() => null);

  /** บันทึกสำเร็จ (หน้าปิดฟอร์มแล้วโหลดรายการ/ขั้นตอนใหม่) */
  readonly saved = output<{ id: string; mode: FormMode; code: string }>();
  readonly closed = output<void>();
  /** กด "แก้ไข" ในโหมดดู → หน้าสลับฟอร์มเป็นโหมดแก้ไขของแถวเดิม */
  readonly edit = output<void>();
  /** กด "คัดลอก" ในโหมดดู → หน้าเปิดฟอร์มสร้างที่ใส่ค่าของแถวนี้ให้ (mockup v33 : ปุ่ม คัดลอก ข้างปุ่ม แก้ไข) */
  readonly copy = output<void>();
  /** ลบแล้ว (หน้า "ลบ") */
  readonly deleted = output<{ id: string; code: string }>();
  /** เปลี่ยนแถวที่ถูกใช้อยู่เป็น block แล้ว (หน้า "ลบ") */
  readonly toBlocked = output<{ id: string; code: string }>();
  /** กดไปที่ขั้นที่ต้องทำก่อน (ตอนสร้างไม่ได้เพราะขั้นก่อนหน้ายังไม่เสร็จ) */
  readonly goStep = output<string>();

  protected readonly uid = `mf${nextUid++}`;

  private readonly loaded = resource({
    params: () => ({ table: this.table(), mode: this.mode(), entityId: this.entityId(), id: this.recordId(), copyFrom: this.copyFrom() }),
    loader: async ({ params }) => {
      const create = params.mode === 'create';
      // แถวที่ต้องอ่าน : แก้ไข/ดู = แถวที่เปิด ; สร้างแบบคัดลอก = แถวต้นฉบับ ; สร้างเปล่า = ไม่อ่าน
      const source = create ? params.copyFrom : params.id;
      // entityId ไปทุกโหมด : ตอนสร้างใช้ตรวจก่อนสร้าง ; ตอนแก้ไข/ดูใช้หา "รหัส · ชื่อ" ของกลุ่มนิติบุคคล/นิติบุคคลในช่องระบบ
      const [def, record] = await Promise.all([
        this.api.form(params.table, params.mode, params.entityId || undefined),
        source ? this.api.record(params.table, source, params.entityId) : Promise.resolve(undefined),
      ]);
      // "ใช้อยู่ใน" (แท็บและข้อความเตือนตอน block) : ดูเฉพาะแถวที่เปิดอยู่ ; ถามไม่ได้ (API รุ่นเก่า/ผิดพลาด) = ไม่มีแท็บ ไม่ทำให้ฟอร์มล้ม
      const usage = !create && params.id ? await this.api.usage(params.table, params.id, params.entityId).catch(() => null) : null;
      return { def, record, usage };
    },
  });

  protected readonly def = computed<ApiFormDef | undefined>(() => valueOf(this.loaded)?.def);
  protected readonly loading = computed(() => this.loaded.isLoading());
  protected readonly loadFailure = computed<SettingsFailure | null>(() => {
    const e = this.loaded.error();
    return e ? failureOf(e) : null;
  });

  /** ค่าในฟอร์ม (เริ่มเมื่อโหลดเสร็จ) */
  protected readonly state = signal<FormState | null>(null);
  /** ค่าตอนเปิด (รูปแบบเทียบ) — เทียบหาว่าผู้ใช้แก้อะไรไว้ที่ยังไม่บันทึก */
  private readonly baseline = signal('');
  protected readonly dirty = computed(() => {
    const s = this.state();
    return !!s && dirtyKey(s) !== this.baseline();
  });
  /** กำลังถามยืนยัน "ทิ้งการแก้ไข?" (แทนที่การ์ดฟอร์ม ฟอร์มยังอยู่เบื้องหลังพร้อมค่าที่กรอก) */
  protected readonly confirming = signal(false);
  protected readonly saving = signal(false);
  /** ปฏิเสธทั้งคำขอ (ไม่ใช่ผิดที่ช่อง) */
  protected readonly failure = signal<SettingsFailure | null>(null);
  /** path → ข้อความจาก API (ยังไม่แปลง) */
  protected readonly errors = signal<Record<string, string[]>>({});
  protected readonly loose = signal<string[]>([]);

  protected readonly mainFields = computed<ApiField[]>(() => (this.def() ? (mainSection(this.def()!)?.fields ?? []) : []));
  /** กลุ่มข้อมูลของแท็บหลัก (การ์ดต่อกลุ่ม) ; null = ไม่มีผังฟอร์ม → กริดเดียวแบบเดิม */
  protected readonly mainGroups = computed<FormGroup[] | null>(() => (this.def() ? groupsOf(mainSection(this.def()!)) : null));
  protected readonly itemSecs = computed<ApiSection[]>(() => (this.def() ? itemSections(this.def()!) : []));

  /** แท็บที่เปิดอยู่ : 'main' = ข้อมูลหลัก ; ไม่ใช่ = key ของแท็บ item (ทุกแท็บอยู่ใน DOM เสมอ แค่ซ่อน — ค่าที่กรอกไว้ไม่หาย) */
  protected readonly tab = signal('main');
  /** แถวของ Master อื่นที่อ้างถึงแถวที่เปิดอยู่ (แก้ไข/ดู) ; null = ไม่มี/ถามไม่ได้ */
  protected readonly usage = computed<ApiUsage | null>(() => valueOf(this.loaded)?.usage ?? null);
  /** แท็บที่ 2 ขึ้นไป : แท็บ item ของ Master + "ใช้อยู่ใน" (เฉพาะแถวที่มีอยู่แล้ว ตาม mockup v33) */
  protected readonly tabs = computed<{ key: string; title: string; icon: string }[]>(() => [
    { key: 'main', title: this.t('app.settings.form.tabMain'), icon: 'pencil' },
    ...this.itemSecs().map((s) => ({ key: s.key, title: s.title, icon: 'database' })),
    ...(this.usage() ? [{ key: USED_TAB, title: this.t('app.settings.form.tabUsed'), icon: 'chevronRight' }] : []),
  ]);
  /** ใช้กรองข้อความที่ว่างออกตอนต่อ "รหัส ชื่อ" ในแท็บ "ใช้อยู่ใน" */
  protected readonly present = (x: string | null): boolean => !!x;
  /** แถวที่แสดงในแท็บ "ใช้อยู่ใน" (ตาม mockup : 12 แถวแรก) */
  protected readonly usedShown = computed(() => (this.usage()?.items ?? []).slice(0, USED_SHOWN));
  /** แท็บที่มีช่องผิด (จุดแดงท้ายชื่อแท็บ) */
  protected isBadTab(key: string): boolean {
    return Object.keys(this.errors()).some((p) => tabOf(p) === key);
  }
  /** แก้/ดู ได้เมื่อบทบาทมีสิทธิ์และ Master เปิดให้เขียน (ปุ่ม "แก้ไข" ในโหมดดู) */
  protected readonly canSwitchToEdit = computed(() => {
    const d = this.def();
    return this.mode() === 'view' && !!d && d.canEdit && d.writeEnabled;
  });

  /** สร้างไม่ได้ → เหตุผล (ฟอร์มไม่แสดง) */
  protected readonly blocked = computed<Blocked | null>(() => {
    const d = this.def();
    if (!d || this.mode() !== 'create') return null;
    if (!d.writeEnabled) return { kind: 'notWritable', steps: [] };
    if (!d.canEdit) return { kind: 'viewOnly', steps: [] };
    const steps = d.precheck?.missingSteps ?? [];
    return steps.length ? { kind: 'steps', steps } : null;
  });

  /** แก้/ดู แต่แก้ไม่ได้ (บทบาทดูอย่างเดียว หรือ Master ยังไม่เปิดให้เขียน) */
  protected readonly readOnly = computed(() => {
    const d = this.def();
    return this.mode() === 'view' || !d || !d.canEdit || !d.writeEnabled;
  });
  protected readonly readOnlyNote = computed<string | null>(() => {
    const d = this.def();
    if (!d || this.mode() !== 'edit') return null;
    if (!d.writeEnabled) return this.t('app.settings.err.notWritable');
    return d.canEdit ? null : this.t('app.settings.create.viewOnly');
  });
  /** เตือน (ไม่ล็อกฟอร์ม) : ช่อง reference บังคับที่ Master ปลายทางยังไม่มีแถว release */
  protected readonly warnRefs = computed<string[]>(() =>
    this.mode() === 'create' ? (this.def()?.precheck?.missingReferences ?? []).map((r) => this.t('app.settings.create.needRefs', r.title)) : [],
  );

  /** "รหัส · ชื่อ" ของแถวที่เปิด (ค่าตอนโหลด — ไม่เปลี่ยนตามที่พิมพ์) ใช้เป็นหัวการ์ดตอนแก้/ดู ตาม mockup ; '' ถ้าแถวไม่มีทั้งสองช่อง */
  private readonly recordTitle = signal('');

  /** กำลังสร้างโดยคัดลอกจากแถวอื่น */
  protected readonly copying = computed(() => this.mode() === 'create' && !!this.copyFrom());
  /** รหัสของแถวต้นฉบับ (บรรทัดใต้ชื่อฟอร์ม : "คัดลอกจาก …") */
  protected readonly copySrc = signal('');

  /** สถานะตอนเปิดฟอร์ม (เทียบว่าผู้ใช้เปลี่ยนเป็น block หรือไม่) */
  private readonly origStatus = signal('');
  /** เตือนใต้ช่องสถานะ : เปลี่ยนแถวที่ถูกใช้อยู่เป็น block (mockup v33) */
  protected readonly blockNote = computed<string | null>(() => {
    const n = this.usage()?.total ?? 0;
    const s = this.state();
    if (this.mode() !== 'edit' || !n || !s || s.values['usagestatus'] !== 'block' || this.origStatus() === 'block') return null;
    return this.t('app.settings.form.blockNote', n);
  });
  /** บันทึกไม่ได้เพราะรหัสซ้ำอย่างเดียว (422 ที่ช่องรหัส ไม่มีข้อผิดอื่น) → แถบเฉพาะแทนแถบ "ข้อมูลไม่ครบ" ตาม mockup v33 ; มีข้อผิดอื่นด้วย = แถบรวมเดิม (ไม่ซ่อนข้อความอื่น) */
  protected readonly dupCode = computed(() => this.errorCount() === 1 && !this.loose().length && (this.errors()[mainPath('code')] ?? []).some((m) => /already exists/i.test(m)));
  protected readonly codeValue = computed(() => {
    const v = this.state()?.values['code'];
    return typeof v === 'string' ? v.trim() : '';
  });

  /** หน้า "ลบ" */
  protected readonly deleting = computed(() => this.intent() === 'delete');
  /** แถวที่ใช้อยู่ใน (หน้า "ลบ" แสดง 6 แถวแรกตาม mockup) */
  protected readonly usedFew = computed(() => (this.usage()?.items ?? []).slice(0, 6));
  /**
   * ปุ่มที่หน้า "ลบ" ให้กด : ไม่มีใครใช้ → ลบ ; ถูกใช้อยู่ → เปลี่ยนเป็น block (ถ้ายังไม่ใช่ block) ; ไม่มีสิทธิ์แก้ / Master ยังไม่เปิดให้เขียน = ไม่มีปุ่ม.
   * ถามการใช้งานไม่ได้ (usage = null) = ให้ลองลบ — foreign key ของ DB ยังกันไว้ (409)
   */
  protected readonly deleteMode = computed<'delete' | 'block' | null>(() => {
    const d = this.def();
    const s = this.state();
    if (!this.deleting() || !d || !s || !d.canEdit || !d.writeEnabled) return null;
    if (!(this.usage()?.total ?? 0)) return 'delete';
    return s.values['usagestatus'] === 'block' ? null : 'block';
  });

  protected readonly heading = computed(() => {
    const m = this.mode();
    if (this.deleting()) return this.recordTitle() ? this.t('app.settings.delete.pageTitle', this.recordTitle()) : this.t('app.settings.delete.pageTitle', this.def()?.title ?? '');
    if (m !== 'create' && this.recordTitle()) return this.recordTitle();
    const key = m === 'create' ? 'titleCreate' : m === 'edit' ? 'titleEdit' : 'titleView';
    return this.t(`app.settings.form.${key}`, this.def()?.title ?? '');
  });
  protected readonly errorCount = computed(() => Object.keys(this.errors()).length);

  /** ข้อความท้าย breadcrumb : สร้างใหม่ / ดูข้อมูล / แก้ไข / ยืนยันการยกเลิก */
  protected readonly current = computed(() => {
    if (this.confirming()) return this.t('app.settings.page.curDiscard');
    const m = this.mode();
    if (this.deleting()) return this.t('app.settings.page.curDelete');
    const create = this.copying() ? 'app.settings.page.curCopy' : 'app.settings.page.curCreate';
    return this.t(m === 'create' ? create : m === 'view' ? 'app.settings.page.curView' : 'app.settings.page.curEdit');
  });

  constructor() {
    // เปิดหน้าฟอร์ม / สลับไปหน้ายืนยัน → เลื่อนขึ้นบนสุด (ฟอร์มเป็นหน้าเต็ม ไม่ใช่ popup)
    effect(() => {
      this.confirming();
      this.host.nativeElement.scrollIntoView?.({ block: 'start' });
    });
    // โหลดเสร็จ (หรือโหลดใหม่) → ตั้งค่าเริ่มต้นของฟอร์ม
    effect(() => {
      const v = valueOf(this.loaded);
      if (!v) return;
      untracked(() => {
        // สร้างแบบคัดลอก (create + อ่านแถวต้นฉบับมาแล้ว) : ค่าของต้นฉบับ ยกเว้นรหัสที่ว่างไว้ + สถานะ draft ; ที่เหลือเหมือนเดิม
        const copy = this.mode() === 'create' && v.record ? copyState(v.def, v.record) : null;
        const initial = copy ? copy.state : initialState(v.def, v.record);
        this.state.set(initial);
        this.baseline.set(dirtyKey(initial)); // สำเนาที่ยังไม่ได้แก้ = ยังไม่ "เปลี่ยน" (ยกเลิกแล้วไม่ถามยืนยัน)
        const code = initial.values['code'];
        const name = initial.values['name'];
        this.recordTitle.set(typeof code === 'string' && code && typeof name === 'string' && name ? `${code} · ${name}` : '');
        const srcCode = copy ? v.record?.values['code'] : undefined;
        this.copySrc.set(typeof srcCode === 'string' ? srcCode : '');
        const st = v.record?.values['usagestatus'];
        this.origStatus.set(typeof st === 'string' && this.mode() !== 'create' ? st : '');
        this.confirming.set(false);
        this.tab.set('main');
        this.errors.set({});
        this.loose.set([]);
        this.failure.set(null);
        // โฟกัส : สำเนา = ช่องที่ต้องกรอกใหม่ (รหัส) ; ที่เหลือ = ช่องแรกที่กรอกได้
        const first = copy?.cleared[0];
        setTimeout(() => {
          const root = this.host.nativeElement;
          const target =
            (first ? root.querySelector<HTMLElement>(`[id="${this.uid}-${first.field}"]`) : null) ??
            root.querySelector<HTMLElement>('.mf-body input:not(:disabled), .mf-body select:not(:disabled), .mf-body textarea:not(:disabled), .mf-body button.seg-o:not(:disabled)');
          target?.focus();
        });
      });
    });
  }

  /** กลับไปหน้ารายการ — ถ้ามีค่าที่แก้ไว้แล้วยังไม่บันทึก ถามยืนยันก่อน (ดูอย่างเดียว/ฟอร์มที่เปิดไม่ได้ ออกได้เลย) */
  protected close(): void {
    if (this.saving()) return;
    if (!this.readOnly() && !this.blocked() && this.dirty()) {
      this.confirming.set(true);
      return;
    }
    this.closed.emit();
  }

  /** "กลับไปแก้ไข" — ปิดหน้ายืนยัน ค่าที่กรอกยังอยู่ */
  protected stay(): void {
    this.confirming.set(false);
  }

  /** "ทิ้งการแก้ไข" */
  protected discard(): void {
    this.confirming.set(false);
    this.closed.emit();
  }

  /** ใต้ช่องเลือกที่ Master ปลายทางยังไม่มีแถว release (เฉพาะตอนสร้าง) : ข้อความ + ขั้นที่ไปสร้างได้ (null = แจ้งผู้ตั้งค่าองค์กร) */
  protected refHint(f: ApiField): { title: string; step: string | null } | null {
    const target = f.reference?.table;
    if (this.mode() !== 'create' || !target || target === this.table()) return null;
    const miss = this.def()?.precheck?.missingReferences.find((r) => r.tableKey === target);
    return miss ? { title: miss.title, step: this.refStep()(target) } : null;
  }

  protected retry(): void {
    this.loaded.reload();
  }

  protected failureText(f: SettingsFailure): string {
    return failureMessage(this.t, f);
  }

  // ───────────────────────── ช่อง ─────────────────────────

  /**
   * ค่าที่แสดงในฟิลด์ระบบ : กลุ่มนิติบุคคล/นิติบุคคล = ของนิติบุคคลที่เลือก (API ส่งมาตอนเปิดฟอร์ม) · วันเวลา/ผู้ใช้ = จากแถวที่เปิด ; null = ยังไม่มี.
   * คัดลอกเป็นรายการใหม่ : แถวที่โหลดมาคือต้นฉบับ — รายการใหม่ยังไม่มีประวัติของตัวเอง จึงไม่แสดงเวลา/ผู้ใช้ของต้นฉบับ
   */
  protected sysText(f: ApiField): string | null {
    switch (f.system) {
      case 'ENTITYGROUP':
      case 'ENTITY':
        return f.shown ?? null;
      case 'ENTITY_SHARED':
        return this.t('app.settings.form.sysShared');
      default: {
        if (this.copying()) return null;
        const v = valueOf(this.loaded)?.record?.system?.[f.field];
        return v ? (f.type === 'timestamp' ? formatDateTime(v) : v) : null;
      }
    }
  }

  protected ctx(section: string): FieldContext {
    return { table: this.table(), section, entityId: this.entityId(), selfId: this.recordId() };
  }

  protected setMain(field: string, v: FieldValue): void {
    this.state.update((s) => (s ? { ...s, values: { ...s.values, [field]: v } } : s));
    this.clearError(mainPath(field));
  }

  protected setItem(section: string, row: number, field: string, v: FieldValue): void {
    this.state.update((s) => (s ? { ...s, items: { ...s.items, [section]: (s.items[section] ?? []).map((r, i) => (i === row ? { ...r, [field]: v } : r)) } } : s));
    this.clearError(itemPath(section, row, field));
  }

  protected addRow(sec: ApiSection): void {
    this.state.update((s) => (s ? { ...s, items: { ...s.items, [sec.key]: [...(s.items[sec.key] ?? []), blankRow(sec)] } } : s));
  }

  protected removeRow(sec: ApiSection, row: number): void {
    this.state.update((s) => (s ? { ...s, items: { ...s.items, [sec.key]: (s.items[sec.key] ?? []).filter((_, i) => i !== row) } } : s));
    // เลขแถวเลื่อน → ข้อผิดพลาดของแท็บนี้ที่ค้างอยู่ชี้ผิดแถว จึงล้างทั้งแท็บ
    this.errors.update((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith(`items.${sec.key}[`))));
  }

  protected rowsOf(sec: ApiSection): FormState['items'][string] {
    return this.state()?.items[sec.key] ?? [];
  }

  /** ข้อความผิดพลาดของช่อง (แปลงแล้ว) ; null = ไม่มี */
  protected errorOf(path: string, field: ApiField): string | null {
    const msgs = this.errors()[path];
    if (!msgs?.length) return null;
    return msgs.map((m) => fieldMessage(this.t, field, m, (k) => this.labelOf(k))).join(' · ');
  }

  // ───────────────────────── บันทึก ─────────────────────────

  protected async save(): Promise<void> {
    const def = this.def();
    const state = this.state();
    if (!def || !state || this.saving() || this.readOnly()) return;

    const missing = missingRequired(def, state);
    this.failure.set(null);
    this.loose.set([]);
    if (Object.keys(missing).length) {
      this.errors.set(Object.fromEntries(Object.entries(missing).map(([k, v]) => [k, [v]])));
      this.focusFirstError();
      return;
    }

    this.errors.set({});
    this.saving.set(true);
    try {
      const body = toWrite(def, state, this.entityId());
      const id = this.mode() === 'create' ? await this.api.create(this.table(), body) : await this.api.update(this.table(), this.recordId()!, body);
      this.saved.emit({ id, mode: this.mode(), code: typeof state.values['code'] === 'string' ? state.values['code'].trim() : '' });
    } catch (e) {
      const f = failureOf(e);
      if (f.key === 'app.settings.err.validation') {
        const placed = placeErrors(f.details);
        this.errors.set(placed.byPath);
        this.loose.set(placed.loose);
        this.failure.set(null);
        this.focusFirstError();
      } else {
        this.failure.set(f);
      }
    } finally {
      this.saving.set(false);
    }
  }

  private clearError(path: string): void {
    if (!this.errors()[path]) return;
    this.errors.update((e) => {
      const { [path]: _gone, ...rest } = e;
      return rest;
    });
  }

  /** หน้า "ลบ" : ลบแถวจริง (+ แถวแท็บย่อย) แล้วบอกหน้ารายการ ; ไม่ได้ (ถูกใช้อยู่ 409 · ไม่มีสิทธิ์ · ไม่พบ ฯลฯ) = แสดงเหตุผลบนหน้านี้ */
  protected async doDelete(): Promise<void> {
    const id = this.recordId();
    if (!id || this.saving()) return;
    this.failure.set(null);
    this.saving.set(true);
    try {
      await this.api.remove(this.table(), id, this.entityId());
      this.deleted.emit({ id, code: this.codeOfRow() });
    } catch (e) {
      this.failure.set(failureOf(e));
    } finally {
      this.saving.set(false);
    }
  }

  /** หน้า "ลบ" ของแถวที่ถูกใช้อยู่ : เปลี่ยนสถานะเป็น block แทน (PUT ค่าเดิมทั้งแถวยกเว้นสถานะ — ไม่ส่งแท็บ item จึงไม่แตะ) */
  protected async doBlock(): Promise<void> {
    const id = this.recordId();
    const def = this.def();
    const state = this.state();
    if (!id || !def || !state || this.saving()) return;
    this.failure.set(null);
    this.saving.set(true);
    try {
      const { items: _keep, ...body } = toWrite(def, { ...state, values: { ...state.values, usagestatus: 'block' } }, this.entityId());
      await this.api.update(this.table(), id, body);
      this.toBlocked.emit({ id, code: this.codeOfRow() });
    } catch (e) {
      this.failure.set(failureOf(e));
    } finally {
      this.saving.set(false);
    }
  }

  private codeOfRow(): string {
    const v = this.state()?.values['code'];
    return typeof v === 'string' ? v.trim() : '';
  }

  /** ชื่อไทยของช่องในแท็บหลักจาก key (ข้อความข้ามช่อง เช่น "ไม่ก่อน {วันที่เริ่ม}") */
  private labelOf(key: string): string {
    return this.mainFields().find((f) => f.field === key)?.label ?? key;
  }

  /** ไปแท็บของช่องผิดช่องแรก (ถ้ามีช่องผิดในข้อมูลหลักให้ข้อมูลหลักก่อน) แล้วโฟกัสช่องนั้น */
  private focusFirstError(): void {
    const paths = Object.keys(this.errors());
    const tabs = paths.map(tabOf);
    if (paths.length) this.tab.set(tabs.includes('main') ? 'main' : tabs[0]);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.mf-pane:not([hidden]) [aria-invalid="true"]')?.focus());
  }
}
