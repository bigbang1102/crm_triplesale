import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18n } from '@core/i18n/i18n.service';
import type { SupportingActionType, SupportingDocType } from '../supporting-doc-types';
import { SupportingDocForm } from './supporting-doc-form';

let created: string[] = [];

/** stand for the two real views (the big templates, the engines, PrimeFaces) — the route component only picks one and hands the address to it */
@Component({ selector: 'ts-stub-form', template: '<i class="stub">form {{ type().slug }} {{ id() }} {{ actionType() }}</i>' })
class StubForm {
  readonly type = input.required<SupportingDocType>();
  readonly id = input.required<string>();
  readonly actionType = input.required<SupportingActionType>();
  constructor() {
    created.push('form');
  }
}
@Component({ selector: 'ts-stub-form-7', template: '<i class="stub">form7 {{ type().slug }} {{ id() }} {{ actionType() }}</i>' })
class StubForm7 {
  readonly type = input.required<SupportingDocType>();
  readonly id = input.required<string>();
  readonly actionType = input.required<SupportingActionType>();
  constructor() {
    created.push('form7');
  }
}

describe('Supporting-document form route (/crm/supporting-docs/:type/:id)', () => {
  const lang = signal<'th' | 'en'>('th');
  let navigateByUrl: ReturnType<typeof vi.fn>;

  async function setup(inputs: { type?: string; id?: string; action_type?: string }) {
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigateByUrl } },
        { provide: I18n, useValue: { lang, t: (k: string) => k } },
      ],
    });
    const fixture = TestBed.createComponent(SupportingDocForm);
    // (the real views are big: the route component's loaders are given the stubs, before its effect runs)
    Object.assign(fixture.componentInstance as unknown as { views: unknown }, { views: { form: async () => StubForm, form7: async () => StubForm7 } });
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(navigateByUrl.mock.calls.length > 0 || fixture.nativeElement.querySelector('.stub')).toBeTruthy();
    });
    return fixture;
  }
  const text = (f: { nativeElement: HTMLElement }) => f.nativeElement.querySelector('.stub')?.textContent;

  beforeEach(() => {
    created = [];
    lang.set('th');
    navigateByUrl = vi.fn();
  });

  it('families 1 – 6 are one form', async () => {
    for (const slug of ['letter-of-intent', 'legal-credit-request', 'service-contract', 'loan-agreement', 'preliminary-credit-approval', 'property-project-contract']) {
      TestBed.resetTestingModule();
      created = [];
      const f = await setup({ type: slug, id: 'new' });
      expect(text(f)).toBe(`form ${slug} new add`);
      expect(created).toEqual(['form']);
    }
  });

  it('the credit application is the long form, loaded on its own', async () => {
    const f = await setup({ type: 'credit-application', id: '7005', action_type: 'edit' });
    expect(text(f)).toBe('form7 credit-application 7005 edit');
    expect(created).toEqual(['form7']);
  });

  it('`new` is add; an id is the read-only detail unless the query says edit', async () => {
    expect(text(await setup({ type: 'letter-of-intent', id: 'new' }))).toBe('form letter-of-intent new add');
    TestBed.resetTestingModule();
    expect(text(await setup({ type: 'letter-of-intent', id: '1008' }))).toBe('form letter-of-intent 1008 detail');
    TestBed.resetTestingModule();
    expect(text(await setup({ type: 'letter-of-intent', id: '1008', action_type: 'edit' }))).toBe('form letter-of-intent 1008 edit');
    TestBed.resetTestingModule();
    expect(text(await setup({ type: 'letter-of-intent', id: '1008', action_type: 'whatever' }))).toBe('form letter-of-intent 1008 detail');
  });

  it.each([undefined, 'nonsense'])('sends the family %j back to the hub, without a history entry', async (type) => {
    const f = await setup({ type, id: 'new' });
    expect(f.nativeElement.querySelector('.stub')).toBeNull();
    expect(navigateByUrl).toHaveBeenCalledWith('/crm/supporting-docs', { replaceUrl: true });
  });

  it('draws a fresh form when the mode of the address changes (detail → edit is another page)', async () => {
    const f = await setup({ type: 'letter-of-intent', id: '1008' });
    expect(created).toEqual(['form']);
    f.componentRef.setInput('action_type', 'edit');
    f.detectChanges();
    expect(created).toEqual(['form', 'form']);
    expect(text(f)).toBe('form letter-of-intent 1008 edit');
  });

  it('draws a fresh form when the language is switched (Java reloads the page)', async () => {
    const f = await setup({ type: 'letter-of-intent', id: 'new' });
    lang.set('en');
    f.detectChanges();
    TestBed.tick();
    f.detectChanges();
    expect(created).toEqual(['form', 'form']);
  });
});
