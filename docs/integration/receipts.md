# INTEGRATION — ใบรับเงิน (RV): `receipts` (`/sales/receipts`) + `receipt-form` (`/sales/receipts/:id`)

> **อัปเดต 2026-10-21 — เฟส B (live adapter) ของหน้านี้ทำแล้ว: ดู `docs/integration/receipts-live.md`.** ข้อความ "ยังไม่มี live adapter / `<ts-live-missing />` / เหลือ REST" ในไฟล์นี้เป็นสถานะของเฟส A (ตารางที่ต้องพอร์ตด้านล่างยังใช้เป็นแผนที่ของ servlet ได้)

Workspace: `triple_sale_angular_ws_receipts` · เฟส A (mock mode) · เมนูกลุ่ม "งานขาย" (`sale`)
Java ต้นฉบับ: `pages/sales_doc_rv_list.xhtml` (+ `resources/support/sd2_list.css`, `drag_scroll.{css,js}`), `pages/sales_doc_rv.xhtml` (+ `components/sales_doc_tabs.xhtml`)

## 0. สรุปสถานะ

| หน้า | generator | compare (scenario ทั้งหมด / identical) | spec |
| --- | --- | --- | --- |
| `receipts` (รายการ) | `tools/sync-receipts.mjs` | 183 / 183 | `receipts.spec.ts` · `receipts.mock.spec.ts` · `receipts.logic.spec.ts` |
| `receipt-form` (ฟอร์ม) | `tools/sync-receipt-form.mjs` | 304 / 304 | `receipt-form.spec.ts` (+ mock/logic spec ร่วมกัน) |

"identical" = เทียบ DOM + attribute + ข้อความ + geometry + computed style ทุก element ของ root ที่กำหนด (`harness` ของ main) ระหว่างหน้า Java จริง (replica ของ shell + CSS/JS/markup จริงของ Java) กับ Angular — ทุก scenario มี `SCENARIO-ERROR` = 0 และ `pageerror` = 0 (ที่เหลือใน "browser errors" ของ report เป็น HTTP 4xx/5xx ที่ scenario ตั้งใจให้ mock ตอบเพื่อทดสอบสถานะ error). **หมายเหตุเรื่องความเสถียร:** เครื่องที่ใช้ทดสอบมี worker อื่นรันพร้อมกัน (CPU 28 คอร์ใช้ร่วม) — ในการรันแรก (ก่อน re-run ทีละอัน) มักมี 1–7 scenario ที่ Angular side ช้าเกิน `readyTimeout` 15 วินาที/CDP timeout แล้วเทียบไม่ตรง; harness รันซ้ำทีละอัน (`confirm`) แล้วผ่านทุกครั้ง และรันเดี่ยว ๆ ซ้ำผ่านทั้งหมด จึงนับเป็น noise ของเครื่อง ไม่ใช่ความต่างของหน้า — แนะนำให้ผู้ประสานงานรัน `--jobs 3` ตอนเครื่องว่าง

เทสต์: `CI=1 node node_modules/@angular/cli/bin/ng.js test --no-watch --include 'src/app/features/receipts/**/*.spec.ts'` → 4 ไฟล์ / **100 เทสต์ ผ่านทั้งหมด** (ไม่ได้รัน test suite ทั้งโปรเจกต์ตามข้อกำหนด)
บิลด์: `node node_modules/@angular/cli/bin/ng.js build` (production) → **ผ่าน ไม่มี warning/error** (`receipts` lazy chunk 63.6 kB, `receipt-form` 142.6 kB)

ไม่ได้ทำ (ตามขอบเขตเฟส A): live adapter (โหมดไม่ใช่ mock แสดง `<ts-live-missing />`), หน้ารายการเอกสารงานขายอื่น (QT/BK/OB/AQ/AD) — ใช้ `tools/lib/sales-doc.mjs` ต่อได้

## 1. ไฟล์ shared ที่ต้อง merge เอง (ผู้ประสานงาน)

ใน workspace นี้ผมแก้ `app.routes.ts` และ `page-registry.json` **เฉพาะเพื่อให้ `ng build` + harness เสิร์ฟหน้าได้** (ไม่มีทางอื่น — harness เทียบกับ build จริง) และคัดลอกไฟล์ที่ `refresh` ไม่ดึงจาก main — ทั้งหมดให้ merge ด้วยมือ (`node tools/workspace.mjs merge receipts` จะรายงานเป็น SHARED); `main` ได้เปลี่ยน `app.routes.ts`/`page-registry.json` ไปแล้ว (เพิ่มหน้า report) จึงต้อง merge ทีละบรรทัด ไม่ใช่ทับไฟล์:

| ไฟล์ | การเปลี่ยน |
| --- | --- |
| `src/app/app.routes.ts` | เพิ่มใน `IMPLEMENTED` 2 บรรทัด: `receipts: { load: () => import('@features/receipts/receipts').then((m) => m.Receipts) },` และ `'receipt-form': { load: () => import('@features/receipts/receipt-form').then((m) => m.ReceiptForm) },` |
| `src/app/core/navigation/page-registry.json` | `"implemented": true` ของ `receipts` และ `receipt-form` |
| `package.json` | scripts: `"receipts:sync": "node tools/sync-receipts.mjs"`, `"receipt-form:sync": "node tools/sync-receipt-form.mjs"` (workspace ไม่ได้แก้ — ผมไม่แตะ package.json) |
| `public/assets/i18n/app.{th,en}.json` | key `app.live.missingTitle/missingText` — **เหมือนของ main ทุกไบต์** (คัดลอกมาเพราะ `refresh` ไม่ดึงไฟล์ i18n; ไม่มี key ใหม่ของเรา — ทุกข้อความใช้ key เดิมของ Java) |
| `src/app/shared/ui/live-missing/live-missing.ts` | **เหมือนของ main ทุกไบต์** (คัดลอกมาเพราะ `refresh` ไม่ดึง `shared/ui`) |
| `src/app/core/navigation/nav.config.ts` | **แก้ที่ main**: แท็บ `rv` ของกลุ่ม `sale` ใช้ `labelKey: 'label.rv.title'` ("ใบรับเงิน") แต่แท็บของ Java (`components/sales_doc_tabs.xhtml`) ใช้ `label.rv.title_list` ("ใบรับเงิน (RV)") — generator พิมพ์คำเตือนนี้ทุกครั้งที่รัน (`checkSaleTabs`); ส่วนที่เหลือของแท็บ (id/ลำดับ/route) ตรงกับ Java |
| `CLAUDE.md` | bullet ใหม่: หน้า **ใบรับเงิน (receipts + receipt-form) เป็นไฟล์ที่ถูกสร้าง** (`features/receipts/receipts.{html,scss,engine.ts}` จาก `sales_doc_rv_list.xhtml` + `sd2_list.css`; `receipt-form.{html,scss,engine.ts}` จาก `sales_doc_rv.xhtml`) — ห้ามแก้ด้วยมือ: แก้ `tools/sync-receipts.mjs` / `tools/sync-receipt-form.mjs` แล้วรัน `npm run receipts:sync` / `npm run receipt-form:sync`; ส่วนที่เขียนเอง: host `receipts.ts`/`receipts-view.ts`/`receipt-form.ts`/`receipt-form-view.ts`, สัญญา `receipts-backend.ts`, mock `receipts.mock.ts` (+ `receipts.files.ts`), ตรรกะ `receipts.logic.ts`, `ts-pref.ts`; ตรรกะร่วมของกลุ่มงานขายอยู่ที่ `tools/lib/sales-doc.mjs`. เพิ่มใน "คำสั่ง": `npm run receipts:sync` · `npm run receipt-form:sync` |
| `README.md` | แถวของ 2 หน้า (ใบรับเงิน (RV) / ใบรับเงิน — พอร์ตแล้ว เฟส A) |
| `manual/index.html` | หัวข้อใหม่ — ชิ้นส่วนพร้อมวางอยู่ที่ `manual-receipts.html` (ทั้งสองหน้าในหัวข้อเดียว); ทะเบียนหน้า (`page-receipts`, `page-receipt-form`) ใช้ `implemented: true` → ป้าย "เสร็จ" |
| `src/app/core/navigation/java-links.ts` (+ spec) | **ไม่ต้องเพิ่ม rule** — `sales_doc_rv_list` → `/sales/receipts`, `sales_doc_rv` → `/sales/receipts/new` มีอยู่แล้วและ generator เรียกใช้ตรวจ (หยุดถ้า rule หาย) |

## 2. ไฟล์ใน `tools/lib/**` และ `tools/compare/lib/**` ที่ผมเพิ่ม/แก้ (ย้อนหลัง-เข้ากันได้ทั้งหมด — ผู้ประสานงานนำเข้า)

| ไฟล์ | อะไร / ทำไม |
| --- | --- |
| `tools/lib/sales-doc.mjs` (**ใหม่**) | ตัวช่วยร่วมของ generator + harness ของกลุ่ม "งานขาย": `salesPage()` แกะหน้า Facelets (ui:define head/content + `sales_doc_tabs` + `<style>`/`<script>`), `checkSaleTabs()` เทียบแท็บ Java กับ `nav.config.ts`, `elToEnv()` แปลง `#{commonBean.msg['k']}`/`#{request.contextPath}` **ในสตริงของสคริปต์** เป็น `env.t("k")`/`env.ctx` ด้วย TypeScript parser (regex แยก `'` ในสตริงกับใน regex literal ไม่ได้ เช่น `.replace(/"/g,…)`), `checkMessages()` (ข้อความต้องไม่มี `'` `"` `\` ขึ้นบรรทัด ทั้ง th/en — ไม่งั้นหน้า Java เองก็พัง), `stripIife()`, และฝั่ง harness `resolveJavaEl()` / `xhtmlToHtml()` / `replicaSections()` / `TOPBAR_SALE_PAGES`. ใช้ต่อได้กับ QT/BK/OB/AQ/AD (หน้าเหล่านั้น include `sales_doc_tabs.xhtml` เหมือนกัน) |
| `tools/compare/lib/shell-replica.mjs` | (1) `TOPBAR_PAGES.sale` = `001…014` — `CommonBean.viewTopbarPage()` **ไม่มี entry ของ `navbar_menu_sale`** จึงตอบ true ทุกแผงแล้ว `sales_doc_tabs.xhtml` ซ่อนด้วย inline `display:none` ก่อนฉีดแท็บ `#sd2TopTabs` (2) `TEMPLATE_SCRIPTS(bundle = th)` — ข้อความของ ODS/input guard เป็นของภาษาที่เลือก (เดิมเป็นไทยเสมอ → dropdown ของหน้าอังกฤษมี "เลือก" ไทย) |
| `tools/compare/lib/servers.mjs` | handler คืน `{ destroy: true }` = ไม่ตอบเลย (ตัด socket) → `fetch` ฝั่ง Java ล้มด้วย `TypeError: Failed to fetch` เหมือน network error จริง (ใช้กับ fault `list-down`, `approve-down`, `create-down`) |
| `tools/compare/lib/runner.mjs` | `opts.local = { key: value }` — ค่า localStorage ที่หน้าพบตอนเปิด ทั้งสองฝั่ง (ใช้ทดสอบ "จำตัวกรองผลิตภัณฑ์ไว้ข้ามการเปิด"). **ชื่อ `local` ไม่ใช่ `storage`** เพราะหลัง `refresh` ครั้งที่ 2 `opts.storage` ของ main หมายถึง sessionStorage — ไฟล์นี้ re-base บนของ main แล้วเพิ่มเฉพาะบรรทัดนี้ (init + `localStorage.setItem` 1 บรรทัด) |
| `src/styles/_swal.scss` | **ไม่ได้แก้แล้ว** — ผมเคยเพิ่มกฎ `.swal-footer` (กึ่งกลาง, flex, gap) / `.swal-button-container {margin:0}` / `letter-spacing: normal` ของปุ่ม popup (กฎจริงอยู่ใน `<style>` ของ `topbar.xhtml` ที่ทุกหน้า Java include; harness ของใบรับเงินเจอ popup ยืนยันสูงกว่า Java 10px และปุ่มกว้างกว่า 1.8px) ระหว่างงาน main ได้เพิ่มกฎชุดเดียวกัน (ต่างแค่ผมใส่ `select` ใน `:is(…)` ด้วย — ไม่มีผลกับหน้านี้) จึงใช้ของ main ตามเดิมและ compare ของใบรับเงินผ่านบน build นั้น |

ไฟล์อื่นที่เพิ่มนอกโฟลเดอร์ feature: `public/assets/images/icon/{fi_search,fi_file-o,fi_download,default_avatar}.svg` (คัดลอกจาก `web/images/icon/` **ทุกไบต์** โดย generator — เลย์เอาต์กระจก `web/images/<path>` → `public/assets/images/<path>`), `tools/compare/pages/receipts/replica.mjs` (ส่วนร่วมของ harness สองหน้า)

## 3. Backend contract และสิ่งที่ live adapter (เฟสถัดไป) ต้องย้าย

สัญญา: `src/app/features/receipts/receipts-backend.ts` — `fetch(input, init)` (URL เดียวกับที่หน้า Java เรียก BFF โดยตัด context path: `/rvapi?action=…`, `/board/…`) + `file(url)` (ไฟล์ของ `/rvreport` `/rvreceipt` — **sync** เพราะหน้าเปิดด้วย `window.open` ในจังหวะคลิก; live adapter ที่ต้องรอ request ให้เปิดแท็บเปล่าก่อนแล้วค่อยสั่ง location). host ในโหมดไม่ใช่ mock แสดง `<ts-live-missing />` และไม่เรียกอะไรเลย (spec ตรวจ)

| Java | ทำอะไร (ตรรกะที่ต้องย้าย) | สถานะใน TS |
| --- | --- | --- |
| `RvApiServlet` (`/rvapi`) | `GET list|detail|leads|materials|products|branches|currencies|receiveMethods|attachFileTypes`, `POST create|approve` (+ `attach`, `calculate` ที่หน้าไม่ใช้); `POST create|attach` ต้องมีสิทธิ์ `CRM_RV_View,CRM_RV_Edit,FEATURE_CRM_Document` (403 `{status:403,message:"forbidden: … required"}`), `approve` ใช้ชุดเดียวกัน (+ 400 `{message:"txno required"}`); action ไม่รู้จัก = 400 `{message:"unknown action"}`; ข้อผิดพลาดภายใน = 500 `{message:"internal error"}` | mock ตอบรูปเดียวกันทั้งหมด |
| `RvApiService.listJson` | ส่งต่อ `GET /triplesale-service/api/v1/rv?search&status&dateFrom&dateTo&page&pageSize` (param ว่างไม่ส่ง) — หน้าขอ `page=1&pageSize=500` ครั้งเดียวแล้วค้น/กรอง/เรียงฝั่ง client; ตอบไม่ใช่ JSON → `{status:502,message:"backend ไม่ตอบหรือ response ไม่ใช่ JSON"}` | mock: กรอง search/status/dateFrom/dateTo/แบ่งหน้าจริง |
| `RvApiService.detailJson` + `RvDetailNormalizer` | `GET /rv/{id}` แล้ว normalize: `currency_symbol` (฿ / `USD `), `remark` เติมจาก `description`, `payment_items[].amount` (อ่าน `medium_amount` ก่อน `amount`; รับข้อความ "27,300.00"), `amount_available`, `payments_total`, `change_amount` (> 0.005) | **ย้ายแล้ว**: `receipts.logic.ts` (`normalizeRvDetail`, `currencySymbol`) + `receipts.logic.spec.ts` — live adapter ใช้ตรง ๆ |
| `RvApiService.rvLeadsJson` | `GET /rv/leads?page=0&pageSize=500[&search]` → `result.content[]` map เป็น `{leadId, code(=prospectCode), name(=prospectName), txNo(=leadTxNo), employeeName, leadStatus}`, ข้ามแถวที่ไม่มี `prospectCode`; ผิดพลาด → `{result: []}` (ห่อ `{result:[…]}` ไม่มี status); ไม่ cache | mock |
| `RvApiService.materialsJson` | ไล่ `GET master-data/materials?page=n&pageSize=30` สูงสุด 40 หน้า, dedupe ด้วย `code`, map `{code, name, salePrice=standardSalePrice}`, หยุดเมื่อหน้าว่าง/ไม่มี code ใหม่/ได้ไม่เต็มหน้า; cache 30 นาที (เก็บเฉพาะผลที่มีของและไม่ล้มเหลว) | mock (รูปเดียวกัน) |
| `productsJson` / `currenciesJson` / `receiveMethodsJson?txType=rv` | passthrough `master-data/movement-types/LD`, `master-data/currencies` (`{baseCurrency, items:[{code,name,exchangeRate}]}`), `master-data/receive-methods` (แถวละ **ประเภท** + `items[]`/`count`, รูปเก่าแถวละบัญชียังรองรับ); cache 30 นาทีเฉพาะผลที่ใช้ได้ | mock ทั้งรูปใหม่และรูปเก่า |
| `branchesJson` | `GET master-data/business-branches?page=1&perPage=500` → `{branchId, branchCode, branchName}`; **cache ใน session ของผู้ใช้** (สาขาขึ้นกับบริษัทที่ login; super admin ยังไม่เลือกบริษัท = 409 พร้อม `error.message`) | mock รวม 409 |
| `attachFileTypesJson` | `master-data/attach-file-types` → `[{id,code,name,nameTh}]`; cache เฉพาะเมื่อ `result` เป็น array (ว่างก็นับ: ว่าง = backend ตั้งใจไม่อนุญาต → ปิดอัปโหลด; ไม่มี `result` = หน้าใช้รายการสำรอง) | mock |
| `createAndVerifyJson` | นับ `GET /rv?page=1&pageSize=1` → `result.total` ก่อน/หลัง `POST /rv` (และค้นด้วย `remark`) ตอบ `{api:<ดิบ>, verify:{totalBefore,totalAfter,foundByRemark,persisted}}` — backend เคยตอบ 200 โดยไม่บันทึก จึงห้ามเชื่อ HTTP 200 อย่างเดียว. **payload**: `value` = ยอด**ก่อนภาษี**เสมอ (แถว "รวม Vat (Incl.)" ส่ง `value*100/107` เต็มทศนิยม — ตรรกะนี้อยู่ใน engine ที่ generate จากหน้า Java และถูก harness ยืนยัน payload ตรงกันทุกไบต์) | mock + verify (บันทึกจริงใน memory → รายการเห็นทันที) |
| `approveJson` | `POST /rv/approve?txno=` body `"{}"`; backend ตอบ 200 เสมอ — ผลจริงอยู่ใน `result:{result,status,hopDone,message,txno}` (หน้าเชื่อ `hopDone === true` เท่านั้น) | **ย้ายแล้ว**: `rvApproveReply()` ใน `receipts.logic.ts` (ตารางสถานะ→คำตอบ) |
| `RvJasperReportServlet` (`/rvreport`) | `txno` ต้องตรง `[A-Za-z0-9:\-]+` (400 ข้อความไทย) → ยิง JasperReports (`TriplesaleApi.rvJasperReportUrl`, config `triplesale.report.base`) → ตรวจ magic `%PDF-` (ไม่ใช่ = 502 พร้อมข้อความ) → stream PDF `inline; filename=<txno>.pdf`; `format=png` = rasterize หน้าแรก 150 DPI (PDFBox). **เลขที่ต้องเป็นเลข ERP** (จาก `print_forms[].url` → `txno=`; เลข CRM ได้ PDF ว่าง 1,218 ไบต์ — หน้า Java จึงไม่ fallback) | mock: PDF/PNG ที่ valid จริง (`receipts.files.ts`), 400/502 เหมือน servlet |
| `RvReceiptPdfServlet` (`/rvreceipt?id=`) | ใบรับเงินที่ยังไม่ sync ERP: ประกอบ PDF A4 ด้วย OpenPDF + ฟอนต์ THSarabunNew จาก `detailJson` (หัวบริษัท, ตารางรับชำระ, ยอด, หมายเหตุ); 400 ไม่มี id / 404 ไม่พบ | mock |
| `ProspectListServlet` / `ProspectListService` (`/board/prospect-list`) | รายการลูกค้า (`page, perPage, searchText, enrich=1`) → `{status,message,result:{items:[{id,code,name,phone,addr,avatar,…}],meta}}` — ฟอร์มใช้เติมเบอร์/ที่อยู่/avatar ในการ์ดเลือกลูกค้า (เฉพาะตอนพิมพ์ค้นหา, debounce 250 ms) | mock |
| `LeadDetailServlet` (`/board/lead?id=[&activityGroupId=]`) | ต้องมี `CRM_Lead_View` (403 + `error.message`); lead ที่ทำงานหลายกลุ่มพร้อมกันตอบ 400 ถ้าไม่ระบุกลุ่ม; ตอบ lead (`id, txNo, prospect:{id,name}, materialList:[{id,code,name}]`) | mock (รวม 400/404/500/network) |
| `ProspectDetailServlet` (`/board/prospect?id=`) | prospect + ผสม `sunProspectInfo` จาก DB (`SunProspectInfoBoDao`) — ฟอร์มใช้แค่ `code` (ส่งเป็น `payerCode`; ไม่ขึ้นต้น `CUS` = toast เตือนว่าไม่มีรหัส ERP) | mock |
| `SessionTokenFilter` / `SessionRoles` | ตรวจ login + role ของทุกคำเรียก | แทนด้วย `bearerInterceptor` + `PermissionService` |
| `ui_pref.js` (`TS_PREF`) | localStorage + cookie สำรอง `tsp_<key>` (1 ปี) | `ts-pref.ts` (path cookie = `/` แทน context path) |
| `crm_error_popup.js` (`crmLeadFetchFailed`) | popup ข้อผิดพลาดของ lead (title + `error.message`) | โหลดโดย `DomGuards` (ของเดิม) |

Fault ของ mock (เพิ่ม `?mock=<ชื่อ>` ที่ address — เฉพาะโหมด mock — เพื่อดูสถานะ error/ว่าง): ดูหัวไฟล์ `receipts.mock.ts` (30+ ค่า: `empty`, `list-html`, `list-down`, `slow`, `detail-*`, `approve-*`, `materials-*`, `branches-*`, `methods-*`, `attach-*`, `create-*`, `lead-*` …)

## 4. ความต่างจาก Java (ตั้งใจ) และข้อสังเกต

1. **การ์ดแนะนำลูกค้าใต้ช่องค้นหา (`odsProspectSuggest`) ไม่ทำงานใน Java จริง** — `template.xhtml` โหลด `open_down_select.js` ท้าย `<body>` หลังสคริปต์ของหน้ารัน → `window.odsProspectSuggest` ยังไม่มีตอนที่สคริปต์เช็ค (replica ของ harness มีลำดับเดียวกันและยืนยัน). พอร์ตคงพฤติกรรมนี้ (`env.suggestCustomers = false`) และคงโค้ดไว้พร้อมใช้เมื่อฝั่ง Java แก้ลำดับ → **คำถามถึงเจ้าของระบบ**: ตั้งใจให้ขึ้นการ์ดหรือไม่? (ถ้าใช่ แก้ที่ Java แล้วตั้ง flag เป็น true)
2. **รูปใบรับเงินที่วาดบน canvas** (`openReceiptImage`, ใช้เมื่อใบยังไม่ sync ERP) ใช้ฟอนต์ `"Noto Sans Thai"` ซึ่ง Java **ไม่เคยประกาศ `@font-face`** (topbar.css เขียนไว้เอง) → Java วาดด้วยฟอนต์ระบบของเครื่อง (เครื่องไม่มี Leelawadee UI = sans-serif), Angular มีฟอนต์ Noto Sans Thai จริง → ไบต์ของ PNG ต่างตามฟอนต์. harness จึงเทียบ "เปิดแท็บ `image/png` ขนาด 800×H เท่ากัน" แทนไบต์ (scenario `report-image-unsynced*`). ภาพของ Angular คมและเหมือนกันทุกเครื่อง
3. **shell: `prefers-reduced-motion`** — `styles/_base.scss` ทำให้ทุก element มี transition 0.01 ms เมื่อผู้ใช้ตั้ง reduce motion; สคริปต์ของหน้าจัด modal กลางจอแบบ "ตั้ง `transform:none` แล้วอ่านตำแหน่งทันที" จึงอ่านค่าเก่าและ modal เยื้อง (เกิดในเครื่องทดสอบนี้ด้วย). แก้เฉพาะ `.sd2-dialog, .sd2-dt-box { transition: none !important }` ใน `receipts.scss` (generator) — **แนะนำให้ผู้ประสานงานพิจารณา** กฎ global ดังกล่าวกับหน้าอื่นที่พอร์ตจาก Java (ซึ่งไม่มีกฎนี้)
4. ที่อยู่รูป: `web/images/icon/x.svg` → `assets/images/icon/x.svg` (generator คัดลอกไฟล์); ลิงก์ในหน้า → route ของแอป (`/sales/receipts`, `/sales/receipts/new`) — host แปลงคลิกบน `<a href="/sales/…">` เป็น router; `window.location.href` → `env.navigate(route)`
5. **`:id` ของฟอร์ม** — หน้า Java ไม่รับ id (สร้างใหม่เท่านั้น; แก้ไขหลังสร้างไม่ได้ — backend มีแค่ create/approve) → route `sales/receipts/:id` แสดงฟอร์มสร้างใหม่เสมอ ไม่ว่า id อะไร. query `leadId`, `activityGroupId`, `listMaterialId` อ่านจาก address เหมือนเดิม
6. **สิทธิ์** — ปุ่ม "เพิ่มใหม่", "บันทึก", "อัปโหลด" และปุ่ม "อนุมัติ" ใช้ `can('CRM_RV_View,CRM_RV_Edit,FEATURE_CRM_Document')` เหมือน Java; เส้นทางเข้าหน้า (`pageGuard`) ใช้ `FEATURE_CRM_Document` ซึ่งอยู่ในชุดนี้ด้วย → ผู้ใช้ที่เปิดหน้าได้จึงเห็นปุ่มเสมอ (ทางที่ไม่เห็นปุ่มเข้าไม่ถึงผ่าน router) — กิ่ง "ไม่มีสิทธิ์" ครอบด้วย unit spec (`receipts.spec.ts`, `receipt-form.spec.ts`) ไม่ใช่ harness
7. ข้อความแจ้งเตือน/ยืนยันใช้ **SweetAlert จริง** (ไฟล์เดียวกับ Java ผ่าน `@core/dom/swal`) — harness เทียบ DOM ของ `.swal-overlay` ด้วย
8. `breadcrumb` (`viewname`) ของ Java (`เอกสารงานขาย > ใบรับเงิน (RV)` / `เอกสารการเงิน > ใบรับเงิน`) อยู่ใน shell ไม่ใช่ในหน้า — ไม่ได้พอร์ต/ไม่ได้เทียบ (นอก roots)
9. รายการสินค้าตัวอย่างเก่า (`RV_ITEM_NAMES_LEGACY` ~500 ชื่อ — โค้ดไม่ใช้) คงอยู่ใน engine ตามต้นฉบับ
10. เวลา "ตอนนี้": ค่าเริ่มต้นวันที่ของฟอร์มคือ `new Date()` ของเบราว์เซอร์ (Java ทำเหมือนกัน) — ทั้งสองฝั่งของ harness รันในนาทีเดียวกันจึงตรงกัน (ไม่ต้อง normalize)
11. Chrome ใส่ข้อความ error ของ `Response.json()` ต่างกันระหว่าง Response จริงจาก network กับ Response ที่ mock สร้างในหน้า (`Failed to execute 'json' on 'Response': ` นำหน้า) และหน้าแสดงข้อความนี้ให้ผู้ใช้เห็น (กล่องแจ้งผลหลังบันทึก — ขนาดกล่องเปลี่ยนตามความยาว) — แก้ที่ต้นเหตุ: `receipts.mock.ts` ตอบด้วย Response ที่ `json()` ทำงานเหมือน network (`asNetwork`) ไม่มี normalize ใน harness. live adapter ใช้ `fetch` จริงอยู่แล้วจึงไม่เกี่ยว
12. **URL ที่ escape พังไม่ได้ (`?leadId=%2`)** — router ของ Angular parse address ไม่ได้ (`decodeURIComponent` โยน `URIError`) แล้วแสดงหน้า fallback (`/crm/home`) ก่อนที่ component ของเราจะถูกสร้าง ส่วนหน้า Java (`URLSearchParams`) รับได้และถือ id เป็นข้อความ — เป็นพฤติกรรมของ router/shell (นอกขอบเขตหน้านี้ และไม่มีใครสร้าง URL แบบนี้) จึงไม่มี scenario เทียบ; harness ทดสอบรูปแบบที่ valid แต่แปลก (`leadId=%E0%B8%81`, `leadId=%204`) แทน — **แจ้งผู้ประสานงาน**: ถ้าต้องการให้ทนต่อ URL พัง ต้องใส่ `UrlSerializer` ที่ทนได้ใน `core`

13. host ของทั้งสองหน้า (`ts-receipts-view`, `ts-receipt-form-view`) มี `host: { 'data-java-page': '' }` ตามที่ผู้ประสานงานแจ้ง — กฎ `button:disabled:not(:where([data-java-page], …))` ใน `_base.scss` ของ main จึงไม่แตะปุ่มของหน้า (Java ไม่มี `cursor: not-allowed`). overlay/panel ที่สคริปต์ย้ายไปไว้ที่ `<body>` (กล่องยืนยัน/เลือกสินค้า ฯลฯ) อยู่นอก host — harness เทียบ `cursor` ของทุกองค์ประกอบในนั้นด้วย (ผลอยู่ในหัวข้อ 0)

## 5. คำถามถึงเจ้าของระบบ

1. ข้อ 4.1 (การ์ดแนะนำลูกค้าไม่เคยขึ้น) และ 4.2 (ฟอนต์ของรูปใบรับเงิน) — ต้องการแบบไหน?
2. แท็บ "ใบรับเงิน" ในแถบบน: ชื่อ `ใบรับเงิน (RV)` (Java) หรือ `ใบรับเงิน` (nav.config.ts เดิม)?
3. `ROLE_RV_*` ฝั่ง server ตั้งไว้ให้ `FEATURE_CRM_Document` ผ่านทุกด่าน — ตั้งใจให้ `CRM_RV_View/Edit` เป็นสิทธิ์แยกในอนาคตหรือไม่ (ตอนนี้ไม่มีผลในทางปฏิบัติ)?
4. live adapter: `POST /rv/{id}/attachments` พัง 500 (ตามคอมเมนต์ใน `RvApiService`) จึงส่งไฟล์แนบ inline ใน `create` (base64 สูงสุดประมาณ 14.3 MiB, `BACKEND_LIMIT_attachments_20MB.md`) — ยืนยันว่าคงแบบนี้
5. `report` server (JasperReports) ที่ต้องเรียกจากเบราว์เซอร์ใน live phase: ต้องการ CORS/พร็อกซี และ PNG จาก PDF ไม่มี PDFBox ในเบราว์เซอร์ — ตัดสินใจว่าจะทำที่ไหน

## 6. ไฟล์ที่เพิ่ม/แก้ (ผล `node tools/workspace.mjs status receipts` รันจาก main — อ่านอย่างเดียว)

- **clean — `merge receipts --apply` คัดลอกกลับได้ (30 ไฟล์):** `INTEGRATION.md`, `manual-receipts.html`, `public/assets/images/icon/{fi_download,fi_file-o}.svg`, `src/app/features/receipts/**` (host 4 ไฟล์ `receipts.ts` `receipts-view.ts` `receipt-form.ts` `receipt-form-view.ts`; สัญญา/ตรรกะ/mock `receipts-backend.ts` `receipts.logic.ts` `receipts.files.ts` `receipts.mock.ts` `ts-pref.ts`; ไฟล์ที่ generate `receipts.{html,scss,engine.ts}` `receipt-form.{html,scss,engine.ts}`; spec 5 ไฟล์), `tools/compare/pages/{receipts,receipt-form}/**`, `tools/sync-receipts.mjs`, `tools/sync-receipt-form.mjs`
- **SHARED — merge ด้วยมือ (2):** `tools/lib/sales-doc.mjs` (ไฟล์ใหม่ทั้งไฟล์ — คัดลอกได้ตรง ๆ), `tools/compare/lib/shell-replica.mjs` (เพิ่ม `sale: […]` ใน `TOPBAR_PAGES` + พารามิเตอร์ `b = th` ของ `TEMPLATE_SCRIPTS` — 3 จุดเล็ก ๆ)
- **CONFLICT — main เปลี่ยนไฟล์เดียวกันไปแล้ว (4) — merge ทีละบรรทัด:** `src/app/app.routes.ts` · `src/app/core/navigation/page-registry.json` (ดูตารางข้อ 1) · `tools/compare/lib/runner.mjs` (เพิ่ม `opts.local` 2 บรรทัด) · `tools/compare/lib/servers.mjs` (เพิ่ม `if (r?.destroy) return void req.socket.destroy();` 1 บรรทัด + คอมเมนต์)
- ไฟล์ที่ผมคัดลอกจาก main ให้เหมือนทุกไบต์ (`public/assets/i18n/app.{th,en}.json`, `shared/ui/live-missing/live-missing.ts`, `fi_search.svg`, `default_avatar.svg`) main มีอยู่แล้ว/เหมือนกัน จึงไม่ปรากฏเป็นการเปลี่ยน — ข้อมูลในตารางข้อ 1 สำหรับผู้ที่ main ยังไม่มี

## 7. วิธีรันซ้ำ

```bash
node tools/sync-receipts.mjs && node tools/sync-receipt-form.mjs          # สร้างไฟล์ (รันซ้ำแล้วไฟล์ไม่เปลี่ยน)
node tools/compare/run.mjs receipts --list                                  # รายชื่อ scenario ของหน้ารายการ
node tools/compare/run.mjs receipts            --jobs 5                     # ทั้งหมด (build → รัน → เทียบ)
node tools/compare/run.mjs receipt-form        --jobs 5
node tools/compare/run.mjs receipt-form --no-build --show <scenario> [--style|--geom]
```
