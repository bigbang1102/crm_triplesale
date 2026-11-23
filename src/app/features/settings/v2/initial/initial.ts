import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SvFrame, SvPages } from '../shared/sv-frame';

/** แท็บของหมวด "ข้อมูลตั้งต้น (ACE)" — 1 แท็บ = 1 ไฟล์ในโฟลเดอร์นี้ */
export const INITIAL_PAGES: SvPages = {
  'entity': () => import('./entity').then((m) => m.EntityStep),
  'systemname': () => import('./systemname').then((m) => m.SystemnameStep),
  'channel': () => import('./channel').then((m) => m.ChannelStep),
  'movementtype': () => import('./movementtype').then((m) => m.MovementtypeStep),
  'typeset': () => import('./typeset').then((m) => m.TypesetStep),
  'instype': () => import('./instype').then((m) => m.InstypeStep),
  'calendartype': () => import('./calendartype').then((m) => m.CalendartypeStep),
};

@Component({
  selector: 'ts-settings-initial',
  imports: [SvFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ts-sv-frame phase='p0' [pages]="pages" />`,
})
export class SettingsInitial {
  protected readonly pages = INITIAL_PAGES;
}
