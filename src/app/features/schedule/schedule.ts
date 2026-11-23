import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import { ScheduleView } from './schedule-view';

/**
 * Schedule route (`/crm/schedule`) — pages/schedule.xhtml + components/work_modal.xhtml (page=schedule). `FEATURE_CRM_Calendar`; the
 * appointments and tasks of the leads: the Calendar (year / month / week / day), the Board (a kanban per kind; moving a card changes the
 * status) and the List. The page itself needs `CRM_Schedule_View` to open an item, `CRM_Schedule_Create[_Sup]` to add one,
 * `CRM_Schedule_Edit` to change one and `CRM_Lead_View` for "go to the lead".
 *
 * The backend is chosen by the host (`schedule-view.ts`): the sample data in mock mode, the REST services (`schedule.live.ts`) otherwise.
 */
@Component({
  selector: 'ts-schedule',
  imports: [ScheduleView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a new view instance = a fresh page (Java: location.reload())
  template: `
    @for (n of [epoch()]; track n) {
      <ts-schedule-view (reload)="reload()" />
    }
  `,
})
export class Schedule {
  protected readonly epoch = signal(0);

  constructor() {
    // Java reloads the page on a language switch: the texts of the script are read from the bundle once, when it renders
    const i18n = inject(I18n);
    let first = true;
    effect(() => {
      i18n.lang();
      untracked(() => (first ? (first = false) : this.reload()));
    });
  }

  protected reload(): void {
    this.epoch.update((n) => n + 1);
  }
}
