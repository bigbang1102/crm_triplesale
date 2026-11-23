# คู่มือพอร์ตหน้า Java → Angular ("สร้างจากไฟล์ Java 1:1 แล้วตรวจเทียบ")

มาตรฐานของงานนี้ (ตั้งโดยผู้ใช้): **หน้า Angular ต้องเหมือนหน้า Java จริง — โครงสร้าง, สไตล์ (ทุกพิกเซล, ทั้งธีมสว่าง/มืด, ปุ่ม A A A, ทุกขนาดจอ), ข้อความ, และ logic การทำงาน (ทุกปุ่ม/ตัวกรอง/modal/validation)** และต้อง *พิสูจน์ด้วย harness* ไม่ใช่ดูด้วยตา
ตัวอย่างที่เสร็จและตรวจครบแล้ว: **Dashboard** (`src/app/features/dashboard/`, `tools/sync-dashboard*.mjs`, `tools/compare/pages/dashboard/`) — อ่านเป็นตัวอย่างก่อนเริ่ม (โดยเฉพาะ `sync-dashboard.mjs`, `dashboard-view.ts`, `dashboard-backend.ts`, `dashboard.mock.ts`, `pages/dashboard/page.mjs`) ตัวอย่างอื่น: AI HUB (`sync-ai-hub.mjs`), แชท, Login

## 0. กติกาที่ห้ามละเมิด

- `../triple_sale_main` (Java, SVN working copy) **อ่านอย่างเดียว** ห้ามแก้/สร้างไฟล์ในนั้น
- **ห้ามคัดลอก secret**: `config-secrets.properties`, `jdbc.properties`, `dev.xhtml` (มี credential), Google Maps API key (ไฟล์ `*_land.xhtml` และที่อื่น), token/รหัสผ่านใด ๆ — ถ้าเจอใน markup/script ที่ต้องพอร์ต ให้ตัดออกและบอกใน INTEGRATION.md
- ห้ามเปลี่ยนการตั้งค่าระบบ/ความปลอดภัยของเครื่อง (เช่น PowerShell execution policy); เรียก Node โดยตรง (`node tools/…`, `node node_modules/@angular/cli/bin/ng.js …`) แทน `npm run` ถ้า npm ติดปัญหา
- **ห้ามเรียก API จริง/UAT, ห้ามใส่ credential จริง** — ทุกอย่างรันกับ mock + harness บน localhost เท่านั้น
- ห้ามแตะ dev server ของผู้ใช้ (`ng serve` พอร์ต 4200/4201) — เครื่องมือของเราใช้พอร์ตสุ่มและปิดเอง; ถ้าคุณเปิด process อะไรไว้ ต้องปิดก่อนจบ
- ไม่มี git: งานทำใน **workspace แยก** (`tools/workspace.mjs`, ดู §7) — ห้ามแก้ไฟล์นอก workspace ของคุณ
- ตอบ/เขียนเอกสารเป็นภาษาไทย (ศัพท์เทคนิคอังกฤษ); UI เป็นไทยเป็นหลัก + ปุ่มสลับ EN (ข้อความมาจาก `t('key')` ของ `I18n`)
- ก่อนอ่าน `CLAUDE.md` + `docs/analysis/03-pages-lead-activity-dashboard.md` / `04-pages-documents-ai-chat.md` (วิเคราะห์หน้า/API ที่เกี่ยวข้อง) + `docs/analysis/02-backend-auth-api-i18n.md`

## 1. หลักการ

1. **อย่าเขียนหน้าใหม่ตามความเข้าใจ — สร้างจากไฟล์ Java**: markup + CSS + สคริปต์ของหน้า Java ถูกอ่านโดย *generator* (`tools/sync-<page>.mjs`) แล้วแปลงเฉพาะส่วนที่ต้องแปลง (การ swap ที่ระบุตำแหน่งตรง ๆ; ไม่เจอ = หยุด) ได้ `<page>.html` (template), `<page>.scss`, `<page>.engine.ts` (สคริปต์ของหน้าเป็นฟังก์ชัน `startX(env)` ที่คืน `destroy`)
   - ไฟล์ที่สร้างมีหัว `GENERATED` ห้ามแก้ด้วยมือ — แก้ generator แล้วรันใหม่
   - ทำไมไม่เขียนเป็น Angular component ล้วน: หน้า Java เป็น data-driven DOM app (วาด HTML เป็น string จากข้อมูล API); การพอร์ตทีละบรรทัดคือสิ่งเดียวที่รับรองว่าหน้าจอ ข้อความ และสถานะเหมือนระบบจริง
2. **สิ่งที่เปลี่ยนจากต้นฉบับต้องอยู่ที่เดียวและบอกเหตุผล**: ทุก `swap()` ใน generator มีเหตุผล (เช่น `fetch(` → `env.fetch(`, `location.href=` → `env.navigate(…)`, `echarts` → `env.echarts`, `body[data-theme]` → `html[data-theme]`, `#{commonBean.msg['k']}` → `env.t('k')`, `#{bean.xxxJson}` → `env.initial('xxxJson')`)
3. **ตรวจทุกอย่างด้วย harness** (`tools/compare/`, อ่าน `tools/compare/README.md`): เทียบ DOM + attribute + ข้อความ + ตำแหน่ง/ขนาด + computed style + canvas ระหว่าง "หน้า Java จริงที่สร้างใหม่ใน shell replica" กับหน้า Angular ที่ข้อมูลชุดเดียวกัน ผ่านชุด scenario ที่ครอบคลุมทุกพฤติกรรม ต้อง **identical ทุกตัว** (ความต่างที่เป็นของสภาพแวดล้อมจริง ๆ ต้องมีเหตุผลเขียนไว้)
4. **backend ซ่อนอยู่หลังสัญญา (contract) เดียว**: engine เรียก `env.fetch(url, init)` ด้วย URL เดียวกับที่หน้า Java เรียก BFF (`/board/...`, `/rvapi?action=...` …) → host ส่งให้ *backend* ที่เป็น mock (เฟสนี้) หรือ live adapter (เฟสถัดไป: ย้ายตรรกะของ servlet ฝั่ง Java เป็น TS แล้วเรียก REST ของ `triplesale-service`) — engine ไม่รู้ว่าอยู่โหมดไหน

## 2. สิ่งที่ต้องส่งมอบ (เฟส A = หน้าใช้งานได้ในโหมด mock ตรงกับ Java 100%)

ต่อหน้า (ชื่อ `<page>` = id ในทะเบียน เช่น `leads`; โฟลเดอร์ feature = `src/app/features/<feature>/`):

| # | ไฟล์ | เนื้อหา |
| - | --- | --- |
| 1 | `tools/sync-<page>.mjs` + script `"<page>:sync"` (ใส่ใน INTEGRATION.md — `package.json` เป็นไฟล์ shared) | generator → `<page>.html`, `<page>.scss`, `<page>.engine.ts` |
| 2 | `<page>.ts` + `<page>-view.ts` | route component (`ts-<page>`) + host (`ViewEncapsulation.None`, `preserveWhitespaces: true`, OnPush) ที่โหลดข้อมูลตั้งต้น ให้ env แก่ engine เริ่ม/หยุด engine — pattern ตาม `dashboard.ts` / `dashboard-view.ts` |
| 3 | `<page>-backend.ts` | สัญญา: `initial(...)` (ค่าที่ server เคย render ด้วย EL เข้าหน้า) + `fetch(url, init): Promise<Response>` |
| 4 | `<page>.mock.ts` | backend จำลอง — **framework-free** (ห้าม import Angular; import ได้เฉพาะ `type` ของ backend, `@core/mock/crm-seed`, และไฟล์ mock ข้างเคียง) เพราะ harness โหลดไฟล์เดียวกันเข้า Node; ตอบ *รูปเดียวกับที่ servlet Java ตอบ*, ข้อมูลมาจาก seed เดียว (ตัวกรอง/ค้นหา/แบ่งหน้า/สร้าง/แก้/ลบ ทำงานจริงและทุกส่วนของหน้าสอดคล้องกัน) |
| 5 | host ในโหมดไม่ใช่ mock | เฟสนี้ยังไม่มี live adapter: แสดงข้อความชัดเจนบนหน้า ("ยังไม่ได้ต่อ backend จริง — เปิดโหมด mock") ห้ามเรียก BFF/URL ที่ไม่มีอยู่แล้ว; คอมเมนต์ที่ host ระบุว่า live adapter = งานถัดไป และ servlet/bean ไหนต้องย้าย |
| 6 | `tools/compare/pages/<page>/{page.mjs,scenarios.mjs}` | harness (ดู `tools/compare/README.md`) — scenario ครอบคลุมทุกพฤติกรรม (§5) |
| 7 | `*.spec.ts` | `<page>.mock.spec.ts` (สัญญา: ตัวกรอง/แบ่งหน้า/CRUD/รูปคำตอบ) · `<page>.spec.ts` (host: เรนเดอร์, เริ่ม/หยุด engine, ไม่มี listener/timer ค้าง, เปลี่ยนภาษา, navigate ผ่าน `javaLinkToRoute`) — ตามแบบ `dashboard.spec.ts`, `dashboard.mock.spec.ts` |
| 8 | `INTEGRATION.md` (ที่ราก workspace) | รายการไฟล์ shared ที่ต้องแก้ (ผู้ประสานงานทำให้): `IMPLEMENTED` ใน `app.routes.ts`, `"implemented": true` ในทะเบียน, script ใน `package.json`, key i18n ใหม่ `app.*` (ถ้ามี), bullet ใน `CLAUDE.md`, หัวข้อใหม่ใน `manual/index.html` (เขียนเป็นไฟล์ `manual-<page>.html` ชิ้นส่วน HTML ตามแบบ §24 Dashboard ของ manual: ไฟล์ที่สร้าง / host / สัญญา backend / ผลตรวจเทียบ / ความต่างที่ตั้งใจ), แถวใน README, rule ใน `core/navigation/java-links.ts` (+spec) |

เสร็จ = §6 ครบ. **ห้ามแก้ไฟล์ shared เอง** (ดู §7) ยกเว้นเพิ่มไฟล์ใหม่ในโฟลเดอร์ของหน้าตัวเอง

## 3. ขั้นตอนต่อหน้า

### 3.1 อ่านต้นฉบับให้ครบก่อนเขียนบรรทัดแรก
- ไฟล์ Java ของหน้า (ทะเบียน `legacy` บอกรายการ) + `ui:include` ทั้งหมด + CSS/JS ที่หน้าเรียก (`web/css`, `web/resources/js|support`) + **servlet/bean/service ที่หน้าเรียก** (`src/java/com/ace/manage/content/*Servlet*.java`, `*Bean*.java`, `ContactActivityApiService` … ค้นด้วย URL ที่หน้าเรียก) — ต้องรู้รูปคำตอบจริงของทุก endpoint
- รายการ: ทุก `#{…}` (EL) ในไฟล์ → ค่าจาก bean ไหน (นั่นคือ `initial`), ทุก `commonBean.msg[...]` (→ `t`), `commonBean.hasFeature(...)`/`rendered=` (→ `can('FEATURE')` ของ `PermissionService`), ทุก inline handler (`onclick="fn()"` → ฟังก์ชันต้องเรียกได้จาก DOM), ทุก `window.*`, ทุก `fetch/XMLHttpRequest`, `localStorage/sessionStorage`, `location.*`/`window.open`/`document.cookie`, `setInterval/setTimeout`, listener ระดับ document/window, `<style>` ใน body, `<iframe>`, `<form>`/`h:`/`p:` tag (ถ้ามี `p:`/`h:` มากกว่าไม่กี่ตัว = หน้า "PrimeFaces form" ต้องใช้วิธีแยก — แจ้งผู้ประสานงานก่อน)
- หน้าที่ปุ่ม/ลิงก์พาไปหน้าอื่น: `…face?…`/`…xhtml?…` → `env.navigate(javaLinkToRoute(url))`; พารามิเตอร์ที่หน้าปลายทางต้องการให้บันทึกไว้

### 3.2 generator (`tools/sync-<page>.mjs`)
ตามแบบ `sync-dashboard.mjs` (อ่านทั้งไฟล์!). ตัวช่วย: `tools/lib/port.mjs` (`reader, editor{swap,swapBlock,swapAll}, between, markupToTemplate, darkPort, undeclaredNames`) และ `tools/lib/port-kit.mjs` (`adaptation()` = กฎ global ของ stack CSS Java ที่หน้าพึ่งอยู่โดยไม่บอก, `engineScaffold()` = กรอบ `listen/tmo/track` + จำลอง `DOMContentLoaded`/`load` + กัน response ที่มาหลัง destroy + `destroy()`, **`uiDefines()`** = แยก `<ui:define name="head|content">` ของไฟล์ Facelets, **`expandIncludes()`** = แทน `<ui:include src=… >` (+ `<ui:param>`) ด้วยเนื้อไฟล์ที่ include เหมือนที่ Facelets ทำ, **`splitSection()`** = แยก `<style>` / `<script>` inline / `<link>` / `<script src>` / markup ที่เหลือออกจากกัน — ดูการใช้ใน §3.2 ข้อ 0)

0. อ่านโครงของไฟล์ด้วยตัวช่วย: `const d = uiDefines(read('pages/x.xhtml'))` → `d.head` (ส่วนใหญ่มี `<link rel=stylesheet href="../css/x.css">` ของไฟล์ CSS ภายนอก — อ่านไฟล์นั้นจาก `web/css/` หรือ `web/resources/support/`), `d.content` → `expandIncludes(d.content, read, 'pages')` → `splitSection(...)` ได้ `{ markup, styles[], scripts[], links[], externalScripts[] }`. `<script src="…resources/js/foo.js">` ที่หน้า Java โหลดเอง: คัดลอกไฟล์ **เหมือนทุกไบต์** ไว้ที่ `public/assets/java-js/foo.js` แล้วให้ host โหลดด้วย `loadScript('assets/java-js/foo.js')` (`@core/dom/load-script`) ก่อนเริ่ม engine (ตัวแปร global ที่ไฟล์นั้นสร้าง engine เรียกผ่าน `window.`); ในหน้า Java replica ใส่ `<script src="/triplesale/resources/js/foo.js">` ที่เดิมเหมือนต้นฉบับ. สคริปต์ที่ template.xhtml โหลดให้ทุกหน้า (swal, input_guard, no_autofill, open_down_select, crm_error_popup, phone_format) Shell ของ Angular จัดให้แล้ว — **`swal(...)` ใช้ไลบรารีตัวจริงของ Java** (`@core/dom/swal` → `env.swal = (o) => loadSwal().then((swal) => swal(o))`) หน้าตาจึงเหมือนเดิมทุกพิกเซล (อย่าใช้ `DialogService` กับหน้าที่พอร์ตแบบนี้)
ลำดับ:
1. markup: ตัดจาก xhtml → `markupToTemplate` (แปลง `#{commonBean.msg[…]}`, `ui:fragment rendered`, `<x/>`, `<tbody>` implicit) — ค่า EL อื่นที่ server เคย render ในข้อความ → placeholder → `{{ ini.x }}`
2. CSS: `<style>` ของหน้า (+ `<link>` css ของหน้า เช่น `css/lead.css`) verbatim ยกเว้น `body[data-theme="dark"]` → `html[data-theme='dark']` และ `--fs-adj` → `--ts-fs-adj`; บล็อก "Angular adaptation" จาก `adaptation({ read, scope, host, text })`; `darkPort(dark_mode.css …)` ต่อท้าย
3. script: แปลงด้วย swap ตามตัวอย่าง — จุดที่ต้องจัดการ *ทุกหน้า*:
   - EL → `env.t(...)`/`env.initial(...)`/ค่าอื่นจาก env (`env.ctx`, `env.ggwBranch` …)
   - `fetch(` → `env.fetch(`; `XMLHttpRequest` → ถ้ามีต้องห่อผ่าน env (ห้ามเหลือ)
   - `window.location.*`, `location.href=`, `location.reload()`, `window.open` → `env.navigate/env.reload/env.open`
   - `document.addEventListener/window.addEventListener` → `listen(...)`; `setTimeout` → `tmo(...)`; `setInterval`/observer → เพิ่มใน scaffold ให้ destroy เก็บกวาด (generator มี guard ห้ามเหลือถ้ายังไม่รองรับ)
   - `document.addEventListener('DOMContentLoaded', …)` / `window 'load'` → `onReady(...)`/`onLoad(...)`
   - `window.fn = function` → ตัวแปรโลคัลด้วย (§ตัวอย่าง `WINDOW_FNS`) + inline handler ที่เรียกฟังก์ชันที่ไม่ใช่ `window.*` → export ผ่าน `window.` (HANDLERS_EXTRA)
   - ธีม: `document.body.getAttribute('data-theme')` → `document.documentElement…` (Angular วางธีมที่ `<html>`)
   - ไลบรารี (ECharts ฯลฯ): ผ่าน env (โหลดเป็น module ในเครื่อง ไม่ใช้ CDN) — ถ้าหน้า Java โหลดจาก CDN/ไฟล์ใน `web/js` ให้ใช้ไฟล์เดียวกันกับที่ Java ใช้ (ตรวจ license/ขนาด)
   - ตัวตรวจท้าย generator: ไม่มี EL เหลือ, ไม่มี `setInterval/XHR/localStorage/sessionStorage/cookie/location/window.open/.face/.xhtml` เหลือในโค้ด (ถ้าหน้าใช้ localStorage/sessionStorage จริง → ผ่าน `env.storage` ที่ host ให้ + บอก key ที่ใช้), `undeclaredNames()` (strict mode ของ ES module ต่างจาก sloppy script ของ Java)
4. สร้างไฟล์ + เขียนผลลัพธ์สรุปบรรทัดสุดท้าย (จำนวน handler, ขนาด)

### 3.3 host + backend + mock
- host: โหลด `backend.initial(...)` → ใส่ใน template (`ini`) → `cdr.detectChanges()` → สร้าง `env` → `start<Page>(env)`; `ngOnDestroy`/`DestroyRef` เรียก `stop`; ภาษาเปลี่ยน = `epoch` ใหม่เหมือน `location.reload()` ของ Java (ดู `dashboard.ts`)
- ข้อความ: `t('label.x')` ใช้ key เดิมของ Java (ใน `public/assets/i18n/{th,en}.json` มีครบ 2,838 key) — **ห้ามแก้ไฟล์ i18n**; key ใหม่ (ข้อความที่ Java ฝังใน JS/สร้างฝั่ง server) ให้บันทึกใน INTEGRATION.md พร้อมข้อความ th/en
- สิทธิ์ `can('FEATURE')`: inject `PermissionService`; ใน mock ผู้ใช้ทดสอบได้ทุก feature ตามที่ `AuthService` mock ให้
- mock: ยึดรูปคำตอบจริงของ servlet Java (อ่านโค้ด servlet) รวม field ที่หน้าใช้, error shape, สถานะ HTTP, หน่วงเวลา (`delayMs`), การแบ่งหน้า; ข้อมูลทดสอบสมจริง (ภาษาไทย, ชื่อ/เบอร์/จังหวัด ไม่ใช่ข้อมูลจริงใคร) ใช้ `@core/mock/crm-seed` (`seedLead(n)`, `seedProspect(n)`, `SEED_EMPLOYEES`, `SEED_GROUPS`, `SEED_TODAY` …) เป็น "ตัวละครกลาง" ให้ลีดที่เห็นในรายการ = ลีดที่เปิดในหน้ารายละเอียด; ใช้ `SEED_TODAY` เป็น "วันนี้" (ห้ามอ่าน `Date.now()` ใน mock — harness ต้องได้ข้อมูลเท่ากันสองฝั่ง)
- ไฟล์อัปโหลด/ดาวน์โหลด/พิมพ์ (PDF, export CSV): mock ตอบไฟล์เล็ก ๆ จริง; พฤติกรรมฝั่ง browser (Blob/download) ต้องเหมือนเดิม

### 3.4 harness (`tools/compare/pages/<page>/`)
- `page.mjs`: `build(ctx)` สร้างหน้า Java จริง: markup + สคริปต์ + `<style>` ของไฟล์ xhtml, แทน EL (`#{commonBean.msg['k']}` จาก th.json, `#{bean.x}` จาก `initial()` ของ mock ผ่าน `ctx.loadTs`), แล้ว `ctx.shell.build('home', '3', 'h-<page>.html', { head, content, tail })`; `newState`/`handle` เสิร์ฟ BFF ที่หน้า Java เรียก (`/triplesale/board/...` → `backend.fetch`) — ตามแบบ `pages/dashboard/page.mjs`
- ถ้าหน้า Java ใช้ asset/สคริปต์ที่ `shell.TEMPLATE_SCRIPTS()` ไม่ครอบคลุม ให้ใส่ใน `head`/`tail` เหมือนที่ template.xhtml ทำ (อ่าน `WEB-INF/pages/template.xhtml`)
- Java replica ต้องรันสคริปต์ *ตัวจริง* ของหน้า (ไม่ใช่ที่ generator แปลงแล้ว) — นี่คือจุดที่ harness จับความผิดพลาดของการแปลง

### 3.5 วงจรตรวจ
```
node tools/sync-<page>.mjs                       # สร้างไฟล์
node tools/compare/run.mjs <page> --list
node tools/compare/run.mjs <page> --filter '^overview' --jobs 4      # ทีละกลุ่ม (build ครั้งแรกใช้ ~10 วิ; รอบถัดไป --no-build ถ้าไม่ได้แก้ซอร์ส Angular)
node tools/compare/run.mjs <page> --show <scenario> [--style|--geom] # ดูความต่าง
```
เมื่อต่าง: **หาสาเหตุที่ต้นทาง** (generator ขาด CSS global ของ Java? swap ผิด? mock ตอบรูปไม่เหมือน? host ใส่ attribute เพิ่ม?) แล้วแก้ที่นั่น — ห้ามแก้ harness ให้ "มองไม่เห็น" ความต่าง

## 4. บทเรียนจาก Dashboard (ที่จะเจอซ้ำ)

- **CSS global ของ Java ที่หน้าพึ่งโดยไม่บอก**: ฟอนต์ `NotoSansThai` ที่ template บังคับกับ tag, margin/line-height ของ `h1–h6`/`p` (layout-modify.css), `label` 14px คงที่ (project_root.css), คลาส PrimeFlex ที่ชื่อซ้ำกับ Bootstrap (`.col-12` ได้ padding .5rem), reset ของ form control — `adaptation()` อ่านจากไฟล์จริงให้แล้ว (ใช้ `text` = markup+script เพื่อเลือกคลาส PrimeFlex ที่ใช้)
- สคริปต์ Java ทำงานตอนเอกสารยัง "loading" แล้วค่อยรอ `DOMContentLoaded` — scaffold จำลองเหตุการณ์นี้หลังสคริปต์จบ (ตัวแปรท้ายไฟล์ถูกกำหนดครบก่อน handler ทำงาน)
- Java script เป็น sloppy mode (implicit global, function ใน block ถูก hoist) — engine เป็น ES module (strict): `undeclaredNames()` จับ ReferenceError ที่รอวันระเบิด; ชื่อที่ต้นฉบับก็ไม่ได้ประกาศ (ใช้หลัง `typeof x === 'function'`) ใส่ใน allow-list พร้อมเหตุผล
- ฟอนต์ไม่พร้อมตอน `DOMContentLoaded` ทำให้ ECharts วัด legend ผิด (race ที่ Java จริงก็มี) — replica ใส่ `<link rel=preload>`
- `<tag/>` ใน XHTML → HTML ต้องเป็น `<tag></tag>` (ยกเว้น void), `<table><tr>` ต้องใส่ `<tbody>` เอง, ใน template ของ Angular ต้อง escape `@`/`{`/`}`
- ข้อมูลที่ "เป็นตอนนี้" (`new Date()`) ใน mock ทำให้สองฝั่งต่างกัน — ใช้ `SEED_TODAY`; ที่ต้องเป็นเวลาปัจจุบันจริง (ค่า default ของแถวใหม่) ให้ `normalize` ใน `page.mjs` พร้อมเหตุผล
- Java เก็บธีมที่ `<body>`, Angular ที่ `<html>`; ปุ่ม A A A: Java `--fs-adj`, Angular `--ts-fs-adj` (generator ทำให้)
- scenario ที่ต้องรอ network/animation: ใช้ `waitFor(...)` แทน `sleep` เดาเวลา — ตัวที่ต่างจะถูกรันซ้ำทีละตัว แต่ scenario ที่ flaky ต้องแก้ที่ scenario
- งานเขียนไฟล์ผ่าน Bash: Bash tool กิน backslash 1 ชั้น — เขียน/แก้ไฟล์ด้วยเครื่องมือ Write/Edit หรือเขียนเป็นสคริปต์ไฟล์ อย่าใช้ `node -e '…'` กับ regex/`\n`

## 5. scenario ต้องครอบคลุมอะไร

หน้าแรก (สว่าง/มืด; จอ 390 · 768 · 1024 · 1280 · 1920; ไทย/อังกฤษ; ปุ่ม A A A สอง ทิศทาง) · ทุกแท็บ/มุมมอง/โหมด · ทุกตัวกรอง/ค้นหา/เรียง/แบ่งหน้า/infinite scroll · ทุก modal (เปิด, ค่าตั้งต้น, validation ครบทุกข้อความ, ปิดด้วย Esc/คลิกนอก/ปุ่ม) · การสร้าง/แก้/ลบ/ย้าย (drag&drop ใช้ event ที่หน้าฟัง) แล้วดูผลลัพธ์ · สถานะ loading/ว่าง/error (mock ตอบ 500/ว่างได้ด้วย query พิเศษ หรือ scenario สั่งผ่าน `win`) · สิทธิ์ที่ต่างกัน (ซ่อน/แสดงปุ่มตาม `can(...)`) · ลิงก์ไปหน้าอื่น (ตรวจว่า navigate ไป route ที่ถูกต้อง) · ฟอร์มที่ส่งไฟล์ · คีย์ลัด · การเปลี่ยนภาษาแล้วหน้าโหลดใหม่
ชื่อ scenario: `overview`, `overview-dark`, `overview-390`, `tab-<x>`, `modal-<x>`, `en-…`, `fs-plus-…` ตามแบบ Dashboard (~100+ ตัวสำหรับหน้าใหญ่)

## 6. เกณฑ์ว่าเสร็จ (Definition of Done) ต่อหน้า

1. `node tools/compare/run.mjs <page>` → **ทุก scenario identical** (exit 0), ไม่มี `pageerror`/request ล้มในรายงาน
2. `node tools/sync-<page>.mjs` รันซ้ำแล้วไฟล์ไม่เปลี่ยน; generator หยุดเมื่อต้นฉบับเปลี่ยน (swap ไม่เจอ)
3. `CI=1 node node_modules/@angular/cli/bin/ng.js test --no-watch --include 'src/app/features/<feature>/**/*.spec.ts'` ผ่านทั้งหมด; `node node_modules/@angular/cli/bin/ng.js build` (production) ผ่าน ไม่มี warning ใหม่; งบ bundle (`angular.json` budgets) ไม่เกิน — ถ้าเกิน หน้าต้อง lazy-load ส่วนหนัก (ECharts, mock) ตามแบบ Dashboard
4. host: ไม่มี listener/timer/observer/ไฟล์ค้างหลัง destroy (spec ตรวจ); ไม่อ่าน token เอง; ไม่เรียก URL ของ BFF ในโหมดไม่ใช่ mock
5. ไม่มี secret/credential/URL จริงในไฟล์ที่สร้างหรือเขียน; ไม่ใช้สีนอก `shared/constants/palettes.ts` ที่หน้า Java ไม่ได้ใช้เอง (หน้า Java ใช้สีไหนก็ verbatim)
6. `INTEGRATION.md` ครบ (§2 ข้อ 8) และสรุปผล: จำนวน scenario, ความต่างที่ตั้งใจพร้อมเหตุผล, สิ่งที่ยังไม่ได้ทำ/ไม่แน่ใจ, endpoint/servlet ที่ live adapter ต้องย้าย, คำถามถึงเจ้าของระบบ

## 7. Workspace แยก (ทำงานขนานกับคนอื่น)

```bash
node tools/workspace.mjs create <name>      # ผู้ประสานงานสร้างให้: ../triple_sale_angular_ws_<name> (node_modules เป็น junction)
node tools/workspace.mjs status <name>      # ไฟล์ที่เปลี่ยน
node tools/workspace.mjs merge  <name>      # ดูว่าจะ copy กลับอะไร (dry run)
node tools/workspace.mjs merge  <name> --apply
```
- **ทำงานใน workspace ของคุณเท่านั้น** (cwd = โฟลเดอร์นั้น). Java อยู่ที่ `../triple_sale_main` (อ่านอย่างเดียว)
- ไฟล์ที่ **เพิ่ม/แก้ได้เอง**: `src/app/features/<feature-ของคุณ>/**`, `tools/sync-<page>.mjs`, `tools/compare/pages/<page>/**`, `src/app/core/mock/<page>-*.ts` (ถ้าต้องมี fixture ร่วมของหน้า), `INTEGRATION.md`, `manual-<page>.html`
- ไฟล์ **shared — ห้ามแก้** (ผู้ประสานงาน merge เอง; ใส่การเปลี่ยนที่ต้องการใน INTEGRATION.md): `src/app/app.routes.ts`, `src/app/core/navigation/**` (ยกเว้นที่ระบุว่าเพิ่ม rule ใน `java-links.ts`), `package.json`, `CLAUDE.md`, `README.md`, `manual/**`, `docs/**`, `public/assets/i18n/**`, `tools/lib/**`, `tools/compare/lib/**`, `tools/compare/run.mjs`, `src/app/core/**` อื่น ๆ
  - ถ้า `tools/lib/**` หรือ `tools/compare/lib/**` มี bug/ขาดความสามารถ: แก้ **ใน workspace ของคุณ** เท่าที่จำเป็นให้ทำงานต่อได้ แล้วบันทึกในตอนต้นของ INTEGRATION.md (ไฟล์, สาเหตุ, diff) เพื่อให้ผู้ประสานงานนำเข้า; แก้แบบ backward-compatible เสมอ (หน้าอื่นใช้อยู่)
- `src/app/core/mock/crm-seed.ts` เป็นของกลาง อ่านอย่างเดียว — ต้องการข้อมูลเพิ่มให้สร้างใน mock ของหน้า (derive จาก `seedLead(n)`)

## 8. รายงานผล (ข้อความสุดท้ายของงาน)

สั้น ตรงประเด็น (ภาษาไทย): หน้าที่เสร็จ/ไม่เสร็จ · ผล `compare` (จำนวน scenario, identical กี่ตัว, ที่ต่างและเหตุผล) · ผลเทสต์/บิลด์ · รายการไฟล์ที่เพิ่ม · รายการที่ต้อง merge เอง (ชี้ไป INTEGRATION.md) · ความเสี่ยง/สิ่งที่ไม่แน่ใจ · endpoint ที่ live adapter ต้องทำ
อย่าอ้างว่าเสร็จถ้ายังมี scenario ที่ต่าง หรือยังไม่ได้รัน — บอกตามจริง

## 9. เฟส B — live adapter (เรียก REST จริงแทน mock)

หน้าที่ผ่านเฟส A แล้ว (engine + harness identical) ต่อ backend จริงโดย **ไม่แตะ engine/ไฟล์ที่ generate**: เพิ่ม `<page>.live.ts` ที่ตอบ URL ของ BFF เดิม (`fetch('/board/leads?…')`) ด้วย `Response` จริงที่ประกอบจากการเรียก REST ของ `triplesale-service` ผ่าน HttpClient ของแอป (Bearer interceptor, 401 = session หมด, API log) — ทำสิ่งที่ servlet/bean ของ Java เคยทำทุกอย่าง (role pre-check, เรียก upstream, ทำความสะอาด/แปลภาษา/เปลี่ยนชื่อ field, map status, filter-state → client storage). ตัวอย่างที่เสร็จและพิสูจน์แล้ว: `features/drilldown/drilldown.live.ts` (+ `drilldown.live.spec.ts`, `page.upstream` ใน `tools/compare/pages/drilldown/page.mjs`), `features/dashboard/dashboard.live.ts`

### 9.1 โครงที่ใช้ร่วม — `src/app/core/live/` (framework-free ยกเว้น `rest-deps.ts`)
| ไฟล์ | หน้าที่ |
| --- | --- |
| `rest.ts` | `RestDeps` (`call`, `serviceApi`, `dashboardApi`, `user`, `hasRole`, `lang`, `masterText`, `asset`), `service/get`, `body200` (= `Data_API.sendGET`: คืน body เมื่อ 200 เท่านั้น ไม่งั้น `''`), `result`, `errorMessage`, `jsonResponse`, `textResponse`, `passThrough`, `parsePageUrl`, `numParam`, `RouteHandler`, `composeRoutes(...)` (handler แรกที่ไม่คืน `null` ตอบ; ไม่มี = 404 JSON), `bodyOf(init)` |
| `rest-deps.ts` | `injectRestDeps()` / `restDepsOf(injector)` — สร้าง `RestDeps` จาก HttpClient/AuthService/PermissionService/I18n (host เรียกเฉพาะตอนไม่ใช่ mock: `restDepsOf(inject(Injector))`) |
| `org-json.ts` | พฤติกรรม org.json ที่ Java ใช้ (`optString`, `optLong`, `optInt`, `getInt` ของ string, `firstNonNull*`, `parseJson`) — ใช้เมื่อ servlet อ่าน JSON ด้วย `org.primefaces.shaded.json` |
| `json-java.ts` | JSON แบบ jakarta.json/Parsson (เก็บข้อความตัวเลข `12.50`, ลำดับ key, `JsonValue.toString()` แบบ compact) — ใช้เมื่อผลลัพธ์เป็น *ข้อความ* (เช่น ตารางของ drilldown) |
| `board-master.live.ts` | `boardMasterRoutes(deps)` = servlet master-data ของบอร์ดทั้งหมด (movement-types, employees, sale-groups/persons, tags, provinces(+กรองไทย), districts, sub-districts, metro-geo, fiscal-years, material-groups/materials, master/activity-groups, master/employees-by-activity-group, chat-master-data) + `MasterDataI18n` (`translate`, `translateTh`, …) + `fetchMasterArray` (= `LeadBoardView.fetchMasterArrayJson`) — **หน้าใช้ของนี้ ห้ามเขียน servlet เหล่านี้ซ้ำ** |
| `rest-fake.ts` | `fakeRest(answer, opts)` — `RestDeps` จำลองสำหรับ spec (บันทึก `calls`) |

### 9.2 ต่อหน้า (สิ่งที่ต้องส่งมอบ)
1. `src/app/features/<feature>/<page>.live.ts` — `createLive<Page>(deps: RestDeps): <Page>Backend`. ประกอบจาก `composeRoutes(boardMasterRoutes(deps), <routes ของหน้า>…)`; แต่ละ servlet = 1 ฟังก์ชันที่ทำเท่าที่ Java ทำ (อ่าน servlet/bean/service ทั้งไฟล์ — อย่าเดา; ทุก default/clamp/status/ข้อความผิดพลาด/ลำดับ key ที่หน้าอ่านต้องเหมือน). ไฟล์ที่ใหญ่ให้แยก pure part (`<page>.live.parse.ts`) ตามแบบ dashboard
2. host (`<page>-view.ts`): `backend()` เลือก mock/live — `mock ? (await import('./<page>.mock')).createMock…() : (await import('./<page>.live')).createLive…(restDepsOf(this.injector))`; ลบ `ts-live-missing` ออกจาก route component; spec ของ host ปรับตาม
3. **spec** `<page>.live.spec.ts` ด้วย `fakeRest` — ครอบทุก route: URL/query ที่ยิง REST (ลำดับ param, encoding, param ว่างไม่ส่ง), role gate (403 + ข้อความ), ทุกทางผิดพลาด (non-200, ไม่ใช่ JSON, ไม่มี result, status 0), การแปลง/ทำความสะอาด/rename, EN vs TH, ค่า default/clamp
4. **harness `--live`**: เพิ่ม `upstream(req, state, ctx)` ใน `tools/compare/pages/<page>/page.mjs` = REST service จำลองที่ตอบจาก *ข้อมูล mock ชุดเดียวกับที่ replica Java ได้* (รูปเดียวกับที่ service จริงส่ง: path, param, envelope, ชื่อ field — ไม่ใช่รูปของ BFF) แล้ว `node tools/compare/run.mjs <page> --live` ต้อง **identical ทุก scenario** (ดู `lib/live-upstream.mjs`, ตัวอย่าง drilldown). สถานการณ์ที่ REST ทำไม่ได้ (servlet โยน exception, proxy ตอบ HTML) → `live: false` ใน opts ของ scenario (ข้าม); สถานการณ์ที่ mock เล่นด้วยรหัสพิเศษ → `live: { code, hook }` (hook ไปถึง `state.hook`)
5. ห้ามเรียก URL ของ BFF (`/board/…`, `config.apiBase`) จาก host ในโหมด live — ทุกอย่างผ่าน `deps.call`
6. INTEGRATION.md: servlet ไหนพอร์ตแล้ว/ไม่พอร์ต (พร้อมเหตุผล เช่น cache ของ session), สิ่งที่ยืนยันกับ service จริงไม่ได้ (ไม่มี test account — fixture มาจากโค้ด Java ไม่ใช่ข้อมูลจริง), คำถามถึงเจ้าของ backend

### 9.3 ความจริงที่ต้องบอกผู้ใช้เสมอ
- `triplesale-service` ต้อง Bearer ทุก endpoint และไม่มี OpenAPI สาธารณะ; เรายังไม่มี test account → live adapter **พิสูจน์ได้ถึง "ทำเหมือน servlet ของ Java บน fixture ที่เขียนจากโค้ด Java"** (spec + `--live` ที่ใช้ service จำลอง) ไม่ใช่ "ถูกต้องกับข้อมูลจริง" — ต้องมี smoke test ด้วยบัญชีทดสอบจริงอีกครั้ง
- ห้ามใส่ credential/URL จริง/คีย์ใน repo; dev proxy (`proxy.conf.json`) ชี้ UAT gateway เท่านั้น
- cache ใน session ของ servlet (Provinces, countries, DashboardResponseCache ฯลฯ) ไม่พอร์ต — เบราว์เซอร์ถามใหม่; filter-state ที่ Java เก็บใน session → client storage
