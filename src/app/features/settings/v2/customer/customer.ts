import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SvFrame, SvPages } from '../shared/sv-frame';

/** แท็บของหมวด "ลูกค้าและการตลาด" — 1 แท็บ = 1 ไฟล์ในโฟลเดอร์นี้ */
export const CUSTOMER_PAGES: SvPages = {
  'leadstatus': () => import('./leadstatus').then((m) => m.LeadstatusStep),
  'customergroup': () => import('./customergroup').then((m) => m.CustomergroupStep),
  'marketing': () => import('./marketing').then((m) => m.MarketingStep),
  'custlists': () => import('./custlists').then((m) => m.CustlistsStep),
  'dataattributeroleconfig': () => import('./dataattributeroleconfig').then((m) => m.DataattributeroleconfigStep),
  'defperm': () => import('./defperm').then((m) => m.DefpermStep),
};

@Component({
  selector: 'ts-settings-customer',
  imports: [SvFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ts-sv-frame phase='p3' [pages]="pages" />`,
})
export class SettingsCustomer {
  protected readonly pages = CUSTOMER_PAGES;
}
