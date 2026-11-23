import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject, signal } from '@angular/core';
import { DialogService } from '@shared/ui/notify/dialog.service';
import { TsIcon } from '@shared/ui/icon/icon';
import { LeadContactDialog } from './lead-contact-dialog';
import { LeadConvertDialog } from './lead-convert-dialog';
import { LeadFormDialog } from './lead-form-dialog';
import { LeadImportDialog } from './lead-import-dialog';
import { LeadAssignDialog } from './lead-assign-dialog';
import { LeadItemDialog } from './lead-item-dialog';
import { MASK } from './leads.access';
import { formatPhone } from './leads.format';
import { LeadsStore, dmy } from './leads.store';
import { LEAD_STATUSES, type ContactKind, type Lead, type LeadHistory, type LeadFilter, type LeadItem, type LeadSort, type LeadStatus } from './leads.types';

type DetailTab = 'general' | 'contacts' | 'extra';

const CONTACT_ICON: Readonly<Record<ContactKind, string>> = {
  note: 'fileText',
  callOut: 'phone',
  callIn: 'phone',
  sms: 'comments',
  email: 'mail',
  facebook: 'user',
  line: 'comments',
};

/**
 * เมนู Lead (`/crm/lead`) —รายชื่อผู้สนใจก่อนเป็นลูกค้าเป้าหมาย ตามดีไซน์ Figma "Triple Sales - Web App" › CRM › Lead:
 * รายการ + สถานะ + ค้นหา/กรอง/เรียง · แผงรายละเอียด (ข้อมูลทั่วไป / บันทึกการติดต่อ / ข้อมูลเพิ่มเติม) · เพิ่ม/แก้/ลบ · นำเข้า-ส่งออก CSV ·
 * บันทึกเป็นลูกค้าเป้าหมาย · สร้างโอกาสขาย. หน้าใหม่เขียนด้วยมือ (ไม่มี Java) — สไตล์ทั้งหมดอยู่ใต้ `ts-leads` ใน leads.scss.
 */
@Component({
  selector: 'ts-leads',
  imports: [TsIcon, LeadFormDialog, LeadImportDialog, LeadConvertDialog, LeadContactDialog, LeadItemDialog, LeadAssignDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  providers: [LeadsStore],
  host: { class: 'ts-ds ts-leads', '(document:keydown.escape)': 'escape()' },
  templateUrl: './leads.html',
  styleUrl: './leads.scss',
})
export class Leads {
  protected readonly store = inject(LeadsStore);
  private readonly dialogs = inject(DialogService);
  protected readonly t = this.store.t;
  protected readonly statuses = LEAD_STATUSES;
  protected readonly tabs: readonly DetailTab[] = ['general', 'contacts', 'extra'];
  protected readonly dmy = dmy;
  /** เบอร์สำหรับแสดง: ฟิลด์ที่ถูกปิดตามสิทธิ์ข้อมูลแสดงเป็น `***` ตามเดิม */
  protected readonly phone = (code: string, phone: string): string => (phone === MASK ? MASK : formatPhone(code, phone));

  /** รายการของคน หรือถังขยะ (เฉพาะผู้มี `Pipeline_Lead_Trash`) */
  protected readonly view = signal<'list' | 'trash'>('list');
  protected readonly tab = signal<DetailTab>('general');
  protected readonly searchOpen = signal(false);
  protected readonly filterOpen = signal(false);
  protected readonly statusOpen = signal(false);
  protected readonly addOpen = signal(false);

  /** ที่อยู่แบบย่อของรายการ: "เขต, จังหวัด" หรือ "-" */
  protected areaOf(l: Lead): string {
    return [l.district, l.province].filter(Boolean).join(', ') || l.address || '-';
  }

  protected contactIcon(kind: ContactKind): string {
    return CONTACT_ICON[kind];
  }

  protected val(e: Event): string {
    return (e.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected onSort(e: Event): void {
    this.store.sort.set(this.val(e) as LeadSort);
  }

  protected onSearch(e: Event): void {
    this.store.search.set(this.val(e));
  }

  protected toggleSearch(): void {
    if (this.searchOpen() && this.store.search() === '') this.closeSearch();
    else this.searchOpen.set(true);
  }

  protected closeSearch(): void {
    this.store.search.set('');
    this.searchOpen.set(false);
  }

  protected setFilter(patch: Partial<LeadFilter>): void {
    this.store.filter.update((f) => ({ ...f, ...patch }));
  }

  protected toggleSource(source: string): void {
    this.store.filter.update((f) => ({ ...f, sources: f.sources.includes(source) ? f.sources.filter((s) => s !== source) : [...f.sources, source] }));
  }

  protected clearFilter(): void {
    this.store.filter.set({ sources: [], ownerCode: '', dateFrom: '', dateTo: '' });
  }

  protected changeStatus(id: number, status: LeadStatus): void {
    this.statusOpen.set(false);
    void this.store.setStatus(id, status);
  }

  protected openItem(leadId: number, itemKind: LeadItem['kind']): void {
    this.addOpen.set(false);
    this.store.open({ kind: 'item', leadId, itemKind });
  }

  /** "บันทึกลูกค้าเป้าหมาย": ยืนยันก่อน (Lead จะถูกลบออกจากรายการ) แล้วเปิดหน้าต่างเลือกสายงาน/ทีม/ผู้รับผิดชอบ */
  protected async askConvert(leadId: number): Promise<void> {
    const ok = await this.dialogs.confirm({
      title: this.t('app.leads.confirmProspectTitle'),
      text: this.t('app.leads.confirmProspectText'),
      okText: this.t('app.leads.confirm'),
      cancelText: this.t('app.leads.notNow'),
    });
    if (ok) this.store.open({ kind: 'convert', mode: 'prospect', leadId });
  }

  protected showTrash(): void {
    this.store.select(null);
    this.view.set('trash');
  }

  protected showList(): void {
    this.view.set('list');
  }

  /** หนึ่งบรรทัดของประวัติการมอบหมาย เช่น "รับจากคิว · คิว → CS0002 ขวัญจิรา" */
  protected historyLine(h: LeadHistory): string {
    const who = (code: string): string => (code ? this.store.ownerName(code) : this.t('app.leads.queueName'));
    const move = h.action === 'queueIn' || h.action === 'trash' || h.action === 'restore' ? '' : ` ${who(h.fromCode)} → ${who(h.toCode)}`;
    const reason = h.reason ? ` — ${this.t('app.leads.reason')}: ${h.reason}` : '';
    return `${this.t('app.leads.hist.' + h.action)}${move}${reason}`;
  }

  protected escape(): void {
    // หน้าต่างย่อยอยู่บนสุด จึงปิดก่อนเมนู/ตัวกรองที่อยู่ข้างหลัง
    if (this.store.dialog()) this.store.open(null);
    else if (this.filterOpen()) this.filterOpen.set(false);
    else if (this.statusOpen()) this.statusOpen.set(false);
    else if (this.addOpen()) this.addOpen.set(false);
  }
}
