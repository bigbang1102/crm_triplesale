import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, ViewEncapsulation } from '@angular/core';
import { loadScript } from '@core/dom/load-script';
import { loadSwal } from '@core/dom/swal';
import { I18n } from '@core/i18n/i18n.service';
import type { AccessButtonCode } from '@core/permissions/access-buttons';
import { PermissionService } from '@core/permissions/permission.service';
import type { ProspectDoc } from '../../prospects.docs';
import { startProspectDocs } from './prospect-docs.engine';

type RemoteWindow = { rc_reloadProspectDocs?: () => void; rc_deleteProspectDoc?: (args: { name: string; value: string }[]) => void };

/**
 * The "เอกสารประกอบ" tab of a prospect (upload · list · download · delete) — the pane of contracts_master_data.xhtml as the form renders it. The template, the styles and the
 * engine (`startProspectDocs`: ctMdOnFilePicked → POST /board/prospect/attachments, ctMdDownloadDoc → /docproxy, ctMdDeleteDoc → confirm) are GENERATED
 * (`npm run prospect-docs:sync`, tools/sync-prospect-docs.mjs); this host gives them what the form's host gave: texts, SweetAlert, the requests, the attachment-type check
 * (`attach_file_types.js`), the permissions, and the two p:remoteCommand functions (`rc_reloadProspectDocs`, `rc_deleteProspectDoc`) as outputs of the page.
 */
@Component({
  selector: 'ts-prospect-docs',
  templateUrl: './prospect-docs.html',
  styleUrl: './prospect-docs.scss',
  // the Java CSS / engine rely on global selectors and on HTML strings they write
  encapsulation: ViewEncapsulation.None,
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-java-page': '' },
})
export class ProspectDocsView {
  /** the id of the prospect */
  readonly id = input.required<string>();
  /** the documents (`bean.prospectDocs`: the profile picture left out, newest first) */
  readonly docs = input<ProspectDoc[]>([]);
  /** the `accept` of the file input (`commonBean.uploadAcceptExt`) */
  readonly uploadAcceptExt = input<string>('');
  /** the requests of the page's script (the BFF contract: `/board/prospect/attachments` · `/docproxy`) */
  readonly request = input.required<(input: string, init?: RequestInit) => Promise<Response>>();
  /** `rc_reloadProspectDocs()`: the list is to be read again (after an upload) */
  readonly reload = output<void>();
  /** `rc_deleteProspectDoc([{ name: 'docNo', value }])`: this document is to be deleted (the user confirmed) */
  readonly remove = output<string>();

  protected readonly t = inject(I18n).t;
  private readonly perm = inject(PermissionService);

  constructor() {
    const win = window as unknown as RemoteWindow;
    let stop: (() => void) | undefined;
    let gone = false;
    inject(DestroyRef).onDestroy(() => {
      gone = true;
      stop?.();
      delete win.rc_reloadProspectDocs;
      delete win.rc_deleteProspectDoc;
    });
    afterNextRender(() => {
      // the scripts the Java page loaded for this tab: SweetAlert and the attachment-type check
      void Promise.all([loadSwal(), loadScript('assets/java-js/attach_file_types.js')]).then(([swal]) => {
        if (gone) return;
        win.rc_reloadProspectDocs = () => this.reload.emit();
        win.rc_deleteProspectDoc = (args) => this.remove.emit(String(args.find((a) => a.name === 'docNo')?.value ?? ''));
        stop = startProspectDocs({
          t: (k) => this.t(k),
          swal: (options) => Promise.resolve(swal(options)),
          contractId: this.id(),
          fetch: (url, init) => this.request()(url, init),
        });
      });
    });
  }

  /** `commonBean.hasFeature('A,B')` of the template */
  protected can(roles: string): boolean {
    return this.perm.has(roles);
  }

  /** `@if (access('PL-PR-DT-02'))`: the button registry (core/permissions/access-buttons.ts) — may the user use the button */
  protected access(code: string): boolean {
    return this.perm.canUse(code as AccessButtonCode);
  }
}
