import { describe, expect, it } from 'vitest';
import { DialogService } from './dialog.service';

describe('DialogService', () => {
  it('confirm resolves true / false', async () => {
    const dialog = new DialogService();
    const yes = dialog.confirm({ title: 'ลบ?', danger: true });
    expect(dialog.state()).toMatchObject({ kind: 'confirm', title: 'ลบ?', danger: true });
    dialog.close(true);
    expect(await yes).toBe(true);
    const no = dialog.confirm({ title: 'ลบ?' });
    dialog.close(false);
    expect(await no).toBe(false);
    expect(dialog.state()).toBeNull();
  });

  it('prompt (swal content input) resolves the text when confirmed — an empty box is "" — and null when cancelled', async () => {
    const dialog = new DialogService();
    const typed = dialog.prompt({ title: 'ไม่อนุมัติงานแปล', text: 'กรอกเหตุผล', placeholder: 'เช่น ตกหน้า 3', okText: 'ไม่อนุมัติ', cancelText: 'ยกเลิก', icon: 'warning' });
    expect(dialog.state()).toMatchObject({ kind: 'prompt', placeholder: 'เช่น ตกหน้า 3', okText: 'ไม่อนุมัติ', icon: 'warning' });
    dialog.close(true, 'ตกหน้า 3');
    expect(await typed).toBe('ตกหน้า 3');

    const empty = dialog.prompt({ title: 't' });
    dialog.close(true);
    expect(await empty).toBe('');

    const cancelled = dialog.prompt({ title: 't' });
    dialog.close(false, 'ignored');
    expect(await cancelled).toBeNull();
  });

  it('a dialog replaced by a newer one counts as cancelled', async () => {
    const dialog = new DialogService();
    const first = dialog.prompt({ title: 'a' });
    const second = dialog.confirm({ title: 'b' });
    expect(await first).toBeNull();
    dialog.close(true);
    expect(await second).toBe(true);
  });

  it('alert has one button and carries the icon', async () => {
    const dialog = new DialogService();
    const done = dialog.alert({ title: 'ทำรายการไม่สำเร็จ', text: 'สถานะเปลี่ยนไปแล้ว', icon: 'error' });
    expect(dialog.state()).toMatchObject({ kind: 'alert', icon: 'error' });
    dialog.close(true);
    await done;
  });
});
