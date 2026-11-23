import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { SupportingDocFormBase } from './supporting-doc-form-base';
import { type FormEngineEnv } from './supporting-doc-form-base';
import { FORM_BINDINGS, FORM_ID, FORM_REMOTE, FORM_UPLOADS, FORM_WIDGETS } from './supporting-doc-form.meta';
import { startSupportingDocForm } from './supporting-doc-form.engine';

/**
 * The form of a supporting document, families 1 – 6 (`pages/sales_document_sub_1.xhtml` … `_6.xhtml`: six copies of one page): the generated template
 * (`supporting-doc-form.html`) and stylesheet, the page's scripts (`supporting-doc-form.engine.ts`), the PrimeFaces widgets, the bean — hosted by
 * `SupportingDocFormBase`.
 */
@Component({
  selector: 'ts-supporting-doc-form-view',
  templateUrl: './supporting-doc-form.html',
  // the order of the Java page: PrimeFaces' own stylesheets, the page's, then what the template says about the widgets
  styleUrls: ['../../../shared/primefaces/pf-theme.scss', './supporting-doc-form.scss', '../../../shared/primefaces/pf-template.scss'],
  // the Java CSS / engine / widgets rely on global selectors and on HTML strings they write
  encapsulation: ViewEncapsulation.None,
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-java-page': '' },
})
export class SupportingDocFormView extends SupportingDocFormBase {
  protected readonly meta = { bindings: FORM_BINDINGS, widgets: FORM_WIDGETS, uploads: FORM_UPLOADS, remote: FORM_REMOTE, formId: FORM_ID };
  protected startEngine(env: FormEngineEnv): () => void {
    return startSupportingDocForm(env);
  }
}
