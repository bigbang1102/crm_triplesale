// What the comparison pages of the two receipt screens (receipts = the list, receipt-form = the form) have in common: the Java BFF
// (/triplesale/rvapi, /rvreport, /rvreceipt, /board/…) served by the SAME mock the Angular pages run (receipts.mock.ts), the Java replica
// page builder, the normaliser and the scenario helpers every scenario of the two pages uses.
import { join } from 'node:path';
import { javaLinkToRoute } from '../../../../src/app/core/navigation/java-links.ts';
import { msgFn, replicaSections } from '../../../lib/sales-doc.mjs';

export const MOCK = 'src/app/features/receipts/receipts.mock.ts';
export const LIVE_FILES = 'src/app/features/receipts/receipts.live.files.ts';

/** a fresh backend for one scenario run (its own module instance: the mock keeps its state at module level) */
export async function newState({ delay, live }, ctx) {
  const mock = await ctx.loadTs(join(ctx.ngRoot, MOCK));
  mock.resetMockReceipts?.();
  // --live: what the Angular side shows for a report file (it has no report service to ask) — see handle()
  const liveFiles = live ? await ctx.loadTs(join(ctx.ngRoot, LIVE_FILES)) : null;
  return { mock, delay, live: !!live, liveFiles };
}

/** the fault of the page (`?mock=…` of its address) a request comes from: both sides send the page address as the Referer */
const faultOf = (headers) => {
  try {
    return new URL(headers?.referer ?? '').searchParams.get('mock') ?? '';
  } catch {
    return ''; // no referer
  }
};

/** the BFF the Java page calls; null = not mine. A fault of the mock (`?mock=…`) reaches it through the Referer of the request. */
export async function handle(req, state) {
  const m = /^\/triplesale\/(rvapi|board\/[\w-]+|rvreport|rvreceipt)$/.exec(req.path);
  if (!m) return null;
  if (state.delay) await new Promise((r) => setTimeout(r, state.delay));
  const below = req.path.slice('/triplesale'.length);
  if (m[1] === 'rvreport' || m[1] === 'rvreceipt') {
    // --live: the Angular app has no report service to ask (there is no REST endpoint for the JasperReports server nor for the PDF of
    // /rvreceipt): its file() says so in a text (receipts.live.files.ts). The Java replica gives that same text under --live — the one
    // intended difference of the two files — so that what the page asked for (which number, PDF or image) is still compared
    const f = state.live
      ? state.liveFiles.liveReceiptFile(below + req.search, /-en\.xhtml/.test(req.headers.referer ?? '') ? 'en' : 'th')
      : state.mock.mockReceiptFile(below + req.search);
    return { status: f.status, headers: { 'content-type': f.type }, body: Buffer.from(f.body) };
  }
  const fault = faultOf(req.headers);
  let r;
  try {
    r = await state.mock.createMockReceipts({ delayMs: 0, fault }).fetch(below + req.search, { method: req.method, body: req.body });
  } catch {
    return { destroy: true }; // the mock says "no answer at all"
  }
  return { status: r.status, headers: { 'content-type': r.headers.get('content-type') ?? 'application/json' }, body: Buffer.from(await r.arrayBuffer()) };
}

/**
 * The fake REST service of the receipt screens (`run.mjs --live`): `triplesale-service` as the Java code consumed it — the paths, the
 * parameters, the envelopes and the field names of RvApiService (and of LeadBoardView / ProspectDetailServlet for the lead and the
 * customer of the form), answered from the SAME data as the Java replica (the mock of the page). What the REST service does NOT know is the
 * shape of the BFF: the answers here are what the servlet got, never what it wrote — the live backend has to make the page's answers out of them.
 * A fixture, not the real service: written from the Java code (no account for the real one).
 *
 * The fault of a scenario (`?mock=` of the page address) comes with the Referer. `rest-*` faults are failures of THIS service (the gateway
 * answers an HTML page, no answer at all, a refusal with a body …); every other fault is a situation of the DATA (an empty list, the old
 * shape of the payment methods, a lead that works in several groups …) and is played by the mock the Java replica runs.
 * Every request that is the first of what the page asked pays the latency of the scenario; the follow-up calls of one servlet action
 * (the counts of a create, the next pages of the materials) do not — the Java page paid it once for the whole action.
 *
 * Strict like a service: a parameter the Java code never sent is a 400 (the live backend must send exactly what the servlet sent).
 */
export async function upstream(req, state) {
  if (req.api !== 'service') return null;
  const { method, path } = req;
  const q = new URLSearchParams(req.search);
  const fault = faultOf(req.headers);
  const mock = state.mock.createMockReceipts({ delayMs: 0, fault });
  const lat = async () => {
    if (state.delay) await new Promise((r) => setTimeout(r, state.delay));
  };
  const html502 = { status: 502, headers: { 'content-type': 'text/html' }, body: state.mock.REST_HTML_502 };
  const bad = (what) => ({ status: 400, body: { status: 400, message: `fake REST service: ${what}` } });
  const only = (...names) => [...q.keys()].every((k) => names.includes(k));
  /** the BFF answer of the mock for `/rvapi?…`, as the answer of the service (the servlet passed these through) */
  const viaMock = async (url, init) => {
    let r;
    try {
      r = await mock.fetch(url, init);
    } catch {
      return { destroy: true };
    }
    return { status: r.status, body: await r.text() };
  };
  const pageSizeOne = q.get('pageSize') === '1';
  /** the fault `slow` of the mock: every answer of the Java BFF takes 3 s more (the mock does it for the routes it answers itself) */
  const slow = async () => {
    if (fault === 'slow') await new Promise((r) => setTimeout(r, 3000));
  };

  // ---- the receipts
  if (method === 'GET' && path === '/rv') {
    if (!only('search', 'status', 'dateFrom', 'dateTo', 'page', 'pageSize')) return bad('GET /rv takes search, status, dateFrom, dateTo, page, pageSize');
    if (!pageSizeOne) await lat();
    if (fault === 'rest-list') return html502;
    if (fault === 'rest-list-down') return { destroy: true };
    return viaMock('/rvapi?action=list&' + q);
  }
  if (method === 'GET' && path === '/rv/leads') {
    if (!only('page', 'pageSize', 'search') || q.get('page') !== '0' || q.get('pageSize') !== '500') return bad('GET /rv/leads?page=0&pageSize=500[&search=]');
    await lat();
    await slow();
    if (fault === 'rest-leads') return { status: 500, body: { status: 500, message: 'Internal Server Error' } };
    const search = (q.get('search') ?? '').trim().toLowerCase();
    const content = state.mock
      .mockLeadRows()
      .filter((l) => !search || [l.name, l.code, l.txNo].join(' ').toLowerCase().includes(search))
      .map((l) => ({ id: l.leadId, leadTxNo: l.txNo, prospectCode: l.code, prospectName: l.name, employeeCode: 'E' + String(l.leadId).padStart(3, '0'), employeeName: l.employeeName, leadStatus: l.leadStatus }));
    // (a lead whose customer has no code is of no use to the picker: the servlet skips it)
    content.unshift({ id: 0, leadTxNo: 'LD:00-NO-CODE', prospectCode: '', prospectName: 'ลีดที่ลูกค้ายังไม่มีรหัส', employeeCode: 'E000', employeeName: '-', leadStatus: 'open' });
    return { status: 200, body: { status: 200, message: 'success', result: { content, totalPages: 1, totalElements: content.length, page: 0, pageSize: 500 } } };
  }
  if (method === 'POST' && path === '/rv/approve') {
    // (live-upstream.mjs hands the body over parsed: it is {})
    if (!only('txno') || JSON.stringify(req.body) !== '{}') return bad('POST /rv/approve?txno= with the body {} (got ' + JSON.stringify(req.body) + ')');
    await lat();
    if (fault === 'rest-approve-down') return { destroy: true };
    if (state.mock.REST_APPROVE_ERRORS[fault]) return { status: state.mock.REST_APPROVE_ERRORS[fault].status, body: state.mock.REST_APPROVE_ERRORS[fault] };
    return viaMock('/rvapi?action=approve&txno=' + encodeURIComponent(q.get('txno') ?? ''), { method: 'POST' });
  }
  if (method === 'POST' && path === '/rv') {
    if (req.search) return bad('POST /rv takes no parameter');
    await lat();
    if (fault === 'rest-create-down') return { destroy: true };
    if (fault === 'rest-create-html') return html502;
    // the mock validates the receipt and keeps it (so the counts that follow are real); its `api` is the body of the service, its status the HTTP status
    const r = await viaMock('/rvapi?action=create', { method: 'POST', body: JSON.stringify(req.body) });
    if (r.destroy || r.status !== 200) return r;
    const api = JSON.parse(r.body).api;
    if (!api) return r;
    return { status: Number.isInteger(api.status) && api.status >= 200 && api.status < 600 ? api.status : 200, body: api };
  }
  const detail = /^\/rv\/([^/]+)$/.exec(path);
  if (method === 'GET' && detail) {
    if (req.search) return bad('GET /rv/{id} takes no parameter');
    await lat();
    await slow();
    if (fault === 'rest-detail') return html502;
    if (fault === 'slow-detail') await new Promise((r) => setTimeout(r, 3000));
    if (fault === 'detail-missing') return { status: 200, body: { status: 200, message: 'success', result: {} } }; // (an id the service does not know: 200 and nothing)
    return { status: 200, body: state.mock.mockRvDetailRaw(detail[1]) };
  }

  // ---- the masters
  if (method === 'GET' && path === '/master-data/materials') {
    if (!only('page', 'pageSize') || q.get('pageSize') !== '30') return bad('GET master-data/materials?page=&pageSize=30');
    const page = Number(q.get('page'));
    if (page === 1) {
      await lat();
      await slow();
    }
    if (fault === 'rest-materials') return { status: 500, body: { status: 500, message: 'Internal Server Error' } };
    if (fault === 'slow-materials' && page === 1) await new Promise((r) => setTimeout(r, 3000));
    if (fault === 'materials-empty') return { status: 200, body: { status: 200, message: 'success', result: [] } };
    // the rows of the master: the price as a number, as a text ("0.00") or not at all; a row without a code, a repeated one and a null that the servlet skips
    const rows = state.mock.MOCK_MATERIALS.map((m) => ({ id: 100 + m.code.length, code: m.code, name: m.name, standardSalePrice: m.code === 'SV-ADS' ? '0.00' : m.code === 'SV-ADS2' ? undefined : m.salePrice, unit: 'ครั้ง' }));
    const all = [{ id: 1, code: '', name: 'row without a code' }, null, ...rows, { id: 2, code: rows[0].code, name: 'the first one again' }];
    return { status: 200, body: { status: 200, message: 'success', result: all.slice((page - 1) * 30, page * 30) } };
  }
  if (method === 'GET' && path === '/master-data/movement-types/LD') {
    if (req.search) return bad('GET master-data/movement-types/LD takes no parameter');
    await lat();
    return fault === 'rest-products' ? html502 : viaMock('/rvapi?action=products');
  }
  if (method === 'GET' && path === '/master-data/business-branches') {
    if (req.search !== '?page=1&perPage=500') return bad('GET master-data/business-branches?page=1&perPage=500');
    await lat();
    if (fault === 'rest-branches') return html502;
    if (fault === 'rest-branches-409') return { status: 409, body: { status: 409, message: 'conflict', error: { code: 'COMPANY_NOT_SELECTED', message: 'กรุณาเลือกบริษัทก่อนใช้งาน' } } };
    return viaMock('/rvapi?action=branches');
  }
  if (method === 'GET' && path === '/master-data/currencies') {
    if (req.search) return bad('GET master-data/currencies takes no parameter');
    await lat();
    return fault === 'rest-currencies' ? html502 : viaMock('/rvapi?action=currencies');
  }
  if (method === 'GET' && path === '/master-data/receive-methods') {
    if (req.search !== '?txType=rv') return bad('GET master-data/receive-methods?txType=rv');
    await lat();
    return fault === 'rest-methods' ? { status: 503, body: { status: 503, message: 'Service Unavailable' } } : viaMock('/rvapi?action=receiveMethods');
  }
  if (method === 'GET' && path === '/master-data/attach-file-types') {
    if (req.search) return bad('GET master-data/attach-file-types takes no parameter');
    await lat();
    return fault === 'rest-attach' ? html502 : viaMock('/rvapi?action=attachFileTypes');
  }

  // ---- what the form reads when it is opened from a lead: GET /leads/{id}[?activityGroupId=] (LeadBoardView.fetchLeadByIdResult) and
  // GET /prospects/{id} (TriplesaleApi.prospectById) — the envelope { status, message, result }; a refusal / a failure keeps its status and body
  const lead = /^\/leads\/([^/]+)$/.exec(path);
  if (method === 'GET' && lead) {
    if (!only('activityGroupId')) return bad('GET /leads/{id}[?activityGroupId=]');
    await lat();
    const r = await viaMock(`/board/lead?id=${encodeURIComponent(lead[1])}${q.has('activityGroupId') ? '&activityGroupId=' + encodeURIComponent(q.get('activityGroupId')) : ''}`);
    return r.destroy || r.status !== 200 ? r : { status: 200, body: { status: 200, message: 'success', result: JSON.parse(r.body) } };
  }
  // the customer search of the form (ProspectListService): GET /prospects?… (the list, then the quick-view of each row — enrich=1). The rows are the
  // customers of the mock's `/board/prospect-list`, written the way the service sends them: phone → customerTel ('-' = none), the composed address in
  // currentAddress (the parts stay empty, so the composed address is the same), the picture in attachFile; the quick-view brings the customer code.
  if (method === 'GET' && path === '/prospects') {
    await lat();
    const ask = new URLSearchParams({ page: q.get('page') ?? '1', perPage: q.get('perPage') ?? '8', searchText: q.get('searchText') ?? '' });
    const r = await viaMock('/board/prospect-list?' + ask);
    if (r.destroy || r.status !== 200) return r;
    const { result } = JSON.parse(r.body);
    const rows = result.items.map((it) => ({ id: it.id, name: it.name, code: it.code, customerTel: it.phone === '-' ? '' : it.phone, currentAddress: it.addr, attachFile: it.avatar }));
    return { status: 200, body: { status: 200, message: 'success', result: rows, meta: result.meta } };
  }
  const quick = /^\/prospects\/(\d+)\/quick-view$/.exec(path);
  if (method === 'GET' && quick) {
    const r = await viaMock('/board/prospect-list?page=1&perPage=1000');
    if (r.destroy || r.status !== 200) return r;
    const item = JSON.parse(r.body).result.items.find((it) => String(it.id) === quick[1]);
    return item ? { status: 200, body: { status: 200, message: 'success', result: { code: item.code } } } : { status: 404, body: { status: 404, message: 'not found' } };
  }
  const prospect = /^\/prospects\/([^/]+)$/.exec(path);
  if (method === 'GET' && prospect) {
    await lat();
    const r = await viaMock('/board/prospect?id=' + encodeURIComponent(prospect[1]));
    return r.destroy || r.status !== 200 ? r : { status: 200, body: { status: 200, message: 'success', result: JSON.parse(r.body) } };
  }
  return null;
}

/** where the port deliberately differs (see INTEGRATION.md); `l` is a line of a dump */
export const normalize = (l) =>
  l
    // an object URL (the preview of an attached file) is a new random id every time
    .replace(/blob:http:\/\/(?:127\.0\.0\.1|localhost):\d+\/[0-9a-f-]{36}/g, 'blob:BLOB')
    // images the page writes with a path relative to /pages/ (../images/…): web/images/ is assets/images/ here
    .replace(/(\bsrc=)\.\.\/images\//g, '$1assets/images/')
    // the links of the Java page are relative to /pages/ (the shell-level normaliser handles /pages/….xhtml): the route of this app
    .replace(/(\bhref=)(sales_doc_rv(?:_list)?\.xhtml\?[^ >]*)/g, (_m, a, link) => a + (javaLinkToRoute(link) ?? link));

/**
 * The Java replica pages of one screen, in Thai and in English: { url path -> file }.
 * @param page  { file: 'pages/x.xhtml', name: 'x' } — the replica of language "en" is served as `<name>-en.xhtml`
 */
export function buildReplica(ctx, page) {
  const { shell } = ctx;
  const out = {};
  for (const lang of ['th', 'en']) {
    const bundle = lang === 'en' ? ctx.readJson('public/assets/i18n/en.json') : shell.th;
    const { head, content } = replicaSections(shell.read, page.file, { msg: msgFn(bundle) });
    const name = lang === 'en' ? `${page.name}-en` : page.name;
    out[`/triplesale/pages/${name}.xhtml`] = shell.build('sale', '1', `h-${name}.html`, {
      // template.xhtml puts the head of the page right after project_root.css; ui_pref.js (TS_PREF) comes from the template too
      headEarly: head,
      head: `<script src="/triplesale/resources/js/ui_pref.js?v=20260819a"></script>`,
      content,
      tail: `<script>try { sessionStorage.setItem('ts_username', 'demo'); } catch (e) {}</script>\n${shell.TEMPLATE_SCRIPTS(bundle)}`,
    });
  }
  return out;
}

/** helpers of the scenarios of both pages (code that runs in the page under test) */
export const PRE_COMMON = `
// window.open: both sides record the call; the file behind it is read at the end (Java opens /triplesale/rvreport?…, Angular a blob URL of the same bytes)
var openCalls = [], navCalls = [];
var stubOpen = function () { openCalls = []; win.open = function (u, t) { openCalls.push([String(u), t]); return { closed: false, location: {} }; }; };
var describeFile = async function (u) {
  var r = await fetch(u), b = new Uint8Array(await r.arrayBuffer()), type = (r.headers.get('content-type') || '').split(';')[0], h = 5381;
  for (var i = 0; i < b.length; i++) h = ((h << 5) + h + b[i]) | 0;
  return type + ' ' + b.length + ' ' + (h >>> 0).toString(16) + (/^text\\//.test(type) ? ' ' + new TextDecoder().decode(b) : '');
};
// location.href = … (Java) / the router (Angular): the Navigation API sees both; the Java page is kept where it is (a cancelled navigation)
var trackNav = function () {
  navCalls = [];
  if (!win.navigation) throw new Error('no Navigation API');
  win.navigation.addEventListener('navigate', function (e) { var u = new URL(e.destination.url); navCalls.push(u.pathname + u.search); if (side === 'java') e.preventDefault(); });
  win.__extra = async function () { return ['NAV ' + navCalls.join(' ; ')]; };
};
`;
