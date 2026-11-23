import { describe, expect, it } from 'vitest';
import { applyDailyLine, applyDonut, applyLeadCards, applySources } from './sales-dashboard.lead.dom';

const html = (s: string): HTMLElement => {
  const root = document.createElement('div');
  root.innerHTML = s;
  return root;
};

describe('dashboard lead tab markup', () => {
  it('should write a card by its heading', () => {
    const root = html(
      '<ts-db-lead-card><button class="c" aria-label="x"><span class="hd"><b>Lead ใหม่</b></span><span class="v">1</span><span class="dl chip bad">x</span><span class="note">n</span><span class="side"><span class="sd"><i class="ic"></i>a</span><span class="sd"><i class="ic"></i>b</span></span></button></ts-db-lead-card>',
    );
    applyLeadCards(root, [{ label: 'Lead ใหม่', value: '4 ราย', delta: '▲ 10%', good: true, note: 'note', side: ['2 ช่องทาง', 'ติดต่อแล้ว 3'] }]);
    expect(root.querySelector('.v')?.textContent).toBe('4 ราย');
    expect(root.querySelector('.dl')?.className).toBe('dl chip good');
    expect(root.querySelectorAll('.sd')[1]?.textContent).toBe('ติดต่อแล้ว 3');
    expect(root.querySelector('.c')?.getAttribute('aria-label')).toBe('Lead ใหม่ 4 ราย');
  });

  it('should rebuild the source bars from clones, with the best conversion called out', () => {
    const col =
      '<button class="col" style="--c: var(--db-r2);"><span class="call">x</span><span class="v">47 · <b>4</b></span><span class="b"><span class="in"></span></span></button>';
    const root = html(`<ts-db-pair-bars><div class="plot">${col}</div><div class="xs"><span>a</span></div></ts-db-pair-bars>`);
    applySources(root, [
      { name: 'A', leads: 10, sold: 1 },
      { name: 'B', leads: 5, sold: 2 },
      { name: 'C', leads: 5, sold: 0 },
    ]);
    expect(root.querySelectorAll('.col')).toHaveLength(3);
    expect(root.querySelectorAll('.xs span')).toHaveLength(3);
    expect(root.querySelectorAll('.call')).toHaveLength(1);
    expect(root.querySelectorAll('.col')[1]?.classList.contains('best')).toBe(true);
    expect(root.querySelectorAll('.call')[0]?.textContent).toBe('ปิดได้สูงสุด 40%');
    expect(root.querySelectorAll('.col')[1]?.querySelector('.v')?.textContent).toBe('5 · 2');
    expect(root.querySelectorAll<HTMLElement>('.in')[1]?.style.height).toBe('40%');
  });

  it('should rebuild the donut ring and legend', () => {
    const root = html(
      '<ts-db-donut><div class="ring"><svg><circle class="track"></circle><circle class="seg"></circle></svg><div class="mid"><b>1</b></div></div><div class="lg"><button class="lg-r"><i></i><span class="lg-l"></span><span class="lg-v"></span><span class="lg-p"></span></button></div></ts-db-donut>',
    );
    applyDonut(root, [
      { name: 'A', leads: 3, sold: 0 },
      { name: 'B', leads: 1, sold: 0 },
    ]);
    expect(root.querySelectorAll('.seg')).toHaveLength(2);
    expect(root.querySelector('.mid b')?.textContent).toBe('4');
    expect(root.querySelectorAll('.lg-p')[0]?.textContent).toBe('75%');
    expect(root.querySelectorAll('.seg')[1]?.getAttribute('stroke-dashoffset')).toMatch(/^-2[89]\d/);
  });

  it('should redraw the daily line, its dot, its hit areas and its day labels', () => {
    const root = html(
      '<ts-db-multi-line><div class="lc"><div class="plot"><svg><path></path><path></path><path></path></svg><span class="dot"></span><span class="tag">1</span><button class="hit"></button></div><div class="xs"><span>1</span></div><div class="legend"><span><b>1</b></span><span><b>2</b></span></div></div></ts-db-multi-line>',
    );
    applyDailyLine(root, { days: 9, now: [0, 1, 1, 2, 2, 3, 3, 3, 4], before: [1, 1, 2, 2, 2, 3, 3, 4, 5] }, 9);
    expect(root.querySelectorAll('.hit')).toHaveLength(9);
    expect(root.querySelector('.hit')?.getAttribute('title')).toBe('1 ต.ค. · 0');
    expect([...root.querySelectorAll('.xs span')].map((s) => s.textContent)).toEqual(['1', '5', '9']);
    expect(root.querySelector('.tag')?.textContent).toBe('4');
    expect(root.querySelectorAll('.legend b')[1]?.textContent).toBe('5');
    expect(root.querySelector('path')?.getAttribute('d')).toMatch(/^M30,.*Z$/);
  });

  it('should leave markup that is not there alone', () => {
    const empty = html('');
    expect(() => {
      applyLeadCards(empty, []);
      applySources(empty, []);
      applyDonut(empty, []);
      applyDailyLine(empty, { days: 1, now: [0], before: [0] }, 0);
    }).not.toThrow();
  });
});
