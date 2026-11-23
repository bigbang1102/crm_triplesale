import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18n } from '@core/i18n/i18n.service';
import { ProspectExtraView } from './prospect-extra-view';

const lang = signal<'th' | 'en'>('th');
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Prospect extra-info tab (generated from the form, editable on the detail page)', () => {
  let fixture: ComponentFixture<ProspectExtraView>;
  const requests: { url: string; init?: RequestInit }[] = [];

  async function setup() {
    TestBed.configureTestingModule({ providers: [{ provide: I18n, useValue: { lang, t: (k: string) => k } }] });
    fixture = TestBed.createComponent(ProspectExtraView);
    document.body.appendChild(fixture.nativeElement);
    fixture.componentRef.setInput('id', '7');
    fixture.componentRef.setInput('request', async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      if (url.startsWith('/board/prospect?id=')) return json({ id: 7, sunProspectInfo: { csDescriptionProperty: 'บ้าน 2 ชั้น', csDesiredLoanAmount: '3000000' }, satisfaction: {} });
      if (url === '/board/prospect/save') return json({ ok: true });
      return json([]);
    });
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.nativeElement.querySelector('#ld2CsDescProperty')).toBeTruthy());
  }

  afterEach(() => {
    fixture?.destroy();
    fixture?.nativeElement.remove();
    requests.length = 0;
  });

  it('fills the fields from /board/prospect?id= and is not locked', async () => {
    await setup();
    const el: HTMLElement = fixture.nativeElement;
    await vi.waitFor(() => expect((el.querySelector('#ld2CsDescProperty') as HTMLInputElement).value).toBe('บ้าน 2 ชั้น'), { timeout: 4000 });
    expect(requests.some((r) => r.url === '/board/prospect?id=7')).toBe(true);
    expect(el.querySelector('#ld2TabExtra')!.classList.contains('ld2-locked')).toBe(false);
    expect((el.querySelector('#ld2CsDescProperty') as HTMLInputElement).disabled).toBe(false);
  });

  it('save() posts the fields of the tab to /board/prospect/save', async () => {
    await setup();
    const el: HTMLElement = fixture.nativeElement;
    await vi.waitFor(() => expect((el.querySelector('#ld2CsDescProperty') as HTMLInputElement).value).toBe('บ้าน 2 ชั้น'), { timeout: 4000 });
    (el.querySelector('#ld2CsDescProperty') as HTMLInputElement).value = 'คอนโด';
    await fixture.componentInstance.save();
    const post = requests.find((r) => r.url === '/board/prospect/save')!;
    expect(post.init?.method).toBe('POST');
    const body = JSON.parse(String(post.init?.body));
    expect(body.prospectId).toBe(7);
    expect(JSON.stringify(body)).toContain('คอนโด');
  });
});
