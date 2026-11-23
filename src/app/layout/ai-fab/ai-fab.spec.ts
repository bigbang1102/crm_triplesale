import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import { clearSessionUi } from '@core/dom/session-ui';
import { I18n } from '@core/i18n/i18n.service';
import { PAGES } from '@core/navigation/page-registry';
import { configStub } from '@core/testing/test-helpers';
import { AiFabView } from './ai-fab-view';

/** resources/mock/ai_menu.json of the Java project (public/assets/ai-menu.json, copied by tools/sync-ai-fab.mjs) */
const MENU = {
  items: [
    { id: 'ai-doc-translator', enabled: true, icon: 'fa-solid fa-language', accent: '#6043B6', label: { th: 'AI แปลเอกสาร', en: 'AI Document Translator' }, type: 'page', url: 'ai_translator.face?pid=1&page_id=15&act=15&navbar_menu=navbar_menu_ai' },
    { id: 'ai-help', enabled: true, icon: 'fa-solid fa-circle-question', accent: '#0D61CF', label: { th: 'สอบถามการใช้งาน', en: 'Help & Support' }, type: 'help' },
  ],
};

@Component({ template: '' })
class Blank {}

function setup(opts: { user?: string; lang?: 'th' | 'en'; menu?: unknown } = {}) {
  const lang = signal<'th' | 'en'>(opts.lang ?? 'th');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => (String(url).includes('ai-menu.json') ? new Response(JSON.stringify(opts.menu ?? MENU), { status: 200 }) : Promise.reject(new Error('offline')))),
  );
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'ai/translator', component: Blank, data: { page: PAGES.find((p) => p.id === 'ai-translator') } },
        { path: 'crm/opportunities', component: Blank, data: { page: PAGES.find((p) => p.id === 'opportunities') } },
        { path: 'crm/home', component: Blank },
      ]),
      { provide: ConfigService, useValue: configStub({ mock: true }) },
      { provide: AuthService, useValue: { session: signal({ username: opts.user ?? 'demo' }) } },
      { provide: I18n, useValue: { lang, t: (k: string) => k } },
    ],
  });
  return { lang, router: TestBed.inject(Router) };
}

async function mount(): Promise<{ fixture: ComponentFixture<AiFabView>; el: HTMLElement }> {
  const fixture = TestBed.createComponent(AiFabView);
  fixture.detectChanges();
  await fixture.whenStable();
  const el: HTMLElement = fixture.nativeElement;
  await vi.waitFor(() => expect(el.querySelectorAll('.ai-fab-item').length).toBeGreaterThan(0), { timeout: 3000 });
  return { fixture, el };
}

const q = <T extends HTMLElement = HTMLElement>(el: HTMLElement, sel: string) => el.querySelector<T>(sel)!;
const openHelp = (el: HTMLElement) => {
  q(el, '#aiFabBtn').click();
  el.querySelectorAll<HTMLElement>('.ai-fab-item')[1].click();
};
const rows = (el: HTMLElement) => [...el.querySelectorAll('.ai-help-row')];
const chips = (el: HTMLElement) => [...el.querySelectorAll('.ai-help-chip')].map((c) => c.textContent);
const ask = async (el: HTMLElement, text: string) => {
  const ta = q<HTMLTextAreaElement>(el, '#aiHelpTa');
  ta.value = text;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  q(el, '#aiHelpSend').click();
};

describe('AI floating button + help assistant', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    document.title = '';
  });

  it('draws the menu from assets/ai-menu.json in the language of the user and opens / closes it', async () => {
    setup();
    const { fixture, el } = await mount();
    expect([...el.querySelectorAll('.ai-fab-label')].map((l) => l.textContent)).toEqual(['AI แปลเอกสาร', 'สอบถามการใช้งาน']);
    expect(el.querySelector('.ai-fab-item .fa-language')).toBeTruthy();
    const root = q(el, '#aiFabRoot');
    const btn = q(el, '#aiFabBtn');
    expect(root.classList.contains('is-open')).toBe(false);

    btn.click();
    expect(root.classList.contains('is-open')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(root.classList.contains('is-open')).toBe(false);
    btn.click();
    document.body.click(); // a click outside closes it too
    expect(root.classList.contains('is-open')).toBe(false);
    fixture.destroy();
  });

  it('falls back to the built-in menu when the item file cannot be read, so the button always works', async () => {
    setup();
    (globalThis.fetch as any).mockImplementation(async () => new Response('nope', { status: 404 }));
    const { fixture, el } = await mount();
    expect([...el.querySelectorAll('.ai-fab-label')].map((l) => l.textContent)).toEqual(['AI แปลเอกสาร', 'สอบถามการใช้งาน']);
    fixture.destroy();
  });

  it('the English labels are used when the language is English', async () => {
    setup({ lang: 'en' });
    const { fixture, el } = await mount();
    expect([...el.querySelectorAll('.ai-fab-label')].map((l) => l.textContent)).toEqual(['AI Document Translator', 'Help & Support']);
    fixture.destroy();
  });

  it('a menu item of type "page" navigates to the route that replaces the Java page', async () => {
    const { router } = setup();
    const { fixture, el } = await mount();
    q(el, '#aiFabBtn').click();
    el.querySelectorAll<HTMLElement>('.ai-fab-item')[0].click();
    await vi.waitFor(() => expect(router.url).toBe('/ai/translator'));
    expect(q(el, '#aiFabRoot').classList.contains('is-open')).toBe(false);
    fixture.destroy();
  });

  it('opens the help window: greets once, shows the quick questions of the page, Esc closes the window before the menu', async () => {
    const { router } = setup();
    await router.navigateByUrl('/ai/translator');
    const { fixture, el } = await mount();
    const help = q(el, '#aiHelp');
    expect(help.classList.contains('show')).toBe(false);

    openHelp(el);
    expect(help.classList.contains('show')).toBe(true);
    expect(help.getAttribute('aria-hidden')).toBe('false');
    expect(rows(el)).toHaveLength(1);
    expect(rows(el)[0].textContent).toContain('สวัสดีครับ');
    // "how do I use this page" first, then the page's own questions (ai_translator), then the general ones — 6 at most
    expect(chips(el)).toEqual(['หน้านี้ใช้งานยังไง', 'เปิดใบงานแปลใหม่ยังไง', 'สั่งแปลยังไง', 'อนุมัติงานแปลยังไง', 'ปิดงานแปลยังไง', 'ระบบนี้มีเมนูอะไรบ้าง']);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(help.classList.contains('show')).toBe(false);
    openHelp(el);
    expect(rows(el)).toHaveLength(1); // no second greeting
    fixture.destroy();
  });

  it('asks the assistant with the page the user is on and writes its answer: **bold**, `code`, bullets, the figure of the manual', async () => {
    const { router } = setup();
    await router.navigateByUrl('/ai/translator');
    document.title = 'AI แปลเอกสาร · Triple Sale'; // the Angular title strategy; Java writes "… | Triple Sale"
    const { fixture, el } = await mount();
    openHelp(el);

    el.querySelector<HTMLElement>('.ai-help-chip')!.click(); // "หน้านี้ใช้งานยังไง"
    expect(rows(el).at(-2)?.classList.contains('me')).toBe(true); // the question, then the dots until the answer is there
    expect(el.querySelector('.ai-help-typing')).toBeTruthy();
    await vi.waitFor(() => expect(el.querySelector('.ai-help-typing')).toBeNull(), { timeout: 3000 });

    const bubble = rows(el).at(-1)!.querySelector('.ai-help-bubble')!;
    expect(bubble.querySelector('b')?.textContent).toBe('AI แปลเอกสาร'); // pageTitle, without the " · Triple Sale" tail
    expect(bubble.querySelector('code.ai-help-code')?.textContent).toBe('ai_translator.face'); // the Java page of the route
    expect(bubble.querySelectorAll('.ai-help-li')).toHaveLength(3);
    expect(bubble.querySelector('a[target="_blank"] img.ai-help-fig')?.getAttribute('src')).toBe('assets/help-mock/chat-layout.svg');

    // remembered for this tab and this user, text only (never HTML)
    const saved = JSON.parse(sessionStorage.getItem('ai_help_chat')!);
    expect(saved).toMatchObject({ u: 'demo', o: true, g: true });
    expect(saved.m.map((m: any) => m.w)).toEqual(['bot', 'me', 'bot']);
    expect(saved.m[2].i).toEqual(['chat-layout.svg']);
    expect(saved.m[2].t).toContain('**AI แปลเอกสาร**');
    fixture.destroy();
  });

  it('when the assistant cannot be reached it says so and answers from the built-in knowledge base', async () => {
    setup();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { fixture, el } = await mount();
    openHelp(el);
    await ask(el, 'ทดสอบล่ม');
    await vi.waitFor(() => expect(el.querySelector('.ai-help-typing')).toBeNull(), { timeout: 3000 });
    const text = rows(el).at(-1)!.textContent!;
    expect(text).toContain('ตอนนี้ติดต่อผู้ช่วยไม่ได้');
    expect(text).toContain('ขออภัยครับ ยังไม่มีคำตอบของคำถามนี้');
    fixture.destroy();
  });

  it('Enter sends, Shift+Enter does not; the send button waits for text', async () => {
    setup();
    const { fixture, el } = await mount();
    openHelp(el);
    const send = q<HTMLButtonElement>(el, '#aiHelpSend');
    const ta = q<HTMLTextAreaElement>(el, '#aiHelpTa');
    expect(send.disabled).toBe(true);
    ta.value = 'เมนูอะไรบ้าง';
    ta.dispatchEvent(new Event('input'));
    expect(send.disabled).toBe(false);
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
    expect(rows(el)).toHaveLength(1);
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(rows(el)).toHaveLength(3); // + the question + the dots
    expect(ta.value).toBe('');
    await vi.waitFor(() => expect(el.querySelector('.ai-help-typing')).toBeNull(), { timeout: 3000 });
    fixture.destroy();
  });

  it('comes back as it was after a reload — only for the user it belongs to', async () => {
    const state = { u: 'demo', o: true, n: false, g: true, m: [{ w: 'bot', t: 'สวัสดีครับ', i: [] }, { w: 'me', t: 'ถามอะไรสักอย่าง', i: [] }] };
    sessionStorage.setItem('ai_help_chat', JSON.stringify(state));
    setup();
    const mounted = await mount();
    expect(q(mounted.el, '#aiHelp').classList.contains('show')).toBe(true);
    expect(rows(mounted.el).map((r) => r.textContent)).toEqual(['สวัสดีครับ', 'ถามอะไรสักอย่าง']);
    mounted.fixture.destroy();
    TestBed.resetTestingModule();

    sessionStorage.setItem('ai_help_chat', JSON.stringify({ ...state, u: 'someone-else' }));
    setup();
    const other = await mount();
    expect(q(other.el, '#aiHelp').classList.contains('show')).toBe(false);
    expect(rows(other.el)).toHaveLength(0);
    expect(sessionStorage.getItem('ai_help_chat')).toBeNull(); // the previous person's chat is dropped, not kept
    other.fixture.destroy();
  });

  it('rebuilds the quick questions when the page changes (Java built them once per page load)', async () => {
    const { router } = setup();
    await router.navigateByUrl('/crm/opportunities');
    const { fixture, el } = await mount();
    openHelp(el);
    expect(chips(el).slice(0, 2)).toEqual(['หน้านี้ใช้งานยังไง', 'ย้ายสถานะ Lead บนบอร์ดยังไง']);
    await router.navigateByUrl('/ai/translator');
    await vi.waitFor(() => expect(chips(el)[1]).toBe('เปิดใบงานแปลใหม่ยังไง'));
    await router.navigateByUrl('/crm/home'); // a page the table does not know: the general questions only
    await vi.waitFor(() => expect(chips(el)).toEqual(['หน้านี้ใช้งานยังไง', 'ระบบนี้มีเมนูอะไรบ้าง', 'เข้าเมนูที่ต้องการไม่ได้', 'หาคู่มือได้ที่ไหน']));
    fixture.destroy();
  });

  it('signing out forgets the chat; the window.aiHelpForget hook goes away with the view', async () => {
    setup();
    const { fixture, el } = await mount();
    openHelp(el);
    await ask(el, 'เมนูอะไรบ้าง');
    await vi.waitFor(() => expect(el.querySelector('.ai-help-typing')).toBeNull(), { timeout: 3000 });
    expect(sessionStorage.getItem('ai_help_chat')).toBeTruthy();

    clearSessionUi(); // AuthService.logout() — template.xhtml clearSessionUi()
    expect(sessionStorage.getItem('ai_help_chat')).toBeNull();

    fixture.destroy();
    expect(window.aiHelpForget).toBeUndefined();
    // with no view running the key is removed directly
    sessionStorage.setItem('ai_help_chat', '{}');
    clearSessionUi();
    expect(sessionStorage.getItem('ai_help_chat')).toBeNull();
  });

  it('destroy stops everything: no listener of the view reacts and a late answer does not draw', async () => {
    setup();
    const { fixture, el } = await mount();
    openHelp(el);
    await ask(el, 'เมนูอะไรบ้าง');
    fixture.destroy(); // while the answer is still on its way
    await new Promise((r) => setTimeout(r, 500));
    expect(el.querySelector('.ai-help-typing')).not.toBeNull(); // the dots stay: nothing wrote the answer
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); // would throw / act if still listening
  });
});
