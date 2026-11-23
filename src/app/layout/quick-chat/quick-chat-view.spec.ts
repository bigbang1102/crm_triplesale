import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18n } from '@core/i18n/i18n.service';
import { QuickChatView } from './quick-chat-view';
import { QuickChatService } from './quick-chat.service';

@Component({ template: '' })
class Blank {}

let button: HTMLElement;

/** the engine is its own chunk: it starts a moment after the first render, and registers the hook the button calls */
const engineStarted = () => vi.waitFor(() => expect((window as unknown as { cbQuickChat?: unknown }).cbQuickChat).toBeTypeOf('function'));

function mount(): { fixture: ComponentFixture<QuickChatView>; wrap: HTMLElement; router: Router; service: QuickChatService } {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'crm/home', component: Blank },
        { path: 'chat', component: Blank },
      ]),
      { provide: I18n, useValue: { lang: signal('th'), t: (k: string) => k } },
    ],
  });
  const fixture = TestBed.createComponent(QuickChatView);
  fixture.detectChanges();
  const wrap = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('#qcWrap')!;
  return { fixture, wrap, router: TestBed.inject(Router), service: TestBed.inject(QuickChatService) };
}

describe('QuickChatView', () => {
  beforeEach(() => {
    sessionStorage.clear();
    button = document.createElement('a');
    button.id = 'chatMenuBtn'; // the "แชท" button of the side rail, outside this component
    document.body.append(button);
  });
  afterEach(() => {
    button.remove();
    sessionStorage.clear();
  });

  it('should render the Java markup: title, expand, close, the frame and the three resize handles', () => {
    const { fixture, wrap } = mount();
    expect(wrap.getAttribute('aria-label')).toBe('chat.title');
    expect(wrap.querySelector('#qcExpand')?.getAttribute('title')).toBe('chat.qc.expand');
    expect(wrap.querySelector('#qcClose')?.getAttribute('title')).toBe('chat.qc.close');
    expect(wrap.querySelector('iframe#qcFrame')).toBeTruthy();
    expect(wrap.querySelectorAll('#qcResize, #qcResizeT, #qcResizeB')).toHaveLength(3);
    expect(getComputedStyle(wrap).display).toBe('none');
    fixture.destroy();
  });

  it('should open on the button, load the embed route once, mark the button and remember it; the button closes it again', async () => {
    const { fixture, wrap, router, service } = mount();
    await engineStarted();
    await router.navigateByUrl('/crm/home');
    await fixture.whenStable();

    expect(service.toggle()).toBe(true);
    expect(wrap.style.display).toBe('flex');
    expect(wrap.querySelector('iframe')?.getAttribute('src')).toMatch(/\/chat-embed$/);
    expect(button.classList.contains('qc-open')).toBe(true);
    expect(sessionStorage.getItem('qc_open')).toBe('1');

    const frameSrc = wrap.querySelector('iframe')?.getAttribute('src');
    expect(service.toggle()).toBe(true);
    expect(wrap.style.display).toBe('none');
    expect(button.classList.contains('qc-open')).toBe(false);
    expect(sessionStorage.getItem('qc_open')).toBeNull();

    service.toggle(); // reopened: the frame is kept, not loaded again (the realtime connection and the open room stay)
    expect(wrap.querySelector('iframe')?.getAttribute('src')).toBe(frameSrc);
    fixture.destroy();
  });

  it('should not take the click on the full chat page, and hide while the user is there', async () => {
    const { fixture, wrap, router, service } = mount();
    await engineStarted();
    await router.navigateByUrl('/crm/home');
    service.toggle();
    expect(wrap.style.display).toBe('flex');

    await router.navigateByUrl('/chat'); // the page has its own chat
    expect(wrap.style.display).toBe('none');
    expect(service.toggle()).toBe(false);
    expect(sessionStorage.getItem('qc_open')).toBe('1'); // still "left open": it comes back on the next page

    await router.navigateByUrl('/crm/home');
    expect(wrap.style.display).toBe('flex');
    fixture.destroy();
  });

  it('should come back on its own after a page load when it was left open', async () => {
    sessionStorage.setItem('qc_open', '1');
    const { fixture, wrap } = mount();
    await engineStarted();
    expect(wrap.style.display).toBe('flex');
    expect(button.classList.contains('qc-open')).toBe(true);
    fixture.destroy();
  });

  it('should remove the hooks and the button mark when it is destroyed', async () => {
    const { fixture, router, service } = mount();
    await engineStarted();
    await router.navigateByUrl('/crm/home');
    service.toggle();
    fixture.destroy();
    expect(button.classList.contains('qc-open')).toBe(false);
    expect((window as unknown as { cbQuickChat?: unknown }).cbQuickChat).toBeUndefined();
    expect(service.toggle()).toBe(false);
  });
});
