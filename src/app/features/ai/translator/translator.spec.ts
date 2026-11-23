import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import { startOpenDownSelect, type OpenDownSelect } from '@core/dom/open-down-select';
import { authStub, configStub } from '@core/testing/test-helpers';
import { DialogService } from '@shared/ui/notify/dialog.service';
import { ToastService } from '@shared/ui/notify/toast.service';
import { Translator } from './translator';
import { TranslatorView } from './translator-view';
import { mockTranslatorFetch, resetMockTranslator } from './translator.mock';

const BASE = '/triplesale';
const NOW = new Date();

const pad = (n: number) => String(n).padStart(2, '0');
const mdy = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

function setup() {
  (globalThis as any).__AIT_MOCK_NOW = NOW.toISOString();
  resetMockTranslator();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ConfigService, useValue: configStub({ mock: true }) },
      { provide: AuthService, useValue: authStub([], 1001) },
      DialogService,
      ToastService,
    ],
  });
  const dialog = TestBed.inject(DialogService);
  const toast = TestBed.inject(ToastService);
  return {
    dialog,
    toast,
    confirm: vi.spyOn(dialog, 'confirm').mockResolvedValue(true),
    prompt: vi.spyOn(dialog, 'prompt').mockResolvedValue('เหตุผล'),
    alert: vi.spyOn(dialog, 'alert').mockResolvedValue(undefined),
    toasts: () => toast.toasts().map((t) => t.text),
  };
}

const q = <T extends HTMLElement = HTMLElement>(el: HTMLElement, sel: string) => el.querySelector<T>(sel)!;
const qa = (el: HTMLElement, sel: string) => [...el.querySelectorAll<HTMLElement>(sel)];
const nos = (el: HTMLElement) => qa(el, '#aitDocRows .ait-doc-no').map((n) => n.textContent);
const settle = () => new Promise((r) => setTimeout(r, 0));
/** jsdom evaluates inline `onclick="aitEditSave()"` in its own global, not the one the engine put `aitEditSave` on — run the handler text the way a browser would */
const fire = (el: Element, attr = 'onclick') => new Function('event', el.getAttribute(attr)!).call(el, new Event(attr.slice(2)));

async function mount() {
  const fixture = TestBed.createComponent(TranslatorView);
  fixture.detectChanges();
  await fixture.whenStable();
  const el: HTMLElement = fixture.nativeElement;
  await vi.waitFor(() => expect(el.querySelectorAll('#aitDocRows .ait-doc-no').length).toBeGreaterThan(0), { timeout: 3000 });
  return { fixture, el };
}
const input = (el: HTMLElement, id: string, value: string, type = 'input') => {
  const field = q<HTMLInputElement>(el, '#' + id);
  field.value = value;
  field.dispatchEvent(new Event(type, { bubbles: true }));
};
/** the way a user finds a document: type its number in the search box, click the row */
const open = async (el: HTMLElement, no: string) => {
  input(el, 'aitDocSearch', no);
  q(el, '#aitDocRows tr').click();
  await settle();
  expect(q(el, '.ait-dt-no').textContent).toContain(no);
};
const act = (el: HTMLElement, name: string) => q(el, `#aitDetailCard [data-act="${name}"]`).click();
const status = async (no: string) => ((await (await mockTranslatorFetch(`${BASE}/aitran?action=list`, undefined, BASE)).json()).documents as any[]).find((d) => d.no === no).status;

describe('AI Document Translator screen', () => {
  let ods: OpenDownSelect | undefined;

  beforeEach(() => {
    // jsdom has no layout / navigation APIs the page calls
    Element.prototype.scrollIntoView = vi.fn();
    (URL as any).createObjectURL = vi.fn(() => 'blob:x');
    vi.spyOn(window, 'open').mockReturnValue(null);
  });
  afterEach(() => {
    ods?.destroy();
    ods = undefined;
    vi.useRealTimers();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    localStorage.clear();
    delete (globalThis as any).__AIT_MOCK_NOW;
    document.body.innerHTML = '';
  });

  it('renders the Java markup, loads the documents, the statistic cards and the first document', async () => {
    setup();
    const { fixture, el } = await mount();

    expect(el.querySelector('.ait-root')).toBeTruthy();
    expect(nos(el)).toEqual(['QT-2026-00014', 'QT-2026-00013', 'QT-2026-00012', 'QT-2026-00011', 'QT-2026-00010']); // 5 per page, the 48-day-old one is outside "last 30 days"
    expect(qa(el, '#aitPager .ait-pg').map((b) => b.textContent)).toEqual(['', '1', '2', '3', '']); // prev, 3 pages, next
    const stats = qa(el, '#aitStats .ait-stat');
    expect(stats).toHaveLength(8);
    expect(stats[0].querySelector('.ait-stat-l')?.textContent).toBe('ทั้งหมด');
    expect(stats[0].querySelector('.ait-stat-v')?.textContent).toBe('13');
    expect(stats.find((s) => s.dataset['key'] === 'sent')?.querySelector('.ait-stat-l')?.textContent).toBe('ส่งรับรองงาน'); // the short label of the card

    // the first document is open: its tabs and the buttons of its status ("quoted")
    expect(q(el, '#aitDocRows tr').classList.contains('on')).toBe(true);
    expect(q(el, '.ait-dt-no').textContent).toBe('รายละเอียดเอกสาร: QT-2026-00014');
    expect(q(el, '.ait-dt-hd .ait-badge').textContent).toBe('เสนอราคา');
    expect(qa(el, '#aitDetailCard .ait-dt-acts [data-act]').map((b) => b.dataset['act'])).toEqual(['confirm', 'edit', 'quotation', 'cancel']);
    expect(q(el, '#aitDtPane .ait-dt-kv').textContent).toContain('บริษัท เอซีอี โซลูชั่น จำกัด');
    expect(qa(el, '.ait-tl-i')).toHaveLength(9);
    expect(q(el, '.ait-tl-i.current').textContent).toContain('เสนอราคา');
    // the translated-files tab is off until the translation is done
    expect(q(el, '#aitDtTabs .ait-tab[data-t="trans"]').classList.contains('off')).toBe(true);
    fixture.destroy();
  });

  it('filters: a statistic card, the search box, the status box and the created-date range (default: the last 30 days)', async () => {
    setup();
    const { fixture, el } = await mount();

    q(el, '.ait-stat[data-key="pending"]').click();
    expect(nos(el)).toEqual(['QT-2026-00013', 'QT-2026-00012']);
    expect(q(el, '.ait-stat[data-key="pending"]').classList.contains('on')).toBe(true);
    q(el, '.ait-stat[data-key="pending"]').click(); // again = off
    expect(nos(el)).toHaveLength(5);

    input(el, 'aitDocSearch', 'somchai');
    expect(nos(el)).toEqual(['QT-2026-00013', 'QT-2026-00007']);
    input(el, 'aitDocSearch', 'zzzz');
    expect(q(el, '#aitDocRows').textContent).toContain('ไม่พบเอกสารตามเงื่อนไขที่เลือก');

    input(el, 'aitDocSearch', 'QT-2026-00001'); // 48 days old: hidden by the default range …
    expect(q(el, '#aitDocRows').textContent).toContain('ไม่พบเอกสาร');
    expect(q<HTMLInputElement>(el, '#aitDateFrom').value).toBe(mdy(NOW.getTime() - 30 * 86_400_000));
    expect(q<HTMLInputElement>(el, '#aitDateTo').value).toBe(mdy(NOW.getTime()));
    input(el, 'aitDateFrom', '01/01/2020', 'change'); // … until the range is widened
    expect(nos(el)).toEqual(['QT-2026-00001']);

    // the status box
    input(el, 'aitDocSearch', '');
    input(el, 'aitDateFrom', '01/01/2020', 'change');
    input(el, 'aitStatusSel', 'done', 'change');
    expect(nos(el)).toEqual(['QT-2026-00004', 'QT-2026-00003', 'QT-2026-00001']);
    // paging
    input(el, 'aitStatusSel', '', 'change');
    q(el, '.ait-pg[data-go="next"]').click();
    expect(nos(el)[0]).toBe('QT-2026-00009');
    fixture.destroy();
  });

  it('opens the detail card tabs: files, translated files (read from the service), history', async () => {
    setup();
    const { fixture, el } = await mount();
    await open(el, 'QT-2026-00009'); // reviewing: the translated files exist
    q(el, '#aitDtTabs .ait-tab[data-t="files"]').click();
    expect(qa(el, '#aitDtPane .ait-file .fnm').map((n) => n.textContent)).toEqual(['Invoice_2026_Q1.pdf', 'PO_Company_A.pdf']);

    q(el, '#aitDtTabs .ait-tab[data-t="trans"]').click();
    expect(q(el, '#aitDtPane').textContent).toContain('กำลังอ่านรายการไฟล์แปล');
    await vi.waitFor(() => expect(qa(el, '#aitDtPane .ait-file')).toHaveLength(4));
    expect(qa(el, '#aitDtPane .ait-file .fnm').map((n) => n.firstChild?.textContent)).toEqual(['Invoice_2026_Q1_TH.docx', 'Invoice_2026_Q1_TH.pdf', 'PO_Company_A_TH.docx', 'PO_Company_A_TH.pdf']);
    expect(qa(el, '.ait-q.ok')).toHaveLength(1);
    expect(q(el, '.ait-q.warn').title).toContain('หน้า 2 บรรทัด 4');
    // pdf can be viewed and downloaded, docx downloaded only
    expect(qa(el, '#aitDtPane .ait-file')[0].querySelectorAll('[data-open]')).toHaveLength(1);
    expect(qa(el, '#aitDtPane .ait-file')[1].querySelectorAll('[data-open]')).toHaveLength(2);

    q(el, '#aitDtTabs .ait-tab[data-t="history"]').click();
    expect(qa(el, '#aitDtPane .ait-file').length).toBeGreaterThanOrEqual(3);
    fixture.destroy();
  });

  it('a status button asks first, then posts, tells the result and reloads: translate', async () => {
    const { confirm, toasts } = setup();
    const { fixture, el } = await mount();
    await open(el, 'QT-2026-00013'); // pending
    expect(qa(el, '#aitDetailCard .ait-dt-acts [data-act]').map((b) => b.dataset['act'])).toEqual(['translate', 'edit', 'quotation', 'cancel']);

    act(el, 'translate');
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'ส่งเอกสารเข้าคิวแปล', okText: 'แปลเอกสาร', cancelText: 'ยกเลิก', icon: 'info', text: expect.stringContaining('เอกสาร: QT-2026-00013') }));
    await vi.waitFor(() => expect(toasts()).toContain('ส่งเอกสารเข้าคิวแปลแล้ว'));
    await vi.waitFor(() => expect(q(el, '.ait-dt-hd .ait-badge').textContent).toBe('กำลังแปล'));
    expect(qa(el, '#aitDetailCard .ait-dt-acts [data-act]').map((b) => b.dataset['act'])).toEqual(['edit', 'quotation', 'cancel']); // nothing to press while it is being translated
    fixture.destroy();
  });

  it('answering "cancel" to the question changes nothing and posts nothing', async () => {
    const { confirm } = setup();
    confirm.mockResolvedValue(false);
    const { fixture, el } = await mount();
    await open(el, 'QT-2026-00013');
    act(el, 'translate');
    await settle();
    await settle();
    expect(await status('QT-2026-00013')).toBe('pending');
    fixture.destroy();
  });

  it('"ไม่อนุมัติ" needs a reason; with one the document goes back to "รอแปล" and the reason is shown in red', async () => {
    const { prompt, toasts } = setup();
    const { fixture, el } = await mount();
    await open(el, 'QT-2026-00009'); // reviewing
    prompt.mockResolvedValueOnce('   ');
    act(el, 'reject');
    await vi.waitFor(() => expect(toasts()).toContain('กรุณากรอกเหตุผลที่ไม่อนุมัติ'));
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ title: 'ไม่อนุมัติงานแปล', placeholder: 'เช่น คำศัพท์เฉพาะทางแปลผิด, ตกหน้า 3', okText: 'ไม่อนุมัติ' }));
    expect(await status('QT-2026-00009')).toBe('reviewing');

    prompt.mockResolvedValueOnce(null); // dialog cancelled
    act(el, 'reject');
    await settle();
    expect(await status('QT-2026-00009')).toBe('reviewing');

    prompt.mockResolvedValueOnce('ตกหน้า 3');
    act(el, 'reject');
    await vi.waitFor(() => expect(q(el, '.ait-dt-hd .ait-badge').textContent).toBe('รอแปล'));
    expect(q(el, '.ait-reject').textContent).toContain('ถูกตีกลับให้แปลใหม่');
    expect(q(el, '.ait-reject').textContent).toContain('ตกหน้า 3');
    fixture.destroy();
  });

  it('a stale click (the status moved on behind the page) is a conflict: the error is shown and the list reloaded', async () => {
    const { alert } = setup();
    const { fixture, el } = await mount();
    await open(el, 'QT-2026-00014'); // quoted — the page shows "ลูกค้าตอบรับ"
    const form = new FormData();
    form.append('no', 'QT-2026-00014');
    await mockTranslatorFetch(`${BASE}/aitran?action=confirm`, { method: 'POST', body: form }, BASE); // somebody else pressed it

    act(el, 'confirm');
    await vi.waitFor(() => expect(alert).toHaveBeenCalledWith(expect.objectContaining({ title: 'ทำรายการไม่สำเร็จ', icon: 'error', text: expect.stringContaining('สถานะของเอกสารเปลี่ยนไปแล้ว') })));
    await vi.waitFor(() => expect(q(el, '.ait-dt-hd .ait-badge').textContent).toBe('รอแปล'));
    fixture.destroy();
  });

  it('cancelling a document asks for the reason and shows it', async () => {
    const { prompt } = setup();
    const { fixture, el } = await mount();
    await open(el, 'QT-2026-00013');
    prompt.mockResolvedValueOnce('ลูกค้าเปลี่ยนใจ');
    act(el, 'cancel');
    await vi.waitFor(() => expect(q(el, '.ait-dt-hd .ait-badge').textContent).toBe('ยกเลิก'));
    expect(q(el, '.ait-reject').textContent).toContain('ยกเลิกงานนี้');
    expect(q(el, '.ait-reject').textContent).toContain('ลูกค้าเปลี่ยนใจ');
    expect(qa(el, '#aitDetailCard .ait-dt-acts [data-act]').map((b) => b.dataset['act'])).toEqual(['quotation']); // a finished job is history
    fixture.destroy();
  });

  it('the edit dialog: pre-filled (the Thai due date as dd/mm/yyyy), refuses a bad date, saves and shows the change', async () => {
    const { alert, toasts } = setup();
    const { fixture, el } = await mount();
    await open(el, 'QT-2026-00014');
    act(el, 'edit');
    expect(q(el, '#aitEditMod').classList.contains('on')).toBe(true);
    expect(q(el, '#aitEdNo').textContent).toBe('QT-2026-00014');
    expect(q<HTMLInputElement>(el, '#aitEdContact').value).toBe('คุณสกล นามสมมติ');
    expect(q<HTMLInputElement>(el, '#aitEdDue').value).toBe(mdy(NOW.getTime() - 3 * 3_600_000 + 4 * 86_400_000)); // "24 ต.ค. 2569" → 24/10/2026
    expect(q<HTMLInputElement>(el, '#aitEdSrc').value).toBe('EN');

    input(el, 'aitEdContact', 'คุณทดสอบ');
    input(el, 'aitEdDue', '2026-10-25');
    fire(q(el, '#aitEdSaveBtn'));
    await vi.waitFor(() => expect(alert).toHaveBeenCalledWith(expect.objectContaining({ title: 'บันทึกไม่สำเร็จ', text: expect.stringContaining('dd/mm/yyyy') })));
    expect(q(el, '#aitEditMod').classList.contains('on')).toBe(true);
    expect(q<HTMLButtonElement>(el, '#aitEdSaveBtn').disabled).toBe(false);

    input(el, 'aitEdDue', '25/10/2026');
    fire(q(el, '#aitEdSaveBtn'));
    await vi.waitFor(() => expect(toasts()).toContain('บันทึกการแก้ไขแล้ว'));
    expect(q(el, '#aitEditMod').classList.contains('on')).toBe(false);
    await vi.waitFor(() => expect(q(el, '#aitDtPane .ait-dt-kv').textContent).toContain('คุณทดสอบ'));
    expect(q(el, '#aitDtPane .ait-dt-kv').textContent).toContain('25 ต.ค. 2569');

    act(el, 'edit'); // a click on the backdrop closes it (onclick="if(event.target===this)aitEditClose()"), so does the x button
    expect(q(el, '#aitEditMod').getAttribute('onclick')).toContain('aitEditClose()');
    fire(q(el, '.ait-modx'));
    expect(q(el, '#aitEditMod').classList.contains('on')).toBe(false);
    fixture.destroy();
  });

  it('opens the quotation / a translated file through window.open (a stand-in page in dev mode)', async () => {
    setup();
    const { fixture, el } = await mount();
    act(el, 'quotation');
    await vi.waitFor(() => expect(window.open).toHaveBeenCalledWith('blob:x', '_blank'));
    expect((URL.createObjectURL as any).mock.calls[0][0]).toBeInstanceOf(Blob); // the stand-in page itself is checked in translator.mock.spec
    fixture.destroy();
  });

  it('customer search, upload and save: locked until a customer is chosen, files are checked, the quotation is created', async () => {
    const { confirm } = setup();
    ods = startOpenDownSelect({ text: () => ({}), defaultAvatar: '' }); // the system dropdown the page builds its suggestions on
    const { fixture, el } = await mount();
    const drop = q(el, '#aitDrop');
    expect(drop.classList.contains('locked')).toBe(true);
    expect(q<HTMLButtonElement>(el, '#aitPickBtn').disabled).toBe(true);
    expect(q<HTMLButtonElement>(el, '#aitSaveBtn').disabled).toBe(true);
    expect(q(el, '#aitCusBox').textContent).toContain('ไม่พบลูกค้าที่ค้นหา'); // what the first render says when no customer is remembered

    input(el, 'aitCusSearch', 'เอซี');
    await vi.waitFor(() => expect(document.querySelector('.ods-list.ods-ac.open .ods-item')).toBeTruthy(), { timeout: 3000 }); // debounce 250 ms + the fake service
    expect(document.querySelector('.ods-list.ods-ac.open .ait-sg-code')?.textContent).toBe('CUS-000101');
    document.querySelector<HTMLElement>('.ods-list.ods-ac.open .ods-item')!.click();
    expect(q(el, '.ait-cus-name').textContent).toBe('บริษัท เอซีอี โซลูชั่น จำกัด');
    expect(q(el, '.ait-kv').textContent).toContain('CUS-000101');
    expect(q<HTMLAnchorElement>(el, '#aitMoreBtn').getAttribute('href')).toBe('/crm/prospects/101');
    expect(drop.classList.contains('locked')).toBe(false);
    expect(q<HTMLButtonElement>(el, '#aitPickBtn').disabled).toBe(false);
    expect(q<HTMLButtonElement>(el, '#aitSaveBtn').title).toBe('เลือกเอกสารอย่างน้อย 1 ไฟล์');
    expect(JSON.parse(localStorage.getItem('ait.cus.test-state-key')!)).toMatchObject({ id: 101, code: 'CUS-000101' }); // remembered for this sign-in

    // 2 good files and a .txt (skipped, and said so)
    const files = [new File(['x'.repeat(4096)], 'a.pdf'), new File(['y'.repeat(2048)], 'b.png'), new File(['z'], 'c.txt')];
    Object.defineProperty(q(el, '#aitFileInput'), 'files', { value: files, configurable: true });
    q(el, '#aitFileInput').dispatchEvent(new Event('change', { bubbles: true }));
    expect(qa(el, '#aitFileList .ait-file .fnm').map((n) => n.textContent)).toEqual(['a.pdf', 'b.png']);
    expect(q(el, '#aitFileSum').textContent).toContain('รวม 2 ไฟล์');
    expect(q<HTMLButtonElement>(el, '#aitSaveBtn').disabled).toBe(false);
    q(el, '.ait-file-del').click();
    expect(qa(el, '#aitFileList .ait-file')).toHaveLength(1);
    Object.defineProperty(q(el, '#aitFileInput'), 'files', { value: files.slice(0, 2), configurable: true });
    q(el, '#aitFileInput').dispatchEvent(new Event('change', { bubbles: true })); // the removed one again (the other is a duplicate)
    expect(qa(el, '#aitFileList .ait-file')).toHaveLength(2);

    q(el, '#aitSaveBtn').click();
    expect(q(el, '#aitSaveBtn').textContent).toContain('กำลังอัปโหลด'); // progress of the upload
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'บันทึกเรียบร้อย', okText: 'เปิดใบเสนอราคา', cancelText: 'ปิด', icon: 'success', text: expect.stringContaining('เลขที่เอกสาร QT-2026-00015') })), { timeout: 3000 });
    expect(confirm.mock.calls.at(-1)![0].text).toContain('ราคา 750.00 บาท');
    await vi.waitFor(() => expect(window.open).toHaveBeenCalled()); // "เปิดใบเสนอราคา" was answered yes
    // the new document is on top of the list and open; the files are cleared
    await vi.waitFor(() => expect(nos(el)[0]).toBe('QT-2026-00015'));
    expect(q(el, '.ait-dt-no').textContent).toContain('QT-2026-00015');
    expect(qa(el, '#aitFileList .ait-file')).toHaveLength(0);
    expect(q(el, '#aitSaveBtn').textContent).toContain('บันทึกและสร้างใบเสนอราคา');
    fixture.destroy();
  });

  it('remembers the customer and the filters of this sign-in, drops those of another one', async () => {
    setup();
    localStorage.setItem('ait.cus.test-state-key', JSON.stringify({ id: 102, name: 'Somchai Industrial Co., Ltd.', tag: 'นิติบุคคล', code: 'CUS-000102', tel: '02-555-0102', email: '-', address: '-', area: '-', customerType: '-', agent: '-', source: '-', availtime: '-', social: '-' }));
    localStorage.setItem('ait.flt.test-state-key', JSON.stringify({ kw: 'somchai', status: '', from: '01/01/2020', to: '31/12/2030' }));
    localStorage.setItem('ait.cus.OLD', '{"name":"คนก่อนหน้า"}'); // an earlier sign-in on this machine
    localStorage.setItem('ait.flt.OLD', '{}');
    const { fixture, el } = await mount();
    expect(q(el, '.ait-cus-name').textContent).toBe('Somchai Industrial Co., Ltd.');
    expect(q<HTMLInputElement>(el, '#aitDocSearch').value).toBe('somchai');
    expect(nos(el)).toEqual(['QT-2026-00013', 'QT-2026-00007', 'QT-2026-00001']);
    expect(localStorage.getItem('ait.cus.OLD')).toBeNull();
    expect(localStorage.getItem('ait.flt.OLD')).toBeNull();
    q(el, '#aitCusClearBtn').click();
    expect(localStorage.getItem('ait.cus.test-state-key')).toBeNull();
    expect(q(el, '#aitDrop').classList.contains('locked')).toBe(true);
    fixture.destroy();
  });

  it('the chat asks the translator assistant about the selected document and shows what it answers — or why it could not', async () => {
    setup();
    const { fixture, el } = await mount();
    await open(el, 'QT-2026-00013');
    q(el, '#aitChatHero .ait-sug').click(); // "สรุปใบนี้ให้หน่อย"
    expect(q(el, '#aitChipTxt').textContent).toBe('AI กำลังคิด...');
    expect(el.querySelector('#aitChatBody .ait-typing')).toBeTruthy();
    await vi.waitFor(() => expect(el.querySelector('#aitChatBody .ait-typing')).toBeNull(), { timeout: 3000 });
    const bubbles = qa(el, '#aitChatBody .ait-bub').map((b) => b.textContent);
    expect(bubbles[0]).toBe('สรุปใบนี้ให้หน่อย');
    expect(bubbles[1]).toContain('QT-2026-00013');
    expect(q(el, '#aitChipTxt').textContent).toBe('AI พร้อมให้บริการ');

    const ta = q<HTMLTextAreaElement>(el, '#aitChatTa');
    ta.value = 'ทดสอบล่ม';
    q(el, '#aitChatSend').click();
    await vi.waitFor(() => expect(qa(el, '#aitChatBody .ait-bub').at(-1)?.textContent).toContain('ขออภัยครับ ติดต่อผู้ช่วยแปลไม่ได้'), { timeout: 3000 });
    fixture.destroy();
  });

  it('polls only while something is being translated: a finished translation turns up on its own, with a note', async () => {
    const { toasts } = setup();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { fixture, el } = await mount();
    const form = new FormData();
    form.append('no', 'QT-2026-00013');
    await mockTranslatorFetch(`${BASE}/aitran?action=translate`, { method: 'POST', body: form }, BASE); // sent to the translator (by somebody)

    await vi.advanceTimersByTimeAsync(20_000); // poll 1: the page knew it as "รอแปล", now it is being translated
    await vi.waitFor(() => expect(toasts()).toContain('QT-2026-00013 เปลี่ยนเป็น "กำลังแปล"'));
    expect(toasts().filter((x) => x.includes('ตรวจงานแปล'))).toEqual([]);
    await vi.advanceTimersByTimeAsync(20_000); // poll 2: done
    await vi.waitFor(() => expect(toasts()).toContain('QT-2026-00013 เปลี่ยนเป็น "ตรวจงานแปล"'));
    fixture.destroy();
  });

  it('destroy removes the handlers the markup calls, stops the timers and aborts nothing that is still drawing', async () => {
    setup();
    const { fixture, el } = await mount();
    expect(typeof (window as any).aitEditSave).toBe('function');
    expect(typeof (window as any).aitCancel).toBe('function');
    fixture.destroy();
    expect((window as any).aitEditSave).toBeUndefined();
    expect((window as any).aitEdit).toBeUndefined();
    document.dispatchEvent(new Event('visibilitychange')); // the listener that reloads the list is gone: nothing throws, nothing draws
    await settle();
  });

  it('is the route component: /ai/translator renders the view; the customer link navigates inside the app', async () => {
    setup();
    const fixture = TestBed.createComponent(Translator);
    fixture.detectChanges();
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    await vi.waitFor(() => expect(el.querySelectorAll('#aitDocRows .ait-doc-no').length).toBeGreaterThan(0), { timeout: 3000 });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    q(el, '.ait-root').insertAdjacentHTML('beforeend', '<a id="go" href="/crm/prospects/101">x</a>');
    q(el, '#go').click();
    expect(navigate).toHaveBeenCalledWith('/crm/prospects/101');
    fixture.destroy();
  });
});
