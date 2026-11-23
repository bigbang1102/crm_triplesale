import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { SupportingDocFormBase } from './supporting-doc-form-base';
import { type FormEngineEnv } from './supporting-doc-form-base';
import { FORM_BINDINGS, FORM_ID, FORM_REMOTE, FORM_UPLOADS, FORM_WIDGETS } from './supporting-doc-form-7.meta';
import { startSupportingDocForm7 } from './supporting-doc-form-7.engine';

/**
 * The form of the credit application (`pages/sales_document_sub_7.xhtml`: the borrower, the co-borrower and the guarantor — 270 fields, no documents
 * tab): the generated template (`supporting-doc-form-7.html`) and stylesheet, the page's scripts (`supporting-doc-form-7.engine.ts`, with the province →
 * district → sub-district drop-downs), the PrimeFaces widgets, the bean — hosted by `SupportingDocFormBase`.
 */
@Component({
  selector: 'ts-supporting-doc-form-7-view',
  templateUrl: './supporting-doc-form-7.html',
  // the order of the Java page: PrimeFaces' own stylesheets, the page's, then what the template says about the widgets
  styleUrls: ['../../../shared/primefaces/pf-theme.scss', './supporting-doc-form-7.scss', '../../../shared/primefaces/pf-template.scss'],
  encapsulation: ViewEncapsulation.None,
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-java-page': '' },
})
export class SupportingDocForm7View extends SupportingDocFormBase {
  protected readonly meta = { bindings: FORM_BINDINGS, widgets: FORM_WIDGETS, uploads: FORM_UPLOADS, remote: FORM_REMOTE, formId: FORM_ID };
  protected override readonly usesBoard = true;
  protected startEngine(env: FormEngineEnv): () => void {
    return startSupportingDocForm7(env);
  }
}
