import { Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { I18n } from '@core/i18n/i18n.service';
import { ProspectForm, prospectActionType } from './prospect-form';
import { ProspectFormView } from './prospect-form-view';

const lang = signal<'th' | 'en'>('th');

/** stands in for the big view: the route component is about what it hands to it */
@Component({ selector: 'ts-prospect-form-view', template: '' })
class ViewStub {
  static created = 0;
  readonly id = input.required<string>();
  readonly actionType = input.required<string>();
  readonly pms = input<string | null>(null);
  constructor() {
    ViewStub.created++;
  }
}

describe('prospectActionType (the mode of the form)', () => {
  it('is add for a new prospect, whatever the query says', () => {
    expect(prospectActionType('new', undefined)).toBe('add');
    expect(prospectActionType('new', 'edit')).toBe('add');
    expect(prospectActionType(undefined, 'edit')).toBe('add');
  });

  it('is edit for any record: the read-only look is the detail page now (an old ?action_type=view link or a typed address opens it for editing)', () => {
    expect(prospectActionType('17', undefined)).toBe('edit');
    expect(prospectActionType('17', 'view')).toBe('edit');
    expect(prospectActionType('17', 'edit')).toBe('edit');
    expect(prospectActionType('17', 'list')).toBe('edit');
    expect(prospectActionType('17', 'add')).toBe('edit');
  });
});

describe('Prospect form route (/crm/prospects/:id)', () => {
  let fixture: ComponentFixture<ProspectForm>;

  function setup(id: string | undefined, actionType: string | undefined, pms?: string): void {
    ViewStub.created = 0;
    TestBed.configureTestingModule({ providers: [{ provide: I18n, useValue: { lang, t: (k: string) => k } }] });
    TestBed.overrideComponent(ProspectForm, { remove: { imports: [ProspectFormView] }, add: { imports: [ViewStub] } });
    fixture = TestBed.createComponent(ProspectForm);
    fixture.componentRef.setInput('id', id);
    fixture.componentRef.setInput('action_type', actionType);
    fixture.componentRef.setInput('pms', pms);
    fixture.detectChanges();
  }
  const view = () => fixture.debugElement.children[0]?.componentInstance as ViewStub | undefined;

  it('hands the address and the mode to the view', () => {
    setup('17', 'edit', 'detail');
    expect(view()?.id()).toBe('17');
    expect(view()?.actionType()).toBe('edit');
    expect(view()?.pms()).toBe('detail');
  });

  it('opens a new record for /new', () => {
    setup('new', 'add');
    expect(view()?.id()).toBe('new');
    expect(view()?.actionType()).toBe('add');
    expect(view()?.pms()).toBeNull();
  });

  it('starts the view again when the language changes (Java reloads the page on a language switch) and when the record changes', () => {
    lang.set('th');
    setup('17', 'view');
    expect(ViewStub.created).toBe(1);
    lang.set('en');
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    expect(ViewStub.created).toBe(2);
    fixture.componentRef.setInput('id', '18');
    fixture.detectChanges();
    expect(ViewStub.created).toBe(3);
    lang.set('th');
  });
});
