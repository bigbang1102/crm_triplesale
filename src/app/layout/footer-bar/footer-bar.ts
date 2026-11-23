import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConfigService } from '@core/config/config.service';
import { I18n } from '@core/i18n/i18n.service';

/**
 * Fixed 30 px footer: "© year PROJECT All Rights Reserved" · "version x" (12 px, #969696).
 * Same box as footer.xhtml (`.layout-footer` is a flex box in Pandora, padding 8px 40px at every width):
 * `left` = the main column's left edge (68px, 80px at ≤ 992px) and `width: 100%` (it deliberately runs past
 * the right edge, so the 40 px padding + the version's own 40 px padding put the text 12 px inside the
 * viewport), no border, a soft shadow instead. The left text sits in a block whose 175% strut makes the
 * row 22.75px tall, which the footer then centres — that is what puts the text 2px above a plain row.
 */
@Component({
  selector: 'ts-footer-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer>
      <div class="row">
        <div class="left">
          <span class="txt">{{ t('app.footer.rights', year, brand.projectEn) }}</span>
        </div>
        <span class="txt ver">{{ t('app.footer.version', brand.version) }}</span>
      </div>
    </footer>
  `,
  styles: `
    footer {
      position: fixed;
      bottom: 0;
      left: var(--ts-main-ml);
      z-index: var(--ts-z-footer);
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      height: var(--ts-footer-h);
      padding: 8px 40px;
      background: var(--ts-chrome-bg);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      color: var(--ts-text);
      font-size: 13px;
      letter-spacing: 0.26px;
      line-height: 175%;
    }
    .txt {
      color: var(--ts-text-disabled);
      font-size: 12px;
      font-weight: 400;
      line-height: normal;
    }
    .ver {
      display: block;
      padding-right: 40px;
    }
  `,
})
export class FooterBar {
  protected readonly t = inject(I18n).t;
  protected readonly brand = inject(ConfigService).value.branding;
  protected readonly year = new Date().getFullYear();
}
