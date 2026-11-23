import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { I18n } from '@core/i18n/i18n.service';
import { QueueOwnerBar } from '@shared/ui/queue-owner/queue-owner-bar';
import { OpportunityDetailView } from './opportunity-detail-view';

/**
 * Lead detail route (`/crm/opportunities/:opportunityId?activityGroupId=`) — pages/lead_detail.xhtml (+ its modals). `FEATURE_CRM_Lead`, `CRM_Lead_View`
 * (the page itself asks for the features it needs for each button). A lead that has several activity groups is opened with the group it
 * was clicked in (`activityGroupId`): the page passes it on to the lead API.
 */
@Component({
  selector: 'ts-opportunity-detail',
  imports: [OpportunityDetailView, QueueOwnerBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a new view instance = a fresh page (Java: location.reload(), or another lead / group in the address)
  template: `
    <!-- who has the opportunity, and "change owner" / "return to the queue" (not part of the Java page: the queue is new) -->
    <ts-queue-owner-bar class="od-owner-bar" kind="opportunity" [id]="opportunityId()" />
    @for (k of [key()]; track k) {
      <ts-opportunity-detail-view [opportunityId]="opportunityId()" [activityGroupId]="activityGroupId()" (reload)="reload()" />
    }
  `,
  styles: `
    .od-owner-bar { margin: 10px 16px 0; }
  `,
})
export class OpportunityDetail {
  private readonly route = inject(ActivatedRoute);
  protected readonly opportunityId = toSignal(this.route.paramMap.pipe(map((p) => p.get('opportunityId') ?? '')), { initialValue: this.route.snapshot.paramMap.get('opportunityId') ?? '' });
  protected readonly activityGroupId = toSignal(this.route.queryParamMap.pipe(map((p) => p.get('activityGroupId') ?? '')), {
    initialValue: this.route.snapshot.queryParamMap.get('activityGroupId') ?? '',
  });
  protected readonly epoch = signal(0);
  protected readonly key = () => `${this.epoch()}|${this.opportunityId()}|${this.activityGroupId()}`;

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
