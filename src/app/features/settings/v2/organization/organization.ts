import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SvFrame, SvPages } from '../shared/sv-frame';

/** แท็บของหมวด "องค์กรและคน" — 1 แท็บ = 1 ไฟล์ในโฟลเดอร์นี้ */
export const ORGANIZATION_PAGES: SvPages = {
  'branch': () => import('./branch').then((m) => m.BranchStep),
  // FAST-DEBT(API): ขั้น role อยู่ในต้นไม้ของ mockup (settings.config.response.json) แต่ตาราง backoffice.menu ของ configmaster ยังไม่มี — ต้องเพิ่มก่อนใช้กับ API จริง · somyot · 2026-11-20
  'role': () => import('./role').then((m) => m.RoleStep),
  'org': () => import('./org').then((m) => m.OrgStep),
  'employee': () => import('./employee').then((m) => m.EmployeeStep),
  'salesteam': () => import('./salesteam').then((m) => m.SalesteamStep),
};

@Component({
  selector: 'ts-settings-organization',
  imports: [SvFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ts-sv-frame phase='p1' [pages]="pages" />`,
})
export class SettingsOrganization {
  protected readonly pages = ORGANIZATION_PAGES;
}
