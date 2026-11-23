# INTEGRATION — schedule (หน้า "ปฏิทินงาน") + work modal (page=schedule)

> **อัปเดต 2026-10-21 — เฟส B (live adapter) ของหน้านี้ทำแล้ว: ดู `docs/integration/activities-live.md`.** ข้อความ "ยังไม่มี live adapter / `<ts-live-missing />` / เหลือ REST" ในไฟล์นี้เป็นสถานะของเฟส A (ตารางที่ต้องพอร์ตด้านล่างยังใช้เป็นแผนที่ของ servlet ได้)

workspace: `triple_sale_angular_ws_schedule` · ขอบเขต: เฟส A (mock) — ไม่มี live adapter · เขียนโดย worker ของหน้า `schedule`

## 0. การแก้ shared infra ใน workspace (ผู้ประสานงานนำเข้า)

| ไฟล์ | เปลี่ยนอะไร / ทำไม |
| --- | --- |
| `tools/compare/lib/runner.mjs` | เพิ่มแบบ backward-compatible: option ของ `page.mjs` ชื่อ **`clock: [ปี, เดือน(0-11), วัน, ชั่วโมง?, นาที?, วินาที?]`** → `evaluateOnNewDocument` ครอบ `Date` ของทุกเอกสาร: `new Date()` / `Date.now()` เริ่มที่เวลานั้นแล้วเดินต่อตามจริง (timer/animation/ลำดับ event ไม่เปลี่ยน). เหตุผล: หน้า Schedule ใช้ `new Date()` ของเบราว์เซอร์เป็น "วันนี้" (เดือนที่เปิด, วันที่มีวงกลม, ค่าเริ่มต้นของ work modal) ขณะที่ mock ต้องอยู่รอบ `SEED_TODAY` (2026-10-20, ห้ามอ่าน `Date.now()`) — ถ้าไม่ตรึง เครื่องที่รันวันอื่นจะเห็นปฏิทินเดือนอื่นที่ไม่มีข้อมูล (ทั้งสองฝั่งยัง "เหมือนกัน" แต่ว่างเปล่า = scenario ไร้ความหมาย). หน้าอื่นไม่ตั้ง `clock` จึงไม่กระทบ |

ไม่ได้แก้ `tools/lib/**` (generator ใช้ `workModalPieces`, `engineScaffold`, `adaptation`, `elMessages`, `swapCalls`, `assertPortable` ตามเดิม)

## 1. การเปลี่ยนแปลงไฟล์ shared (ผู้ประสานงานต้อง merge เอง)

| ไฟล์ | เปลี่ยนอะไร / ทำไม |
| --- | --- |
| `src/app/app.routes.ts` | `IMPLEMENTED` เพิ่ม `schedule: { load: () => import('@features/schedule/schedule').then((m) => m.Schedule) }` (**แก้ใน workspace แล้ว** — จำเป็นต่อการรัน harness/เทสต์) |
| `src/app/core/navigation/page-registry.json` | `schedule` → `"implemented": true` (**แก้ใน workspace แล้ว** — `page-registry.spec` ตรวจให้ตรงกับ routes) |
| `package.json` | script `"schedule:sync": "node tools/sync-schedule.mjs"` (ใน workspace **ไม่ได้แก้** — รันด้วย `node tools/sync-schedule.mjs`) |
| `src/app/core/navigation/java-links.ts` / `.spec.ts` | **ไม่ต้องแก้** — rule `schedule` และ spec มีอยู่แล้ว (`schedule.face?…` → `/crm/schedule?…`); ลิงก์ที่หน้านี้ใช้คือ `lead_detail.face?…param_lead_id=…&activityGroupId=…` ซึ่งมี rule/spec แล้ว |
| `CLAUDE.md` | เพิ่ม bullet: "**หน้า Schedule (ปฏิทินงาน) + work modal เป็นไฟล์ที่ถูกสร้างเช่นกัน** (`features/schedule/schedule.{html,scss,engine.ts}` จาก `schedule.xhtml` + `components/work_modal.xhtml`; ชิ้นส่วนของ modal มาจาก `tools/lib/work-modal.mjs`) — ห้ามแก้ด้วยมือ: แก้ `tools/sync-schedule.mjs` / `tools/lib/work-modal.mjs` แล้วรัน `npm run schedule:sync` (ดู manual); ส่วนที่เขียนเองคือ `schedule.ts`, `schedule-view.ts`, สัญญา `schedule-backend.ts` และ mock `schedule.mock.ts` (+ ข้อมูลกลาง `core/mock/schedule-seed.ts`). ข้อควรจำ: หน้านี้ใช้ `new Date()` เป็น 'วันนี้' — harness ตรึงเวลาด้วย `clock` ใน `page.mjs`" |
| `README.md` | แถวของตาราง: Schedule · `/crm/schedule` · พอร์ตแล้ว (mock) · ผ่าน harness `node tools/compare/run.mjs schedule` |
| `manual/index.html` | หัวข้อใหม่จากชิ้นส่วน `manual-schedule.html` (ที่ราก workspace) |
| `public/assets/images/calendar_work/` | **ไฟล์ใหม่ล้วน (merge ได้เลย)**: `fi_edit.svg`, `fi_icon_scheduled.svg`, `fi_icon_re_scheduled.svg`, `fi_icon_success.svg`, `fi_icon_cancel.svg`, `fi_icon_work_doing.svg`, `fi_icon_work_success.svg`, `fi_icon_work_cancel.svg` (byte-identical กับ `web/images/calendar_work/`). ไฟล์อื่นที่หน้าใช้ (`icon/fi_*.svg`, `calendar_work/fi_arrow-right.svg` …) มีอยู่ใน main แล้วและตรงกัน |
| `src/app/core/mock/schedule-seed.ts` | **ไฟล์ใหม่** (framework-free, อยู่ที่ `core/mock/` ตามกติกา "fixture ร่วมของหน้า") — ดู §4 และข้อเสนอด้านล่าง |

**ข้อเสนอ (ไม่บังคับ แต่ทำให้ "รายการที่สร้างจาก work modal ของหน้า Activities" ไปโผล่ในปฏิทิน)**: ให้ `features/activities/activities.mock.ts` สร้างลีด/นัดหมาย/งานจาก `@core/mock/schedule-seed` (`leadModel`, `baseRowsOfLead`, `PRODUCTS`) แทนสูตรที่ซ้ำกันอยู่ใน `buildLead()`/`buildSchedules()` — วันนี้ทั้งสองหน้าได้ข้อมูลฐาน **เหมือนกันทุก id/หัวข้อ/วัน/เวลา/สถานะ** (ตรวจโดย `schedule.mock.spec.ts` ข้อ "the rows of the Activities mock are in the seed …" ซึ่งอ่าน `createMockRest()` ของ Activities เทียบ) แต่ state ที่เขียนต่อ (เพิ่ม/แก้) ของแต่ละหน้ายังแยกกัน. ผมไม่ได้แก้ไฟล์ของ feature อื่น (กติกา §7)

i18n: **ไม่มี key `app.*` ใหม่** — ทุกข้อความมาจาก key เดิมของ Java (replica โยน error ถ้า key หาย; generator ตรวจว่าข้อความทุกคีย์ไม่มี `' " \ ขึ้นบรรทัดใหม่`). ข้อความที่ Java ฝังตายตัวในสคริปต์/markup (คงตามต้นฉบับ ไม่แปล): ชื่อแท็บ `Calendar` / `Board` / `List`, หัวคอลัมน์วัน `Sun … Sat`, `ALL DAY`, `1 AM … 11 PM`, ชื่อเดือน/วันภาษาอังกฤษของป้ายปฏิทิน (`TH_MONTHS`, `DAY_NAMES`), ชื่อกลุ่ม fallback `Customer Service` / `Pre Loan Service` / `Loan Service` / `Legal Service` ใน markup ของ dropdown กลุ่มก่อน API ตอบ, `ข้อความแจ้งเตือน!` (หัว swal ของ modal)

## 2. ไฟล์ที่เพิ่ม (เฉพาะของหน้านี้ — merge `--apply` ได้)

```
tools/sync-schedule.mjs                          generator (+ tools/lib/work-modal.mjs, tools/lib/port-script.mjs ที่มีอยู่แล้ว)
tools/compare/pages/schedule/{page,scenarios}.mjs
src/app/features/schedule/
  schedule.html · schedule.scss · schedule.engine.ts            GENERATED
  schedule.ts · schedule-view.ts                                 route + host
  schedule-backend.ts                                            สัญญา: ScheduleBackend (initial + fetch ของ BFF)
  schedule.mock.ts                                               mock (seed: core/mock/schedule-seed.ts)
  schedule.mock.spec.ts · schedule.spec.ts
src/app/core/mock/schedule-seed.ts                               นัดหมาย/งานของลีดในชุดตัวละครกลาง
manual-schedule.html                                             ชิ้นส่วน manual
INTEGRATION.md
```
(workspace ยังมี `src/app/app.routes.ts`, `page-registry.json`, `tools/compare/lib/runner.mjs` ที่แก้ — ดู §0, §1)

## 3. generator — `node tools/sync-schedule.mjs`

อ่าน `pages/schedule.xhtml` (head = `<style>` ก้อนเดียว ไม่มีไฟล์ CSS/JS ที่หน้าโหลดเอง; content = ป๊อปอัป "อีก N รายการ" + markup หน้า → สคริปต์หน้า (IIFE เดียว) → `<ui:include work_modal page=schedule>` → markup กล่องตัวกรอง → สคริปต์กล่องตัวกรอง (ระดับบนสุด ไม่มี IIFE)) และ `components/work_modal.xhtml` (ผ่าน `workModalPieces({ read, page: 'schedule' })`). รันซ้ำแล้วไฟล์เหมือนเดิม; swap ที่ไม่ตรง = หยุด. ผลบรรทัดสุดท้าย: 77 ชื่อบน `window`, 30 กฎ dark, 22 รูป, markup ~32K / css ~61K+23K / script ~149K+86K+11K ตัวอักษร.

| Java | Angular (ทั้งหมดอยู่ใน generator) |
| --- | --- |
| `#{commonBean.msg['k']}` ใน markup / ในสตริง JS | `{{ t('k') }}` / `[attr.x]="t('k')"` ; `' + env.t("k") + '` (`'#{…more_items}'.replace('{0}', n)` ถูก swap แยกเป็น `env.t("…").replace('{0}', n)` ไม่งั้น `.replace` จะไปเกาะสตริงว่างที่ตามมา) |
| `window.LD2_… = #{commonBean.hasFeature('X')}` · `'#{commonBean.ssEmployeeId}'` | `env.can('X')` · `env.myEmployeeId` |
| `#{not empty scheduleView.savedFilterJson ? … : 'null'}` | `env.initial("savedFilterJson")` ← `ScheduleBackend.initial()` |
| `'#{request.contextPath}/board/…'` (7 ที่) · `contextPath: '#{request.contextPath}'` (odsProspectSuggest) | `env.ctx + '/board/…'` ('' ที่นี่) · `contextPath: env.ctx, fetch: env.fetch` |
| `#{request.contextPath}/images/…` (23 ใน markup / 9 ในสคริปต์) · `../images/icon/default_avatar.svg` (4) | `assets/images/…` · `' + env.assetBase + 'images/…` |
| `../docproxy?url=` (รูป `http://` ของ backend) | `env.docProxy(u)` (host คืน URL เดิม — ไม่มี BFF) |
| `fetch(` | `env.fetch(` (ทั้งสคริปต์หน้า, ตัวกรอง, work modal) |
| `navigator.sendBeacon(API_SC_STATE, Blob)` | `env.beacon(url, json)` (host → `backend.fetch` POST) |
| `window.location.href = 'lead_detail.face?…'` (เมนู "ไปที่ Lead") | `env.navigate(u)` → host `javaLinkToRoute` → `router.navigateByUrl('/crm/opportunities/:id?activityGroupId=')` |
| `new IntersectionObserver(…)` ×2 (บอร์ดรายคอลัมน์, sentinel ของตาราง) | `track(new IntersectionObserver(…))` → `destroy()` เรียก `disconnect()` |
| `document.addEventListener` · `setTimeout` | `listen(document, …)` · `tmo(…)` |
| `document.addEventListener('DOMContentLoaded', …)` (2 ที่) | `onReady(…)` — scaffold เล่น `DOMContentLoaded` หลังสคริปต์ทั้ง 3 บล็อกทำงานครบ (สคริปต์ Java ทำงานตอนเอกสารยัง "loading") |
| `if (window.odsProspectSuggest) {…}` (ระดับบนสุดของสคริปต์หน้า) | `if (readyState !== 'loading' && window.odsProspectSuggest) {…}` — ดู §7 ข้อ 1 |
| `window.x = …` (77 ชื่อ รวม `LD2_*`, `SC_APPLIED_FILTER`, `switchCalView`) | เหมือนเดิม + `destroy()` ลบทิ้ง; ชื่อที่ inline handler เรียก (`window.scXxx`, `scCloseMorePop()`) ตรวจว่ามีสคริปต์ assign จริงทุกตัว |
| `alert('…move_status_fail')` | **คงเป็น `alert()` ของเบราว์เซอร์ตามต้นฉบับ** (scenario ทับ `window.alert` ทั้งสองฝั่งเพื่อเก็บข้อความ) |
| `--fs-adj` · `body[data-theme="dark"]` | `--ts-fs-adj` · `html[data-theme='dark']` |
| `#crm_main_body_page{padding:0!important;background:#F0F2FF!important}` + กฎ dark ของมัน | `#crm_main_body_page:has(.sc-root)` ทั้งสอง (กล่องเนื้อหาเป็นของ shell ใช้ร่วมทุกหน้า) |

CSS global ของ stack Java: บล็อก "Angular adaptation" จาก `adaptation()` ขอบเขต `:where(ts-schedule-view)` + `dark_mode.css` ของ Java เฉพาะ 30 กฎที่แตะหน้านี้ ต่อท้าย CSS ของหน้า และก่อน `<style>` ของ work modal (ลำดับเดียวกับเอกสาร Java). `schedule.scss` 106 KB < งบ component style 140 KB.

## 4. host / backend / mock

- `schedule.ts` (`ts-schedule`): `mock=false` → `<ts-live-missing />` (ไม่เรียกอะไร); เปลี่ยนภาษา = สร้าง `ts-schedule-view` ใหม่ (Java `location.reload()`)
- `schedule-view.ts` (`ts-schedule-view`; ViewEncapsulation.None · preserveWhitespaces · OnPush · `data-java-page`): โหลด mock (chunk แยก), `backend.initial()`, `detectChanges()`, สร้าง `ScheduleEnv`, `startSchedule(env)`; `DestroyRef` → `stop()`; `reload` ของ work modal → parent สร้างหน้าใหม่ (ระหว่าง overlay สำเร็จ 3 วินาทีถ้าออกจากหน้าก่อน = ไม่ reload — เทสต์)
- `schedule-backend.ts`: `initial()` + `fetch(url, init)` และรูปคำตอบของทุก URL (header ของไฟล์)
- `core/mock/schedule-seed.ts`: ลีด 1–240 เหมือน `activities.mock.ts` (ผลิตภัณฑ์ `n % 8`: บ้าน 120 · รถยนต์ 60 · ที่ปรึกษาการเงิน 60 ไม่มี workflow · และ "ผลิตภัณฑ์ใหม่" ไม่มีลีด; กลุ่มที่ผ่าน; ขั้นตอน; ผู้รับผิดชอบหรือไม่มี) + แถวฐาน (`5_000_000 + n*10 + k`) สูตรเดียวกับ Activities + ผู้รับผิดชอบรายการ (บางรายการไม่มี) + แถว **เฉพาะ Schedule** (id 6_000_000+): บล็อกหนาแน่นของ สินเชื่อบ้าน/กลุ่มแรก (หน้าเริ่มต้น) วันที่ −6 … +19 วัน (เซลล์ล้นเป็น "อีก N รายการ", คอลัมน์บอร์ดมีหลายหน้า), 40 แถวต่างเดือน/ต่างปี (มุมมองรายปี), แถวพิเศษ: 3 นัดเวลา 10:00 เดียวกัน + 1 งานเวลาเดียวกัน, นัด/งานทั้งวัน, งาน 00:30 (ไม่ขึ้นในกริดสัปดาห์/วัน — Java เริ่มที่ 1 AM), นัด 23:30, นัดที่ยกเลิก, ชื่อยาว, ชื่อที่มี `< > & "`, 31/10 · 1/11 · 31/12 · 1/1 · 31/12/2025
- `schedule.mock.ts`: servlet layer + กฎของ REST ที่ mock ตัดสินเอง (§8.3). state ฝั่ง "server": ตัวกรองที่หน้า POST (`HttpSession["sc_filter_state"]`) และสิ่งที่ผู้ใช้เพิ่ม/แก้ — อยู่ใน sessionStorage (`ts.mock.schedule.state`) ใน browser, ในหน่วยความจำใน Node; `resetMockSchedule()` ล้าง
  - สวิตช์ทดสอบ (ไม่มีใน Java): config `{noProducts, failProducts, noGroups, failGroups, failCalendar, failBoard, failList, failEdit, emptyAll, maxPerPage, delayMs, delayByView}` จาก options หรือ `sessionStorage['ts.mock.schedule.config']`; หัวข้อที่มี `~fail` ตอนเพิ่ม/แก้ = backend ปฏิเสธ 400 (ธรรมเนียมเดียวกับ Activities)

## 5. ผลตรวจเทียบ — `node tools/compare/run.mjs schedule` (ทำซ้ำได้)

harness สร้างหน้า Java **จริง** — `schedule.xhtml` + `work_modal.xhtml` (include ด้วย `page=schedule`) วางตามที่ Facelets ทำ, EL แทนค่าเหมือน server (ข้อความจาก th/en.json, สิทธิ์, employee id, `savedFilterJson` จาก state ของ session), สคริปต์ 3 บล็อกและ `<style>` ตัวจริงตามลำดับของเอกสาร ใน shell replica แล้วให้ทั้งสองฝั่งได้ข้อมูลจาก mock ตัวเดียวกัน; "ตอนนี้" ของทั้งสองฝั่งตรึงที่ 2026-10-20 10:30. เทียบ DOM + attribute + ข้อความ + ตำแหน่ง/ขนาด + computed style + ค่า input + flag `LD2_*` + ตัวกรองที่ใช้ (`SC_APPLIED_FILTER`) + `alert()` + ลิงก์ที่นำทาง

**ผลรอบสุดท้าย (โค้ดสุดท้าย, `ng build` ใหม่, `node tools/compare/run.mjs schedule --jobs 5`, 21 นาที): 593 scenario × 2 ฝั่ง — เหมือนกันทุกบรรทัด 593/593 (exit 0), ไม่มี `ready-timeout`, ไม่มี `pageerror`, ไม่มี scenario error, ไม่มีรายการ "browser errors / failed requests" ในรายงาน** (HTTP 400/500 และ `console.error` ที่ scenario จงใจให้ backend ปฏิเสธ — `~fail`, `failEdit`, `failCalendar` … — อยู่ใน `ignoreLog` ของ `page.mjs` พร้อมเหตุผล). harness ตรวจ dump แล้วว่า scenario ทำสิ่งที่ตั้งใจจริง (เช่น ย้ายการ์ด 48→47 / 23→24, บันทึกแล้วหน้าโหลดใหม่เห็นรายการใหม่, swal "บันทึกไม่สำเร็จ!" ของ backend ปฏิเสธ, `ALERT`, `NAV lead=… group=…`) ไม่ใช่เหมือนกันเพราะพังเหมือนกัน.

ภาพรวมตามมิติ (ชื่อ scenario): สว่าง/มืด — มืด 87 · ไทย/อังกฤษ — อังกฤษ 37 (`en-…`) · 390px 38 · 768px 12 · 1024px 12 · 1920px 6 · A A A 32 · สิทธิ์ 39 · โหลดหน้าซ้ำ (`__RELOAD__`) 18 · เปิดหน้าด้วยสถานะที่ session จำ 21 · ว่าง/ผิดพลาด/ช้า 43+ · work modal 85 · ลาก-วาง 23 · ตัวกรอง 62

ข้อสังเกตความเสถียร: รอบรวมกับ worker อื่นที่รัน harness พร้อมกัน (`--jobs 8`) มี scenario `reload-*` 3 ตัวล้มด้วย `protocolTimeout` ของ puppeteer (ไม่ใช่ความต่างของหน้า) และ 1 ตัว (`err-calendar-week-nav`, `--jobs 3`) ล้มครั้งเดียวด้วย "no element .sc-view-btn" ฝั่ง ng — รันซ้ำแล้วเหมือนกันทั้งหมด (3 รอบต่อเนื่องไม่เกิดซ้ำ); `ready` ใน `page.mjs` จึงรอ `.sc-view-btn` ด้วย. แนะนำ `--jobs 4–5` เมื่อเครื่องไม่ว่าง

| กลุ่ม | scenario |
| --- | --- |
| หน้าแรก / ขนาดจอ / ภาษา / A A A | `overview` สว่าง/มืด × 390 · 600 · 768 · 1024 · 1280 · 1440 · 1600 · 1920 × ไทย/อังกฤษ · `fs-plus` / `fs-minus` ทุกมุมมอง/แท็บ/ป๊อปอัป |
| ปฏิทิน | รายปี/เดือน/สัปดาห์/วัน × (สว่าง/มืด/ทุกขนาดจอ/อังกฤษ/A A A) · ลูกศร ย้อน/ถัดไป/วันนี้ ของทุกมุมมอง รวมข้ามเดือน/ปี · สวิตช์นัดหมาย/งาน · เมนูมุมมอง · ตัวเลือกวันที่ (เดือน/ปี/สัปดาห์/วัน, ปีก่อน/ถัดไป, เลือก, ปิดนอก) · "อีก N รายการ" (hover, ออก, กลับเข้า, ปิด, คลิกรายการ) · รายปี: คลิกวันที่มีรายการ/วันนี้/วันว่าง/ชื่อเดือน |
| ผลิตภัณฑ์/กลุ่ม | dropdown ผลิตภัณฑ์ (บ้าน, รถยนต์, ไม่มี workflow, ไม่มีรายการ) และกลุ่ม ในทุกแท็บ/มุมมอง · ค่าที่จำไว้ |
| เรียง/ค้นหา | เรียงทั้ง 5 แบบ (Board + List) · ค้นหา: เปิด, ปุ่ม, Enter, ✕, ไม่พบ, ทุกแท็บ, รายปี |
| Board | คอลัมน์ทั้งหมด × ขนาดจอ/ธีม/ภาษา · เลื่อนโหลดรายคอลัมน์ (1, 2 รอบ, ช้า, เพดาน perPage) · เมนู ⋮ (แก้ไข, ไปที่ Lead, ปิดแล้ว, ไม่มีสิทธิ์) · ลาก-วาง: ย้ายทุกคอลัมน์ (นัดหมาย/งาน), ข้ามชนิด, คอลัมน์เดิม, ต้นทางปิดแล้ว, ไม่มีสิทธิ์แก้, backend ล้ม (alert + ย้อน), ไฮไลต์ระหว่างลาก, ยกเลิกกลางทาง · ลากเลื่อนแนวนอนด้วยเมาส์ |
| List | ตารางทั้งสอง × ขนาดจอ/ธีม/ภาษา · เลื่อนโหลดรายตาราง · เมนู ⋮ · เปิดแถว · เรียง/ค้นหา |
| ตัวกรอง | เปิด (ทุกธีม/ขนาด/ภาษา) · dropdown ทีม/ผู้รับผิดชอบ + ค้นหาในรายการ · สถานะ (ติ้ก/ไม่ติ้ก) · กรอง → ป้ายจำนวนบนไอคอน + ทุกแท็บ/มุมมอง · ล้าง · ปิด (✕, คลิกนอก) · เปิดซ้ำจำค่าที่ใช้แล้ว |
| work modal | ดู (ปฏิทินเดือน/สัปดาห์/วัน/ป๊อปอัป/รายปี, บอร์ด, ตาราง) · ลิงก์ "ไปหน้าโอกาสขาย" (ปฏิทินเท่านั้น) · แก้ไข/บันทึก/ล้มเหลว · เพิ่ม: ค้นหาลูกค้า (รายการ, ค้นหา, ไม่พบ, ตัวกรองทีม/ผู้รับผิดชอบ, เลื่อนหน้าถัดไป, เลือก, ล้าง), ผู้รับผิดชอบ, ค่าเริ่มต้น, ทั้งวัน, validation ทุกข้อความ, บันทึก → overlay → หน้าโหลดใหม่เห็นรายการใหม่, backend ปฏิเสธ, ไม่มี `_Sup` (เห็นเฉพาะลีดของตัวเอง) |
| สิทธิ์ | 6 ชุด (`noview`, `noedit`, `nocreate`, `nosup`, `nolead`, `readonly`) × เดือน/บอร์ด/ตาราง + เหตุการณ์ที่เกี่ยวข้อง |
| โหลด/ว่าง/ผิดพลาด | skeleton ตอนโหลดครั้งแรก (เดือน/รายปี/สัปดาห์/วัน/ตาราง × สว่าง/มืด/390/อังกฤษ) · บอร์ด/ตาราง/สัปดาห์/วัน/ปี ที่โหลดช้า · หน้า error ของผลิตภัณฑ์/ปฏิทิน/บอร์ด/ตาราง (+ลองใหม่) · กลุ่มล้ม/ว่าง · ไม่มีผลิตภัณฑ์ · ไม่มีรายการเลย (ทุกมุมมอง/แท็บ) |
| session | เปิดหน้าด้วยสถานะที่ session จำ (มุมมอง/วันที่/แท็บ/เรียง/ค้นหา/ตัวกรอง/ผลิตภัณฑ์/กลุ่ม, ค่าแปลก: ผลิตภัณฑ์ไม่รู้จัก, เรียงไม่ถูกต้อง, `{}`) · โหลดหน้าซ้ำ (`__RELOAD__`) หลังเปลี่ยนแต่ละอย่าง |

## 6. ความต่างที่ตั้งใจ / ที่เป็นของสภาพแวดล้อม (ไม่ใช่ของหน้า)

1. **เส้นทางรูป**: Java `../images/…`, `/triplesale/images/…` ↔ Angular `assets/images/…` (ไฟล์เดียวกันทุกไบต์) — `normalize` ใน `page.mjs` + normaliser กลางของ harness
2. **ลิงก์ไปรายละเอียดลีด**: Java ออกจากหน้าไป `lead_detail.face?…`; Angular `router` ไป `/crm/opportunities/N?activityGroupId=G` — scenario `*-go-lead` ขวางการออกจากหน้าแล้วเทียบ (N, G) ที่ทั้งสองฝั่งเลือกได้ (dump มีแต่บรรทัด `NAV`, `roots: []`: หน้า Angular ถูกแทนที่ด้วยเส้นทางปลายทาง)
3. **HttpSession → sessionStorage**: `POST /board/schedule-filter-state` / `savedFilterJson` — ใน mock; live adapter ต้องตัดสินใจ (§9)
4. **`alert()`**: scenario ทับ `window.alert` ทั้งสองฝั่ง (เบราว์เซอร์ headless จะค้างที่ dialog) แล้วเขียนข้อความลง dump (`ALERT …`)
5. **ตรึงเวลา**: `clock` ใน `page.mjs` (§0)
6. **ลากการ์ด**: harness ยิง `DragEvent` จริง (dragstart บนการ์ด, dragover/drop บนคอลัมน์, dragend) ให้ listener ของหน้าทำงาน — เซสชันลากของเบราว์เซอร์ (ghost ที่เมาส์ลาก, cursor) ไม่ได้ถูกทดสอบ
7. **A A A**: scenario ตั้ง `--fs-adj` และ `--ts-fs-adj` ตรง ๆ แล้ว **รอ ~700 ms ก่อนวัดตำแหน่ง** (เช่นป๊อปอัป "อีก N รายการ", เมนู ⋮ คำนวณตำแหน่งจาก `getBoundingClientRect()` ของไอคอน) เพราะ shell ของ Angular มี transition ของขนาดตัวอักษร (`_base.scss`) — เหมือนข้อสังเกตของหน้า Opportunities
8. **scrollbar ของ document**: ตามที่ README ของ harness บอก — scenario ที่เลื่อนจึงเลื่อน element ของหน้าเอง (`.sc-list-scroll`, `.sc-col`, `.sc-board`)
9. **รูปลูกค้า `http(s)://`** ผ่าน `../docproxy?url=` ใน Java; Angular ไม่มี `/docproxy` (`env.docProxy` คืน URL เดิม) และ mock ไม่มีรูปแบบนี้ (ไม่มีรูปลูกค้า = default avatar) — เส้นทางนี้ไม่ได้ทดสอบ

## 7. ข้อสังเกตจากต้นฉบับ Java (คงไว้ตามต้นฉบับ — เจ้าของระบบอาจต้องการแก้ที่ต้นทาง)

1. **การ์ดแนะนำลูกค้าใต้ช่องค้นหาไม่เคยทำงานในหน้า Schedule**: บล็อก `if (window.odsProspectSuggest) { odsProspectSuggest('scSearchInput', …) }` อยู่ระดับบนสุดของสคริปต์หน้า (หน้า activity/lead เรียกใน `init()`), สคริปต์นั้นรันตอนเอกสารกำลัง parse ซึ่ง `open_down_select.js` (โหลดท้าย `template.xhtml`) ยังไม่ถูกโหลด → เงื่อนไขเป็น false เสมอ. harness จับได้ตั้งแต่ scenario แรก (Angular shell โหลดสคริปต์ไว้ก่อน จึงใส่ `data-ods-ac` ให้ช่องค้นหาต่างจาก Java) → generator เปลี่ยนเงื่อนไขเป็น `readyState !== 'loading' && …` เพื่อให้ผลเหมือน Java (ไม่ทำงาน). **ถ้าเจ้าของระบบต้องการให้การ์ดทำงาน**: ย้ายบล็อกนั้นเข้า `init()` ในต้นฉบับ (แล้วลบ swap นี้ใน generator) — mock รองรับ `/board/prospect-list` แล้ว
2. **ชื่อนัดหมาย/งานที่มี `'` ทำให้คลิกเหตุการณ์ในปฏิทินไม่ได้**: ปฏิทินเขียน `onclick="window.scOpenWorkModal('appt','<encodeURIComponent(JSON)>',true)"` — `encodeURIComponent` ไม่ escape `'` จึงปิดสตริงของ handler กลางทาง (SyntaxError เงียบ). mock จงใจไม่มีชื่อแบบนี้ (ทั้งสองฝั่งพังเหมือนกันอยู่แล้ว); `< > & "` ผ่าน (`esc()` + encodeURIComponent) และมีแถวทดสอบ
3. **กริดสัปดาห์/วันเริ่มที่ 1 AM**: งานเวลา 00:00–00:59 (`start_hour = 0`) ไม่แสดงในมุมมองสัปดาห์/วัน (แสดงในมุมมองเดือน) — port เหมือนเดิม; mock มีงาน 00:30 ของวันนี้ให้เห็น
4. **ไม่มีนัดหมายข้ามวัน (multi-day)**: item มี `appointmentDate` วันเดียว (ไม่มีวันสิ้นสุด) จึงไม่มีแถบข้ามวัน; "ทั้งวัน" คือ `allDay=true` — scenario "ข้ามวัน" ในโจทย์จึงแทนด้วย: ทั้งวัน, เวลาซ้อนกัน, ข้ามเดือน/ปี
5. สถานะ `pending` / `doing` ของนัดหมายมีป้ายใน `SC_APPT_BOARD_LABEL` แต่ไม่อยู่ใน `SC_APPT_STATUS_ORDER` — ไม่มีทางแสดงบนบอร์ด (เป็นโค้ดตาย) ; ในตาราง status ที่ไม่รู้จักของนัดหมายแสดงเป็น "นัดหมาย" (`scheduled`) และของงานเป็น "ดำเนินการ"
6. ไม่มีการป้องกัน response ที่มาช้ากว่า: เปลี่ยนเดือน/มุมมองเร็ว ๆ แล้ว response ของเดือนเก่ามาทีหลังจะวาดทับ (แต่ละ callback วาดตามปี/เดือนของมันเอง) — ไม่แตะ ไม่ได้ทดสอบ (latency ใน harness คงที่)
7. `ScheduleStatusServlet` (`/board/schedule/status`, ติ๊กงานเสร็จ) และ `POST /leads/schedules/cancel` **ไม่ได้ถูกหน้านี้เรียก** (เหลือจากหน้าเก่า) — live phase ไม่ต้องพอร์ตสำหรับหน้านี้

## 8. ทดสอบ / build

- `CI=1 node node_modules/@angular/cli/bin/ng.js test --no-watch --include 'src/app/features/schedule/**/*.spec.ts'` → **2 ไฟล์ 56 ข้อผ่าน**: `schedule.mock.spec.ts` 32 (รูปคำตอบของทุก endpoint, ตัวกรอง/ค้นหา/เรียง/แบ่งหน้าต่อคอลัมน์/ตาราง, สรุปยอด, เพดาน perPage, สวิตช์ล้ม/ว่าง, เขียนแล้วอ่านกลับทุกมุมมอง, ข้อมูลฐานตรงกับของหน้า Activities ทุกลีด, session จำสถานะ) · `schedule.spec.ts` 24 (host: เรนเดอร์, 4 มุมมอง, สวิตช์สัปดาห์, "อีก N รายการ", ตัวเลือกวันที่, dropdown ผลิตภัณฑ์/กลุ่ม, บอร์ด + sentinel + ลาก-วาง + ย้ายล้มเหลว + เมนูการ์ด, ตาราง + sentinel + เรียง/ค้นหา/จำสถานะข้ามหน้า, ตัวกรอง, work modal (ดู/แก้ไข/เพิ่มพร้อมค้นหาลูกค้า → overlay → หน้าเริ่มใหม่), สิทธิ์, หน้า error / ไม่มีผลิตภัณฑ์, เปลี่ยนภาษา = หน้าใหม่, ไม่มี listener/timer/observer/`window.x` ค้าง, ออกจากหน้าระหว่างรอ, mock ปิด)
  - jsdom รัน inline handler ใน realm ของตัวเองที่มองไม่เห็นชื่อที่ engine ใส่บน `window` ของเทสต์ → spec คัดลอกชื่อไป realm ของ handler (`bridge()` แบบเดียวกับ `activities.spec.ts`); jsdom ไม่มี `IntersectionObserver` / `DataTransfer` → spec มี stand-in (`FakeObserver`, `dragEvent`) และตรึง `Date` ที่ 2026-10-20 10:30 (`vi.useFakeTimers({ toFake: ['Date'] })`)
- เทสต์ส่วนที่ใช้ร่วม: `src/app/core/navigation/**` 4 ไฟล์ 24 ข้อผ่าน (รวม `page-registry.spec` ที่ตรวจ `IMPLEMENTED` กับ `implemented: true`, และ `java-links.spec` ที่มีข้อของ `schedule.face` อยู่แล้ว)
- `ng build` (production) ผ่าน **ไม่มี warning/error**; chunk `schedule` 214.6 KB (ส่ง 38 KB), mock เป็น chunk แยก (dynamic import เฉพาะ `mock: true`); `schedule.scss` 106 KB ต่ำกว่างบ component style 140 KB; งบ initial ไม่เปลี่ยน (หน้านี้ lazy)
- ไม่ได้รันเทสต์ทั้งโปรเจกต์ (ตามคู่มือ — ผู้ประสานงานรันหลัง merge)

## 9. endpoint / servlet ที่ live adapter ต้องทำ (เฟส B)

ทุกตัวเป็น servlet ใต้ `/board/*` ของ BFF ที่จะถูกตัด — live adapter (`ScheduleBackend` ตัวที่สอง) ต้องรับ URL เดียวกับที่หน้าเรียก (`schedule-backend.ts` header) แล้วเรียก REST ของ `triplesale-service` ตรง:

| URL ของหน้า | Servlet (Java) | REST / logic ที่ต้องย้าย |
| --- | --- | --- |
| `GET /board/schedule/fetch?viewMode=…` | `ScheduleFetchServlet` | `GET {api}/api/v1/schedules` ส่งต่อพารามิเตอร์: `viewMode` (month · week · day · year · board · list), `type` (appointment · task — ตอนเลื่อนโหลดหน้าถัดไป), `dateFrom`/`dateTo`, `sort`, `page`, `perPage`, `movementTypeId`, `activityGroupId`, `serviceId`, `assignToId`, `appointmentStatus`, `taskStatus` (คั่น `,`), `search` (URL-encode). servlet: 400 `{"status":400,"message":"missing params: viewMode[, dateFrom, dateTo]"}` ถ้าไม่ครบ (list/board ไม่ต้องมี date); ตอบว่าง → `{"status":204,"message":"no content","result":{"viewMode":…,"items":[]}}`; exception → HTTP 500 `{"status":500,"message":…}`; ไม่แปลงเนื้อหา — **รูปคำตอบ (item, marks, columns, summary, meta) มาจาก REST โดยตรง** : mock ทำตามสิ่งที่หน้าอ่าน (`schedule-backend.ts`) ต้องยืนยันกับ service จริง |
| `GET /board/master/movement-types?type=LD` | `MovementTypeServlet` | `GET /master-data/movement-types/{type}` (default `LD`) ตอบ envelope ตามจริง; ว่าง → `{"status":204,…,"result":{"items":[]}}`; 500 |
| `GET /board/master/activity-groups?movementTypeId=` | `MasterActivityGroupsServlet` | `GET /master-data/activity-groups?movementTypeId=` + `MasterDataI18n.translateEnvelopeResult(result, ภาษาของ session)` (แปลชื่อกลุ่มตามภาษา); ไม่มี movementTypeId → 400 `{"error":"movementTypeId required"}`; exception → 500 `{}` |
| `POST /board/schedule-filter-state` (sendBeacon) · `scheduleView.savedFilterJson` | `ScheduleFilterStateServlet` · `ScheduleView.getSavedFilterJson()` | HttpSession `sc_filter_state` — เก็บ body ดิบ (ไม่ว่างเท่านั้น), ตอบ 204; `GET` ตอบ JSON ที่เก็บหรือ `null`. ไม่มี BFF แล้ว → เก็บใน sessionStorage (หรือ pref ของผู้ใช้) และให้ `initial()` อ่านคืน |
| `POST /board/schedule/add` · `PATCH\|POST /board/schedule/edit` | `AddScheduleServlet` · `EditScheduleServlet` (ใช้ร่วมกับ Activities/work modal) | add: ลบ `movementTypeId`, ย้าย `activityGroupId` → `procedureGroupId` (ถ้ายังไม่มี) แล้ว `POST /api/v1/schedules`; body ว่าง = `{"status":201,"success":true}`; `status>=400` ใน body → HTTP error เดิม. edit: ลบ `leadId`, เอา `id` ไปต่อ path `PATCH /api/v1/schedules/{id}`; body ว่าง = `{"status":200,"success":true}` |
| `GET /board/sale-groups` · `GET /board/employees[?saleGroupId=]` (ตัวกรอง + dropdown ผู้รับผิดชอบของ work modal) | `SaleGroupsServlet` · `EmployeesServlet` | `LeadBoardView.fetchMasterArrayJson('/master-data/sale-groups' \| '/master-data/employees[?saleGroupId=]')` → array; ผิดพลาด = HTTP 500 + `[]` |
| `GET /board/master/employees-by-activity-group?activityGroupId=` (ผู้รับผิดชอบตามกลุ่มขั้นตอนใน work modal) | `MasterEmployeesByActivityGroupServlet` | `GET /master-data/employees/by-activity-group?activityGroupId=` + `MasterDataI18n.translateEnvelopeResult(result, ภาษา)`; ไม่มี id → 400 `{"error":"activityGroupId required"}`; exception → 500 `{}` |
| `GET /board/prospect-list?searchText&perPage&enrich=1` | `ProspectListServlet` → `ProspectListService.fetchPage` | การ์ดแนะนำลูกค้า (แปลชื่อประเทศของคอลัมน์ที่อยู่ตามภาษา) — **หน้านี้ไม่เรียก** (§7 ข้อ 1) แต่ port เตรียม mock ไว้ถ้าแก้ต้นฉบับ |
| `GET /board/leads?viewMode=list…` · `GET /board/lead?id=&activityGroupId=` | `LeadsBoardServlet` · `LeadDetailServlet` | ค้นหาลูกค้าใน work modal (โหมด `customerSearch` ที่หน้า Schedule เปิด) — logic ของ servlet ทั้งสองเป็นของหน้า Opportunities/Lead detail (เช่นแปลชื่อสถานที่ตามภาษา, `[]` เมื่อไม่มีสิทธิ์ `CRM_Lead_View`) |
| `../docproxy?url=` | `DocProxy` | พร็อกซีรูป `http://` กัน mixed-content — ไม่มี BFF แล้ว: โหลดตรง (host: `docProxy: (u) => u`) ถ้าเป็นปัญหาจริงต้องให้ service ส่ง URL https |

กฎที่ **mock ตัดสินเอง** (live ต้องยืนยันกับ `triplesale-service`; ที่ไหนไม่มีโค้ด Java ให้ดู): รูปของ `result` ต่อ viewMode (month/week/day = `items[]`, year = `marks[]`, board = `appointment[]`/`task[]` ของ `{status,count,items,meta}` + `summary`, list = `list.{appointment,task}` = `{items,meta}` + `summary`); ค่า `activityGroupId=0` = ทุกกลุ่ม; `serviceId` = ทีมขายของ sale person ของลีด; `assignToId` = ผู้รับผิดชอบรายการ; การเรียง (`date_desc` ค่าเริ่มต้น · `date_asc` · `order_asc/desc` = ตาม id · `status`) — **servlet เขียนในคอมเมนต์ว่า `sort` = `latest|oldest|status` แต่หน้าส่ง `date_desc|date_asc|order_asc|order_desc|status`** ต้องถาม; `perPage` 20; summary นับตามตัวกรองรวมสถานะ; `search` ค้นหัวข้อ/รายละเอียด/ชื่อลูกค้า/เลขลีด/ชื่อผู้รับผิดชอบ.

สิทธิ์: หน้าอ่าน `CRM_Schedule_View` (เปิดรายการ), `CRM_Schedule_Create` / `_Create_Sup` (ปุ่ม "+"; owner-check ตอนบันทึกอยู่ใน work modal), `CRM_Schedule_Edit` (ลากการ์ด, เมนูแก้ไข, ดินสอ), `CRM_Lead_View` (เมนู "ไปที่ Lead") ผ่าน `env.can()` = `PermissionService.has` (รวม super admin). สิทธิ์ของหน้า `FEATURE_CRM_Calendar` ตรวจโดย route guard ตามทะเบียน.

## 10. สิ่งที่ยังไม่ได้ทำ / ไม่แน่ใจ / คำถามถึงเจ้าของระบบ

- **live adapter (เฟส B) ไม่มี** — ขอบเขตเฟสนี้; โหมดจริงแสดง `<ts-live-missing />`
- **ไม่ได้ลองกับ backend จริง/UAT** (ห้ามตามคู่มือ) — รูปคำตอบของ `GET /schedules` อ่านจากสิ่งที่หน้า Java อ่าน (ไม่มี DTO/OpenAPI ในมือ) ; field ที่ service ส่งจริงแต่หน้าไม่อ่าน mock ไม่มี
- **harness ใช้ Chrome headless + shell replica** ของ Java (เมนู/topbar สร้างจาก Facelets+CSS จริง ไม่ใช่ Tomcat จริง) — ไม่ได้เปิดดูด้วยตาของมนุษย์; ลากด้วยเมาส์จริงและ touch ไม่ได้ทดสอบ (§6.6)
- **แถวเพิ่มเติมเฉพาะ Schedule** ยังไม่ถูกใช้โดยหน้า Activities (state ที่เขียนต่อของสองหน้าแยกกัน) — ข้อเสนอ §1
- คำถาม: (1) การ์ดแนะนำลูกค้าของช่องค้นหาควรทำงานหรือไม่ (§7.1) (2) `sort` ที่ service รองรับจริงคืออะไร (`latest|oldest|status` หรือ `date_desc|…`) (3) มีนัดหมายข้ามวันในแผนหรือไม่ (§7.4) (4) ชื่อที่มี `'` (§7.2) แก้ที่ต้นฉบับ?
