# INTEGRATION — activities (หน้า "การติดต่อ") + work modal

> **อัปเดต 2026-10-21 — เฟส B (live adapter) ของหน้านี้ทำแล้ว: ดู `docs/integration/activities-live.md`.** ข้อความ "ยังไม่มี live adapter / `<ts-live-missing />` / เหลือ REST" ในไฟล์นี้เป็นสถานะของเฟส A (ตารางที่ต้องพอร์ตด้านล่างยังใช้เป็นแผนที่ของ servlet ได้)

workspace: `triple_sale_angular_ws_activities` · ขอบเขต: เฟส A (mock) — ไม่มี live adapter · เขียนโดย worker ของหน้า `activities`

## 0. Progress note — `tools/lib/work-modal.mjs` พร้อมใช้แล้ว

`tools/lib/work-modal.mjs` ใช้งานได้และผ่านการพิสูจน์ด้วย harness บนหน้า activities (ทั้งโหมดที่หน้านี้เปิดเองได้ และโหมดค้นหาลูกค้า `customerSearch` ที่หน้า Schedule จะใช้ — scenario `wm-cust-*` เรียกผ่าน `window.wmSetLeadContext`/`wmOpenAdd` เหมือนที่ schedule.xhtml ทำ).
วิธีใช้ (สรุป — รายละเอียดเต็มอยู่ใน header ของไฟล์):

```js
import { workModalPieces } from './lib/work-modal.mjs';
const wm = workModalPieces({ read, page: 'schedule' });   // read = reader(javaWeb); page = ค่า ui:param "page"
tpl      += '\n' + wm.markup;       // template Angular ของ overlay ทั้ง 3 (ดู / เพิ่ม-แก้ไข / success) — วางที่เดียวกับที่ Java ใส่ ui:include (ท้าย content)
scss     += '\n' + wm.css;          // <style> 2 ก้อนของ modal (dark → html[data-theme='dark'], ไอคอนเป็น /assets/images/…)
engineJs += '\n' + wm.script;       // สคริปต์ ES5 ต่อท้ายสคริปต์ของหน้า (ก่อน engineScaffold().footer()) — ใช้ listen/tmo/onReady ของ scaffold
engineScaffold({ …, envBody: pageEnvBody /* ไม่ต้องซ้ำ t/fetch/navigate/reload ถ้าใช้ wm.envBody */ + wm.envBody,
                 exported: [...pageWindowNames, ...wm.windowNames] });
await undeclaredNames(engineText, [...pageAllow, ...wm.globalsRead]);   // LD2_* ที่หน้าต้องประกาศเป็น window.LD2_… เอง
wm.copyImages(javaWeb, 'public/assets/images');                        // ไอคอน 8 ไฟล์ (byte-identical)
```

host component ของหน้าที่ 2 ต้องให้ `env`: `t, fetch, navigate(javaLink), reload, swal, href(javaLink)→route, assetBase:'assets/'` และ backend ของหน้านั้นต้องตอบ endpoint ของ modal — ใช้ `src/app/shared/work-modal/work-modal.mock.ts` (`handleWorkModalRequest()`: schedule/add, schedule/edit, employees, employees-by-activity-group, master/activity-groups และโหมดค้นหาลูกค้า `board/leads` + `board/lead`) โดยส่ง `WorkModalData` ของหน้าตัวเอง (ดู `workModalData()` ใน `activities.mock.ts` เป็นตัวอย่าง).
สิ่งที่หน้าต้องประกาศเอง (เหมือน Java): `window.LD2_ROLE_/SUP_SCHEDULE_CREATE`, `LD2_CAN_SCHEDULE_CREATE/VIEW/EDIT`, `LD2_MY_EMPLOYEE_ID` (ดู `activity.xhtml` บรรทัดท้าย; lead_detail/schedule ประกาศเพิ่ม `LD2_LEAD_CLOSED`, `LD2_CAN_VIEW_LEAD`, `ldOwnerIdMatchesMe`, `ldEmployeeIdMatchesMe`).
หมายเหตุ: ตัวแปร `WM_PAGE` ของ Java ไม่มีโค้ดส่วนไหนอ่านค่า (ตรวจแล้ว) — `page` จึงไม่ทำให้พฤติกรรมต่างกัน; ความต่างระหว่างหน้า = flag `LD2_*` + `wmSetLeadContext(ctx)` ที่หน้าเรียก.

## 1. การเปลี่ยนแปลงไฟล์ shared (ผู้ประสานงานต้อง merge เอง)

| ไฟล์ | เปลี่ยนอะไร / ทำไม |
| --- | --- |
| `src/app/app.routes.ts` | `IMPLEMENTED` เพิ่ม `activities: { load: () => import('@features/activities/activities').then((m) => m.Activities) }` |
| `src/app/core/navigation/page-registry.json` | `activities` → `"implemented": true` (เทสต์ตรวจให้ตรงกับ routes) |
| `package.json` | script `"activities:sync": "node tools/sync-activities.mjs"` (ใน workspace **ไม่ได้แก้** — รันด้วย `node tools/sync-activities.mjs`) |
| `src/app/core/navigation/java-links.spec.ts` | เพิ่ม `it(...)` ของลิงก์ที่หน้านี้ใช้ (`lead_detail.face?…param_lead_id=…&activityGroupId=…` → `/crm/opportunities/:id?activityGroupId=`, `lead.face?…` → `/crm/opportunities`, `activity.face?…`). **rule ใน `java-links.ts` มีครบแล้ว ไม่ต้องแก้** |
| `src/styles/_swal.scss` (**แก้ใน workspace — refresh จะไม่ทับ แต่ต้องรวมเข้า main**) | เจอจาก scenario ที่ swal มีปุ่ม (popup error ของ activity-detail): (1) `topbar.xhtml` ของ Java มี `<style>` `.swal-footer { text-align:center!important; display:flex!important; justify-content:center!important; gap:8px }` + `.swal-button-container { margin:0!important }` — ขาดจาก shell ทำให้ปุ่ม swal ชิดขวา **ทุกหน้า** ที่ swal มีปุ่ม; (2) `.swal-overlay :is(button,input,textarea) { letter-spacing: revert }` (reset ของ Angular ทำให้ปุ่ม swal มี letter-spacing .36px ต่างจาก Java) |
| `src/styles/_base.scss` (**แก้ใน workspace**) | `button:disabled { cursor: not-allowed }` → `button:disabled:not(:where([data-java-page], [data-java-page] *))` — ในหน้าที่ generate จาก Java ปุ่ม disabled ต้องได้ cursor ตาม CSS ของหน้า (เช่น `.ac-contact-save{cursor:pointer}`; Java ไม่มีกฎ not-allowed) แทนที่ not-allowed ของ shell. host ของหน้าที่ generate ใส่ `host: { 'data-java-page': '' }` (ทำใน `activities-view.ts`) — **แนะนำให้ host ของหน้าอื่นที่ generate (dashboard, report, chat, …) ใส่ attribute เดียวกัน** |
| `tools/compare/lib/runner.mjs` | เพิ่มแบบ backward-compatible: `opts.denyRoles` (ตัด role ออกจาก session ฝั่ง Angular เพื่อทดสอบสิทธิ์ — ฝั่ง Java สร้างหน้าตามชุดสิทธิ์เดียวกันใน `page.mjs`) และ `opts.reloads` (scenario ที่ทำให้หน้า Java `location.reload()` เอง — runner รอเอกสารใหม่ ใส่ dump helper กลับ แล้วทำต่อ; ฝั่ง Angular `env.reload()` สร้างหน้าใหม่โดยไม่โหลดเพจ) |
| `tools/lib/port-script.mjs` (**ไฟล์ใหม่**) | helper กลางของ generator ระดับสคริปต์: `elMessages` (`'#{commonBean.msg['k']}'` ในสตริง JS → `'' + env.t("k") + ''` โดยดูเครื่องหมายคำพูดที่ครอบทีละบรรทัด), `fsAdj`, `swapCalls`, `windowNames`, `assertPortable` (ตรวจ EL/timer/XHR/storage/location/Java link/bare fetch,swal ตกค้าง), `codeOf` |
| `tools/lib/work-modal.mjs` (**ไฟล์ใหม่**) | work modal ที่ใช้ซ้ำได้ (§0) |
| `src/app/shared/work-modal/work-modal.mock.ts` (+ `.spec.ts`) (**ใหม่**) | ชั้น servlet ของ endpoint ที่ modal เรียก ใช้ร่วมกับ mock ของทุกหน้าที่ include modal |
| `src/app/shared/ui/live-missing/live-missing.ts` | **สำเนาจาก main ไม่ใช่การแก้** (host แสดง `<ts-live-missing />` ตอน mock ปิด; ใช้ key `app.live.*` ที่ main มีใน `app.{th,en}.json` แล้ว — workspace ไม่ได้แก้ไฟล์ i18n) |
| `CLAUDE.md` | เพิ่ม bullet: "**หน้า Activities (+ work modal) เป็นไฟล์ที่ถูกสร้างเช่นกัน** (`features/activities/activities.{html,scss,engine.ts}` จาก `activity.xhtml` + `components/work_modal.xhtml`; ชิ้นส่วนของ modal มาจาก `tools/lib/work-modal.mjs`) — ห้ามแก้ด้วยมือ: แก้ `tools/sync-activities.mjs` / `tools/lib/work-modal.mjs` แล้วรัน `npm run activities:sync` (ดู manual); ส่วนที่เขียนเองคือ `activities.ts`, `activities-view.ts`, สัญญา `activities-backend.ts`, ชั้น BFF `activities.bff.ts` (port ของ `ContactActivityApiService`/`LeadBoardView` — live adapter ใช้ซ้ำ) และ mock `activities.mock.ts`" |
| `README.md` | แถวของตาราง: Activities · `/crm/activities` · พอร์ตแล้ว (mock) · ผ่าน harness `node tools/compare/run.mjs activities` |
| `manual/index.html` | หัวข้อใหม่จากชิ้นส่วน `manual-activities.html` (ที่ราก workspace) |
| `public/assets/…` | **ไฟล์ใหม่ล้วน (merge ได้เลย)**: `java-js/step_group_color.js` (byte-identical กับ `web/resources/js/step_group_color.js`); `images/icon/{external-link,Calendar,default_avatar,fi_check-square,fi_calendar,fi_clock,fi_edit-3,fi_list,fi_search,fi_user-edit,fi_users}.svg`, `images/calendar_work/fi_arrow-right.svg`, `images/image_item_empty.png` (byte-identical กับ `web/images/…`, เลย์เอาต์เดียวกัน) |

i18n: **ไม่มี key `app.*` ใหม่** — ทุกข้อความมาจาก key เดิมของ Java (มีครบใน `th.json`/`en.json`; harness ตรวจให้เพราะ replica โยน error ถ้า key หาย). ข้อความที่ Java ฝังเป็นภาษาไทยตายตัวในสคริปต์ (คงตามต้นฉบับ ไม่ได้เปลี่ยนเป็น key): `'ข้อความแจ้งเตือน!'`, `'บันทึกไม่สำเร็จ!'` (หัว swal), `'กำลังโหลดประวัติการติดต่อ...'`, `'ไม่มีประวัติการติดต่อ'`, `'โหลดประวัติการติดต่อไม่สำเร็จ'` (แถวลูก), `'ทั้งวัน'` (label เวลาของ task ที่ BFF สร้าง), `'การติดต่อ'` (ชื่อกลุ่ม fallback ของ BFF), `'แท็ก'`/`'จังหวัด'`/`'อำเภอ'` (ชื่อตัวกรองที่ปิดใช้งาน — ไม่ได้ใช้บนจอ). ถ้าต้องการสลับภาษาของข้อความเหล่านี้ ต้องตกลงกับเจ้าของระบบก่อน (Java ก็ไม่แปล).

## 2. ไฟล์ที่เพิ่ม (เฉพาะของหน้านี้ — merge `--apply` ได้)

```
tools/sync-activities.mjs                       generator (+ tools/lib/work-modal.mjs, tools/lib/port-script.mjs)
tools/compare/pages/activities/{page,scenarios}.mjs
src/app/features/activities/
  activities.html · activities.scss · activities.engine.ts       GENERATED
  activities.ts · activities-view.ts                              route + host
  activities-backend.ts                                           สัญญา: ActivitiesBackend (BFF) + ActivitiesRest (REST ของ triplesale-service)
  activities.bff.ts                                               port ของ servlet/service ฝั่ง Java (framework-free; live adapter ใช้ซ้ำ)
  activities.mock.ts                                              mock (seed เดียว: crm-seed) — implement ActivitiesRest + route ของ BFF
  activities.bff.spec.ts · activities.mock.spec.ts · activities.spec.ts
src/app/shared/work-modal/work-modal.mock.ts · work-modal.mock.spec.ts
manual-activities.html · INTEGRATION.md
```

## 3. สถาปัตยกรรม (ย่อ)

- **ต้นฉบับ → generator → engine**: `sync-activities.mjs` อ่าน `activity.xhtml` + `work_modal.xhtml` แล้วสร้าง template/scss/engine; swap ทุกจุดมีเหตุผลและหยุดเมื่อต้นฉบับเปลี่ยน; `undeclaredNames()` ตรวจ strict mode (เจอ 1 จุดใน Java: `_wmOwnPickable` ถูก assign โดยไม่ประกาศ — generator ประกาศให้ `var _wmOwnPickable;`).
- **สัญญา backend 2 ชั้น**: `ActivitiesBackend.fetch(url, init)` = URL ของ BFF ที่หน้า Java เรียก (`../board/…`); ใต้มันคือ `activities.bff.ts` (port ของ `ContactActivityApiService.fetchActivityListJson`, `LeadBoardView.fetchActivityDetailResult`, `acBuildHistoryGroups`, `acMapSummary`, `ContactChannel.toO2oLabel` …) ที่เรียก `ActivitiesRest` (`GET /contact-activities`, `GET /leads/{id}/contact-history`, `GET /leads/{id}`). **mock ทำแค่ `ActivitiesRest` จาก seed** — ตัวเลขรวม (summary, ยอดช่องทางของแถวแม่ = max(backend, ผลบวกแถวลูก), `meta.hasMore`, การจัดกลุ่มประวัติ) คำนวณโดยโค้ดชุดเดียวกับที่ live จะใช้. live adapter = เขียน `ActivitiesRest` ด้วย HttpClient + route ที่เหลือของ BFF (§4).
- **host**: `activities-view.ts` โหลด `step_group_color.js`, เริ่ม `startDragScroll('.ac-table-scroll')`, สร้าง `env` (t, fetch, can, myEmployeeId, pref(localStorage), docProxy, navigate/href → `javaLinkToRoute`, reload, swal(`loadSwal`), assetBase) แล้ว `startActivities(env)`; เปลี่ยนภาษา/บันทึกใน work modal = view ใหม่ (เหมือน `location.reload()`); `mock:false` → `<ts-live-missing />`.

## 4. สิ่งที่ live adapter (เฟสถัดไป) ต้องทำ — servlet / bean / service ของ Java ที่หน้านี้พึ่ง

| URL ที่หน้าเรียก | Java | REST ที่เรียก / logic ที่ต้องย้าย | สถานะ |
| --- | --- | --- | --- |
| `GET ../board/activity-list` | `ActivityListServlet` → `ContactActivityApiService.fetchActivityListJson` | `GET /contact-activities?groupBy=lead` + `groupBy=group` (ขนาน, `pageNo` นับจาก 0, `pageSize`, `saleGroupId`, `employeeName`, `contactName`(=search), `activeStatus`, `lastContactFrom/To`, `assignDateFrom/To`, `showClosed`, `sortBy`=`lastContactDate_*`/`prospectName_*`) + `GET /leads/{id}/contact-history` ของทุก lead ที่ `groupCount>1` | **logic ย้ายแล้ว** ใน `activities.bff.ts` (`fetchActivityList`) — เหลือ REST. ไม่ได้พอร์ต: โหมดสำรอง `activity.list.source=aggregate` (`LeadBoardView.fetchActivityListJsonFiltered`/`acBuildRow` …), config `activity.list.maxrows`(1000)/`activity.list.group.topup` (ใช้ค่า default: เปิด) |
| `GET ../board/activity-detail` | `ActivityDetailServlet` → `LeadBoardView.fetchActivityDetailResult` | `GET /leads/{id}[?activityGroupId=]` (ลองไม่แนบกลุ่มถ้าพลาด) แล้ว map → `{customer_name, history[], events[], appointments[], tasks[] …}` | **ย้ายแล้ว** (`fetchActivityDetail`). ไม่ได้พอร์ต: `AttachUrl.collapse()` ของ avatar (host ซ้อนหลายชั้น), `I18n` ของข้อความ error default (mock ส่ง `'โหลดข้อมูล Lead ไม่สำเร็จ'` ตายตัว) |
| `POST ../board/contact-activities` | `ContactActivitiesServlet` | `POST /leads/{leadId}/contact-activities` (ตัด `leadId` ออกจาก body, `channel` → `ContactChannel.toO2oLabel`) ส่ง status ของ backend กลับ | `contactChannelLabel()` ย้ายแล้ว; เหลือ REST |
| `POST ../board/lead-assign` | `AssignLeadServlet` | `PATCH /leads/assign` (body ตรงๆ) | เหลือ REST |
| `POST ../board/schedule/add` | `AddScheduleServlet` | ตัด `movementTypeId`, `activityGroupId`→`procedureGroupId` (ถ้ายังไม่มี) แล้ว `POST /schedules`; HTTP status = envelope status ถ้า ≥400 | rewrite อยู่ใน `work-modal.mock.ts` (ใช้ซ้ำได้); เหลือ REST |
| `PATCH ../board/schedule/edit` | `EditScheduleServlet` | ตัด `leadId`, `id` ไป path → `PATCH /schedules/{id}` | เหมือนกัน |
| `GET ../board/movement-types` | `MovementTypesServlet` | `GET /master-data/movement-types/LD` (+ `MasterDataI18n.translateNames` ถ้า lang=en) | เหลือ |
| `GET ../board/master/activity-groups` | `MasterActivityGroupsServlet` | `GET /master-data/activity-groups?movementTypeId=` (+ translate) | เหลือ |
| `GET ../board/master/employees-by-activity-group` | `MasterEmployeesByActivityGroupServlet` | `GET /master-data/employees/by-activity-group?activityGroupId=` | เหลือ |
| `GET ../board/{tags,sale-groups,provinces,districts,employees}` | `TagsServlet`, `SaleGroupsServlet`, `ProvincesServlet` (เฉพาะจังหวัดไทย — `LeadBoardView.keepThaiProvincesOnly` + cache session), `DistrictsServlet`, `EmployeesServlet` | `GET /master-data/{tags?key=,sale-groups,provinces,districts?provinceId=,employees[?saleGroupId=]}` | เหลือ |
| `GET ../board/prospect-list?…enrich=1` | `ProspectListServlet` → `ProspectListService.fetchPage` | รายการลูกค้าเป้าหมายพร้อม enrich (การ์ดแนะนำใต้ช่องค้นหา) | เหลือ |
| `GET …/board/chat-master-data?type=countries` | `ChatMasterDataServlet` | master ประเทศของ `TsPhone` (shell มี `core/http/mock-countries` สำหรับ mock อยู่แล้ว) | shell |
| (โหมดค้นหาลูกค้าของ modal — หน้า Schedule) `GET ../board/leads?viewMode=list…`, `GET ../board/lead?id=` | `LeadsBoardServlet`, `LeadDetailServlet` | — | หน้านี้ไม่เรียก; mock มีให้ใน `activities.mock.ts` เพื่อพิสูจน์โค้ดของ modal |
| EL ของหน้า | `commonBean.hasFeature(...)`, `commonBean.ssEmployeeId`, `request.contextPath` | `PermissionService.has`, `AuthService.session().employeeId` | host ทำแล้ว |
| `TS_PREF` (ui_pref.js) | — | `ts_activity_selected_mt` (product ที่เลือกล่าสุด) เก็บใน `localStorage` (Java เก็บคู่กับ cookie `tsp_ts_activity_selected_mt` — ไม่ทำ cookie) | host ทำแล้ว |
| `../docproxy?url=` | `DocProxyServlet` (รูป `http://` ของ backend ผ่าน proxy กัน mixed-content) | ไม่มี BFF: `env.docProxy(url)` คืน URL ตรง — live ต้องตัดสินใจ (backend เสิร์ฟ https?) | host (mock ไม่มีรูป http) |

ข้อสังเกตเรื่องข้อมูลจริง (ถามเจ้าของระบบ): (1) `groupBy=lead` ส่ง `procedureGroupName` มาไหม (คอมเมนต์ 16/09 บอกว่าไม่ส่ง — mock ผลิตภัณฑ์แรกส่ง ผลิตภัณฑ์ที่ 2 ไม่ส่ง เพื่อทดสอบ fallback `stepGroupOf`); (2) `tags[]` อยู่ใน item ของ `/contact-activities` หรือยัง (โค้ด BFF/หน้าอ่านถ้ามี); (3) `showClosed` ตอนไม่ส่ง = ตัด SUCCESS/LOST ออกจาก `items` แต่ยังนับใน `statusSummary` (ตามคอมเมนต์ 31/08 — mock ทำตามนี้); (4) ค้นหาด้วย "ชื่อลูกค้า" ไม่เจออะไร (backend กรองเฉพาะ `contactName`) — เป็นพฤติกรรมของ Java ด้วย (คอมเมนต์ในโค้ดบอกว่ารอ backend เพิ่ม `prospectName`).

## 5. ความต่างจาก Java ที่ตั้งใจ (และเหตุผล)

- รูป/ไอคอน: `../images/…`, `#{request.contextPath}/images/…` → `assets/images/…` (เลย์เอาต์ mirror, ไฟล์ byte-identical); ใน CSS เป็น `/assets/images/…` (root-relative เพราะ build ของ Angular ไม่ยอม `url(assets/…)` แบบ relative; `<base href="/">` = ราก — ถ้าจะ deploy ใต้ sub-path ต้องทบทวน). harness map `../images/` ↔ `assets/images/` ใน `normalize`.
- ลิงก์ไปหน้า Lead: `window.location.href='lead_detail.face?…'` → `env.navigate(javaLink)` → host ใช้ `javaLinkToRoute` + router (`/crm/opportunities/:id?activityGroupId=`); anchor "ไปหน้าโอกาสขาย" ของ modal ตั้ง `href` เป็น route จริงและดักคลิกให้ใช้ router. harness แปลงลิงก์ฝั่ง Java ด้วยฟังก์ชันเดียวกันก่อนเทียบ.
- `location.reload()` ของ work modal (หลังบันทึก 3 วินาที) → `env.reload()` = host สร้างหน้าใหม่ (ไม่โหลดเพจ). ถ้าออกจากหน้าก่อน 3 วินาที การ reload ถูกยกเลิก (`tmo`) — spec ตรวจ.
- `TS_PREF`: localStorage อย่างเดียว (ไม่มี cookie สำรอง).
- `swal`: ไลบรารีตัวจริง (`@core/dom/swal`) — host เปิด method `swal()` ให้ spec spy.
- ปุ่ม A A A: `--fs-adj` → `--ts-fs-adj` ทั้งใน CSS, template และสตริง HTML ที่สคริปต์สร้าง.
- ธีมมืดบน `<html>`; `#crm_main_body_page{…}` ของหน้าถูกจำกัดด้วย `:has(.ac-root)` (มีผลเฉพาะตอนอยู่หน้านี้); ส่วน `.layout-main .layout-content{padding:0}` ไม่มีผล (ไม่มี element นี้ใน shell).
- ภาษาอังกฤษ: ชื่อผลิตภัณฑ์/กลุ่ม/พนักงานที่ BFF แปลตามภาษา (`MasterDataI18n`) — mock ตอบชื่อไทยเสมอทั้งสองภาษา (ทั้งสองฝั่งของ harness เหมือนกัน).
- ค่าเริ่มต้นของ "เวลาอ้างอิง" ในกล่องเพิ่มการติดต่อและวันที่ของ modal เพิ่มนัดหมายคือ "ตอนนี้" — `normalize` ใน `page.mjs` แทนเป็น `TNOW`/`TODAY`.

## 6. ผลตรวจ / ความเสี่ยง / สิ่งที่ยังไม่ได้ทำ

ผลการรันสุดท้ายอยู่ที่ §7 — และข้อควรรู้:
- ไม่มี live adapter (ตามขอบเขตเฟส A).
- harness เปรียบเทียบ attribute/ข้อความ/ตำแหน่ง/ขนาด/computed style ที่ dump ไว้ + ค่าของ input/select/textarea + flag `LD2_*` + `localStorage` ของ product + ลิงก์ที่นำทาง (สร้างใน `__extra` ของ `page.mjs`); **ไม่เทียบ**: hover/focus, ไอคอน mask (`mask-image` ไม่อยู่ใน dump — ตรวจด้วยตาจากภาพหน้าจอเท่านั้น), `<img>` ที่โหลดไม่สำเร็จ.
- `proxyImg` กับ URL `http://` ไม่ถูกทดสอบ (mock ไม่มีรูปจากภายนอก) — เป็นโค้ดเดิมของ Java ที่ต่อ `env.docProxy`.
- ปุ่ม "เปิดกล่องเพิ่มนัดหมาย/งาน" รุ่นเก่า (`acItemOverlay`) ใช้ได้เฉพาะเมื่อ work modal ไม่มี (`delete window.ldOpenAddAppt`) — scenario `item-*` จำลองด้วยวิธีนั้น.
- ชื่อผลิตภัณฑ์/กลุ่ม/พนักงานภาษาอังกฤษไม่ได้ถูกแปลโดย mock (ดู §5) — ถ้า live adapter ส่งชื่อ EN มา หน้าจะแสดงตามที่ส่ง (โค้ดหน้าไม่แปลเอง เหมือน Java).
- การรัน generator ใน Node 22 พิมพ์คำเตือน `MODULE_TYPELESS_PACKAGE_JSON` (จาก `port-kit.mjs` ที่ import `core/navigation/java-links.ts`) — ไม่เกี่ยวกับหน้านี้ ไม่มีผลต่อผลลัพธ์.

## 7. ผลสุดท้าย (รันหลังโค้ดนิ่งแล้ว — วันที่ 20/10/2026)

| รายการ | ผล |
| --- | --- |
| `node tools/compare/run.mjs activities --jobs 4` | **368 / 368 scenario ตรงกับ Java ทุกบรรทัด** (DOM + attribute + ข้อความ + ตำแหน่ง/ขนาด + computed style + ค่า input + flag `LD2_*` + localStorage + ลิงก์ที่นำทาง) ใช้เวลา ~17 นาที. ครั้งแรกมี 1 scenario (`search-open-390`) ที่ฝั่ง Angular dump ได้แค่ 12 บรรทัด ตอนเครื่องกำลังรันหลาย workspace พร้อมกัน — harness รันซ้ำเดี่ยวๆ ตรงกันทุกบรรทัด (timing noise ของ browser ไม่ใช่ความต่างของหน้า). error ของ browser ที่รายงานมีอย่างเดียว: `HTTP 500 /triplesale/board/activity-detail?id=106…` ใน scenario `panel-detail-error-java` ซึ่งตั้งใจให้เกิด (lead id หาร 53 ลงตัว) ทั้งสองฝั่ง |
| ประวัติการแก้จาก harness | run 2: 316/320 ตรง — 4 ต่างกันเรื่อง cursor ของปุ่ม disabled (แก้ที่ `_base.scss` ผ่าน `data-java-page`); ก่อนหน้านั้นพบปุ่ม swal ไม่ตรงกลาง/มี letter-spacing (แก้ที่ `_swal.scss`); `_wmOwnPickable` ไม่ประกาศ (แก้ใน generator) — ทั้งหมดแก้ที่ต้นทาง ไม่ได้ผ่อน harness |
| spec ของหน้านี้ | `ng test --include` 5 ไฟล์ **79 / 79 ผ่าน**: `activities.bff.spec.ts`, `activities.mock.spec.ts`, `activities.spec.ts` (host 20 เคส), `work-modal.mock.spec.ts`, `java-links.spec.ts`. ไม่ได้รันทั้งชุดของโปรเจกต์ (ตามข้อกำหนด). แก้ race ใน `activities.spec.ts`: หน้าเปิดแถวแรกเองด้วย `.click()` ทันทีหลัง publish ฟังก์ชันบน `window` ขณะที่ spec ส่งต่อฟังก์ชันให้ inline handler ด้วย interval → ครอบ `HTMLElement.prototype.click` ให้ส่งต่อก่อนทุกครั้ง; รันซ้ำตอน CPU เต็มแล้วผ่าน |
| `ng build` (production) | สำเร็จ ไม่มี warning/budget error; chunk `activities` 186.69 kB (35.65 kB transfer), `activities-mock` 49.93 kB (13.39 kB) — initial bundle ไม่เปลี่ยน. `activities.scss` ~91 KB (หน้า Java เองใหญ่; ไม่เกิน budget) |
| generator | รัน `node tools/sync-activities.mjs` สองครั้ง → ไฟล์เหมือนเดิมทุกไบต์ (idempotent); ทดสอบกับสำเนา Java ที่แก้ 1 บรรทัดของ `activity.xhtml` → หยุดด้วย `NOT FOUND: contextPath: '#{request.contextPath}',` และไม่แตะไฟล์ผลลัพธ์ |
| ไฟล์ใหม่/แก้ใน workspace | เทียบกับ `.ws-manifest.json`: แก้ 6 ไฟล์ shared (routes, page-registry, java-links.spec, `_base.scss`, `_swal.scss`, `compare/lib/runner.mjs`) และเพิ่ม 35 ไฟล์ (รายการใน §1–§2: generator + `tools/lib/{work-modal,port-script}.mjs`, harness, `features/activities/*`, `shared/work-modal/*`, `shared/ui/live-missing` (สำเนา), 13 รูป + `step_group_color.js` ใน `public/assets`, `manual-activities.html`, INTEGRATION.md). ยังไม่ได้แก้ `package.json`, `CLAUDE.md`, `README.md`, `manual/index.html` ใน workspace — ผู้ประสานงานทำตาม §1 ตอน merge |

ทำซ้ำ: `node tools/sync-activities.mjs` → `node node_modules/@angular/cli/bin/ng.js test --watch=false --include "src/app/features/activities/**/*.spec.ts" --include "src/app/shared/work-modal/**/*.spec.ts"` → `node tools/compare/run.mjs activities --jobs 4` (ดูรายการที่ต่าง: `--show <scenario>`, `--style`, `--geom`).
