# INTEGRATION — ข้อมูลประกอบ (เอกสารงานขาย 7 ชนิด): `supporting-doc-list` (`/crm/supporting-docs/:type`) + `supporting-doc-form` (`/crm/supporting-docs/:type/:id`)

เมนู CRM → "ข้อมูลประกอบ" → หนึ่งในเอกสาร 7 ชนิด (หนังสือแสดงเจตจำนง · คำขอสินเชื่อ (นิติ) · สัญญาบริการ · สัญญากู้ · อนุมัติเบื้องต้น · สัญญาโครงการ · ใบคำขอสินเชื่อ)
Java ต้นฉบับ: `pages/sales_document.xhtml` + `sales_document_2…7.xhtml` (รายการ — 7 สำเนาของหน้าเดียว), `pages/sales_document_sub_1…6.xhtml` (ฟอร์ม — 6 สำเนา) + `sales_document_sub_7.xhtml` (ใบคำขอสินเชื่อ — ยาวกว่า 635 p: tags), `pages/inc/{sd_customer_field,sd_field_ro,save_confirm_dialog}.xhtml`, `Sales_DocumentView` (@ViewScoped), `DocAttachServlet`, `SalesDocumentListServlet`

## 0. สรุปสถานะ

| ส่วน | generator | compare (scenario ทั้งหมด / identical) | spec |
| --- | --- | --- | --- |
| รายการ `supporting-doc-list` | `tools/sync-supporting-doc-list.mjs` | **154 / 154** | `list/supporting-doc-list.spec.ts` (route) · `list/supporting-doc-list-view.spec.ts` |
| ฟอร์ม `supporting-doc-form` (sub_1–6 + sub_7) | `tools/sync-supporting-doc-form.mjs` | **232 / 232** | `form/supporting-doc-form.spec.ts` (route) · `form/supporting-doc-form-view.spec.ts` · `form/supporting-doc-form-7-view.spec.ts` |
| widget ของ PrimeFaces (CSS + JS ตัวจริง) | `tools/sync-supporting-doc-pf.mjs` · `tools/sync-supporting-doc-ods-pf.mjs` | (รวมในสองบรรทัดบน) | `pf-growl.spec.ts` · `pf-runtime.spec.ts` · `pf-upload-transport.spec.ts` · `ods-pf.spec.ts` |
| ตรรกะ / บริการ / REST | เขียนเอง (framework-free ใช้ซ้ำใน harness) | — | `supporting-doc.logic.spec.ts` · `.service.spec.ts` · `.live.spec.ts` |

- เทสต์ทั้งโปรเจกต์ `npx ng test --watch=false`: **96 ไฟล์ / 1,779 เทสต์ ผ่าน** (โฟลเดอร์นี้: 137 เทสต์) · `ng build` (production): ผ่าน ไม่มี warning (chunk `supporting-doc-form-view` 161 kB, `supporting-doc-form-7-view` 443 kB; initial 560 kB)
- generator ทั้งสี่รันซ้ำได้ผลเหมือนเดิมทุกไบต์: `npm run supporting-doc-screens:sync` (= `supporting-doc-pf:sync` → `supporting-doc-ods-pf:sync` → `supporting-doc-list:sync` → `supporting-doc-form:sync`)
- เทียบด้วย `node tools/compare/run.mjs supporting-doc-list` / `supporting-doc-form` (**ไม่ใช้ `--live`** — ดู §3 ข้อจำกัด)
- โหมด `mock:false`: ทำแล้วผ่าน `supporting-doc.live.ts` (REST ของ `triplesale-service` ตาม §3) — **พิสูจน์ด้วย spec + fake REST เท่านั้น ไม่มี UAT** (ดู §5)

## 1. ไฟล์ shared ที่แก้

| ไฟล์ | การเปลี่ยน |
| --- | --- |
| `src/app/app.routes.ts` | `IMPLEMENTED`: `'supporting-doc-list'`, `'supporting-doc-form'` |
| `src/app/core/navigation/page-registry.json` | `"implemented": true` ของสองหน้า + `apis`/`notes` (แล้วรัน `npm run manual:sync`) |
| `src/app/core/navigation/java-links.ts` (+ spec) | กฎของ `sales_document_sub_N.face?…` → `/crm/supporting-docs/<type>/<quotation_id>?action_type=edit\|detail` (ไม่มี `quotation_id` = `new`) |
| `package.json` | scripts `supporting-doc-{pf,ods-pf,list,form}:sync` + `supporting-doc-screens:sync` |
| `CLAUDE.md` | bullet: หน้ารายการ/ฟอร์มข้อมูลประกอบเป็นไฟล์ที่ถูกสร้าง (ห้ามแก้ด้วยมือ) |
| `public/assets/vendor/primefaces/*` | สคริปต์ widget ของ PrimeFaces 14.0.7 — **คัดลอกจาก jar ไบต์ต่อไบต์** (jquery · jquery-plugins · core · components · calendar · locale-th · validation · fileupload) โหลดเมื่อเข้าหน้านี้เท่านั้น (`loadPrimeFaces()`) |
| `public/assets/java-js/sd_customer_lazy.js` | สคริปต์ค้นหาลูกค้าแบบ lazy ของ Java (คัดลอกตรง) |
| `public/assets/images/…` | รูปที่หน้ารายการใช้ (3 ไฟล์ ไบต์เดียวกับ Java) |

## 2. ไฟล์ใน `tools/**` ที่เพิ่ม/แก้

| ไฟล์ | อะไร / ทำไม |
| --- | --- |
| `tools/lib/jsf.mjs` (**ใหม่**) | ตัวประเมิน Facelets/JSF แบบย่อ: parser XML, EL, renderer 2 โหมด — `java` (HTML ที่ server จะเขียนเมื่อ bean มีค่าที่กำหนด) และ `ng` (template Angular: `rendered` → `@if`, `ui:repeat` → `@for`). **id ของ component ที่ไม่ได้ตั้ง (`j_idtN`) ผูกกับ element ของไฟล์หน้า ไม่ใช่ลำดับการ render** (JSF ก็ทำแบบนี้ — tree ของ component ไม่เปลี่ยนเมื่อวาดซ้ำ) |
| `tools/lib/pf-dom.mjs` (**ใหม่**) | markup ที่ Mojarra + PrimeFaces 14 เขียนให้ `h:form · p:selectOneMenu · p:calendar · p:inputText · p:selectBooleanCheckbox · p:commandButton/Link · p:fileUpload · p:remoteCommand · p:growl …` (เขียนจากโค้ด widget ของ PrimeFaces เอง ไม่ใช่คัดจาก server จริง — ดู §5) |
| `tools/lib/pf-css.mjs` (**ใหม่**) | เลือกกฎ CSS ของ widget ที่หน้าใช้จาก components.css + theme + project_root + template + dark_mode + layout-modify |
| `tools/lib/port-kit.mjs` | `portalAdaptation()` (กฎของ `<body>` Java ที่ widget ซึ่งวาดลง `<body>` — growl / select panel / datepicker — ได้รับ: ขนาด/สีตัวอักษร, ฟอนต์, `p {line-height:1.5}`; **specificity 0** เพื่อให้กฎของ widget เองชนะเหมือน Java) · `globalClassRules()` |
| `tools/sync-supporting-doc-{pf,ods-pf,list,form}.mjs` | generator (อ่าน Java อย่างเดียว) |
| `tools/compare/lib/supporting-doc-replica.mjs` + `supporting-doc-server.mjs` (**ใหม่**) | ฝั่ง Java ของ harness: หน้าไฟล์ Java ตัวจริงที่ render เป็น HTML + **PrimeFaces JS ตัวจริง** + "server" ที่เล่น JSF lifecycle (restore view → apply request values → invoke → render) และตอบ **partial-response** ให้ `PrimeFaces.ab` / FileUpload จริง; POST ของฟอร์ม (`ajax="false"`) → 302 + flash; `/docattach` |
| `tools/compare/lib/dump-page.js` | `window.__cmpState === true` (เปิดเฉพาะหน้าที่ตั้งเอง): เทียบ **สถานะ** ของ control (`.value`/`.checked`/`.selected`) แทน attribute ที่ markup เขียนไว้ — server ที่ไม่ได้วาด control ซ้ำปล่อย attribute เดิมค้าง ส่วน framework ที่ bind attribute ไม่ค้าง |
| `tools/compare/lib/shell-replica.mjs` | `headFirst` (วาง `components.css` ก่อน theme ตามลำดับของ Java) |

## 3. Backend contract

สัญญา: `supporting-doc-backend.ts` (`SupportingDocApi`) — ตรงกับที่ `Sales_DocumentView` / `SalesDocumentListService` เรียกผ่าน `Data_API`; ตรรกะที่ bean ทำเอง (หน้า/กรอง/สร้าง body ของการบันทึก/lookup) อยู่ที่ `supporting-doc.service.ts` + `supporting-doc.logic.ts` (เขียนครั้งเดียว ใช้ทั้ง mock และ live)

| Java | REST ที่ live adapter เรียก (`supporting-doc.live.ts`) |
| --- | --- |
| `SalesDocumentListServlet` `/board/sales-document-list?formType&page&perPage` | ตอบจาก `SupportingDocService.fetchPage` (`GET /api/v1/documents?formType&page&pageSize`; ดึงได้สูงสุด 50 หน้า × 100 แล้วเรียงใหม่สุดก่อน) |
| `saveDocument` | `POST /api/v1/documents` (ใหม่) / `PUT /api/v1/documents/{id}?formType=` (แก้; body เริ่มจากสำเนาของที่ backend ส่งมา ตัด `id/txNo/status/createBy/…` แล้วเขียนค่าฟอร์มทับ) |
| `persistPendingAttachments` | `POST /api/v1/documents/{id}/attachments?formType=` (base64) |
| `loadProspectPageAjax` / lookup ลูกค้า | `GET /api/v1/master-data/prospects/search?key&page&perPage` · `GET /api/v1/prospects/{id}` |
| ผู้รับเอกสาร | `GET /api/v1/master-data/employees` |
| `/board/provinces · districts · sub-districts` | `boardMasterRoutes` (`core/live/board-master.live.ts`) |
| `DocAttachServlet` `/docattach` | **ไม่มี REST** — เก็บไฟล์ใน session ของเบราว์เซอร์ (`AttachStore` เหมือน `HttpSession "salesDocAttachStore"`); ไฟล์ที่ backend มีเปิดด้วย URL ตรง (ไม่มี servlet proxy `docProxyUrl` — `proxyUrl` = `remoteUrl`) |
| `triplesale.api.documents.formtype.style` | `new` = `formType` แบบ PascalCase, อย่างอื่น = ตัวเล็ก (`apiFormType`) — ค่ามาจาก config |

**ข้อจำกัดที่ต้องบอกเสมอ:** ไม่มี test account ของ UAT → พิสูจน์ได้เพียง "ทำเหมือน servlet/bean Java บน fixture ที่เขียนจากโค้ด Java" ไม่ใช่ "ตรงกับข้อมูลจริง". **ตัวเทียบ Java เป็น replica**: markup ของ component เขียนจากโค้ด PrimeFaces + JS ตัวจริงรันบนมัน แต่ไม่มี server Java รันอยู่ให้คัดลอก HTML จริง (§5)

## 4. พฤติกรรมของ Java ที่คงไว้ (ทั้งที่อาจดูเป็นบั๊ก) — harness พบด้วย PrimeFaces ตัวจริง

1. **`jQuery(document).ajaxComplete(…)` ของหน้า ไม่ทำงานหลัง `PrimeFaces.ab`** (PrimeFaces 14 ส่ง ajax ด้วย `global:false`) → หลังลบไฟล์ ไอคอนประเภทไฟล์ของแถวที่เหลือกลับเป็น `fa-file-lines` ทั่วไป (ไม่ re-apply สี/ชนิด). การอัปโหลด (FileUpload) **ไม่** เป็นแบบนี้ (ยิง ajax ของ jQuery แบบ global) จึง re-apply. พอร์ตทำเหมือนกัน
2. **การตรวจก่อนบันทึกไม่ผ่าน (ไม่มีลูกค้า / ไม่มีวันรับเอกสาร) ก็ redirect ไปหน้ารายการพร้อมข้อความเตือน** (bean คืน outcome ของรายการเสมอ) — ไม่ได้อยู่ที่หน้าฟอร์ม. ข้อความขึ้นที่ growl ของ **หน้ารายการ** (`sdMessages`, 4 วินาที)
3. **ฟอร์ม sub_1–6 ไม่มี `p:growl`** (ถอดตาม user 24/08) — ข้อความของ ajax ที่ไม่ได้ update growl ไม่แสดง; sub_7 คง growl (`messages`, 3 วินาที). ข้อความที่ request ทิ้งไว้ โดยไม่มี growl ใน response = หายไปพร้อม request
4. **กล่องตัวกรอง (`sdFilterOverlay`) ใน `sales_document*.xhtml` ไม่มีปุ่มเปิด** — `crm_list.js` หา `#ctFilterBtn` ซึ่งมีแต่ใน `contracts.xhtml`. markup + ปุ่ม apply/clear/pager คงไว้ครบ (พิสูจน์ด้วย harness โดยเปิด overlay ด้วยมือ) แต่ผู้ใช้เปิดไม่ได้ทั้งใน Java และใน Angular
5. **ตัวแนะนำลูกค้า (`odsProspectSuggest`) ใต้ช่องค้นหาของรายการไม่ถูก attach**: `open_down_select.js` โหลดท้าย `<body>` หลัง inline script จึงไม่มีฟังก์ชันตอนหน้าเรียก → ใน Java ไม่เคยทำงาน. พอร์ตเก็บ path ไว้ (`env.suggestCustomers = false`) เหมือน `receipts`; `/board/prospect-list` ไม่มีใน SPA
6. **การแก้รายละเอียดไฟล์ (`docAttEditDesc`) ไม่มีที่เรียกใน template** (มีแต่ฟังก์ชัน + `DocAttachServlet?action=describe`) — คงฟังก์ชัน/endpoint ไว้ แต่ผู้ใช้เข้าไม่ถึง
7. ไฟล์ที่แนบในโหมดเพิ่ม (ยังไม่มีเลขเอกสาร) เปิด/ดาวน์โหลดไม่ได้ → swal "บันทึกก่อน"; ไฟล์ที่เพิ่งอัปโหลดเปิดด้วย object URL (Java: servlet ส่งไฟล์ inline — ผลต่อผู้ใช้เหมือนกัน)

## 5. ความต่างที่ตั้งใจ / สมมติฐาน / สิ่งที่ยังไม่ยืนยันกับ server จริง

**ความต่างที่ตั้งใจ (Angular ≠ Java ตรง ๆ แต่ผลต่อผู้ใช้เท่ากัน)**
- SPA ไม่โหลดหน้าใหม่ → สิ่งที่การโหลดหน้าทำ พอร์ตทำเอง: (ก) ผลลัพธ์ที่ "อยู่หน้าเดิม" (backend ปฏิเสธ) = **วาดทั้งฟอร์มใหม่จาก bean** (`reloadPage()`: dialog ปิด, แท็บแรก, สคริปต์/widget เริ่มใหม่, growl รับข้อความของ request) (ข) `PrimeFaces.resetState()` ตอนเริ่ม/ออกจากหน้า (z-index counter, widgets) (ค) panel dropdown ที่ ODS ของ shell ใส่ไว้ใน `<body>` ถูกเก็บเมื่อออกจากหน้า
- mock ของโหมด `mock:true` ใช้ instance เดียวต่อ session ของแอป (`sharedMockSupportingDocs`) → เอกสารที่บันทึกที่ฟอร์มไปโผล่ในรายการ (เหมือน persistence ของ server)
- id ของฟอร์มชนิด 2–6 (`sd2RcvDate…sd6…`) รวมเป็นชุดของชนิด 1 ใน template (harness normalise `sd[2-6]` → `sd1`); `j_idtN` / `odsAuto_N` normalise
- `p:fileUpload` / `p:growl` / `p:selectOneMenu` / `p:calendar` เป็น **widget ของ PrimeFaces ตัวจริง**; ส่วนที่ server เคยทำ: upload ถูกตอบโดย jQuery ajax *transport* ใน `pf-upload-transport.ts` (เก็บไฟล์ใน bean แล้ววาด `sdDocList` ใหม่ แล้วส่ง partial-response ว่างให้ widget ทำ `done/always` ต่อเอง)
- `p:ajax event="change"` ของ select = `onchange` ที่ผูกกับ `<select>` ซ่อนผ่าน jQuery (widget เรียก `trigger('change')` ซึ่งไม่ dispatch DOM event → `(change)` ของ Angular ไม่ได้ยิน). **จุดนี้ harness จับได้ตอนทดสอบการเลือกลูกค้า — ก่อนหน้านั้นพอร์ตไม่เรียก `onCustomerSelected` เลย**

**สมมติฐานของ replica (เขียนจากโค้ด PrimeFaces ไม่ใช่จาก server จริง — ควรยืนยัน)**
- `p:ajax` ของ select เป็น `onchange="PrimeFaces.ab({s,e,f,p,u})"` inline บน `<select>` ซ่อน; `u:`/`p:` เป็น client id เต็ม (`quotationForm:sdDocList`) — client ของ PrimeFaces ไม่แปลง id สัมพัทธ์
- `p:remoteCommand` → `name=function(){PrimeFaces.ab({…, pa:arguments[0], onco, oner})}` (ส่ง params แบบ array `[{name,value}]` ที่หน้าเรียก)
- `p:fileUpload` → config `{id, auto, update, sequentialUploads, dropZone, onstart, oncomplete, oncancel, onvalidationfailure}` + `data-p-val="primefaces.File" data-p-allowtypes data-p-sizelimit` บน `<input type=file>`
- partial-response: `<update id=…>` + ViewState + `<extension ln="primefaces" type="args">{…,"prosJson":…}`
- ข้อความ `Message 'primefaces.FileValidator.*' not found` ใน list ข้อความของ FileUpload (ซ่อนอยู่ ผู้ใช้ไม่เห็น): `locale-th.js` ไม่มี `messages` ของ validator นี้ — ทั้ง replica และ Angular รันสคริปต์เดียวกัน จึงเหมือนกัน; ถ้า server จริงใส่ `PrimeFaces.locales` เพิ่ม ข้อความจะต่าง แต่ `sdUploadRejected` ใช้แค่ `filename/filesize` จึงไม่กระทบสิ่งที่ผู้ใช้เห็น
- ลำดับ CSS (PF components.css → theme → project_root → CSS หน้า → inline style ของ template → dark_mode → layout-modify): เดาจากลำดับ `<h:head>`/template ของ Java; ยืนยันได้โดยดู DOM ของ localhost:8080 จริง

**ที่เป็นของ shell (ไม่แก้ในงานนี้)**: ODS ของ shell (`core/dom/open-down-select.ts`, generated) ไม่เก็บ `.ods-list` ที่ค้างใน `<body>` เมื่อเปลี่ยนเส้นทางทั้งหน้า (เก็บเฉพาะปุ่มที่ยังอยู่ใน DOM) — หน้านี้เก็บของตัวเองตอนออก; หน้าอื่นที่มี `<select>` น่าจะมี list ค้างเช่นกัน (ไม่เห็นผล เพราะซ่อนอยู่)

## 6. คำถามถึงเจ้าของระบบ (Java)

1. กล่องตัวกรองของ `sales_document*.xhtml` (ไม่มีปุ่มเปิด) ตั้งใจให้ไม่ใช้ หรือควรมี `#ctFilterBtn`?
2. ไอคอนประเภทไฟล์หลังลบไฟล์กลับเป็นไอคอนทั่วไป (ข้อ 4.1) — ตั้งใจ/ยอมรับได้ หรือต้องการให้ re-apply (ถ้าใช่ ต้องแก้ที่ Java ก่อน แล้วพอร์ตตาม)?
3. การตรวจก่อนบันทึกไม่ผ่านแล้ว redirect ไปรายการ (ข้อ 4.2) เป็นพฤติกรรมที่ต้องการ หรือควรอยู่ที่ฟอร์ม?
4. `DocAttachServlet?action=describe` / `docAttEditDesc` — ยังใช้อยู่ไหม (ไม่มีปุ่มเรียกในหน้า)?
5. `primefaces.FileValidator.*` ใน locale ที่ production ใช้ (th) มีข้อความไหม — ใช้ยืนยันสมมติฐานของ replica
6. `docProxyUrl(remoteUrl)` ใน production ชี้ไป servlet proxy ใด (พอร์ตใช้ URL ตรงของไฟล์ — ถ้า storage ไม่เปิด CORS/ต้องผ่าน proxy ต้องมี endpoint ให้)

## 7. วิธีรัน / ตรวจ

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH
npm run supporting-doc-screens:sync                               # สร้างไฟล์ที่ generate ใหม่ทั้งหมด (idempotent)
node tools/compare/run.mjs supporting-doc-list --jobs 6          # 154 scenario
node tools/compare/run.mjs supporting-doc-form --jobs 6          # 232 scenario
node tools/compare/run.mjs supporting-doc-form --show save-new   # diff ของ scenario ที่ต่าง
SD_TRACE=1 node tools/compare/run.mjs supporting-doc-form --side java --filter '^save-'   # ดู request ที่ replica server ได้รับ
npx ng test --watch=false --include 'src/app/features/supporting-docs/**/*.spec.ts'
```

หมายเหตุสำหรับ scenario: ฟังก์ชันของ scenario ถูกส่งเข้าไปรันในหน้า — ตัวช่วยต้องอยู่ใน `pre` ของ `page.mjs` (ตัวแปรภายนอกใช้ไม่ได้); scenario ที่ทำให้ Java โหลดหน้าใหม่ (บันทึก) ต้องมี `reloads: true`; ถ้าบรรทัด `! … scenario error` ขึ้น แปลว่า scenario ไม่ได้ทำสิ่งที่ตั้งใจ (identical จึงไม่มีความหมาย).
