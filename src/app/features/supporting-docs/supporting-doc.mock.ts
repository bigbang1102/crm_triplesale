/**
 * The fake backend of the supporting-document screens (mock mode, tests and the Java-vs-Angular comparison): an in-memory
 * `triplesale-service` for the seven document families, answering the REST calls of `SupportingDocApi` in the shape of the real service.
 *
 * Framework-free and deterministic (no Date.now, no Math.random): the comparison harness loads this file into Node and both sides must see
 * the same data. The cast (customers, employees, "today") comes from `@core/mock/crm-seed`.
 *
 * What is deliberately varied so that every branch of the screens is reached:
 *   - the number of documents per family: 53 · 20 (exactly one page) · 7 · 0 (an empty list) · 41 · 3 · 12;
 *   - the list of the second family answers in the OLD envelope (`result.result[]`, snake_case) — the others in the new one (`result.items[]`);
 *   - statuses: ACTIVE · WAIT_APPROVE · REJECTED · new · cancel · and an unknown one (shown as it is);
 *   - a document with no `receiveByName` (the receiver is the creator), one with `receiveByName` "0" (shown as "-");
 *   - attachments, one with a doubled host in its address;
 *   - special words in a remark make the next save fail: `X-FAIL` (500), `X-NOREPLY` (no answer at all), `X-INVALID` (400); a file whose
 *     name contains "fail" is refused by the attachment call.
 */
import { SEED_EMPLOYEES, SEED_PROSPECT_COUNT, SEED_TODAY, isKnownProspect, prospectIds, seedDate, seedHash, seedProspect } from '@core/mock/crm-seed';
import { reference, msg } from '@core/mock/reference';
import { journaledApi } from '@core/mockup/mockup-journal';
import { moveBase64ToStorage, storedRef } from '@core/mockup/mockup-uploads';
import type { BoardFetch, SupportingDocApi } from './supporting-doc-backend';
import { SUPPORTING_DOC_TYPES, type SupportingDocType } from './supporting-doc-types';

export interface MockSupportingDocOptions {
  /** how long every call takes (ms); the specs and the harness pass 0 */
  delayMs?: number;
  /** `triplesale.api.documents.formtype.style` */
  formTypeStyle?: string;
}

type Doc = Record<string, unknown>;

/** documents per family (by `n`) */
export const MOCK_DOC_COUNTS: Readonly<Record<number, number>> = { 1: 53, 2: 20, 3: 7, 4: 0, 5: 41, 6: 3, 7: 12 };
/** the id of the k-th document of family n */
export const mockDocId = (n: number, k: number): number => n * 1000 + k;

const STATUSES = ['ACTIVE', 'WAIT_APPROVE', 'new', 'REJECTED', 'cancel'] as const;
const FILES_HOST = 'http://files.example.test';
const PNG_AVATAR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const pad = (n: number, w: number): string => String(n).padStart(w, '0');
const envelope = (result: unknown, extra: Record<string, unknown> = {}): string => JSON.stringify({ status: 200, message: 'success', ...extra, result });
const error = (status: number, message: string): string => JSON.stringify({ status, message });
const wait = (ms: number): Promise<void> => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

const employeeId = (i: number): number => i + 1;

/** the people of the borrower / co-borrower / guarantor blocks of the credit application — keys of `sunDetail` without the b_ / c_ / g_ prefix */
function person(who: 'borrower' | 'coBorrower' | 'guarantor', k: number): Record<string, string> {
  const c = seedProspect(1 + ((k * 5 + (who === 'borrower' ? 0 : who === 'coBorrower' ? 3 : 7)) % SEED_PROSPECT_COUNT));
  const base: Record<string, string> = {
    personalPrefix: 'นาย',
    personalNameTh: c.fullName,
    personalNameEn: `Customer ${c.id}`,
    personalDate: '1988-04-12',
    personalAge: '38',
    personalGender: 'ชาย',
    personalNationality: 'ไทย',
    personalIdcardNo: `1-1001-${pad(10000 + c.id, 5)}-00-1`,
    personalIdcardBy: 'เขตบางรัก',
    personalIdcardIssuedate: '2022-01-05',
    personalIdcardExpireddate: '2030-01-04',
    personalEducationLevel: 'ปริญญาตรี',
    marriedCouple: 'สมรส',
    telephoneNo: c.phone,
    email: c.email,
    lineId: `line${c.id}`,
    occupation: 'พนักงานบริษัท',
    companyName: 'บริษัท ตัวอย่าง จำกัด',
    companyTelNo: '02-123-4567',
    companyProvince: 'กรุงเทพมหานคร',
    companyDistrict: 'เขตบางรัก',
    companySubdistrict: 'สีลม',
    companyZipcode: '10500',
    currentAddressNo: msg('{0} หมู่ 3', 10 + c.id),
    currentProvince: 'กรุงเทพมหานคร',
    currentDistrict: 'เขตปทุมวัน',
    currentSubdistrict: 'ตำบลเก่า', // not in the master data: kept as a legacy option
    currentZipcode: '10330',
    avgIncome: '45000',
    anotherIncome: '5000',
    allowNotification: 'true',
  };
  if (who === 'borrower') {
    Object.assign(base, {
      loantype: 'สินเชื่อบ้านใหม่',
      projectName: 'โครงการตัวอย่างเดอะพาร์ค',
      price: '2500000',
      deposit: '50000',
      loanAmount: '2000000',
      loanPeriod: '30',
      interestRate: '3.25',
      annuity: 'หักเงินเดือน',
      borrowerProvince: 'กรุงเทพมหานคร',
      buildingProvince: 'กรุงเทพมหานคร',
      buildingDistrict: 'เขตบางรัก',
      buildingSubdistrict: 'สีลม',
      personalId: 'true',
    });
  }
  return base;
}

/** the k-th document (1-based) of a family — the shape of `GET /documents/{id}` */
function seedDoc(t: SupportingDocType, k: number): Doc {
  const count = MOCK_DOC_COUNTS[t.n] ?? 0;
  const h = (salt: number): number => seedHash(k, t.n * 31 + salt);
  const customer = seedProspect(1 + ((k * 7 + t.n) % SEED_PROSPECT_COUNT));
  const emp = SEED_EMPLOYEES[(k + t.n) % SEED_EMPLOYEES.length];
  const date = seedDate(Math.max(0, count - k));
  const id = mockDocId(t.n, k);
  const status = k % 11 === 0 ? 'DRAFT' : STATUSES[h(1) % STATUSES.length];
  const doc: Doc = {
    id,
    txNo: `${t.docCode}-${pad(k, 5)}`,
    status,
    txDate: date,
    receiveDate: date,
    referenceDocNo: k % 3 === 0 ? `REF-${pad(k, 4)}` : '',
    referenceDocDate: k % 3 === 0 ? date : null,
    remark: k % 5 === 0 ? msg('หมายเหตุของเอกสาร {0}', k) : '',
    description: k % 2 === 0 ? msg('รายละเอียดเอกสารที่ {0}', k) : '',
    existsTxNo: k % 7 === 0 ? `OLD-${pad(k, 4)}` : '',
    flowRefDocType: k % 4 === 0 ? 'LD' : '',
    flowRefDocNo: k % 4 === 0 ? `LD-${pad(100 + k, 5)}` : '',
    customerCode: customer.code,
    customerName: customer.fullName,
    customerAvatar: k % 5 === 1 ? PNG_AVATAR : '',
    receiveByCode: emp.code,
    receiveByName: emp.name,
    createBy: emp.code,
    attachItems:
      k % 4 === 0
        ? [
            { attachFile: `${FILES_HOST}/documents/${id}/สัญญา-${k}.pdf`, description: 'ฉบับร่าง' },
            ...(k % 8 === 0 ? [{ attachFile: `${FILES_HOST}/${FILES_HOST}/documents/${id}/แนบท้าย-${k}.png`, description: '' }] : []),
          ]
        : [],
  };
  if (k % 9 === 0) {
    doc['receiveByName'] = '';
    doc['receiveByCode'] = '';
  }
  if (k % 13 === 0) {
    doc['receiveByName'] = '0';
    doc['receiveByCode'] = '';
  }
  if (t.formType === 'formsun') doc['formsun'] = { borrower: person('borrower', k), coBorrower: person('coBorrower', k), guarantor: person('guarantor', k) };
  return doc;
}

/** a row of the list as the backend sends it: camelCase, or — for the second family — snake_case (the old envelope) */
function listRow(t: SupportingDocType, d: Doc): Doc {
  if (t.n !== 2) {
    return {
      id: d['id'], txNo: d['txNo'], txDate: d['txDate'], customerCode: d['customerCode'], customerName: d['customerName'], customerAvatar: d['customerAvatar'],
      receiveByName: d['receiveByName'], createdBy: d['createBy'], receiveDate: d['receiveDate'], status: d['status'],
    };
  }
  return {
    id: d['id'], txno: d['txNo'], txdate: d['txDate'], customer_code: d['customerCode'], customer_name: d['customerName'], customer_avatar: d['customerAvatar'],
    receive_by_name: d['receiveByName'], created_by: d['createBy'], receive_date: d['receiveDate'], status: d['status'],
  };
}

export interface MockSupportingDocBackend {
  api: SupportingDocApi;
  /** `/board/provinces` · `/board/districts` · `/board/sub-districts` */
  board: BoardFetch;
  /** the documents of a family as they are now (for the specs) */
  documents(t: SupportingDocType): Doc[];
  /** every call made, `METHOD path` (for the specs) */
  calls: string[];
}

/**
 * What the user saves / attaches is kept in Datasource/journal.supporting-docs.json (mockup file server) and replayed at the next start; the
 * bytes of an attached file go to Storage/supporting-docs/<id>/ and the journal keeps only their id.
 */
export function createMockSupportingDocs(options: MockSupportingDocOptions = {}): MockSupportingDocBackend {
  const inner = makeMockSupportingDocs(options);
  const normalDelay = options.delayMs;
  const api = journaledApi('supporting-docs', inner.api, ['save', 'attach'], {
    quiet: (on) => {
      options.delayMs = on ? 0 : normalDelay;
    },
    prepare: async (method, args) => {
      if (method !== 'attach') return undefined;
      const [ft, id, body] = args as [string, string, Record<string, unknown>];
      const moved = await moveBase64ToStorage(body, `supporting-docs/${String(id)}`, 'contentBase64', 'fileName');
      return moved ? [ft, id, moved] : undefined;
    },
  });
  return { ...inner, api };
}

function makeMockSupportingDocs(options: MockSupportingDocOptions = {}): MockSupportingDocBackend {
  const delay = (): number => options.delayMs ?? 150;
  // the documents the screens start with: the list of the shared Datasource (`ref.supportingDocs.json` › documents, by family) when it has one, else the formulas
  const formulas = Object.fromEntries(SUPPORTING_DOC_TYPES.map((t) => [String(t.n), Array.from({ length: MOCK_DOC_COUNTS[t.n] ?? 0 }, (_x, i) => seedDoc(t, i + 1))]));
  const documents = reference<Record<string, Doc[]>>('supportingDocs.documents', formulas);
  const store = new Map<number, Doc[]>(SUPPORTING_DOC_TYPES.map((t) => [t.n, documents[String(t.n)] ?? []]));
  const attachments = new Map<number, Doc[]>();
  const calls: string[] = [];

  /** the family of a `formType` in either spelling */
  const familyOf = (ft: string): SupportingDocType | undefined => SUPPORTING_DOC_TYPES.find((t) => t.formType === ft || t.apiFormTypeNew === ft);
  const docsOf = (t: SupportingDocType): Doc[] => store.get(t.n) ?? [];
  const find = (t: SupportingDocType, id: string): Doc | undefined => docsOf(t).find((d) => String(d['id']) === id.trim());
  const withFiles = (d: Doc): Doc => ({ ...d, attachItems: [...(d['attachItems'] as Doc[]), ...(attachments.get(Number(d['id'])) ?? [])] });

  const api: SupportingDocApi = {
    formTypeStyle: options.formTypeStyle ?? '',

    async documents(ft, page, pageSize) {
      await wait(delay());
      calls.push(`GET /documents?formType=${ft}&page=${page}&pageSize=${pageSize}`);
      const t = familyOf(ft);
      if (!t) return ''; // an unknown formType: 400 for the real service = '' for sendGET
      // the real service lists the oldest first; the page of a client is a window of that order
      const all = docsOf(t);
      const rows = all.slice((page - 1) * pageSize, page * pageSize).map((d) => listRow(t, d));
      return t.n === 2
        ? envelope({ result: rows, total: all.length }, { meta: { total: all.length, page, perPage: pageSize } })
        : envelope({ items: rows, total: all.length, page, pageSize });
    },

    async document(ft, id) {
      await wait(delay());
      calls.push(`GET /documents/${id}?formType=${ft}`);
      const t = familyOf(ft);
      const d = t ? find(t, id) : undefined;
      return d ? envelope(withFiles(d)) : '';
    },

    async save(ft, id, body) {
      await wait(delay());
      calls.push(`${id == null ? 'POST /documents' : `PUT /documents/${id}`}?formType=${ft}`);
      const remark = String(body['remark'] ?? '');
      if (remark.includes('X-NOREPLY')) return '';
      if (remark.includes('X-FAIL')) return error(500, 'Internal Server Error');
      if (remark.includes('X-INVALID')) return error(400, 'Validation failed');
      const t = familyOf(String(body['formType'] ?? ft));
      if (!t) return error(400, 'unknown formType');
      if (id == null) {
        const docs = docsOf(t);
        const next = docs.reduce((m, d) => Math.max(m, Number(d['id'])), t.n * 1000) + 1;
        const emp = SEED_EMPLOYEES[Number(body['receiveById']) - 1];
        const cust = body['customerId'] !== undefined ? seedProspect(Number(body['customerId'])) : undefined;
        const doc: Doc = {
          id: next, txNo: `${t.docCode}-${pad(next - t.n * 1000, 5)}`, status: 'new', txDate: SEED_TODAY, receiveDate: SEED_TODAY, referenceDocNo: '', referenceDocDate: null,
          remark: '', description: '', existsTxNo: '', flowRefDocType: '', flowRefDocNo: '',
          customerCode: cust?.code ?? '', customerName: cust?.fullName ?? '', customerAvatar: '', receiveByCode: emp?.code ?? '', receiveByName: emp?.name ?? '', createBy: 'E101', attachItems: [],
        };
        apply(doc, body);
        docs.push(doc);
        return envelope({ id: next, txNo: doc['txNo'] });
      }
      const doc = find(t, id);
      if (!doc) return error(404, 'document not found');
      // the output-only fields are refused by the real service ("Unrecognized field")
      const refused = ['id', 'txNo', 'status', 'createBy', 'customerCode', 'customerName', 'customerAvatar', 'receiveByCode', 'receiveByName', 'receiveByAvatar', 'attachItems'].filter((k) => k in body);
      if (refused.length) return error(400, `Unrecognized field "${refused[0]}"`);
      apply(doc, body);
      return envelope({ id: doc['id'], txNo: doc['txNo'] });
    },

    async attach(ft, id, body) {
      await wait(delay());
      calls.push(`POST /documents/${id}/attachments?formType=${ft}`);
      const t = familyOf(ft);
      const d = t ? find(t, id) : undefined;
      if (!d) return error(404, 'document not found');
      const name = String(body['fileName'] ?? '');
      if (name.toLowerCase().includes('fail')) return error(500, 'attachment refused');
      const list = attachments.get(Number(d['id'])) ?? [];
      list.push({ attachFile: typeof body['storageId'] === 'string' ? storedRef(body['storageId'], name) : `${FILES_HOST}/documents/${d['id']}/${name}`, description: String(body['detail'] ?? '') });
      attachments.set(Number(d['id']), list);
      return envelope({ id: list.length });
    },

    async searchProspects(key, page, perPage) {
      await wait(delay());
      calls.push(`GET /master-data/prospects/search?key=${key}&page=${page}&perPage=${perPage}`);
      if (perPage > 20) return envelope([]); // the service answers nothing for a bigger page
      const k = key.trim().toLowerCase();
      const all = prospectIds().map((id) => seedProspect(id)).filter((p) => k === '' || p.code.toLowerCase().includes(k) || p.fullName.toLowerCase().includes(k));
      return envelope(all.slice(page * perPage, (page + 1) * perPage).map((p) => ({ id: p.id, code: p.code, name: p.fullName })));
    },

    async employees() {
      await wait(delay());
      calls.push('GET /master-data/employees');
      return envelope(SEED_EMPLOYEES.map((e, i) => ({ id: employeeId(i), code: e.code, name: e.name })));
    },

    async prospect(id) {
      await wait(delay());
      calls.push(`GET /prospects/${id}`);
      const n = Number(id);
      if (!isKnownProspect(n)) return '';
      const p = seedProspect(n);
      // a sale person written with a title, plainly, or none: the receiver is matched by name without the title
      const emp = SEED_EMPLOYEES[n % SEED_EMPLOYEES.length];
      const salePersonName = n % 3 === 0 ? msg('คุณ{0}', emp.name) : n % 3 === 1 ? emp.name : '';
      return envelope({ id: p.id, code: p.code, fullName: p.fullName, salePersonName });
    },
  };

  /** lays the fields of a save over a stored document */
  function apply(doc: Doc, body: Doc): void {
    for (const k of ['remark', 'referenceDocNo', 'description', 'existsTxNo', 'flowRefDocType', 'flowRefDocNo', 'txDate', 'receiveDate', 'referenceDocDate'] as const) if (k in body) doc[k] = body[k];
    if ('receiveById' in body) {
      const emp = body['receiveById'] === null ? undefined : SEED_EMPLOYEES[Number(body['receiveById']) - 1];
      doc['receiveByCode'] = emp?.code ?? '';
      doc['receiveByName'] = emp?.name ?? '';
    }
    if ('customerId' in body && body['customerId'] !== null) {
      const c = seedProspect(Number(body['customerId']));
      doc['customerCode'] = c.code;
      doc['customerName'] = c.fullName;
    }
    if (body['formsun'] && typeof body['formsun'] === 'object') doc['formsun'] = JSON.parse(JSON.stringify(body['formsun']));
  }

  return { api, board: createMockBoardFetch(delay()), documents: (t) => docsOf(t), calls };
}

/* ================================================================================================ /board/provinces … (sub_7) */

const PROVINCES = reference('supportingDocs.provinces', ['กรุงเทพมหานคร', 'เชียงใหม่', 'ขอนแก่น', 'ภูเก็ต', 'ชลบุรี', 'นครราชสีมา', 'นนทบุรี', 'ปทุมธานี']);
const DISTRICTS: Readonly<Record<number, readonly string[]>> = reference('supportingDocs.districts', {
  0: ['เขตบางรัก', 'เขตปทุมวัน', 'เขตจตุจักร', 'เขตบางนา'],
  1: ['เมืองเชียงใหม่', 'สันทราย', 'หางดง'],
  2: ['เมืองขอนแก่น', 'ชุมแพ'],
});
const SUB_DISTRICTS = reference('supportingDocs.subDistricts', ['สีลม', 'คลองเตย', 'ลาดพร้าว', 'ช้างคลาน']);

export function createMockBoardFetch(delayMs = 0): BoardFetch {
  const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json;charset=UTF-8' } });
  return async (input) => {
    await wait(delayMs);
    const u = new URL(input, 'http://mock.local');
    const path = u.pathname.replace(/^\/triplesale/, '');
    if (path === '/board/provinces') return json(PROVINCES.map((name, i) => ({ id: 10 + i, code: `P${pad(i + 1, 2)}`, name, nameTh: name })));
    if (path === '/board/districts') {
      const pid = Number(u.searchParams.get('provinceId') ?? 0) - 10;
      const names = DISTRICTS[pid] ?? (pid >= 0 && pid < PROVINCES.length ? ['เมือง', 'บางใหญ่'] : []);
      return json(names.map((name, k) => ({ id: 100 + pid * 10 + k, code: `D${pad(k + 1, 2)}`, name, nameTh: name })));
    }
    if (path === '/board/sub-districts') {
      const did = Number(u.searchParams.get('districtId') ?? 0);
      if (!(did >= 100)) return json([]);
      return json(SUB_DISTRICTS.map((name, k) => ({ id: 1000 + did * 10 + k, code: `S${pad(k + 1, 2)}`, name, nameTh: name, postCode: String(10500 + ((did + k) % 40)) })));
    }
    return new Response(JSON.stringify({ status: 404, message: `no route ${path}` }), { status: 404, headers: { 'content-type': 'application/json' } });
  };
}

let shared: MockSupportingDocBackend | undefined;
/**
 * The backend the screens run on in mock mode: ONE for the whole session of the app (until the page is loaded again), so that a document saved on a form is in the
 * list it goes to — what the persistence of a server gives the Java pages.
 */
export function sharedMockSupportingDocs(): MockSupportingDocBackend {
  shared ??= createMockSupportingDocs();
  return shared;
}

/** asks for every list once, so the export of the Datasource documents (tools/mockup-export-seed.mjs) can write them */
export const registerReferenceLists = (): void => void makeMockSupportingDocs();
