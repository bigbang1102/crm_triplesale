# INTEGRATION — LIVE backend ของหน้า `home` (`crm/home`, "CRM Dashboard" + work modal ในหน้า) — เฟส B

workspace: `triple_sale_angular_ws_home` · route `/crm/home` · ต้นฉบับ Java ที่ย้าย (ทั้งหมดอ่านครบจากโค้ด Java ก่อนต่อ):
`DashboardApiServlet` + `DashboardApiService`, `LeadsBoardServlet` + `LeadBoardView.fetchLeadsJson`, `AssignLeadServlet`, `MovementTypesServlet` + `LeadBoardView.fetchMovementTypesJson`,
`MasterActivityGroupsServlet`, `LeadDetailServlet`, `AddScheduleServlet`, `EditScheduleServlet`, `SaleGroupsServlet`/`SalePersonsServlet`/`EmployeesServlet`/`MasterEmployeesByActivityGroupServlet`
(`LeadBoardView.fetchMasterArrayJson`, `MasterDataItemBean`, `MasterDataI18n`), `ChatMasterDataServlet`, และ `index.xhtml` + `dashboard.js` + `work_modal.xhtml` + `phone_format.js` + `step_group_color.js` + `ui_pref.js` (รายการ URL ที่หน้าเรียก)

> **สถานะ: ต่อ live backend เสร็จ มี spec และ `--live` ของ harness ครบ 309 scenario — แต่พิสูจน์ได้เพียง "live backend ทำเหมือน servlet ของ Java บน fixture ที่เขียนจากโค้ด Java"**
> ไม่ได้ตรวจกับ `triplesale-service` จริง (ไม่มี test account; service ต้อง Bearer ทุก endpoint และไม่มี OpenAPI สาธารณะ) — **ห้ามเขียนว่า "ยืนยันกับ API จริงแล้ว"**.
> รูปคำตอบที่ fake service สมมติอยู่หัวข้อ 4; ผลตรวจอยู่หัวข้อ 5; ก่อนใช้จริงต้องมี smoke test กับ UAT ด้วยบัญชีทดสอบอีกครั้ง

---

## 0. สิ่งที่ผู้ประสานงานต้อง merge / ตัดสินใจ

**ไม่มีการแก้ไฟล์ shared** (`core/live/*`, `tools/lib/**`, `tools/compare/lib/**`, `tools/compare/run.mjs`, `core/{i18n,auth,config,navigation}/**`, `package.json`, `docs/**`, `CLAUDE.md`, `README.md`, `manual/**` — ไม่แตะเลย).
`node tools/workspace.mjs merge home --apply` คัดลอกไฟล์ของหน้านี้กลับให้เอง (ทุกไฟล์ที่เปลี่ยนอยู่ใน `src/app/features/home/`, `tools/compare/pages/home/`, และไฟล์นี้).

ข้อความที่ผู้ประสานงานควรแก้เอง (ไฟล์ shared — แนะนำเท่านั้น ไม่บังคับ):
- `CLAUDE.md` bullet ของ CRM home: เติมท้ายว่า "โหมดจริง (`mock:false`): `home.live.ts` ประกอบ `dashboardApiRoutes` + `boardMasterRoutes` + `opportunityCoreRoutes` + `opportunitiesRoutes` (ไม่ใช่ `prospectRoutes` — หน้าไม่เรียก `/board/prospect-list`) และตอบ URL ของ BFF เดิมจาก REST ของ `triplesale-service` ผ่าน HttpClient; รูป `http://` โหลดจาก URL ที่ service ส่งมาตรง ๆ (ไม่มี `/docproxy`)"
- `README.md` แถว CRM home: สถานะ "พอร์ตแล้ว (mock + live adapter)" · ผ่าน harness `node tools/compare/run.mjs home` และ `... home --live`
- `docs/integration/home.md` §3 (ตาราง "สิ่งที่ live adapter ต้องทำ") สถานะ "เหลือ" ทั้งหมด = ทำแล้ว (อ้างหัวข้อ 2 ของไฟล์นี้); §5 ข้อ "ไม่มี live adapter" = ล้าสมัย
- `manual/index.html` (ชิ้น `manual-home.html`): ย่อหน้า "host" ที่บอกว่า `mock:false` แสดง `<ts-live-missing />` ล้าสมัย → host เลือก mock/live เอง

---

## 1. ไฟล์ที่เพิ่ม / แก้

| ไฟล์ | สถานะ | เนื้อหา |
| --- | --- | --- |
| `src/app/features/home/home.live.ts` | ใหม่ | `createLiveHome(deps: RestDeps): HomeBackend` = `composeRoutes(dashboardApiRoutes, boardMasterRoutes, opportunityCoreRoutes, opportunitiesRoutes)` + `fetch()` ที่ทำตามสัญญาของ `fetch(…, { signal })` (reject เป็น `AbortError`) — ไม่มี servlet ใหม่ให้พอร์ต (หัวข้อ 2) |
| `src/app/features/home/home.live.spec.ts` | ใหม่ | **24 ข้อ** ด้วย `fakeRest`: แต่ละ URL ของหน้า → REST ที่ยิง (path, ลำดับ param, encoding, body), role gate, TH/EN, stand-in ของทุกทางที่ service ไม่ตอบ, route ที่ "ไม่ใช่ของหน้านี้", `AbortSignal` |
| `src/app/features/home/home-view.ts` | แก้ | `backend()` เลือก mock / live (`restDepsOf(injector)`, แยก chunk กัน); คอมเมนต์ docProxy; คอมเมนต์ "LIVE ADAPTER not built yet" ถูกแทนด้วยคำอธิบาย backend จริง |
| `src/app/features/home/home.ts` | แก้ | เอา `<ts-live-missing />` / `ConfigService` / `LiveMissing` ออก (`ts-live-missing` removed) |
| `src/app/features/home/home.spec.ts` | แก้ | ข้อ "mock off = ยังไม่ได้ต่อ backend" → 4 ข้อ live ผ่าน `HttpTestingController` (first paint จาก REST ไม่มี URL `/board/…` และไม่เรียก `fetch`; ไม่มี `CRM_Lead_View` ไม่ยิง `/leads`; เปลี่ยนผลิตภัณฑ์ยิงใหม่ด้วย `movementTypeId`; dialog มอบหมาย → `PATCH /leads/assign`; filter ใหม่ยกเลิกรอบเก่า) · `afterEach` ลบ `window.TsPhone` (เหลือจากข้อก่อนหน้า ทำให้ข้อแรกของ live ไม่ขอ `master-data/countries`) · providers เพิ่ม `provideHttpClient()` + `provideHttpClientTesting()` + `I18n.masterRaw` |
| `tools/compare/pages/home/page.mjs` | แก้ | `newState` เก็บ `hook`/`live`; `handle()` ใน `--live` ตอบแบบที่ servlet จริงตอบเมื่อ service ล้ม (หัวข้อ 6); **`upstream`** = fake REST service (หัวข้อ 4) |
| `tools/compare/pages/home/scenarios.mjs` | แก้ | `cfg()` ส่ง `live: { hook }` (สวิตช์ของ mock ไปถึง fake service) — ไม่มี scenario ที่ถูกข้าม (`live: false`) |
| `INTEGRATION.md` | ใหม่ | ไฟล์นี้ |

ไม่แตะ: `home.engine.ts`/`home.html`/`home.scss` (generated), `home.mock.ts`, `home-backend.ts`, `tools/sync-home.mjs`.

---

## 2. URL ของหน้า → module ที่ตอบ → REST (servlet ที่พอร์ต / ไม่พอร์ต)

รายการ URL มาจากการอ่าน `index.xhtml`, `dashboard.js`, `work_modal.xhtml`, `phone_format.js`, `step_group_color.js`, `ui_pref.js` ทั้งไฟล์ (ไม่ใช่จากโน้ตเฟส A) แล้วเทียบกับ `home.engine.ts` (grep `env.fetch` — ตรงกันทุก URL).
REST = ใต้ `/triplesale-service/api/v1`. **ไม่มี servlet ที่ module ทั้งหมดที่ merge แล้วไม่ตอบ → ไม่มีโค้ดพอร์ตใหม่ในหน้านี้** (home.live.ts เป็นการประกอบ + `fetch` contract).

| URL ที่หน้าเรียก | Java | module (ของ worker อื่น — ไม่แก้) | REST ที่ยิง |
| --- | --- | --- | --- |
| `../dashboardapi?action=summary&page=1&perPage=100[&movementTypeId&startDate&endDate]` | `DashboardApiServlet` → `DashboardApiService.summaryJson` | `dashboard-api.live.ts` | `GET /dashboard?movementTypeId&startDate&endDate&page&perPage` (+ `GET /prospects?page=1&pageSize=500` ถ้ามี item: `enrichOpportunityImages`) |
| `../dashboardapi?action=schedules&viewMode=list\|year\|day…` | เดียวกัน → `schedulesJson` | `dashboard-api.live.ts` | `GET /dashboard/schedules?viewMode&date&dateFrom&dateTo&movementTypeId` |
| `../board/movement-types` | `MovementTypesServlet` | `board-master.live.ts` | `GET /master-data/movement-types/LD` (EN: ชื่อจาก `MasterDataI18n`) |
| `../board/master/activity-groups?movementTypeId=` | `MasterActivityGroupsServlet` | `board-master.live.ts` | `GET /master-data/activity-groups?movementTypeId=` |
| `../board/master/employees-by-activity-group?activityGroupId=` (work modal) | `MasterEmployeesByActivityGroupServlet` | `board-master.live.ts` | `GET /master-data/employees/by-activity-group?activityGroupId=` |
| `../board/sale-groups` · `sale-persons[?saleGroupId=]` · `employees[?saleGroupId=]` | `SaleGroupsServlet` … | `board-master.live.ts` | `GET /master-data/{sale-groups,sale-persons,employees}` (normalise ด้วย `MasterDataItemBean`) |
| `../board/leads?viewMode=list&activityGroupId=0&sortBy=txdate_desc&page&perPage=20[…]` (ตารางโอกาสขาย + ช่องค้นหาลูกค้าของ work modal) | `LeadsBoardServlet` → `LeadBoardView.fetchLeadsJson` | `leads.live.ts` | `GET /leads?viewMode=list&movementTypeId&activityGroupId&…&sortBy&page&perPage` — **ไม่มี `CRM_Lead_View` → `[]` ไม่ยิง** |
| `../board/lead-assign` (POST) | `AssignLeadServlet` | `leads.live.ts` | `PATCH /leads/assign` (body ดิบ; ตอบ body ของ service ทุกสถานะ) |
| `../board/lead?id=&activityGroupId=` (work modal) | `LeadDetailServlet` | `lead-core.live.ts` | `GET /leads/{id}?activityGroupId=` |
| `../board/schedule/add` · `schedule/edit` (work modal save) | `AddScheduleServlet` · `EditScheduleServlet` | `lead-core.live.ts` | `POST /schedules` (`activityGroupId`→`procedureGroupId`, ตัด `movementTypeId`) · `PATCH /schedules/{id}` (ตัด `id`, `leadId`) |
| `../board/chat-master-data?type=countries` (TsPhone: รหัสโทร + mask) | `ChatMasterDataServlet` | `board-master.live.ts` — **ถูกเรียกโดย shell `PhoneFormat` เอง** (ไม่ผ่าน backend ของหน้านี้; route อยู่ใน composition ด้วยแต่หน้าไม่ใช้) | `GET /master-data/countries?page=1&pageSize=1000` |
| `../docproxy?url=` (รูป `http://`) | `DocProxy` | — | **ไม่พอร์ต** — ดูหัวข้อ 3 ข้อ 1 |

**ลำดับของ `composeRoutes`**: `dashboardApiRoutes, boardMasterRoutes, opportunityCoreRoutes, opportunitiesRoutes` — route ของทั้ง 4 module ไม่ซ้ำกัน (path ต่างกันหมด) ลำดับจึงไม่มีผลต่อคำตอบ; spec ตรวจว่าทุก URL ของหน้าไปถึง module ที่ถูก.

**ไม่ได้ compose `prospectRoutes`** (ต่างจากที่ brief เขียนไว้): หน้านี้ไม่เรียก `/board/prospect-list` / `/board/prospect-*` เลย — ตรวจจาก `index.xhtml`, `dashboard.js`, `work_modal.xhtml`, `phone_format.js`, `step_group_color.js`, `ui_pref.js`
(ไม่มีที่ไหนเรียก `odsProspectSuggest` ของ `open_down_select.js` — การ์ดแนะนำใต้ช่องค้นหาไม่มีในหน้านี้; ช่องค้นหาลูกค้าของ work modal ใช้ `/board/leads?viewMode=list`; รูปของ summary มาจาก `GET /prospects` ที่อยู่ใน `dashboardApiRoutes` เอง).
`prospectRoutes` ดึง `prospect.live.ts` + 3 ไฟล์ย่อย (~1,700 บรรทัด) และ `/docproxy` เข้า chunk โดยไม่มีผู้เรียก. spec ข้อ "what is NOT an address of this page" ยืนยันว่า 3 URL นี้ได้ 404 `no live route`; ถ้าผู้ประสานงานต้องการให้ชุดเหมือน leads/activities เพิ่มได้บรรทัดเดียว (`prospectRoutes(deps)` ท้าย `composeRoutes`).

---

## 3. การตัดสินใจ (ตัดสินแบบระวัง — ไม่มีใครให้ถามได้)

1. **รูป `http(s)://` (`DocProxy`)**: `../docproxy?url=` เป็น `<img src>` ไม่ผ่าน `fetch` → live backend ตอบไม่ได้. ตัดสินใจ **โหลดจาก URL ที่ service ส่งมาตรง ๆ** (`env.docProxy = (url) => url` ใน `home-view.ts` — เหมือนที่ phase A ทำใน mock host และเหมือน Opportunities / Activities).
   ใช้ได้เมื่อ file server ตอบ `https` (หรือหน้าอยู่บน `http`); `<img>` ไม่ต้องการ CORS. ถ้า file server เป็น `http` ล้วนและหน้าอยู่บน `https` เบราว์เซอร์บล็อก (mixed content) → รูปแตก (หน้าใช้ `onerror` → default avatar) — ต้องให้เจ้าของระบบเลือก: file server เป็น https หรือ gateway มี proxy เทียบเท่า `/docproxy` (คำถามข้อ 3 หัวข้อ 7). mock ไม่มีรูป `http` → phase A ไม่เปลี่ยน
2. **`fetch(…, { signal })`**: หน้ายกเลิกคำขอของ filter ที่ถูกแทนที่ด้วย `AbortController` (`loadDashboard()`), `fetch` จริง reject เป็น `AbortError` ทันทีที่ signal ยิง (และไม่ส่งอะไรเลยถ้า abort ก่อนเรียก). `RestDeps.call` ไม่มี signal จึง **ยกเลิก REST call ไม่ได้** (servlet เดิมก็ไม่ยกเลิก upstream) — แต่ `home.live.ts` ทำให้หน้าเห็น `AbortError` เหมือน `fetch` (ถ้าไม่ทำ promise ค้างจนคำตอบมา: ไม่ต่างที่หน้าจอ แต่ไม่ตรงสัญญาที่ engine เขียนไว้). spec 3 ข้อ + host spec 1 ข้อ
3. **ไม่มี session state ที่ต้องย้าย**: หน้านี้ไม่มี servlet ที่เก็บของใน `HttpSession` (`FilterStateServlet` เป็นของหน้า leads). ผลิตภัณฑ์ที่เลือกล่าสุด (`ts_dash_selected_mt/_wf/_name`) อยู่ใน `localStorage` ผ่าน `env.pref` ตั้งแต่ phase A (Java เก็บคู่กับ cookie `tsp_…` — ไม่ทำ cookie)
4. **cache ที่ไม่พอร์ต** (performance cache เท่านั้น — เบราว์เซอร์ถามใหม่): cache ใน session ของ `ProvincesServlet` / `ChatMasterDataServlet` (countries) ที่อยู่ใน `board-master.live.ts` — หน้านี้ไม่ใช้จังหวัด; ส่วน `PhoneFormat` โหลด countries ครั้งเดียวต่อหน้าเอง. ส่วน `Cache-Control` / `Pragma` ของ servlet ไม่พอร์ต (ไม่มี HTTP cache คั่นระหว่างหน้ากับ `RestDeps.call`). `dedupedGetJson` ของ `dashboard.js` (กันยิง URL เดียวกันซ้ำ) อยู่ใน engine อยู่แล้ว
5. **สิ่งที่ต่างจาก servlet container โดยตั้งใจ** (มาจาก module ที่ compose — ไม่ใช่การตัดสินใจของหน้านี้): method ผิด = JSON 405; body ที่ไม่ใช่ JSON ของ `schedule/add|edit` = JSON 500 (container ตอบหน้า HTML 500 ของตัวเอง); HTTP 500 ของ `LeadsBoardServlet` (exception ภายใน servlet) ไม่พอร์ตเพราะโค้ดใน `try` นั้นโยนไม่ได้ (`Data_API` กลืน IOException ทุกตัว) — ดู `docs/integration/leads-live.md` §3; `DashboardApiServlet` เก็บ `try/catch` → 500 `{"message":"internal error"}` ไว้ใน `dashboard-api.live.ts` แต่ใน TS ไม่มีทางถึง
6. **สถานะของ HTTP ที่หน้า "เห็น" เปลี่ยนจาก phase A เฉพาะเมื่อ service ล้ม**: phase A (mock) เล่น `failLeads` เป็น HTTP 500 ของ BFF → หน้ารอ 800 ms แล้วลองใหม่ 1 ครั้ง (`fetchOppsPage`). servlet จริงตอบ **HTTP 200 + `[]`** เมื่อ service ล้ม (ไม่ใช่ 500) → หน้าไม่ลองใหม่ (ค่า `[]` เป็น truthy) แต่ผลสุดท้ายเหมือนกัน (ตารางว่าง + คำเตือน). live backend ทำแบบ servlet จริง. ดูหัวข้อ 6 (replica ของ harness ปรับตาม)

---

## 4. สิ่งที่ fake service (`page.upstream`) สมมติเกี่ยวกับ REST จริง — **ทั้งหมดมาจากโค้ด Java ไม่ใช่จากข้อมูลจริง**

fake ตอบจาก mock ชุดเดียวกับ Java replica (`home.mock.ts`: 240 ลีดจาก `seedLead(n)`, 4 ผลิตภัณฑ์, นัด/งานต่อวัน) — แต่ในรูปของ **service** (envelope `{status, message, result}`) ไม่ใช่รูปของ BFF:

- `GET /dashboard?movementTypeId&startDate&endDate&page&perPage` → `{status:200, message, result:{stats:{total,statusNew,statusSuccess,statusInactive,statusLost,statusActive,activeHot,activeWarm,activeCold}, stepSummary:[{id,code,name,count}], items:[{prospectName,customerTel,handlerName,currentGroup,currentStep,leadStatus,attachFile}]}}`
  (รูปตามที่ `mapSummary()` ของหน้าอ่าน; `items` ใช้จริงแค่เป็น fallback ของโดนัท — ตารางมาจาก `/leads`)
- `GET /dashboard/schedules?…` → `result` = `{list:{appointment:{items,total},task:{items,total}},summary}` (viewMode=list) · `{marks:["yyyy-MM-dd"…]}` (year) · `{items:[…scheduleType…]}` (day); ฟิลด์ของ item ตาม `ScheduleItem` ใน `home-backend.ts`
- `GET /prospects?page=1&pageSize=500` → `{status:200, result:[{id,name,customerTel,attachFile}]}` เฉพาะลูกค้าที่มีรูป (สิ่งที่ `fetchProspectImages` อ่านคือ `name` + `attachFile`). **ไม่ได้ยืนยัน**: ว่า service ส่ง `result` เป็น array ตรง ๆ, `name` ตรงกับ `prospectName` ของ dashboard, และเพดาน 500 (ลูกค้าเกิน 500 คนจะไม่ได้รูป — เหมือน servlet เดิม)
- `GET /leads?viewMode=list&…` → `{status:200, result:{id, activityGroupId, usesWorkflowStep, statusSummary:{total,new,success,lost,inactive,active:{total,hot,warm,cold}}, wfStepSummary:[{id,code,name,count}], leads:{items:[…LeadListItemResDTO…], meta:{page,perPage,total,totalPages}}}}`; service ล้ม (`failLeads`, ค้นหา `~500`) = HTTP 500
  (**ไม่ได้ยืนยัน**: ชื่อ field ของ item — `prospectName/prospectTel/prospectAvatar/phoneCountryCode/countryCode/employee*/salePerson*/saleGroup*/forwardStatus/procedureGroup*/activityGroup*/unassigned/leadStatus/activeStatus/txNo/prospectCode/movementTypeId`; และว่า `meta.total` นับเฉพาะ lead ที่ผ่าน filter ของ `showClosed`)
- `GET /leads/{id}[?activityGroupId=]` → `{status:200, result:{id, leadStatus, currentStep:{procedureGroupId, procedureGroupName, procedureName}}}`; error = `{status, message, error:{code, message}}` พร้อมสถานะจริง (404, 500)
- `GET /master-data/movement-types/LD` → `{status:200, result:[{id,code,name,usesWorkflowStep}]}` — **`result` เป็น array** ตามที่ `fetchMovementTypesJson` อ่าน (`obj.get("result").toString()` ใส่ใน `JSONArray`) แต่ `MovementTypeServlet` (หน้า schedule) อ่าน `result.items` — โค้ด Java สองที่สมมติรูปต่างกันของ endpoint เดียวกัน (คำถามข้อ 1)
- `GET /master-data/{sale-groups,sale-persons,employees}[?saleGroupId=]` → `{status:200, result:[{id,code,name,nameTh,colorCode,attachFile,postCode,createdAt,isActive,+ employee:{…} สำหรับ sale-persons}]}` — มีฟิลด์ที่หน้าไม่อ่าน (`createdAt`, `isActive`) เพื่อให้พอร์ตต้อง normalise ด้วย `MasterDataItemBean`
- `GET /master-data/activity-groups?movementTypeId=` → envelope ของ mock ตรง ๆ `{status:200, result:{items:[{id,code,name}]}}` (404 สำหรับผลิตภัณฑ์ที่ไม่รู้จัก); `GET /master-data/employees/by-activity-group?activityGroupId=` → `{status:200, result:[{id,code,name,attachFile}]}`.
  **ไม่ได้ยืนยัน**: ว่า `result` ของ activity-groups เป็น `{items}` หรือ array (หน้ารองรับทั้งสอง; `MasterDataI18n.translateEnvelopeResult` แปลเฉพาะ `result[]`)
- `GET /master-data/countries?page=1&pageSize=1000` → `{status:200, result:MOCK_COUNTRIES}` (code, phoneCountryCode, phoneNumberFormat — สิ่งที่ `TsPhone` อ่าน)
- `PATCH /leads/assign` → รับ body ดิบของหน้า (ตัวเลขเป็นข้อความ `"leadId":"7"` เหมือน `submitAssign()`), ตอบ `{status:200,message:'success'}` หรือปฏิเสธ 400 `{status:400,message:'Validation error',error:{code:400,message:'ต้องส่งต่อ (forward)…'}}` (พนักงาน E108) หรือ 500 `{error:'ระบบขัดข้อง'}` — สถานะ HTTP จริงของ service; servlet ตอบ 200 พร้อม body เสมอ
- `POST /schedules` · `PATCH /schedules/{id}` → **ปฏิเสธ 400 ถ้า body ยังมีชื่อ field ของ work modal** (`movementTypeId` / `activityGroupId` ใน POST; `id` / `leadId` ใน PATCH) — ตัวตรวจว่าพอร์ตแปลง body ถูก (ถ้าลืม rewrite ของ `AddScheduleServlet` modal จะแสดง error). สำเร็จ = HTTP 201 `{status:201,message,result:{id}}` (POST) / 200 (PATCH)
- บัญชีที่เรียกอ่านจาก Bearer token ของ fake sign-in (`live-upstream.mjs`); สิทธิ์ของหน้า (`CRM_Lead_View` ฯลฯ) เป็นงานของ live backend ไม่ใช่ของ REST — fake จึงตอบเหมือนผู้ใช้ทำได้ทุกอย่าง

**ไม่ได้ยืนยันกับ service จริงเลย**: ชื่อ field ทุกตัวข้างบน, envelope (`status` ใน body เป็นเลข 200 — `fetchMasterArray` / `fetchLeadsJson` / `fetchMovementTypesJson` ตรวจ `optInt(status) == 200`), การแบ่งหน้า, ว่า `GET /dashboard` ใช้ `startDate`/`endDate` จริง (คอมเมนต์ใน `DashboardApiService` บอกว่า backend เลิกรับ `dateFrom`/`dateTo`), และว่า `GET /leads` ตอบ `currentCityCode` ฯลฯ.

---

## 5. ผลการตรวจ (ทุกตัวเลขมาจากการรันจริงใน workspace นี้ กับโค้ดสุดท้าย)

**สิ่งที่พิสูจน์ได้ = "live backend ทำเหมือน servlet ของ Java บน fixture ที่เขียนจากโค้ด Java". ไม่ใช่ "ถูกต้องกับ API จริง"** (ไม่มี test account — ต้องมี smoke test กับ UAT อีกครั้ง)

| รายการ | ผล |
| --- | --- |
| spec `src/app/features/home/home.live.spec.ts` (`fakeRest`) | **24 ข้อผ่าน** — ทุก URL ของหน้า → REST ที่ยิง (path, ลำดับ param ตาม `DashboardApiService` / `LeadBoardView.fetchLeadsJson`, `URLEncoder` ของ `search`, body ที่ rewrite ของ `schedule/add\|edit`, body ดิบของ `lead-assign`), role gate (`CRM_Lead_View`: `[]` + 403 ไม่ยิง service), TH vs EN (ชื่อผลิตภัณฑ์/กลุ่ม — `result[]` เท่านั้น), stand-in ของทุกทางที่ service ไม่ตอบ (503 / HTML / status 0 → `{status:502,…}` 200, `[]`, `{}`), route ที่ "ไม่ใช่ของหน้านี้" (`prospect-list`, `prospect-enrich`, `docproxy` → 404), `AbortSignal` (abort ระหว่างรอ / abort ก่อนเรียก / abort หลังตอบ / ไม่มี signal) |
| spec `src/app/features/home/**` ทั้งโฟลเดอร์ | **3 ไฟล์ 87 ข้อผ่าน** (`home.mock.spec` 31 · `home.spec` 32 · `home.live.spec` 24) — host ในโหมด `mock:false` ผ่าน `HttpTestingController` (4 ข้อใหม่แทนข้อ "ยังไม่ได้ต่อ backend"): first paint จาก REST (ไม่มี `/board/…` / `dashboardapi`, ไม่เรียก `fetch` ของ window, phone masks ขอ `master-data/countries`), ไม่มี `CRM_Lead_View` ไม่ยิง `/leads`, เปลี่ยนผลิตภัณฑ์ยิงใหม่ด้วย `movementTypeId` 4 เส้น, dialog มอบหมาย → `PATCH /leads/assign` แล้วปิด, filter ใหม่ยกเลิกรอบเก่า |
| `ng build` (production) | ผ่าน **ไม่มี warning/error**; chunk `home` 167.5 KB (ส่ง 33.5 KB — เท่าเฟส A); `home.live` เป็น lazy chunk แยก (~24 KB ใน build ของ spec; โหลดเฉพาะ `mock:false`) และ `home.mock` ยังเป็น lazy chunk แยก (โหลดเฉพาะ `mock:true`) |
| **`compare home --live`** (Angular ใช้ live backend กับ fake REST `page.upstream`) | **309 / 309 scenario เหมือนทุกบรรทัด** (DOM + attribute + ข้อความ + ตำแหน่ง/ขนาด + computed style + checksum canvas + ค่า input + flag `LD2_*` + `TS_I18N` + localStorage + ลิงก์ที่นำทาง) — รันทั้งชุดรอบเดียว `--jobs 3` ~16.5 นาที ไม่มี scenario ต้องรันซ้ำ; ไม่มี `pageerror` / `ready-timeout` / scenario error. request 4xx/5xx ในรายงานมีแต่ที่ scenario สั่งเอง (`fail-products/summary/schedules/leads` = fake service ตอบ 500, `assign-fail-*` = 400/500 ของ `PATCH /leads/assign`, `wm-cust-pick-car` ลีด id 53 = 500 ของ `GET /leads/53`) และ 404 ของ `/schedules?viewMode=month…` ใน `ext-link-appt/-tasks` (ฝั่ง Angular อย่างเดียว: scenario คลิกไอคอนไปหน้า schedule แล้วหน้านั้นเรียก REST ของมันเอง ซึ่ง fake ของหน้า home ไม่มี — dump นับเฉพาะบรรทัด `NAV`) |
| negative control | ถอด `opportunityCoreRoutes` ออกจาก composition ชั่วคราว → `wm-cust-pick` และ `wm-save-success-overlay` **ต่าง** (`no live route for /board/schedule/add`), `overview` ไม่ต่าง; คืนโค้ดแล้ว build + รันซ้ำ 12 scenario (overview, en-overview, wm-\*, perm-nolead, fail-\*, assign-\*, quick-\*) เหมือนทั้งหมด. (ลองเลี่ยง role gate ชั่วคราวเพื่อดูว่า `perm-nolead` จับได้ — ระบบสิทธิ์ของเครื่องปฏิเสธการแก้นั้น จึงไม่ได้ทำ; role gate ถูกครอบด้วย spec แทน) |
| `compare home` (เฟส A, mock ทั้งสองฝั่ง — รันซ้ำหลังเปลี่ยน host) | **309 / 309 เหมือนทุกบรรทัด** (~16.5 นาที `--jobs 3`, รอบเดียว) — การเปลี่ยน `home-view.ts` / `home.ts` ไม่กระทบโหมด mock |
| cleanup | `.compare/` อยู่ใน workspace เท่านั้น (ไม่ใช่ไฟล์ของโปรเจกต์); ไม่มี process ค้าง (ทุก server / Chrome ของ harness ปิดเอง); ไม่มี dev server ที่เปิดเอง |

วิธีรันซ้ำ: `node tools/compare/run.mjs home --live [--no-build] [--filter …] --jobs 3` (ทั้งชุด ~17 นาที); spec: `CI=1 node node_modules/@angular/cli/bin/ng.js test --no-watch --include 'src/app/features/home/**/*.spec.ts'` (บนเครื่องแชร์ ng บางครั้งตายด้วย out of memory — ไม่ใช่ข้อผิดพลาดของโค้ด: รันซ้ำ)

### scenario ที่ถูกข้าม / พึ่งโมดูลของ worker อื่น
- **ไม่มี scenario ที่ `live: false`** และไม่มี scenario ที่พึ่งโมดูลที่ยังไม่ merge — 4 module ที่ compose (`dashboard-api`, `board-master`, `lead-core`, `leads`) merged ใน main แล้วทั้งหมด (ไม่ต้องรอ prospects)
- ที่ harness **พิสูจน์ไม่ได้** (ทั้ง phase A และ B): hover/focus (tooltip ของ "+ อีก N ขั้นตอน" เทียบโดยบังคับ `display:block`), ไอคอน `mask-image`, `<img>` ที่โหลดไม่สำเร็จ, รูปลูกค้า `http(s)://` (mock ไม่มี; fake REST ส่งแต่ data-URI), `fetch` ล้มด้วย network error (ทดสอบใน `home.spec.ts`), การเปลี่ยนแปลง `GET /prospects` ที่ทำให้ `attachFile` ของ item เปลี่ยน (หน้าไม่แสดงรูปจาก summary เลย — ทดสอบที่ระดับ JSON ใน `core/live/dashboard-api.live.spec.ts` และ `home.live.spec.ts`)
- ความต่างของ latency: ดูหัวข้อ 6 (hop ที่สองของ summary ไม่หน่วงใน fake)

---

## 6. harness `--live`: replica ของ Java ตอบ "แบบ servlet จริงเมื่อ service ล้ม" (ไม่ใช่การผ่อน harness)

สวิตช์ `fail*` ของ mock เล่นเป็น HTTP 500 ของ BFF ใน phase A — servlet จริงไม่เคยตอบ 500 เพราะ service ล้ม (`Data_API.sendGET` คืน `""` ให้ทุกสถานะที่ไม่ใช่ 200 แล้ว servlet ใส่ stand-in, HTTP 200).
ใน `--live` ฝั่ง Java replica (`page.mjs handle()`) จึงแปลงเฉพาะ 4 กรณีเป็นสิ่งที่ servlet จริงตอบ (ฝั่ง Angular fake service ล้มด้วยสถานะเดียวกับที่ mock เล่น):

| path | mock เล่น | servlet จริงตอบ (ที่ replica ใน `--live` ตอบ) | Java ที่อ่าน |
| --- | --- | --- | --- |
| `/dashboardapi` | 500 `{"message":"internal error"}` | 200 `{"status":502,"message":"backend ไม่ตอบหรือ response ไม่ใช่ JSON"}` | `DashboardApiService.safeJson` |
| `/board/leads` | 500 `[]` | 200 `[]` | `LeadBoardView.fetchLeadsJson` → `"[]"` |
| `/board/movement-types` | 500 `[]` | 200 `[]` | `fetchMovementTypesJson` → `"[]"` |
| `/board/master/activity-groups` | 404 (ผลิตภัณฑ์ที่ไม่รู้จัก) | 200 `{}` | `MasterActivityGroupsServlet` (`result = "{}"`) |

ผลข้างเคียงที่ต้องรู้: `fail-leads-once*` ใน `--live` ไม่ทดสอบ "ลองใหม่แล้วสำเร็จ" (servlet จริงไม่ตอบ 500 ให้หน้าลองใหม่) — ทั้งสองฝั่งจึงจบที่ตารางว่าง + คำเตือนเหมือน `fail-leads*`. การลองใหม่ของหน้ายังถูกทดสอบใน phase A (`home.spec.ts` ข้อ "the leads cannot be loaded").
อย่างอื่น (HTTP status ของ `lead-assign`, `lead`, `schedule/add|edit`) ไม่แปลง: live backend ส่ง status/body ของ service ต่อตามที่ servlet ทำ และ fake service ตอบ status เดียวกับ mock.

ความต่างของ latency ที่ harness ไม่เทียบ: `GET /prospects` (hop ที่สองของ summary) ไม่หน่วงใน fake — hop เดียวของ replica (150 ms) นับรวมการเรียก service ครั้งที่สองของ servlet แล้ว; ต่างจาก Java จริงที่ hop นั้นเกิดฝั่ง server

---

## 7. คำถามถึงเจ้าของ backend / ระบบ

ข้อ 1–4 ของ `docs/integration/home.md` §5 ยังเปิดอยู่ (ความหมายของ `stepSummary`, การกระจายของลีด NEW ใน `/leads?viewMode=list`, รูป `http://`, การ์ดแผนเดินตลาด) พร้อมข้อที่เกิดจากงานเฟส B:

1. `GET /master-data/movement-types/LD` ส่ง `result` เป็น **array** (ตาม `LeadBoardView.fetchMovementTypesJson` / `MovementTypesServlet` ที่หน้า home, leads, activities ใช้) หรือ `{items:[…]}` (ตาม `MovementTypeServlet` ที่หน้า schedule ใช้)? โค้ด Java สองแบบสมมติต่างกัน — ถ้าเป็น `{items}` dropdown ผลิตภัณฑ์ของ home จะว่าง (หน้าจะโหลดข้อมูลแบบไม่กรอง) และภาษาอังกฤษจะได้ 500 (`isArr` ไม่ผ่าน)
2. `GET /dashboard` — `items[].attachFile` ว่างบ่อยจริงไหม และ `GET /prospects?page=1&pageSize=500` ตัดที่ 500 รายการ (ลูกค้าคนที่ 501+ ไม่ได้รูป) — จะมี filter ตามชื่อ/ids หรือให้ `/dashboard` ส่งรูปมาเองไหม (ปัจจุบันใช้แค่เป็น fallback ของโดนัท — ตารางมาจาก `/leads`)
3. รูป `http://` (`attachFile`, `prospectAvatar`, `prospectImage`): file server เสิร์ฟ `https` ได้ไหม หรือ gateway มี proxy แทน `/docproxy` (ดูหัวข้อ 3 ข้อ 1)
4. `PATCH /leads/assign` ตอบ HTTP 200 เสมอแม้ validation ผิด (แล้วใส่ `status`/`error` ใน body) หรือใช้ 400? หน้าอ่านเฉพาะ body (`res.status === 200` หรือ `message == 'success'`; ข้อความผิดพลาดจาก `error.message`) — ทั้งสองแบบใช้ได้ แต่ servlet เดิมส่งต่อสถานะไม่ได้ (ตอบ 200 เสมอ) ถ้าใครเปลี่ยนไปอ่าน HTTP status จะไม่ตรงกับพฤติกรรมเดิม
5. `GET /leads?viewMode=list` ส่ง `employeeId` (ผู้รับผิดชอบ) เป็น filter ได้ตามที่ work modal ใช้กรอง lead ของตัวเอง (`wmCustUrl`) ใช่ไหม และ `salePersonId` ที่ servlet ไม่เคยส่ง (ตัดออกโดยตั้งใจ) ยังไม่ต้องส่ง
