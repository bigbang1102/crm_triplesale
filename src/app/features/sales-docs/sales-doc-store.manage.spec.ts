import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachRowActions } from './list/sales-doc-list-actions';
import { deleteSalesDoc, findSalesDoc, recordSalesDoc, resetSalesDocStore, snapshotFromScreen, storedSalesDocRows, updateSalesDoc } from './sales-doc-store';

const payload = (name: string) => ({ header: { doc_date: '2026-11-20', prospect_name: name, saleperson: 'ผู้ดูแล', netamount_after_vat: 100 }, lines: [] });

describe('opening, editing and deleting a saved sales document', () => {
  afterEach(() => {
    resetSalesDocStore();
    document.body.innerHTML = '';
  });

  it('should find a document by its number and delete it, and not give its number to the next one', () => {
    recordSalesDoc('qt', payload('a'));
    const second = recordSalesDoc('qt', payload('b'));
    expect(findSalesDoc('qt', second?.no ?? '')?.row.customer).toBe('b');
    expect(deleteSalesDoc('qt', 'QT:M00-2611-00001')).toBe(true);
    expect(deleteSalesDoc('qt', 'QT:M00-2611-00001')).toBe(false);
    const third = recordSalesDoc('qt', payload('c'));
    expect(third?.no).toBe('QT:M00-2611-00003');
    expect(storedSalesDocRows('qt').map((r) => r.customer)).toEqual(['c', 'b']);
  });

  it('should change the columns of the list and the fields of the snapshot, and refuse an unknown number', () => {
    document.body.innerHTML = '<label for="qtDocDate">วันที่</label><input id="qtDocDate" value="2026-11-20" />';
    const row = recordSalesDoc('qt', payload('a'));
    expect(findSalesDoc('qt', row?.no ?? '')?.snapshot?.fields).toEqual([{ label: 'วันที่', value: '2026-11-20' }]);
    const changed = updateSalesDoc('qt', row?.no ?? '', { customer: 'ใหม่', total: 5, fields: [{ label: 'วันที่', value: '2026-12-01' }] });
    expect(changed).toMatchObject({ customer: 'ใหม่', total: 5, status: 'บันทึกแล้ว' });
    expect(findSalesDoc('qt', row?.no ?? '')?.snapshot?.fields[0]?.value).toBe('2026-12-01');
    expect(updateSalesDoc('qt', 'nope', { customer: 'x' })).toBeUndefined();
  });

  it('should snapshot labelled fields without the empty ones and the dropdown placeholder, and the item table', () => {
    document.body.innerHTML = `
      <label for="obDocDate">วันที่</label><input id="obDocDate" value="2026-11-20" />
      <label for="obNote">หมายเหตุ</label><input id="obNote" value="" />
      <label for="obPlan">แผน</label><select id="obPlan"><option>- เลือก -</option></select>
      <table><thead><tr><th>สินค้า</th><th>จำนวน</th></tr></thead><tbody id="obItems"><tr><td>ผ้าคลุม</td><td><input value="2" /></td></tr></tbody></table>`;
    expect(snapshotFromScreen('ob')).toEqual({ fields: [{ label: 'วันที่', value: '2026-11-20' }], lines: { columns: ['สินค้า', 'จำนวน'], rows: [['ผ้าคลุม', '2']] } });
  });
});

describe('the row actions of the list', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const table = () => {
    document.body.innerHTML = '<table><thead><tr><th>no</th></tr></thead><tbody id="b"><tr><td>OB:1</td></tr></tbody></table>';
    return document.getElementById('b') as HTMLElement;
  };

  it('should link the number, add the delete column, and remove the row once the handler says it was deleted', async () => {
    const body = table();
    const remove = vi.fn().mockResolvedValue(true);
    const stop = attachRowActions(body, 'ob', { delete: 'ลบ' }, { remove });
    expect(body.querySelector('a')?.getAttribute('href')).toBe('/sales/docs/ob/OB%3A1');
    expect(document.querySelectorAll('thead th')).toHaveLength(2);
    body.querySelector<HTMLElement>('[data-sd-delete]')?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(remove).toHaveBeenCalledWith('OB:1');
    expect(body.querySelectorAll('tr')).toHaveLength(0);
    stop();
  });

  it('should keep the row when the delete is refused, and leave the empty-table row alone', async () => {
    const body = table();
    const stop = attachRowActions(body, 'ob', { delete: 'ลบ' }, { remove: () => Promise.resolve(false) });
    body.querySelector<HTMLElement>('[data-sd-delete]')?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(body.querySelectorAll('tr')).toHaveLength(1);
    body.innerHTML = '<tr class="qml-empty"><td>ไม่มีข้อมูล</td></tr>';
    await Promise.resolve();
    expect(body.querySelector('a')).toBeNull();
    stop();
  });
});
