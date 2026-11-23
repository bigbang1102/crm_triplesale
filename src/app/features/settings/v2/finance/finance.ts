import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SvFrame, SvPages } from '../shared/sv-frame';

/** แท็บของหมวด "การเงินและทั่วไป" — 1 แท็บ = 1 ไฟล์ในโฟลเดอร์นี้ */
export const FINANCE_PAGES: SvPages = {
  'address': () => import('./address').then((m) => m.AddressStep),
  'currency': () => import('./currency').then((m) => m.CurrencyStep),
  'fiscalyears': () => import('./fiscalyears').then((m) => m.FiscalyearsStep),
  'payment': () => import('./payment').then((m) => m.PaymentStep),
  'product': () => import('./product').then((m) => m.ProductStep),
};

@Component({
  selector: 'ts-settings-finance',
  imports: [SvFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ts-sv-frame phase='p4' [pages]="pages" />`,
})
export class SettingsFinance {
  protected readonly pages = FINANCE_PAGES;
}
