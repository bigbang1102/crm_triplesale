# Triple Sale — Angular

Frontend ใหม่ของระบบ Triple Sale ที่ย้ายมาจาก `triple_sale_main` (Java EE: JSF + PrimeFaces + Spring)
เป้าหมาย: **โครงสร้างเดียวกัน · ทำงานเหมือนเดิม · หน้าตาเหมือนเดิม**

> 📘 **อ่านคู่มือก่อน:** [`manual/index.html`](manual/index.html) — สถาปัตยกรรม โครงสร้างโฟลเดอร์ ทะเบียนหน้า แผนงานเป็นเฟส การตัดสินใจ และคำถามที่ต้องยืนยัน

## เริ่มใช้งาน

```bash
npm install
npm start              # http://localhost:4200  (โหมด mock — ไม่ต้องมี backend)
npm run start:live     # ต่อ API จริง (UAT gateway) ผ่าน proxy.conf.json: /triplesale-auth + /triplesale-service — แก้ target ที่ไฟล์นั้นแล้วรีสตาร์ท
npm test               # unit test (Vitest)
npm run build          # production → dist/triple-sale-angular
```

บัญชีทดลองในโหมด mock: `demo` (สิทธิ์ครบ) · `multi` (เลือกบริษัท) · `viewer` (สิทธิ์จำกัด) · `admin` (super_admin) · รหัสผ่านอะไรก็ได้ ยกเว้น `wrong`

ต้องใช้ Node ≥ 20.19 / 22.12 · บน Windows ถ้า PowerShell ติด execution policy ให้ใช้ Command Prompt หรือ `npm.cmd`

## สถานะ

เฟส 0 (รากฐาน) เสร็จ: core layer, layout shell (ขนาด/สี/ไอคอนวัดเทียบกับ Java แล้ว ทั้งธีมสว่างและมืด), theme tokens, **หน้า login (เหมือน `web/index.xhtml` 1:1 — สร้างจากไฟล์ Java ด้วย `npm run login:sync` ตรวจเทียบแล้ว)**, **หน้า Dashboard 10 แท็บ + iframe ปฏิทิน/KPI (เหมือน Java 1:1 — `npm run dashboard:sync`, ตรวจเทียบ 110+ สถานการณ์ด้วยชุด `tools/compare/dashboard`, backend จำลองและ backend จริงเรียก dashboard-triplesale-service ตรง)**, หน้าระบบ, ชุดสีกลาง, i18n (th/en 2,838 key), mock backend, ปุ่ม Log (`features.apiLog`), **AI HUB ครบหน้ารวม + 13 เครื่องมือ**, **แชท**, **AI แปลเอกสาร** และ **ปุ่ม AI ลอย + ผู้ช่วยสอบถามการใช้งาน** (เหมือน Java 1:1 — ตรวจเทียบ DOM/สไตล์แล้ว), สคริปต์ global ของ template Java 5 ตัว (`input_guard` · `no_autofill` · `phone_format` · `open_down_select` · `drag_scroll`) ระดับ shell, **เมนู CRM / งานขาย / รายงานส่วนที่เป็น HTML+JS ของ Java พอร์ตแล้วในโหมด mock** — หน้าแรก CRM · โอกาสขาย (Board/List) · Lead detail · การติดต่อ + work modal · ปฏิทินงาน · ลูกค้าเป้าหมาย · DrillDown · ใบรับเงิน RV (รายการ + ฟอร์ม) · รายงาน · ข้อมูลประกอบ (หน้ารวม + รายการ + ฟอร์ม 7 ชนิด — widget ของ PrimeFaces ตัวจริง, ตรวจเทียบ 386 สถานการณ์) · ฟอร์มลูกค้าเป้าหมาย เพิ่ม/ดู/แก้ไข (`prospect-form` — ตรวจเทียบ 291 สถานการณ์): สร้างจากไฟล์ Java ด้วย `npm run <หน้า>:sync` และตรวจเทียบกับหน้า Java จริงด้วย `node tools/compare/run.mjs <หน้า>` (Chrome headless; ทุกสถานการณ์เหมือนทุกบรรทัด) — **ยังไม่ต่อ backend จริง** (โหมดไม่ใช่ mock ขึ้น "ยังไม่ได้เชื่อม"; รายการ servlet ที่ต้องย้ายอยู่ที่ `docs/integration/`), เทสต์ 1,908 ข้อ
หน้าฟังก์ชันที่เหลือ (เอกสารขาย QT/BK/OB/AQ/AD, ลูกค้าเป้าหมายที่เป็น PrimeFaces, market plan) มี route + หน้า placeholder ที่บอกไฟล์ต้นทาง/API/หมายเหตุ — ดูรายการและแผนที่ manual หัวข้อ 6 และ 14

## โฟลเดอร์

| โฟลเดอร์ | คืออะไร |
| --- | --- |
| `src/app/core` | config · auth · http · permissions · i18n · prefs · navigation (ทะเบียนหน้า + เมนู) |
| `src/app/core/live` | โครงร่วมของ **live adapter** (เฟส B): แทน servlet ของ Java (`/board/*` …) ด้วยโค้ดในเบราว์เซอร์ที่เรียก REST ของ `triplesale-service` ผ่าน HttpClient — `rest.ts` (RestDeps/composeRoutes) · `org-json.ts` · `json-java.ts` · `board-master.live.ts` · `opportunity-core.live.ts` · `dashboard-api.live.ts` · `opportunities.live.ts` · `prospect*.live.ts` · `activities.live.ts` · `rest-fake.ts` (service จำลองสำหรับ spec); ตรวจเทียบ Java ด้วย `node tools/compare/run.mjs <หน้า> --live` (ดู `docs/porting-guide.md` §9) |
| `src/app/layout` | shell · แถบซ้าย · แท็บบน · ฟุตเตอร์ |
| `src/app/shared` | ชุดสี · directives · UI ที่ใช้ร่วมกัน |
| `src/app/features` | โมดูลธุรกิจ (หนึ่งโฟลเดอร์ต่อหนึ่ง feature) |
| `config/` | runtime config ต่อสภาพแวดล้อม (dev / live / prod) |
| `docs/analysis/` | รายงานวิเคราะห์ระบบ Java 4 ฉบับ |
| `manual/` | คู่มือ (HTML) |
| `tools/` | `convert-i18n.mjs` · `sync-manual.mjs` · `sync-ai-hub.mjs` (สร้างหน้า AI HUB จากไฟล์ Java) · `sync-chat.mjs` (สร้างหน้าแชทจากไฟล์ Java) · `sync-java-dom.mjs` (สร้าง `core/dom` จากสคริปต์ global ของ template Java: input_guard · no_autofill · phone_format · open_down_select · drag_scroll) · `sync-ai-fab.mjs` (ปุ่ม AI ลอย + สอบถามการใช้งาน) · `sync-ai-translator.mjs` (AI แปลเอกสาร) · `sync-login.mjs` (หน้า Login) · `sync-dashboard.mjs` + `sync-dashboard-frames.mjs` (หน้า Dashboard 10 แท็บ + iframe ปฏิทิน/KPI) · `sync-<หน้า>.mjs` ของเมนู CRM / งานขาย / รายงาน (opportunities · opportunity-detail · activities · home · schedule · prospects · drilldown · receipts · receipt-form · sales-doc-list · sales-doc-form · report · supporting-docs) · `lib/` (`port.mjs` · `port-kit.mjs` · `work-modal.mjs` · `sales-doc.mjs` · `sales-doc-forms.mjs` · `sales-doc-libs.mjs` · `facelets.mjs` · `port-script.mjs` — ชิ้นส่วนของ generator) · `compare/` (ตัวเทียบ Java–Angular แบบ headless — README ในนั้น) · `workspace.mjs` (สำเนาโปรเจกต์แยกสำหรับทำงานขนาน) |
| `docs/porting-guide.md` · `docs/integration/` | วิธีพอร์ตหน้าจากไฟล์ Java (อ่านก่อนทำหน้าใหม่) · บันทึกส่งมอบของแต่ละหน้า (ไฟล์ที่สร้าง, ผลตรวจเทียบ, servlet ที่ live adapter ต้องย้าย, คำถามถึงเจ้าของระบบ) |

## Backend

**ตัดสินใจ 20/10/2026: backend = REST API เท่านั้น ไม่ใช้ Tomcat/BFF (WAR เดิม)** — Angular เรียก `triplesale-auth` และ `triplesale-service` ตรงด้วย `Authorization: Bearer` (token ใน `sessionStorage`) ผ่าน origin เดียวกับเว็บ (dev: `proxy.conf.json`, ใช้งานจริง: reverse proxy — gateway ไม่เปิด CORS ให้ origin อื่น) · base URL ตั้งใน `config/*/app-config.json` → `api.auth` / `api.service` · หน้าที่พอร์ตก่อนการตัดสินใจนี้ (AI HUB, แชท, AI แปลเอกสาร, ผู้ช่วย) ยังเรียก path ของ BFF และต้องย้ายทีละหน้า — ดู manual หัวข้อ 9, ADR-001 และหัวข้อ 18
