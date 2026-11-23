# INTEGRATION — หน้า `leads` (โอกาสขาย: Board + List) · เฟส A (mock)

> **อัปเดต 2026-10-21 — เฟส B (live adapter) ของหน้านี้ทำแล้ว: ดู `docs/integration/leads-live.md`.** ข้อความ "ยังไม่มี live adapter / `<ts-live-missing />` / เหลือ REST" ในไฟล์นี้เป็นสถานะของเฟส A (ตารางที่ต้องพอร์ตด้านล่างยังใช้เป็นแผนที่ของ servlet ได้)

workspace: `triple_sale_angular_ws_leads` · route `crm/opportunities` · registry id `leads` · ต้นฉบับ Java: `web/pages/lead.xhtml` + `components/access_pop.xhtml` + `components/lead/filter_modal.xhtml` + `components/move_step_modal.xhtml` + `css/lead.css` + `resources/js/tag_pill_color.js`

> สถานะ: **หน้าใช้งานได้ในโหมด mock; harness เทียบกับหน้า Java จริง 232 scenario เหมือนกันทุกบรรทัด** (ผลละเอียดหัวข้อ 4) · เทสต์ของหน้า 54 ข้อผ่าน · `ng build` production ผ่านไม่มี warning · **live adapter (เรียก REST จริง) ยังไม่ได้ทำ** ตามขอบเขตเฟส A — โหมดไม่ใช่ mock แสดง `<ts-live-missing />` และไม่เรียกอะไร; สิ่งที่ยังไม่ได้ทำ/ไม่แน่ใจอยู่หัวข้อ 7, สิ่งที่ live phase ต้องย้ายอยู่หัวข้อ 8

---

## 0. แก้ไฟล์ shared / infrastructure ใน workspace นี้ (ผู้ประสานงานต้องนำเข้า)

ไฟล์กลุ่มนี้อยู่ในรายการ shared ของ `workspace.mjs` — **`merge --apply` ไม่คัดลอกกลับ** ต้อง merge ด้วยมือ (ก๊อปเฉพาะส่วนที่ระบุ ไม่ต้องก๊อปทั้งไฟล์ — ไฟล์ใน workspace อาจเก่ากว่าของ main)

### 0.1 `tools/compare/lib/runner.mjs` + `tools/compare/run.mjs` — 3 ความสามารถใหม่ของ scenario (backward-compatible; หน้าอื่นไม่ใส่ option = พฤติกรรมเดิม)
| ความสามารถ | ทำไมต้องมี | แก้อะไร |
| --- | --- | --- |
| `opts.user` (เช่น `'viewer'`) | หน้านี้ต่างกันตามสิทธิ์ (ลากการ์ดได้เฉพาะเจ้าของ/Sup; `viewer` ไม่มี `CRM_ContactActivity_Create`) แต่ harness ล็อกอินฝั่ง Angular ด้วย `demo` ครั้งเดียว | `run.mjs`: ล็อกอินบัญชีอื่นที่ scenario ขอครั้งเดียวต่อบัญชี เก็บใน `env.sessions` (ส่งผ่าน `make`); `runner.mjs`: `baseSession = (opts.user && env.sessions?.[opts.user]) \|\| env.session` |
| `opts.storage` (`{ key: value }`) | สวิตช์ของ mock (`ts.mock.leads.config`: ไม่มีผลิตภัณฑ์ / `/board/leads` ตอบ 500 / ช้า / จำกัด perPage) ต้องอยู่ใน sessionStorage **ก่อนเอกสารแรก** | `runner.mjs`: รวม `opts.storage` เข้า `init.session` ที่ `evaluateOnNewDocument` ใส่ (ทั้งสองฝั่ง) |
| scenario คืน `'__RELOAD__'` | ทดสอบ "กลับมาที่หน้าเดิม" — Java เก็บ filter state ใน HttpSession แล้ว restore ตอนโหลดหน้า; scenario โหลดหน้าซ้ำเองไม่ได้ (context ของ scenario หายตอน reload) | `runner.mjs`: ขั้น "รอพร้อม → ตั้งธีม → settle → ฉีด dump" แยกเป็น `boot()`; ถ้า scenario คืน `'__RELOAD__'` → `p.reload()` แล้ว `boot()` ซ้ำก่อน dump |

### 0.2 `src/styles/_swal.scss` — 2 กฎที่ shell ของ Angular ขาด (เจอเพราะ modal "ย้ายขั้นตอน" ขึ้น `crmShowError` = swal ที่มีปุ่ม OK)
ไฟล์นี้อยู่ในรายการที่ `refresh` ดึงจาก main — workspace แก้เพิ่มท้ายไฟล์ (refresh รอบหน้าจะแจ้ง "NOT updated" ให้ merge เอง):
1. `topbar.xhtml` ของ Java มี `<style>` อีกชุดสำหรับ SweetAlert (top bar อยู่ทุกหน้า): `.swal-footer { text-align:center!important; display:flex!important; justify-content:center!important; gap:8px } .swal-button-container { margin:0!important }` — ปุ่มใน footer อยู่กึ่งกลางเรียงข้างกัน; Angular ใช้ค่า default ของไลบรารี (ชิดขวา, block) → dialog ที่มีปุ่ม (ยืนยัน/ผิดพลาด) ต่างจาก Java ทุกหน้า (หน้า report/dashboard ไม่เจอเพราะใช้ toast `buttons:false` ที่ไม่มี footer)
2. `.swal-overlay :is(button, input, textarea) { letter-spacing: normal }` — reset ของ Angular (`button { letter-spacing: inherit }`) ทำให้ปุ่ม swal ได้ 0.36px ของ body; Java = ค่า default ของเบราว์เซอร์ (normal)

### 0.3 บรรทัดที่ต้องเพิ่มในไฟล์ shared อื่น
- `src/app/app.routes.ts` — ใน `IMPLEMENTED` เพิ่ม `leads: { load: () => import('@features/opportunities/leads').then((m) => m.Opportunities) },` (**แก้ใน workspace แล้ว** เพื่อให้ `ng build`/harness เห็นหน้า)
- `src/app/core/navigation/page-registry.json` — id `leads`: `"implemented": true` (แก้ใน workspace แล้วเช่นกัน; เทสต์ `page-registry.spec` ตรวจคู่กับ `IMPLEMENTED` — รันผ่าน)
- `package.json` — scripts: `"opportunities:sync": "node tools/sync-opportunities.mjs"`
- `src/app/core/navigation/java-links.spec.ts` — เพิ่ม `it('hands the workflow group of the board on to the lead page …')` (2 assertion). **ไม่ต้องแก้ `java-links.ts`**: rule `lead_detail` ที่มีอยู่เก็บ `activityGroupId` ใน query อยู่แล้ว (`lead_detail.face?…&param_lead_id=42&activityGroupId=101` → `/crm/opportunities/42?activityGroupId=101`); spec นี้ล็อกพฤติกรรมไว้ (หน้านี้พึ่งมัน)
- `CLAUDE.md` — เพิ่ม bullet + `npm run opportunities:sync` ในบรรทัด "คำสั่ง" (ข้อความหัวข้อ 9)
- `README.md` — แก้แถว `tools/` + แถว feature (หัวข้อ 9)
- `manual/index.html` — เพิ่มหัวข้อจาก `manual-leads.html` (ชิ้นส่วน HTML ตามแบบ §24 Dashboard; `id="leads"`, เลข `NN` ให้ผู้ประสานงานกำหนด) + ลิงก์ในสารบัญ
- i18n: **ไม่มี key ใหม่** — ทุกข้อความของหน้ามาจาก key เดิมของ Java (generator ตรวจว่าทุก key มีใน `th.json`/`en.json` และข้อความไม่มีอักขระที่ทำให้ source พัง); ข้อความ `<ts-live-missing />` ใช้ `app.live.*` ที่มีอยู่

## 1. ไฟล์ที่เพิ่ม (`merge --apply` คัดลอกกลับได้)

```
tools/sync-opportunities.mjs                                                generator
tools/compare/pages/opportunities/{page.mjs,scenarios.mjs}                  harness (232 scenario)
src/app/features/opportunities/leads.html · leads.scss · leads.engine.ts    สร้างโดย generator — ห้ามแก้ด้วยมือ
src/app/features/opportunities/leads.ts · leads-view.ts                     route component (ts-opportunities) + host (ts-opportunities-view)
src/app/features/opportunities/leads-backend.ts                             สัญญา backend
src/app/features/opportunities/leads.mock.ts                                backend จำลอง (framework-free)
src/app/features/opportunities/leads.spec.ts · leads.mock.spec.ts          เทสต์ (16 + 38 ข้อ)
public/assets/java-js/tag_pill_color.js                             ตรงทุกไบต์กับ resources/js/tag_pill_color.js
public/assets/images/icon/fi_*.svg (14 ไฟล์)                         ตรงทุกไบต์กับ web/images/icon/ (ไอคอนที่หน้าใช้)
public/assets/images/lead/fi_tag_*.svg (8 ไฟล์)                      ตรงทุกไบต์กับ web/images/lead/ (ไอคอนช่องทางใน modal ย้ายขั้นตอน)
manual-leads.html · INTEGRATION.md
```
`default_avatar.svg` ใช้ของเดิมที่ chat คัดลอกไว้ที่ `public/assets/images/default_avatar.svg` (generator ตรวจว่าตรงกับ `web/images/icon/default_avatar.svg` ทุกไบต์)

## 2. generator — `node tools/sync-opportunities.mjs`

อ่าน `lead.xhtml` ด้วย `uiDefines` → `expandIncludes` (วาง 3 include ตามที่ Facelets ทำ) → `splitSection` ได้ **5 `<script>`** (skeleton toggle · สคริปต์หน้า ~137 KB · access_pop · filter_modal · move_step_modal) + 2 `<style>` + `lead.css` + markup ~44 KB. ทั้ง 5 บล็อกวางใน `startOpportunities(env)` ตามลำดับที่เบราว์เซอร์รันใน Java (เดิมใช้ global scope ร่วมกัน — ตอนนี้สื่อสารผ่าน `window.*` เหมือนเดิม)

ความปลอดภัย: swap ไม่เจอ/เจอซ้ำ = หยุด · ตัวตรวจท้าย: ไม่มี EL เหลือ · ไม่มี XHR/localStorage/sessionStorage/cookie/`sendBeacon`/`window.location`/`window.open` · `setInterval` มีตัวเดียว (auto-scroll ขอบบอร์ด) และต้องมี clean-up · ลิงก์ `.face` มีแค่ที่ `ldSelectLead` (→ `env.navigate`) · global ระดับบนของสคริปต์หน้าต้องเป็น 7 ตัวที่รู้จักเท่านั้น (ตัวใหม่ = หยุด) · ทุก `onclick="window.xxx()"` ใน markup ต้องมีสคริปต์ที่ publish จริง · ข้อความทุก key ต้องมีใน th/en และไม่มี `' " \ < > &` · `undeclaredNames` (module strict) — allow-list: `TsPhone`, `odsProspectSuggest`, `crmShowError`, `crmErrText` (global ที่ shell/ไฟล์ Java ให้ — ใน Java ก็เป็น window property), `SAVED_FILTER` (ใน skeleton toggle ใช้ `typeof` ตรวจ — **ใน Java ก็หาไม่เจอ** เพราะเป็นตัวแปรใน IIFE ของสคริปต์หน้า → skeleton toggle ไม่เคยทำงานจริง; คงไว้ตามต้นฉบับ) · สคริปต์ที่สร้างต้อง parse ผ่าน · รันซ้ำแล้วไฟล์ไม่เปลี่ยน (ตรวจด้วย md5)

| ต้นฉบับ Java | ใน Angular |
| --- | --- |
| `#{commonBean.msg['k']}` ใน markup | `{{ t('k') }}` / `[attr.x]="t('k')"` ; ในสตริง JS → `' + env.t("k") + '` |
| `#{leadBoardView.hasLeadViewAccess}` · `#{commonBean.hasFeature('CRM_ContactActivity_Create[_Sup]')}` | `env.can('CRM_Lead_View')` · `env.can('CRM_ContactActivity_Create[_Sup]')` (`PermissionService.has`, รวม super admin) |
| `#{commonBean.ssEmployeeId}` | `env.employeeId` (= `session.employeeId`) |
| `#{leadBoardView.savedFilterJson}` | `env.initial("savedFilterJson")` ← `OpportunitiesBackend.initial()` |
| `contextPath: '#{request.contextPath}'` (odsProspectSuggest) | `contextPath: env.ctx, fetch: env.fetch` → การ์ดแนะนำใต้ช่องค้นหาไป backend เดียวกับหน้า |
| `fetch(` | `env.fetch(` |
| `navigator.sendBeacon('../board/filter-state', Blob)` | `env.beacon('../board/filter-state', json)` (host → `backend.fetch` POST) |
| `window.location.href = 'lead_detail.face?…&param_lead_id=…[&activityGroupId=…]'` | `env.navigate(url)` → host `javaLinkToRoute(url)` → `router.navigateByUrl` (`/crm/opportunities/:id?activityGroupId=`) |
| `window.location.reload()` (move-step modal เมื่อไม่มี onSuccess — ใช้จริงเฉพาะเส้นทาง mock เดิมที่ตายแล้ว) | `env.reload()` |
| `document.addEventListener` · `setTimeout` | `listen(document, …)` · `tmo(…)` |
| `setInterval` ของ auto-scroll ขอบบอร์ด | เหมือนเดิม + `__cleanups` เคลียร์ใน destroy |
| `if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',…)}` | `readyState` / `onReady(…)` ของ scaffold (สคริปต์ Java ทำงานตอนเอกสารยัง "loading" — scaffold เล่น `DOMContentLoaded` หลังทั้ง 5 บล็อกทำงานครบ) |
| global ของสคริปต์ (`CAN_*`, `LEAD_MY_EMPLOYEE_ID`, `ldCanMoveLead`, `ldBoardOwnerMatches`) และ `window.xxx = …` อีก 24 ชื่อ (`ldSelectLead`, `ldShowAccessPop`, `ldOpenMoveStep`, `ldInitFilter`, `_ldMsCtx` …) | publish บน `window` เหมือน Java (inline handler `onmouseenter="… LEAD_MY_EMPLOYEE_ID"` และ `window[gateKey]` ของ move-step modal อ่านจาก global) และลบตอน destroy |
| `../images/…` · `#{request.contextPath}/images/…` | `assets/images/…` (`default_avatar.svg` ที่ `assets/images/` ชั้นเดียว) |
| `--fs-adj` · `body[data-theme="dark"]` | `--ts-fs-adj` · `html[data-theme='dark']` |
| `#crm_main_body_page{padding:0!important;background:#F0F2FF!important}` + dark | `#crm_main_body_page:has(.ld-root)` (กล่องเนื้อหาเป็นของ shell ใช้ร่วมทุกหน้า) |
| `<script src=…/tag_pill_color.js>` | host `loadScript('assets/java-js/tag_pill_color.js')` ก่อนเริ่ม engine |
| `<script src=…/phone_format.js>` | `window.TsPhone` ของ shell (`core/dom/phone-format.ts` สร้างจากไฟล์เดียวกัน) — host ตั้งให้ถ้ายังไม่มี |

CSS global ของ stack Java: บล็อก "Angular adaptation" จาก `adaptation()` ขอบเขต `:where(ts-opportunities-view, #ldAccessPop)` (popover ถูกย้ายไป `.ld-col-body`/`<body>` ตอนแสดง จึงต้องมีขอบเขตที่ตามมันไปด้วย) + `dark_mode.css` ของ Java เฉพาะ 30 กฎที่แตะหน้านี้ ต่อท้ายหลัง CSS ของหน้า (ตามลำดับที่ template.xhtml โหลด). `leads.scss` ~80 KB (งบ component style 140 KB)

## 3. host / backend / mock

- `leads.ts` (`ts-opportunities`): `mock=false` → `<ts-live-missing />` (ไม่เรียกอะไร) ; เปลี่ยนภาษา = สร้าง `ts-opportunities-view` ใหม่ (Java `location.reload()` — ข้อความของสคริปต์อ่านจาก bundle ครั้งเดียวตอนเรนเดอร์)
- `leads-view.ts` (`ts-opportunities-view`; ViewEncapsulation.None · preserveWhitespaces · OnPush): โหลด mock (chunk แยก) + `loadHelpers()` (protected เพื่อให้ spec แทนที่ได้), `backend.initial()`, `detectChanges()`, สร้าง `OpportunitiesEnv`, `startOpportunities(env)`; `DestroyRef` → `stop()`; มีคอมเมนต์ระบุ live adapter = งานถัดไป + servlet ที่ต้องย้าย
- `leads-backend.ts`: `initial()` (= สิ่งที่ `LeadBoardView` ฝังด้วย EL) · `fetch(url, init)` (URL เดียวกับที่หน้า Java เรียก BFF)
- `leads.mock.ts`: ข้อมูลชุดเดียวจาก `seedLead(n)` (240 ลีด, พนักงาน E101–E108 = id 1001–1008 ตรงกับบัญชี demo) แจกเป็น 4 ผลิตภัณฑ์ — A: workflow 5 กลุ่ม · B: 3 กลุ่ม · C: ไม่มี workflow (3 คอลัมน์; คอลัมน์แรก 32 ใบ = 2 หน้า) · D: กลุ่มเดียว. ตัวกรอง/ค้นหา/เรียง/แบ่งหน้าต่อคอลัมน์/ย้ายการ์ด (+กฎเจ้าของ/Sup → 403) ทำงานจริง; **filter state และการย้ายเก็บใน `sessionStorage`** (= HttpSession; คงอยู่เมื่อโหลดหน้าซ้ำ, หายเมื่อปิดแท็บ); ชื่อจังหวัด/เขต/ประเทศตามภาษา UI (เหมือน `LeadsBoardServlet.localizeLocationNames`); ไม่มี `CRM_Lead_View` → `[]`
  - สวิตช์ทดสอบ (ไม่มีใน Java): config `{noProducts, failLeads, emptyBoard, maxPerPage, delayMs}` จาก options หรือ `sessionStorage['ts.mock.leads.config']`; โน้ต `!fail` ในหน้าย้ายขั้นตอน = ตอบ 500 (ดู error dialog)

## 4. ผลตรวจเทียบ — `node tools/compare/run.mjs leads` (ทำซ้ำได้)

harness สร้างหน้า Java **จริง** — `lead.xhtml` + 3 include วางตามที่ Facelets ทำ, EL แทนค่าเหมือน server (ข้อความจาก th/en.json, สิทธิ์ของบัญชี, employee id, `savedFilterJson` จาก state ของ session), สคริปต์ 5 บล็อกและ `<style>` ตัวจริงตามลำดับจริง, `lead.css` ลิงก์ที่ head ตามตำแหน่ง `<ui:insert name="head"/>` ของ template (ก่อน `project_layout6/support/dark_mode.css`), `phone_format.js` / `tag_pill_color.js` ตัวจริง — ใน shell replica ที่ `/triplesale/pages/lead.html` (ให้ `../board/…` `../css/…` `../images/…` resolve เหมือนเดิม) ; ทุก call ของหน้า (`/triplesale/board/*`) และ master ประเทศของ `phone_format.js` ตอบจาก **mock ตัวเดียวกับที่หน้า Angular ใช้** (`leads.mock.ts` / `core/http/mock-countries.ts`) ; แต่ละ scenario ได้ backend ใหม่ (คนละ module instance) ; dump = DOM + attribute + ข้อความ + ตำแหน่ง/ขนาด + computed style ของ `.ld-root`, dialog ตัวกรอง, popover, modal ย้ายขั้นตอน, `.swal-overlay`, แผง `.ods-list`

**ผลรอบสุดท้าย (โค้ดสุดท้าย, build ใหม่, รัน 4 ชุดต่อกัน `--jobs 4`): 232 scenario × 2 ฝั่ง — เหมือนกันทุกบรรทัด 232/232, ไม่มี `ready-timeout`, ไม่มี `pageerror`, ไม่มี scenario error** (รายงานเบราว์เซอร์มีเฉพาะ HTTP 500 ที่ scenario สั่งให้เกิดเอง: `fail-leads*` / `dnd-modal-save-fail*` / `en-dnd-modal-save-fail`)

| กลุ่ม | scenario |
| --- | --- |
| หน้าแรก | `overview` สว่าง/มืด × 390 · 768 · 1024 · 1280 · 1920 × ไทย/อังกฤษ · `list` (Board↔List) ชุดเดียวกัน · viewer (ไม่มีสิทธิ์ลาก) · ปุ่ม A A A ±2px ทั้ง Board, List, dialog ตัวกรอง, WF Step, dark (8) |
| ผลิตภัณฑ์/กลุ่ม | dropdown ผลิตภัณฑ์ (A, B, C ไม่มี workflow, D กลุ่มเดียว → pill disabled), dropdown กลุ่ม (เลือก AN/LS/LE), List ของแต่ละผลิตภัณฑ์, สลับ Lead Status ↔ WF Step + ลูกศร ‹ ›, 🏷 disabled เมื่อไม่มี workflow/เปลี่ยนไป C ตอนอยู่ WF Step, ปิดด้วยคลิกนอก |
| เรียง/ค้นหา | เรียงทั้ง 5 แบบ (Board + List), ค้นหา: เปิด, พิมพ์ → การ์ดแนะนำ → เลือก, ปุ่ม, Enter, ไม่พบ (board/list), ✕, Esc, restore |
| ตัวกรอง (60) | เปิด (สว่าง/มืด/390/768/1920/อังกฤษ/List WF/List ไม่มี WF), สวิตช์สถานะปิด → ตัวเลือกเปลี่ยน, แท็ก (เลือก 2–3/ทั้งหมด/ค้นหา/chip ✕/ปิดนอก), จังหวัด → อำเภอ (+กลับเป็นทั้งหมด), ช่วงวันที่ (+ปฏิทินกลาง), กลุ่มขั้นตอน → ขั้นตอน (List), ปิดด้วย ✕/คลิกนอก, เปิดใหม่ค่ากลับเป็นที่กรองอยู่, ล้าง, กรองทุกช่อง (ผู้รับผิดชอบ, ทีมขาย, จังหวัด+อำเภอ, สถานะ, วันที่, แท็ก, ปิดแล้ว, ผลลัพธ์ว่าง) + badge นับตัวกรอง |
| การ์ด/popover | ขยาย/ย่อ (สว่าง/มืด/390/อังกฤษ), เปิดลีด (Board, กลุ่ม AN, ผลิตภัณฑ์ไม่มี workflow, แถว List, viewer — เทียบเลขลีด + `activityGroupId` ที่ส่งไป), ขยายแล้วไม่ไปหน้าลีด, popover ผู้มีสิทธิ์ (ปกติ/มืด/ฉัน/ปิด ✕/ปล่อยเมาส์/คอลัมน์สุดท้าย/viewer/390/อังกฤษ) |
| ลาก-วาง (26) | hover คอลัมน์ปลายทาง, ลาก → modal (สว่าง/มืด/390/768/อังกฤษ/ไม่มี workflow), เลือกช่องทาง + โน้ต, ยกเลิก/✕/คลิกนอก, บันทึก (WF, ไม่มี WF), กำลังบันทึก, บันทึกไม่สำเร็จ (500 → dialog), คอลัมน์เดิม/คอลัมน์สุดท้าย, ย้ายสองครั้ง, viewer ลากไม่ได้, การ์ดที่ปิดแล้ว (`draggable=false`), auto-scroll ขอบบอร์ด |
| เลื่อนโหลด (21) | เลื่อนสุดคอลัมน์ → หน้า 2 (สว่าง/มืด/กำลังโหลด/สองรอบ/ตอนมีคำค้น), List เลื่อน → append (+ไม่มี WF/มืด/กำลังโหลด/เลื่อนข้าง), auto-fill 1 หน้า + ปุ่ม "โหลดเพิ่ม" (+คลิก/มืด/List), ลากเลื่อนบอร์ด/ตาราง (+คลิกที่จบการลากถูกกลืน/คลิกถัดไปเปิดลีด) |
| skeleton/ว่าง/ผิดพลาด (19) | skeleton โหลดครั้งแรก (สว่าง/มืด/390), คลุมเฉพาะเนื้อหา (List/เรียง/มืด), board ว่าง, List ว่าง, ไม่มีผลิตภัณฑ์ (+WF toggle/มืด/อังกฤษ), `/board/leads` ตอบ 500 (board/list) |
| ความจำของ session (11) | โหลดหน้าซ้ำ (`__RELOAD__`) หลังตั้ง: แท็บ List + เรียง (+มืด/อังกฤษ), ค้นหา, ผลิตภัณฑ์ + กลุ่ม, ผลิตภัณฑ์ไม่มี WF, ตัวกรองครบ, ตัวกรองที่เปิด dialog ดู, ปิดแล้ว, การ์ดที่ย้ายแล้ว, กลุ่ม/ขั้นตอนของ List |

ภาพรวมตามมิติ: สว่าง/มืด 37 · ไทย/อังกฤษ 20 (ขึ้นต้น `en-`) · 390px 16 · 768px 4 · 1024px 2 · 1920px 3 · A A A 8

## 5. ความต่างที่ตั้งใจ / ที่เป็นของสภาพแวดล้อม (ไม่ใช่ของหน้า)

1. **เส้นทางรูป**: Java `../images/…`, `/triplesale/images/…` ↔ Angular `assets/images/…` (ไฟล์เดียวกันทุกไบต์); `default_avatar.svg` ↔ `assets/images/default_avatar.svg` ชั้นเดียว (ตามที่ shell/chat ทำ) — `normalize` ใน `page.mjs` + normaliser กลางของ harness
2. **ลิงก์ไปรายละเอียดลีด**: Java ออกจากหน้าไป `lead_detail.face?…&param_lead_id=N&activityGroupId=G`; Angular `router` ไป `/crm/opportunities/N?activityGroupId=G` — scenario `*-nav` ขวางการออกจากหน้าแล้วเทียบ (N, G) ที่ทั้งสองฝั่งเลือกได้ตรงกัน (ทั้งตอนมีกลุ่ม, ผลิตภัณฑ์ไม่มี workflow ที่ไม่ส่ง `activityGroupId`, แถวใน List, ผู้ชม)
3. **HttpSession → sessionStorage**: `POST /board/filter-state` / `savedFilterJson` (หัวข้อ 3, 8)
4. **`.ods-list`**: แผงรายการ dropdown กลางที่ถูก append ที่ `<body>` เรียงต่างกัน (Java: แผงของช่องค้นหาถูกสร้างตอน `DOMContentLoaded` ก่อนที่ `open_down_select.js` จะครอบ `<select>`; Angular: shell ครอบ select ตอน template ถูกสร้าง ก่อน engine เริ่ม) — เป็นแค่ลำดับ node ที่ซ่อนอยู่ ไม่มีผลต่อหน้าจอ; harness จึงเทียบ `.ods-list.ods-ac` กับ `.ods-list:not(.ods-ac)` แยกกัน (เนื้อหาเทียบครบ)
5. **ภาษาอังกฤษของ shell replica**: replica ของ Java สร้างเมนู/สคริปต์ template จาก bundle ไทยอย่างเดียว — `page.mjs` สร้าง `ODS_I18N` / `INPUT_GUARD_I18N` ตามภาษาของ request ให้ dropdown กลางเป็นอังกฤษเหมือน Angular (เมนู/topbar ไม่อยู่ใน dump ของหน้า)
6. **dialog ของ SweetAlert** (error ตอนบันทึกไม่สำเร็จ): ใช้ไลบรารีตัวจริงทั้งสองฝั่ง; ที่ต่างกันเดิม 2 กฎอยู่ใน `_swal.scss` (หัวข้อ 0.2 — แก้แล้ว)
7. **A A A**: scenario ตั้ง `--fs-adj` และ `--ts-fs-adj` ตรง ๆ เหมือน Dashboard; ถ้าตั้งแล้วอ่าน layout ภายใน ms เดียวกัน (เช่นหน้า List วัด `offsetTop` ของ skeleton) Angular ยังเห็นค่าเก่า เพราะ `_base.scss` ของ shell ตั้ง `transition-duration: .01ms` ให้ทุก element → scenario จึงรอ 300 ms หลังตั้ง (ผู้ใช้กดปุ่มแล้วกดอย่างอื่นไม่ทันใน 1 เฟรมอยู่แล้ว)
8. **scrollbar ของ document**: ตามที่ README ของ harness บอก — scenario ที่เลื่อนจึงเลื่อน element ของหน้าเอง (`#ldBoardContent`, `.ld-col-body`, `.ld-list-wrap`) ไม่ใช้ `scrollIntoView` (ไปเลื่อน document ของ replica / กล่องของ shell ต่างกัน)
9. **ลากการ์ด**: harness ยิง `DragEvent` จริง (dragstart บนการ์ด, dragover/drop บนคอลัมน์, dragend) ให้ listener ของหน้าทำงาน — เซสชันลากของเบราว์เซอร์ (ภาพ ghost ที่เมาส์ลาก, cursor) ไม่ได้ถูกทดสอบ (ส่วนนั้นเป็นของ Chrome)

## 6. ทดสอบ / build

- `CI=1 node node_modules/@angular/cli/bin/ng.js test --no-watch --include 'src/app/features/opportunities/**/*.spec.ts'` → **2 ไฟล์ 54 ข้อผ่าน** (`leads.mock.spec.ts` 38: รูปคำตอบของทุก endpoint, ตัวกรอง/ค้นหา/เรียง/แบ่งหน้าต่อคอลัมน์, เพดาน perPage, ภาษา, สิทธิ์/สวิตช์, filter state คงอยู่, ย้ายการ์ด + กฎเจ้าของ + ข้อผิดพลาด, การ์ดแนะนำ, รูปแบบ URL · `leads.spec.ts` 16: markup, หน้าแรกจาก backend, ผลิตภัณฑ์ไม่มี workflow, List + เลื่อนโหลด, ค้นหา + empty state, เปิดลีด (ไป route พร้อม `activityGroupId`), ไม่มีสิทธิ์ดู, draggable ตามเจ้าของ/Sup, ลาก → modal → ยกเลิก/บันทึก, filter state คืนตอนกลับมา, dialog ตัวกรอง + badge, จังหวัด→อำเภอ + ล้าง, เปลี่ยนภาษา = หน้าใหม่, โหมดไม่ใช่ mock, **ออกจากหน้าแล้วไม่มี window name/listener/popover/CSS variable ค้าง**, response ที่มาหลัง destroy ไม่วาดอะไร)
  - jsdom รัน inline handler (`onclick="window.ldSelectLead(…)"`) ใน realm ของตัวเอง ที่มองไม่เห็นชื่อที่ engine ใส่บน `window` ของเทสต์ — spec จึงรันค่า attribute ด้วย `new Function` ใน realm เดียวกับ engine (`inline()` ใน `leads.spec.ts`); การที่ markup เรียกชื่อที่มีจริงตรวจโดย generator และ harness (เบราว์เซอร์จริง)
- เทสต์ส่วนที่ใช้ร่วม: `src/app/core/navigation/**` 4 ไฟล์ 23 ข้อผ่าน (รวม `page-registry.spec` ที่ตรวจ `IMPLEMENTED` กับ `implemented: true`, และ `java-links.spec` ที่เพิ่มข้อใหม่)
- `ng build` (production) ผ่าน **ไม่มี warning/error**; chunk `leads` 177 KB (ส่ง 31 KB), mock เป็น chunk แยก; `leads.scss` ~80 KB ต่ำกว่างบ component style 140 KB; งบ initial ไม่เปลี่ยน (หน้านี้ lazy)
- ไม่ได้รันเทสต์ทั้งโปรเจกต์ (ตามคู่มือ — ผู้ประสานงานรันหลัง merge)

## 7. สิ่งที่ยังไม่ได้ทำ / ไม่แน่ใจ

- **live adapter (เฟส B) ไม่มี** — ขอบเขตเฟสนี้; โหมดจริงแสดง `<ts-live-missing />`
- **ไม่ได้ลองกับ backend จริง/UAT** (ห้ามตามคู่มือ) — รูปคำตอบของ `/board/leads` ฯลฯ อ่านจากโค้ด servlet + `docs/analysis/03` + สิ่งที่หน้า Java อ่าน; field ที่ backend ส่งจริงแต่หน้าไม่อ่าน mock ไม่มี. `LeadListItemResDTO` ที่ apidocs ไม่ครบ (เช่น `currentDistrictName`, `currentCountryName`) หน้าอ่านแบบ optimistic — mock ส่งให้ครบ ซึ่งจริงอาจไม่มา (หน้าทนได้: ว่าง = ไม่แสดง)
- **ความหมายที่ mock "ตัดสินเอง"** (ต้องยืนยันกับ backend ตอนทำ live — คำถามหัวข้อ 8.3): `showClosed`, ขอบเขตของ `statusSummary`/`wfStepSummary.count`, กลุ่มเริ่มต้น, เพดาน `perPage`, การเรียงตาม `status`, ช่วงวันที่ใช้ field ไหน (mock ใช้วันที่สร้าง/`txDate`)
- **รูปลูกค้า `http(s)://`** ผ่าน `../docproxy?url=` (กัน mixed-content) — โค้ดคงไว้ตามต้นฉบับ แต่ mock ไม่มีรูปแบบนี้ (ไม่มีรูปลูกค้า = default avatar) และ Angular ไม่มี `/docproxy` → ไม่ได้ทดสอบเส้นทาง `isLinkUrl()`/`proxyImg()`; ตอนทำ live ต้องตัดสินใจ (โหลดตรง / proxy ของ gateway)
- **สายลาก-วางด้วยเมาส์จริง** ใน Chrome ไม่ได้ทดสอบ (harness ยิง DragEvent — ดูหัวข้อ 5.9); touch screen ไม่ได้ทดสอบ (Java ก็ใช้ native DnD + `overflow` ธรรมดา)
- **harness ใช้ Chrome headless + shell replica** ของ Java (เมนู/topbar สร้างจาก Facelets+CSS จริง ไม่ใช่ Tomcat จริง) — ไม่ได้เปิดดูด้วยตาในเบราว์เซอร์ของมนุษย์
- `NAV` ของ scenario ที่ออกจากหน้า: Angular ไปที่ `MigrationPlaceholder` ของ `crm/opportunities/:id` (หน้านั้นยังไม่ถูกพอร์ต)
- **ข้อสังเกตจากต้นฉบับ Java (คงไว้ตามต้นฉบับ ไม่ได้แก้ — เจ้าของระบบอาจต้องการแก้ที่ต้นทาง)**: (1) การ์ดของผลิตภัณฑ์ที่ **ไม่มี workflow** เปิดหน้า lead_detail พร้อม `activityGroupId` ของกลุ่มที่เคยเห็นล่าสุดจากผลิตภัณฑ์ workflow (`CUR_AGID_EFF` ไม่ถูกล้างเมื่อคำตอบไม่มี `activityGroupId`) — scenario `card-click-nav-nowf` ยืนยันว่าทั้งสองฝั่งทำเหมือนกัน (`group=101`); (2) skeleton toggle ตัวแรกไม่เคยทำงาน (`SAVED_FILTER` เป็นตัวแปรใน IIFE) (ไม่มีผลที่เห็น: `showSkeleton()` ปรับโครง skeleton ย่อยตามแท็บให้อยู่แล้ว); (3) `renderBoard` / `renderList` / `moveLead` / `DEFAULT_COLS` (ยุค mock) ไม่มีทางถูกเรียกด้วยข้อมูลจริงแล้ว — ยังอยู่ในสคริปต์เพราะ generator ไม่ตัดโค้ดของต้นฉบับ
- harness เคยล้มกลางคันหนึ่งครั้ง (`Target closed` — Chrome ถูกปิดจากภายนอกระหว่าง worker หลายตัวรัน compare พร้อมกัน) → แบ่งรันเป็น 4 ชุดต่อกัน (`--jobs 4`) ในรอบสุดท้าย

## 8. servlet / bean / service ที่ **live adapter (เฟส B) ต้องย้าย**

หน้าเรียก URL เหล่านี้ผ่าน `env.fetch` (ที่อยู่ relative แบบ Java: `../board/…`); live adapter ตอบ `Response` รูปเดียวกัน ย้ายตรรกะของ servlet เป็น TypeScript แล้วเรียก `triplesale-service` ตรงด้วย `HttpClient` (Bearer จาก interceptor)

### 8.1 endpoint และตรรกะที่อยู่ใน Java
| URL ที่หน้าเรียก | Java | ตรรกะที่ต้องทำซ้ำ |
| --- | --- | --- |
| `GET ../board/leads?viewMode=board\|list&movementTypeId&activityGroupId&activityStepId&search&showClosed&dateRangeType=custom&dateFrom&dateTo&provinceId&districtId&activeStatus&saleGroupId&employeeId&tagIds=csv&sortBy&page&perPage` | `LeadsBoardServlet` → `LeadBoardView.fetchLeadsJson` | **ไม่มี role `CRM_Lead_View` → ตอบ `[]` ไม่เรียก backend** · ส่ง param ต่อไป `GET /triplesale-service/api/v1/leads?viewMode=…` (ว่าง = ไม่ส่ง; default viewMode=board, sortBy=txdate_desc, page=1, perPage=20; `search` URL-encode; `salePersonId` ไม่ส่งแม้ bean รองรับ) · แกะ envelope: `status==200 && result` → ส่ง `result` ตรง ๆ, ไม่เช่นนั้น `[]` (HTTP 200); exception → `[]` + 500 · **`localizeLocationNames`**: UI อังกฤษ → แปล `currentCityName`/`currentDistrictName` ด้วย `MasterDataI18n.translateProvince/translateDistrict(code,name)` (ไม่มี mapping = คงไทย); UI ไทย → แปล `currentCountryName` ด้วย `translateTh(currentCountryCode, name)` — ทำกับ `leads.items[]` และ `kanban[].items[]` (ในแอป Angular ใช้ `I18n.master()` + `master-data.{th,en}.json`) |
| `GET ../board/master/movement-types?type=LD` | `MovementTypeServlet` | `GET master-data/movement-types/{type}` (default LD) ส่ง envelope ดิบ; ว่าง → `{"status":204,"message":"no content","result":{"items":[]}}`; พลาด → 500 `{status:500,message}`. หน้าอ่าน `result.items` / `result[]` / array. **ผู้ใช้ไม่มีสิทธิ์ผลิตภัณฑ์ใดเลย → `[]`** (หน้าซ่อน dropdown และบังคับไม่มี workflow) |
| `GET ../board/{tags,sale-groups,provinces,employees}` · `GET ../board/districts?provinceId=` | `TagsServlet` · `SaleGroupsServlet` · `ProvincesServlet` · `EmployeesServlet` · `DistrictsServlet` → `LeadBoardView.fetchMasterArrayJson(path)` | เรียก `master-data/tags?key=` · `master-data/sale-groups` · `master-data/provinces` · `master-data/employees[?saleGroupId=]` · `master-data/districts?provinceId=`; แกะ `result[]` แล้ว normalize ผ่าน `MasterDataItemBean` เป็น `{id, code, name, nameTh, colorCode, attachFile, postCode[, employee]}`; พลาด/ว่าง = `[]`. **จังหวัด**: `keepThaiProvincesOnly` (เฉพาะชื่อไทยล้วน + ตัด code ซ้ำเก็บ id สูงกว่า — backend ส่งเมืองต่างประเทศปนมา ~2,659/2,739 แถว) + cache ใน session |
| `GET\|POST ../board/filter-state` · ค่า `savedFilterJson` ของ bean | `FilterStateServlet` · `LeadBoardView.init()` | HttpSession key `ld_filter_state`: POST เก็บ body ที่ไม่ว่าง (204), GET คืนข้อความหรือ `null`; bean อ่านมา inject ตอนเรนเดอร์. ไม่มี BFF แล้ว → เก็บฝั่ง browser (`sessionStorage`, ควรแยกตามผู้ใช้) — mock ทำแบบนี้แล้ว |
| `POST ../board/contact-activities` `{leadId, channel, content, procedureGroupId?, procedureId, workRecordDate?}` | `ContactActivitiesServlet` (+ `ContactChannel`) | body ไม่ใช่ JSON → 400 `{"error":"invalid json body"}`; ไม่มี `leadId` → 400 `{"error":"leadId required"}`; ตัด `leadId` ออกจาก body; **`channel` snake_case → ป้าย o2o** (`ContactChannel.toO2oLabel`: `call_out`→"Call Out" …); `POST /triplesale-service/api/v1/leads/{leadId}/contact-activities`; ส่งสถานะและ body ของ backend กลับตรง ๆ (หน้า: `res.ok` → ปิด modal + refresh เงียบ; ไม่ ok → `crmErrText(body)` ใน dialog). **การย้ายคอลัมน์บน board = การบันทึกการติดต่อพร้อม `procedureId` ของขั้นตอนปลายทาง** |
| `GET /triplesale/board/prospect-list?page=1&perPage=8&enrich=1&searchText=` | `ProspectListServlet` → `ProspectListService.fetchPage` | การ์ดแนะนำใต้ช่องค้นหา (`odsProspectSuggest`): `{status, message, result:{items:[{id,code,name,phone,addr,avatar}], meta}}`; `enrich=1` เติมรายละเอียดรายแถวก่อนตอบ; `avatarSrc` ทำ URL รูปผ่าน proxy; พลาด → 500 `{status,message}` |
| `GET {apiBase}/board/chat-master-data?type=countries` | `ChatMasterDataServlet` | master ประเทศ + รหัสโทร + รูปแบบเบอร์ สำหรับ `TsPhone` (shell: `PhoneFormat` — โหมด live ต้องเรียก `master-data/countries` ตรง; Java cache ใน session + เติมชื่อไทย) |
| `GET ../docproxy?url=` | `DocProxy` | proxy รูปลูกค้า/ผู้มีสิทธิ์ที่เป็น `http(s)://` (กัน mixed-content) — ดูหัวข้อ 7 |
| `#{leadBoardView.hasLeadViewAccess}` | `LeadBoardView.isHasLeadViewAccess` | `SessionRoles.hasRole("CRM_Lead_View")` → `PermissionService.has('CRM_Lead_View')` (ทำแล้ว) |
| `#{commonBean.hasFeature('CRM_ContactActivity_Create[_Sup]')}` · `#{commonBean.ssEmployeeId}` | `CommonBean` | `PermissionService.has` · `session.employeeId` (ทำแล้ว) |

### 8.2 รูปคำตอบของ `/board/leads` ที่หน้าอ่าน (ไว้ตรวจ live adapter)
`{ id (movementTypeId), activityGroupId, usesWorkflowStep, statusSummary:{total,new,success,lost,inactive,active:{total,hot,warm,cold}}, wfStepSummary:[{id,code,name,count}], kanban:[{stepId|id|procedureId|activityStepId, stepName, items[], meta:{page,perPage,total,totalPages}}], leads:{items[], meta} }` — board ใช้ `kanban`, list ใช้ `leads`. field ของ item ที่หน้าอ่าน: `id, txNo, movementTypeCode, prospectCode, prospectName, prospectAvatar, prospectTel, phoneCountryCode, countryCode, currentCityName, currentDistrictName, currentCountryName, amount, leadStatus, activeStatus, forwardStatus ("กลุ่ม - ขั้นตอน"), activityGroupId, procedureGroupId, saleGroupName, salePersonName, employeeId, employeeName, employeeCode, lastUpdatedAt ("yyyy-MM-dd HH:mm:ss"), leadDemand, tags[{name,colorCode?}], accessors|assignees[{id,code,name,type,attachFile}], assigneeAvatars[]`

### 8.3 คำถามถึงเจ้าของระบบ / backend
1. `showClosed=false|true` หมายถึง "เฉพาะลีดเปิด" / "เฉพาะลีดปิด (SUCCESS, LOST)" ใช่ไหม (mock สมมติอย่างนั้น; ตัวเลือกของ dropdown "สถานะการปิด" สลับตามสวิตช์ในหน้า Java แสดงว่าน่าจะใช่)
2. `statusSummary` / `wfStepSummary[].count` นับตาม: ตัวกรองทั้งหมด? กลุ่มที่เลือก? ทั้งผลิตภัณฑ์? (mock: ตามตัวกรอง search/วันที่/จังหวัด/ทีม/ผู้รับผิดชอบ/แท็ก และกลุ่มที่แสดง แต่ไม่ตาม `showClosed`/`activeStatus`)
3. ไม่ส่ง `activityGroupId` ให้กลุ่มไหน (mock: กลุ่มแรกของผลิตภัณฑ์)? `perPage` สูงสุดเท่าไร? `dateRangeType=custom` กรองจากวันที่ field ไหน?
4. รูป `http://` ของลูกค้า/ผู้มีสิทธิ์: เมื่อไม่มี BFF จะโหลดตรงได้หรือไม่ (CORS/mixed content) หรือ gateway มี proxy?
5. filter state ที่ Java เก็บใน HttpSession: service มี endpoint เก็บให้ไหม หรือให้เก็บใน browser (`sessionStorage`)?
6. `forwardStatus` รูป "กลุ่ม - ขั้นตอน" เป็นสัญญาถาวรหรือไม่ (หน้าแยกที่ " - " ตัวแรก; ไม่มี " - " + workflow = ทั้งก้อนเป็นกลุ่ม)
7. การแปลชื่อจังหวัด/เขต/ประเทศ (`MasterDataI18n`) ย้ายมาอยู่ฝั่ง Angular (`master-data.{th,en}.json` + `I18n.master`) ได้เลยไหม — ต้องครอบคลุมทุก code ที่ backend ส่ง

## 9. ข้อความสำหรับ CLAUDE.md / README.md

**CLAUDE.md** — bullet ใหม่ (ต่อจากข้อ Dashboard):
```
- **หน้า Opportunities (โอกาสขาย: Board + List) เป็นไฟล์ที่ถูกสร้างเช่นกัน** (`features/opportunities/leads.{html,scss,engine.ts}` จาก `lead.xhtml` + `components/access_pop` · `lead/filter_modal` · `move_step_modal` + `css/lead.css`; `public/assets/java-js/tag_pill_color.js` และ `public/assets/images/{icon,lead}/*` คัดลอกตรงทุกไบต์) — ห้ามแก้ด้วยมือ: แก้ `tools/sync-opportunities.mjs` แล้วรัน `npm run opportunities:sync` (ดู manual หัวข้อ Opportunities); ส่วนที่เขียนเองคือ host `leads.ts` + `leads-view.ts`, สัญญากับ backend `leads-backend.ts`, mock `leads.mock.ts` (240 ลีดจาก `seedLead` แจก 4 ผลิตภัณฑ์; filter state และการย้ายการ์ดคงอยู่ใน sessionStorage แทน HttpSession). เฟส A: โหมดจริงยังไม่มี (host แสดง `<ts-live-missing/>`) — servlet ที่ต้องย้ายอยู่ในหัวข้อ 8 ของ INTEGRATION.md ของการพอร์ตหน้านี้. ลิงก์ไปรายละเอียดลีดต้องพา `activityGroupId` ไปด้วย (`javaLinkToRoute`)
```
และในบรรทัด "คำสั่ง" เพิ่ม `npm run opportunities:sync`.

**README.md** — แถว `tools/` เพิ่ม `sync-opportunities.mjs` (หน้า Opportunities Board + List); ย่อหน้าสถานะเฟส 0 เพิ่ม "**หน้า Opportunities (โอกาสขาย) Board + List เหมือน Java 1:1 — `npm run opportunities:sync`, ตรวจเทียบ 232 สถานการณ์ด้วย `tools/compare/pages/opportunities`, ใช้ข้อมูลจำลอง (เฟสจริงยังไม่มี)**".
