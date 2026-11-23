import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { SalesDocFormBase, SalesDocFormEnv } from './sales-doc-form-base';
import { SALES_DOC_OB_NEEDS, startSalesDocOb } from './sales-doc-ob.engine';

/**
 * The form of the delivery note (ใบส่งสินค้า) — pages/sales_doc_ob_form.xhtml (generated: the template, the stylesheet and the engine; see sales-doc-form-base.ts for what the host does).
 */
@Component({
  selector: 'ts-sales-doc-ob-view',
  templateUrl: './sales-doc-ob.html',
  styleUrl: './sales-doc-ob.scss',
  // the Java CSS / engine rely on global selectors and on HTML strings written by the engine
  encapsulation: ViewEncapsulation.None,
  // whitespace between inline elements is part of the look (Java rendered the markup as written)
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // data-java-page: a page generated from a Java file keeps the cursor its own CSS gives a disabled button (the shell's rule in _base.scss skips it)
  host: { '(click)': 'onClick($event)', 'data-java-page': '' },
})
export class SalesDocObView extends SalesDocFormBase {
  protected readonly needs = SALES_DOC_OB_NEEDS;
  protected startEngine(env: SalesDocFormEnv): () => void {
    return startSalesDocOb(env);
  }
}
