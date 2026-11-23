# INTEGRATION — เอกสารงานขาย: `sales-doc-list` + `sales-doc-form` (งานขาย: ใบเสนอราคา · ใบจอง · ใบส่งสินค้า · ใบเสนอราคารถยนต์ · ใบจองรถยนต์)

workspace: `triple_sale_angular_ws_salesdocs` · Java ต้นฉบับ: `web/pages/sales_doc_type_list.xhtml` (หน้ารายการ) และ `sales_doc_{qt,bk,ob,aq,ad}_form.xhtml` (ห้าฟอร์ม)
สถานะ: **เฟส A (mock) — ไม่มี live adapter**; โหมดไม่ใช่ mock แสดง `<ts-live-missing/>` ทั้งสองหน้า

## 0. การเปลี่ยนไฟล์ shared ที่ต้อง merge (ทำเอง/ตรวจโดยผู้ประสานงาน)

### 0.1 ไฟล์ shared ที่ผมแก้ใน workspace นี้ (ต้องนำเข้า)

| ไฟล์ | เหตุผล | การเปลี่ยนแปลง |
| --- | --- | --- |
| `src/app/app.routes.ts` | ลงทะเบียนสองหน้า | เพิ่มสองบรรทัดใน `IMPLEMENTED`: `'sales-doc-list': { load: () => import('@features/sales-docs/list/sales-doc-list').then((m) => m.SalesDocList) }` และ `'sales-doc-form': { load: () => import('@features/sales-docs/form/sales-doc-form').then((m) => m.SalesDocForm) }` |
| `src/app/core/navigation/page-registry.json` | หน้าพอร์ตแล้ว | `"implemented": true` ของ `sales-doc-list` (route `sales/docs/:type`) และ `sales-doc-form` (route `sales/docs/:type/:id`) — แก้สองค่า ไม่มีอย่างอื่น |
| `public/assets/i18n/th.json`, `en.json` | ข้อความของ Java เพิ่มเข้ามาหลัง snapshot ของ main (19/10) | สร้างใหม่ด้วย `node tools/convert-i18n.mjs` (ไม่ได้แก้มือ): **เพิ่ม 89 key** (`label.sdn.*` · `label.pqt.*` · `label.qtl.*` · `label.vl.*`) และ **เปลี่ยน 3 key** (`label.qt.validate_customer` "กรุณากรอกชื่อลูกค้า" → "กรุณาเลือกลูกค้า" · `label.qt.validate_items` "…เพิ่มรายการอย่างน้อย 1 รายการ" → "…เพิ่มสินค้าอย่างน้อย 1 รายการ" · `label.vm.sum_include` "ภาษีมูลค่าเพิ่ม 7% (รวมในราคาแล้ว)" → "ภาษีมูลค่าเพิ่ม 7%") — **วิธี merge ที่ปลอดภัยที่สุด: รัน `node tools/convert-i18n.mjs` ใน main** (ไฟล์ทั้งสองเกิดจาก `messages*.properties` ของ Java) |
| `tools/lib/sales-doc.mjs` | `elToEnv` ต้องรู้ว่า EL อยู่ในสตริงที่ใช้เครื่องหมายคำพูดอะไร (ข้อความที่มี `'` หรือ `"` ใน JS string) | ส่ง `q` (quote char) เป็นอาร์กิวเมนต์ที่สองให้ `resolve(expr, q)` — backward compatible (callback เดิมที่รับอาร์กิวเมนต์เดียวทำงานเหมือนเดิม) · ทำ 2 บรรทัด + คำอธิบาย `@param` |

ไฟล์ **ใหม่** ใน `tools/lib/` (ไม่ชนของเดิม; ใช้โดย generator ของสองหน้านี้เท่านั้น):

| ไฟล์ | หน้าที่ |
| --- | --- |
| `tools/lib/facelets.mjs` | ตัวประเมิน Facelets (`renderPage`): `ui:include` / `ui:param` / `ui:fragment` / `c:if`-แบบ `rendered` / EL ย่อย (`eq ne and or not empty ?: a.b a['b'] hasFeature .concat`) · โหมด `'java'` (ค่าทุกตัวถูกแทนเหมือนที่ server ทำ — ใช้สร้างหน้า Java ใน harness) และ `'template'` (พารามิเตอร์คงที่แทนค่า ข้อความ/ค่าจาก server เป็น sentinel ที่กลายเป็น `{{ t('…') }}` / `[attr.x]`) |
| `tools/lib/facelets.selftest.mjs` | เทสต์ของตัวประเมิน (EL, สมมูลกับตัวอ่าน rv-list เดิม, render ทั้ง 11 หน้า × 2 โหมด) — `node tools/lib/facelets.selftest.mjs` |
| `tools/lib/sales-doc-forms.mjs` | `bundles` · `loadSalesPage` · `toAngularTemplate` · `checkMarkupMessages` / `checkScriptMessages` (ตรวจว่าทุก message ที่หน้าใช้มีทั้ง th/en และไม่ทำให้ markup เสีย) · `portCss` / `dropStrayBraces` / `dedent` |
| `tools/lib/sales-doc-libs.mjs` | แปลง `resources/support/sales_doc_*.js` 17 ไฟล์เป็นโมดูลเดียว `sales-doc-libs.engine.ts` — swap ที่ประกาศไว้เท่านั้น (`fetch→env.fetch`, `swal→env.swal`, `window.location.href=→env.navigate`, listener/timer/rAF/IntersectionObserver/`document.body.appendChild` ผ่าน runtime ที่เก็บคืนได้) + นับจำนวนจุดที่ swap ต่อไฟล์ (`EXPECT`) — ต้นฉบับเปลี่ยน = generator หยุด |

### 0.2 สิ่งที่ผู้ประสานงานต้องเพิ่มเอง (ไม่ได้แก้ในที่นี้)

1. `package.json` scripts:
   ```json
   "sales-doc-list:sync": "node tools/sync-sales-doc-list.mjs",
   "sales-doc-form:sync": "node tools/sync-sales-doc-form.mjs"
   ```
   (header ของไฟล์ generated อ้างถึง `npm run sales-doc-list:sync` / `npm run sales-doc-form:sync`)
2. `CLAUDE.md` — bullet ใหม่ (ตามแบบหน้าอื่น): "**เอกสารงานขาย** (`features/sales-docs/`): `sales-doc-list` (`/sales/docs/:type`) + `sales-doc-form` (`/sales/docs/:type/:id`) — ห้ามแก้ `*.html/*.scss/*.engine.ts` ตรง ๆ (generated โดย `tools/sync-sales-doc-{list,form}.mjs`); logic ของฟอร์มทั้งห้าอยู่ใน `sales-doc-libs.engine.ts` (สคริปต์ `sales_doc_*.js` 17 ไฟล์) + engine ต่อประเภท; backend = `SalesDocBackend.fetch` / `SalesDocListBackend.list`; ยังไม่มี live adapter."
3. `README.md` — เพิ่มแถวของสองหน้า (ลิงก์ไป manual §ใหม่).
4. `manual/index.html` — แทรกชิ้นส่วน `manual-sales-docs.html` (อยู่ที่ราก workspace นี้ เป็น `<section id="sales-docs">`) ต่อจากหัวข้อ Dashboard และเพิ่มลิงก์ใน TOC.
5. `core/navigation/java-links.ts` — **ไม่ต้องแก้**: rule `sales_doc_type_list` → `/sales/docs/:doc` และ `sales_doc_(qt|bk|ob|aq|ad)_form` → `/sales/docs/:type/new` มีอยู่แล้ว (สเปกสองหน้าตรวจให้).
6. `src/app/core/navigation/nav.config.ts` — **ข้อสังเกต** (ไม่ได้แก้): แท็บ "ใบรับเงิน" ใน strip ของงานขายใช้ `label.rv.title` ("ใบรับเงิน") แต่ strip ของ Java (`sales_doc_tabs.xhtml`) ใช้ `label.rv.title_list` ("ใบรับเงิน (RV)") — generator พิมพ์คำเตือนนี้ทุกครั้งที่รัน; ถ้าต้องการให้ตรง ให้เปลี่ยน key ที่ shell.

## 1. ไฟล์ที่เพิ่ม

```
src/app/features/sales-docs/
  sales-doc-types.ts                      SALES_DOC_TYPES · salesDocType() · SalesDocRow (ร่วมกันสองหน้า)
  list/    sales-doc-list.ts              route component  ts-sales-doc-list   (type input · live → <ts-live-missing/> · เปลี่ยนภาษา = view ใหม่)
           sales-doc-list-view.ts         host (ViewEncapsulation.None, preserveWhitespaces, OnPush; เริ่ม/หยุด engine · drag-scroll · ลิงก์ → router)
           sales-doc-list-backend.ts      สัญญา  list(type): Promise<SalesDocRow[]>
           sales-doc-list.mock.ts         mock (framework-free)  — Java ไม่มี API: ตารางว่างทุกประเภท
           sales-doc-list.{html,scss,engine.ts}   GENERATED จาก Java
  form/    sales-doc-form.ts              route component  ts-sales-doc-form   (type/id inputs · lazy ต่อประเภท · type แปลก → /not-found · เปลี่ยนภาษา = view ใหม่)
           sales-doc-form-base.ts         host ร่วม (ini จาก session, can(), env ของ engine, เริ่ม/หยุด, สคริปต์ attach_file_types.js)
           sales-doc-{qt,bk,ob,aq,ad}-view.ts      host ของแต่ละฟอร์ม
           sales-doc-{qt,bk,ob,aq,ad}.{html,scss,engine.ts}   GENERATED
           sales-doc-libs.engine.ts       GENERATED — สคริปต์ sales_doc_*.js 17 ไฟล์ (คำนวณรายการ/VAT/ส่วนลด/ชำระเงิน/ตรวจฟอร์ม/พิมพ์/บันทึก …)
           auto-dealer-master.ts          GENERATED — resources/mock/auto_dealer_master.json (master data ของ aq/ad)
           sales-doc-backend.ts           สัญญา  fetch(input, init): Promise<Response>  (รูปเดียวกับ servlet ของ Java)
           sales-doc.mock.ts              mock (framework-free) + fault ผ่าน ?mock=
  *.spec.ts                               list: sales-doc-list.spec.ts · sales-doc-list.mock.spec.ts   form: sales-doc-form.spec.ts · sales-doc-calc.spec.ts · sales-doc.mock.spec.ts
tools/sync-sales-doc-list.mjs · tools/sync-sales-doc-form.mjs                  generator (header GENERATED; idempotent; หยุดเมื่อต้นฉบับเปลี่ยน)
tools/compare/pages/sales-doc-list/{page,scenarios}.mjs                         harness
tools/compare/pages/sales-doc-form/{page,pre,scenarios*}.mjs                    harness
public/assets/images/icon/fi_search.svg · public/assets/java-js/attach_file_types.js   copy ตรงตัวจาก Java (ไบต์เดียวกัน — มีอยู่แล้วใน main)
manual-sales-docs.html · INTEGRATION.md
```

## 2. สัญญา backend (สิ่งที่ live adapter ต้องทำ — เฟสถัดไป)

Java **ไม่มี API บันทึก/ค้นรายการเอกสาร**: ฟอร์มตรวจเอกสาร สร้าง payload (`SalesDocPayload.build` — เขียน `console.debug`) แล้วเปิด pop-up "บันทึกเรียบร้อย" ด้วยเลขที่ชั่วคราว `XX:M00-YYMM-00000` กับข้อความ "ยังไม่ได้บันทึกเข้าระบบ" (`label.sdn.not_persisted`); หน้ารายการเรียก `list.render([])` เสมอ ("ยังไม่มี API รายการเอกสาร"). พอร์ตทำเหมือนกัน (ไม่ได้สร้างอะไรเกินต้นฉบับ).

### 2.1 `SalesDocBackend.fetch(input, init)` — `form/sales-doc-backend.ts`
คำเรียกที่สคริปต์ของ Java ยิงจริง (path ใต้ context path; รูปคำตอบ = ของ servlet):

| คำเรียก | ใช้โดย | Java ที่ต้องย้าย (ตรรกะที่อยู่ที่นั่น) |
| --- | --- | --- |
| `GET /board/prospect-list?page&perPage=10&enrich=1&searchText` | pop-up เลือกลูกค้า (infinite scroll 10 แถว/หน้า — `SalesDocPager`) และตรวจ "เลขผู้เสียภาษีซ้ำ" (`searchText=<taxId>`) | `ProspectListServlet` → `ProspectListService.fetchPage`: อ่าน `page` `perPage` (เพดาน 200, ค่าเริ่มต้น 20) `searchText` `sortBy` `currentCityId` … → `GET {base}/triplesale-service/api/v1/prospects?…` (ค้น/กรอง/เรียงที่ backend ทั้งหมด) · `enrich=1` = เติมรายแถวด้วย `GET /prospects/{id}/quick-view` (`enrichParallel`, threads=`contracts.list.enrich.threads` ค่าเริ่มต้น 1, timeout 15 วิ, แคช `DETAIL_CACHE` ต่อ id+lang) · `toRowJson` สร้างคีย์ `id code name date source phone phonecc countrycode addr province district country agentcode agent team recorder avatar gender type email` (ไม่มี `taxId`) · ชื่อประเทศแปลตาม `I18n.fromSession` · `avatarSrc` ผ่าน `/docproxy?url=` · ตอบ `{status:200,message:'success',result:{items,meta:{page,perPage,total,totalPages}}}`, ผิดพลาด 500 `{status:500,message:'โหลดรายชื่อลูกค้าไม่สำเร็จ'}` · ต้องใช้ token ของผู้ใช้ (`TriplesaleApi.authTokenFresh`) |
| `GET /rvapi?action=materials` | รายการสินค้าในแถวของ qt/bk/ob | `RvApiServlet` (`action=materials`) → `RvApiService.materialsJson`: ไล่หน้า `GET master-data/materials?page&pageSize` จนครบ (เพดานจำนวนหน้ากันวนไม่รู้จบ) → `[{code,name,salePrice}]` โดย `salePrice = standardSalePrice` (0 = ไม่มีราคา) → ตอบ `{result:[…]}` · `MasterCache` 30 นาที (แคชเฉพาะผลสำเร็จที่ไม่ว่าง — ผลว่าง/error ไม่แคช) |
| `GET /board/prospect/attachments?prospectId` · `POST` `{prospectId,fileContentBase64,fileName,description}` · `DELETE ?prospectId&docNo` | ตารางไฟล์แนบของ qt/bk/ob (`SalesDocAttach` โหมด strict: นามสกุลที่ยอม pdf jpg jpeg png doc docx xls xlsx, ≤10 MB, ≤10 ไฟล์) — แนบเข้า "ลูกค้าที่เลือกในเอกสาร" | `ProspectAttachmentsServlet`: GET → `GET /prospects/{id}/attachments` (`collapseAttachUrls`); POST → ตรวจ `FileServerAccess.isAllowedUploadName` (400 + `allowedUploadExtText`), `POST /prospects/{id}/attachments`, แล้ว **verify-back** `FileServerAccess.probe(fileUrl)` → `{status:200, verified, verifyReason, message}` (`verified:false` = backend ตอบว่าเก็บแล้วแต่ไฟล์ไม่เจอบน file server); DELETE → `DELETE /prospects/{id}/attachments/{docNo}` (`TriplesaleApi.prospectAttachmentByNo`) · 400 เมื่อไม่มี `prospectId`/`docNo` |
| `GET /board/chat-master-data?type=occupations` | ช่อง "อาชีพ" ของฟอร์มลูกค้าใหม่ใน aq/ad (และ ob) | `ChatMasterDataServlet` (`type=occupations` → `GET master-data/occupations?page=1&pageSize=1000`, แปลชื่อไทยด้วย `MasterDataI18n`) → `{result:{items:[{code,name,nameTh}]}}` |
| `GET /resources/mock/auto_dealer_master.json` | master data ของ aq/ad (รถ/อุปกรณ์/ไฟแนนซ์/ประกัน/ระยะเวลา/รายการรายได้-ค่าใช้จ่าย/ผู้รับเงิน/บัญชี/EDC) | ไฟล์ static ใน war (Java เองดึงด้วย `fetch` — "ยังไม่มี API master data") ; `auto-dealer-master.ts` คือสำเนาที่ generator สร้างจากไฟล์นั้น. ของจริงต้องมี API master data (ยังไม่มีใน Java) |

ลูกค้าใหม่ที่สร้างใน pop-up **ไม่ถูกส่งไป API ใด ๆ** (เป็นส่วนของเอกสารเท่านั้น — ไม่มี `id` จึงแนบไฟล์ไม่ได้: ข้อความ "เลือกลูกค้า" ตามต้นฉบับ).

ข้อมูลอื่นที่หน้าอ่านจาก server ตอน render (ผ่าน EL `commonBean` / session): `activeBranchName`, `activeBranchId`/code, ชื่อผู้ใช้, `profileName`, `employeeId`, `roles` (`Set.toString()` = `[a, b]`), `uploadAcceptExt` (`FileServerAccess.uploadAcceptAttr`), `lang`, `hasFeature('FEATURE_CRM_Document')` — host ทำ `ini` จาก `AuthService.session()` / `I18n` / `PermissionService` (`SalesDocFormBase`).

### 2.2 `SalesDocListBackend.list(type)` — `list/sales-doc-list-backend.ts`
`Promise<SalesDocRow[]>` (`{ no, date 'yyyy-MM-dd', customer, ref?, employee, total, status, isNew? }` — รูปที่ `SalesDocListMockup.render` ระบุ). Java **ไม่เรียก servlet ใด**; mock คืน `[]` เหมือน Java. วันที่มี API เอกสารจริง ให้ adapter คืนแถว — engine (`list.render(env.rows)`) ไม่ต้องแก้.

### 2.3 Java ที่ **ไม่เกี่ยว** (กันสับสน)
`SalesDocumentListServlet` (`/board/sales-document-list`, ใช้โดย `sales_doc_list.js` ของหน้าเอกสารประกอบ `sales_document*.xhtml`) ไม่ใช่ของสองหน้านี้.

## 3. ความต่างที่ตั้งใจจาก Java

- **`:id` เป็น `new` เสมอ** (ไม่มี API เปิดเอกสารที่บันทึกแล้ว; ฟอร์ม Java ไม่รับ id เหมือนกัน) — ที่อยู่ `/sales/docs/qt/12345` แสดงฟอร์มเปล่าของ qt. `:type` ที่ไม่ใช่ qt/bk/ob/aq/ad → หน้า not-found ของแอป (Java: 404). หน้ารายการ: ประเภทอื่น = รายการ legacy (เหมือน `?doc=` ที่ไม่รู้จัก).
- **เปลี่ยนภาษา = view ใหม่** (Java reload หน้า — สคริปต์อ่านข้อความครั้งเดียวตอน render).
- ลิงก์ในหน้า (ปุ่มสร้างเอกสาร, "กลับไปรายการ", pop-up "บันทึกแล้ว") ไปผ่าน Angular router; ลิงก์ Java ของหน้าอื่นเข้ามาผ่าน `javaLinkToRoute`.
- **ธีม/ขนาดอักษร**: `body[data-theme="dark"]` → `html[data-theme='dark']`, `--fs-adj` → `--ts-fs-adj` (shell ใช้ชื่อนี้) — generator แปลงให้ ความจำเพาะเท่าเดิม.
- **CSS ของ Java ที่มีวงเล็บปีกกาเกินใน `sales_doc_form.css`** (บรรทัด ~368 `}` ลอย): เบราว์เซอร์ทิ้งกฎถัดไป (บล็อก `@media screen` ที่สลับ token โหมดมืด) — Sass ไม่ยอมรับวงเล็บเกิน; generator ลบวงเล็บและบล็อกที่ถูกกลืนไปด้วย = ผลที่ได้ตรงกับที่เบราว์เซอร์ทำกับ Java (**ข้อเสนอแนะ**: แก้ที่ Java แล้วโหมดมืดของฟอร์มจะได้ token ชุดนั้นจริง).
- **กล่องที่สคริปต์ย้ายไปไว้ที่ `<body>`** (`.qm-overlay` `.qm-bar` `.qm-toast`): ใน Java สืบทอดตัวอักษร 13px/สี และกฎ `[type="text"]{padding:10px!important}` จาก `<body>` + `project_root.css`; ใน shell ใหม่กฎหลังนี้จำกัดอยู่ใน `ts-shell` — จึงมีบล็อก `:where(.qm-overlay,.qm-bar,.qm-toast)` (ความจำเพาะ 0 เท่าของเดิม) ในส่วน "Angular adaptation" ของ scss.
- **ล็อกการเลื่อนหน้าเมื่อเปิด pop-up** (`html:has(.qm-overlay.qm-open){overflow:hidden}` ของ Java): `<body>` ของ Java สูงเท่าเนื้อหา แต่ `<body>` ของแอปนี้สูงเท่าหน้าต่าง (`styles/_base.scss`) — ถ้าไม่ปรับ หน้าจะเด้งกลับบนสุดเมื่อเปิด pop-up; จึงมีกฎ `html:has(<host>):has(.qm-overlay.qm-open) body{height:auto}` (เฉพาะตอนมีฟอร์มและมี pop-up เปิด).
- **หน้า "ตัวอย่างก่อนพิมพ์" (iframe)**: สคริปต์ของ Java ประกอบ `srcdoc` โดย **คัดลอก stylesheet ทุกตัวของหน้าโฮสต์** (`headHtml` ใน `sales_doc_preview.js`) — ในหน้า Java นั่นคือ CSS stack ทั้งชุด (กฎ `p`/`h1…h6`/`label`/ฟอนต์ของ tag/`body{13px,#191a1c,min-height:100%}`), ในแอปใหม่คือ `styles.css` ของแอป. generator จึงเติม `<style>` ท้าย `headHtml` ที่ **อ่านกฎ global เหล่านั้นจากไฟล์ Java** (`adaptation()` + `html`/`body` ของ `layout-modify.css`) — มิฉะนั้น `<p>` ในเอกสารกระดาษได้ line-height 1.45 แทน 1.5 และกระดาษเตี้ยกว่า ~4px (เจอจาก harness ที่ ad/ob). (ฟอนต์ Noto Sans Thai / @font-face มาจาก `index.html` ที่ถูกคัดลอกเป็น `<style>` อยู่แล้ว)
- **กล่องที่ย้ายไป `<body>` ได้ `data-java-page`**: shell มีกฎ `button:disabled { cursor: not-allowed }` ที่ข้ามส่วนของหน้าที่พอร์ตจาก Java (host มี `data-java-page`); pop-up ที่สคริปต์ย้ายไป `<body>` อยู่นอก host จึงโดนกฎนั้น (Java ไม่มี — ปุ่มใช้ cursor ตาม CSS ของหน้า). `rt.bodyAppend` ใส่ attribute นี้ให้กล่องที่ย้าย (ไม่มีผลต่อหน้าตาอย่างอื่น; harness ตัดมันออกก่อนเทียบ DOM).
- **ลำดับ stylesheet ของ dropdown ระบบ**: Java ใส่ `<style id="odsCss">` (open_down_select.js) ที่ท้าย `<head>` หลัง CSS ของหน้า — กฎของมันชนะเมื่อความจำเพาะเท่ากัน (เช่น `.ods-btn.ods-disabled` ชน `.qm-overlay .ods-btn`). shell ใส่ตอนแอปเริ่ม (ก่อน style ของหน้าที่โหลดทีหลัง) — host ของฟอร์ม (`SalesDocFormBase.odsLast`) ย้ายกลับไปไว้ท้ายสุดตอนเริ่ม. (ข้อเสนอ: ให้ shell ทำเอง เพื่อทุกหน้าที่พอร์ตได้ลำดับเดียวกับ Java)
- **`prefers-reduced-motion`**: `styles/_base.scss` ตั้ง `transition-duration: 0.01ms !important` ให้ทุก element เมื่อผู้ใช้เปิด reduced motion — transition ที่สั้นขนาดนั้นก็ยังเริ่มทำงาน 1 frame; `SalesDocModal.center()` ของ Java ล้าง `transform` ของ dialog แล้ววัดตำแหน่งทันที จึงวัด "จุดเริ่มของ transition" และ dialog (ใบส่งสินค้า: pop-up เลือกผู้ร่วมงาน/วิธีชำระเงิน) เยื้องศูนย์. Java ไม่มีกฎนี้ ฟอร์มจึงตั้ง `transition-duration: 0s` ให้กล่องของหน้าในโหมด reduced motion (ผู้ใช้ปกติไม่กระทบ). **ผู้ประสานงานควรรู้**: หน้าอื่นที่พอร์ตมีโค้ดแบบ "ล้างแล้ววัด" จะเจอเหมือนกันเมื่อเปิด reduced motion.
- **panel ปฏิทินของช่องวันที่ (`.ods-cal`)**: `open_down_select.js` ของ Java ไม่เคยลบ panel ของช่องวันที่ที่หน้าวาดใหม่ (ฟิลด์รับเงินมัดจำของใบจองรถ, แถวตารางงวดชำระ …) — รั่วหนึ่งตัวต่อการวาดใหม่ (ซ่อนอยู่ `display:none`); `core/dom/open-down-select.ts` ลบให้ (`_odsInput`). ไม่มีผลที่มองเห็น; harness เทียบ `.ods-cal` เฉพาะตอนเปิด (`.ods-cal.open`) แทนที่จะนับทุกตัว.
- ตาราง/ปุ่มที่ต้องการ `javaLinkToRoute` ของหน้าอื่นไม่มีในสองหน้านี้ (ลิงก์ของสองหน้านี้เป็น route อยู่แล้ว ณ เวลา generate: `routeOf`).
- `window.SalesDocX` ที่สคริปต์ Java ประกาศ (`SalesDocValidate`, `SalesDocCustomer` …) **ยังเป็น global เหมือนเดิม** (สคริปต์เรียกกันด้วยชื่อ) และถูกลบตอนปิดหน้า.

## 4. ผลตรวจเทียบกับ Java (harness — `node tools/compare/run.mjs <page>`)

harness = Chrome headless (puppeteer-core). ฝั่ง Java = **replica**: shell จริงของ Java (CSS/JS ของโปรเจกต์ Java อ่านจากไฟล์) + markup ของหน้าที่ประเมิน Facelets/EL เหมือน server (`tools/lib/facelets.mjs`, โหมด `java`) + สคริปต์ `sales_doc_*.js` ตัวจริงของ Java; ฝั่ง Angular = `ng build --configuration development`. ทั้งสองฝั่งคุยกับ **mock ตัวเดียวกัน** (`sales-doc.mock.ts` โหลดเข้า Node) ผ่าน fetch ที่ harness ดักไว้. dump = DOM + attribute + ข้อความ + geometry + computed style ของทุก element (`.qt-page`, ทุก pop-up ที่ย้ายไป `<body>`, แถบแจ้งเตือน, toast, SweetAlert, รายการ dropdown ที่เปิดอยู่ และ **iframe ตัวอย่างก่อนพิมพ์** — `<body>` ของมัน) + ที่อยู่ที่หน้าพยายามไป (`NAV`) + payload ที่ `SalesDocPayload` เขียน (`console.debug`) + จำนวนครั้งที่เรียก `print()`.

| หน้า | scenario | identical |
| --- | ---: | ---: |
| `sales-doc-list` (`node tools/compare/run.mjs sales-doc-list`) | 125 | **125** |
| `sales-doc-form` (`node tools/compare/run.mjs sales-doc-form`) | 1,429 | **1,429** |

`sales-doc-list` (125): ห้าประเภท + รายการ legacy (`?doc` แปลก) + ชื่อไฟล์ตัวพิมพ์ใหญ่ × สว่าง/มืด × ไทย/อังกฤษ × ปุ่ม A A A (−/0/+) × ความกว้าง 360–1920 · ปุ่มสร้างเอกสาร (ที่อยู่ที่ไป) · ปุ่มเพิ่มของรายการ legacy (alert) · ค้นหา (เปิด/พิมพ์/Enter/Esc/ล้าง) เมนูผลิตภัณฑ์และตัวกรองของรายการ legacy.

`sales-doc-form` (1,429) แยกตามพื้นที่:

| พื้นที่ | scenario |
| --- | ---: |
| หน้าแรกของทั้งห้าฟอร์ม × สว่าง/มืด × ไทย/อังกฤษ × A A A × ความกว้าง 360–1920 (รวมจุดหักของ CSS) | 118 |
| ตารางรายการ (สินค้า, จำนวน, ราคา, VAT รวม/แยก/ไม่มี, ส่วนลดบาท/%, ส่วนลดท้ายบิล, เศษปัด, ข้อความแจ้งเตือนทุกแบบ; fault ของ materials) | 130 |
| ลูกค้า (ค้นหา, เลื่อนโหลดเพิ่ม, เลือก, แก้ไข, สร้างใหม่ + ตรวจเลขผู้เสียภาษี/โทร/รหัสไปรษณีย์/อีเมล/ชื่อ/ประเทศ ทุกกรณี, เลขผู้เสียภาษีซ้ำ, แท็บใบกำกับภาษี, ผู้ซื้อของใบจอง, อาชีพของ aq/ad, fault ของ API) | 264 |
| วิธีชำระเงินของ qt/bk (เงินสด, เครดิตเทอม, แบ่งงวด, มัดจำ, ชำระล่วงหน้า — เปิด/กรอก/ตรวจ/บันทึก/แก้/ยกเลิก/เปลี่ยน VAT หรือจำนวนหลังบันทึก) | 232 |
| ไฟล์แนบของ qt/bk/ob (ผิดประเภท, ใหญ่เกิน, เกิน 10 ไฟล์, สำเร็จ, หลายไฟล์, ลบ/ยืนยัน/ไม่ยืนยัน, ทุก fault ของ API) | 108 |
| ตรวจทั้งเอกสาร (แถบแดง + ข้อความใต้ช่อง) · pop-up "บันทึกเรียบร้อย" · หน้าตัวอย่างก่อนพิมพ์ (iframe) ทุกประเภท × สว่าง/มืด/อังกฤษ/390/1920/ปรับขนาด/ใบหลายรายการ/ยกเว้น VAT/เครดิต/งวด · ปุ่มพิมพ์ · ปุ่มย้อนกลับ | 159 |
| เฉพาะใบส่งสินค้า (ไฟแนนซ์, การ์ดสรุป, ผู้ร่วมงาน, เก้าวิธีชำระเงิน, ตารางรับเงิน, ประกัน/พรบ., อ้างอิงใบจอง/ใบเสนอราคา) | 88 |
| ใบเสนอราคา/ใบจองรถยนต์ aq/ad (ตารางรถ type→series→color→คัน, ของแถม/อุปกรณ์, pop-up ส่วนลด, เช่าซื้อ, เงินมัดจำ + pop-up รับชำระ, รายได้/ค่าใช้จ่ายอื่น, ค้นเอกสาร, ลงชื่อ, ประกัน, ค่าธรรมเนียม, fault ของ master data) | 209 |
| ข้อมูลเอกสาร (วันที่, สาขา, พนักงาน, คลัง) · หมายเหตุ · เลขอ้างอิง · อ้างอิงใบเสนอราคาของใบจอง · ปุ่มกลับ | 95 |
| ใบส่งสินค้า: ค้นเอกสาร, ข้อกำหนด, วันที่รับ, ประเภทขาย | 26 |

ข้อความตรวจฟอร์ม `label.vl.*` 51 ข้อความ: **44 ข้อความขึ้นจริงในอย่างน้อยหนึ่ง scenario** ของ Java. อีก 7 ที่ไม่ขึ้น: `date_bad` (เบราว์เซอร์รายงาน `badInput` เมื่อพิมพ์วันที่ค้างครึ่งๆ — สคริปต์พิมพ์ไม่ได้; **เทสต์ unit** ครอบ), `num_int` / `num_dec5` (รูปแบบที่ไม่มีช่องใดใช้ในฟอร์มทั้งห้า), `more` (ไม่มีโค้ดเรียก), `sys_error` (ต้องให้ตอนบันทึก throw), `pay_fill` (ต้องให้ `CType` ค้างโดยไม่มีรายละเอียด — flow ปกติรีเซ็ตกลับ), `taxid_dup` (ขึ้นเฉพาะเมื่อแถวของ API มี `taxId` — Java จริงวันนี้ไม่ส่ง, ดู §6 — จึงเทียบด้วย fault `prospects-taxid` ของ mock: `qt-cust-taxid-*`; ข้อความขึ้นใน scenario เหล่านั้นแต่ตัวนับข้างบนนับจากชุดที่รันก่อนเพิ่ม fault).

วิธีทำงานที่ควรรู้:
- ผลทั้ง 1,429 มาจากหลายรอบ (เครื่องใช้ร่วมกับ worker อื่น ช่วงโหลดสูงมี scenario ล้มชั่วคราว: timeout / navigation timeout / หน้าไม่ขึ้น — เมื่อรันซ้ำทีละตัวผ่านทั้งหมด **ไม่เหลือ scenario ที่ต่างถาวร**). แอปเปลี่ยนระหว่างรอบเฉพาะ `sales-doc.mock.ts` (เพิ่ม fault `prospects-taxid`; `DELETE` ที่ไม่มี `docNo` = 400 ตาม servlet) และไฟล์ spec — ผลของรอบสุดท้ายยืนยันด้วยการสุ่ม 234 scenario บน build สุดท้าย.
- scenario ที่เปิดหน้าตัวอย่างก่อนพิมพ์รอ `document.fonts` ของ iframe แล้วให้หน้า fit ความสูงใหม่ก่อนอ่าน: ต้นฉบับ Java เองให้ความสูงต่างกัน ~1 บรรทัดระหว่างสองรอบ (ฟอนต์ยังโหลดไม่เสร็จตอน fit ครั้งแรก แล้ว `body{min-height:100%}` ไม่ยอมให้ iframe หด) — เป็นพฤติกรรมของต้นฉบับ ไม่ใช่ของพอร์ต.
- `head` ของ iframe ไม่ถูกเทียบ (รายการ stylesheet ของโฮสต์ต่างกันโดยธรรมชาติ: stack ของ Java vs `styles.css` ของแอป) — เทียบเฉพาะ `<body>` ซึ่งคือกระดาษ.
- `window.print()` ถูกแทนด้วยตัวนับ (ไม่เปิด dialog); `window.open` ไม่ถูกใช้ในโฟลว์นี้ของ Java.
- เบราว์เซอร์ของ harness รายงาน `prefers-reduced-motion: reduce` (ดูความต่างข้อ "reduced motion" §3).
- error / failed request ที่เหลือใน log ทั้งหมดเป็น fault ที่ตั้งใจ (500/400/404 ของ `attach-*`, `prospects-*`, `jobs-error`, `master-error/down` และ `console.error` ที่หน้า Java เขียนเองเมื่อเจอ fault เหล่านั้น); ไม่มี `pageerror`.

## 5. เทสต์และบิลด์

**เทสต์** (`CI=1 node node_modules/@angular/cli/bin/ng.js test --no-watch --include 'src/app/features/sales-docs/**/*.spec.ts'`) — 5 ไฟล์ **146 เทสต์ผ่านทั้งหมด** (~11 วินาที):

| ไฟล์ | เทสต์ | ครอบ |
| --- | ---: | --- |
| `list/sales-doc-list.mock.spec.ts` | 4 | สัญญา mock ของรายการ (ว่างทุกประเภท), `salesDocType` |
| `list/sales-doc-list.spec.ts` | 22 | host: เรนเดอร์ 5 ประเภท + legacy, ปุ่มสร้าง (gate ด้วย `FEATURE_CRM_Document`, ไปผ่าน router, modifier key), `javaLinkToRoute`, search pill/เมนู legacy, drag-scroll, live → `ts-live-missing`, เปลี่ยนภาษา/ประเภท = view ใหม่, ปิดหน้าแล้วไม่มี listener/timer ค้าง, แถวจาก backend ถูกวาดตาม Java (escape, รูปเงิน, วันที่) |
| `form/sales-doc.mock.spec.ts` | 19 | สัญญา mock ของฟอร์ม: `prospect-list` (แบ่งหน้า, ค้นหา, คีย์ของ `ProspectListService.toRow` ไม่มี taxId, fault), `materials` (ราคาที่ใช้ทดสอบเศษปัด), `attachments` (POST/GET/DELETE, 400 ทุกแบบ, 405, ทุก fault), `occupations`, master ของ aq/ad, 404 |
| `form/sales-doc-form.spec.ts` | 61 | host ทั้งห้าฟอร์ม (× 5): เรนเดอร์ + เริ่ม engine + โหลดสินค้า/รถ, เพิ่มแถว, ข้อความตรวจใต้ช่อง, บันทึกเอกสารว่างไม่ผ่าน (แถบแดง), ปุ่มบันทึกตามสิทธิ์, ลิงก์กลับผ่าน router, `javaLinkToRoute`, **ปิดหน้าแล้ว `window.SalesDoc*` หาย / pop-up บน `<body>` หาย / listener ครบคู่ / IntersectionObserver ถูก disconnect / ไม่มี timer ค้าง**, คำตอบที่มาหลังปิดหน้าไม่วาดอะไร · บันทึกใบเสนอราคาที่ถูกต้อง → pop-up + เลขชั่วคราว + ข้อความ "ยังไม่ได้บันทึก" + payload · route component: lazy ต่อประเภท, `:id` อะไรก็ฟอร์มเปล่า, `:type` แปลก → not-found, live → `ts-live-missing`, เปลี่ยนภาษา = view ใหม่, `odsCss` ท้าย `<head>` |
| `form/sales-doc-calc.spec.ts` | 40 | **ตรรกะธุรกิจ**: รายการ (รวม VAT 2,185.00 → 2,042.06 + 142.94; แยก VAT 1,092.50×7% = 76.475 → **76.48**; 7 ชิ้น 535.325 → 535.33; ยกเว้น; ส่วนลด %/บาท; ส่วนลดเกินบรรทัดถูกตัด; ส่วนลดท้ายบิลเฉลี่ยก่อน VAT; หลายแถวคนละโหมด; จำนวนทศนิยม; ราคาแก้มือ; ของฟรี; ลบแถว; mask ช่องจำนวน), **ชำระเงิน** (เครดิตเทอม: วันครบกำหนด = วันที่เอกสาร + วัน; แบ่งงวด: net/VAT ต่องวด, ผลรวมเทียบยอดเอกสาร, ส่วนต่าง, ปฏิเสธผลรวมไม่ครบ, สรุป), ใบจอง/ใบส่งสินค้าใช้ตารางเดียวกัน, **ข้อความบาท** `bahtText` (0, เอ็ด/ยี่สิบ/สิบเอ็ด, ล้าน, สตางค์, ปัดสตางค์, ลบ, ค่าที่ไม่ใช่ตัวเลข), ตรวจฟิลด์ (`date_bad`, รูปแบบทศนิยม) |

**บิลด์** `node node_modules/@angular/cli/bin/ng.js build` (production): ผ่าน, **ไม่มี warning ใหม่** (เหลือ 2 warning เดิมของ `lead-detail.engine.ts` — duplicate key `blob`/`arrayBuffer`), ไม่เกิน budget ใด (`anyComponentStyle` ต่อฟอร์มต่ำกว่า warning 140 kB). chunk ที่ lazy: `sales-doc-qt-view` 144 kB · `bk` 149 kB · `aq` 153 kB · `ad` 167 kB · `ob` 190 kB (raw).

**generator**: รันสองตัวต่อกันซ้ำ — ไฟล์ generated/คัดลอก 79 ไฟล์ **ไม่เปลี่ยนสักไบต์** (idempotent). ทดสอบ "หยุดเมื่อต้นฉบับเปลี่ยน": แก้ต้นฉบับ Java ตอนอ่าน (ไม่แตะไฟล์จริง) 7 แบบ — เพิ่ม `setTimeout` ใน `sales_doc_items.js`; `window.location.href` → `assign` ใน `sales_doc_saved.js`; เปลี่ยนชื่อ stylesheet ใน head ของ `sales_doc_qt_form.xhtml`; เปลี่ยนชื่อ global ที่ `sales_doc_list_mockup.js` ประกาศ; เปลี่ยน `document.addEventListener` ในรายการ legacy; เปลี่ยน `list.render([])` — generator หยุดพร้อมข้อความระบุจุดที่เปลี่ยนทุกแบบ (กรณีเปลี่ยนชื่อ global ตอนแรกไม่หยุด จึงเพิ่มตรวจ) · `node tools/lib/facelets.selftest.mjs` ผ่านทั้งหมด.

## 6. สิ่งที่ยังไม่ได้ทำ / ยังไม่ได้ยืนยัน / คำถามถึงเจ้าของระบบ

**ยังไม่ได้ทำ (ตามขอบเขตเฟส A)**
- live adapter ของทั้งสองหน้า (§2 บอกว่าต้องพอร์ตอะไรจาก servlet ใด). โหมดไม่ใช่ mock แสดง `<ts-live-missing/>`.
- Java ไม่มี API บันทึก/ค้นรายการเอกสาร และไม่มี API master data ของ aq/ad (ไฟล์ตัวอย่าง `auto_dealer_master.json`) — ต้องมีฝั่ง backend ก่อนจึงเปิดเอกสารที่บันทึกแล้ว (`:id`) หรือแสดงรายการจริงได้.

**ยังไม่ได้ยืนยัน / ความเสี่ยง**
- ฝั่ง Java ใน harness คือ replica (CSS/JS จริง + markup ที่ **ผมประเมิน Facelets/EL เอง**) ไม่ใช่ Tomcat/JSF จริง; generator ใช้ตัวประเมินตัวเดียวกัน ถ้าประเมินผิดจุดเดียวกัน ทั้งสองฝั่งจะผิดเหมือนกันและ harness ไม่เห็น. ลดความเสี่ยงด้วย `facelets.selftest.mjs` (11 หน้า × 2 โหมด + เทียบตัวอ่าน rv-list เดิม) แต่ยังไม่เคยเทียบกับ HTML ที่ server จริงตอบ.
- mock ยึดรูปคำตอบจาก **โค้ด** servlet (`ProspectListServlet/Service`, `RvApiServlet`, `ProspectAttachmentsServlet`, `ChatMasterDataServlet`) ไม่ได้เทียบกับ UAT (เฟสนี้ห้ามออกเครือข่าย) — โดยเฉพาะ: ชื่อคีย์ของแถว `prospect-list`, ข้อความ error ที่ backend ส่งกลับ, ขีดจำกัดของไฟล์แนบฝั่ง server.
- การพิมพ์จริง (dialog ของเบราว์เซอร์, `@page` ขอบกระดาษ, ตัดหน้า) ไม่ได้ตรวจ — ตรวจเฉพาะเอกสารใน iframe และการเรียก `print()`.
- สิทธิ์ถูกปฏิเสธ (`hasFeature('FEATURE_CRM_Document')` เป็นเท็จ): ตรวจในเทสต์ unit (ไม่มีปุ่มสร้าง/บันทึก) ไม่ได้ตรวจใน harness เพราะ route guard ของแอปไม่ให้ถึงหน้านั้นเลยโดยไม่มีสิทธิ์.
- ฟอร์มเปิดครั้งแรกโหลด chunk ใหญ่ (~150–190 kB ต่อฟอร์ม) — ยังไม่ได้วัดเวลาโหลดจริง.

**คำถามถึงเจ้าของระบบ**
1. Java: ตรวจเลขผู้เสียภาษีซ้ำ (Spec ข้อ 69, เฉพาะใบเสนอราคา) ต้องการ `taxId` ในแถวของ `/board/prospect-list` แต่ `ProspectListService.toRowJson` ไม่ส่ง — ตรวจนี้จึงไม่เคยจับอะไรได้บนระบบจริง (พอร์ตทำตามต้นฉบับ; mock มี fault `prospects-taxid` ไว้ทดสอบเส้นทางนี้). ต้องการให้ backend ส่ง `taxId` ไหม?
2. Java: `sales_doc_form.css` มี `}` เกิน 1 ตัว (~บรรทัด 368) ทำให้บล็อกโหมดมืด (สลับ token) ไม่ทำงานในเบราว์เซอร์ — แก้ที่ต้นฉบับไหม (พอร์ตตัดเหมือนที่เบราว์เซอร์ทำเพื่อให้ผลตรงกัน; ถ้าแก้ที่ Java ต้อง regenerate).
3. Java: `open_down_select.js` รั่ว panel ปฏิทินของช่องวันที่ที่หน้าวาดใหม่ (shell ใหม่แก้แล้ว) — ไม่ต้องทำอะไร แค่ให้ทราบว่าสองฝั่งต่างกันตรงนี้.
4. shell: `<style id="odsCss">` ควรอยู่ท้าย `<head>` เสมอ (ดู §3) และ `prefers-reduced-motion` ไม่ควรสร้าง transition 0.01ms ให้ element ของหน้า Java (ดู §3) — หน้าที่พอร์ตอื่นที่มีโค้ด "ล้าง transform แล้ววัด" จะเจอเหมือนกัน. ผมแก้เฉพาะในสองหน้านี้ (ไม่แตะ `styles/_base.scss` ซึ่งเป็นไฟล์ shared).
5. shell: แท็บ "ใบรับเงิน" ใช้ `label.rv.title` ต่างจาก strip ของ Java (`label.rv.title_list`) — ตั้งใจหรือไม่?
6. การเปิดเอกสารที่บันทึกแล้ว (`:id` ≠ `new`) ยังเป็นไปไม่ได้ในต้นฉบับ — ต้องการให้พอร์ตรองรับ route นี้เมื่อมี API หรือไม่ (ตอนนี้ `:id` ใด ๆ = ฟอร์มเปล่า).

## 7. คำสั่งทำซ้ำ

```
node tools/sync-sales-doc-list.mjs && node tools/sync-sales-doc-form.mjs     # สร้างไฟล์ generated (ต้องไม่เปลี่ยนอะไรถ้าต้นฉบับเดิม)
node tools/lib/facelets.selftest.mjs                                           # เทสต์ตัวประเมิน Facelets
node tools/compare/run.mjs sales-doc-list --jobs 3                             # 125 scenario (build development เอง; --no-build ใช้ .compare/ng-build เดิม)
node tools/compare/run.mjs sales-doc-form --jobs 3                             # 1,429 scenario (~1 ชั่วโมง)
CI=1 node node_modules/@angular/cli/bin/ng.js test --no-watch --include 'src/app/features/sales-docs/**/*.spec.ts'
node node_modules/@angular/cli/bin/ng.js build
```
`--filter "<regex>"` ของ `run.mjs` ใช้รันบาง scenario; fault ของ mock ดูได้ในหน้าจริงด้วย `?mock=<fault>` (เช่น `/sales/docs/qt/new?mock=attach-unverified`; รายชื่ออยู่หัวไฟล์ `form/sales-doc.mock.ts`).
