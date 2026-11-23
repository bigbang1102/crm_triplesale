import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18n } from '@core/i18n/i18n.service';
import { SUPPORTING_DOC_TYPES, type SupportingDocType } from '../supporting-doc-types';
import { SupportingDocList } from './supporting-doc-list';
import { SupportingDocListView } from './supporting-doc-list-view';

let created = 0;
/** stands for the real view (its template, the engine, PrimeFaces) — the route component only decides WHICH view and WHEN it is made again */
@Component({ selector: 'ts-supporting-doc-list-view', template: '<i class="stub">{{ type().slug }}</i>' })
class StubView {
  readonly type = input.required<SupportingDocType>();
  constructor() {
    created++;
  }
}

describe('Supporting-document list route (/crm/supporting-docs/:type)', () => {
  const lang = signal<'th' | 'en'>('th');
  let navigateByUrl: ReturnType<typeof vi.fn>;

  function setup(type: string | undefined) {
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigateByUrl } },
        { provide: I18n, useValue: { lang, t: (k: string) => k } },
      ],
    });
    TestBed.overrideComponent(SupportingDocList, { remove: { imports: [SupportingDocListView] }, add: { imports: [StubView] } });
    const fixture = TestBed.createComponent(SupportingDocList);
    fixture.componentRef.setInput('type', type);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    created = 0;
    lang.set('th');
    navigateByUrl = vi.fn();
  });

  it.each(SUPPORTING_DOC_TYPES.map((t) => t.slug))('shows the list of the family %s', (slug) => {
    const fixture = setup(slug);
    expect(fixture.nativeElement.querySelector('.stub')?.textContent).toBe(slug);
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'nonsense', 'LETTER-OF-INTENT'])('sends %j back to the hub, without a history entry', (type) => {
    const fixture = setup(type);
    expect(fixture.nativeElement.querySelector('.stub')).toBeNull();
    expect(navigateByUrl).toHaveBeenCalledWith('/crm/supporting-docs', { replaceUrl: true });
  });

  it('draws a fresh view when the language is switched (Java reloads the page), not on the first language', () => {
    const fixture = setup('letter-of-intent');
    expect(created).toBe(1);
    lang.set('en');
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    expect(created).toBe(2);
  });

  it('draws a fresh view when the address moves to another family', () => {
    const fixture = setup('letter-of-intent');
    fixture.componentRef.setInput('type', 'legal-credit-request');
    fixture.detectChanges();
    expect(created).toBe(2);
    expect(fixture.nativeElement.querySelector('.stub')?.textContent).toBe('legal-credit-request');
  });
});
