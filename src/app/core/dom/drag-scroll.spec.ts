import { afterEach, describe, expect, it, vi } from 'vitest';
import { startDragScroll } from './drag-scroll';

/** jsdom has no layout: say how big the area and its content are */
function area(overflow: { x?: number; y?: number } = { x: 500 }): HTMLElement {
  const el = document.createElement('div');
  el.className = 'wrap';
  el.innerHTML = '<table><tr><td id="cell">cell</td><td><button id="btn">go</button></td></tr></table>';
  Object.defineProperty(el, 'clientWidth', { value: 100, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 100, configurable: true });
  Object.defineProperty(el, 'scrollWidth', { value: overflow.x ?? 100, configurable: true });
  Object.defineProperty(el, 'scrollHeight', { value: overflow.y ?? 100, configurable: true });
  document.body.appendChild(el);
  return el;
}
const mouse = (target: EventTarget, type: string, x: number, y = 0) =>
  target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }));

describe('drag_scroll.js (scroll an area by dragging it)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('hides the scrollbar and shows the hand only on an area that really overflows', () => {
    const wide = area({ x: 500 });
    const fits = area({});
    const stop = startDragScroll('.wrap');
    expect(wide.classList.contains('ds-scroll')).toBe(true);
    expect(wide.classList.contains('ds-grab')).toBe(true);
    expect(fits.classList.contains('ds-scroll')).toBe(true);
    expect(fits.classList.contains('ds-grab')).toBe(false);
    stop();
  });

  it('drags: the content follows the mouse once it moved more than 4 px, and the click that ends the drag is swallowed', () => {
    const el = area();
    const stop = startDragScroll('.wrap');
    const clicked = vi.fn();
    document.body.addEventListener('click', clicked);

    mouse(el.querySelector('#cell')!, 'mousedown', 100);
    mouse(document, 'mousemove', 98); // 2 px: still a click
    expect(el.scrollLeft).toBe(0);
    expect(el.classList.contains('ds-grabbing')).toBe(false);
    mouse(document, 'mousemove', 60); // 40 px to the left: the content moves 40 px to the right
    expect(el.scrollLeft).toBe(40);
    expect(el.classList.contains('ds-grabbing')).toBe(true);
    mouse(el.querySelector('#cell')!, 'mouseup', 60); // released over the area: the browser then sends the click to it
    expect(el.classList.contains('ds-grabbing')).toBe(false);

    el.querySelector<HTMLElement>('#cell')!.click();
    expect(clicked).not.toHaveBeenCalled(); // the row under the mouse is not opened by the drag
    el.querySelector<HTMLElement>('#cell')!.click();
    expect(clicked).toHaveBeenCalledTimes(1); // and the next click is a click again
    document.body.removeEventListener('click', clicked);
    stop();
  });

  it('does not start on a button / input / link, so they keep working', () => {
    const el = area();
    const stop = startDragScroll('.wrap');
    mouse(el.querySelector('#btn')!, 'mousedown', 100);
    mouse(document, 'mousemove', 20);
    expect(el.scrollLeft).toBe(0);
    mouse(document, 'mouseup', 20);
    stop();
  });

  it('is idempotent and destroy takes classes and listeners away', () => {
    const el = area();
    const stop = startDragScroll('.wrap');
    const again = startDragScroll('.wrap'); // data-ds-bound: bound once
    expect(el.getAttribute('data-ds-bound')).toBe('1');
    again();
    stop();
    expect(el.className).toBe('wrap');
    expect(el.hasAttribute('data-ds-bound')).toBe(false);
    mouse(el, 'mousedown', 100);
    mouse(document, 'mousemove', 20);
    expect(el.scrollLeft).toBe(0);
  });
});
