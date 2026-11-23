# INTEGRATION — workspace `ws_prospects` (หน้า DrillDown + หน้า Prospects)

ผู้ทำ: worker `ws_prospects` · เฟส A (โหมด mock) — **เฟส B (live adapter) ของ Prospects ทำแล้ว (2026-10-21): ดู `docs/integration/prospects-live.md`** (DrillDown live: `features/drilldown/drilldown.live.ts`). ข้อความ "ยังไม่มี live adapter / `<ts-live-missing />`" ในไฟล์นี้เป็นของเฟส A

| หน้า | registry id | route | ต้นฉบับ Java | ผล compare (harness) |
|---|---|---|---|---|
| DrillDown | `drilldown` | `crm/drilldown/:code` | `web/pages/drilldown.xhtml` | 166 / 166 identical |
| Prospects (ลูกค้าเป้าหมาย) | `prospects` | `crm/prospects` | `web/pages/contracts.xhtml` | 255 / 255 identical |

(ตัวเลขข้างบนคือผลของรอบสุดท้าย **หลัง `workspace.mjs refresh` ครั้งที่ 2** (ใช้ `_swal.scss`, `_base.scss`, harness ล่าสุดของ main) และหลังแก้ทุกอย่างในเอกสารนี้ — ดูหัวข้อ 3 สำหรับรายละเอียดและข้อจำกัด)

---

## 0. การแก้ไฟล์ shared ใน workspace นี้ (ผู้ประสานงานต้อง merge เอง)

ไฟล์ด้านล่างถูกแก้ **ใน workspace ของ worker เท่านั้น** เพื่อให้รัน/ตรวจเทียบได้ — ผู้ประสานงานนำไปรวมเอง (ทุกอย่าง backward-compatible)

### 0.1 `src/app/app.routes.ts` — เพิ่ม 2 loader ใน `IMPLEMENTED`
```ts
drilldown: { load: () => import('@features/drilldown/drilldown').then((m) => m.Drilldown) },
prospects: { load: () => import('@features/prospects/prospects').then((m) => m.Prospects) },
```

### 0.2 `src/app/core/navigation/page-registry.json` — `"implemented": true` ของ 2 รายการ
- `"id": "prospects"` (route `crm/prospects`) และ `"id": "drilldown"` (route `crm/drilldown/:code`)
- (ใน workspace นี้ flag ของหน้าอื่นเป็นค่าเก่าก่อนการ merge ของ coordinator — **อย่านำทั้งไฟล์ไปทับ** ให้พลิกเฉพาะ 2 รายการนี้)

### 0.3 `src/app/core/navigation/java-links.ts` (+ `java-links.spec.ts`)
1. `query(q, drop, keepNoise)` — เพิ่มพารามิเตอร์ที่ 3 `keepNoise: string[] = []` (พารามิเตอร์ menu ที่ปกติถูกตัดทิ้ง แต่บางหน้าต้องเก็บ):
   ```ts
   const query = (q: URLSearchParams, drop: string[] = [], keepNoise: string[] = []): string => {
     const keep = new URLSearchParams();
     q.forEach((v, k) => {
       if ((!MENU_NOISE.has(k) || keepNoise.includes(k)) && !drop.includes(k)) keep.append(k, v);
     });
     ...
   ```
2. rule `drilldown` — ไม่มี `?code=` ให้ใช้รายงานเริ่มต้นของหน้า Java (`DEFAULT_CODE` ของ `drilldown.xhtml` = `T-CS-01`) แทนที่จะได้ `/crm/drilldown/` ว่าง:
   ```ts
   drilldown: (q) => `/crm/drilldown/${encodeURIComponent(q.get('code')?.trim() || 'T-CS-01')}${query(q, ['code'])}`,
   ```
3. rule `contracts_master_data` — **เก็บ `action_type` (add | view | edit) ไว้ใน query** เพราะเป็น "โหมดของฟอร์ม" ไม่ใช่พารามิเตอร์เมนู (เมนู 3 จุดของหน้า Prospects ลิงก์ไป `edit`/`view` ของ id เดียวกัน — ถ้าตัดทิ้ง ฟอร์มแยกโหมดไม่ได้):
   ```ts
   contracts_master_data: (q) => `/crm/prospects/${encodeURIComponent(q.get('id') ?? 'new')}${query(q, ['id'], ['action_type'])}`,
   ```
   ผลที่ได้: `…action_type=add` → `/crm/prospects/new?action_type=add`; `…action_type=edit&pms=detail&id=17` → `/crm/prospects/17?action_type=edit&pms=detail`
   **ต้องตัดสินใจร่วมกับ worker ที่ทำหน้าฟอร์มลูกค้าเป้าหมาย (`prospect-form`)** ว่าจะอ่านโหมดจาก query `action_type` นี้หรือจากที่อื่น (ถ้าเลือกแบบอื่น ให้แก้ rule นี้ + spec; หน้า Prospects ไม่ได้สร้าง URL เอง ทุกลิงก์ผ่าน `javaLinkToRoute()`)
4. spec: เพิ่มเคสของ `drilldown` (มี/ไม่มี code, ผ่าน `/triplesale/pages/…`) และ `contracts_master_data` (add / view / edit) — ดูไฟล์ `java-links.spec.ts` ใน workspace

### 0.4 `tools/lib/port-kit.mjs` — `guardResponse` ส่งต่อ `blob()` / `arrayBuffer()`
engine ของ Prospects ดาวน์โหลด/พรีวิวไฟล์ด้วย `res.blob()` — response ที่ห่อโดย `guardResponse` มีแค่ `json()`/`text()`/`clone()` จึงพัง เพิ่ม 2 บรรทัด (ทำงานเหมือน `json`/`text`: หลัง destroy ไม่ settle):
```js
      blob: function () { return r.blob().then(function (v) { return destroyed ? never() : v; }); },
      arrayBuffer: function () { return r.arrayBuffer().then(function (v) { return destroyed ? never() : v; }); }
```
(ใส่ต่อจากบรรทัด `text:` และเติม `,` ท้ายบรรทัด `text:`) — มีผลกับ engine ที่สร้างจาก generator ทุกตัวหลังรัน `*:sync` ใหม่ (ไฟล์ที่สร้างจะเปลี่ยนเฉพาะส่วนนี้)

### 0.5 `tools/compare/lib/shell-replica.mjs` — `TEMPLATE_SCRIPTS(l = lang)`
สคริปต์ที่ `template.xhtml` ฉีดให้ทุกหน้า (`window.ODS_I18N`, `INPUT_GUARD_I18N`) ใช้ข้อความของ **ภาษา session** — เดิมใช้บันเดิลภาษาไทยเสมอ ทำให้หน้าอังกฤษของ replica (ฝั่ง Java) แสดง ODS เป็นไทย ทั้งที่ Angular เป็นอังกฤษ แก้เป็น:
```js
  // (the texts the template injects are those of the session language: `l` = 'en' for an English page, the Thai bundle otherwise)
  let enBundle;
  const bundleOf = (l) => (l === 'en' ? (enBundle ??= JSON.parse(readFileSync(join(ngRoot, 'public/assets/i18n/en.json'), 'utf8'))) : th);
  const TEMPLATE_SCRIPTS = (l = lang) => { const t = bundleOf(l); return `<script>window.ODS_I18N = ${JSON.stringify({
    select: t['label.ods.select'], … months: …t['label.month.' + (i + 1)] …, dow: …t['label.dow.' + (i + 1)] …
  …
<script>window.INPUT_GUARD_I18N = { blocked: ${JSON.stringify(t['label.guard.special_char'])} };</script>
…crm_error_popup.js…</script>`; };
```
(เรียกแบบเดิมได้ `TEMPLATE_SCRIPTS()`; หน้า Prospects เรียก `TEMPLATE_SCRIPTS(lang)` ใน `tools/compare/pages/prospects/page.mjs`) — diff เต็ม: `diff ../triple_sale_angular/tools/compare/lib/shell-replica.mjs tools/compare/lib/shell-replica.mjs`

### 0.6 `src/styles/_swal.scss` — ไม่ต้องแก้ (main มีแล้ว)
SweetAlert ที่มีปุ่ม (ยืนยันลบเอกสาร, อัปโหลดล้มเหลว, สร้าง Lead ล้มเหลว ฯลฯ) ต้องการกฎ `.swal-footer` / `.swal-button-container` ของ `topbar.xhtml` และ letter-spacing ปกติของปุ่ม — worker พบและเพิ่มเองก่อน แล้ว `workspace.mjs refresh` ดึงเวอร์ชันของ main ที่มีกฎเดียวกัน (`.swal-overlay :is(button, input, textarea) { letter-spacing: normal }`) มาแทน **ผล compare ในเอกสารนี้ได้จากไฟล์ของ main** — จึงไม่มีอะไรต้อง merge สำหรับไฟล์นี้

### 0.7 `package.json` — 2 script
```json
"drilldown:sync": "node tools/sync-drilldown.mjs",
"prospects:sync": "node tools/sync-prospects.mjs",
```
(generator ทั้งสองเรียก `javaLinkToRoute` จาก `.ts` — Node แสดงคำเตือน `MODULE_TYPELESS_PACKAGE_JSON` ใน workspace นี้เพราะ `package.json` ยังไม่มี `"type": "module"`; ใน main มีแล้ว จึงหายไปหลัง merge)

### 0.8 `CLAUDE.md` — bullet ที่แนะนำ (ต่อจาก bullet Dashboard)
- **หน้า DrillDown เป็นไฟล์ที่ถูกสร้างเช่นกัน** (`features/drilldown/drilldown.{html,scss,engine.ts}` + `drilldown.reports.ts` จาก `drilldown.xhtml` + `DrilldownApiService.java`; `npm run drilldown:sync`) — แก้ `tools/sync-drilldown.mjs` แล้วรันใหม่ ห้ามแก้ไฟล์ที่สร้าง; host เขียนเอง (`drilldown.ts`, `drilldown-view.ts`); route รับ `:code`; เปลี่ยนภาษา/เปลี่ยนรายงาน = สร้างหน้าใหม่ (เหมือน Java โหลดหน้าใหม่); compare 166 scenario
- **หน้า Prospects (ลูกค้าเป้าหมาย = `contracts.xhtml`) เป็นไฟล์ที่ถูกสร้างเช่นกัน** (`features/prospects/prospects.{html,scss,engine.ts}`, `prospects.constants.ts` (จาก `FileServerAccess.ALLOWED_EXT`), `opportunity-create-dropdowns.ts` (จาก `web/js/lead/lead_create_dropdowns.js`); `npm run prospects:sync`) — แท็ก JSF/`p:remoteCommand`/`ui:repeat` ถูกแปลงเป็น element ที่ JSF เขียนออกมา + `env.docs` + `ctDocRowsHtml()`; สีป้าย "ที่มา" ใช้ FNV-1a ของหน้า (ไม่ใช่ `groupPillColor()`); ลิงก์ไปหน้าอื่นผ่าน `javaLinkToRoute()`; compare 255 scenario
- ทดสอบ jsdom: inline handler (`onclick="ctOpenPanel(this)"`) คอมไพล์ใน global ของ jsdom ซึ่งไม่ใช่ global ของ test runner — ใน spec ต้อง bridge `window.*` ที่ engine export (ดู `HANDLER_NAMES` ใน `prospects.spec.ts`); jsdom ไม่มี layout (`scrollHeight`=0) → infinite scroll โหลดทุกหน้าทันที ต้อง stub `scrollHeight/clientHeight`

### 0.9 `README.md` — แถว/ข้อความที่แนะนำ
- `tools/`: เพิ่ม `sync-drilldown.mjs` (สร้างหน้า DrillDown) · `sync-prospects.mjs` (สร้างหน้า Prospects + ตัวกรอง dropdown ของ modal สร้าง Lead)
- ตาราง features: `features/drilldown` (หน้ารายงานเจาะลึก 11 ชุด) · `features/prospects` (รายการลูกค้าเป้าหมาย + แผงรายละเอียด + เอกสารประกอบ + modal สร้าง Lead); สถานะ: เฟส A (mock) เสร็จ, live ยังไม่ทำ

### 0.10 `manual/index.html`
เพิ่มหัวข้อใหม่ต่อจาก §24 Dashboard จากชิ้นส่วนที่เตรียมไว้: **`manual-drilldown.html`** และ **`manual-prospects.html`** (ที่รากของ workspace) พร้อมลิงก์ในสารบัญ

### 0.11 i18n
**ไม่มี key ใหม่** — ทุกข้อความใช้ key เดิมของ Java (`label.*`) และ key `app.live.*` ที่ได้จาก `workspace.mjs refresh` แล้ว (ไม่ได้แก้ `public/assets/i18n/**`)
ข้อสังเกต: Java ฝังข้อความไทยตายตัวใน JS ของหน้า Prospects (title ของ SweetAlert: `ข้อความแจ้งเตือน!`, `บันทึกไม่สำเร็จ!`, `มี Lead นี้แล้ว`, `สร้าง Lead สำเร็จ แต่ผูกผู้รับผิดชอบไม่สำเร็จ` ฯลฯ) — **คงไว้ตามต้นฉบับ** (หน้าอังกฤษจึงเห็น title เป็นไทยเหมือน Java) เสนอให้เจ้าของระบบพิจารณาย้ายเป็น key i18n ภายหลัง (ต้องแก้ทั้ง Java และ Angular พร้อมกัน เพื่อไม่ให้ compare ต่าง)

---

## 1. ไฟล์ที่เพิ่ม (ทั้งหมดอยู่ใน workspace; ไม่มีไฟล์นอก workspace ถูกแก้ ยกเว้นอ่านโปรเจกต์ Java)

### DrillDown
| ไฟล์ | หมายเหตุ |
|---|---|
| `tools/sync-drilldown.mjs` | generator → `drilldown.{html,scss,engine.ts}` + `drilldown.reports.ts` (อ่าน `DrilldownApiService.java` ด้วย scanner ที่ตัด comment) |
| `src/app/features/drilldown/drilldown.{html,scss,engine.ts}`, `drilldown.reports.ts` | **GENERATED** (header `GENERATED`) |
| `src/app/features/drilldown/drilldown.ts`, `drilldown-view.ts` | route component + host (เขียนเอง) |
| `src/app/features/drilldown/drilldown-backend.ts`, `drilldown.mock.ts`, `drilldown.columns.ts` | สัญญา backend, mock (framework-free), พอร์ตของ `ReportDef.planColumns/mockColumns` |
| `src/app/features/drilldown/drilldown.mock.spec.ts` (23 เทสต์), `drilldown.spec.ts` (18 เทสต์) | |
| `tools/compare/pages/drilldown/{page.mjs,scenarios.mjs}` | harness (166 scenario) |
| `manual-drilldown.html` | ชิ้นส่วน manual |

### Prospects
| ไฟล์ | หมายเหตุ |
|---|---|
| `tools/sync-prospects.mjs` | generator |
| `src/app/features/prospects/prospects.{html,scss,engine.ts}`, `prospects.constants.ts`, `opportunity-create-dropdowns.ts` | **GENERATED** |
| `src/app/features/prospects/prospects.ts`, `prospects-view.ts` | route component + host (เขียนเอง) |
| `src/app/features/prospects/prospects-backend.ts`, `prospects.mock.ts`, `prospects.docs.ts` | สัญญา backend, mock (framework-free), ตรรกะแท็บเอกสาร (`ContractView`) |
| `src/app/features/prospects/prospects.mock.spec.ts` (32 เทสต์), `prospects.spec.ts` (30 เทสต์) | |
| `tools/compare/pages/prospects/{page.mjs,scenarios.mjs}` | harness (255 scenario) |
| `manual-prospects.html` | ชิ้นส่วน manual |
| `public/assets/images/icon/{fi_sort_by,fi_search,fi_filter,fi_phone,default_avatar,fi_download}.svg` | ไอคอนที่หน้า Java ใช้ (สำเนา byte-identical จาก `web/images/icon/`) |
| `public/assets/java-js/attach_file_types.js` | สำเนา byte-identical ของ `web/js/attach_file_types.js` (โหลดด้วย `loadScript` ตอนเข้าหน้า) |

> `opportunity-create-dropdowns.ts` สร้างจากไฟล์ที่ **ใช้ร่วมกับหน้าฟอร์มลูกค้า** (`contracts_master_data.xhtml`): `makeLeadCreateDropdowns({ fetch, ctx })` — เมื่อ worker ของ `prospect-form` ต้องใช้ ให้ย้ายไปโฟลเดอร์ shared (เช่น `shared/`) แล้วให้ generator ของ Prospects เรียกจากที่นั่น

---

## 2. วิธีรันซ้ำ
```
npm run drilldown:sync   # หลังเพิ่ม script ใน package.json (หรือ node tools/sync-drilldown.mjs)
npm run prospects:sync   # (หรือ node tools/sync-prospects.mjs)
node tools/compare/run.mjs drilldown --jobs 3
node tools/compare/run.mjs prospects --jobs 3        # แนะนำ --jobs ไม่เกิน 3–4: ที่ 5+ ตอนเครื่องไม่ว่างมี scenario ที่ timing เพี้ยนเอง (รันซ้ำเดี่ยวแล้วหาย)
CI=1 node node_modules/@angular/cli/bin/ng.js test --no-watch --include 'src/app/features/prospects/**/*.spec.ts'
CI=1 node node_modules/@angular/cli/bin/ng.js test --no-watch --include 'src/app/features/drilldown/**/*.spec.ts'
```
Generator ตรวจแล้ว: (ก) รันซ้ำไม่ทำให้ไฟล์เปลี่ยน (md5 เท่าเดิมทุกไฟล์ที่สร้าง) (ข) เมื่อต้นฉบับ Java เปลี่ยนใน 1 จุดที่มี swap — ทดลองกับสำเนา `contracts.xhtml` / `drilldown.xhtml` ที่แก้ 1 บรรทัด (`TS_JAVA_ROOT=<สำเนา>`) — generator หยุดด้วย `… changed — NOT FOUND: …` และไม่เขียนไฟล์ใด ๆ

---

## 3. ผลการตรวจเทียบกับหน้า Java จริง

harness เทียบ DOM + attribute + ข้อความ + computed style + ตำแหน่ง/ขนาด ทีละบรรทัด; ฝั่ง Java คือ replica ที่สร้างจาก xhtml/CSS/JS จริงของ Java (ไม่มี Tomcat) ให้ข้อมูลชุดเดียวกับฝั่ง Angular (BFF ของ replica ตอบจาก mock เดียวกัน)

### DrillDown — 166 scenario
หน้าแรก สว่าง/มืด × ขนาดจอ · ไทย/อังกฤษ · A A A · ทั้ง 11 รายงาน · ตรึงคอลัมน์ + เลื่อน · ลากเลื่อน · แบ่งหน้า · skeleton · สถานะ error (403/500/ตอบไม่ใช่ JSON/service ล้ม/ไม่รู้จักรายงาน/ว่าง) · ตัวกรองรายการติ๊กและปฏิทิน · ปิดเมนู (Esc/คลิกนอก/เลื่อน/resize) · ส่งออก CSV

### Prospects — 255 scenario
layout สว่าง/มืด × 10 ขนาดจอ · ไทย/อังกฤษ · A A A · เรียง · ค้นหา + รายการแนะนำ (รวม hook ทุกสถานะ) · ตัวกรอง (cascade จังหวัด→อำเภอ, ค้นหา chip) · แถว/แผงรายละเอียด (ต่างประเทศ/ไม่มีเบอร์/ไม่มีพนักงานขาย/องค์กร) · เมนู 3 จุด + นำทาง · infinite scroll · แท็บเอกสาร (พรีวิว 6 ชนิด, ดาวน์โหลด, ลบ, อัปโหลดทุกกรณี, ลากวาง) · modal สร้าง Lead (ทุก validation, สำเร็จ, ซ้ำ, error จาก service, owner assign ล้ม)

### Test hooks ใน mock (ใช้ใน scenario และทดลองมือ)
- DrillDown (`:code`): `X-ERR-403`, `X-ERR-500`, `X-ERR-UP` (service ล้ม), `X-ERR-BAD` (ตอบไม่ใช่ JSON), `X-EMPTY`, `X-REAL` (ข้อมูล "จริง" ไม่ใช่ mock), `X-BIG` (1,234 แถว), `X-BLANK`, `X-SLOW` (4 วินาที)
- Prospects (ข้อความค้นหา): `X-ERR-500|403|404|502|0`, `X-EMPTY`, `X-FULL` (แถวมีครบ ไม่มี enrich), `X-NOMETA` (ไม่มี paging meta), `X-ENRICH-FAIL` (id ≥ 900 → enrich ตอบ 500), `X-SLOW` (3 วินาที); ชื่อไฟล์อัปโหลดที่มี `FAIL` (backend error), `UNVERIFIED` (เก็บแล้วแต่เข้าถึงไม่ได้), `SLOW` (3 วินาที); ไฟล์ที่ชื่อมี `missing` → `/docproxy` ตอบ 502; ผลิตภัณฑ์ `ประกันภัย` (validation error) และ `บริการเสริม` (HTTP 500) ของ modal สร้าง Lead; พนักงาน id 108 (`ปรียา แสงทอง`) มอบหมายเป็นเจ้าของไม่สำเร็จ

### เทสต์ / build
- `ng test` เฉพาะ spec ของตัวเอง (รันรวม 8 ไฟล์ = 129 เทสต์ ผ่านทั้งหมด): Prospects 62 เทสต์ (2 ไฟล์) · DrillDown 41 เทสต์ (2 ไฟล์) · `core/navigation` 26 เทสต์ (`java-links.spec.ts` ที่มีเคสของ 2 หน้านี้, `page-registry.spec.ts`, `nav.service.spec.ts`, `title.strategy.spec.ts`)
- production `ng build` ผ่าน ไม่มี warning/budget error (chunk lazy: `prospects` ≈ 103 kB, `drilldown` ≈ 65 kB raw)
- host ไม่ทิ้งอะไรหลัง destroy: spec "removes every listener, observer and timer…" (Prospects) / spec ใน `drilldown.spec.ts` ตรวจ listener, timer, observer, blob URL, modal ที่ย้ายไป `<body>`, ชื่อ `window.*`, drag-scroll

### สิ่งที่ harness **ไม่ได้** ครอบคลุม
- เนื้อหาภายใน `<iframe>` พรีวิว PDF (ตัวดู PDF ของเบราว์เซอร์) — เทียบเฉพาะ element/attribute (ที่อยู่ blob ถูก normalize เพราะสุ่ม)
- การดาวน์โหลดจริง — harness stub ลิงก์ดาวน์โหลด/CSV แล้วเขียนชื่อไฟล์ + ชนิด + ขนาด + 200 ตัวอักษรแรกลง DOM เพื่อเทียบ
- เบราว์เซอร์อื่นนอกจาก Chromium ของ harness
- โหมด live (ยังไม่มี) — ทุกอย่างข้างบนคือโหมด mock

---

## 4. ความต่างจาก Java ที่ตั้งใจ (และ normalization ใน harness)

DrillDown
1. รหัสรายงานมาจาก `:code` ของ route (Java: `?code=`); ไม่มีรหัส → `javaLinkToRoute` ให้ `T-CS-01`
2. `document.title` ตั้งผ่าน `Title` ของ Angular (`DrillDown <code>` เหมือนเดิม)
3. ไม่มี servlet: `/board/drilldown` เป็นสัญญาของ `DrilldownBackend` (mock ในเฟสนี้)

Prospects
1. JSF: `h:form` → `<form id="ctDocForm" … action="<route>">`; `h:panelGroup` → `<div id="ctDocForm:ctDocList" class="ct-doc-list">`; hidden input ของ ViewState และสคริปต์ที่ PrimeFaces สร้างให้ `p:remoteCommand` **ไม่ถูกทำซ้ำ** — `rc_ctLoadDocs/rc_ctDeleteDoc` เป็นฟังก์ชันที่ engine ให้ (เรียก `env.docs`), `ui:repeat` ของรายการเอกสาร → `ctDocRowsHtml(docs)` ที่ generator สร้างจากเนื้อใน xhtml
2. นำทาง: Java `window.location.href = 'x.face?…'` → `ctNavigate()` ผ่าน `javaLinkToRoute()` + Router (harness normalize ทั้งสองฝั่งเป็น `NAV(<route>)`)
3. `.ods-list` ที่ซ่อนอยู่: ลำดับใน DOM ต่างกันระหว่าง Java/Angular (ODS ต่อ element ท้าย `<body>` ตอนสร้าง) — harness เทียบเฉพาะ `.ods-list.open`
4. รูป: `../images/…` → `assets/images/…` (mirror byte-identical); ODS suggest ได้รูป default ผ่าน `defaultAvatar: CT_AVATAR_DEF` (ในหน้า Java ใช้ path สัมพัทธ์ของ context)
5. SweetAlert: ไลบรารีจริงผ่าน `@core/dom/swal` (`loadSwal`) — host เปิด `swal()` เป็น protected method เพื่อให้ spec ดักได้
6. ปุ่ม "ลิงก์ไปฟอร์มลูกค้า" ใช้ `javaLinkToRoute` (ข้อ 0.3.3); เปลี่ยนภาษา = สร้างหน้าใหม่ (Java `location.reload()`)
7. สคริปต์ `attach_file_types.js` (ตรวจนามสกุลไฟล์) โหลดจาก `assets/java-js/` ด้วย `loadScript` แทน `<script src>` ของ Java
8. สีป้าย "ที่มา": FNV-1a ของ Java ใน engine ตามต้นฉบับ (ไม่ใช้ `groupPillColor()` ซึ่งเป็น h*31) — ตรวจแล้วว่าสี `style` ของป้ายทุกใบตรงกันทั้งสองฝั่ง

---

## 5. สิ่งที่ live adapter (เฟส B) ต้องทำ — servlet / bean / service ของ Java ที่มี logic จริง

หมายเหตุ: ตามแนวทางโปรเจกต์ (API-only backend, ไม่มี Tomcat/BFF) endpoint ใต้ `/board/*` ต้องถูกแทนด้วย REST ของ Spring/ตัว adapter ฝั่ง Angular — ด้านล่างคือ logic ที่ต้องย้าย/เรียกให้เหมือน

### DrillDown (`GET /board/drilldown?action=data&code=&page=&pageSize=`)
- `spring/servlet/DrilldownApiServlet.java` — รับ parameter, ตอบ `{success, message, data}`
- `manage/content/DrilldownApiService.java` — `findReport`, `findRows/findTotal` (เรียก `/api/v1/drilldown/<apiPath>` พร้อม Bearer), `collectKeys`, `buildColumns` (`planColumns`: คอลัมน์ไม่ตายตัว มาจาก server), `buildRows`, ทะเบียนรายงาน 11 ชุดและพจนานุกรมชื่อคอลัมน์ (`LABELS_*`) — ส่วนทะเบียน/พจนานุกรม generator ดึงมาไว้แล้วใน `drilldown.reports.ts`
- `manage/content/DrilldownMockData.java` — ข้อมูลตัวอย่างของโหมด `drilldown.mock=true` (mock ของเราจำลองให้ตรงจำนวนแถว/ชนิดค่า)
- (bean/view `Drilldown*Bean`, `Drilldown*View` เป็นของหน้าแบบ JSF เดิมต่อรายงาน — ไม่ใช้ในหน้านี้)

### Prospects
| endpoint (หน้า Java เรียก) | ต้นทางใน Java | logic ที่ต้องรักษา |
|---|---|---|
| `GET /board/prospect-list` (`page, perPage, searchText, sortBy, marketingChannelIds, currentCityId, currentDistrictId, salePersonId, enrich=1`) | `manage/content/ProspectListServlet.java` + `ProspectListService.java` | `mapListRow`/`toRowJson` (แถวจาก list **ไม่มี** code/เพศ/อีเมล/โซเชียล → ต้อง enrich), `sortByOf` (คีย์ `contracts.list.sortby.*`), `countryNameOf` (ชื่อประเทศตามภาษา), `avatarSrc` → `/docproxy`, `perPage` ≤ 200, meta `{page, perPage, total, totalPages}` (บางกรณีไม่มี meta → หน้าเลิกโหลดหน้าถัดไปเมื่อได้แถวน้อยกว่า perPage), ผลผิดพลาดเป็น `result.error/errorStatus` |
| `GET /board/prospect-enrich?ids=` | `ProspectEnrichServlet.java` → `ProspectListService.fetchDetails` | ≤ 200 id; เรียก `GET /prospects/{id}/quick-view` ต่อ id (thread pool `contracts.list.enrich.threads` ค่าเริ่มต้น 1), cache ในหน่วยความจำ (`contracts.list.enrich.cache.sec` = 120 วินาที, สูงสุด 500 รายการ); ตอบ `{ "<id>": {code, gender, type, email, line, fb, x, ig, availtime, availchannel, addr, province, country, agent, agentcode, team, recorder, …} }` |
| master data ตัวกรองและ modal: `GET /board/chat-master-data?type=marketing-channels\|employees\|sale-persons\|branches\|products`, `/board/provinces`, `/board/districts?provinceId=`, `/board/sale-persons`, `/board/employees`, `/board/movement-types`, `/board/master/activity-groups?movementTypeId=`, `/board/master/employees-by-activity-group?activityGroupId=` | `ChatMasterDataServlet`, `ProvincesServlet`, `DistrictsServlet`, `SalePersonsServlet`, `EmployeesServlet`, `MovementTypesServlet`, `MasterActivityGroupsServlet`, `MasterEmployeesByActivityGroupServlet` (ทั้งหมดใน `manage/content/`) | รูปคำตอบดูใน `prospects.mock.ts` (`masterAnswer`) — `usesWorkflowStep` ของผลิตภัณฑ์เป็น "ธง" ที่หน้า **ไม่เชื่อ** ถ้า service คืนกลุ่มขั้นตอนมาจริงก็ใช้กลุ่มนั้น (scenario `lead-product-flag-false-but-groups`) |
| `POST /board/lead-create` (`prospectId, movementTypeId, procedureGroupId, employeeId`) | `spring/servlet/LeadCreateServlet.java` | ตรวจ `prospectId`/`movementTypeId` (400), `saleGroupId` ค่าเริ่มต้น 1004400001, สร้าง Lead แล้ว **มอบหมายเจ้าของภายหลังด้วย `PATCH /leads/assign`** → ตอบ `ownerAssigned`/`ownerAssignMessage` (สร้างสำเร็จแต่ผูกเจ้าของไม่สำเร็จ = popup เตือนแยก); error ของ service: `{status, message, error:{code, details}}` |
| `GET/POST/DELETE /board/prospect/attachments` | `manage/content/ProspectAttachmentsServlet.java` | อัปโหลด base64 JSON (`fileName`, ชนิด, ขนาด ≤ ตามหน้า), ลบ, แสดงรายการ; **หมายเหตุ:** `doPost` เรียก DAO ตรง `new SunProspectInfoBoDao().ensureForProspect(pid, "", "")` (เข้า DB โดยไม่ผ่าน REST) — ขัดกับแนวทาง API-only ต้องมี endpoint REST รองรับ |
| `GET /docproxy?url=` | `spring/servlet/DocProxy.java` | proxy ไฟล์เอกสาร/รูปโปรไฟล์ (พรีวิว/ดาวน์โหลด); ตอบ 502 `UPSTREAM_<status>` เมื่อต้นทางไม่พบ |
| คำสั่งของแท็บเอกสาร (`rc_ctLoadDocs`, `rc_ctDeleteDoc`) | `manage/content/ContractView.java`: `loadProspectDocs`, `deleteProspectDocument`, `panelLoadProspectDocs`, `panelDeleteProspectDocument` | จัดรูปรายการเอกสาร (ชนิดจากนามสกุล, ซ่อนรูปโปรไฟล์) — พอร์ตไว้แล้วใน `prospects.docs.ts` (`loadProspectDocs`, `toDocRow`, `docKind`, `collapseHost`); ต้องเรียกบริการลบจริง |
| ค่าที่ EL ใส่ให้ตอน render | `manage/bean/CommonBean.java`: `uploadAcceptExt` (จาก `utils/FileServerAccess.ALLOWED_EXT`), `ssEmployeeId`, `ssousername`, `ss_branch_code` | `uploadAcceptExt` generator สร้างเป็น `prospects.constants.ts`; ค่า session มาจาก `AuthService.session()` |

contract ที่ live adapter ต้อง implement: `ProspectsBackend` (`prospects-backend.ts`: `initial()` + `fetch(url, init)`) และ `DrilldownBackend` (`drilldown-backend.ts`) — URL และรูปคำตอบเหมือนที่ Java เรียกจริง จึงสลับ mock → live ได้โดยไม่แก้ engine

---

## 6. สิ่งที่ยังไม่ได้ทำ / ความเสี่ยง / คำถามถึงเจ้าของระบบ

ยังไม่ได้ทำ
- live adapter ของทั้งสองหน้า (เฟส B) และเอกสาร/สิทธิ์จริง — โหมดไม่ใช่ mock แสดง `<ts-live-missing />`
- ยังไม่ได้ย้าย `opportunity-create-dropdowns.ts` ไป shared (รอหน้าฟอร์มลูกค้า)

ความเสี่ยง / ไม่แน่ใจ
- ข้อ 0.3.3 (`action_type` ใน rule `contracts_master_data`) อาจชนกับการตัดสินใจของ worker หน้าฟอร์มลูกค้า — ต้องตัดสินใจร่วมกัน
- host ของทั้งสองหน้ามี `host: { 'data-java-page': '' }` (ตามคำแนะนำของ coordinator) เพื่อไม่ให้ `button:disabled { cursor: not-allowed }` ของ shell ลงในหน้า — modal "สร้าง Lead" ถูกย้ายไป `<body>` จึงอยู่นอก host; ปุ่มใน modal ที่ disabled (`#clSubmitBtn`) มีกฎของหน้าเองกำหนด cursor อยู่แล้ว (`.ct-cl-ok:disabled { cursor: default }` ความจำเพาะสูงกว่ากฎของ shell) และปุ่มอัปโหลดที่ disabled (`upload-busy-state*`: `cursor: not-allowed` เหมือน Java) identical จึงไม่ต้องมีกฎเพิ่ม (หมายเหตุ: ไม่มี scenario ที่จับ `#clSubmitBtn` ขณะ disabled ระหว่างรอ service — cursor ของมันยืนยันจากการอ่าน CSS เท่านั้น ไม่ได้วัดด้วย harness)
- ข้อ 0.4 เปลี่ยน engine ที่สร้างจาก generator ทุกตัว (เพิ่ม `blob`/`arrayBuffer` ใน `guardResponse`) — ต้องรัน `*:sync` ของหน้าอื่นใหม่และตรวจว่าไฟล์เปลี่ยนเฉพาะส่วนนี้
- timing: รอบแรกของการรันเต็ม 255 scenario (`--jobs 4`) มี 3 ตัวที่พังเพราะเครื่อง (`Navigation timeout`, `protocolTimeout` ของ puppeteer ที่ `lead-open-390`/`lead-open-dark`, และ `en-upload-extension-not-allowed` ต่าง 104 บรรทัดครั้งเดียว) — harness รันซ้ำเดี่ยวอัตโนมัติแล้ว identical ทั้ง 3 ตัว และรัน `en-upload-extension-not-allowed` แยกอีก 3 ครั้งก็ identical ทุกครั้ง (ไม่พบความไม่แน่นอนใน engine/mock; แต่ถ้าเจอซ้ำให้ลด `--jobs`). ก่อนหน้านั้น (`--jobs 5` ตอนเครื่องไม่ว่าง) พบ `fetch failed`, `ERR_ADDRESS_IN_USE`, ปุ่มยังไม่ขึ้น ในลักษณะเดียวกัน
- popup ของ Java มีข้อความไทยฝังตายตัว (ข้อ 0.11)

คำถามถึงเจ้าของระบบ
1. `ProspectAttachmentsServlet` เข้า DB ตรงผ่าน `SunProspectInfoBoDao.ensureForProspect` — จะมี REST endpoint แทนหรือไม่ (เฟส live ต้องใช้)
2. `contracts.list.enrich.threads` ค่าเริ่มต้น 1 (quick-view ทีละเส้น) — ยืนยันว่า REST ใหม่ควรมี endpoint รวม `GET /prospects/quick-view?ids=` เพื่อไม่ต้องยิงต่อ id หรือไม่
3. title ของ popup ที่เป็นไทยตายตัว — ต้องการย้ายเป็น key i18n หรือคงเดิม
4. หน้าชื่อไฟล์ `contracts.xhtml` คือ "รายการลูกค้าเป้าหมาย" (ไม่ใช่สัญญา) — ยืนยันการตั้งชื่อ route `crm/prospects` และ registry id `prospects`
