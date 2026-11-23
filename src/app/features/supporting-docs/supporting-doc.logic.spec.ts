import { describe, expect, it } from 'vitest';
import {
  NO_FILTERS,
  type SupportingDocRow,
  apiFormType,
  buildSaveBody,
  checkBeforeSave,
  detailOf,
  docDate,
  employeeLabel,
  filterRows,
  formatDocDate,
  isoToView,
  listPaging,
  mergeLocalFiles,
  newestFirst,
  normalizePersonName,
  normalizeRow,
  optStr,
  pageInfo,
  pageOf,
  parseViewDate,
  prospectLabel,
  receiverBySalePerson,
  saveOutcome,
  statusClass,
  statusDisplay,
  totalPages,
} from './supporting-doc.logic';
import { SUPPORTING_DOC_TYPES, supportingActionType, supportingDocType, supportingRole } from './supporting-doc-types';

const row = (o: Partial<SupportingDocRow>): SupportingDocRow => ({
  id: 1, quotationNo: 'CA-00001', quotationDate: '2026-10-05', customerCode: 'P00001', customerName: 'สมชาย ใจดี', customerAvatar: '', salesperson: 'สุดา รักงาน', receiveDate: '2026-10-06', status: 'ACTIVE', ...o,
});

describe('supporting document families', () => {
  it('has the seven families of the menu, each with what the Java copies differed in', () => {
    expect(SUPPORTING_DOC_TYPES.map((t) => t.slug)).toEqual([
      'letter-of-intent', 'legal-credit-request', 'service-contract', 'loan-agreement', 'preliminary-credit-approval', 'property-project-contract', 'credit-application',
    ]);
    expect(SUPPORTING_DOC_TYPES.map((t) => [t.listPage, t.subPage, t.acts, t.formType])).toEqual([
      ['sales_document', 'sales_document_sub_1', 71, 'formintent'],
      ['sales_document_2', 'sales_document_sub_2', 72, 'formloan'],
      ['sales_document_3', 'sales_document_sub_3', 73, 'servicecontract'],
      ['sales_document_4', 'sales_document_sub_4', 74, 'loanagreement'],
      ['sales_document_5', 'sales_document_sub_5', 75, 'preloanapprove'],
      ['sales_document_6', 'sales_document_sub_6', 76, 'propertycontract'],
      ['sales_document_7', 'sales_document_sub_7', 77, 'formsun'],
    ]);
    expect(SUPPORTING_DOC_TYPES.map((t) => [t.panel, t.rcv, t.docCode])).toEqual([
      ['sd', 'sd1', 'CA'], ['sd2', 'sd2', 'CA'], ['sd3', 'sd3', 'CS'], ['sd4', 'sd4', 'LA'], ['sd5', 'sd5', 'CP'], ['sd6', 'sd6', 'PC'], ['sd7', 'sd7', 'LAF'],
    ]);
  });

  it('knows a family by its route segment and nothing else', () => {
    expect(supportingDocType('loan-agreement')?.n).toBe(4);
    expect(supportingDocType('Loan-Agreement')).toBeUndefined();
    expect(supportingDocType(undefined)).toBeUndefined();
  });

  it('reads the mode of the form from the address', () => {
    expect(supportingActionType('new', null)).toBe('add');
    expect(supportingActionType(undefined, 'edit')).toBe('add');
    expect(supportingActionType('1001', 'edit')).toBe('edit');
    expect(supportingActionType('1001', 'detail')).toBe('detail');
    expect(supportingActionType('1001', null)).toBe('detail');
    expect(supportingActionType('1001', 'add')).toBe('detail');
  });

  it('names the roles of a family', () => {
    expect(supportingRole(SUPPORTING_DOC_TYPES[6], 'Edit')).toBe('CRM_Document_CreditApplication_Edit');
  });
});

describe('rows of the list (SalesDocumentListServlet.normalizeRow)', () => {
  it('reads either spelling of a field and takes the first that is not empty', () => {
    expect(optStr({ txNo: '', txno: 'B' }, 'txNo', 'txno')).toBe('B');
    expect(optStr({ txNo: 'A', txno: 'B' }, 'txNo', 'txno')).toBe('A');
    expect(optStr({}, 'txNo', 'txno')).toBe('');
  });

  it('maps the new envelope and the old one to the same row', () => {
    const fresh = normalizeRow({ id: 5, txNo: 'N1', txDate: '2026-01-02', customerCode: 'C', customerName: 'ชื่อ', customerAvatar: '', receiveByName: 'ผู้รับ', receiveDate: '2026-01-03', status: 'new' });
    const old = normalizeRow({ id: '5', txno: 'N1', txdate: '2026-01-02', customer_code: 'C', customer_name: 'ชื่อ', receive_by_name: 'ผู้รับ', receive_date: '2026-01-03', status: 'new' });
    expect(old).toEqual(fresh);
    expect(fresh).toEqual({ id: 5, quotationNo: 'N1', quotationDate: '2026-01-02', customerCode: 'C', customerName: 'ชื่อ', customerAvatar: '', salesperson: 'ผู้รับ', receiveDate: '2026-01-03', status: 'new' });
  });

  it('shows the creator when there is no receiver, and "-" for none or "0"', () => {
    expect(normalizeRow({ createdBy: 'E101' }).salesperson).toBe('E101');
    expect(normalizeRow({ created_by: 'E102' }).salesperson).toBe('E102');
    expect(normalizeRow({ receiveByName: '0' }).salesperson).toBe('-');
    expect(normalizeRow({}).salesperson).toBe('-');
  });

  it('folds a doubled host of the avatar and leaves a data address alone', () => {
    expect(normalizeRow({ customerAvatar: 'http://h/http://h/a/b.png' }).customerAvatar).toBe('http://h/a/b.png');
    expect(normalizeRow({ customerAvatar: 'data:image/png;base64,AAA' }).customerAvatar).toBe('data:image/png;base64,AAA');
  });

  it('tells the status as the badge shows it', () => {
    expect([ 'ACTIVE', 'WAIT_APPROVE', 'REJECTED', 'new', 'cancel', 'DRAFT', '', null ].map(statusDisplay)).toEqual(['สำเร็จ', 'รออนุมัติ', 'ไม่อนุมัติ', 'สร้างใหม่', 'ยกเลิก', 'DRAFT', '', '']);
    expect(['ACTIVE', 'WAIT_APPROVE', 'REJECTED', 'new', 'cancel', 'DRAFT', null].map(statusClass)).toEqual([
      'status-success', 'status-pending', 'status-rejected', 'status-new', 'status-rejected', 'status-pending', 'status-pending',
    ]);
  });
});

describe('dates', () => {
  it('writes dd/MM/yyyy for a yyyy-MM-dd text and nothing for anything else', () => {
    expect(formatDocDate('2026-10-05')).toBe('05/10/2026');
    expect(formatDocDate('2026-1-5')).toBe('05/01/2026');
    expect(formatDocDate('2026-10-05T10:00:00')).toBe('05/10/2026');
    expect(formatDocDate('')).toBe('');
    expect(formatDocDate('05/10/2026')).toBe('');
    expect(formatDocDate('2026-13-01')).toBe('');
    expect(formatDocDate(null)).toBe('');
  });

  it('keeps isoToView of the script as it was (a text that is not y-m-d is shown as it is)', () => {
    expect(isoToView('2026-10-05')).toBe('05/10/2026');
    expect(isoToView('2026/10/05')).toBe('2026/10/05');
    expect(isoToView('2026-10-05T10:00:00')).toBe('05T10:00:00/10/2026'); // split('-') has three parts: the script does not look further
    expect(isoToView('')).toBe('');
  });

  it('reads and writes the calendar pattern', () => {
    expect(docDate('2026-1-5')).toBe('2026-01-05');
    expect(parseViewDate('05/10/2026')).toBe('2026-10-05');
    expect(parseViewDate('5/1/2026')).toBe('2026-01-05');
    expect(parseViewDate('31/02/2026')).toBe('');
    expect(parseViewDate('abc')).toBe('');
  });
});

describe('filter and pager (Sales_DocumentView)', () => {
  const rows = [
    row({ id: 1, quotationNo: 'CA-00001', customerName: 'สมชาย ใจดี', status: 'ACTIVE', quotationDate: '2026-10-05' }),
    row({ id: 2, quotationNo: 'CA-00002', customerName: 'สุดา รักงาน', customerCode: 'P00002', status: 'WAIT_APPROVE', quotationDate: '2026-11-15', salesperson: 'E101' }),
    row({ id: 3, quotationNo: 'ca-00003', customerName: 'วิชัย', customerCode: 'p00003', status: 'cancel', quotationDate: '' }),
  ];

  it('passes every row when no box is used (a box of spaces is not used)', () => {
    expect(filterRows(rows, NO_FILTERS)).toHaveLength(3);
    expect(filterRows(rows, { ...NO_FILTERS, docNo: '   ' })).toHaveLength(3);
  });

  it('contains, ignoring case, in each field; the date is a plain substring of dd/MM/yyyy', () => {
    expect(filterRows(rows, { ...NO_FILTERS, docNo: 'CA-0000' }).map((r) => r.id)).toEqual([1, 2, 3]);
    expect(filterRows(rows, { ...NO_FILTERS, docNo: 'CA-00003' }).map((r) => r.id)).toEqual([3]);
    expect(filterRows(rows, { ...NO_FILTERS, customerCode: 'P0000' }).map((r) => r.id)).toEqual([1, 2, 3]);
    expect(filterRows(rows, { ...NO_FILTERS, customerName: 'รัก' }).map((r) => r.id)).toEqual([2]);
    expect(filterRows(rows, { ...NO_FILTERS, responsible: 'e101' }).map((r) => r.id)).toEqual([2]);
    expect(filterRows(rows, { ...NO_FILTERS, status: 'รออนุ' }).map((r) => r.id)).toEqual([2]);
    expect(filterRows(rows, { ...NO_FILTERS, status: 'CANCEL' }).map((r) => r.id)).toEqual([]); // the shown text is "ยกเลิก", not the code
    expect(filterRows(rows, { ...NO_FILTERS, docDate: '/11/' }).map((r) => r.id)).toEqual([2]);
    expect(filterRows(rows, { ...NO_FILTERS, docNo: 'ca', status: 'สำเร็จ' }).map((r) => r.id)).toEqual([1]);
  });

  it('pages: clamps the page, 20 a page, and says "from-to จาก total"', () => {
    const many = Array.from({ length: 45 }, (_x, i) => i + 1);
    expect(totalPages(45, 20)).toBe(3);
    expect(pageOf(many, 1, 20)).toMatchObject({ page: 1, rows: many.slice(0, 20) });
    expect(pageOf(many, 3, 20).rows).toEqual(many.slice(40));
    expect(pageOf(many, 9, 20).page).toBe(3);
    expect(pageOf(many, 0, 20).page).toBe(1);
    expect(pageOf([], 4, 20)).toEqual({ rows: [], page: 4 });
    expect(pageInfo(45, 1, 20)).toBe('1-20 จาก 45');
    expect(pageInfo(45, 3, 20)).toBe('41-45 จาก 45');
    expect(pageInfo(0, 1, 20)).toBe('0 รายการ');
  });

  it('puts the newest first and clamps the page size of the service', () => {
    expect([row({ id: 2 }), row({ id: 9 }), row({ id: 4 })].sort(newestFirst).map((r) => r.id)).toEqual([9, 4, 2]);
    expect(listPaging(0, 0)).toEqual({ page: 1, perPage: 20 });
    expect(listPaging(3, 500)).toEqual({ page: 3, perPage: 100 });
    expect(listPaging(-2, 7)).toEqual({ page: 1, perPage: 7 });
  });

  it('sends the lowercase formType unless the style is "new"', () => {
    expect(apiFormType('formintent', 'LetterofIntent', 'old')).toBe('formintent');
    expect(apiFormType('formintent', 'LetterofIntent', '')).toBe('formintent');
    expect(apiFormType('formintent', 'LetterofIntent', 'NEW')).toBe('LetterofIntent');
  });
});

describe('the document (loadDetailAPI) and its save (saveDocument)', () => {
  const doc = {
    id: 1004, txNo: 'CA-00004', status: 'ACTIVE', txDate: '2026-10-05', receiveDate: '2026-10-06T00:00:00', referenceDocNo: 'REF-1', referenceDocDate: '2026-10-01', remark: 'หมายเหตุ',
    description: 'รายละเอียด', existsTxNo: 'OLD-1', flowRefDocType: 'LD', flowRefDocNo: 'LD-1', customerCode: 'P00007', customerName: 'ลูกค้า', receiveByCode: 'E102', receiveByName: 'สุดา',
    attachItems: [{ attachFile: 'http://h/http://h/f/a.pdf', description: 'd1' }, { attachFile: '', description: '' }, null],
    formsun: { borrower: { loantype: 'A', price: 100 }, coBorrower: { personalNameTh: 'ร่วม' }, guarantor: null },
  };

  it('reads the fields, the dates and the files', () => {
    const d = detailOf(doc, 'formintent', '1004');
    expect(d.fields).toMatchObject({ txNo: 'CA-00004', statusText: 'สำเร็จ', referenceDocNo: 'REF-1', customerCode: 'P00007', receiveByCode: 'E102', flowRefDocNo: 'LD-1' });
    expect(Object.keys(d.fields).some((k) => k.startsWith('b_'))).toBe(false); // only the credit application has the three people
    expect([d.txDate, d.refDate, d.receiveDate]).toEqual(['2026-10-05', '2026-10-01', '2026-10-06']);
    expect(d.files.map((f) => [f.filename, f.remoteUrl, f.description])).toEqual([['a.pdf', 'http://h/f/a.pdf', 'd1'], ['เอกสาร 2', '', '']]);
    expect(d.docId).toBe('1004');
  });

  it('prefixes the people of the credit application', () => {
    const d = detailOf(doc, 'formsun', '1004');
    expect(d.fields).toMatchObject({ b_loantype: 'A', b_price: '100', c_personalNameTh: 'ร่วม' });
    expect(Object.keys(d.fields).filter((k) => k.startsWith('g_'))).toEqual([]);
  });

  it('adds the files of the browser that the backend does not list by name', () => {
    const server = [{ filename: 'a.pdf', contentType: '', size: 0, description: '', remoteUrl: 'x' }];
    const local = [{ filename: 'a.pdf', contentType: '', size: 1, description: 'old', remoteUrl: '' }, { filename: 'b.pdf', contentType: '', size: 1, description: '', remoteUrl: '' }];
    expect(mergeLocalFiles(server, local).map((f) => f.filename)).toEqual(['a.pdf', 'b.pdf']);
    expect(mergeLocalFiles(server, undefined)).toEqual(server);
  });

  it('refuses a new document without a customer, and any without a receive date', () => {
    expect(checkBeforeSave({ isUpdate: false, customerId: ' ', receiveDate: '2026-10-05' })?.detail).toBe('กรุณาเลือกลูกค้า');
    expect(checkBeforeSave({ isUpdate: true, customerId: '', receiveDate: '2026-10-05' })).toBeUndefined();
    expect(checkBeforeSave({ isUpdate: true, customerId: '', receiveDate: '' })?.detail).toBe('กรุณาเลือกวันที่รับเอกสาร');
    expect(checkBeforeSave({ isUpdate: false, customerId: '', receiveDate: '' })?.detail).toBe('กรุณาเลือกลูกค้า');
  });

  const base = { formType: 'formintent' as const, apiFormType: 'formintent', isUpdate: false, raw: null, fields: {}, txDate: '', refDate: '', receiveDate: '2026-10-05' };

  it('builds the body of a new document from the fields of the form', () => {
    const body = buildSaveBody({ ...base, fields: { remark: 'r', referenceDocNo: 'x', customerId: '7', receiveById: '3', existsTxNo: 'e' }, txDate: '2026-10-01' });
    expect(body).toEqual({
      formType: 'formintent', txDate: '2026-10-01', receiveDate: '2026-10-05', remark: 'r', referenceDocNo: 'x', description: '', existsTxNo: 'e', flowRefDocType: '', flowRefDocNo: '', receiveById: 3, customerId: 7,
    });
  });

  it('sends the ids as text when they are not whole numbers, and falls back to receiveBy', () => {
    const body = buildSaveBody({ ...base, fields: { customerId: 'C-7', receiveBy: ' 5 ' } });
    expect(body['customerId']).toBe('C-7');
    expect(body['receiveById']).toBe(5);
  });

  it('an update starts from the whole document minus what the backend owns; a cleared receiver goes as null', () => {
    const body = buildSaveBody({ ...base, isUpdate: true, raw: doc as never, fields: { remark: 'ใหม่', customerId: '7' } });
    for (const k of ['id', 'txNo', 'status', 'createBy', 'customerCode', 'customerName', 'customerAvatar', 'receiveByCode', 'receiveByName', 'receiveByAvatar', 'attachItems']) expect(body).not.toHaveProperty(k);
    expect(body).toMatchObject({ remark: 'ใหม่', receiveById: null, customerId: 7, referenceDocNo: '' });
    expect(doc.txNo).toBe('CA-00004'); // the copy is deep: the source is not touched
    expect(body['receiveDate']).toBe('2026-10-05');
  });

  it('writes the three people of the credit application back over what the backend sent', () => {
    const body = buildSaveBody({
      ...base, formType: 'formsun', apiFormType: 'formsun', isUpdate: true, raw: doc as never,
      fields: { b_loantype: 'B', c_personalNameTh: 'ใหม่', g_gender: 'ชาย', customerId: '7' },
    });
    const fs = body['formsun'] as Record<string, Record<string, unknown>>;
    expect(fs['borrower']).toEqual({ loantype: 'B', price: 100 });
    expect(fs['coBorrower']).toEqual({ personalNameTh: 'ใหม่' });
    expect(fs['guarantor']).toEqual({ gender: 'ชาย' });
  });

  it('reads the answer of the save', () => {
    expect(saveOutcome('{"status":200,"result":{"id":1005,"txNo":"CA-00005"}}')).toEqual({ ok: true, status: 200, id: '1005', txNo: 'CA-00005' });
    expect(saveOutcome('{"status":400,"message":"x"}')).toMatchObject({ ok: false, status: 400 });
    expect(saveOutcome('{"result":{}}')).toMatchObject({ ok: false, status: -1 });
    expect(saveOutcome('')).toMatchObject({ ok: false, status: -1 });
    expect(saveOutcome('<html>')).toMatchObject({ ok: false, status: -1 });
  });
});

describe('the receiver of a customer (selectReceiverBySalePersonName)', () => {
  const emps = [{ id: 1, code: 'E101', name: 'สมชาย ใจดี' }, { id: 2, code: 'E102', name: 'สุดา รักงาน' }, { id: 3, code: 'E103', name: 'นายสมชาย ใจดี' }];

  it('cuts one leading title and folds white space', () => {
    expect(normalizePersonName('  นางสาว   สุดา  รักงาน ')).toBe('สุดา รักงาน');
    expect(normalizePersonName('คุณสมชาย ใจดี')).toBe('สมชาย ใจดี');
    expect(normalizePersonName('Mr. John Smith')).toBe('john smith');
    expect(normalizePersonName('Mrs Jane')).toBe('jane');
    expect(normalizePersonName('MS')).toBe('ms'); // a title alone is a name
    expect(normalizePersonName('นายนาย')).toBe('นาย'); // only one title is cut
    expect(normalizePersonName(null)).toBe('');
  });

  it('matches by name without the title, the first of equal names, none for a name nobody has', () => {
    expect(receiverBySalePerson('คุณสุดา รักงาน', emps)?.id).toBe(2);
    expect(receiverBySalePerson('สมชาย ใจดี', emps)?.id).toBe(1);
    expect(receiverBySalePerson('นายสมชาย ใจดี', emps)?.id).toBe(1);
    expect(receiverBySalePerson('ไม่มีคนนี้', emps)).toBeUndefined();
    expect(receiverBySalePerson('', emps)).toBeUndefined();
  });

  it('labels the dropdown items', () => {
    expect(prospectLabel({ id: 1, code: 'P1', name: 'ชื่อ' })).toBe('P1 ชื่อ');
    expect(employeeLabel({ id: 1, code: 'E1', name: '' })).toBe('E1');
    expect(employeeLabel({ id: 1, code: 'E1', name: 'ชื่อ' })).toBe('ชื่อ');
  });
});
