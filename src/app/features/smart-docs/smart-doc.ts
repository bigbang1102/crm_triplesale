import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  effect,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { I18n } from '@core/i18n/i18n.service';
import { currentLetterhead, letterheadLines } from '@core/mock/company-letterhead';
import { crmProspectCodes, mergeProspects, syncProspectsToCrm } from './smart-doc.crm';
import {
  type SmartDocApi,
  type SmartDocCompany,
  type SmartDocKey,
  startSmartDoc,
} from './smart-doc.engine';
import { SAVE_DELAY_MS, SAVE_EVENTS, SMART_DOC_ROUTE, smartDocKey } from './smart-doc.logic';
import { SMART_DOC_EN, SMART_DOC_EN_IN, SMART_DOC_KEEP_ATTRS } from './smart-doc.i18n';
import { englishPaper } from './smart-doc.print';
import { saveSmartDocs, savedSmartDocs } from './smart-doc.store';
import { PageTranslator, translator } from './smart-doc.translate';

/**
 * งานขาย › Smart Doc (`/sales/smart-doc/:doc`, doc = qt | so | do | rv): ใบเสนอราคา · ใบจอง · ใบส่งสินค้า · ใบรับเงิน as the BA designed
 * them (prototype v14 + BRD-SD v0.4 + field spec v1.3) — list (TRCloud-style: search, filters, approve / confirm, convert to the next
 * document, copy, print, e-mail, delete), the forms (two ways of keying), the pop-ups and the print view.
 *
 * `smart-doc.html` / `.css` / `.engine.ts` are GENERATED from the prototype by `tools/sync-smart-doc.mjs`. This host:
 *   - starts the script after the template is in the page, with the state saved in Datasource (`smart-doc.store.ts`);
 *   - keeps the URL and the shell's document menu in step with the document the script shows (one route, so switching documents
 *     keeps the component — a form filled from another document is not lost);
 *   - saves the script's data shortly after every user action that changed it;
 *   - makes the quotation's customers CRM's customers (`smart-doc.crm.ts`): the list comes from CRM, and what the quotation edits or
 *     creates goes back to CRM when the data is saved;
 *   - shows the page in English while the language is English (`smart-doc.translate.ts` over the prototype's Thai).
 */
@Component({
  selector: 'ts-smart-doc',
  templateUrl: './smart-doc.html',
  styleUrl: './smart-doc.css',
  // the generated CSS scopes itself under .smd-root; the script writes its HTML as strings
  encapsulation: ViewEncapsulation.None,
  // the prototype's markup is laid out with its spaces
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a generated page keeps the cursor its own CSS gives a disabled button (the shell's rule in _base.scss skips it)
  host: { 'data-java-page': '' },
})
export class SmartDoc {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly lang = inject(I18n).lang;
  private readonly english = new PageTranslator(
    this.host.nativeElement,
    translator(SMART_DOC_EN),
    SMART_DOC_KEEP_ATTRS,
    SMART_DOC_EN_IN,
  );
  private running?: { api: SmartDocApi; stop(): void };
  private lastSaved = '';
  /** the customer codes that were not CRM's when the page opened (the prototype's samples): they stay in Smart Doc */
  private localProspects: ReadonlySet<string> = new Set();
  private saveTimer?: ReturnType<typeof setTimeout>;
  private readonly onUserAction = (): void => {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persist(), SAVE_DELAY_MS);
  };

  constructor() {
    afterNextRender(() => this.start());
    this.route.paramMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => this.follow(smartDocKey(params.get('doc'))));
    // the language of the shell: the page follows (also what the script shows later)
    effect(() => this.english.setEnglish(this.lang() === 'en'));
    inject(DestroyRef).onDestroy(() => {
      this.stop();
      this.english.stop();
    });
  }

  private start(): void {
    const element = this.host.nativeElement;
    this.running = startSmartDoc({
      saved: savedSmartDocs(),
      user: this.auth.session()?.profileName ?? '',
      start: smartDocKey(this.route.snapshot.paramMap.get('doc')) ?? 'qt',
      prospects: (list) => mergeProspects(list),
      onDoc: (key) => this.showInUrl(key),
      company: () => companyOf(),
      englishPaper: (paper) => englishPaper(paper),
    });
    const state = this.running.api.state();
    const crm = crmProspectCodes();
    this.localProspects = new Set(
      prospectCodes(state['prospects']).filter((code) => !crm.has(code)),
    );
    this.lastSaved = JSON.stringify(state);
    for (const type of SAVE_EVENTS) element.addEventListener(type, this.onUserAction);
  }

  /** the shell's document menu (or the address bar) chose a document: open its list unless the script already shows it */
  private follow(key: SmartDocKey | undefined): void {
    if (!this.running || !key || key === this.running.api.current()) return;
    this.running.api.openList(key);
  }

  /** the script opened another document (convert to the next document, a related document …): the URL and the menu follow */
  private showInUrl(key: SmartDocKey): void {
    if (smartDocKey(this.route.snapshot.paramMap.get('doc')) === key) return;
    void this.router.navigate([SMART_DOC_ROUTE, key], { replaceUrl: true });
  }

  /** the script's data changed since the last save: keep it in Datasource, and the customers' changes in CRM */
  private persist(): void {
    if (!this.running) return;
    const state = this.running.api.state();
    const json = JSON.stringify(state);
    if (json === this.lastSaved) return;
    this.lastSaved = json;
    const prospects = state['prospects'];
    syncProspectsToCrm(Array.isArray(prospects) ? prospects : [], this.localProspects);
    saveSmartDocs(state);
  }

  private stop(): void {
    clearTimeout(this.saveTimer);
    if (!this.running) return;
    this.persist();
    for (const type of SAVE_EVENTS)
      this.host.nativeElement.removeEventListener(type, this.onUserAction);
    this.running.stop();
    this.running = undefined;
  }
}

/** the codes of the script's customer list (an unexpected value = none) */
function prospectCodes(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((p: unknown) => {
    const code = p && typeof p === 'object' ? (p as Record<string, unknown>)['code'] : undefined;
    return typeof code === 'string' ? [code] : [];
  });
}

/** the letterhead kept in the settings (นิติบุคคล › หัวกระดาษบริษัท) as the script shows it; none = the prototype's company */
function companyOf(): SmartDocCompany | null {
  const l = currentLetterhead();
  if (!l || !(l.nameTh || l.logo)) return null;
  return { name: l.nameTh, lines: letterheadLines(l), logo: l.logo, nameEn: l.nameEn };
}
