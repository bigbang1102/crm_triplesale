import { describe, expect, it, vi } from 'vitest';
import type { QuickChatHandle } from './quick-chat.engine';
import { QuickChatService } from './quick-chat.service';

const handle = (taken: boolean): QuickChatHandle => ({ toggle: vi.fn(() => taken), pageChanged: vi.fn(), destroy: vi.fn() });

describe('QuickChatService', () => {
  it('should not take the click while no box is mounted', () => {
    expect(new QuickChatService().toggle()).toBe(false);
  });

  it('should hand the click to the box and return what the box says', () => {
    const service = new QuickChatService();
    const box = handle(true);
    service.register(box);
    expect(service.toggle()).toBe(true);
    expect(box.toggle).toHaveBeenCalledOnce();

    service.register(handle(false)); // on the full chat page the box declines: the button is a plain link
    expect(service.toggle()).toBe(false);
  });

  it('should forget a box that is gone, but not a newer one', () => {
    const service = new QuickChatService();
    const old = handle(true);
    const current = handle(true);
    service.register(old);
    service.register(current);
    service.unregister(old);
    expect(service.toggle()).toBe(true);
    service.unregister(current);
    expect(service.toggle()).toBe(false);
  });
});
