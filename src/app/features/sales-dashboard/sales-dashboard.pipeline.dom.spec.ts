import { describe, expect, it } from 'vitest';
import { applyExpectedClose, applyFunnel, applyGroupBars, applyPipelineCards, applyTopDeals, applyWaitingList } from './sales-dashboard.pipeline.dom';

const html = (s: string): HTMLElement => {
  const root = document.createElement('div');
  root.innerHTML = s;
  return root;
};
const card = (title: string, body: string): string => `<ts-db-card><div class="w-head"><h3>${title}</h3></div>${body}</ts-db-card>`;

describe('dashboard pipeline tab markup', () => {
  it('should write a trend card by its label', () => {
    const root = html('<ts-db-trend-card><button class="c" aria-label="x"><span class="hd"><span class="l">ดีลที่เปิดอยู่</span></span><span class="v">1</span><span class="dl good"> a </span></button></ts-db-trend-card>');
    applyPipelineCards(root, [{ label: 'ดีลที่เปิดอยู่', value: '4 ดีล', delta: '▼ 5% จากเดือนก่อน', good: false }]);
    expect(root.querySelector('.v')?.textContent).toBe('4 ดีล');
    expect(root.querySelector('.dl')?.className).toBe('dl bad');
    expect(root.querySelector('.dl')?.textContent).toBe(' ▼ 5% จากเดือนก่อน ');
    expect(root.querySelector('.c')?.getAttribute('aria-label')).toBe('ดีลที่เปิดอยู่ 4 ดีล');
  });

  it('should rebuild the bar rows of the groups and of the funnel', () => {
    const row = '<button class="hb-row"><span class="hb-l">x</span><span class="hb-t"><span class="hb-f"></span></span><span class="hb-v">y</span></button>';
    const root = html(card('ดีลที่เปิดอยู่ตามกลุ่มขั้นตอน', `<div class="hbar">${row}</div>`) + card('อัตราผ่านแต่ละกลุ่มขั้นตอน', `<div class="hbar">${row}${row}</div>`));
    applyGroupBars(root, [{ label: 'CS ฝ่าย', value: '฿1.00M · 2', share: 100 }, { label: 'AN', value: '฿0.50M · 1', share: 50 }]);
    applyFunnel(root, [{ label: 'เข้ากลุ่ม CS', value: '100% · 4', share: 100 }]);
    const [groups, funnel] = [...root.querySelectorAll('ts-db-card')];
    expect(groups?.querySelectorAll('.hb-row')).toHaveLength(2);
    expect(groups?.querySelectorAll<HTMLElement>('.hb-f')[1]?.style.width).toBe('50%');
    expect(funnel?.querySelectorAll('.hb-row')).toHaveLength(1);
    expect(funnel?.querySelector('.hb-v')?.textContent).toBe('100% · 4');
  });

  it('should rebuild the top deals, ranking the rows', () => {
    const tr = '<tr><td><span class="rk r1">1</span><span class="nmw">x</span></td><td><span class="grp">G</span></td><td><span class="amt">0</span></td><td><span class="pill bad">1</span></td></tr>';
    const root = html(card('ดีลใหญ่ 5 อันดับ', `<table><tbody>${tr}${tr}</tbody></table>`));
    applyTopDeals(root, [{ customer: 'ก', groupIdx: 0, groupCode: 'CS', owner: 'o', amount: 2_000_000, days: 12, share: 100 }], 3);
    expect(root.querySelectorAll('tr')).toHaveLength(1);
    expect(root.querySelector('.nmw')?.textContent).toBe('ก');
    expect(root.querySelector('.amt')?.textContent).toBe('฿2,000,000');
    expect(root.querySelector('.pill')?.textContent).toBe('12 วัน');
  });

  it('should rebuild a list of waiting deals with its summary line', () => {
    const tr = '<tr><td><span class="nm">x</span><span class="grp">G</span></td><td class="nm">o</td><td class="num"><span class="pill bad">1</span></td></tr>';
    const root = html(card('ดีลค้างนานเกินกำหนด', `<p class="hint"> 0 </p><table><tbody>${tr}</tbody></table>`));
    applyWaitingList(root, 'ดีลค้างนานเกินกำหนด', { count: 3, total: '฿6.00M', rows: [{ customer: 'ก', groupIdx: 1, groupCode: 'AN', owner: 'ผู้ดูแล', amount: 1, days: 20, share: 0 }, { customer: 'ข', groupIdx: 0, groupCode: 'CS', owner: 'อีกคน', amount: 1, days: 15, share: 0 }] }, 3);
    expect(root.querySelector('.hint')?.textContent).toBe(' 3 ดีล · มูลค่ารวม ฿6.00M ');
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(root.querySelectorAll('tbody tr')[0]?.querySelectorAll('td')[1]?.textContent).toBe('ผู้ดูแล');
    expect(root.querySelectorAll('.pill')[1]?.textContent).toBe('15 วัน');
  });

  it('should rebuild the expected-close columns, the first one marked', () => {
    const col = '<button class="vb-col hi"><span class="vb-v">1</span><span class="vb-b"></span></button>';
    const root = html(card('ดีลคาดปิดตามเดือน', `<ts-db-bar-chart><div class="vb"><div class="vb-plot">${col}</div><div class="vb-x"><span class="hi">ก</span></div></div></ts-db-bar-chart>`));
    applyExpectedClose(root, [{ label: 'ต.ค.', value: '3.00', share: 100 }, { label: 'พ.ย.', value: '1.50', share: 50 }]);
    expect(root.querySelectorAll('.vb-col')).toHaveLength(2);
    expect(root.querySelectorAll('.vb-col')[1]?.classList.contains('hi')).toBe(false);
    expect(root.querySelectorAll('.vb-x span')[1]?.textContent).toBe('พ.ย.');
    expect(root.querySelectorAll('.vb-v')[1]?.textContent).toBe('1.50');
  });

  it('should leave markup that is not there alone', () => {
    const empty = html('');
    expect(() => {
      applyPipelineCards(empty, []);
      applyGroupBars(empty, []);
      applyFunnel(empty, []);
      applyTopDeals(empty, [], 0);
      applyWaitingList(empty, 'x', { count: 0, total: '', rows: [] }, 0);
      applyExpectedClose(empty, []);
    }).not.toThrow();
  });
});
