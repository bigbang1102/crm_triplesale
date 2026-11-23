# INTEGRATION — เฟส B (live adapter) ของ `activities` (การติดต่อ) + `schedule` (ปฏิทินงาน)

workspace: `triple_sale_angular_ws_activities` · ขอบเขต: backend แบบ live (REST ของ `triplesale-service` แทน BFF) ของ 2 หน้า + โมดูลร่วม `src/app/core/live/activities.live.ts`
ความจริงที่ต้องอ่านก่อน: **ไม่มี test account** — ทุกอย่างพิสูจน์ได้แค่ "ทำเหมือน servlet ของ Java บน fixture ที่เขียนจากโค้ด Java" (spec + `--live` กับ fake service) **ไม่ใช่ "ถูกต้องกับข้อมูลจริง"**; ต้องมี smoke test ด้วยบัญชีทดสอบจริงอีกครั้ง (ดู §6, §9)

## 0. ถึงผู้ประสานงาน (อ่านก่อน)

1. **ไม่มีไฟล์ shared ที่ต้องแก้เพิ่ม** — `app.routes.ts` / `page-registry.json` มีทั้งสองหน้าแล้วจากเฟส A. ผม `refresh` แล้ว: `src/app/core/dom/phone-format.service.ts` (+ spec) ใน workspace **เป็นฉบับของผู้ประสานงานทุกไบต์** (ตอนแรกผมแก้เองเพราะ `--live` เห็นเบอร์โทรไม่จัดรูปแบบ — เจอว่าคุณแก้ไว้ตรงกันแล้ว จึงคืนเป็นของคุณ ไม่มี diff). `--live` ของ activities พึ่งมัน: master ประเทศมาจาก `GET /master-data/countries?page=1&pageSize=1000` ซึ่ง fake service ตอบให้
2. **เพิ่มไฟล์ใน `src/app/core/live/` มากกว่าที่ brief ระบุ 2 ไฟล์**: `activities.live.parse.ts` และ `activities.live.spec.ts` (ข้าง ๆ `activities.live.ts`). เหตุผล: logic ของ `ContactActivityApiService` / `LeadBoardView.fetchActivityDetailResult` ที่เฟส A เขียนไว้ใน `features/activities/activities.bff.ts` ต้องถูกเรียกจาก `activityRoutes` ซึ่งอยู่ใน core (core ห้าม import features) จึงย้ายไป `core/live/activities.live.parse.ts` (แบบเดียวกับ `dashboard.live.parse.ts`); `features/activities/activities.bff.ts` เหลือเป็น `export *` เพื่อให้ mock + spec เดิมใช้ชื่อเดิมต่อได้
3. **merge ได้ตรง ๆ** (ไม่มีไฟล์ในรายการ shared ของ `workspace.mjs`): ดู §2. ไฟล์ที่ **แก้** ของที่มีอยู่แล้ว (ทั้งหมดอยู่ในโฟลเดอร์หน้าของผมเอง): `features/activities/{activities.ts,activities-view.ts,activities-backend.ts,activities.bff.ts,activities.mock.ts,*.spec.ts}`, `features/schedule/{schedule.ts,schedule-view.ts,schedule.mock.spec.ts,schedule.spec.ts}`, `tools/compare/pages/{activities,schedule}/{page,scenarios}.mjs`. **ไม่ได้แก้** `tools/compare/lib/**`, `tools/lib/**`, `core/live/{rest,rest-deps,rest-fake,org-json,json-java,board-master.live,lead-core.live}.ts`, `leads.live.ts`, `prospect*.live.ts` (ตอนส่งรอบแรกคืน placeholder เป็นของเดิมทุกไบต์; ตอนนี้เป็นฉบับจริงของ main ทุกไบต์ — ดู §11)
4. **ข้อความที่ควรอัปเดตใน shared docs** (ผมไม่แตะ `docs/**`, `CLAUDE.md`, `README.md`, `manual/**`):
   - `CLAUDE.md` bullet ของ activities / schedule: ตอนนี้ "เฟส A = โหมด mock เท่านั้น … `mock:false` หน้าขึ้น `<ts-live-missing />`" ไม่จริงแล้วสำหรับ 2 หน้านี้ → "live = `core/live/activities.live.ts` (+ `.parse.ts`) + `features/<หน้า>/<หน้า>.live.ts`; `mock:false` เรียก REST ของ triplesale-service ผ่าน HttpClient"
   - `docs/integration/activities.md` §4 / `schedule.md` §9: คอลัมน์ "สถานะ" "เหลือ REST" → พอร์ตแล้ว (ตาราง §3 ด้านล่าง)
   - `README.md` แถว Activities / Schedule: "พอร์ตแล้ว (mock + live)"
5. **หน้าทั้งสองที่ผมแก้ host ให้เลือก mock/live** — ลบ `<ts-live-missing />` ออกจาก `activities.ts` / `schedule.ts` แล้ว (`LiveMissing` ไม่มีผู้ใช้จาก 2 หน้านี้อีก)
6. ~~รัน `--live` ซ้ำ 54 scenario หลัง leads/prospects merge~~ **ทำแล้ว (รอบติดตามผล)**: ทั้ง 54 ตัว identical กับโมดูลจริง และรอบเต็มของทั้งสองหน้า identical หมด — ดู §7 และ §11

## 1. ผลสรุป

| รายการ | ผล |
| --- | --- |
| servlet ที่พอร์ต | 9 ตัวของ activities/schedule (`ActivityList` · `ActivityDetail` · `ContactActivities` · `AssignLead` · `ActivityGroups` · `ActivitySteps` · `ForwardAssignees` · `ScheduleFetch` · `ScheduleFilterState` + `ScheduleView.getSavedFilterJson`). ไม่พอร์ต 2 ตัวที่ไม่มีหน้าไหนเรียก (§3) |
| spec ของงานนี้ | `ng test` 18 ไฟล์ / **284 ข้อผ่าน** (ชุด `core/live/**`, `features/activities/**`, `features/schedule/**`, `core/dom/**`, `shared/work-modal/**`). ที่เป็นของใหม่/เขียนใหม่: `core/live/activities.live.spec.ts` 32 · `features/activities/activities.bff.spec.ts` 41 (เขียนใหม่จากโค้ด Java) · `features/activities/activities.live.spec.ts` 4 · `features/schedule/schedule.live.spec.ts` 6 · ข้อ "mock off" ของ host spec ทั้งสองหน้าเปลี่ยนเป็นทดสอบว่า host ถาม live backend (REST) จริง |
| `--live` activities | **367 / 367 identical** (ข้าม 1 ตัว `live:false` จาก 368) — รอบเต็ม `--jobs 2` หลัง leads/prospects merge (1903 วิ) |
| `--live` schedule | **593 / 593 identical** — รอบเต็ม `--jobs 2` (3011 วิ) |
| `ng build` (production) | ผ่าน exit 0, **ไม่มี warning / budget**; initial total 554.46 kB; chunk `schedule` 214.68 kB · `activities` 184.37 kB (lazy; live/mock เป็น chunk แยกของตัวเอง) |
| ไฟล์ generated | ไม่แก้ (`*.engine.ts`, `*.html`, `*.scss`, generator) |

## 2. ไฟล์

**เพิ่ม**
```
src/app/core/live/activities.live.ts            activityRoutes(deps) + scheduleRoutes(deps) + activitiesRestOf(deps) + scheduleFilterStore / savedFilterText
src/app/core/live/activities.live.parse.ts      logic บริสุทธิ์ (port ของ ContactActivityApiService, LeadBoardView.fetchActivityDetailResult/acBuildHistoryGroups/…, AttachUrl.collapse, ContactChannel)
src/app/core/live/activities.live.spec.ts       32 ข้อ — ทุก route ด้วย fakeRest
src/app/features/activities/activities.live.ts  createLiveActivities(deps) = composeRoutes(activity, boardMaster, leadCore, leads*, prospect*)
src/app/features/activities/activities.live.spec.ts
src/app/features/schedule/schedule.live.ts      createLiveSchedule(deps) (+ initial() = ScheduleView.getSavedFilterJson) = composeRoutes(schedule, boardMaster, leadCore, leads*, prospect*)
src/app/features/schedule/schedule.live.spec.ts
```
(* = `opportunitiesRoutes` / `prospectRoutes` ของ leads / prospects worker — ตอนนี้เป็นโมดูลจริงแล้ว คอมโพสตามเดิม)

**แก้ (เฉพาะโฟลเดอร์หน้าของตัวเอง + harness ของตัวเอง)** — ดู §0 ข้อ 3. สรุป: host เลือก mock/live (`backend()` เป็น method เหมือน drilldown) · `ActivitiesRest` เปลี่ยนเป็นชั้น "ขนส่ง" (status + ข้อความ body เหมือนที่ `Data_API` เห็น) แล้ว logic ทั้งหมดอยู่ใน `activities.live.parse.ts` · `activities.mock.ts` ห่อ REST ของ seed ให้ตอบเป็นข้อความ + handler `activity-detail` / พารามิเตอร์ใช้การ parse แบบ Java · `page.mjs` ของทั้งสองหน้าเพิ่ม `upstream` (fake REST service) · `scenarios.mjs` ของ schedule ให้ `cfg()` / `seed()` ส่งสวิตช์/สถานะไปให้ fake service (§5) และของ activities ใส่ `live:false` 1 ตัว

## 3. servlet ที่พอร์ต / ไม่พอร์ต

| URL ที่หน้าเรียก | Java | live (ที่ไหน) | REST ที่เรียก | สถานะ |
| --- | --- | --- | --- | --- |
| `GET /board/activity-list` | `ActivityListServlet` → `ContactActivityApiService.fetchActivityListJson` | `activityRoutes` + `fetchActivityList` | `GET /contact-activities?groupBy=lead` **และ** `groupBy=group` (ขนาน; พารามิเตอร์ตามลำดับของ `fetchPage`: groupBy, movementTypeId, leadId, saleGroupId, employeeName, contactName(=search), activeStatus, lastContactFrom/To, assignDateFrom/To, showClosed, sortBy, **pageSize, pageNo** — encode แบบ `URLEncoder`; หน้า 1 ไม่ส่ง pageNo, หน้า n ส่ง n-1) + `GET /leads/{id}/contact-history` ของทุก lead ที่ `groupCount>1` (ครั้งเดียวต่อ lead) | พอร์ตแล้ว |
| `GET /board/activity-detail` | `ActivityDetailServlet` → `LeadBoardView.fetchActivityDetailResult` | `fetchActivityDetail` | `GET /leads/{id}[?activityGroupId=]` (ลองใหม่แบบไม่แนบกลุ่มถ้าพลาด; ถ้าพลาดทั้งคู่ใช้ error ของคำขอแรก) | พอร์ตแล้ว |
| `POST /board/contact-activities` | `ContactActivitiesServlet` | `activityRoutes` | `POST /leads/{leadId}/contact-activities` (ตัด `leadId`, `channel` → `ContactChannel.toO2oLabel`; ส่ง status + body ของ service กลับ) | พอร์ตแล้ว |
| `POST /board/lead-assign` | `AssignLeadServlet` | `activityRoutes` | `PATCH /leads/assign` (body ดิบตามที่หน้าเขียน; หน้าได้ HTTP 200 + body ของ service เสมอ) | พอร์ตแล้ว |
| `GET /board/activity-groups` | `ActivityGroupsServlet` | `activityRoutes` | `GET /leads/{id}/activity-groups` + `MasterDataI18n.translateEnvelopeResult` | พอร์ตแล้ว (ผู้เรียกคือ `history_filter_modal.xhtml` ของ lead-detail; 2 หน้านี้ไม่เรียก) |
| `GET /board/activity-steps` | `ActivityStepsServlet` | `activityRoutes` | `GET /leads/{id}/activity-steps[?activityGroupId=]` (`fetchMasterArray`) | พอร์ตแล้ว (ผู้เรียกคือ `history_filter_modal.xhtml` เช่นกัน) |
| `GET /board/forward-assignees` | `ForwardAssigneesServlet` | `activityRoutes` | `GET /leads/{id}/forward-assignees[?activityStepId=]` | พอร์ตแล้ว (brief สั่ง; **ไม่มีหน้าใน `web/` เรียก** — servlet กำพร้า) |
| `GET /board/schedule/fetch` | `ScheduleFetchServlet` | `scheduleRoutes` | `GET /schedules?viewMode=…` — ค่าต่อท้ายตามที่มา **ไม่ encode** (ยกเว้น `search`) ตามลำดับ type, dateFrom, dateTo, sort, page, perPage, movementTypeId, activityGroupId, serviceId, assignToId, appointmentStatus, taskStatus, search; ขาด param → 400 ข้อความของ servlet; service ไม่ตอบ 200 → stand-in `{"status":204,…}` HTTP 200 | พอร์ตแล้ว |
| `GET|POST /board/schedule-filter-state` + `scheduleView.savedFilterJson` | `ScheduleFilterStateServlet` + `ScheduleView.getSavedFilterJson` | `scheduleRoutes` + `createLiveSchedule().initial()` | ไม่มี REST — เก็บใน `sessionStorage` ของแท็บ (key `ts.sc_filter_state.<username>`) | พอร์ตแล้ว (HttpSession → client storage ตาม brief) |
| `/board/movement-types`, `/board/master/*`, `/board/employees`, `/board/sale-groups`, `/board/tags`, `/board/provinces`, `/board/districts`, `/board/chat-master-data` | master-data servlets | `board-master.live.ts` (ของกลาง ใช้ตามเดิม ไม่เขียนซ้ำ) | — | ใช้ของกลาง |
| `/board/lead`, `POST /board/schedule/add`, `PATCH /board/schedule/edit` | `LeadDetailServlet`, `AddScheduleServlet`, `EditScheduleServlet` | `lead-core.live.ts` (ของกลาง) | — | ใช้ของกลาง |
| `/board/leads?viewMode=list` (ค้นหาลูกค้าใน work modal) | `LeadsBoardServlet` | `opportunitiesRoutes` (leads worker, merge แล้ว) | `GET /leads?viewMode=list&…` | ใช้ของกลาง |
| `/board/prospect-list` (การ์ดแนะนำใต้ช่องค้นหา ของ activities) | `ProspectListServlet` | `prospectRoutes` (prospects worker, merge แล้ว) | `GET /prospects?…` + `GET /prospects/{id}/quick-view` ต่อแถว (enrich=1) | ใช้ของกลาง (หน้า schedule ไม่เรียก — §7 ข้อ 1 ของ `docs/integration/schedule.md`) |
| `../docproxy?url=` | `DocProxy` | — | — | **ไม่ใช่ route แล้ว** — ดู §8.1 |
| `/api/v1/contact-activities` (copy ของ service สำหรับ Postman) | `ContactActivitiesListServlet` | — | — | **ไม่พอร์ต** — ไม่มีหน้าไหนเรียก (`web/` มีแค่คอมเมนต์ใน `activity.xhtml`) |
| `/board/schedule/status` | `ScheduleStatusServlet` | — | — | **ไม่พอร์ต** — ไม่มีผู้เรียกใน `web/` (โค้ดตกค้างจากหน้าเก่า) |

## 4. สิ่งที่พบจากการอ่านโค้ด Java ครบทุกไฟล์ (เฟส A "พอร์ตเรียบร้อย" แต่ต่างจาก Java จริง)

ผมไม่เชื่อ `activities.bff.ts` ตามที่ brief บอก — อ่าน `ContactActivityApiService` (1,009 บรรทัด), `LeadBoardView` ส่วนที่เกี่ยวข้อง, `Data_API`, `AttachUrl`, `ContactChannel`, servlet ทุกตัว แล้วเขียนใหม่ตามนั้น. ที่พบ:

1. **ข้อความผิดพลาดของ `/contact-activities` ไม่ใช่ข้อความของ service**: `Data_API.sendGET` คืน `""` สำหรับ HTTP ที่ไม่ใช่ 200 (body ของ error แค่ลง log). ดังนั้น 403 "ไม่มีสิทธิ์" → ตารางพิมพ์ **"ไม่ได้รับข้อมูลจาก API การติดต่อ"** (ข้อความใน `ContactActivityApiService` ที่ว่า "ส่งต่อขึ้นหน้าจอ" เป็นคอมเมนต์เก่า) — mock/bff เฟส A พิมพ์ข้อความของ 403. แก้ใน `activities.live.parse.ts` (ใช้ร่วมกับ mock) + ปรับ spec 2 ข้อของ `activities.mock.spec.ts`. ข้อความของ service ออกได้เฉพาะกรณี HTTP 200 + envelope status ≠ 200 (`errorMessage`)
2. **`AttachUrl.collapse` ไม่เคยถูกพอร์ต** (เฟส A เขียนว่า "ไม่ได้พอร์ต") — host ซ้อนหน้า host (`http://h/http://h/a.jpg`) ทำให้รูปลูกค้า 404. พอร์ตแล้วใช้กับ `prospectAvatar` / `contactAvatar` (แถวแม่ + แถวลูก) และ `attachFile` ของ activity-detail (รวม `events[].customer_avatar`)
3. **ความหมายของสตริง/ตัวเลขแบบ Java** (เฟส A ใช้ของ JS ซึ่งต่าง): `String.trim()` ตัดถึง U+0020 เท่านั้น · `String.split` ตัดสตริงว่างท้าย (`"09:".split(":")` = `["09"]` → เวลา "09:00") · `compareTo` เทียบ UTF-16 code unit (เฟส A ใช้ `localeCompare` → ลำดับ `'T'`/`' '` ในวันที่ผิด) · `Integer.parseInt` เข้ม (`"9x"` → ทิ้งเวลา) · `Long.parseLong` ของ `wfsId`/`activityGroupId` (เฟส A ใช้ `Number()`) · org.json: `optJSONObject`/`optJSONArray` รับเฉพาะ object/array, `optInt("200")`, `optBoolean("TRUE")` — ใช้ `org-json.ts` ของกลางทั้งหมด
4. **`new JSONObject(text)` ที่พัง = exception** → `emptyJson(ex.getMessage())` (ตารางพิมพ์ข้อความของ exception) — พอร์ตแล้ว (ข้อความเป็น `…JSONException: …` แต่ไม่ตรงตัวกับของ org.json จริง — ทำซ้ำไม่ได้)
5. **รายการของ `result` ที่ไม่ใช่ object** → `activity-detail` ตอบ 500 + `opportunityErrorJson(500, default)` (เฟส A ไม่ได้ครอบ)
6. **`ScheduleFetchServlet` ไม่เคยตอบ 500 เมื่อ REST ล้ม**: `pull_JsonObject` = `sendGET` → `""` → servlet ใช้ stand-in `{"status":204,"message":"no content","result":{"viewMode":…,"items":[]}}` **HTTP 200** — หน้า **แสดงปฏิทิน/บอร์ด/ตารางว่าง ไม่ใช่หน้า error**. เช่นเดียวกัน `MovementTypeServlet` → `{"status":204,…,"result":{"items":[]}}` (หน้าซ่อน dropdown) และ `MasterActivityGroupsServlet` → `{}`. mock เฟส A เล่น "service ล้ม" เป็น HTTP 500 ของ BFF (ซึ่ง servlet จริงไม่เคยตอบ) — scenario `err-*` จึงทดสอบ "BFF ตอบ 500" (ยังมีค่าในโหมด mock) แต่ไม่ใช่สิ่งที่ live ทำกับ REST ที่ล้ม. ใน `--live` ผมให้ replica ของ Java ตอบเหมือน servlet จริงเมื่อ REST ล้ม (`handle()` ใน `schedule/page.mjs`, อธิบายไว้ในโค้ด) และ fake service ตอบ HTTP 500 จริง — ผล: `err-*` identical ทั้งหมด (พิสูจน์ว่า live ทำเหมือน servlet จริงเมื่อ service ล้ม)
7. **`ActivityListServlet` ไม่เคยตอบ HTTP 500**: `fetchActivityListJson` จับทุก exception เอง → scenario `search-server-error` (mock จำลอง 500) เป็น `live:false`
8. **ค่าพารามิเตอร์ของ `ScheduleFetchServlet` ต่อ URL แบบดิบ** (ไม่ encode ยกเว้น `search`; `appointmentStatus=scheduled,re-schedule` ลูกน้ำดิบ) — ทำตามนั้นทุกตัว ถ้าค่ามี `&`/`#` จะเพี้ยนเหมือน Java (ไม่ได้ "แก้ให้ปลอดภัยกว่า" เพราะต้อง "เหมือน Java 100%"; ค่ามาจาก UI ของหน้าเอง)
9. `activity-list` ไม่มี role pre-check ใน servlet (service เป็นผู้ตัดสิน → HTTP 403 → ข้อ 1)

## 5. fake service ของ `--live` สมมติรูป REST จริงอย่างไร (ยืนยันกับ service จริงไม่ได้)

fake service (`upstream` ใน `page.mjs` ของทั้งสองหน้า) ตอบจากข้อมูลชุดเดียวกับ replica ของ Java; รูปทั้งหมดมาจาก **สิ่งที่โค้ด Java อ่าน** ไม่ใช่จาก OpenAPI/ข้อมูลจริง:

- envelope ของ service: `{status, message, result}`; error: `{status, message, error:{code, message}}`
- `GET /contact-activities`: `result = { items[], meta:{page(0-based), perPage, total, totalPages}, statusSummary:{total,new,success,lost,inactive,active:{total,hot,warm,cold}}, usesWorkflowStep, wfStepSummary[], movementTypeId }`; item = `leadId, contactCode/Name/Avatar, prospectName/Avatar/Id/Code/Tel, txNo, leadDemand, procedureGroupId/Name, procedureId/Name, wfsId, groupCount, leadStatus, activeStatus, tags[], lastContactDate, assignDate, lastAppointmentDate, note/line/facebook/whatsapp/email/sms/call/visit`; พารามิเตอร์ request ชื่อ `pageNo/pageSize` (response meta ชื่อ `page/perPage`)
- `GET /leads/{id}/contact-history`: `result` = `{groups[].steps[].items[]}` หรือ array แบน; รายการ = `changeDate, channel, type, content, contactTxNo, procedureGroupId/Name, procedureName, salePerson|employee{code,name}`
- `GET /leads/{id}`: `result = { prospect{name,attachFile,currentDistrictName,currentCityName,customerTel,phoneCountryCode,countryCode}, prospectInfo{fullName,firstContactDate,contactInfo{mobile1}}, salePerson, saleGroup, employee, leadStatus, activeStatus, contactDate, currentStep, contactHistoryList[], appointmentList[], taskList[] }`; lead ที่มีหลายกลุ่มต้องส่ง `activityGroupId` (ไม่ส่ง = 400)
- master data: `/master-data/movement-types/LD` → `result` เป็น **array**; `/tags?key=`, `/sale-groups`, `/provinces`, `/districts?provinceId=`, `/employees[?saleGroupId=]` → `result` เป็น array; `/activity-groups?movementTypeId=` → `result.items[]`; `/employees/by-activity-group` → `result[]`; `/countries?page=1&pageSize=1000` → `result[]` ของ `{code, phoneCountryCode, phoneNumberFormat}`
- `POST /schedules` → HTTP 201 + envelope; `PATCH /schedules/{id}`; `GET /schedules?viewMode=…` รูปตาม `schedule-backend.ts` (month/week/day `result.items`, year `result.marks`, board `result.appointment|task` + `summary`, list `result.list.*`)
- สวิตช์ของ mock ของ schedule ที่ `--live` ต้องเล่นให้ทั้งสองฝั่ง: `cfg()` ใน `scenarios.mjs` ส่ง `live:{hook: JSON}` → `state.hook` (fake service สร้าง mock ใหม่ตามสวิตช์); `seed()` ตั้งทั้งคีย์ของ mock และ `ts.sc_filter_state.demo` (ผู้ใช้ของ harness คือ `demo`)

## 6. ผลตรวจ (รายละเอียด)

### 6.1 spec (`CI=1 node node_modules/@angular/cli/bin/ng.js test --no-watch --include …`)
คำสั่ง: `--include 'src/app/core/live/**/*.spec.ts' --include 'src/app/features/activities/**/*.spec.ts' --include 'src/app/features/schedule/**/*.spec.ts' --include 'src/app/core/dom/**/*.spec.ts' --include 'src/app/shared/work-modal/**/*.spec.ts'` → 18 ไฟล์ **284 ผ่าน** (รวม spec ของ `core/dom` ที่ refresh ดึงมา). expectation เขียนจากการอ่านโค้ด Java (ไม่ได้ copy จากผลที่รันได้): URL/query/ลำดับ/encoding ของทุก REST call, เส้นทางผิดพลาดทุกแบบ (non-200, ไม่ใช่ JSON, ไม่มี result, status 0, 204/1xx ที่ `Response` ให้ body ไม่ได้), 400 ของ servlet เอง, clamp/default, EN vs TH (`activity-groups`), filter-state, store ที่ถูกบล็อก

### 6.2 `--live`
```
node tools/compare/run.mjs activities --live --no-build --jobs 3    # 2030 วิ (เครื่องใช้ร่วมกัน)
node tools/compare/run.mjs schedule   --live --no-build --jobs 3    # 3302 วิ
```
- รอบแรกบนเครื่องที่ถูกใช้พร้อมกันหลายงาน มี scenario ต่าง "จากจังหวะ" (`Runtime.callFunctionOn timed out`, `no element …`) 38 (activities) / 40 (schedule) ตัว — รันซ้ำทีละตัว (ขั้น confirm ของ harness) หายหมด ที่เหลือคือรายการใน §7 เท่านั้น. ผมตรวจต่อ: `search-text` ที่ต่างเยอะรอบเต็มเหลือ 1 บรรทัด (รายการแนะนำ prospect) เมื่อรันเดี่ยว
- **รอบติดตามผล (หลัง leads/prospects merge)**: `node tools/compare/run.mjs activities --live --no-build --jobs 2` → 367/367 identical (1903 วิ); `schedule --live --no-build --jobs 2` → 593/593 identical (3011 วิ); ไม่มีรอบ confirm เพราะไม่มี scenario ต่าง
- scenario ที่ REST ล้ม (`err-*`, `board-drag-fail*`, `wm-edit-save-fail`, `product-forbidden` …) identical ทั้งหมด — fake service ล้มจริง (HTTP 403/500/400)

### 6.3 (ประวัติ) สะพานชั่วคราวก่อน leads/prospects merge
ตอนที่ `opportunitiesRoutes` / `prospectRoutes` ยังเป็น placeholder ผมพิสูจน์ว่า 54 scenario ต่างเพราะ placeholder เท่านั้นด้วยสะพานชั่วคราวใน workspace (ส่ง `/board/leads` และ `/board/prospect-list` ต่อไปยัง route ทดสอบของ fake service → activities 30/30, schedule 29/29 identical) แล้วคืนไฟล์เป็นของเดิมทุกไบต์ (sha1 ตรง manifest). **สะพานนั้นถูกแทนที่ด้วย REST fake จริงแล้ว** (§11) — ไม่เหลืออะไรจากสะพานในโค้ด/harness

## 7. scenario ที่ข้าม / ที่เคยขึ้นกับโมดูลของ worker อื่น

**ข้าม (`live:false`)** — activities: `search-server-error` (HTTP 500 ของ servlet ที่ REST ทำให้เกิดไม่ได้ — §4 ข้อ 7). ไม่มี scenario อื่นที่ข้าม

**ที่เคยขึ้นกับ placeholder (54 ตัว) — ปิดแล้ว**: หลัง leads + prospects worker merge ผมรีเฟรชโมดูลจริงเข้า workspace (`core/live/{leads,prospect,prospect-list,prospect-payload,prospect-files}.live.ts`, `rest-deps.ts`, `dashboard-api.live.ts` + spec — ไม่แก้) และเพิ่ม REST fake ใน `upstream` ของทั้งสองหน้า (§11):
- activities 25 ตัวเดิมที่ต่าง (7 `search-*` ที่ใช้การ์ดแนะนำลูกค้า: `search-text`, `search-clear`, `search-debounce-typing`, `search-suggest`, `search-suggest-dark`, `search-suggest-pick`, `search-after-sort` + 18 `wm-cust-*`): **ชุด 30 ตัว (`search-*` เหล่านี้ + `wm-cust-.*`) identical 30/30**
- schedule 29 ตัวเดิมที่ต่าง (`wm-add-customer-*`, `wm-add-validate-*`, `wm-add-save-*`, `wm-add-nosup-*`, `wm-add-reopen-resets`, `en-wm-add-*`, `fs-plus-wm-add-customer` …): **29/29 identical**
- แล้วรันรอบเต็มทั้งสองหน้า `--live --no-build --jobs 2` อย่างละหนึ่งครั้ง: **activities 367/367 identical, schedule 593/593 identical** (log: `.compare/activities-live-run2.log`, `.compare/schedule-live-run2.log`) — ไม่มี scenario ที่ต่างเหลือ ไม่ต้องรันซ้ำ

## 8. ข้อตัดสินใจ (ตัดสินแบบระวัง — ไม่มีใครให้ถามได้)

1. **`docproxy`**: ไม่ทำ proxy — `env.docProxy: (url) => url` (รูป `http://` ของ file server โหลดตรง). เหตุผล: ไม่มี BFF และ `DocProxy` เป็น servlet ดึงไฟล์ฝั่ง server (กัน mixed-content + SSRF allowlist) ซึ่งทำใน browser ไม่ได้. **ความเสี่ยง**: ถ้าเว็บใหม่ถูกเสิร์ฟด้วย https แต่ `attachFile` เป็น `http://…` เบราว์เซอร์จะบล็อกรูป (mixed content) → รูปลูกค้า/พนักงานในตารางและแผงขวาไม่ขึ้น (ขึ้น avatar ไม่ได้ แต่หน้ายังทำงาน). ทางออกที่ต้องให้เจ้าของระบบเลือก: (ก) file server เสิร์ฟ https / ให้ service คืน URL https, (ข) gateway ทำ `/docproxy`, (ค) ให้ผมแปลง `http://` → `https://` เมื่อหน้าเป็น https (ไม่ทำเองเพราะเดา)
2. **HttpSession → sessionStorage** (`sc_filter_state` ของ schedule): key `ts.sc_filter_state.<username>` ต่อแท็บ. ต่างจาก Java: HttpSession ใช้ร่วมทุกแท็บของเบราว์เซอร์ → แท็บใหม่ใน Java ได้สถานะล่าสุด, ที่นี่แท็บใหม่เริ่มสะอาด (F5 / เปลี่ยนภาษา / บันทึกแล้ว reload ยังได้สถานะเดิม). ค่าที่ไม่ใช่ JSON ใน Java ทำสคริปต์หน้าพัง; ที่นี่ถือว่า "ไม่มีสถานะ" (`initial()` คืน null). ถ้าต้องการให้ข้ามแท็บ → `localStorage` (บอกได้)
3. **cache/พฤติกรรมที่ไม่พอร์ต** (บอกไว้ตาม brief): โหมดสำรอง `activity.list.source=aggregate` (`config.properties` ตั้ง `api` + `activity.list.group.topup=true` → พอร์ตตามค่านี้ ไม่มี flag) · `activity.list.maxrows` (ไม่ตั้ง → 1000 ตาม default) · timeout 60 วิของ worker thread (ให้เบราว์เซอร์/HttpClient ตัดสิน) · `UNFILTERED_TOTAL` (log เตือนอย่างเดียว) · cache session ของ servlet master-data (ของกลาง) · log/curl dump
4. **HTTP method ผิด** → JSON 405 (container ตอบหน้า 405 ของตัวเอง) — เหมือน `lead-core.live.ts`
5. **status ที่ `Response` ให้ไม่ได้**: status ของ service ถูกส่งต่อตามที่ servlet ทำ (`resp.setStatus`); 204/205/304 ไม่มี body, ค่านอก 200–599 (เช่น 1xx) = 502
6. `Promise.allSettled` แทน `Future.get` ตามลำดับเดิม: error ของ view `lead` มาก่อน `group` เสมอ (ตามที่ Java รอ `leadTask.get` ก่อน); lead มี error ธรรมดา → คืนทันทีโดยไม่สนผลของ `group`

## 9. คำถามถึงเจ้าของ backend

1. `GET /contact-activities`: (ก) `groupBy=lead` ส่ง `procedureGroupName` ไหม (คอมเมนต์ 16/09 บอกไม่ส่ง — โค้ดใช้ fallback จาก groupBy=group แล้ว procedureName) (ข) `tags[]` อยู่ใน item แล้วหรือยัง (ค) บั๊ก `groupBy=group` คืนแถวเดียวต่อ lead (ทำให้ต้องยิง `/contact-history` ของทุก lead ที่ `groupCount>1`) ยังอยู่ไหม (ง) ค้นหาด้วย **ชื่อลูกค้า** กรองไม่ได้ (รับแต่ `contactName`) จะเพิ่ม `prospectName` ไหม (จ) `showClosed` ไม่ส่ง = ตัด SUCCESS/LOST ออกจาก `items` แต่ยังนับใน `statusSummary` ใช่ไหม
2. **สิทธิ์ `CRM_ContactActivity_View`**: service ตอบ 403 + ข้อความ แต่ Java ทิ้ง body ของ error (`sendGET` = "") → ผู้ใช้เห็น "ไม่ได้รับข้อมูลจาก API การติดต่อ" เท่านั้น. ต้องการให้แสดงข้อความ 403 จริงไหม? (ทำได้ด้วย `sendGETWithStatus` แบบ `/leads/{id}` — ผมไม่เปลี่ยนเองเพราะ "เหมือน Java")
3. `GET /leads/{id}/contact-history`: รูปที่ส่งจริง (`groups[].steps[].items[]` หรือ array แบน หรือ `items[]`) — โค้ดรองรับทุกแบบ แต่ผมไม่รู้ว่าแบบไหนจริง
4. `GET /schedules`: (ก) `sort` ที่รองรับจริง — servlet เขียนคอมเมนต์ `latest|oldest|status` แต่หน้าส่ง `date_desc|date_asc|order_asc|order_desc|status` (ข) **service ล้ม/ตอบ non-200 ทำให้หน้าเห็นปฏิทินว่าง ไม่ใช่หน้า error** (พฤติกรรมของ servlet จริง — §4 ข้อ 6) ตั้งใจหรือไม่ (ค) รูป `result` ของ board/list/year ตามที่ `schedule-backend.ts` อธิบาย ใช่ไหม
5. file server: รองรับ https ไหม / URL ของ `attachFile` ที่ service ส่งเป็น `http://` ทุกกรณีไหม (§8.1)
6. `POST /leads/{id}/contact-activities` และ `PATCH /leads/assign`: body/ผลลัพธ์ที่ service คืนจริง (ผมส่งต่อ status + body ดิบ)
7. ต้องการให้ `scheduleFilterState` ข้ามแท็บ/ข้ามเครื่อง (เก็บฝั่ง service หรือ preference ของผู้ใช้) ไหม (§8.2)

## 10. ความเสี่ยง / ข้อจำกัดที่ต้องรู้

- **ยืนยันกับ service จริงไม่ได้** — รูป REST ใน §5 เป็นข้อสันนิษฐานจากโค้ด Java; field ที่ service ส่งจริงแต่โค้ด Java ไม่อ่าน fake service ไม่มี. ต้อง smoke test ด้วยบัญชีทดสอบ
- harness รอบเต็มบนเครื่องที่มีงานอื่นรันพร้อมกันมี scenario ต่างจากจังหวะ (timeout ของ puppeteer) หลายสิบตัวในรอบแรก — ใช้ขั้น confirm (รันซ้ำทีละตัว) ตัดสิน; รอบเต็มด้วย `--jobs 3` ใช้ 34 นาที (activities, 367 ตัว) และ 55 นาที (schedule, 593 ตัว) เมื่อเครื่องถูกใช้พร้อมกันหลายงาน
- ค่าพารามิเตอร์ของ `schedule/fetch` ต่อ URL ดิบตาม Java (§4 ข้อ 8) — ถ้าค่ามี `&`/`#`/ช่องว่างจะเพี้ยนเหมือนเดิม (UI ของหน้าไม่ส่งค่าแบบนั้น)
- เบอร์โทรใน live พึ่ง `PhoneFormat` ของ shell (§0 ข้อ 1)
- scenario ของ `--live` ที่ REST ล้มของ schedule พึ่งการเล่นของ replica (§4 ข้อ 6) — ถ้าผู้ประสานงานเปลี่ยน mock ของ schedule ต้องแก้ `handle()` ให้ตรงกัน


## 11. รอบติดตามผล (หลัง leads + prospects worker merge เข้า main)

**ที่ทำ**
1. นำโมดูลจริงเข้า workspace: `core/live/opportunities.live.ts`, `prospect.live.ts`, `prospect-list.live.ts`, `prospect-payload.live.ts`, `prospect-files.live.ts`, `rest-deps.ts`, `dashboard-api.live.ts` (+ spec ของมัน) — **คัดลอกจาก main ตรง ๆ ไม่แก้** (`node tools/workspace.mjs refresh` รายงาน "already up to date" เพราะ `PULL` ไม่ครอบ `core/live` และ `features/**` — จึงคัดลอกด้วยมือ; หลังนั้น `diff -r` ของ `src/app/core` กับ main = ไม่ต่าง).
2. REST fake ใน `upstream` ของ `tools/compare/pages/activities/page.mjs` และ `tools/compare/pages/schedule/page.mjs` (แทนสะพานชั่วคราว; ตอบจาก mock ตัวเดียวกับที่ replica ของ Java ใช้ ในรูปที่ service ส่ง):
   - `GET /leads?viewMode=list…` (ค้นหาลูกค้าของ work modal → สิ่งที่ `opportunitiesRoutes` ถาม): ผลของ `/board/leads` ของ mock ห่อเป็น `{status:200, message, result}`
   - `GET /prospects?page&perPage&searchText` + `GET /prospects/{id}/quick-view` (การ์ดแนะนำ → สิ่งที่ `prospectRoutes` ถาม; แบบเดียวกับ `receipts/replica.mjs`): แถวของ `/board/prospect-list` ของ mock เขียนเป็นแถว REST (`customerTel` ('-' = ไม่มี), `currentAddress` = ที่อยู่ที่ประกอบแล้ว, `attachFile`, quick-view `{code}`); latency จ่ายครั้งเดียวที่ list (quick-view ไม่มี latency เพราะ Java จ่ายครั้งเดียวต่อการกระทำ)
3. spec 2 ข้อที่ยืนยัน placeholder (404) ถูกเปลี่ยน — `features/activities/activities.live.spec.ts` และ `features/schedule/schedule.live.spec.ts`: ส่วน "path ที่ไม่รู้จัก = 404 และไม่ยิง network" ยังอยู่; ส่วน `/board/leads?viewMode=list…` และ `/board/prospect-list…` เปลี่ยนเป็นยืนยันว่าถูกตอบผ่านโมดูลที่คอมโพส พร้อม REST call ที่แต่ละตัวยิง (ผ่าน `fakeRest`): `GET /leads?viewMode=list&search=a&sortBy=txdate_desc&page=1&perPage=20` (ต้องมี `CRM_Lead_View` — ไม่มี = `[]` และไม่ยิง), `GET /prospects?page=1&perPage=8&searchText=a` (+ `GET /prospects/7/quick-view` เมื่อ `enrich=1` — เฉพาะ activities)

**ไฟล์ที่แก้/เพิ่มในรอบนี้ (ของผม)**: `tools/compare/pages/activities/page.mjs`, `tools/compare/pages/schedule/page.mjs`, `src/app/features/activities/activities.live.spec.ts`, `src/app/features/schedule/schedule.live.spec.ts`, `INTEGRATION.md`. **merge เฉพาะ 5 ไฟล์นี้** (ตรวจแล้ว: main ยังเป็นฉบับเดิมของ 4 ไฟล์แรกที่ผมส่งรอบก่อน จึงไม่ชน). `workspace.mjs status/merge` จะรายงานไฟล์ใน `core/live/` ที่ผมคัดลอกจาก main (`leads.live.ts`, `prospect*.live.ts`, `rest-deps.ts`, `dashboard-api.live.ts` + spec) ว่า "เปลี่ยน/เพิ่ม" — **ข้ามไปได้ทั้งหมด** (เหมือน main ทุกไบต์; ยืนยันด้วย `diff -rq` ของ `src/app/core`). workspace นี้ยังเก่ากว่า main ในส่วนอื่น (home, receipts, report …) ซึ่งไม่เกี่ยวกับงานนี้

**ผลตรวจรอบนี้**: `ng test` 25 ไฟล์ / **474 ผ่าน** (`core/live/**`, `features/activities/**`, `features/schedule/**`, `core/dom/**`, `shared/work-modal/**`); `--live` ตามที่ระบุใน §7 (ทั้งหมด identical)

**ข้อสังเกตสำหรับผู้ประสานงาน**
- `opportunitiesRoutes` ของ leads worker มี `/board/lead-assign` และ `/board/contact-activities` ซ้ำกับ `activityRoutes` ของผม (servlet เดียวกัน: `AssignLeadServlet`, `ContactActivitiesServlet`). ในการคอมโพสของหน้าผม `activityRoutes` มาก่อนจึงเป็นตัวที่ตอบ (spec ของแต่ละฝั่งครอบ route ของตัวเองอยู่) — ควรเหลือที่เดียวเมื่อมีเวลาเก็บกวาด: ลบฝั่งใดฝั่งหนึ่งแล้วรัน spec ของทั้งสองโมดูล
- รอบเต็มรอบนี้ (`--jobs 2`) ไม่มี scenario ต่างจากจังหวะเลย (เครื่องว่างกว่ารอบก่อน) ต่างจากรอบแรกที่ `--jobs 3` ต้องพึ่งขั้น confirm