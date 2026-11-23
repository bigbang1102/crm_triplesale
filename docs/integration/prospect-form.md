# INTEGRATION — ฟอร์มลูกค้าเป้าหมาย (เพิ่ม / ดู / แก้ไข): `prospect-form` (`/crm/prospects/:id`)

ผู้ทำ: เซสชันพอร์ตหลัก (+ 2 งานย่อยขนาน: ชุดคอมโพเนนต์ PrimeFaces `tools/lib/pf-dom.mjs`, โมเดลของ bean/backend `features/prospects/form/prospect-form.{logic,bean,service,mock,live}.ts`) · เฟส A (โหมด mock, ตรวจเทียบกับ Java) + live adapter (พิสูจน์ด้วย spec เท่านั้น)

ต้นทาง Java: `web/pages/contracts_master_data.xhtml` (5,798 บรรทัด; 3 โหมดในหน้าเดียว: `action_type=add|view|edit`) + `ContractView.java` (7,404 บรรทัด) + servlet `ProspectDetailServlet` · `ProspectSaveServlet` · `ProspectUpdateServlet` · `ProspectAttachmentsServlet` · `ProspectAvatarServlet` + `web/js/lead/lead_create_dropdowns.js` · `resources/js/attach_file_types.js` · `resources/js/phone_format.js`

## 0. สรุปสถานะ

| รายการ | ผล |
| --- | --- |
| ฟอร์มลูกค้าเป้าหมายทั้ง 3 โหมด (UI + ตรรกะ + API ที่ต่อ) | พอร์ตแล้ว: เพิ่ม `/crm/prospects/new`, ดู `/crm/prospects/:id`, แก้ไข `/crm/prospects/:id?action_type=edit` |
| ตัวเทียบ Java–Angular | **291 สถานการณ์ เหมือนทุกบรรทัด** (DOM + สถานะ control + ข้อความ + ตำแหน่ง + computed style; ไม่ใช้ `--live`) |
| spec ของโฟลเดอร์ `features/prospects/form/` | 126 ข้อผ่าน (logic · bean · service/mock · live · route · host) |
| ที่ยังไม่ได้ยืนยันกับระบบจริง | โหมด live ไม่มี UAT → พิสูจน์ด้วย fake REST เท่านั้น; markup ของคอมโพเนนต์ PrimeFaces (datePicker · dialog · radio) เขียนจากคลาสใน jar ไม่ได้คัดจาก server จริง (§5) |

หน้าเป็น "ไฟล์ที่ถูกสร้าง" (`prospect-form.{html,scss,engine.ts,meta.ts}`) — แก้ `tools/sync-prospect-form.mjs` แล้วรัน `npm run prospect-form:sync`

## 1. ไฟล์ shared ที่แก้

| ไฟล์ | การแก้ |
| --- | --- |
| `src/app/app.routes.ts` | `IMPLEMENTED['prospect-form']` |
| `src/app/core/navigation/page-registry.json` | `prospect-form` → `"implemented": true` |
| `src/app/core/navigation/java-links.ts` (+ spec) | กฎ `ai_hub` (ลิงก์ "AI สรุปลูกค้า" ของโหมดดู → `/ai/hub/customer-brief?prospectId=…`) |
| `package.json` | script `prospect-form:sync` |
| `src/app/shared/primefaces/*` | **ย้ายมาจาก `features/supporting-docs/`** (กติกา: feature import feature อื่นไม่ได้): `pf-runtime.ts` · `pf-growl.ts` · `pf-upload-transport.ts` · `ods-pf.ts` · `pf-theme.scss` · `pf-template.scss` · `faces-message.ts` · `pf-fakes.testing.ts` (+ spec) — generator เขียนที่นี่ (`tools/sync-supporting-doc-pf.mjs`, `sync-supporting-doc-ods-pf.mjs`); `pf-runtime.ts` โหลด `datepicker.js` เพิ่ม และ `stopWidgets` เก็บ dialog + mask ที่ widget ย้ายไป `<body>` |
| `public/assets/vendor/primefaces/datepicker.js` | สคริปต์ของ `p:datePicker` จาก `primefaces-14.0.7-jakarta.jar` (ไบต์ต่อไบต์) |
| `public/assets/java-js/attach_file_types.js` | สำเนา `resources/js/attach_file_types.js` (ไฟล์เดียวกับที่ lead-detail / prospects ใช้) |
| `CLAUDE.md` · `README.md` · `manual/index.html` | บันทึกหน้านี้ |

## 2. ไฟล์ใน `tools/**` ที่เพิ่ม/แก้

| ไฟล์ | หน้าที่ |
| --- | --- |
| `tools/sync-prospect-form.mjs` | generator: 3 สคริปต์ inline ของหน้า → `prospect-form.engine.ts` (รายการ `SWAPS` พร้อมเหตุผล), markup ผ่าน `jsf.mjs` + `pf-dom.mjs` → `prospect-form.html`, CSS ของหน้า + กฎ global ของ Java ที่หน้าพึ่ง (`adaptation`, กฎ attribute-only ของ `project_root.css`, `a { text-decoration: none }`) → `prospect-form.scss` |
| `tools/lib/pf-dom.mjs` | เพิ่ม `p:datePicker` · `p:dialog` · `p:selectOneRadio` · `h:outputLabel` · `h:inputHidden`, `p:ajax` ซ้อนใน input/radio/datePicker/commandButton, remote command เก็บ `process`/`update`; `pfStrict` (เปิดเฉพาะหน้านี้) |
| `tools/lib/jsf.mjs` | ถอดรหัส `&amp; &lt; &gt;` ในสคริปต์ที่ไม่ใช่ CDATA (Facelets ทำแบบนี้), เรียก method ของ String ใน EL (`code.concat(' ')`) |
| `tools/lib/pf-css.mjs` · `tools/sync-supporting-doc-pf.mjs` | CSS ของ dialog · radio · datepicker เข้าชุด PrimeFaces |
| `tools/lib/pf-dom.selftest.mjs` · `pf-dom.smoke.mjs` | เรนเดอร์ทั้งหน้าใน java/ng; รัน widget ตัวจริงใน jsdom ด้วย markup ของเรา |
| `tools/compare/lib/prospect-form-{replica.mjs,barrel.ts}` · `pages/prospect-form/*` | replica ฝั่ง Java + scenarios (page / docs / save / extra) |
| `tools/compare/lib/supporting-doc-server.mjs` | `sessionOf` รับ `deps.makeView`; `partialResponse` ใส่ `<eval>` (สคริปต์ที่ listener คิวไว้) |

## 3. Backend contract

`ProspectFormBackend` (`prospect-form-backend.ts`):
- `initial()` → `{ uploadAcceptExt, ssEmployeeId }` (ค่าที่ `CommonBean` ใส่ผ่าน EL)
- `api: ProspectFormApi` (12 method — `ContractView` ผ่าน `Data_API`): `prospect(id)` = `GET /prospects/{id}` · `masterData(path)` = `GET /master-data/…` (countries · provinces · districts · sub-districts · business-types · occupations · marketing-channels · communication-types · sale-persons · movement-types/LD) · `metroGeo()` · `createProspect` = `POST /prospects` · `updateProspect` = `PUT /prospects/{id}` · `putExtraInfo` = `PUT /prospects/{id}/extra-info` · `prospectAttachments` · `addProspectAttachment` · `deleteProspectAttachment` · `createLead` = `POST /leads` · `findLeads` · `assignLead` = `PATCH /leads/assign`
- `fetch(url, init)` — ที่สคริปต์ของหน้าเรียกเอง (URL เดียวกับ servlet Java): `GET /board/prospect?id=` · `POST /board/prospect/save` · `GET|POST|DELETE /board/prospect/attachments` · `GET /board/employees` · `GET /docproxy?url=` (live: `prospectRoutes` + `opportunityCreateRoutes` + `boardMasterRoutes` ของ `core/live/`)

mock: `createMockProspectForm()` (ข้อมูลจาก `mockProspect(id)` ของหน้ารายการ + ชั้นทับของที่บันทึก); ชื่อพิเศษที่ทดสอบทุกสาขา: `X-FAIL` · `X-INVALID` · `X-NOREPLY` · `X-DUP` (409 จนส่ง `confirmMerge`), remark `X-EXTRA-FAIL`, ไฟล์ที่ชื่อมี `FAIL`.

## 4. พฤติกรรมของ Java ที่คงไว้ (ทั้งที่อาจดูเป็นบั๊ก)

- `usagestatus='new'` ถูกส่งเป็น `release` (`ensureUsageStatus` รับเฉพาะ draft/release/block/remove)
- `convenientTime` ตอนสร้างเป็น `2025-07-04T10:00:00` ตายตัว; `ensurePositiveInt` เขียน `0` กลับลง body (`marketingChanelId: 0`)
- `ss_tel` ค้างใน session แล้วทับ `tel` ได้ (รวมค่าค้างจากหน้าก่อน); `sendDocDistrictId` ค้นใน list ของที่อยู่ปัจจุบัน; `marketingChanelCode` ส่งเป็นทั้ง code และ name
- `deleteProspectDocument` ที่ได้คำตอบไม่ใช่ JSON จบเลยและไม่โหลดรายการใหม่
- ปุ่ม "บันทึก…" ของโหมด view/edit สร้างข้อความ swal ทางฝั่ง server (`PrimeFaces.current().executeScript`) — bean คิวสตริงเดียวกับ Java แล้ว host รันหลังอัปเดต DOM (ลำดับเดียวกับ `<eval>` ของ partial response); การย้ายหน้า (`window.location.href`) ผ่าน `javaLinkToRoute`
- **PrimeFaces คืนโฟกัสให้ element เดิมหลังทุก response** (`handleReFocus`) แม้ `update="@none"` และแม้ response เพิ่งเปิด SweetAlert (ปุ่มของ swal จึงไม่ถือโฟกัส) — host ทำเหมือนกัน
- ปุ่มที่มี `p:ajax` ซ้อนยิง 2 คำขอต่อกัน (ของ behaviour แล้วของปุ่มเอง) — คิวทีละตัวเหมือน `PrimeFaces.ajax.Queue`
- สคริปต์ของหน้า wrap `alignPanel` ของ `SelectOneMenu` (เปิดลงล่างเสมอ) ก่อน `open_down_select.js` — ลำดับเริ่มต้นของ host เหมือนเอกสาร Java (engine → ODS → widgets); `destroy()` คืน `alignPanel` เดิม (Java ไม่ต้องคืนเพราะโหลดหน้าใหม่)

## 5. ความต่างที่ตั้งใจ / สมมติฐาน / สิ่งที่ยังไม่ยืนยัน

ความต่างที่ตั้งใจ (ตัวเทียบ normalize ไว้ใน `prospect-form-replica.mjs` พร้อมเหตุผล):
1. **DOM ของ Angular ผูกกับ bean สด ส่วน DOM ของ Java เป็น snapshot ของตอนวาดหน้า** จนกว่าส่วนที่ `update=` จะถูกวาดใหม่ — จัดการ 2 จุด: `customer_type` (เลือกฝั่ง client; template ใช้ `typeAtLoad()` = ค่าตอนโหลด) และลิงก์ "AI สรุปลูกค้า" (`prospectId` ผูกกับ `contractBean.id` ซึ่งเปลี่ยนหลังสร้าง Lead ในโหมดดู → normalize)
2. **ลิสต์ของ ODS (`.ods-list`) เทียบเป็นเซต** — ลำดับสร้างตามลำดับที่ `<select>` ถูก enhance; SPA enhance select ของ shell ก่อนหน้ามี และ modal ที่สคริปต์ย้ายไปท้าย `<body>` ถูก enhance ที่เดิม
3. ลิงก์ไปหน้าอื่น: Java `ai_hub.face?…&prospectId=1` → `/ai/hub/customer-brief?prospectId=1` + คลิกผ่าน router; `window.location.href='…face?…'` → `ptNavigate(…)`; รายการ `contracts.face` → `/crm/prospects`
4. ไอคอนลบเอกสารเขียน id ของแถวใน `data-docno` (Angular ไม่ผูก event attribute แบบ dynamic); ลำดับ class ของไอคอน radio (`ui-icon ui-c ui-icon-blank`); `class=""` ของ wrapper radio ไม่ถูกเขียน
5. field `phoneFormatJson` (hidden) เป็นค่าที่ส่งไปหน้า ไม่ถูกอ่านกลับเข้า bean
6. ที่เลื่อนหน้าถึงท้ายสุด scroll container ของ Java layout กับ shell ของ Angular สิ้นสุดต่างกัน 18px — scenario ที่พิมพ์ช่องท้ายหน้าเลื่อนกลับก่อน dump (`toTop`)
7. `/docproxy` ใช้ URL ตรงของไฟล์ในโหมด live (`docProxy: (u) => u`) เหมือนหน้าอื่น

สมมติฐานของ replica (อ่านจากคลาสใน jar ด้วย `javap -c` primefaces 14.0.7 / jakarta.faces 4.0.7 — **ไม่ได้คัดจาก server จริง**): markup + key ใน cfg ของ `p:datePicker` (สูง), `p:dialog` (สูง), `p:selectOneRadio lineDirection` (สูง), ลำดับ attribute ของ `p:ajax` (สูง), คำขอของ `p:commandButton` เป็น `@all` เมื่อไม่มี `p:` (สูง), `class` เป็น alias ของ `styleClass` เฉพาะ `h:` (สูง), `touchable` (กลาง), รูป `onclick` ของ `p:commandLink` (กลาง), `aria-label`/`data-pf-*` ของ `p:commandButton` (ต่ำ — ทั้งสองฝั่งใช้ฟังก์ชันเดียวกัน จึงไม่ถูกจับ)

ไม่ได้พอร์ต (ตามที่ตัดสินใจไว้ใน `prospects-live.md` §3.1–3.2): `SunProspectInfoBoDao.loadByProspectId` / `ensureForProspect` (เข้า DB ตรง; "ข้อมูลเพิ่มเติม" มาจาก `sunProspectInfo` ใน detail), `ProspectListService.invalidateDetail` (cache), `appendLocalSavedContract`, `populateStaticDropdowns`, `loadCsFromSunInfo`.

ต่างจาก Java ที่ F2 ระบุ: Java โหลด countries แบบ lazy ใน getter ตอน render — ที่นี่ `init()`/listener เรียก `ensureCountries()` ก่อน; `contactDate` ตอนสร้างเป็น `<date>T00:00:00` (Java ส่งเวลาปัจจุบัน เพราะ model เก็บวันที่ `yyyy-MM-dd`).

## 6. คำถามถึงเจ้าของระบบ (Java)

1. `ProspectUpdateServlet` / `ProspectAttachmentsServlet` เขียน DB ตรง (`SunProspectInfoBoDao`) — จะมี REST แทนหรือไม่ (live ต้องใช้; ตอนนี้ `/board/prospect/update` ตอบ 501)
2. ปุ่ม "สร้าง Lead" ในโหมดดู (`openCreateLeadModal` → `saveProspectAndLead`) เรียก `POST /prospects` ซ้ำกับ prospect เดิม — ตั้งใจให้สร้างลูกค้าใหม่หรือควรสร้างแค่ Lead
3. `p:dialog` ยืนยัน 5 ตัว (`confirmationDialogPros|Lead|EditPros|EditLead|Update`) ยังอยู่ในไฟล์แต่ปุ่มที่เปิด (`PF('…').show()`) ถูกคอมเมนต์ไว้หมดแล้ว (บรรทัด ~3785) — ปุ่มบันทึกจริงใช้ modal ของหน้าเอง (`createLeadModal`, `updateConfirmModal` …) จึงลบ 5 ตัวนี้ได้หรือไม่ (พอร์ตไว้ครบตามต้นฉบับ)
4. `contactDate` ตอนสร้าง: ต้องการเวลาปัจจุบันหรือ 00:00 (model ใหม่เก็บเป็นวัน)
5. `customer_type` เดิม `company` ถูกแปลงเป็น `juristic` ตอนอ่าน — ยืนยันว่ายังมี record เก่าที่เป็น `company` (208 ใบตอนเปลี่ยน) และควรแปลงตอนเขียนกลับด้วยหรือไม่

## 7. วิธีรัน / ตรวจ

```bash
npm run prospect-form:sync                                  # สร้าง prospect-form.{html,scss,engine.ts,meta.ts}
CI=1 node node_modules/@angular/cli/bin/ng.js test --no-watch --include 'src/app/features/prospects/form/**/*.spec.ts'
node tools/compare/run.mjs prospect-form --list             # รายชื่อ scenario
node tools/compare/run.mjs prospect-form --jobs 4           # เทียบทั้งหมด (build Angular ก่อน)
node tools/compare/run.mjs prospect-form --filter '^create-' --no-build --jobs 4
node tools/compare/run.mjs prospect-form --show <scenario> --limit 4000
node tools/lib/pf-dom.selftest.mjs && node tools/lib/pf-dom.smoke.mjs   # ชุดคอมโพเนนต์ PrimeFaces
```

หมายเหตุ scenario: ฟังก์ชันของ scenario ถูกส่งเข้าไปรัน "ในหน้า" จึงไม่เห็นตัวแปรของไฟล์ — helper อยู่ใน `pre` ของ `page.mjs`; scenario ที่วนด้วย loop ต้องเป็น string ของโค้ด.
