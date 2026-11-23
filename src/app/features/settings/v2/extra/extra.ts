import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SvFrame, SvPages } from '../shared/sv-frame';

/** แท็บของหมวด "โมดูลเสริม" — 1 แท็บ = 1 ไฟล์ในโฟลเดอร์นี้ */
export const EXTRA_PAGES: SvPages = {
  'partner': () => import('./partner').then((m) => m.PartnerStep),
  'coupon': () => import('./coupon').then((m) => m.CouponStep),
  'calendar': () => import('./calendar').then((m) => m.CalendarStep),
  'kpi': () => import('./kpi').then((m) => m.KpiStep),
};

@Component({
  selector: 'ts-settings-extra',
  imports: [SvFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ts-sv-frame phase='p5' [pages]="pages" />`,
})
export class SettingsExtra {
  protected readonly pages = EXTRA_PAGES;
}
