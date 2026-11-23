import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, inject, input, ViewEncapsulation } from '@angular/core';
import { I18n } from '@core/i18n/i18n.service';
import type { BasicBean } from '../../form/prospect-form-types';
import { startProspectExtra } from './prospect-extra.engine';

/**
 * The "ข้อมูลเพิ่มเติม" tab of a prospect (sub-tabs CS · PLS · LS · LE · CRM · ข้อมูลเพิ่มเติม · survey) — the pane of contracts_master_data.xhtml as the form
 * renders it. The template, the styles and the engine (`startProspectExtra`: GET /board/prospect?id= fills the fields, `window.ld2SaveCs()` posts them to
 * /board/prospect/save) are GENERATED (`npm run prospect-extra:sync`, tools/sync-prospect-extra.mjs); this host gives them what the form's host gave:
 * texts, the requests, sessionStorage, the provinces of the LS block, and `save()` for the button the page puts under the form.
 */
@Component({
  selector: 'ts-prospect-extra',
  templateUrl: './prospect-extra.html',
  styleUrl: './prospect-extra.scss',
  // the Java CSS / engine rely on global selectors and on HTML strings they write
  encapsulation: ViewEncapsulation.None,
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-java-page': '' },
})
export class ProspectExtraView {
  /** the id of the prospect */
  readonly id = input.required<string>();
  /** the requests of the page's script (the BFF contract: `/board/prospect` · `/board/prospect/save` · `/board/employees`) */
  readonly request = input.required<(input: string, init?: RequestInit) => Promise<Response>>();
  /** the provinces of the LS block (`bean.listProvinceBean` of the form) */
  readonly provinces = input<BasicBean[]>([]);

  protected readonly t = inject(I18n).t;

  constructor() {
    afterNextRender(() => {
      const stop = startProspectExtra({
        t: (k) => this.t(k),
        contractId: this.id(),
        fetch: (url, init) => this.request()(url, init),
        session: {
          getItem: (key) => {
            try {
              return sessionStorage.getItem(key);
            } catch {
              return null; // storage blocked
            }
          },
          setItem: (key, value) => {
            try {
              sessionStorage.setItem(key, value);
            } catch {
              /* storage blocked */
            }
          },
          removeItem: (key) => {
            try {
              sessionStorage.removeItem(key);
            } catch {
              /* storage blocked */
            }
          },
        },
      });
      inject(DestroyRef).onDestroy(stop);
    });
  }

  /** `ld2SaveCs()` of the script: posts every field of the tab (the promise settles when the answer is in; undefined when the prospect has no id) */
  save(): Promise<void> | undefined {
    return (window as unknown as { ld2SaveCs?: () => Promise<void> | undefined }).ld2SaveCs?.();
  }
}
