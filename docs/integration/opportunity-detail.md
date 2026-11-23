# INTEGRATION — หน้า Lead detail (`/crm/opportunities/:opportunityId`)

> **อัปเดต 2026-10-21 — เฟส B (live adapter) ของหน้านี้ทำแล้ว: ดู `docs/integration/lead-detail-live.md`.** ข้อความ "ยังไม่มี live adapter / `<ts-live-missing />` / เหลือ REST" ในไฟล์นี้เป็นสถานะของเฟส A (ตารางที่ต้องพอร์ตด้านล่างยังใช้เป็นแผนที่ของ servlet ได้)

workspace: `triple_sale_angular_ws_leaddetail` · Java ต้นฉบับ: `pages/lead_detail.xhtml` + `components/lead_detail/*.xhtml` (8 modal) + `components/move_step_modal.xhtml` + `components/access_pop.xhtml` + `components/work_modal.xhtml` (ui:param `page=lead_detail`) · เฟส A (โหมด mock เท่านั้น — โหมดจริงแสดง `<ts-live-missing />`)

> ไฟล์นี้บอกผู้ประสานงานว่า (1) ต้อง merge อะไรเข้า main, (2) live adapter (เฟส B) ต้องพอร์ตอะไรจาก Java, (3) ผลที่ตรวจแล้ว/ยังไม่ได้ตรวจ

---

## 0. สรุปสถานะ

| รายการ | สถานะ |
| --- | --- |
| หน้า lead-detail (page + 11 modal + work_modal) | พอร์ตครบ — generator `tools/sync-opportunity-detail.mjs` (`npm run opportunity-detail:sync`) |
| harness เทียบกับหน้า Java จริง | 545 scenario · เหมือนทุกบรรทัด **545 (ทั้งหมด)** · ต่าง 0 (รายละเอียดข้อ 6) |
| `ng test --include 'src/app/features/opportunity-detail/**/*.spec.ts'` | **ผ่านทั้งหมด 41/41** (`lead-detail.mock.spec.ts` 21 เทสต์ + `lead-detail.spec.ts` 20 เทสต์; `CI=1 ng test --no-watch --include …`; รันเฉพาะไฟล์ของหน้านี้) |
| `ng build` (production) | **ผ่าน ไม่มี warning / ไม่เกิน budget** — chunk lazy `lead-detail` 724.7 kB raw (104.5 kB ส่งจริง) + `lead-detail-mock` 54.9 kB (lazy แยก); styles ของ component อยู่ใต้ `anyComponentStyle` (warning 140 kB) โดยไม่มี warning; initial bundle ไม่เปลี่ยน |
| โหมดจริง (live adapter) | **ยังไม่ทำ** (เฟส B) — รายการที่ต้องพอร์ตอยู่ในข้อ 5 |

---

## 1. ไลบรารีร่วมที่แก้ใน workspace นี้ (ผู้ประสานงานนำเข้า main — แก้แบบ backward-compatible ทั้งหมด)

ทั้งสามไฟล์อยู่ใต้ `tools/compare/lib/` (ทุกหน้าใช้ร่วมกัน) ฉบับใน workspace = ฉบับของ main ณ การ `refresh` ครั้งล่าสุด (วันที่ 20/10/2026 หลัง `work-modal.mjs` เข้า main) + ส่วนที่เพิ่มด้านล่าง ทุกส่วนเป็นแบบ "ไม่ส่งค่า = พฤติกรรมเดิม"

| ไฟล์ | สาเหตุ | diff |
| --- | --- | --- |
| `tools/compare/lib/runner.mjs` | หน้าที่เปลี่ยน **ทั้งสิทธิ์และตัวพนักงาน** ต่อ scenario (lead-detail: `all` / `owner` / `viewer` / `noactivity` — `employeeId` ใน session ต่างกัน; `opts.denyRoles` ของ main ตัดได้แต่ role ไม่เปลี่ยน `employeeId`) ต้องแก้ session ฝั่ง Angular เอง จึงเพิ่ม hook ที่ page config เป็นผู้กำหนด | หลังบรรทัด `let baseSession = withoutRoles(…)` (เดิม `const`) เพิ่ม: `if (task.side === 'ng' && cfg.ngSession) baseSession = cfg.ngSession(baseSession, opts);` — page ที่ไม่มี `ngSession` ไม่กระทบ |
| `tools/compare/lib/dump-page.js` | `background-image` ของ element ถูกตัดที่ 60 ตัวอักษรก่อนที่จะ normalize ต้นทาง URL (Java: `http://127.0.0.1:PORT/triplesale/images/…` / Angular: `http://127.0.0.1:PORT/assets/images/…`) — ส่วนที่ต่างกันอยู่ต้น URL เสมอ ทำให้ภาพพื้นหลังที่ชื่อยาว (ไอคอนใน modal) ถูกตัดคนละตำแหน่ง | บรรทัดที่ 70: `cs.backgroundImage.slice(0, 60)` → `cs.backgroundImage.replace(/url\("https?:\/\/[^\/"]+\/(?:triplesale\/\|assets\/)?/g, 'url("').slice(0, 90)` (ตัดโฮสต์/โฟลเดอร์ก่อนแล้วค่อยตัดความยาว) |
| `tools/compare/lib/shell-replica.mjs` | รายการ dropdown ของระบบ (`ODS_I18N`) ในหน้า Java replica ภาษาอังกฤษยังเป็นข้อความไทย (`TEMPLATE_SCRIPTS()` ใช้ bundle ไทยตายตัว) → scenario `en-*` เห็น dropdown เป็นไทยฝั่ง Java | `TEMPLATE_SCRIPTS = () =>` → `TEMPLATE_SCRIPTS = (th = DEFAULT_TH) =>` + `const DEFAULT_TH = th;` — หน้าที่ส่ง bundle ภาษาเอง (`shell.TEMPLATE_SCRIPTS(bundle)`) ได้ข้อความถูกภาษา; หน้าที่เรียกแบบเดิมไม่เปลี่ยน |

ไม่มีการแก้ `tools/lib/**` (`port.mjs`, `port-kit.mjs`, `port-script.mjs`, `work-modal.mjs` ใช้ตามที่ main ให้) และ `run.mjs`

ข้อสังเกตเรื่อง harness (ไม่ต้องแก้ lib): runner ของ main รองรับ `opts.reloads` — scenario ที่ชื่อมี `reload` ของหน้านี้ใช้มัน (หน้า Java รีโหลดตัวเองหลังบันทึก; ฝั่ง Angular สร้าง view ใหม่) — และตัวช่วย `markPage()` / `afterReload()` ใน `tools/compare/pages/opportunity-detail/page.mjs` รอให้ view ใหม่ขึ้นก่อนเก็บ dump ฝั่ง Angular

---

## 2. ไฟล์ shared ที่ต้องแก้ (ผู้ประสานงานทำ — ใน workspace นี้แก้ให้ใช้งานได้แล้ว แต่เป็นแค่ส่วนที่ต้องการ)

| ไฟล์ | การเปลี่ยนแปลง |
| --- | --- |
| `src/app/app.routes.ts` | เพิ่มใน `IMPLEMENTED`: `'lead-detail': { load: () => import('@features/opportunity-detail/lead-detail').then((m) => m.OpportunityDetail) },` |
| `src/app/core/navigation/page-registry.json` | รายการ `"id": "lead-detail"` → `"implemented": true` |
| `package.json` | เพิ่ม script `"opportunity-detail:sync": "node tools/sync-opportunity-detail.mjs"` |
| `CLAUDE.md` | เพิ่ม bullet (ข้อความเสนอ): **หน้า Lead detail เป็นไฟล์ที่ถูกสร้าง** (`features/opportunity-detail/lead-detail.{html,engine.ts}` + `lead-detail.scss` + `lead-detail-modal.scss` จาก `lead_detail.xhtml` + modal 11 ตัว (รวม `work_modal.xhtml` ผ่าน `tools/lib/work-modal.mjs`); รูปใน `public/assets/images/**`; `public/assets/java-js/attach_file_types.js`) — ห้ามแก้ด้วยมือ: แก้ `tools/sync-opportunity-detail.mjs` แล้วรัน `npm run opportunity-detail:sync`; ส่วนที่เขียนเองคือ host `lead-detail.ts` + `lead-detail-view.ts`, สัญญา `lead-detail-backend.ts`, mock `lead-detail.mock.ts` (ข้อมูลชุดเดียวกับ `@core/mock/crm-seed` — ลีดที่กดจากรายการคือลีดที่หน้านี้เปิด) |
| `README.md` | แถวในตารางหน้าที่พอร์ตแล้ว (ถ้ามี) + `tools/`: `sync-opportunity-detail.mjs` (สร้างหน้า Lead detail จากไฟล์ Java) |
| `manual/index.html` | หัวข้อใหม่จาก `manual-lead-detail.html` (ที่ราก workspace; เขียนตามแบบ §24 Dashboard) + บรรทัดใน TOC/สถานะ (ตาราง "หน้าที่พอร์ตแล้ว") — ลิงก์ `#page-lead-detail` ในตารางสิทธิ์มีอยู่แล้ว |
| `src/app/core/navigation/java-links.ts` (+spec) | **ไม่ต้องแก้** — rule `lead_detail` (→ `/crm/opportunities/:id?…`), `lead`, `schedule`, `sales_doc_rv` ที่หน้านี้ใช้มีครบแล้ว |
| `public/assets/i18n/**` | **ไม่ต้องแก้** — ใช้ key เดิมของ Java ทั้งหมด (ดูข้อ 4) |

### ไฟล์ที่เพิ่มนอก `features/opportunity-detail/` (ไม่ใช่ shared — ไม่ต้อง merge ด้วยมือ นอกจากข้อสังเกต)

- `src/app/shared/work-modal/work-modal.mock.ts` + `work-modal.mock.spec.ts` — **คัดลอกจาก main ตรง ๆ (ไบต์เดียวกัน)** เพราะ `lead-detail.mock.ts` import `@shared/work-modal/work-modal.mock`; ใน main มีไฟล์นี้อยู่แล้ว (merge จะเป็น "ไฟล์เหมือนกัน" ไม่ต้องทำอะไร) — `workspace.mjs refresh` ไม่ดึงโฟลเดอร์นี้ให้
- `public/assets/images/**` — รูปที่หน้านี้อ้าง (ไอคอน/ภาพพื้นหลัง/`image_item_empty.png`) คัดลอกตรงจาก `web/images/**` (ไบต์เดียวกัน; generator คัดลอกให้ทุกครั้ง); บางไฟล์มีอยู่แล้วจากหน้าอื่น (เหมือนกัน)
- `public/assets/java-js/attach_file_types.js` — ไฟล์ช่วยของหน้า (`TsAttachTypes`) คัดลอกตรงจาก `web/resources/js/` — host โหลดผ่าน `loadScript` ก่อนเริ่ม engine

---

## 3. ไฟล์ที่เพิ่ม/แก้

```
tools/sync-opportunity-detail.mjs                              generator (6 ชั้น: sources → markup → css → scripts/SWAPS → engine → assets)
tools/compare/pages/opportunity-detail/{page,scenarios}.mjs     harness: replica ของหน้า Java + 545 scenario
src/app/features/opportunity-detail/
  lead-detail.html · lead-detail.scss · lead-detail-modal.scss · lead-detail.engine.ts      ← GENERATED (ห้ามแก้ด้วยมือ)
  lead-detail.ts                 route component (ปรับเป็น view ใหม่เมื่อ reload/เปลี่ยนภาษา/เปลี่ยน lead; โหมดจริง = <ts-live-missing />)
  lead-detail-view.ts            host `ts-opportunity-detail-view`: สร้าง env ให้ engine, เริ่ม/หยุด engine
  lead-detail-backend.ts         สัญญา backend (initial() + fetch(input, init))
  lead-detail.mock.ts            mock (framework-free; ข้อมูลจาก @core/mock/crm-seed)
  lead-detail.mock.spec.ts · lead-detail.spec.ts
src/app/shared/work-modal/work-modal.mock.ts (+spec)     สำเนาจาก main (ข้อ 2)
public/assets/images/** · public/assets/java-js/attach_file_types.js
INTEGRATION.md · manual-lead-detail.html
```

### host และ engine

- engine = `startOpportunityDetail(env)` → คืน `destroy()` — สคริปต์ 13 ก้อน (หน้า + 11 modal + work_modal) รวมเป็น scope เดียว เหมือน global scope ของเอกสาร Java; `window.X = function` ถูกคงไว้ (inline handler ใน markup เรียกด้วยชื่อ) และทุกอย่างที่สคริปต์ใส่ใน `window` ถูกลบตอน destroy
- `env` ที่ host ให้: `t` (ข้อความ), `fetch` (= backend), `can` (= `PermissionService.has`), `lang`, `employeeId`, `search` (`?param_lead_id=…&activityGroupId=…`), `session` (sessionStorage หรือ memory), `swal`, `navigate` (ลิงก์ Java → route ด้วย `javaLinkToRoute`), `open`, `reload` (→ host สร้างหน้าใหม่), `replaceQuery`, `href`, `assetBase` (สองตัวหลังสำหรับ work modal)
- ทุก swap (EL → env.*, fetch/swal/timer/listener/DOMContentLoaded, ธีมจาก `<html>`) อยู่ใน `SWAPS` พร้อมเหตุผล และ **หยุดการทำงานถ้าต้นฉบับเปลี่ยนจนไม่ตรง**; generator เป็น idempotent (รันซ้ำไม่เปลี่ยนไฟล์ — ตรวจแล้ว ข้อ 6)
- host ติด `host: { 'data-java-page': '' }` (ตามที่ผู้ประสานงานแจ้ง) เพื่อให้กฎ `button:disabled { cursor: not-allowed }` ของ shell ไม่เข้าหน้านี้ — generator จึงไม่ต้องเขียนกฎ cursor ซ้ำอีก

---

## 4. i18n

- ใช้ key เดิมของ Java ทั้งหมด (`label.ld2.*`, `chat.*`, `label.template.*` …) ผ่าน `t('…')` ในเทมเพลต และ `env.t("…")` ใน engine — **228 ข้อความ** ถูกแทรกเข้า string literal ของสคริปต์ด้วย TypeScript AST (ไม่ใช่ regex) + ข้อความของ work modal (ทำโดย `tools/lib/work-modal.mjs`); ข้อความที่ Java เขียนเป็นภาษาไทยตรง ๆ ใน JS (เช่น หัวข้อ `'ข้อความแจ้งเตือน!'`, `'บันทึกไม่สำเร็จ!'` ของ work modal) คงไว้ตามต้นฉบับ
- **ไม่มี key ใหม่ที่ต้องเพิ่มใน `th.json`/`en.json`** (harness สร้างหน้า Java ทั้งไทยและอังกฤษจาก bundle เดียวกัน — key ที่ขาดจะ throw ตั้งแต่ตอน build replica)

---

## 5. สิ่งที่ live adapter (เฟส B) ต้องพอร์ตจาก Java

หน้าไม่มี BFF/Tomcat (ADR-001): `lead-detail-backend.ts#fetch(input, init)` รับ path **แบบที่หน้า Java เขียน** (`../board/lead?id=7&activityGroupId=101`) แล้วต้องตอบ `Response` รูปเดียวกับที่ servlet ตอบ — live adapter จึงเป็นการย้ายตรรกะของ servlet ด้านล่างมาเรียก `triplesale-service` ตรง (Bearer ใส่โดย interceptor) แล้วประกอบ `Response` ให้เหมือนเดิม; `initial()` ให้ `{ uploadAcceptExt }` (= `commonBean.uploadAcceptExt` = `FileServerAccess.ALLOWED_EXT` เรียง + join `", "`)

Bean/EL ที่ markup/สคริปต์อ่าน: `commonBean.hasFeature('X')` (19 key — host แทนด้วย `PermissionService.has`), `commonBean.ssEmployeeId` (`AuthService.session().employeeId`), `commonBean.currentLang` (`I18n.lang()`), `commonBean.msg[…]` (i18n), `commonBean.uploadAcceptExt`, `request.contextPath` (ไม่ใช้แล้ว — รูปอยู่ใน assets)

### 5.1 โหลดหน้า / ข้อมูลหลัก

| หน้าเรียก | Servlet (Java) | ตรรกะที่ต้องพอร์ต | triplesale-service |
| --- | --- | --- | --- |
| `GET ../board/lead?id=&activityGroupId=` | `LeadDetailServlet` | ต้องมี `CRM_Lead_View` ไม่งั้น 403 `{status,message,error:{code,message}}`; ไม่มี id = 400; ส่ง `result` ของ API ตรง ๆ (ไม่มี envelope); error ของ API ส่งต่อรูปเดิม (หน้าอ่าน `error.message` แล้วโชว์ popup + กลับหน้าก่อน); เติมฟิลด์ที่อยู่ `*I18n` ตามภาษา session; ลีดที่มี >1 กลุ่มขั้นตอนต้องระบุ `activityGroupId` (400 ถ้าขาด) | `GET /leads/{id}[?activityGroupId=]` |
| `GET ../board/activity-groups?leadId=` | `ActivityGroupsServlet` | ตอบ envelope `{status,message,result:[…]}` แปลชื่อตามภาษา (`MasterDataI18n.translateEnvelopeResult`); ไม่มี leadId = 400 | `GET /leads/{id}/activity-groups` |
| `GET ../board/activity-steps?leadId=&activityGroupId=` | `ActivityStepsServlet` | ตอบ **array** ตรง ๆ | `GET /leads/{id}/activity-steps?activityGroupId=` |
| `GET ../board/lead/contact-history?leadId=` | `LeadContactHistoryServlet` | มุมมองตาราง (table view): ส่ง `result` ต่อ | `GET /leads/{id}/contact-history` |
| `GET ../board/detail-filter-state` · `POST` | `DetailFilterStateServlet` | **เก็บใน `HttpSession`** (ไม่มี API) — ตัวกรองประวัติที่บันทึกไว้ (`null` จนกว่าจะบันทึก); live: เก็บฝั่ง client (localStorage ต่อ employee) — **คำถามข้อ 9.3** | — |

### 5.2 Master data (ตอบ array เปล่า ๆ ผ่าน `LeadBoardView.fetchMasterArrayJson`)

`GET ../board/employees[?saleGroupId=]` (`EmployeesServlet` → `/master-data/employees`; ใช้ซ้ำใน work modal) · `tags` (`TagsServlet` → `/master-data/tags`) · `fiscal-years` · `sale-groups` · `sale-persons` · `material-groups` · `materials?groupId=` (`/master-data/material-groups/{id}/materials`) · `provinces` (`ProvincesServlet`: cache ใน session, `keepThaiProvincesOnly`) · `districts?provinceId=` · `sub-districts?districtId=` · `metro-geo` (`MetroGeoServlet`: อ่าน `metro_geo.json` จาก classpath → ต้องเอาไฟล์ไปเป็น asset/ย้ายตรรกะ) · `chat-master-data?type=countries|business-types|occupations|marketing-channels|communication-types` (`ChatMasterDataServlet`: countries cache ใน session + `translateEnvelopeResultTh`; ที่เหลือ `?page=1&pageSize=1000`)

### 5.3 เขียนข้อมูล

| หน้าเรียก | Servlet | ตรรกะ | triplesale-service |
| --- | --- | --- | --- |
| `POST ../board/lead-update?action=…` (form-urlencoded) | `LeadUpdateServlet` | `target-year` `target-month` `amount` `active-status` `demand` `assign` → ประกอบ body JSON จากพารามิเตอร์แล้ว PATCH; `tags` → PUT; action อื่น = 400 `{status:400,message:"unknown action: …"}` | `PATCH /leads/target-year|target-month|amount|active-status|demand|assign` · `PUT /leads/{id}/tags` |
| `POST ../board/contact-activities` | `ContactActivitiesServlet` | `channel` → `ContactChannel.toO2oLabel`; ส่งต่อสถานะของ API (หน้าอ่านข้อความ error) | `POST /leads/{id}/contact-activities` |
| `POST ../board/lead/forward` · `return` · `close-step` · `close` | `LeadForwardServlet` `LeadReturnServlet` `LeadCloseStepServlet` `LeadCloseServlet` | พารามิเตอร์ขาด = 400 `{status,message}` (`missing params: …`); ตอบ 204 → ตัวตอบว่างเป็นสำเร็จ | `POST /leads/{id}/forward|return|close-step|close` |
| `GET ../board/lead/forward-groups` · `forward-employees` · `return-groups` | `LeadForwardGroupsServlet` `LeadForwardEmployeesServlet` `LeadReturnGroupsServlet` | ส่ง `result` ต่อ (envelope) | `GET /leads/{id}/forward-groups|forward-employees|return-groups` |
| `GET ../board/lead/accessors?leadId=&all=true` · `POST ../board/lead/accessor-add?leadId=` | `LeadAccessorsSearchServlet` `LeadAccessorAddServlet` | เพิ่มผู้มีสิทธิ์เข้าลีด | `GET|POST /leads/{id}/accessors` |
| `POST|DELETE ../board/lead-materials` | `LeadMaterialsServlet` | เพิ่ม/ลบผลิตภัณฑ์ของลีด (`detailOrderNo`) | `POST /leads/materials` (และลบตามที่ servlet เรียก) |

### 5.4 ลูกค้า (prospect) ของ tab ข้อมูลหลัก/ข้อมูลเพิ่มเติม/เอกสาร

| หน้าเรียก | Servlet | ตรรกะ / ข้อควรระวัง |
| --- | --- | --- |
| `GET ../board/prospect?id=` | `ProspectDetailServlet` | `LeadBoardView.fetchProspectByIdJson` + (ถ้ามี) **`mergeDirectDbSunInfo` อ่านฐานข้อมูลตรง** รวมเข้ากับ API — เบราว์เซอร์อ่าน DB ไม่ได้ → **คำถามข้อ 9.1** |
| `POST ../board/prospect/save` | `ProspectSaveServlet` | บันทึกผ่าน API; มีเส้นทาง "via" อีกทางผ่าน DB (ตอบ `{ok,via,status,message}`) → **คำถามข้อ 9.1** |
| `POST ../board/prospect/avatar` | `ProspectAvatarServlet` | อัปโหลดรูป → attachments แล้วอัปเดต prospect; ตอบ `{ok,attachFile,message}` |
| `GET|POST|DELETE ../board/prospect/attachments` | `ProspectAttachmentsServlet` | เช็คนามสกุลที่อนุญาต (`FileServerAccess.ALLOWED_EXT`), ตรวจไฟล์หลังอัปโหลด (`verified`), `AttachUrl.collapse` ของลิงก์ |
| `GET ../board/prospect/rv-attachments?prospectId=` | `RvAttachmentsServlet` | `GET /rv/attachments` |
| `GET ../docproxy?url=` | `DocProxy` | ดาวน์โหลดไฟล์แนบผ่าน proxy (ใส่ token ให้) — live: ดาวน์โหลดด้วย Bearer แล้วทำ blob |
| `window.open('../rvreport?txno=…')` | `RvJasperReportServlet` | รายงาน PDF ของใบรับเงิน — **ไม่ผ่าน `env.fetch`** (เปิดแท็บใหม่ด้วย `env.open`); **คำถามข้อ 9.2** |

### 5.5 work modal (นัดหมาย/งาน) — `components/work_modal.xhtml`

| หน้าเรียก | Servlet | ตรรกะ |
| --- | --- | --- |
| `POST ../board/schedule/add` | `AddScheduleServlet` | ตัด `movementTypeId`; `activityGroupId` → `procedureGroupId` (ถ้ายังไม่มี); body ว่างจาก API = สำเร็จ `{status:201,success:true}`; status ในบอดี้ ≥ 400 → HTTP status นั้น; exception → 500 `{status:500,success:false,message}` |
| `PATCH ../board/schedule/edit` | `EditScheduleServlet` | ตัด `leadId`, เอา `id` ไปต่อ path |
| `GET ../board/master/employees-by-activity-group?activityGroupId=` | `MasterEmployeesByActivityGroupServlet` | ขาดพารามิเตอร์ = 400; ตอบ envelope แปลภาษา |
| `GET ../board/master/activity-groups?movementTypeId=` | `MasterActivityGroupsServlet` | (เฉพาะโหมดค้นหาลูกค้า ซึ่ง lead_detail ไม่ใช้) |

ชั้น servlet ของ work modal มี mock ที่ใช้ร่วมแล้ว (`@shared/work-modal/work-modal.mock`) — live ใช้ตรรกะเดียวกัน

---

## 6. ผลการตรวจเทียบ (harness `node tools/compare/run.mjs lead-detail`)

**ผลสุดท้าย: 545 / 545 scenario เหมือนทุกบรรทัด** (รันเต็มครั้งสุดท้าย `--jobs 3`, 2,115 วินาที; รอบแรกมี 1 ตัวต่าง — `tv-end-step-modal-dark` ฝั่ง Angular โหลดหน้าไม่ขึ้นตอนเครื่องมีงานอื่นรันอยู่ (`no element #ld2GripBtn`) — runner รันซ้ำทีละตัวแล้วเหมือนทุกบรรทัด)

สิ่งที่เทียบ (หน้าละประมาณ 6,600–7,800 บรรทัด): DOM + attribute + ข้อความ + computed style + ตำแหน่ง/ขนาด ของทุก element ใน root ของหน้า (การ์ด, ทุก modal, popover, toast ที่ต่อท้าย `<body>`, ฉากของ SweetAlert, ตัวบันทึก `window.open`/`alert`) + ค่าของ control ทุกตัวต่อท้ายทุก dump (`VAL …`)

| กลุ่ม | จำนวน |
| --- | --- |
| หน้าแรก / ธีมมืด / 5 ขนาดจอ / อังกฤษ / ปุ่ม A A A | 13 |
| รูปแบบลีด (ไม่มี workflow, 1/2/3/7/12 กลุ่ม, ปิดสำเร็จ/ไม่สำเร็จ/ขายแล้ว, ไม่มีเจ้าของ/ทีม/ประวัติ/นัดหมาย, นิติบุคคล — สว่าง/มืด/อังกฤษ) | 41 |
| lead API ล้มเหลว (403 / 400 / 500 / 404 / ว่าง; มืด/อังกฤษ/แคบ/ขนาดอักษร/viewer) | 11 |
| การ์ดซ้าย (ความสนใจ, เดือน/ปี, มูลค่า, ความต้องการ, แท็ก, ทีมขาย, เจ้าของ, ผู้มีสิทธิ์, การ์ดนัดหมาย, popover) และสิทธิ์ 4 ชุด (all / owner / viewer / noactivity — กระจายอยู่ในทุกกลุ่ม) | 85 |
| แท็บ / แท็บย่อย / บันทึกแท็บข้อมูลหลัก (รูป, ที่อยู่ 3 ระดับ, เบอร์โทร, ยืนยันอัปเดต) / ข้อมูลเพิ่มเติมทุกบล็อก (บันทึก/ล้มเหลว/เครือข่าย) | 92 |
| บันทึกการติดต่อ, ส่งต่อให้คนอื่น (หลายการ์ด), ส่งกลับ, ปิดกลุ่มขั้นตอน, ปิดลีด (ทุกทาง: สำเร็จ → กล่อง → โหลดใหม่, error 500/400, ยกเลิก) | 77 |
| ผลิตภัณฑ์ (เพิ่ม/ลบ/เมนูใบเสนอราคา) | 14 |
| เอกสาร (อัปโหลด/ลบ/ล้มเหลว/ไม่ผ่านการตรวจ/นามสกุลไม่อนุญาต) + เอกสารงานขาย | 22 |
| ประวัติการติดต่อ + ตัวกรอง (รวม Esc, บันทึก/รีโหลด) | 27 |
| มุมมองตาราง (จบขั้นตอน / เพิ่มการติดต่อ / กลุ่มถัดไป / ลีดหลายรูปแบบ / สิทธิ์) | 42 |
| **work_modal** — เพิ่ม/ดู/แก้ไขนัดหมายและงาน (เปิด, ผู้รับผิดชอบ, สถานะ, ทั้งวัน, ตรวจข้อมูล 3 แบบ, บันทึก → กล่องสำเร็จ → โหลดหน้าใหม่, error จาก API, ปิดด้วยกากบาท/คลิกนอก, สิทธิ์) | 78 |
| modal ทุกตัวแบบอังกฤษ และด้วยปุ่ม A A A (+2 / −2) | 43 |
| **รวม** | **545** |

ข้อสังเกตจากการเทียบที่ควรรู้ (ไม่ใช่ความต่าง — เป็นสิ่งที่พบระหว่างทำ):

- **input guard ของ shell** (`input_guard.js`: ตัวอักษร `<` `>` `"` `'` `` ` `` `\` `;` `|` `{` `}` `[` `]` `$` `^` `~` พิมพ์ลงช่องข้อความไม่ได้) ตัด `[500]` ออกจากข้อความที่ scenario พิมพ์ → scenario "error" รุ่นแรกเดินทางสำเร็จทั้งสองฝั่งโดยไม่รู้ตัว; แก้ที่ mock: รับ `#500` / `#400` / `#net` / `#fail` (พิมพ์ได้) ควบคู่กับ `[500]` เดิม และ scenario ใช้รูปใหม่ → ตอนนี้ error popup ปรากฏจริงทั้งสองฝั่ง (ตรวจจาก dump)
- **ลำดับทำลาย/สร้าง view ตอน reload**: engine เดิมลบ `#ld2UpdConfirmModal` / `#ldAccessPop` ด้วย id ซึ่งไปลบ node ของ view ใหม่ที่ id เดียวกัน (สร้างก่อนทำลาย) → แก้ให้ลบเฉพาะที่เป็นลูกตรงของ `<body>` (ที่ engine ย้ายไปเอง); และ toast ที่ต่อท้าย `<body>` ตรวจด้วย `el.style.position/zIndex` (ไม่ใช่ regex บน `cssText` ที่ browser เติมเว้นวรรค)
- **ความต่างของสภาพแวดล้อมที่ harness normalize** (อยู่ใน `page.mjs#normalize`): `../images/` → `assets/images/`; `window.open(…,'_self')` → `window.ldNavigate(…)`; ลิงก์ Java → route (`javaLinkToRoute`); เวลา "ตอนนี้"/วันนี้ (`value=NOW`, `VAL … = NOW|TODAY`, `cb=NOW`); ตัวนับ id `odsAuto_N` ของ select enhancer ของ shell (Java เริ่มนับใหม่หลังรีโหลด); `%2C` ↔ `,` ในที่อยู่ที่ router เขียนใหม่ (`window.open('/sales/receipts/new?…listMaterialId=6002,6003')`)

ตรวจเพิ่มด้วยโค้ด (ไม่ใช่ harness):

| รายการ | ผล |
| --- | --- |
| generator idempotent (รันซ้ำ 2 ครั้ง → sha1 ของ `.html/.scss/.engine.ts/-modal.scss` ตรงกัน) | ผ่าน |
| generator หยุดเมื่อต้นฉบับเปลี่ยน (สำเนา Java ที่แก้ `var LD2_LANG =String(` → `Error: page: commonBean.currentLang changed — NOT FOUND …`, ไฟล์ที่สร้างไม่ถูกแตะ) | ผ่าน |
| host ไม่ทิ้ง listener / timer / node / `window.*` หลัง destroy (เทสต์ `leaving the page puts everything back` — นับ `add/removeEventListener` ของ document+window, `window.ld*/wm*/LD2_*`, node ใต้ `<body>`) และ view ใหม่หลัง reload ได้ node ของตัวเองครบ | ผ่าน |
| ไม่มี secret (grep `AIza…`, `api_key`, `secret`, `password`, `jdbc`, `bearer` ใน output/mock/generator/scenario → พบเฉพาะคอมเมนต์ที่พูดถึง "token ของ session เก่า" ซึ่งถูกตัดออก) | ผ่าน |

---

## 7. ความต่างที่ตั้งใจ (Angular ≠ Java) และเหตุผล

1. **รูป**: `../images/…` / `#{request.contextPath}/images/…` → `assets/images/…` (คัดลอกไบต์เดียวกัน); CSS ใช้ `/assets/images/…` (absolute — application builder พยายามรวม url แบบ relative) — harness normalize `../images/` → `assets/images/` ตอนเทียบ
2. **ธีม/ขนาดอักษร**: `body[data-theme="dark"]` → `html[data-theme='dark']`, `--fs-adj` → `--ts-fs-adj` (shell ของ Angular เก็บบน `<html>`) — ความจำเพาะเท่าเดิม
3. **ลิงก์ไปหน้าอื่น**: `location.href = 'lead.face?…'` / `window.open(…,'_self')` → `env.navigate(url)` (router ผ่าน `javaLinkToRoute`); ปุ่ม "ไปปฏิทิน" 2 ปุ่มเรียก `window.ldNavigate(url)` แทน `window.open(url,'_self')`; `window.open(url,'_blank')` → `env.open`; ลิงก์ "ไปหน้า Lead" ของ work modal ใช้ `env.href`/`env.navigate`
4. **reload**: `location.reload()` (9 จุด + work modal) → `env.reload()` = host สร้าง view ใหม่ (ไม่โหลดเอกสารใหม่) — ผลที่เห็นเหมือนกัน แต่ตัวนับ id ของ select enhancer (`odsAuto_N`) ไม่เริ่มใหม่ (harness normalize)
5. **เปลี่ยนภาษา**: Java โหลดหน้าใหม่ (ข้อความของสคริปต์อ่านครั้งเดียว) → Angular สร้าง view ใหม่
6. **token**: Java อ่าน session token เก่าไว้ในสคริปต์ (ไม่เคยใช้) → ตัดออก (Angular ไม่อ่าน token)
7. **`navigator.sendBeacon`** (บันทึกตัวกรองประวัติตอนหน้ากำลังปิด) → `env.fetch` POST ตัวเดียวกัน
8. **ฟังก์ชันที่ Java เองก็ไม่มี**: `ld2ApplyContactActivityVisibility` / `ld2ApplyContactSaveRowVisibility` ถูกเรียกหลัง `typeof x === 'function'` แต่ไม่เคยถูกประกาศ (undefined ใน Java เช่นกัน) — คงไว้ตามเดิม (เรียกไม่เคยทำงานทั้งสองฝั่ง)
9. **ข้อมูล**: ทุกอย่างมาจาก mock (`lead-detail.mock.ts`) — รูปแบบ JSON เหมือนที่ servlet ตอบ แต่เป็นข้อมูลจำลอง (วันที่ของนัดหมาย/งานเป็น `dd/MM/yyyy` ตามที่ปรากฏบนการ์ด — **ยืนยันกับ API จริงในเฟส B**, ข้อ 9.4)
10. **node ที่ย้ายไป `<body>`**: popover ผู้มีสิทธิ์/กล่องยืนยันอัปเดต/toast ยังเป็นลูกของ `<body>` เหมือน Java; ฟอนต์/สีของ `<body>` ใน Java ถูกใส่ให้กฎ `body > …` ใน scss (shell ของ Angular ตั้งค่าอื่น)

---

## 8. work_modal.xhtml

**รวมแล้ว** (ใช้ `tools/lib/work-modal.mjs` ของ main: `workModalPieces({ read, page: 'lead_detail' })`) — markup วางตรงตำแหน่งที่ Facelets include (ระหว่าง `add_product_modal` กับ `history_filter_modal`), `<style>` 2 ก้อนวางก่อน style ของ `next_group_modal`, สคริปต์วางหลัง `add_product_modal`; รูป 8 ไฟล์คัดลอกด้วย `wm.copyImages`; env เพิ่ม `href` + `assetBase`; ปุ่ม `ldOpenAddAppt` / `ldOpenAddWork` / `ldOpenViewAppt` / `ldOpenViewWork` ทำงานครบ (เพิ่ม/ดู/แก้ไขนัดหมายและงาน, เปลี่ยนสถานะ, ตรวจข้อมูล, กล่องสำเร็จ → โหลดหน้าใหม่, error จาก API)

---

## 9. คำถาม / ความเสี่ยง / สิ่งที่ยังไม่ได้ตรวจ

1. **`ProspectDetailServlet` / `ProspectSaveServlet` อ่าน/เขียน DB ตรง** (`mergeDirectDbSunInfo`, เส้นทาง "via=db") — เบราว์เซอร์ทำไม่ได้: ต้องมี endpoint ของ `triplesale-service` ที่ให้ `sunProspectInfo` / `satisfaction` ครบ หรือยอมให้ tab ข้อมูลเพิ่มเติมแสดงเท่าที่ API ให้ (mock ตอบ `via:'api'` เสมอ)
2. **`/rvreport?txno=`** (รายงาน PDF ใบรับเงิน) เปิดด้วย `window.open` ตรง ๆ — ไม่มี BFF แล้ว: ต้องตัดสินใจว่าจะชี้ไป service ที่สร้าง PDF หรือคง servlet Jasper ไว้
3. **ตัวกรองประวัติที่บันทึกไว้** (`DetailFilterStateServlet` ใช้ HttpSession) — ย้ายเป็น storage ฝั่ง client ต่อพนักงานได้ แต่พฤติกรรมข้ามเครื่องจะหาย (Java ก็หายเมื่อ session หมด)
4. **รูปแบบวันที่ของ `appointmentList[].date` / `taskList[].date`** จาก API จริง (mock ให้ `dd/MM/yyyy`; หน้าแสดงค่านั้นตรง ๆ แล้วส่งกลับตอนเปลี่ยนสถานะ; `_toInputDate` รับได้ทั้ง `yyyy-MM-dd` และ `dd/MM/yyyy`) — เหมือนกันทั้งสองฝั่งใน harness แต่ต้องยืนยันกับของจริง
5. **ไม่ได้ทดสอบกับ API จริงเลย** (เฟสนี้ mock เท่านั้น ตามขอบเขต) — รูปแบบ response ใน mock อ้างจากการอ่านโค้ด servlet + สคริปต์ของหน้า ไม่ใช่การเรียกจริง
6. **ความเสี่ยงของ harness**: หน้าใหญ่ (dump ~7,200 บรรทัด/scenario) และเครื่องรัน browser หลายตัวพร้อมกัน → บางครั้ง scenario ล้มเพราะ Chrome ("detached Frame"/timeout) — runner รันซ้ำเฉพาะตัวที่ต่างทีละตัวเพื่อตัดความผิดพลาดจากจังหวะเวลา; ผลสรุปในข้อ 6 คือผลหลังรันซ้ำ
7. **ขนาด**: chunk lazy ของหน้านี้ใหญ่ (engine ~800 KB ก่อน minify) — ผลบิลด์ production ดูข้อ 0/6

---

## 10. วิธีรันซ้ำ (ทั้งหมดรันใน workspace/โปรเจกต์ที่มีหน้านี้)

```bash
npm run opportunity-detail:sync                                   # สร้าง .html/.scss/.engine.ts + รูป + attach_file_types.js ใหม่ (idempotent)
CI=1 node tools/compare/run.mjs lead-detail --jobs 3       # build Angular (development) → รัน 545 scenario ทั้งสองฝั่ง → เทียบ (~35 นาทีเมื่อเครื่องไม่ว่าง)
node tools/compare/run.mjs lead-detail --list              # รายชื่อ scenario
node tools/compare/run.mjs lead-detail --filter '^wm-' --no-build --jobs 3
node tools/compare/run.mjs lead-detail --show wm-add-appt-open --limit 40      # diff ของ scenario ที่เคยรัน
CI=1 NG_CLI_ANALYTICS=false node node_modules/@angular/cli/bin/ng.js test --no-watch --include 'src/app/features/opportunity-detail/**/*.spec.ts'
CI=1 NG_CLI_ANALYTICS=false node node_modules/@angular/cli/bin/ng.js build
```

- scenario ที่ชื่อมี `reload` = หน้ารีโหลดตัวเองหลังบันทึก (opts.reloads ของ runner) — จบด้วย `await afterReload()`; ชื่อลงท้าย `-toast` รอ toast ด้วย `await toast()`
- ลีดที่ใช้ใน scenario (ดูหัว `lead-detail.mock.ts` และ `opportunityFacts(n)`): 29 = ลีดหลัก (5 กลุ่ม ขั้นตอนสุดท้าย, นัดหมาย 3, งาน 2) · 7 = ของคนอื่น · 1 = กลุ่มแรก · 87 / 21 / 3 / 240 / 239 = 2 / 3 / 7 / 12 / 1 กลุ่ม · 108 / 27 = ไม่มี workflow · 30 / 40 / 237 = สำเร็จ / ไม่สำเร็จ / ขายแล้ว · 44 / 52 / 35 / 129 = ไม่มีเจ้าของ / ทีม / ประวัติ / นัดหมาย · 17 = นิติบุคคล · 900–903 / 999 = lead API 403 / 400 / 500 / ว่าง / 404
- พิมพ์ trigger error ลงช่องในหน้าได้ด้วย `#500` / `#400` / `#net` (ช่องข้อความ) และ `#fail` (หัวข้อนัดหมาย) — `[500]` พิมพ์ไม่ได้เพราะ input guard ของ shell
