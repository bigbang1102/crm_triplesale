import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18n } from '@core/i18n/i18n.service';
import { PermissionService } from '@core/permissions/permission.service';
import { SUPPORTING_DOC_ROLE_PREFIX } from '@core/permissions/roles';
import { SupportingDocs } from './supporting-docs';
import { SupportingDocsView } from './supporting-docs-view';

const lang = signal<'th' | 'en'>('th');
const FAMILIES = Object.entries(SUPPORTING_DOC_ROLE_PREFIX);

describe('Supporting documents hub (pages/supporting_documents.xhtml, generated)', () => {
  let fixture: ComponentFixture<SupportingDocs>;
  let el: HTMLElement;
  let allowed: Set<string> | 'all';
  let navigated: string[];

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...el.querySelectorAll<T>(sel)];
  const shown = () => $$('#sdTableBody tr[data-name]').filter((r) => r.style.display !== 'none').map((r) => r.dataset['name']);

  async function create(): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        { provide: I18n, useValue: { lang, t: (k: string) => k, use: async (l: 'th' | 'en') => lang.set(l) } },
        { provide: PermissionService, useValue: { has: (r: string) => allowed === 'all' || allowed.has(r) } },
        { provide: Router, useValue: { navigateByUrl: vi.fn(async (u: string) => (navigated.push(u), true)) } },
      ],
    });
    fixture = TestBed.createComponent(SupportingDocs);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    // the engine starts after the first render (afterNextRender)
    await vi.waitFor(() => expect(typeof (window as unknown as Record<string, unknown>)['sdOpen']).toBe('function'));
  }

  beforeEach(() => {
    lang.set('th');
    allowed = 'all';
    navigated = [];
  });
  afterEach(() => {
    fixture?.destroy();
    fixture?.nativeElement.remove();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('is the table of the seven document families, in the order of the Java page', async () => {
    await create();
    expect($('.ct-page-title').textContent).toBe('ข้อมูลประกอบ');
    expect(shown()).toEqual(['ใบเจตจำนงค์', 'ใบขอใช้บริการนิติกรรมและสินเชื่อ', 'Service Contract', 'สัญญาเงินกู้', 'ใบอนุมัติวงเงินเบื้องต้น', 'สัญญาโครงการอสังหาริมทรัพย์', 'ใบคำขอสินเชื่อ']);
    expect($$('.ct-no').map((n) => n.textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });

  it('a family is listed only with its CRM_Document_<Family>_View role', async () => {
    allowed = new Set([`${SUPPORTING_DOC_ROLE_PREFIX['loan-agreement']}_View`, `${SUPPORTING_DOC_ROLE_PREFIX['credit-application']}_View`]);
    await create();
    expect(shown()).toEqual(['สัญญาเงินกู้', 'ใบคำขอสินเชื่อ']);
  });

  it('every row opens the list of its family: the buttons are links of this app', async () => {
    await create();
    expect($$('a.ct-open-btn').map((a) => a.getAttribute('href'))).toEqual(FAMILIES.map(([type]) => `/crm/supporting-docs/${type}`));
  });

  it('a row calls sdOpen(route) (inline onclick, as in Java) and that goes to the family through the router, not a page load', async () => {
    await create();
    const row = $$('#sdTableBody tr[data-name]')[2];
    expect(row.getAttribute('onclick')).toBe("sdOpen('/crm/supporting-docs/service-contract')");
    // (the inline handler itself cannot run here: jsdom looks sdOpen up on its own Window, Vitest's `window` is globalThis — the browser run of the comparison harness covers the click)
    (window as unknown as { sdOpen: (u: string) => void }).sdOpen('/crm/supporting-docs/service-contract');
    expect(navigated).toEqual(['/crm/supporting-docs/service-contract']);
  });

  it('the "เปิดเอกสาร" button goes there through the router and the row does not fire a second time', async () => {
    await create();
    $$('a.ct-open-btn')[3].click();
    expect(navigated).toEqual(['/crm/supporting-docs/loan-agreement']);
  });

  it('the magnifier opens the search box; typing filters the rows by name; no match → the empty row; x closes and resets', async () => {
    await create();
    const box = $('#ldSearch');
    $('.ld-search-ic').click();
    expect(box.classList.contains('open')).toBe(true);
    const input = $<HTMLInputElement>('#ldSearchInput');
    input.value = 'สัญญา';
    input.dispatchEvent(new Event('input'));
    expect(shown()).toEqual(['สัญญาเงินกู้', 'สัญญาโครงการอสังหาริมทรัพย์']);
    expect($('#sdEmptyRow').style.display).toBe('none');
    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    expect(shown()).toEqual([]);
    expect($('#sdEmptyRow').style.display).toBe('');
    $('#ldSearchClear').click();
    expect(box.classList.contains('open')).toBe(false);
    expect(input.value).toBe('');
    expect(shown()).toHaveLength(7);
  });

  it('a language switch is a page reload in Java: a NEW page instance', async () => {
    await create();
    const first = fixture.debugElement.query(By.directive(SupportingDocsView)).componentInstance;
    lang.set('en');
    fixture.detectChanges();
    TestBed.tick?.();
    await vi.waitFor(() => expect(fixture.debugElement.query(By.directive(SupportingDocsView)).componentInstance).not.toBe(first));
  });

  it('leaving the page removes what it put on window', async () => {
    await create();
    const w = window as unknown as Record<string, unknown>;
    expect(typeof w['sdOpen']).toBe('function');
    fixture.destroy();
    expect(w['sdOpen']).toBeUndefined();
  });
});
