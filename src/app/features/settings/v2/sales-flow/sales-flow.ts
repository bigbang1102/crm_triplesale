import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SvFrame, SvPages } from '../shared/sv-frame';

/** แท็บของหมวด "ขั้นตอนการขาย" — 1 แท็บ = 1 ไฟล์ในโฟลเดอร์นี้ */
export const SALES_FLOW_PAGES: SvPages = {
  'actstatus': () => import('./actstatus').then((m) => m.ActstatusStep),
  'flow': () => import('./flow').then((m) => m.FlowStep),
  'oppsharinggroup': () => import('./oppsharinggroup').then((m) => m.OppsharinggroupStep),
  'opportunityconfig': () => import('./opportunityconfig').then((m) => m.OpportunityconfigStep),
  'waitlist': () => import('./waitlist').then((m) => m.WaitlistStep),
};

@Component({
  selector: 'ts-settings-sales-flow',
  imports: [SvFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ts-sv-frame phase='p2' [pages]="pages" />`,
})
export class SettingsSalesFlow {
  protected readonly pages = SALES_FLOW_PAGES;
}
