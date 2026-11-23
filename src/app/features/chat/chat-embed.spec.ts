import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomGuards } from '@core/dom/dom-guards';
import { ChatEmbed } from './chat-embed';
import { ChatView } from './chat-view';

/** the heavy part (the page script, the socket) is the chat page's own business — this spec is about what the embed route adds */
function setup() {
  const guards = { start: vi.fn(), stop: vi.fn() };
  TestBed.configureTestingModule({ providers: [{ provide: DomGuards, useValue: guards }] });
  TestBed.overrideComponent(ChatEmbed, { remove: { imports: [ChatView] }, add: { template: '<div id="chat-view-stub"></div>' } });
  return guards;
}

const flags = () => window as unknown as { CB_EMBED?: boolean; CB_ROOM?: unknown; CB_ROOM_OPEN?: boolean };

describe('ChatEmbed (/chat-embed)', () => {
  afterEach(() => sessionStorage.clear());

  it('should switch the page script to embed mode and restore the room the box had open', () => {
    sessionStorage.setItem('qc_room', JSON.stringify({ room: 7, open: true }));
    const guards = setup();
    const fixture = TestBed.createComponent(ChatEmbed);
    fixture.detectChanges();

    expect(flags().CB_EMBED).toBe(true);
    expect(flags().CB_ROOM).toBe(7);
    expect(flags().CB_ROOM_OPEN).toBe(true);
    expect(document.documentElement.classList.contains('cb-embed')).toBe(true);
    expect(guards.start).toHaveBeenCalledOnce();

    fixture.destroy();
    expect(flags().CB_EMBED).toBeUndefined();
    expect(flags().CB_ROOM).toBeUndefined();
    expect(document.documentElement.classList.contains('cb-embed')).toBe(false);
    expect(guards.stop).toHaveBeenCalledOnce();
  });

  it('should not set a room when none was saved or the saved value is unreadable', () => {
    for (const saved of [null, 'not json', JSON.stringify({ room: null, open: true }), JSON.stringify({ nothing: 1 })]) {
      sessionStorage.clear();
      if (saved !== null) sessionStorage.setItem('qc_room', saved);
      setup();
      const fixture = TestBed.createComponent(ChatEmbed);
      fixture.detectChanges();
      expect(flags().CB_EMBED).toBe(true);
      expect(flags().CB_ROOM).toBeUndefined();
      fixture.destroy();
      TestBed.resetTestingModule();
    }
  });

  it('should stop a `<a href="#">` from routing the frame (quickchat.xhtml does the same in its srcdoc)', () => {
    setup();
    const fixture = TestBed.createComponent(ChatEmbed);
    fixture.detectChanges();
    const link = document.createElement('a');
    link.setAttribute('href', '#');
    document.body.append(link);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);

    const real = document.createElement('a');
    real.setAttribute('href', '/crm/home');
    document.body.append(real);
    const other = new MouseEvent('click', { bubbles: true, cancelable: true });
    real.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    link.remove();
    real.remove();
    fixture.destroy();
  });
});
