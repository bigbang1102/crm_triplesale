import { afterEach, describe, expect, it, vi } from 'vitest';
import { showMockupUnavailable } from './mockup-unavailable';

afterEach(() => {
  document.getElementById('ts-mockup-unavailable')?.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('the page shown when the data of the mockup cannot be read', () => {
  it('should draw a page that says there is no data, with a button that tries again', () => {
    const reload = vi.fn();
    const box = showMockupUnavailable('down', reload, false);
    expect(document.getElementById('ts-mockup-unavailable')).toBe(box);
    expect(box.textContent).toContain('ยังเชื่อมต่อเซิร์ฟเวอร์ข้อมูลไม่ได้');
    expect(box.textContent).toContain('triple-sales-mockup-data');
    box.querySelector('button')!.click();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('should say something else when the server answers but holds no document, and never draw two pages', () => {
    showMockupUnavailable('down', vi.fn(), false);
    const box = showMockupUnavailable('empty', vi.fn());
    expect(document.querySelectorAll('#ts-mockup-unavailable')).toHaveLength(1);
    expect(box.textContent).toContain('ยังไม่มีเอกสารให้ใช้งาน');
    expect(box.textContent).toContain('mockup:seed');
  });

  it('should ask for the server every few seconds while it is away and reload by itself once it answers', async () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const answers = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('down')).mockResolvedValue(new Response('{"ok":true}'));
    showMockupUnavailable('down', reload);
    await vi.advanceTimersByTimeAsync(5000);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(answers).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('should not ask for the server when it is up but holds nothing (a retry button is all there is)', () => {
    vi.useFakeTimers();
    const asked = vi.spyOn(globalThis, 'fetch');
    showMockupUnavailable('empty', vi.fn());
    vi.advanceTimersByTime(20000);
    expect(asked).not.toHaveBeenCalled();
  });

  it('should keep the app from starting when the server is down: the start of the mockup never finishes and the page is shown', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connection refused'));
    const { startMockup } = await import('./mockup-bootstrap');
    const outcome = await Promise.race([startMockup().then(() => 'started'), new Promise((r) => setTimeout(() => r('waiting'), 300))]);
    expect(outcome).toBe('waiting');
    expect(document.getElementById('ts-mockup-unavailable')?.textContent).toContain('ยังเชื่อมต่อเซิร์ฟเวอร์ข้อมูลไม่ได้');
  });

  it('should show the page for a server that is up but holds nothing', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => (String(input).endsWith('/health') ? new Response('{"ok":true}') : new Response('{}')));
    const { startMockup } = await import('./mockup-bootstrap');
    const outcome = await Promise.race([startMockup().then(() => 'started'), new Promise((r) => setTimeout(() => r('waiting'), 300))]);
    expect(outcome).toBe('waiting');
    expect(document.getElementById('ts-mockup-unavailable')?.textContent).toContain('ยังไม่มีเอกสารให้ใช้งาน');
  });
});
