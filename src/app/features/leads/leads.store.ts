import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '@core/auth/auth.service';
import { I18n } from '@core/i18n/i18n.service';
import { canReceiveWork } from '@core/mock/role-store';
import type { DocKind } from '@core/permissions/role-model';
import { PermissionService } from '@core/permissions/permission.service';
import { DialogService } from '@shared/ui/notify/dialog.service';
import { ToastService } from '@shared/ui/notify/toast.service';
import {
  MASK,
  allowedStatuses,
  canRestoreLead,
  canSeeLead,
  canSeeQueued,
  keepMasked,
  leadActions,
  leadMenuActions,
  maskLead,
  maskedFields,
  needsReason,
  employeeCodeOfOwner,
  ownerCodeOf,
  type LeadActions,
  type LeadViewer,
} from './leads.access';
import { LeadsBackendProvider } from './leads.backend';
import { EXPORT_COLUMNS, importTemplateCsv, toCsv } from './leads.csv';
import { formatPhone } from './leads.format';
import {
  LEAD_OWNERS,
  type ContactKind,
  type ConvertForm,
  type ImportRow,
  type Lead,
  type LeadFilter,
  type LeadForm,
  type LeadItem,
  type LeadSort,
  type LeadStatus,
} from './leads.types';

export const EMPTY_FILTER: LeadFilter = { sources: [], ownerCode: '', dateFrom: '', dateTo: '' };

/** หน้าต่างที่เปิดอยู่ของหน้า Lead (หนึ่งหน้าต่างต่อครั้ง) */
export type LeadDialog =
  | { kind: 'form'; leadId: number | null }
  | { kind: 'import' }
  | { kind: 'convert'; mode: 'prospect' | 'opportunity'; leadId: number }
  | { kind: 'contact'; leadId: number }
  | { kind: 'item'; leadId: number; itemKind: LeadItem['kind'] }
  /** มอบหมาย: `give` = แจกใบในคิวให้คนอื่น · `change` = เปลี่ยนผู้รับผิดชอบของใบที่มีเจ้าของ */
  | { kind: 'assign'; mode: 'give' | 'change'; leadId: number };

const BANGKOK = 'Asia/Bangkok';

/** วันที่ `YYYY-MM-DD` และเวลา `HH:mm` ของวันนี้ ตามเวลาประเทศไทย (ไม่พึ่ง timezone ของเครื่อง) */
export function nowThai(date = new Date()): { date: string; time: string } {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: BANGKOK, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const t = new Intl.DateTimeFormat('en-GB', { timeZone: BANGKOK, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  return { date: d, time: t };
}

/** `2026-11-04` → `04/11/2026` */
export const dmy = (iso: string): string => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

/** สถานะและข้อมูลของหน้า Lead (หนึ่งชุดต่อหน้า) */
@Injectable()
export class LeadsStore {
  private readonly backend = inject(LeadsBackendProvider).backend;
  private readonly toast = inject(ToastService);
  private readonly dialogs = inject(DialogService);
  private readonly auth = inject(AuthService);
  private readonly perm = inject(PermissionService);
  readonly t = inject(I18n).t;

  /** ผู้ใช้ที่กำลังดู (สิทธิ์ + รหัสเจ้าของในผังของ Lead) — คำนวณใหม่เมื่อ session/สิทธิ์เปลี่ยน */
  readonly viewer = computed<LeadViewer>(() => ({
    ownerCode: ownerCodeOf(this.auth.session()?.employeeCode ?? ''),
    has: (key) => this.perm.has(key),
  }));
  /** ฟิลด์ที่ผู้ใช้ไม่มีสิทธิ์ข้อมูล จึงแสดงเป็น `***` (และค้นหา/แก้ไม่ได้) */
  readonly masked = computed(() => maskedFields(this.viewer()));
  readonly menu = computed(() => leadMenuActions(this.viewer()));

  readonly status = signal<LeadStatus | ''>('');
  readonly search = signal('');
  readonly sort = signal<LeadSort>('newest');
  readonly filter = signal<LeadFilter>(EMPTY_FILTER);
  readonly selectedId = signal<number | null>(null);
  readonly dialog = signal<LeadDialog | null>(null);

  /** เพิ่มทุกครั้งที่ข้อมูลเปลี่ยน — ให้ computed อ่านข้อมูลใหม่จาก mock */
  private readonly rev = signal(0);

  private readonly result = computed(() => {
    this.rev();
    const viewer = this.viewer();
    return this.backend.list({
      status: this.status(),
      search: this.search(),
      sort: this.sort(),
      // a viewer who may not see the source cannot narrow the list by it either: it would tell the hidden value (flow §9.2)
      filter: this.masked().includes('source') ? { ...this.filter(), sources: [] } : this.filter(),
      canSee: (lead) => canSeeLead(viewer, lead),
      searchContacts: !this.masked().some((f) => f === 'phone' || f === 'email'),
      scope: 'owned',
    });
  });
  /** ใบในคิว (Wait List) ที่ผู้ใช้เห็น เรียงเก่าสุดก่อน — ว่างเมื่อไม่มีสิทธิ์ดูคิว */
  readonly queueRows = computed(() => {
    this.rev();
    const viewer = this.viewer();
    if (!this.menu().queue) return [];
    return this.backend.list({ status: '', search: '', sort: 'oldest', filter: EMPTY_FILTER, scope: 'queue', canSee: (l) => canSeeQueued(viewer, l) }).rows.map((l) => maskLead(l, this.masked()));
  });
  /** ใบในถังขยะที่ผู้ใช้เห็น — ว่างเมื่อไม่มี `Pipeline_Lead_Trash` */
  readonly trashRows = computed(() => {
    this.rev();
    const viewer = this.viewer();
    if (!this.menu().trash) return [];
    return this.backend.list({ status: '', search: '', sort: 'newest', filter: EMPTY_FILTER, scope: 'trash', canSee: (l) => canRestoreLead(viewer, l) }).rows.map((l) => maskLead(l, this.masked()));
  });
  readonly rows = computed(() => this.result().rows.map((l) => maskLead(l, this.masked())));
  readonly counts = computed(() => this.result().counts);
  readonly sources = computed(() => {
    this.rev();
    return this.masked().includes('source') ? [] : this.backend.sources();
  });
  readonly selected = computed<Lead | null>(() => {
    this.rev();
    const id = this.selectedId();
    return id === null ? null : (this.leadOf(id) ?? null);
  });
  /** ปุ่มที่ใช้ได้กับใบที่เลือก */
  readonly actions = computed<LeadActions | null>(() => {
    const lead = this.selected();
    return lead ? leadActions(this.viewer(), lead) : null;
  });
  /** สถานะปลายทางที่เปลี่ยนให้ใบที่เลือกได้ */
  readonly statusChoices = computed(() => {
    const lead = this.selected();
    return lead ? allowedStatuses(this.viewer(), lead) : [];
  });
  readonly filterActive = computed(() => {
    const f = this.filter();
    return f.sources.length > 0 || f.ownerCode !== '' || f.dateFrom !== '' || f.dateTo !== '';
  });

  readonly owners = LEAD_OWNERS;
  /** who may be given a Lead: the owners whose position has View + Edit of a Lead (the minimum set of a receiver — BR-LDP-16) */
  readonly receivers = (kind: DocKind = 'lead'): typeof LEAD_OWNERS => LEAD_OWNERS.filter((o) => canReceiveWork(kind, employeeCodeOfOwner(o.code)));
  /** the owner a new Lead / import / conversion starts with: the user if they can receive that kind of document, else the first who can ('' = nobody can) */
  readonly defaultReceiver = (kind: DocKind = 'lead'): string => {
    const codes = this.receivers(kind).map((o) => o.code);
    const mine = ownerCodeOf(this.auth.session()?.employeeCode ?? '');
    return codes.includes(mine) ? mine : (codes[0] ?? '');
  };
  readonly ownerName = (code: string): string => {
    const o = LEAD_OWNERS.find((x) => x.code === code);
    return o ? `${o.code} ${o.name}` : code;
  };
  /** ผู้รับผิดชอบตั้งต้นของรายการใหม่ = ผู้ใช้ที่ล็อกอิน (ถ้าอยู่ในรายชื่อ) */
  readonly defaultOwner = (): string => {
    const mine = this.auth.session()?.employeeCode ?? '';
    return LEAD_OWNERS.some((o) => o.code === mine) ? mine : LEAD_OWNERS[0].code;
  };

  readonly statusLabel = (s: LeadStatus): string => this.t(`app.leads.status.${s}`);

  /** Lead ตาม id เฉพาะใบที่ผู้ใช้เห็น และปิดฟิลด์ลับแล้ว (ใบที่ไม่เห็น = ไม่พบ เหมือนไม่มีใบนั้น) */
  leadOf(id: number): Lead | undefined {
    this.rev();
    const lead = this.backend.get(id);
    return lead && canSeeLead(this.viewer(), lead) ? maskLead(lead, this.masked()) : undefined;
  }

  select(id: number | null): void {
    this.selectedId.set(id);
  }

  open(dialog: LeadDialog | null): void {
    this.dialog.set(dialog);
  }

  private changed(): void {
    this.rev.update((n) => n + 1);
  }

  /* ================================================================================================ writes */

  /** ผู้ทำรายการที่จดในประวัติ: รหัสเจ้าของในผังของ Lead ถ้ามี ไม่ก็รหัสพนักงาน */
  private actor(): string {
    return this.viewer().ownerCode || (this.auth.session()?.employeeCode ?? '');
  }

  private stamp(): string {
    const now = nowThai();
    return `${now.date} ${now.time}`;
  }

  async create(form: LeadForm): Promise<void> {
    if (!this.menu().create) return;
    // เบอร์ซ้ำกับใบที่ใช้งานอยู่ = เตือนอย่างเดียว บันทึกต่อได้ (flow §3.9) ; ใบที่ผู้ใช้มองไม่เห็นไม่เปิดเผยชื่อ (LD-69)
    const twins = this.backend.duplicatesOf(form.phone);
    if (twins.length) {
      const seen = twins.filter((l) => canSeeLead(this.viewer(), l));
      const text = seen.length === twins.length ? this.t('app.leads.dupText', seen.map((l) => `${l.name} (${l.code})`).join(', ')) : this.t('app.leads.dupHidden');
      const ok = await this.dialogs.confirm({ title: this.t('app.leads.dupTitle'), text, okText: this.t('app.leads.dupOk') });
      if (!ok) return;
    }
    const lead = this.backend.create(form, nowThai().date);
    this.changed();
    this.dialog.set(null);
    // ใบที่ส่งเข้าคิวไม่อยู่ในรายการของคน (ผู้บันทึกเองก็มองไม่เห็นถ้าไม่ได้เป็นสมาชิกคิว — flow LD-24)
    if (lead.ownerCode === '') {
      this.toast.success(this.t('app.leads.addedToQueue'));
      return;
    }
    this.selectedId.set(lead.id);
    this.toast.success(this.t('app.leads.added'));
  }

  update(id: number, form: LeadForm): void {
    const original = this.backend.get(id);
    if (!original || !leadActions(this.viewer(), original).edit) return;
    // เจ้าของเปลี่ยนผ่าน "เปลี่ยนผู้รับผิดชอบ" (`_Change_Assign`) เท่านั้น ไม่ใช่ผ่านฟอร์มแก้ไข
    this.backend.update(id, { ...keepMasked(form, original, this.masked()), ownerCode: original.ownerCode });
    this.changed();
    this.dialog.set(null);
    this.toast.success(this.t('app.leads.updated'));
  }

  /** เปลี่ยนสถานะด้วยมือ: ไป Disqualified / เปิดกลับ ต้องระบุเหตุผล (flow LD-17, LD-18) แล้วจดไว้เป็นบันทึกการติดต่อ */
  async setStatus(id: number, status: LeadStatus): Promise<void> {
    const lead = this.backend.get(id);
    if (!lead || !allowedStatuses(this.viewer(), lead).includes(status)) return;
    let reason = '';
    if (needsReason(lead.status, status)) {
      const typed = await this.dialogs.prompt({
        title: this.t('app.leads.reasonTitle', this.statusLabel(status)),
        placeholder: this.t('app.leads.reasonPlaceholder'),
        okText: this.t('app.leads.confirm'),
      });
      if (typed === null) return;
      reason = typed.trim();
      if (!reason) {
        this.toast.error(this.t('app.leads.reasonRequired'));
        return;
      }
    }
    if (!this.backend.setStatus(id, status)) return;
    if (reason) this.logNote(id, this.t('app.leads.reasonNote', this.statusLabel(status), reason));
    this.changed();
    this.toast.success(this.t('app.leads.statusChanged', this.statusLabel(status)));
  }

  /** บันทึกของระบบลงประวัติการติดต่อ (ไม่เปลี่ยนสถานะอีกครั้ง) */
  private logNote(id: number, text: string): void {
    const now = nowThai();
    this.backend.addContact(id, 'note', text, `${now.date} ${now.time}`, this.defaultOwner(), true);
  }

  async remove(lead: Lead): Promise<void> {
    if (!this.actions()?.trash) return;
    const ok = await this.dialogs.confirm({
      title: this.t('app.leads.deleteTitle'),
      text: this.t('app.leads.deleteText', lead.name),
      okText: this.t('app.leads.deleteOk'),
      danger: true,
    });
    if (!ok) return;
    this.backend.remove(lead.id, this.actor(), this.stamp());
    this.selectedId.set(null);
    this.changed();
    this.toast.success(this.t('app.leads.deleted'));
  }

  /** รับใบจากคิวให้ตัวเอง: ทีละใบ คนแรกได้ คนที่สองได้ "มีคนรับไปแล้ว" (flow LD-33–34) */
  take(id: number): void {
    if (!this.menu().take) return;
    if (!canReceiveWork('lead', this.auth.session()?.employeeCode ?? '')) {
      this.toast.error(this.t('app.leads.notReceiver'));
      return;
    }
    const got = this.backend.assign(id, 'take', this.viewer().ownerCode, this.actor(), this.stamp());
    this.changed();
    if (got) this.toast.success(this.t('app.leads.taken'));
    else this.toast.error(this.t('app.leads.alreadyTaken'));
  }

  /** แจกใบในคิว (`give`) หรือเปลี่ยนผู้รับผิดชอบ (`change`) ให้ `to` */
  assignTo(id: number, mode: 'give' | 'change', to: string, reason: string): void {
    const lead = this.backend.get(id);
    if (!lead || !LEAD_OWNERS.some((o) => o.code === to)) return;
    if (!this.receivers().some((o) => o.code === to)) {
      this.toast.error(this.t('app.leads.notReceiver'));
      return;
    }
    const allowed = mode === 'give' ? this.menu().give : leadActions(this.viewer(), lead).changeOwner;
    if (!allowed) return;
    const got = this.backend.assign(id, mode, to, this.actor(), this.stamp(), reason.trim());
    this.dialog.set(null);
    this.changed();
    if (got) this.toast.success(this.t(mode === 'give' ? 'app.leads.given' : 'app.leads.ownerChanged', this.ownerName(to)));
    else this.toast.error(this.t('app.leads.alreadyTaken'));
  }

  /** คืนเข้าคิว: ต้องบอกเหตุผล (flow LD-36) ; หลังคืน ใบออกจากรายการของเจ้าของเดิม */
  async returnToQueue(id: number): Promise<void> {
    const lead = this.backend.get(id);
    if (!lead || !leadActions(this.viewer(), lead).returnToQueue) return;
    const typed = await this.dialogs.prompt({ title: this.t('app.leads.returnTitle'), placeholder: this.t('app.leads.reasonPlaceholder'), okText: this.t('app.leads.confirm') });
    if (typed === null) return;
    if (!typed.trim()) {
      this.toast.error(this.t('app.leads.reasonRequired'));
      return;
    }
    if (!this.backend.returnToQueue(id, this.actor(), this.stamp(), typed)) return;
    this.selectedId.set(null);
    this.changed();
    this.toast.success(this.t('app.leads.returned'));
  }

  /** กู้คืนจากถังขยะ: ตรวจซ้ำก่อน ชนใบที่ใช้งานอยู่ = ไม่กู้ (flow §3.6) */
  restore(id: number): void {
    const lead = this.backend.getTrashed(id);
    if (!lead || !canRestoreLead(this.viewer(), lead)) return;
    const result = this.backend.restore(id, this.actor(), this.stamp());
    this.changed();
    if (result === 'ok') this.toast.success(this.t('app.leads.restored'));
    else this.toast.error(this.t(result === 'duplicate' ? 'app.leads.restoreDuplicate' : 'app.leads.alreadyTaken'));
  }

  importRows(rows: readonly ImportRow[], source: string, ownerCode: string): number {
    if (!this.menu().import) return 0;
    const added = this.backend.importRows(rows, source, ownerCode, nowThai().date);
    this.changed();
    this.dialog.set(null);
    this.toast.success(this.t('app.leads.imported', added));
    return added;
  }

  convert(id: number, mode: 'prospect' | 'opportunity', form: ConvertForm): void {
    const today = nowThai().date;
    const lead = this.backend.get(id);
    const allowed = lead ? leadActions(this.viewer(), lead) : null;
    if (!(mode === 'prospect' ? allowed?.convert : allowed?.opportunity)) return;
    const by = this.defaultOwner();
    if (mode === 'prospect') this.backend.convert(id, form, today, by);
    else this.backend.createOpportunity(id, form, today, by);
    this.dialog.set(null);
    this.changed();
    const queued = mode === 'prospect' && form.ownerCode === '';
    this.toast.success(this.t(queued ? 'app.leads.convertedToQueue' : mode === 'prospect' ? 'app.leads.converted' : 'app.leads.opportunityCreated'));
  }

  addContact(id: number, kind: ContactKind, text: string): void {
    const lead = this.backend.get(id);
    if (!lead || !leadActions(this.viewer(), lead).contact) return;
    const now = nowThai();
    this.backend.addContact(id, kind, text, `${now.date} ${now.time}`, this.defaultOwner());
    this.changed();
    this.dialog.set(null);
    this.toast.success(this.t('app.leads.contactAdded'));
  }

  addItem(id: number, item: Omit<LeadItem, 'id'>): void {
    const lead = this.backend.get(id);
    const allowed = lead ? leadActions(this.viewer(), lead) : null;
    if (!(item.kind === 'appointment' ? allowed?.appointment : allowed?.task)) return;
    this.backend.addItem(id, item);
    this.changed();
    this.dialog.set(null);
    this.toast.success(this.t('app.leads.itemAdded'));
  }

  /* ================================================================================================ files */

  /** ส่งออกรายการที่เห็นอยู่ (ตามสถานะ/ค้นหา/ตัวกรอง) เป็น CSV */
  exportCsv(): void {
    if (!this.menu().export) return;
    const rows = this.rows().map((l) => [dmy(l.createdDate), l.code, this.statusLabel(l.status), l.name, l.phone === MASK ? MASK : formatPhone(l.phoneCode, l.phone), l.email, l.source, [l.district, l.province].filter(Boolean).join(', '), this.ownerName(l.ownerCode)]);
    this.download(toCsv(EXPORT_COLUMNS, rows), `leads_${nowThai().date.replaceAll('-', '')}.csv`);
    this.toast.success(this.t('app.leads.exported', rows.length));
  }

  downloadTemplate(): void {
    this.download(importTemplateCsv(), 'lead_import_template.csv');
  }

  existingPhones(): { phone: string }[] {
    // ตรวจซ้ำกับทุกใบ (รวมที่ผู้ใช้มองไม่เห็น) แต่คืนเฉพาะเบอร์ให้ตัวตรวจ — ไม่บอกว่าเป็นใบของใคร
    return this.backend.list({ status: '', search: '', sort: 'newest', filter: EMPTY_FILTER }).rows.map((l) => ({ phone: l.phone }));
  }

  private download(text: string, name: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
}
