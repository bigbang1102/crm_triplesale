# INTEGRATION (เฟส B — live adapter): ใบรับเงิน RV — `receipts` (`/sales/receipts`) + `receipt-form` (`/sales/receipts/:id`)

Workspace: `triple_sale_angular_ws_rv` · worker "RV" · อ้างอิงบันทึกเฟส A: `docs/integration/receipts.md` (ตาราง §3 ของไฟล์นั้นเป็นแผนที่ ไม่ใช่ความจริง — ความจริงคือโค้ด Java ที่อ่านครบแล้ว)
Java ที่อ่านทั้งไฟล์: `RvApiServlet`, `RvApiService` (ทุก method), `RvDetailNormalizer`, `RvJasperReportServlet`, `RvReceiptPdfServlet`, `Data_API` (`sendGET` / `sendPOST` / `doSendPOST` / `sendGETWithStatus`), `TriplesaleApi` (`rvJasperReportUrl`, `reportBase`, `prospectById`, `authTokenFresh`), `SessionRoles.hasRole`, `LeadDetailServlet` + `LeadBoardView` (ทำแล้วใน `lead-core.live.ts`), `ProspectListServlet` / `ProspectListService` / `ProspectDetailServlet` (ของ worker prospects — อ่านเพื่อรู้ว่า fixture ต้องเป็นรูปไหน)

## 0. ความจริงที่ต้องรู้ก่อน ("พิสูจน์ได้แค่ไหน")

ไม่มีบัญชีทดสอบของ `triplesale-service` และไม่มี OpenAPI สาธารณะ → **ไม่ได้ตรวจกับข้อมูลจริงเลย**. สิ่งที่พิสูจน์ได้คือ "live backend ทำเหมือน servlet ของ Java บน fixture ที่เขียนจากโค้ด Java" ด้วย 2 อย่าง:
1. **spec** (`receipts.live.spec.ts` ฯลฯ; `fakeRest`) — ทุก URL/parameter/ลำดับ param/encoding ที่ยิงไป REST, ทุก error path (non-200, ไม่ใช่ JSON, ไม่มี `result`, status 0, exception), role gate, TH/EN ของข้อความ
2. **`run.mjs --live`** — หน้า Angular รันโหมด `mock:false` กับ REST service จำลอง (`upstream` ใน `tools/compare/pages/receipts/replica.mjs`) เทียบกับหน้า Java จริงที่รันกับ mock ตัวเดียวกัน

รูปคำตอบของ service จริง (ชื่อ field, envelope, paging) ทุกข้อใน §5 เป็น **สมมติฐาน** — ต้องมี smoke test ด้วยบัญชีจริงอีกครั้ง; ห้ามเขียนว่า "ตรวจกับ API จริงแล้ว"

## 1. สรุปผล

| หน้า | `--live` (scenario ทั้งหมด) | identical | เหตุผลของที่ไม่ identical / ที่ไม่ได้รัน |
| --- | --- | --- | --- |
| `receipts` | 183 | **183 (ทั้งหมด)** | ไม่มีที่ข้าม; 10 ตัวที่เปิดไฟล์ `/rvreport` `/rvreceipt` เทียบกับข้อความ "ไม่มีระบบรายงาน" ที่ตั้งใจ (§4.3) |
| `receipt-form` | 304 (รัน 302, ข้าม 2) | **285 / 302** (รอบเต็มสุดท้าย 284 + `save-payload-skips-incomplete-lines` ที่ต่างเฉพาะตอนเครื่องโหลดหนักและ identical เมื่อรันเดี่ยว) | ที่ต่างทั้งหมด = ต้องรอ route ของ worker prospects (§6.3); ข้าม 2 = `save-403`, `lead-prefill-down` (§6.2) |

- spec: `src/app/features/receipts/**` → 5 ไฟล์ **188 เทสต์ผ่านทั้งหมด** (เฟส A เดิม 100; เพิ่ม 88: `receipts.live.spec.ts` 73 · `receipts.logic.spec.ts` +8 · `receipts.mock.spec.ts` +5 · host spec ของสองหน้า +1 ต่อหน้า (แทนเทสต์ `ts-live-missing`) +1 เทสต์ "host ถาม live backend"); ไม่ได้รัน test suite ทั้งโปรเจกต์ตามข้อกำหนด
- build: `ng build` (production) ผ่าน ไม่มี warning/error (chunk `receipt-form` 142.77 kB); `ng build --configuration development` ผ่าน; `tsc -p tsconfig.app.json --noEmit` สะอาด
- ผลเทียบ `receipt-form` ที่ไม่ identical **หายหมด** เมื่อทดลองแทนที่ placeholder ของ prospects ด้วย route จำลองชั่วคราว (`/board/prospect` = `ProspectDetailServlet`; `/board/prospect-list` = ส่งต่อคำตอบของ mock) ใน workspace นี้: `lead-prefill*` 24/24 และ `cust-*` 20/20 identical — แล้ว **ถอนกลับเป็น placeholder เดิมทุกไบต์** (sha1 ตรงกับ `.ws-manifest.json`, ไฟล์เหมือน main) ดังนั้นต้นเหตุของ 17 ตัวคือ route ที่ยังไม่มี ไม่ใช่โค้ดของ RV

## 2. สิ่งที่ผู้ประสานงานต้องทำ (ไฟล์ shared / นอกขอบเขตของ worker นี้)

| ไฟล์ | การเปลี่ยน | เหตุผล |
| --- | --- | --- |
| `src/app/core/live/rest-deps.ts` (`createRestDeps.call`) | ใน `catch`: เมื่อ `status === 0` ให้คืน `text: ''` (ตอนนี้คืน `JSON.stringify(e.error)` = `{"isTrusted":true}` ของ `ProgressEvent`) | `rest.ts` บอกว่า `sendBody` คืน '' เมื่อไม่มีคำตอบเลย แต่จริง ๆ ได้ `{"isTrusted":true}` (ขึ้นต้นด้วย `{`) → `scheduleAnswer` ของ `lead-core.live.ts` (และ worker อื่นที่ใช้ `sendBody`) จะเห็นเป็นคำตอบของ service. **ฝั่ง RV ป้องกันเองแล้ว** (`postText` คืน '' เมื่อ status 0; spec ครอบ) จึงไม่ต้องรอ fix นี้ |
| `docs/integration/receipts.md` | แก้สถานะ: ตัด "ไม่ได้ทำ: live adapter", คอลัมน์ "สถานะใน TS" ของตาราง §3, ข้อ 4–5 ของ §5 → ใช้ §6/§7 ของไฟล์นี้แทน | ให้เอกสารตรงกับโค้ด |
| `CLAUDE.md` (bullet "หน้าในเมนู CRM / งานขาย / รายงาน") | `receipts` + `receipt-form` ไม่ใช่ "mock เท่านั้น" แล้ว — เมื่อ `mock:false` ใช้ `receipts.live.ts` (ไม่ขึ้น `<ts-live-missing />` อีก) | |
| `manual-receipts.html` / `manual/index.html` | ย้อนแก้ข้อความ "ยังไม่มี live adapter" | |
| หลัง merge ของ prospects | รัน `node tools/compare/run.mjs receipt-form --live` ซ้ำ (17 scenario ใน §6.3) และเพิ่ม fixture `GET /prospects?…` + `/prospects/{id}/quick-view` ใน `upstream` (ดู §6.3) | ดู §6.3 |

**ไม่มี** การเปลี่ยนใน `app.routes.ts` / `page-registry.json` / `package.json` / `tools/lib/**` / `tools/compare/lib/**` / `tools/compare/run.mjs` / i18n / `core/**` — ไม่ได้แก้ไฟล์เหล่านั้นใน workspace นี้ (`src/app/core/live/prospect.live.ts` ถูกแก้ชั่วคราวเพื่อตรวจ แล้วคืนเป็นเดิมทุกไบต์)

## 3. ไฟล์ที่เพิ่ม/แก้ (ใน workspace นี้)

เพิ่ม (`src/app/features/receipts/`):
| ไฟล์ | อะไร |
| --- | --- |
| `receipts.live.ts` | `createLiveReceipts(deps): ReceiptsBackend` = `composeRoutes(rvApiRoutes, opportunityCoreRoutes, prospectRoutes)` + `file()`; `rvApiRoutes` = `RvApiServlet` + `RvApiService` ทุก action |
| `receipts.live.parse.ts` | ส่วน pure ของ `RvApiService`: `safeJson`, `parseOrWrap`, `leadRows` (rvLeadsJson), `addMaterialsPage` (materialsJson), `totalOf` (fetchTotal), `attachCountOf`, `remarkOf` |
| `receipts.live.files.ts` | `liveReceiptFile(url, lang)` = `file()` ของโหมด live (ไม่มี REST endpoint ของ `/rvreport` `/rvreceipt` — §4.3). framework-free เพราะ harness โหลดเข้า Node |
| `java-text.ts` | `javaTrim` (`String.trim()`), `urlEncode` (`URLEncoder.encode(..,"UTF-8")`: space = `+`, `! ' ( ) ~` ถูก encode) |
| `receipts.live.spec.ts` | 73 เทสต์ ด้วย `fakeRest` |

แก้:
| ไฟล์ | อะไร |
| --- | --- |
| `receipts.logic.ts` | `normalizeRvDetail` ปรับให้อ่านค่าแบบ org.json จริง (ดู §4.2) + `normalizeRvDetailJson(text)` (= `RvDetailNormalizer.normalizeJson`). mock ยังใช้ `normalizeRvDetail` ตัวเดิม (ผลบนข้อมูลของ mock ไม่เปลี่ยน — phase A spec ผ่านทั้งหมด) |
| `receipts.mock.ts` | เพิ่ม fault `rest-*` (ดู §6.1) และ export `mockRvDetailRaw`, `mockLeadRows`, `REST_FAIL_ENVELOPE`, `REST_HTML_502`, `REST_APPROVE_ERRORS`, `MockLead` (ให้ REST fake ใน harness ใช้). fault เดิมทุกตัวทำงานเหมือนเดิม |
| `receipts-view.ts`, `receipt-form-view.ts` | `backend()` เลือก mock/live (`(await import('./receipts.mock'))` หรือ `(await import('./receipts.live')).createLiveReceipts(restDepsOf(injector))`) |
| `receipts.ts`, `receipt-form.ts` | ตัด `ts-live-missing` / `live` flag ออก |
| `receipts.spec.ts`, `receipt-form.spec.ts` | แทนเทสต์ "แสดง not connected" ด้วย 2 เทสต์: (1) mock off → ขอ REST ผ่าน `HttpClient` จริง (HttpTestingController) ไม่ใช่ BFF/`window.fetch`, (2) host เรียก `backend()` |
| `receipts-backend.ts` | คอมเมนต์ |
| `receipts.logic.spec.ts`, `receipts.mock.spec.ts` | เทสต์เพิ่ม |
| `tools/compare/pages/receipts/{page,replica,scenarios}.mjs`, `tools/compare/pages/receipt-form/{page,scenarios}.mjs` | `upstream` (REST service จำลอง) + `live:` override ของ scenario + `handle` ของ Java replica ให้ตอบไฟล์รายงานแบบ live ใน `--live` |

ไม่ได้แตะ: ไฟล์ที่ generate (`receipts.{html,scss,engine.ts}`, `receipt-form.{html,scss,engine.ts}`), `tools/sync-receipts.mjs`, `tools/sync-receipt-form.mjs`, `public/**`, i18n

## 4. สิ่งที่ servlet ของ Java ทำ → live backend ทำอย่างไร

### 4.1 `RvApiServlet` + `RvApiService` (`/rvapi?action=…`)

| | Java | live (`receipts.live.ts`) |
| --- | --- | --- |
| action | `param(req,"action")` = `getParameter` + `trim()`; ไม่รู้จัก/ไม่มี = 400 `{"message":"unknown action"}` (GET และ POST แยกชุด: `create/attach/calculate/approve` เป็น POST เท่านั้น) | เหมือนกัน; method อื่น (PUT/DELETE…) = 405 JSON (ของ Java เป็นหน้า 405 ของ container) |
| role | `create`, `attach`, `approve` ต้องมี **ตัวใดตัวหนึ่ง** ของ `CRM_RV_View,CRM_RV_Edit,FEATURE_CRM_Document` (`SessionRoles.hasRole` = OR + alias super-admin) ไม่งั้น 403 `{"status":403,"message":"forbidden: <list> required"}` ไม่ยิง service; `approve` เช็ค role **ก่อน** `txno` (ว่าง = 400 `{"message":"txno required"}`); `calculate` ไม่เช็ค role; GET ทุก action ไม่เช็ค | เหมือนกัน — `deps.hasRole` ทีละ key (OR) ซึ่ง `PermissionService.has` ทำ super-admin alias ให้ |
| exception | 500 `{"message":"internal error"}` | เหมือนกัน (exception ใน live backend) |
| อ่านคำตอบของ service | `Data_API.sendGET` = body ของ **200 เท่านั้น**, อย่างอื่น "" (body ของ error ถูกทิ้ง — **รวม `error.message` ของ 409/400**); ต่อ line ด้วย `readLine` (ไม่มี line break เหลือ) | `body200` + ตัด line break (`lines()`) |
| `safeJson` | ถ้าไม่ขึ้นต้นด้วย `{` (หลัง `trim`) → `{"status":502,"message":"backend ไม่ตอบหรือ response ไม่ใช่ JSON"}` **HTTP 200** — หน้าแยกคำตอบเสีย/ดีจาก body ไม่ใช่ status ของ `/rvapi` | เหมือนกัน (`safeJson`) |
| `list` | `GET /rv?search&status&dateFrom&dateTo&page&pageSize` ตามลำดับนี้ ค่า `trim()` ว่าง = ไม่ส่ง; `URLEncoder` | เหมือนกัน (ไม่มี param = `/rv` ไม่มี `?`) ; ส่ง body ดิบต่อ (ไม่ parse) |
| `detail` | `GET /rv/{URLEncoder(id)}` → `RvDetailNormalizer.normalizeJson(safeJson(..))` | `/rv/` + `urlEncode(id)` (id ว่าง = `/rv/`) → `normalizeRvDetailJson` (§4.2) |
| `leads` | `GET /rv/leads?page=0&pageSize=500[&search=]` → `result.content[]` → `{leadId(optLong id), code(prospectCode trim; ว่าง = ข้ามแถว), name(optString prospectName, code), txNo, employeeName, leadStatus}` → `{"result":[…]}`; **ทุกความล้มเหลว = `{"result":[]}` HTTP 200** | เหมือนกัน (`leadRows`) |
| `materials` | วน `GET master-data/materials?page=n&pageSize=30` สูงสุด 40 หน้า: JSON ไม่ใช่ object/ไม่ 200 → หยุด (ได้เท่าที่อ่านมาแล้ว, ไม่ cache); `result` ไม่ใช่ array/ว่าง → หยุด; แถว: `code` trim ว่างหรือซ้ำ = ข้าม, `name`=optString(name, code), `salePrice`=optDouble(standardSalePrice, 0) (NaN/Infinity ทำให้ทั้งการวนล้ม); หยุดเมื่อไม่มี code ใหม่เลย หรือหน้านั้นได้ < 30 แถว → `{"result":[…]}` HTTP 200 เสมอ | เหมือนกัน (`addMaterialsPage`) |
| `products` / `currencies` / `receiveMethods` / `attachFileTypes` / `branches` | passthrough `safeJson(sendGET(..))` ของ `master-data/movement-types/LD`, `master-data/currencies`, `master-data/receive-methods?txType=rv`, `master-data/attach-file-types`, `master-data/business-branches?page=1&perPage=500` | เหมือนกัน |
| `create` | `fetchTotal()` → `POST /rv` (body = ที่หน้าส่งมา ไบต์ต่อไบต์ ต่อ line) → `fetchTotal()` → ถ้า `remark` (parse JSON, `optString`, `trim`) ไม่ว่าง `fetchTotal(remark)`; `{api: parseOrWrap(raw), verify:{totalBefore,totalAfter,foundByRemark,persisted}}`, `persisted = (before>=0 && after>before) \|\| found>0`; `fetchTotal` = `GET /rv?[search=]&page=1&pageSize=1` → `result.total` (`optLong`, -1 ถ้าอ่านไม่ได้); `sendPOST` คืน body ของ **ทุก status** | เหมือนกัน — POST ส่งสตริงเดิม + `Content-Type: application/json; charset=UTF-8`; status 0 → raw '' |
| `attach` | `GET /rv/{id}` นับ `result.attach_items` → `POST /rv/{id}/attachments` → นับอีกครั้ง; `{api, verify:{attachCountBefore,attachCountAfter,persisted}}` (หน้านี้ไม่เรียก — พอร์ตให้ครบ) | เหมือนกัน |
| `calculate` | `POST /rv/calculate` body ดิบ → `safeJson` | เหมือนกัน |
| `approve` | `POST /rv/approve?txno=<URLEncoder>` body `"{}"` → `safeJson` ของ body **ทุก status** (HTTP 200 เสมอ: REST 403/500 ที่มี body JSON ถึงหน้าเป็น HTTP 200 พร้อม body นั้น — กิ่ง "HTTP 403 → ไม่มีสิทธิ์" ของหน้าจึงเกิดได้จาก role check ของ servlet เท่านั้น) | เหมือนกัน |

**ไม่พอร์ต (เหตุผล):**
- cache 30 นาทีของ materials / products / currencies / receive methods / attach file types (static ใช้ร่วมทุก session) และ cache สาขาใน session — เป็น performance cache; Java เองล้างทิ้งทุก login/logout. ผลที่ต้องรู้: เปิด item picker ทุกครั้งที่ฟอร์มถูกสร้างจะสแกน `materials` ใหม่ (1 call ถ้า master < 30 รายการ; สูงสุด 40 call ต่อเนื่อง) — ถ้าข้อมูลจริงมีหลายร้อยรายการและช้า ให้พิจารณา cache ใน `sessionStorage` ผูกกับผู้ใช้ (ไม่ทำเพราะเป็นเรื่องความเร็ว ไม่ใช่พฤติกรรม)
- log ของ `Data_API` (`System.err`, `ApiLog`) — แทนด้วย API log ของ interceptor

### 4.2 `RvDetailNormalizer` (`receipts.logic.ts`)

พอร์ตให้อ่านค่าแบบ org.json ที่ Java ใช้ (ของเดิมในเฟส A คลาดเคลื่อนในกรณีขอบ — แก้แล้ว, spec ยืนยัน):
- `currency_code` ที่ไม่ใช่ string ถูกอ่านเป็นข้อความ (`optString`); `trim` ของ Java (ตัดเฉพาะอักขระ ≤ U+0020 — ไม่ตัด no-break space)
- ยอด `netamount_after_vat` / `pay_amount` อ่านด้วย `optDouble` = ตัวเลข หรือข้อความที่ `Double.parseDouble` รับ — ข้อความแบบ `"1,000.00"` **ไม่ใช่ตัวเลข**ตรงนี้ (ของเดิมตัดจุลภาคให้ ซึ่ง Java ไม่ทำ; เฉพาะ `medium_amount`/`amount` ของ payment item เท่านั้นที่ตัดจุลภาคด้วย `replace(",", "")`)
- amount ของ payment item: ข้อความที่ `Double.valueOf` รับ (`"1e3"`, `"12d"`, `"NaN"`), ส่วน boolean/object/array = อ่านไม่ได้; ค่า `null` ถูกข้าม; ตัวที่ไม่ใช่ object ใน `payment_items` ถูกปล่อยไว้เฉย ๆ
- `NaN`/`Infinity` (จากข้อความ `"NaN"`, `"Infinity"`) ทำให้ `JSONObject.put(double)` ของ Java โยน exception → `normalizeJson` จับแล้วคืน **body ดิบ** — ทำเหมือนกัน (`NonFiniteNumber`)
- คำตอบที่ไม่ใช่ object / ไม่มี `result` ที่เป็น object / JSON พัง → คืนข้อความเดิมทุกตัวอักษร

### 4.3 `RvJasperReportServlet` (`/rvreport`) และ `RvReceiptPdfServlet` (`/rvreceipt`) — **ยังทำไม่ได้ (ไม่มี REST endpoint)**

`file(url)` ของโหมด live ไม่ยิงอะไรเลย แล้วเปิดแท็บที่เป็นข้อความธรรมดา (`text/plain; charset=UTF-8`, ไทย/อังกฤษตามภาษาหน้า — `receipts.live.files.ts`):
- `/rvreport?txno=` — ตัดสินได้เองเท่าที่ servlet ตัดสินโดยไม่เรียก service: `txno` ว่าง/ไม่ตรง `[A-Za-z0-9:\-]+` → **400** `ต้องระบุ txno (เลขที่เอกสาร RV) ให้ถูกต้อง` (ข้อความเดิมของ servlet); ที่เหลือ (รวม `format=png`) → **502** `เชื่อมต่อระบบรายงานไม่ได้: ยังไม่ได้เชื่อมระบบรายงาน (JasperReports) …(ฟอร์ม RV-01 ของ <txno>)` (ใช้ถ้อยคำของ servlet ตอนต่อ report server ไม่ได้ + บอกเลขที่ขอ จึงเห็นได้ว่าหน้าขอเอกสารถูกใบ)
- `/rvreceipt?id=` — `id` ว่าง → **400** `missing id`; ที่เหลือ → **502** `สร้างไฟล์ PDF ของใบรับเงินไม่ได้: ยังไม่มีบริการ… (ใบรับเงิน id <id>)`
- ผลต่อผู้ใช้: ปุ่ม PDF/รูปของใบที่ sync ERP แล้ว และ PDF ของใบที่ยังไม่ sync เปิดแท็บข้อความนี้ (รูปของใบที่ยังไม่ sync วาดบน canvas ฝั่งหน้าเอง ผ่าน `/rvapi?action=detail` จึงยังใช้ได้) — **ไม่ได้เดา endpoint**. คำถาม/ข้อเสนอถึงเจ้าของระบบอยู่ใน §7 ข้อ 1–2

## 5. สิ่งที่ REST fake ใน harness สมมติเกี่ยวกับ service จริง (รูปคำตอบ)

`upstream` ใน `tools/compare/pages/receipts/replica.mjs` (ใช้ร่วม 2 หน้า) เป็น fixture เขียนจากโค้ด Java ที่ **อ่านคำตอบ** ของ service — ไม่ใช่ข้อมูลจริง. เข้มงวดแบบ service: parameter ที่ Java ไม่เคยส่ง = HTTP 400 (live backend ต้องส่งตรงเป๊ะ) และ `POST /rv/approve` ต้องมี body `{}`

| route | สมมติ |
| --- | --- |
| `GET /rv?search&status&dateFrom&dateTo&page&pageSize` | `{status,message,result:{items:[{id,txno,txdate,status,print_forms[{code,name,url}],createbyname,createbycode,payername,payercode,description} หรือชื่อเก่า created_by/payer/payer_code],total,page,pageSize}}`; ใช้ `result.total` นับจำนวน (`page=1&pageSize=1`) |
| `GET /rv/{id}` | `{status,message,result:{id,txno,txdate,reference_docno,taxinvoice_txno,payer_code,payer_name,currency_code,netamount_before_vat,vat_amount,netamount_after_vat,pay_amount,description,material_items[…],payment_items[{detailorderno,receivemethodcode,receivemethodname,medium_amount(ตัวเลข หรือข้อความ "1,234.50"),paymedium_date}]}}`; id ที่ไม่มี = 200 + `result:{}` (คอมเมนต์ใน `RvApiService.detailJson`) |
| `GET /rv/leads?page=0&pageSize=500[&search]` | `result:{content:[{id,leadTxNo,prospectCode,prospectName,employeeCode,employeeName,leadStatus}],totalPages,totalElements,…}` (+ แถวหลอกที่ `prospectCode` ว่าง เพื่อดูว่าถูกข้าม); **page เริ่มที่ 0** (ต่างจาก endpoint อื่นที่เริ่ม 1 — ตามที่ Java เขียน) |
| `GET master-data/materials?page&pageSize=30` | `result:[{id,code,name,standardSalePrice(ตัวเลข / ข้อความ "0.00" / ไม่มี),unit}]` + แถวหลอก (code ว่าง, `null`, code ซ้ำ) |
| `GET master-data/movement-types/LD` | `result:[{id,code,name,usesWorkflowStep}]` |
| `GET master-data/business-branches?page=1&perPage=500` | `result:[{branchId,branchCode,branchName}]`; super admin ที่ยังไม่เลือกบริษัท = 409 + `error.message` (ซึ่ง servlet ทิ้ง — §7 ข้อ 3) |
| `GET master-data/currencies` | `result:{baseCurrency,items:[{code,name,exchangeRate}]}` |
| `GET master-data/receive-methods?txType=rv` | `result:[{type,label,icon,orderNo,count,items:[{code,name}]}]` (แถวละ**ประเภท**) หรือรูปเก่า (แถวละบัญชี `{code,name,type,label,orderNo}`) |
| `GET master-data/attach-file-types` | `result:[{id,code,name,nameTh}]`; `result:[]` = ไม่อนุญาตไฟล์แนบ |
| `POST /rv` | body = `RvCreateReqDTO` ตามที่หน้าส่ง; ตอบ `{status,message,result:{result:true,txno}}` หรือ error `{status:400,message,error:{code,message}}` ด้วย HTTP status เดียวกัน; **บันทึกจริง** (นับ `total` เปลี่ยน) |
| `POST /rv/approve?txno=` (body `{}`) | `{status,message,result:{result,status,hopDone,message,txno}}` — HTTP 200 เสมอ (คอมเมนต์ใน `approveJson`) |
| `GET /leads/{id}[?activityGroupId=]` | `{status,message,result:{id,txNo,prospect:{id,name},materialList[{id,code,name}]}}`; error = status จริง + `{status,message,error:{code,message}}` (ใช้โดย `lead-core.live.ts`) |
| `GET /prospects/{id}` | `{status:200,result:{id,code,name,phone,email}}` (ใช้โดย `ProspectDetailServlet` ของ prospects worker) |

**ยังไม่ได้เขียน:** `GET /prospects?page&perPage&searchText…` + `GET /prospects/{id}/quick-view` (ของ `ProspectListServlet` — ต้องแปลงผ่าน `ContractBean` ซึ่งเป็นงานของ prospects worker; ดู §6.3)

## 6. scenario ของ `--live`

### 6.1 `live: { mock: 'rest-…' }` — fault ที่ mock ของเฟส A ตอบไม่เหมือนที่ servlet จริงตอบ

mock เฟส A ตอบ fault ระดับ BFF (500 `internal error`, HTML 502, ตัดการเชื่อมต่อ, 409 + `error.message`) ซึ่ง **servlet จริงตอบแบบนั้นไม่ได้**: `RvApiService` แปลงทุกความล้มเหลวของ REST เป็นคำตอบชุดเดียวกัน (envelope 502 / `{"result":[]}` / body ของ POST ที่ส่งต่อ — HTTP 200 เสมอ). จึงเพิ่ม fault `rest-*` ใน `receipts.mock.ts` (ตอบแบบที่ servlet ตอบเมื่อ REST ล้ม; คำอธิบายที่หัวไฟล์) และให้ scenario เหล่านี้ใช้ fault นั้นเฉพาะใน `--live` (ทั้งสองฝั่ง); REST fake เล่น "service ล้ม" ด้วยชื่อเดียวกัน (gateway ตอบ HTML 502 / ตัดการเชื่อมต่อ / 500 / 503 / 403 พร้อม body / 409 พร้อมเหตุผล). **ในโหมด mock (`--live` ปิด) scenario เหล่านี้ทำงานเหมือนเดิมทุกอย่าง**

| scenario (`receipts`) | fault เดิม → ใน `--live` |
| --- | --- |
| `state-list-html` | `list-html` → `rest-list` (gateway ตอบ HTML 502) |
| `state-list-down`, `en-state-list-down` | `list-down` → `rest-list-down` (ไม่มีคำตอบ) |
| `state-leads-error` | `leads-error` → `rest-leads` (REST 500 → `{"result":[]}`) |
| `state-products-error`, `state-products-error-menu`, `product-restored-products-error` | `products-error` → `rest-products` |
| `approve-403`, `approve-500`, `approve-down` | → `rest-approve-403` / `rest-approve-500` / `rest-approve-down` (body ของ REST ส่งต่อเป็น HTTP 200; ไม่มีคำตอบ = envelope 502) |
| `report-image-unsynced-detail-error`, `detail-error`, `detail-error-dark` | `detail-error` → `rest-detail` |

| scenario (`receipt-form`) | fault เดิม → ใน `--live` |
| --- | --- |
| `currencies-error` | → `rest-currencies` |
| `branches-409`, `branches-error` | → `rest-branches-409`, `rest-branches` (ทั้งคู่ได้ envelope 502 — เหตุผลของ 409 ไม่ถึงหน้า) |
| `cust-leads-error` | → `rest-leads` |
| `picker-materials-error`, `masters-materials-error-open-picker` | → `rest-materials` (`{"result":[]}`) |
| `methods-error-fallback`, `pay-fallback-transfer-single-account`, `pay-fallback-card-ok` | `methods-error` → `rest-methods` |
| `att-types-error-fallback`, `att-types-html-fallback` | → `rest-attach` |
| `save-html-answer`, `save-down`, `en-save-down` | → `rest-create-html`, `rest-create-down` (`api` = envelope 502 + `raw`) |

### 6.2 ข้าม (`live: false`) — เกิดไม่ได้เมื่อไม่มี servlet

- `save-403` (form) — ปฏิเสธเพราะ role check ของ servlet; ปุ่มบันทึกซ่อนเมื่อไม่มี role จึงกดไม่ได้ใน UI. ครอบด้วย spec (`create/attach/approve` → 403 + ข้อความ)
- `lead-prefill-down` (form) — "ต่อ `/board/lead` ไม่ได้" → ใน Java เป็น network error ของ BFF; ใน live คือ REST ไม่ตอบ ซึ่ง `lead-core.live.ts` (ไม่ใช่ของผม) ตอบ 502 + ข้อความ `label.ld2.lead_load_failed_default` — spec ของ lead-core ครอบ

### 6.3 ต้องรอ route ของ worker prospects (`prospectRoutes` ยังเป็น placeholder → 404) — **รันซ้ำหลัง merge**

- `/board/prospect` (ProspectDetailServlet): `lead-prefill`, `lead-prefill-dark`, `lead-prefill-390`, `en-lead-prefill`, `lead-prefill-three-items`, `lead-prefill-legacy-item`, `lead-prefill-one-item`, `lead-prefill-two-items`, `lead-prefill-unknown-item-ids`, `lead-prefill-group-given`, `lead-prefill-id-with-space`, `lead-prefill-materials-slow`, `lead-prefill-then-save-echo` (13) — ต่างตรงที่ toast "ลูกค้ารายนี้ยังไม่มีรหัสในระบบ ERP" และ `selectedPayerCode`. fixture `GET /prospects/{id}` มีใน `upstream` แล้ว
- `/board/prospect-list` (ProspectListServlet): `cust-search-name`, `cust-search-code`, `cust-search-then-clear`, `cust-reopen-clears-search` (4) — ต่างที่เบอร์/ที่อยู่ในการ์ดลูกค้า (ความกว้าง popover). **ต้องเพิ่ม fixture** `GET /prospects?page&perPage&searchText…` และ `GET /prospects/{id}/quick-view` ใน `upstream` (ใช้ของ `tools/compare/pages/prospects` ถ้า worker prospects เขียนไว้) — ผมไม่เขียนเอง เพราะรูปที่ต้องส่งขึ้นกับ `ContractBean`/`toRowJson` ของฝั่งเขา

(อีกไม่กี่ scenario เคยต่างในรอบเดียวที่เครื่องโหลดหนัก — `fork: Resource temporarily unavailable`, `FreeVirtualMemory` เหลือ ~4 GB จาก worker อื่น — แล้วผ่านตอน re-run ทีละตัว; ไม่ใช่ความต่างของโค้ด)

### 6.4 ความต่างที่ตั้งใจ (ต้องไม่ถูกมองว่าเป็นบั๊ก)

- 10 scenario ของ `receipts` ที่เปิดไฟล์รายงาน (`report-pdf-synced`, `report-image-synced`, `report-pdf-two-forms`, `report-pdf-unsynced`, `report-pdf-unsynced-dark`, `en-report-pdf-unsynced`, `detail-form-synced`, `detail-form-unsynced`, `detail-form-unsynced-dark`, `en-detail-form-unsynced`): ใน `--live` Java replica ตอบ `/rvreport` `/rvreceipt` ด้วยข้อความเดียวกับที่ `file()` ของ Angular สร้าง (`state.live` ใน `replica.mjs` โหลด `receipts.live.files.ts` เข้า Node) — แทน PDF/PNG ของ mock. สิ่งที่เทียบจริงคือ **หน้าขอไฟล์ไหน** (เลขที่ txno / id / ภาษา / PDF หรือรูป) ไม่ใช่ไบต์ของไฟล์ ซึ่งไม่มีใน live
- "ไม่มีคำตอบเลย" ของ fake service เป็น socket ที่ถูกตัด → proxy ของ harness ตอบ 502 (ไม่ใช่ status 0) — ผลต่อหน้าเหมือนกัน (ไม่ใช่ JSON 200 → envelope 502); กิ่ง status 0 (`{"isTrusted":true}` ของ `rest-deps.ts`) ครอบด้วย spec

## 7. คำถามถึงเจ้าของ backend (live ยังขาดอะไร)

1. **`/rvreport` แทนด้วยอะไร?** Java ยิง JasperReports (`triplesale.report.base` + `/red/rpt/jasperReport?…exportTo=pdf&txno=…`) **โดยไม่ใส่ Bearer** แล้วตรวจ `%PDF-` ก่อน stream (`ระบบรายงานไม่คืน PDF: …` 502) และสำหรับ `format=png` แปลงหน้าแรกเป็น PNG 150 DPI ด้วย PDFBox. ตัวเลือกที่ขอให้ตัดสิน: (ก) ให้ SPA เปิด URL ของ report server ตรง ๆ ในแท็บใหม่ (ไม่ต้องใช้ token/CORS แต่ต้องมี base URL ใน `app-config.json` — `AppConfig` ไม่มี key นี้ ต้องเพิ่ม และ report server ต้องเป็น https ที่เบราว์เซอร์เข้าถึงได้; ไม่มีการตรวจ `%PDF-`) หรือ (ข) endpoint REST ใหม่ เช่น `GET /api/v1/rv/{txno}/form?format=pdf|png` ที่คืน `application/pdf`/`image/png` พร้อม Bearer — SPA ดึงเป็น blob แล้วเปิด blob URL (ข้อเสนอ: ต้องให้ host เปิดแท็บเปล่าก่อนในจังหวะคลิกแล้วค่อยสั่ง location เพราะ `file(url)` ปัจจุบัน sync เพื่อไม่ให้ popup ถูกบล็อก). PNG ในเบราว์เซอร์ทำเองไม่ได้ถ้าไม่มี pdf.js → ต้องให้ฝั่ง backend ทำ
2. **`/rvreceipt` (PDF จากข้อมูล CRM ของใบที่ยังไม่ sync ERP)** Java วาด A4 ด้วย OpenPDF + THSarabunNew (หัวบริษัท "บริษัท แอคชีฟเวอร์ จำกัด", ตารางรับชำระ, ยอด, หมายเหตุ). ต้องมี endpoint ที่ให้ PDF นี้ (ข้อเสนอเหมือนข้อ 1 ข) หรือยืนยันว่าให้สร้างในเบราว์เซอร์ (ต้องเพิ่ม library + ฟอนต์ไทย — ผมไม่ได้ทำ)
3. `master-data/business-branches` ตอบ 409 + `error.message` ("กรุณาเลือกบริษัทก่อนใช้งาน") เมื่อ super admin ยังไม่เลือกบริษัท — แต่ Java **ไม่เคยส่งเหตุผลนี้ถึงหน้า** เพราะ `Data_API.sendGET` ทิ้ง body ของ non-200 (หน้ามีกิ่ง `error.message` รอไว้แต่เกิดไม่ได้). live ทำตาม Java (ผู้ใช้เห็นรายการสาขาว่างเงียบ ๆ) — ต้องการให้แสดงเหตุผลหรือไม่? (ถ้าใช่ = เปลี่ยนจากพฤติกรรม Java; ทำได้ง่ายด้วยการอ่าน body ของ error)
4. รูปคำตอบใน §5 ถูกต้องไหม โดยเฉพาะ: `GET /rv` มี `result.total`; `GET /rv/leads` เริ่ม `page=0` และรับ `pageSize` ได้ถึง 500 และ `search`; `medium_amount` เป็นตัวเลขหรือข้อความ; `standardSalePrice` ของ `master-data/materials`
5. `POST /rv` ยังตอบ 200 โดยไม่บันทึกอยู่ไหม (เหตุผลของ `verify`) และ `POST /rv/{id}/attachments` ยังพัง 500 ไหม (หน้าส่งไฟล์แนบ inline ใน `create`: base64 ไม่เกิน ~14.3 MiB)
6. `CRM_RV_View` / `CRM_RV_Edit` เป็นสิทธิ์แยกในอนาคตหรือไม่ (ตอนนี้ `FEATURE_CRM_Document` ผ่านทุกด่าน)
7. คำถามเดิมจากเฟส A ที่ยังเป็นของ Java ไม่ใช่ของ live: การ์ดแนะนำลูกค้าไม่ขึ้น (`odsProspectSuggest`), ฟอนต์ของรูปบน canvas, ชื่อแท็บ "ใบรับเงิน (RV)" — ดู `docs/integration/receipts.md` §4–5

## 8. ความเสี่ยง / ที่ไม่แน่ใจ

- **ทั้งหมดไม่ได้ตรวจกับ service จริง** (§0) — โดยเฉพาะ `total`, `content[]`, `medium_amount`, ลำดับ/ชื่อ param ของ `GET /rv`
- การบันทึกใบรับเงินเดิมทำ 4 call ในเซิร์ฟเวอร์ (count → POST → count → count remark) ตอนนี้ทำจากเบราว์เซอร์ต่อเนื่อง → ช้ากว่าเดิมตามเวลา round trip; ถ้าผู้ใช้ปิดแท็บระหว่างทาง ใบอาจถูกสร้างแต่ไม่เห็นผล verify
- GET ของ REST ไม่มี `Cache-Control` ที่ผมควบคุม — ถ้า gateway ให้ header ที่ทำให้เบราว์เซอร์ cache `GET /rv?page=1&pageSize=500` ผู้ใช้อาจเห็นรายการเก่า (Java ไม่มีปัญหานี้เพราะ server ถามใหม่ทุกครั้ง) — ตรวจกับ gateway จริง
- `materials` ไม่มี cache (§4.1)
- `GET /rv/{id}` ของ Java ส่ง `result` ผ่าน `JSONObject.toString()` (ลำดับ key = HashMap, ตัวเลขทศนิยมถูกจัดรูปใหม่); ฝั่งนี้ `JSON.stringify` — หน้าอ่านตามชื่อ field และ parse เป็นตัวเลข จึงไม่ต่าง แต่ไม่ใช่ไบต์เดียวกัน

## 9. วิธีรันซ้ำ

```bash
CI=1 node node_modules/@angular/cli/bin/ng.js test --no-watch --include 'src/app/features/receipts/**/*.spec.ts'   # 188 เทสต์
node node_modules/@angular/cli/bin/ng.js build                                                                   # production
node tools/compare/run.mjs receipts     --live --jobs 3     # 183 scenario
node tools/compare/run.mjs receipt-form --live --jobs 3     # 302 scenario (ข้าม 2) — 17 ตัวรอ prospects (§6.3)
node tools/compare/run.mjs receipt-form --live --no-build --show lead-prefill      # ดู diff
```
เฟส A (โหมด mock, ไม่มี `--live`): mock/host/logic ถูกแตะเล็กน้อย (เพิ่ม fault, `backend()`, normalizer) จึงรันซ้ำ **เฉพาะชุดตัวอย่าง** — `receipts` 65 ตัว (overview, state-*, detail-*, approve-*, report-*, …) และ `receipt-form` 96 ตัว (overview, save-*, lead-prefill*, cust-*, branches-*, methods-*, …): identical ทั้งหมด (3 ตัวต่างตอนเครื่องโหลดหนัก — puppeteer protocol timeout / หน้า Java ไม่ขึ้น — แล้ว identical เมื่อรันเดี่ยว). **ไม่ได้รันครบทั้ง 183 + 304 ของเฟส A** — ผู้ประสานงานควรรันเต็มหลัง merge (`node tools/compare/run.mjs receipts` และ `receipt-form`)
