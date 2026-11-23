import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { SalesDocFormBase, SalesDocFormEnv } from './sales-doc-form-base';
import { SALES_DOC_BK_NEEDS, startSalesDocBk } from './sales-doc-bk.engine';

/**
 * The form of the booking (ใบจอง) — pages/sales_doc_bk_form.xhtml (generated: the template, the stylesheet and the engine; see sales-doc-form-base.ts for what the host does).
 */
@Component({
  selector: 'ts-sales-doc-bk-view',
  templateUrl: './sales-doc-bk.html',
  styleUrl: './sales-doc-bk.scss',
  // the Java CSS / engine rely on global selectors and on HTML strings written by the engine
  encapsulation: ViewEncapsulation.None,
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // data-java-page: a page generated from a Java file keeps the cursor its own CSS gives a disabled button (the shell's rule in _base.scss skips it)
  host: { '(click)': 'onClick($event)', 'data-java-page': '' },
})
export class SalesDocBkView extends SalesDocFormBase {
  protected readonly needs = SALES_DOC_BK_NEEDS;
  protected startEngine(env: SalesDocFormEnv): () => void {
    return startSalesDocBk(env);
  }
}
