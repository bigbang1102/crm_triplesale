import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ForecastTip } from './forecast-controls';
import { B, dateTime } from './forecast.format';
import { ForecastStore, STATUS_CHIP, STATUS_LABEL } from './forecast.store';

/** แท็บ Close Forecast Period — งวดทั้งปีของ Configuration พร้อม Target · Final ปัจจุบัน · Snapshot ตอนปิด (ต้นแบบ : `pClose()`) */
@Component({
  selector: 'ts-forecast-close',
  imports: [ForecastTip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ph">
      <div>
        <h1>Close Forecast Period<ts-forecast-tip k="pg_close" /></h1>
        <p>{{ t('app.forecast.close.sub') }}</p>
      </div>
    </div>
    @if (why(); as w) {
      <div class="note">{{ w }}</div>
    }
    <div class="tw">
      <table>
        <thead>
          <tr>
            <th>{{ t('app.forecast.col.periodName') }}</th>
            <th>Config</th>
            <th>{{ t('app.forecast.status') }}<ts-forecast-tip k="cl_status" /></th>
            <th class="n">Target</th>
            <th class="n">{{ t('app.forecast.close.finalNow') }}<ts-forecast-tip k="cl_live" /></th>
            <th class="n">{{ t('app.forecast.close.snapshot') }}<ts-forecast-tip k="cl_snap" /></th>
            <th>{{ t('app.forecast.close.closedBy') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (p of store.closeRows(); track p.start) {
            @let m = p.start.slice(0, 7);
            @let cf = store.cfgFor(m);
            <tr>
              <td>
                <b>{{ store.mName(m) }}</b>
              </td>
              <td>
                @if (cf.status === 'none') {
                  <span class="sub">{{ t('app.forecast.close.noConfig') }}</span>
                } @else {
                  {{ cf.code }} <span class="chip" [class]="STATUS_CHIP[cf.status]">{{ STATUS_LABEL[cf.status] }}</span>
                }
              </td>
              <td>
                @if (p.status === 'closed') {
                  <span class="chip c-bad">{{ t('app.forecast.close.closed') }}</span>
                } @else {
                  <span class="chip c-good">{{ t('app.forecast.close.open') }}</span>
                }
              </td>
              <td class="n">{{ B(p.target) }}</td>
              <td class="n">{{ B(p.finalNow) }}</td>
              <td class="n">{{ p.status === 'closed' && p.snapshotFinal != null ? B(p.snapshotFinal) : '—' }}</td>
              <td>
                @if (p.closedBy) {
                  {{ p.closedBy }}
                  <div class="sub">{{ dateTime(p.closedAt) }}</div>
                } @else {
                  —
                }
              </td>
              <td>
                @if (p.canReopen) {
                  <button type="button" class="btn btn-g btn-s" (click)="store.periodAsk(m, true)">{{ t('app.forecast.close.reopen') }}</button>
                } @else if (p.canClose) {
                  <button type="button" class="btn btn-p btn-s" (click)="store.periodAsk(m, false)">{{ t('app.forecast.close.close') }}</button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class ForecastClose {
  protected readonly store = inject(ForecastStore);
  protected readonly t = this.store.t;
  protected readonly B = B;
  protected readonly dateTime = dateTime;
  protected readonly STATUS_LABEL = STATUS_LABEL;
  protected readonly STATUS_CHIP = STATUS_CHIP;

  /** เหตุที่ไม่มีปุ่มปิดงวด */
  protected readonly why = computed(() => {
    const w = this.store.wsCfg();
    if (!this.store.perms().canClose) return this.t('app.forecast.close.whyRole');
    if (!this.store.cfgId()) return this.t('app.forecast.close.whyNew');
    if (w && w.status !== 'release') return this.t('app.forecast.close.whyStatus', w.code, STATUS_LABEL[w.status]);
    return '';
  });
}
