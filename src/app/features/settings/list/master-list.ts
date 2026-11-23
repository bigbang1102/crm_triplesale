import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, resource, signal } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { TsIcon } from '@shared/ui/icon/icon';
import { ToastService } from '@shared/ui/notify/toast.service';
import { MasterForm } from '../form/master-form';
import { ApiColumn, ApiRow, FormMode, SettingsApi } from '../settings.api';
import { SettingsFailure, failureMessage, failureOf } from '../settings.errors';
import { SettingsStore } from '../settings.store';
import { formatDate, formatDateTime, valueOf } from '../settings.util';

/** ฟอร์มที่เปิดอยู่ (modal) : สร้าง / แก้ไข / ดู ของตารางที่กำลังดู */
interface OpenForm {
  mode: FormMode;
  table: string;
  /** แถวที่แก้/ดู (null ตอนสร้าง) */
  id: string | null;
  /** แถวต้นฉบับที่คัดลอก (ตอนสร้างแบบ "คัดลอกเป็นรายการใหม่" ; อื่น ๆ = null) */
  copyFrom: string | null;
  /** 'delete' = หน้า "ลบ" ของแถว `id` (ฟอร์มตัวเดียวกัน mode = edit แต่แสดงหน้าลบ) */
  intent: 'delete' | null;
}

/** ตำแหน่งการดูรายการ (หน้า · คำค้น) ผูกกับ "นิติบุคคล + ตาราง" — เปลี่ยนตาราง/นิติบุคคลแล้วเริ่มที่หน้า 1 ไม่มีคำค้นโดยอัตโนมัติ */
interface Nav {
  key: string;
  page: number;
  /** ค่าที่ส่งให้ server (หน่วงหลังพิมพ์) */
  q: string;
  /** ข้อความในช่องค้นหา */
  typed: string;
}

const KNOWN_STATUS = new Set(['release', 'draft', 'block']);
const SEARCH_DELAY_MS = 300;
/** ความกว้างคอลัมน์มาตรฐานของทุกตาราง (mockup v28) : คอลัมน์ 1 · 2 · สถานะ · อื่น ๆ ; ข้อความยาวตัดด้วย … และมี tooltip */
const COL_FIRST = 180;
const COL_SECOND = 240;
const COL_STATUS = 120;
const COL_OTHER = 200;
const COL_ACT = 160;

/**
 * รายการของ Master 1 ตาราง จาก DB ล้วน ๆ — คอลัมน์ (`GET /master-tables/{t}`) + แถว (`…/records` ค้นหา/แบ่งหน้าที่ server)
 * + ปุ่ม สร้าง / ดู / แก้ไข (เปิดฟอร์ม) ; ใช้ร่วมกันทั้งหน้าหลักและหน้า v2.
 * คัดลอกเป็นรายการใหม่ = ฟอร์มสร้างที่ใส่ค่าของแถวต้นฉบับให้ (ไม่ต้องมี API เพิ่ม) ; ลบ = ถามยืนยันแล้ว `DELETE` ลบจริงออกจากตาราง (ลบถาวร) ; นำเข้า Excel ยังไม่เปิดใช้งาน (ปุ่มแสดงข้อความ). ไม่มีข้อมูลจำลองเลย ไม่รู้จักตารางใดเป็นพิเศษ.
 */
@Component({
  selector: 'ts-master-list',
  imports: [TsIcon, MasterForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:scroll)': 'tip.set(null)' },
  templateUrl: './master-list.html',
  styleUrl: './master-list.scss',
})
export class MasterList {
  private readonly api = inject(SettingsApi);
  private readonly store = inject(SettingsStore);
  private readonly toast = inject(ToastService);
  protected readonly t = inject(I18n).t;

  /** table_key ของตารางที่ดู ('' = ยังไม่มี → ไม่เรียก API) */
  readonly table = input.required<string>();
  readonly entityId = input.required<string>();
  /** ชื่อไทยของตาราง (ข้อความตอนว่าง "ยังไม่มี …" · breadcrumb ของหน้าฟอร์ม) */
  readonly title = input('');
  /** ชื่อขั้นตอนที่กำลังดู (breadcrumb ของหน้าฟอร์ม) */
  readonly stepTitle = input('');
  /** ฟอร์มสร้างไม่ได้เพราะขั้นก่อนหน้ายังไม่เสร็จ → ไปที่ขั้นนั้น */
  readonly goStep = output<string>();

  protected readonly form = signal<OpenForm | null>(null);

  private readonly key = computed(() => `${this.entityId()}|${this.table()}`);
  private readonly nav = signal<Nav>({ key: '', page: 1, q: '', typed: '' });
  private readonly cur = computed<Nav>(() => (this.nav().key === this.key() ? this.nav() : { key: this.key(), page: 1, q: '', typed: '' }));
  /** เรียงเอง (เฉพาะแถวที่โหลดมาในหน้านี้ — ไม่ส่งอะไรเพิ่มให้ API) ผูกกับ "นิติบุคคล + ตาราง" เหมือน nav */
  private readonly clientSort = signal<{ key: string; field: string; dir: 'asc' | 'desc' } | null>(null);
  protected readonly typed = computed(() => this.cur().typed);
  protected readonly searched = computed(() => this.cur().q);
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  /** มีนิติบุคคลให้ดึงแถวแล้วหรือยัง (คอลัมน์ไม่ต้องใช้นิติบุคคล — ตารางกับหัวคอลัมน์จึงแสดงได้เสมอ แถวค่อยตามมา) */
  protected readonly hasEntity = computed(() => !!this.entityId());
  /**
   * สิ่งที่ใช้ถามแถว — เทียบกันที่ "ค่า" ไม่ใช่ตัวอ็อบเจกต์ : พิมพ์ในช่องค้นหา (typed เปลี่ยน) ต้องไม่ทำให้ยิงคำขอใหม่จนกว่าคำค้นที่ส่งจริง (q) จะเปลี่ยน
   */
  private readonly recordsKey = computed(
    () => {
      const table = this.table();
      const entityId = this.entityId();
      return table && entityId ? { table, entityId, page: this.cur().page, q: this.cur().q } : undefined;
    },
    { equal: (a, b) => a === b || (!!a && !!b && a.table === b.table && a.entityId === b.entityId && a.page === b.page && a.q === b.q) },
  );
  /** คอลัมน์ของตาราง : ถามเมื่อมี table_key เท่านั้น ไม่ผูกกับนิติบุคคล */
  private readonly metaRes = resource({ params: () => this.table() || undefined, loader: ({ params }) => this.api.table(params) });
  private readonly recordsRes = resource({
    params: () => this.recordsKey(),
    loader: ({ params }) => this.api.records(params.table, { entityId: params.entityId, page: params.page, q: params.q }),
  });

  /** คอลัมน์ของตาราง (ไม่รวมคอลัมน์ปุ่ม — ปุ่มวาดเอง) */
  protected readonly columns = computed<ApiColumn[]>(() => (valueOf(this.metaRes)?.columns ?? []).filter((c) => c.type !== 'action'));
  /** แถวของหน้าที่ server ส่งมา ; ถ้าผู้ใช้กดเรียง → เรียงใหม่ตามข้อความที่แสดง (ไทย/ตัวเลข) */
  protected readonly rows = computed<ApiRow[]>(() => {
    const rows = valueOf(this.recordsRes)?.rows ?? [];
    const mine = this.clientSort();
    const col = mine && mine.key === this.key() ? this.columns().find((c) => c.field === mine.field) : undefined;
    if (!mine || !col) return rows;
    const sign = mine.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => this.cell(col, a).localeCompare(this.cell(col, b), 'th', { numeric: true }) * sign);
  });
  /** "แสดง x–y จาก N รายการ · หน้าละ P" + ปุ่ม ‹ 1 2 3 › ; null = ไม่มีแถว */
  protected readonly pageInfo = computed(() => {
    const m = valueOf(this.recordsRes)?.meta;
    if (!m || !m.total) return null;
    return {
      from: (m.page - 1) * m.perPage + 1,
      to: Math.min(m.page * m.perPage, m.total),
      total: m.total,
      perPage: m.perPage,
      page: m.page,
      totalPages: m.totalPages,
      hasPrev: m.page > 1,
      hasNext: m.page < m.totalPages,
    };
  });
  /** เลขหน้าที่แสดง (0 = "…") : ถ้าไม่เกิน 7 หน้าแสดงครบ ไม่งั้นหน้าแรก · หน้าสุดท้าย · หน้าปัจจุบัน ±1 */
  protected readonly pages = computed<number[]>(() => {
    const p = this.pageInfo();
    if (!p) return [];
    const last = p.totalPages;
    if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
    const keep = new Set([1, last, p.page - 1, p.page, p.page + 1].filter((n) => n >= 1 && n <= last));
    const out: number[] = [];
    let prev = 0;
    for (const n of [...keep].sort((a, b) => a - b)) {
      if (n - prev > 1) out.push(0);
      out.push(n);
      prev = n;
    }
    return out;
  });
  /** เรียงอยู่ตาม : ที่ผู้ใช้กด ไม่งั้นค่าเริ่มต้นของตาราง (`code,asc` — ลำดับที่ server ส่งมา) */
  private readonly sortNow = computed<{ field: string; dir: 'asc' | 'desc' } | null>(() => {
    const mine = this.clientSort();
    if (mine && mine.key === this.key()) return mine;
    const [field, dir] = (valueOf(this.metaRes)?.defaultSort ?? '').split(',').map((s) => s.trim());
    return field ? { field, dir: dir === 'desc' ? 'desc' : 'asc' } : null;
  });
  /** ความกว้างคอลัมน์ + ขั้นต่ำของทั้งตาราง (ถึงขั้นนี้แล้วเลื่อนแนวนอน) */
  protected readonly minWidth = computed(() => this.columns().reduce((sum, c, i) => sum + this.widthOf(c, i), COL_ACT));
  protected readonly busy = computed(() => this.metaRes.isLoading() || this.recordsRes.isLoading());
  protected readonly failure = computed<SettingsFailure | null>(() => {
    const e = this.metaRes.error() ?? this.recordsRes.error();
    return e ? failureOf(e) : null;
  });

  /** tooltip ของข้อความที่ถูกตัดด้วย … (ลอยใกล้เซลล์ที่ชี้) */
  protected readonly tip = signal<{ text: string; left: number; top: number } | null>(null);

  /** ขั้นที่ไปตั้งค่า Master ปลายทางได้ (ลิงก์ "ไปสร้าง" ใต้ช่องเลือกของฟอร์ม) */
  protected readonly refStep = (tableKey: string): string | null => this.store.stepOfTable(tableKey);

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => clearTimeout(this.searchTimer));
    // ฟอร์มเปิด = หน้าเต็ม : บอกกรอบของหน้า (แท็บหมวด · แถบขั้นตอน) ให้ซ่อนตัว ; ออกจากหน้านี้แล้วคืนค่า
    effect(() => this.store.fullPage.set(!!this.form()));
    destroyRef.onDestroy(() => this.store.fullPage.set(false));
  }

  /** ช่องค้นหา : ส่งให้ server หลังหยุดพิมพ์ ~0.3 วินาที (และกลับไปหน้า 1) */
  protected onSearch(value: string): void {
    const key = this.key();
    this.nav.set({ key, page: 1, q: this.cur().q, typed: value });
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.nav.update((n) => (n.key === key ? { ...n, q: value.trim(), page: 1 } : n)), SEARCH_DELAY_MS);
  }

  protected goPage(delta: number): void {
    const c = this.cur();
    this.nav.set({ ...c, page: Math.max(1, c.page + delta) });
  }

  protected setPage(page: number): void {
    this.nav.set({ ...this.cur(), page: Math.max(1, page) });
  }

  /** กดหัวคอลัมน์ที่เรียงได้ : คอลัมน์ใหม่ = น้อย→มาก ; คอลัมน์เดิม = สลับทิศ (เรียงแถวที่แสดงอยู่ในหน้านี้ ไม่เรียก API เพิ่ม) */
  protected toggleSort(c: ApiColumn): void {
    if (!c.sortable) return;
    const now = this.sortNow();
    const dir = now?.field === c.field && now.dir === 'asc' ? 'desc' : 'asc';
    this.clientSort.set({ key: this.key(), field: c.field, dir });
  }

  /** ▲ / ▼ ที่คอลัมน์ที่เรียงอยู่ ; ▲▼ = เรียงได้แต่ยังไม่ได้เรียงตามนี้ */
  protected sortMark(c: ApiColumn): string {
    const now = this.sortNow();
    return now?.field === c.field ? (now.dir === 'asc' ? '▲' : '▼') : '▲▼';
  }

  protected ariaSort(c: ApiColumn): 'ascending' | 'descending' | 'none' {
    const now = this.sortNow();
    return now?.field === c.field ? (now.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  protected isSorted(c: ApiColumn): boolean {
    return this.sortNow()?.field === c.field;
  }

  protected widthOf(c: ApiColumn, index: number): number {
    return index === 0 ? COL_FIRST : index === 1 ? COL_SECOND : c.field === 'usagestatus' ? COL_STATUS : COL_OTHER;
  }

  /** ชี้เซลล์ที่ข้อความถูกตัด (…) → แสดงข้อความเต็มเป็น tooltip */
  protected onTableOver(ev: MouseEvent): void {
    this.tip.set(null);
    const cell = (ev.target as HTMLElement).closest<HTMLElement>('td, th');
    if (!cell || cell.classList.contains('act') || cell.classList.contains('actc') || cell.classList.contains('fill')) return;
    if (cell.scrollWidth <= cell.clientWidth + 1) return;
    const text = (cell.textContent ?? '').replace(/[▲▼]/g, '').trim();
    if (!text) return;
    const r = cell.getBoundingClientRect();
    this.tip.set({ text, left: Math.max(8, Math.min(r.left, window.innerWidth - 428)), top: r.bottom + 6 });
  }

  protected reload(): void {
    this.metaRes.reload();
    this.recordsRes.reload();
  }

  protected failureText(f: SettingsFailure): string {
    return failureMessage(this.t, f);
  }

  /** ค่าในเซลล์ (server ประกอบ reference เป็น "รหัส · ชื่อ" และแปลง enum เป็นข้อความให้แล้ว) */
  protected cell(c: ApiColumn, row: ApiRow): string {
    const v = row[c.field];
    if (v === null || v === undefined || v === '') return '–';
    switch (c.type) {
      case 'boolean':
        return v === true ? '✓' : v === false ? '–' : String(v);
      case 'date':
        return formatDate(String(v));
      case 'datetime':
        return formatDateTime(String(v));
      default:
        return String(v);
    }
  }

  /** ป้ายสถานะ : แสดงค่าตามที่ server ส่ง (release / draft / block — เหมือน mockup v33 และเหมือนตัวเลือกสถานะในฟอร์ม) ; ค่ามาตรฐานได้สีของตัวเอง */
  protected statusBadge(row: ApiRow, field: string): { cls: string; text: string } {
    const v = String(row[field] ?? '');
    return { cls: KNOWN_STATUS.has(v) ? `badge b-${v}` : 'badge', text: v || '–' };
  }

  protected pending(): void {
    this.toast.info(this.t('app.settings.pendingForm'));
  }

  /** ปุ่ม "สร้าง" : เปิดฟอร์ม (ฟอร์มเรียก `GET …/form?mode=create` แล้วตรวจก่อนสร้างเอง ถ้าสร้างไม่ได้แสดงเหตุผลแทนฟอร์ม) */
  protected create(): void {
    if (!this.table() || !this.entityId()) return;
    this.form.set({ mode: 'create', table: this.table(), id: null, copyFrom: null, intent: null });
  }

  /** ปุ่ม "คัดลอกเป็นรายการใหม่" : เปิดฟอร์มสร้างที่ใส่ค่าของแถวนี้ให้ก่อน — บันทึกแล้วเป็นแถวใหม่ (POST) ไม่แตะแถวต้นฉบับ ; ตรวจสิทธิ์/ขั้นตอนก่อนหน้าเหมือนปุ่ม "สร้าง" */
  protected copyRow(row: ApiRow): void {
    if (!this.table() || !this.entityId()) return;
    this.form.set({ mode: 'create', table: this.table(), id: null, copyFrom: row.id, intent: null });
  }

  /**
   * ปุ่ม "ลบ" : เปิดหน้า "ลบ" ของแถว (mockup v33 : ใช้อยู่ → ลบไม่ได้ + รายการที่ใช้ + "เปลี่ยนเป็น block" ; ไม่ใช้ → ลบ) —
   * ฟอร์มตัวเดียวกัน (mode = edit) ที่แสดงหน้าลบ ; การลบจริงคือ `DELETE …/records/{id}?entityId=` (ลบถาวร พร้อมแถวแท็บย่อย)
   */
  protected remove(row: ApiRow): void {
    if (!this.table() || !this.entityId()) return;
    this.form.set({ mode: 'edit', table: this.table(), id: row.id, copyFrom: null, intent: 'delete' });
  }

  /** ลบสำเร็จ : กลับรายการ (ถ้าลบแถวสุดท้ายของหน้าที่ 2 ขึ้นไป ถอยไปหน้าก่อนหน้า ไม่ค้างหน้าว่าง) + โหลดความคืบหน้าขั้นตอนใหม่ */
  protected onDeleted(e: { id: string; code: string }): void {
    const p = this.pageInfo();
    this.form.set(null);
    this.toast.success(this.t('app.settings.delete.done', e.code));
    if (p && p.page > 1 && p.from === p.to) this.goPage(-1);
    else this.recordsRes.reload();
    void this.store.reloadSetup();
  }

  /** เปลี่ยนเป็น block สำเร็จ (แถวที่ถูกใช้อยู่) */
  protected onBlocked(e: { id: string; code: string }): void {
    this.form.set(null);
    this.toast.success(this.t('app.settings.delete.blocked', e.code));
    this.recordsRes.reload();
    void this.store.reloadSetup();
  }

  protected openRow(mode: 'view' | 'edit', row: ApiRow): void {
    this.form.set({ mode, table: this.table(), id: row.id, copyFrom: null, intent: null });
  }

  protected closeForm(): void {
    this.form.set(null);
  }

  /** "คัดลอก" ในฟอร์มโหมดดู → เปิดฟอร์มสร้างที่ใส่ค่าของแถวนี้ให้ (เหมือนไอคอนคัดลอกของแถว) */
  protected copyFromView(): void {
    this.form.update((f) => (f && f.id ? { mode: 'create', table: f.table, id: null, copyFrom: f.id, intent: null } : f));
  }

  /** "แก้ไข" ในฟอร์มโหมดดู → เปิดฟอร์มโหมดแก้ไขของแถวเดิม */
  protected switchToEdit(): void {
    this.form.update((f) => (f && f.id ? { ...f, mode: 'edit' } : f));
  }

  /**
   * บันทึกสำเร็จ : ปิดฟอร์ม โหลดรายการใหม่ แล้วโหลดความคืบหน้าขั้นตอนใหม่ (แถว release ใหม่อาจทำให้ขั้นเสร็จ/ปลดล็อกขั้นถัดไป) →
   * toast "บันทึก {รหัส} แล้ว" และถ้ามีขั้นที่เพิ่งปลดล็อก ต่อท้าย " · ตั้งค่า … ได้แล้ว" (ตาม mockup v33)
   */
  protected async onSaved(e: { code: string }): Promise<void> {
    this.form.set(null);
    this.recordsRes.reload();
    const unlocked = await this.store.reloadSetup();
    this.toast.success(
      !e.code ? this.t('app.settings.form.saved') : unlocked.length ? this.t('app.settings.form.savedUnlock', e.code, unlocked.join(', ')) : this.t('app.settings.form.savedCode', e.code),
    );
  }

  protected formGoStep(id: string): void {
    this.form.set(null);
    this.goStep.emit(id);
  }
}
