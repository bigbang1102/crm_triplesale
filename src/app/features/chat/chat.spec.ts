import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import { I18n } from '@core/i18n/i18n.service';
import { PermissionService } from '@core/permissions/permission.service';
import { authStub, configStub } from '@core/testing/test-helpers';
import { DialogService } from '@shared/ui/notify/dialog.service';
import { Chat } from './chat';
import { ChatView } from './chat-view';
import { mockChatFetch, pushMockIncoming, resetMockChat } from './chat.mock';

const MESSAGES: Record<string, string> = {
  'chat.all': 'ทั้งหมด',
  'chat.empty.nochat': 'ยังไม่มีแชท',
  'chat.tab.reply': 'ตอบกลับ',
  'chat.loadmore': 'โหลดเพิ่มเติม',
};

function setup(opts: { features?: (f: string) => boolean; lang?: 'th' | 'en' } = {}) {
  resetMockChat();
  const lang = signal<'th' | 'en'>(opts.lang ?? 'th');
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ConfigService, useValue: configStub({ mock: true }) },
      { provide: PermissionService, useValue: { has: opts.features ?? (() => true) } },
      { provide: AuthService, useValue: authStub([], 1001) },
      { provide: I18n, useValue: { t: (k: string) => MESSAGES[k] ?? k, lang } },
      DialogService,
    ],
  });
  return { lang };
}

/**
 * jsdom evaluates inline `onclick="cbTab(this)"` in its own global, not the one the engine put `cbTab` on (vitest copies the
 * window onto Node's globalThis) — so run the handler text the way a browser would: `this` = the element, free names = window.
 */
const fire = (el: Element, attr = 'onclick') => new Function('event', el.getAttribute(attr)!).call(el, new Event(attr.slice(2)));

/** the engine starts after the fake backend chunk has loaded and the first list has been fetched */
const loaded = (el: HTMLElement) => vi.waitFor(() => expect(el.querySelectorAll('.cb-ci').length).toBeGreaterThan(0), { timeout: 3000 });
const opened = (el: HTMLElement, id: number) =>
  vi.waitFor(() => expect(el.querySelector('.cb-ci.on')?.getAttribute('onclick')).toBe(`cbSel(${id})`), { timeout: 3000 });

async function mount(): Promise<{ fixture: ReturnType<typeof TestBed.createComponent<ChatView>>; el: HTMLElement }> {
  const fixture = TestBed.createComponent(ChatView);
  fixture.detectChanges();
  await fixture.whenStable();
  const el: HTMLElement = fixture.nativeElement;
  await loaded(el);
  return { fixture, el };
}

describe('Chat screen', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders the Java markup, loads the first page of rooms and opens the newest one', async () => {
    setup();
    const { fixture, el } = await mount();

    expect(el.querySelector('.cb')).toBeTruthy();
    expect(el.querySelector('.cb-t.on')?.textContent).toContain('ทั้งหมด'); // {{ t('chat.all') }}
    // LIST_PER = 20 (the rooms arrive in steps: wait for the whole page — a loaded machine caught it half drawn)
    await vi.waitFor(() => expect(el.querySelectorAll('.cb-ci')).toHaveLength(20), { timeout: 3000 });
    await vi.waitFor(() => expect(el.querySelector('#cbkAll')?.textContent).toBe('24'), { timeout: 3000 }); // real totals come from /conversations/counts
    expect(el.querySelector('#cbLoadMore')?.getAttribute('style') ?? '').not.toContain('display:none');

    await opened(el, 1);
    await vi.waitFor(() => expect(el.querySelectorAll('#cbMsgs .cb-mrow').length).toBeGreaterThan(5));
    // a linked room shows the customer's name, not the LINE profile name
    expect(el.querySelector('#cbCvNm')?.textContent).toContain('กัญญารัตน์ วงศ์สกุล');
    expect(el.querySelector('.cb-t.on')).toBeTruthy();
    fixture.destroy();
  });

  it('inline onclick handlers of the Java markup work: switching tab, opening another room, searching', async () => {
    setup();
    const { fixture, el } = await mount();

    fire(el.querySelector('.cb-t[data-ch="TikTok"]')!);
    expect(el.querySelector('.cb-t.on')?.getAttribute('data-ch')).toBe('TikTok');
    fire(el.querySelector('.cb-t[data-ch="all"]')!);

    (window as any).cbSel(3);
    await opened(el, 3);
    await vi.waitFor(() => expect(el.querySelector('#cbCvNm')?.textContent).toContain('jiratchaya.official'));

    const search = el.querySelector<HTMLInputElement>('input[oninput^="cbSearch"]')!;
    search.value = 'kevin';
    fire(search, 'oninput');
    await vi.waitFor(() => expect(el.querySelectorAll('.cb-ci')).toHaveLength(1), { timeout: 3000 });
    expect(el.querySelector('.cb-ci')?.textContent).toContain('Kevin Lee');
    fixture.destroy();
  });

  it('sends a message: optimistic bubble first, then the service has it', async () => {
    setup();
    const { fixture, el } = await mount();
    await opened(el, 1);
    await vi.waitFor(() => expect(el.querySelectorAll('#cbMsgs .cb-mrow').length).toBeGreaterThan(5));
    const before = el.querySelectorAll('#cbMsgs .cb-mrow').length;

    const ta = el.querySelector<HTMLTextAreaElement>('#cbTa')!;
    ta.value = 'ยืนยันนัดหมายพรุ่งนี้ค่ะ';
    (window as any).cbSend();
    expect(ta.value).toBe('');
    expect(el.querySelectorAll('#cbMsgs .cb-mrow').length).toBe(before + 1);
    expect(el.querySelector('#cbMsgs')?.textContent).toContain('ยืนยันนัดหมายพรุ่งนี้ค่ะ');
    // the room preview follows
    expect(el.querySelector('.cb-ci.on .cb-ci-msg')?.textContent).toContain('ยืนยันนัดหมายพรุ่งนี้ค่ะ');

    // the fake service stored it
    await vi.waitFor(async () => {
      const res = await mockChatFetch('/triplesale/chat-api/api/v1/conversations/1/messages?page=1&perPage=3', undefined, '/triplesale', { employeeId: '1001', branchId: '1' });
      expect((await res.json()).result[0]).toMatchObject({ body: 'ยืนยันนัดหมายพรุ่งนี้ค่ะ', direction: 'OUT', senderEmployeeId: '1001' });
    });
    fixture.destroy();
  });

  it('an unlinked room can be renamed with the pencil (Java 26/10/2026 profile name) and the name is restored again', async () => {
    setup();
    const { fixture, el } = await mount();
    const rooms: any[] = (await (await mockChatFetch('/triplesale/chat-api/api/v1/conversations?perPage=100', {}, '/triplesale', { employeeId: '1001', branchId: '1' })).json()).result;
    const free = rooms.find((c) => !c.prospectName && c.channelType === 'LINE');
    fire(el.querySelector(`.cb-ci[onclick="cbSel(${free.id})"]`)!);
    await vi.waitFor(() => expect(el.querySelector('#cbCvNm')?.textContent).toContain(free.profileName));
    // the pencil shows only after the link state was checked, and only for a room with no customer
    await vi.waitFor(() => expect((el.querySelector('#cbPnEdit') as HTMLElement).style.display).toBe(''));

    fire(el.querySelector('#cbPnEdit')!);
    expect((el.querySelector('#cbPnForm') as HTMLElement).style.display).toBe('flex');
    expect((el.querySelector('#cbCvNmRow') as HTMLElement).style.display).toBe('none');
    (el.querySelector('#cbPnInp') as HTMLInputElement).value = 'ลูกค้าไลน์ใหม่';
    fire(el.querySelector('#cbPnOk')!);
    await vi.waitFor(() => expect(el.querySelector('#cbCvNm')?.textContent).toContain('ลูกค้าไลน์ใหม่'));
    expect((el.querySelector('#cbPnForm') as HTMLElement).style.display).toBe('none');

    // the second time the form offers "restore the provider name"
    fire(el.querySelector('#cbPnEdit')!);
    expect((el.querySelector('#cbPnRestore') as HTMLElement).style.display).toBe('');
    fire(el.querySelector('#cbPnRestore')!);
    await vi.waitFor(() => expect(el.querySelector('#cbCvNm')?.textContent).toContain(free.profileName));
    fixture.destroy();
  });

  it('realtime: a socket message bumps the unread badge of its room and shows in the list', async () => {
    setup();
    const { fixture, el } = await mount();
    await opened(el, 1);
    await vi.waitFor(() => expect(el.querySelectorAll('#cbMsgs .cb-mrow').length).toBeGreaterThan(5));
    // the page connects the socket after the first list (fake: 'connect' after 20 ms → it re-syncs the list)
    await new Promise((r) => setTimeout(r, 120));

    const badge = () => el.querySelector('.cb-ci[onclick="cbSel(2)"] .cb-ubadge')?.textContent;
    expect(badge()).toBe('1');
    pushMockIncoming(2, 'ขอเลื่อนนัดได้ไหมครับ');
    await vi.waitFor(() => expect(badge()).toBe('2'));
    expect(el.querySelector('.cb-ci[onclick="cbSel(2)"]')?.textContent).toContain('ขอเลื่อนนัดได้ไหมครับ');
    // the room that is open is read at once while the tab is attended (visible + focused: Java `cbAttended`), so it gets no badge …
    const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    pushMockIncoming(1, 'ข้อความถึงห้องที่เปิดอยู่');
    await vi.waitFor(() => expect(el.querySelector('#cbMsgs')?.textContent).toContain('ข้อความถึงห้องที่เปิดอยู่'));
    expect(el.querySelector('.cb-ci.on .cb-ubadge')).toBeNull();
    // … but a tab that is not in focus has not read it: the badge stays until the user comes back
    focus.mockReturnValue(false);
    pushMockIncoming(1, 'ข้อความตอนไม่ได้โฟกัส');
    await vi.waitFor(() => expect(el.querySelector('.cb-ci.on .cb-ubadge')).not.toBeNull());
    focus.mockRestore();
    fixture.destroy();
  });

  it('feature keys gate the same buttons as the Java ui:fragment blocks', async () => {
    setup({ features: () => true });
    const all = await mount();
    for (const id of ['cbBotBtn', 'cbBotRoom', 'cbLinkStatus', 'cbTa', 'cbAiModeBtn', 'cbChAccSec', 'cbLinkUndo']) {
      expect(all.el.querySelector(`#${id}`), id).toBeTruthy();
    }
    all.fixture.destroy();
    TestBed.resetTestingModule();

    setup({ features: () => false });
    const none = await mount();
    for (const id of ['cbBotBtn', 'cbBotRoom', 'cbLinkStatus', 'cbTa', 'cbAiModeBtn', 'cbChAccSec', 'cbLinkUndo']) {
      expect(none.el.querySelector(`#${id}`), id).toBeNull();
    }
    // the read-only view still lists the rooms and shows the conversation
    await opened(none.el, 1);
    await vi.waitFor(() => expect(none.el.querySelectorAll('#cbMsgs .cb-mrow').length).toBeGreaterThan(5));
    none.fixture.destroy();
  });

  it('links to other pages are routed by the SPA router instead of a page load', async () => {
    setup();
    const router = TestBed.inject(Router);
    const navigated: string[] = [];
    router.navigateByUrl = ((url: string) => {
      navigated.push(url);
      return Promise.resolve(true);
    }) as Router['navigateByUrl'];

    const { fixture, el } = await mount();
    await opened(el, 1);
    // room 1 is linked to customer 501: the header button goes to the customer, the lead rows to the lead
    await vi.waitFor(() => expect(el.querySelector('#cbCustViewBtn')?.getAttribute('href')).toBe('/crm/prospects/501'));
    const view = el.querySelector<HTMLAnchorElement>('#cbCustViewBtn')!;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    view.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);

    await vi.waitFor(() => expect(el.querySelector('a.cb-lrow')).toBeTruthy());
    expect(el.querySelector('a.cb-lrow')?.getAttribute('href')).toBe('/crm/opportunities/9001');
    el.querySelector<HTMLAnchorElement>('a.cb-lrow')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    expect(navigated).toEqual(['/crm/prospects/501', '/crm/opportunities/9001']);
    fixture.destroy();
  });

  it('destroying the view removes the handlers the engine put on window and stops its timers / socket', async () => {
    setup();
    const { fixture } = await mount();
    expect(typeof (window as any).cbSel).toBe('function');
    expect(typeof (window as any).cbSend).toBe('function');
    fixture.destroy();
    expect((window as any).cbSel).toBeUndefined();
    expect((window as any).cbSend).toBeUndefined();
    // a late push to the (now disconnected) socket must not throw or paint anything
    expect(() => pushMockIncoming(2, 'หลังปิดหน้า')).not.toThrow();
  });

  it('the route component rebuilds the view when the language changes (the page script gets its texts once)', async () => {
    const { lang } = setup();
    const fixture = TestBed.createComponent(Chat);
    fixture.detectChanges();
    await fixture.whenStable();
    const first = fixture.nativeElement.querySelector('ts-chat-view');
    expect(first).toBeTruthy();

    lang.set('en');
    fixture.detectChanges();
    await fixture.whenStable();
    const second = fixture.nativeElement.querySelector('ts-chat-view');
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect(fixture.nativeElement.querySelectorAll('ts-chat-view')).toHaveLength(1);
    fixture.destroy();
  });
});
