import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { TsIcon } from '@shared/ui/icon/icon';
import { LeadDialogFrame } from './lead-dialog-frame';
import { checkImport, parseCsv } from './leads.csv';
import { formatPhone } from './leads.format';
import { LeadsStore } from './leads.store';
import { LEAD_SOURCES, type ImportRow } from './leads.types';

/** ขนาดไฟล์สูงสุดที่รับ (ไฟล์รายชื่อแบบข้อความ — เกินนี้ไม่ใช่ Template) */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const STATE_KEY: Readonly<Record<ImportRow['state'], string>> = {
  new: 'app.leads.import.stateNew',
  exists: 'app.leads.import.stateExists',
  duplicate: 'app.leads.import.stateDuplicate',
  noPhone: 'app.leads.import.stateNoPhone',
};

/** หน้าต่าง "นำเข้า CSV": เลือกไฟล์ → ตรวจแถว (ใหม่ / มีอยู่แล้ว / ซ้ำ / ไม่มีเบอร์) → เลือกแถวที่นำเข้า (เฉพาะแถวใหม่) */
@Component({
  selector: 'ts-lead-import-dialog',
  imports: [LeadDialogFrame, TsIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <ts-lead-dialog-frame [title]="t('app.leads.import.title')" [width]="1040" (closed)="store.open(null)">
      <button head type="button" class="ld-btn ld-btn-sm" (click)="store.downloadTemplate()"><ts-icon name="download" [size]="14" />{{ t('app.leads.import.template') }}</button>

      <div class="ld-import-file">
        <span class="ld-label">{{ t('app.leads.import.file') }}</span>
        <input class="ld-input" readonly [value]="fileName()" [placeholder]="t('app.leads.import.noFile')" [attr.aria-label]="t('app.leads.import.file')" />
        <button type="button" class="ld-btn ld-btn-outline" (click)="picker.click()"><ts-icon name="upload" [size]="16" />{{ t('app.leads.import.choose') }}</button>
        <input #picker type="file" accept=".csv,text/csv" hidden (change)="onFile($event)" />
      </div>
      @if (error()) { <p class="ld-err" role="alert">{{ error() }}</p> }

      <div class="ld-import-meta">
        <label class="ld-label" for="ld-imp-source">{{ t('app.leads.source') }}</label>
        <select id="ld-imp-source" class="ld-input ld-import-source" [value]="source()" (change)="onSource($event)">
          @for (s of sources; track s) { <option [value]="s">{{ s }}</option> }
        </select>
        <span class="ld-import-owner">
          <label class="ld-label" for="ld-imp-owner">{{ t('app.leads.owner') }}:</label>
          <select id="ld-imp-owner" class="ld-input ld-import-source" [value]="owner()" (change)="onOwner($event)">
            @if (store.menu().queue) { <option value="">{{ t('app.leads.queueOption') }}</option> }
            @for (o of store.receivers(); track o.code) { <option [value]="o.code">{{ o.code }} {{ o.name }}</option> }
          </select>
        </span>
      </div>

      @if (rows().length) {
        <div class="ld-import-sum">
          <h3>{{ t('app.leads.import.list', rows().length) }}</h3>
          <span class="ld-count ld-count-new">{{ t('app.leads.import.stateNew') }} <b>{{ counts().new }}</b></span>
          <span class="ld-count ld-count-dup">{{ t('app.leads.import.existsOrDup') }} <b>{{ counts().exists + counts().duplicate }}</b></span>
          <span class="ld-count ld-count-bad">{{ t('app.leads.import.incomplete') }} <b>{{ counts().noPhone }}</b></span>
        </div>
        <div class="ld-import-table">
          <table class="ld-table">
            <thead>
              <tr>
                <th class="ld-chk"><input type="checkbox" [checked]="allChosen()" [disabled]="!importable().length" [attr.aria-label]="t('app.leads.import.selectAll')" (change)="toggleAll()" /></th>
                <th>{{ t('app.leads.import.no') }}</th>
                <th>{{ t('app.leads.import.type') }}</th>
                <th>{{ t('app.leads.import.firstName') }}</th>
                <th>{{ t('app.leads.import.lastName') }}</th>
                <th>{{ t('app.leads.col.phone') }}</th>
                <th>{{ t('app.leads.col.address') }}</th>
                <th>{{ t('app.leads.item.status') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.no) {
                <tr [attr.data-state]="r.state">
                  <td class="ld-chk">
                    @if (r.state === 'new') {
                      <input type="checkbox" [checked]="chosen().has(r.no)" [attr.aria-label]="t('app.leads.import.selectRow', r.no)" (change)="toggle(r.no)" />
                    }
                  </td>
                  <td>{{ r.no }}</td>
                  <td>{{ t('app.leads.import.person') }}</td>
                  <td class="ld-name">{{ r.firstName || '-' }}</td>
                  <td class="ld-name">{{ r.lastName || '-' }}</td>
                  <td><span class="ld-phone"><span class="ld-ico"><ts-icon name="phone" [size]="14" /></span>{{ phoneOf(r) }}</span></td>
                  <td>{{ r.address || '-' }}</td>
                  <td><span class="ld-state" [attr.data-state]="r.state">{{ t(stateKey(r.state)) }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      <ng-container foot>
        <button type="button" class="ld-btn" (click)="store.open(null)">{{ t('app.common.cancel') }}</button>
        <button type="button" class="ld-btn ld-btn-primary" [disabled]="!chosen().size" (click)="submit()">{{ t('app.leads.import.submit', chosen().size) }}</button>
      </ng-container>
    </ts-lead-dialog-frame>
  `,
})
export class LeadImportDialog {
  protected readonly store = inject(LeadsStore);
  protected readonly t = this.store.t;
  protected readonly sources = LEAD_SOURCES;
  /** ผู้รับผิดชอบของรายชื่อที่นำเข้า (ว่าง = ส่งเข้า Wait List) */
  protected readonly owner = signal(this.store.defaultReceiver());

  protected readonly fileName = signal('');
  protected readonly error = signal('');
  protected readonly source = signal<string>(LEAD_SOURCES[0]);
  protected readonly rows = signal<readonly ImportRow[]>([]);
  protected readonly chosen = signal<ReadonlySet<number>>(new Set());

  protected readonly importable = computed(() => this.rows().filter((r) => r.state === 'new'));
  protected readonly allChosen = computed(() => this.importable().length > 0 && this.chosen().size === this.importable().length);
  protected readonly counts = computed(() => {
    const c: Record<ImportRow['state'], number> = { new: 0, exists: 0, duplicate: 0, noPhone: 0 };
    for (const r of this.rows()) c[r.state]++;
    return c;
  });

  protected stateKey(state: ImportRow['state']): string {
    return STATE_KEY[state];
  }

  protected phoneOf(r: ImportRow): string {
    return formatPhone('+66', r.phone);
  }

  protected onOwner(e: Event): void {
    this.owner.set((e.target as HTMLSelectElement).value);
  }

  protected onSource(e: Event): void {
    this.source.set((e.target as HTMLSelectElement).value);
  }

  protected async onFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.item(0);
    input.value = '';
    if (!file) return;
    this.fileName.set(file.name);
    this.rows.set([]);
    this.chosen.set(new Set());
    // the picker only offers .csv, but a file can still be dropped or chosen as "all files": only a .csv is read
    if (!/\.csv$/i.test(file.name)) {
      this.error.set(this.t('app.leads.import.errType'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      this.error.set(this.t('app.leads.import.errSize'));
      return;
    }
    const parsed = checkImport(parseCsv(await file.text()), this.store.existingPhones());
    if (!parsed.length) {
      this.error.set(this.t('app.leads.import.errEmpty'));
      return;
    }
    this.error.set('');
    this.rows.set(parsed);
    this.chosen.set(new Set(parsed.filter((r) => r.state === 'new').map((r) => r.no)));
  }

  protected toggle(no: number): void {
    this.chosen.update((set) => {
      const next = new Set(set);
      if (!next.delete(no)) next.add(no);
      return next;
    });
  }

  protected toggleAll(): void {
    this.chosen.set(this.allChosen() ? new Set() : new Set(this.importable().map((r) => r.no)));
  }

  /** when the action was last done: a second click that comes before the dialog is gone (a double click) must not do it again */
  private lastDoneAt = 0;
  private readonly justDone = (): boolean => Date.now() - this.lastDoneAt < 1000;

  protected submit(): void {
    const picked = this.rows().filter((r) => this.chosen().has(r.no));
    if (!picked.length || this.justDone()) return;
    this.lastDoneAt = Date.now();
    this.store.importRows(picked, this.source(), this.owner());
  }
}
