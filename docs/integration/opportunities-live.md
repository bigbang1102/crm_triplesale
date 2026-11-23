# INTEGRATION — LIVE backend ของหน้า `leads` + โมดูล `src/app/core/live/opportunities.live.ts` (เฟส B)

workspace: `triple_sale_angular_ws_leads` · route `crm/opportunities` · ต้นฉบับ Java ที่ย้าย: `LeadsBoardServlet` (→ `LeadBoardView.fetchLeadsJson` ทุก overload + `localizeLocationNames`),
`FilterStateServlet`, `DetailFilterStateServlet`, `AssignLeadServlet`, `ContactActivitiesServlet` + `ContactChannel`, `LeadUpdateServlet`, `LeadMaterialsServlet`,
`LeadBoardView.init()/getSavedFilterJson()` (ค่า `savedFilterJson` ของหน้า) และ helper ที่เรียก (`Data_API.sendGET/sendPOST/sendPOSTWithStatus/sendPUT/sendPATCH/sendPatchRequest`,
`TriplesaleApi.*`, `MasterDataI18n`, `SessionRoles.hasRole`, `I18n.fromSession`)

> **สถานะ: ประกอบเสร็จ มี spec และ `--live` ของ harness — แต่พิสูจน์ได้เพียง "live backend ทำเหมือน servlet ของ Java บน fixture ที่เขียนจากโค้ด Java"**
> ไม่ได้ตรวจกับ `triplesale-service` จริง (ไม่มี test account; ไม่มี OpenAPI สาธารณะ) — ห้ามเขียนว่า "ยืนยันกับ API จริงแล้ว". รูปคำตอบที่ fake service สมมติอยู่หัวข้อ 4
> ผลตรวจ (จำนวน spec, `--live`, build) อยู่หัวข้อ 5

---

## 0. สิ่งที่ผู้ประสานงานต้อง merge / ตัดสินใจ

`merge --apply` คัดลอกไฟล์ที่ไม่ใช่ shared กลับให้เอง; รายการนี้คือไฟล์ที่อยู่นอกขอบเขตของ worker นี้หรือเป็น shared และ **แก้ไว้แล้วใน workspace** (หรือต้องแก้เอง)

### 0.1 `src/app/core/dom/phone-format.service.ts` — เบอร์โทรในโหมด live (**merge เข้า main แล้ว** โดยผู้ประสานงาน; ไฟล์ใน workspace ตอนนี้ = ของ main; กระทบทุกหน้า live ที่ใช้ `TsPhone`)
**ปัญหา**: `PhoneFormat.fetch` ในโหมดไม่ใช่ mock เรียก `fetch('/triplesale/board/chat-master-data?type=countries')` ตรง ๆ — ไม่มี BFF แล้ว จึงได้ HTML ของ SPA → `TsPhone` ไม่มี master ประเทศ →
เบอร์ทุกตัวในการ์ด/ตารางขึ้นเป็นตัวเลขดิบ (Java ขึ้น `+66 82-820-2899`). ทุกหน้าที่ live (leads, home, schedule, activities, lead-detail …) เจอเหมือนกัน
**แก้ (backward-compatible, โหมด mock ไม่เปลี่ยน)**: ในกิ่งไม่ใช่ mock ให้ตอบด้วย `ChatMasterDataServlet` ที่พอร์ตแล้วใน `board-master.live.ts` (GET `master-data/countries` ผ่าน HttpClient + ชื่อไทยจาก dictionary):
```ts
private readonly injector = inject(Injector);            // + import { Injector }
…
// live: there is no BFF servlet to ask any more …
const [{ boardMasterRoutes }, { composeRoutes }, { restDepsOf }] = await Promise.all([import('../live/board-master.live'), import('../live/rest'), import('../live/rest-deps')]);
return composeRoutes(boardMasterRoutes(restDepsOf(this.injector)))(input, init);
```
(ไฟล์นี้อยู่ใน `PULL` ของ `workspace refresh` — main ยังเป็นของเดิม; รอบ refresh ถัดไปจะบอก "NOT updated" ให้ merge เอง). harness `--live` ของหน้านี้ต้องมีการแก้นี้ (ไม่งั้นทุก scenario ที่มีเบอร์ต่างจาก Java)

### 0.2 `tools/sync-opportunities.mjs` + `src/app/features/opportunities/leads.engine.ts` (generated) — รูป `http(s)://` ผ่าน `env.docProxy` (decision ของ worker นี้ — ดูหัวข้อ 3.6)
generator ไม่ได้อยู่ในรายการไฟล์ของ worker นี้ แต่แก้เล็กน้อยและ backward-compatible (เหมือนที่ `sync-home.mjs` / `sync-activities.mjs` ทำ): 2 swap `? ('../docproxy?url=' + encodeURIComponent(u)) : u;` → `? env.docProxy(u) : u;`
(สคริปต์หน้า + สคริปต์ access_pop), ฟิลด์ `docProxy: (url: string) => string` ใน `OpportunitiesEnv`. รัน `node tools/sync-opportunities.mjs` แล้วผลต่างของ engine มีแค่ 3 จุดนี้ (html/scss ไม่เปลี่ยน). host ให้ `docProxy: (url) => url` ทั้ง mock และ live.
ถ้าไม่ต้องการ: ทิ้งการแก้นี้ได้ — ผลคือรูปลูกค้า/ผู้มีสิทธิ์ที่เป็น `http(s)://` ในโหมด live จะชี้ `../docproxy?url=…` ที่ไม่มีใครตอบ (รูปแตก → default avatar ผ่าน `onerror`)

### 0.3 (แนะนำ) `src/app/core/dom/session-ui.ts` — `clearSessionUi()` ตอน logout
Java: logout = `HttpSession` ถูกทำลาย → filter state ของบอร์ด (`ld_filter_state`) และของหน้ารายละเอียด (`ld_detail_filter_state`) หาย. ที่นี่ filter state อยู่ใน `sessionStorage` ของแท็บ (key `ts.leads.filter-state:<username>` /
`ts.lead-detail.filter-state:<username>`) จึงไม่หายตอน logout ถ้าแท็บเดิมถูกใช้ต่อ. เสนอให้ `clearSessionUi()` ลบ key ที่ขึ้นต้นด้วย 2 prefix นี้ (ค่าคงที่ `FILTER_STATE_KEY` / `DETAIL_FILTER_STATE_KEY` export จาก `core/live/opportunities.live.ts`).
ผลของการไม่ทำ: คนเดิม login ใหม่ในแท็บเดิมได้ตัวกรองเก่ากลับมา (ไม่ใช่ข้อมูลรั่วข้ามคน — key ผูกกับ username)

### 0.4 ไฟล์ mock ที่แก้เพื่อให้ `--live` พิสูจน์ได้ (อยู่ในโฟลเดอร์ของหน้า — `merge --apply` คัดลอกกลับ)
`src/app/features/opportunities/leads.mock.ts`: (ก) ชื่อเขตภาษาอังกฤษของ mock เปลี่ยนให้ตรงกับ dictionary จริงของ `MasterDataI18n` (`master-data.en.json`): เขตของกรุงเทพใช้ code `BKK_01/BKK_04/BKK_30` + ชื่อ `… District`;
เขตของจังหวัดอื่นไม่มีใน dictionary → ภาษาอังกฤษแสดงชื่อไทยเหมือน servlet จริง (เดิม mock แต่ง "Mueang Chiang Mai" เองซึ่งของจริงไม่มีวันขึ้น). phase A ยังเหมือนเดิมเพราะ Java replica ใช้ mock ตัวเดียวกัน;
(ข) สวิตช์ใหม่ `blankLeads` (`/board/leads` ตอบ `[]` + 200 = สิ่งที่ servlet ตอบเมื่อ service ล้ม) ใช้กับ `fail-leads*` ใน `--live`; (ค) สวิตช์ใหม่ `delayLeadsOnly` (ใช้คู่กับ `delayMs`: หน่วงเฉพาะ `/board/leads`) ใช้กับ `skeleton-first-load*` — เหตุผลหัวข้อ 5

### 0.4b อัปเดตหลัง merge prospects (รอบ follow-up) — ไฟล์ที่เปลี่ยนเพิ่ม (ทั้งหมดอยู่ในโฟลเดอร์ของหน้า — `merge --apply` คัดลอกกลับ)
- `tools/compare/pages/opportunities/page.mjs` — เพิ่ม `GET /prospects` + `GET /prospects/{id}/quick-view` ใน `upstream` (หัวข้อ 6) → การ์ดแนะนำลูกค้าผ่านครบ 10 scenario
- `tools/compare/pages/opportunities/scenarios.mjs` + `src/app/features/opportunities/leads.mock.ts` (+ `leads.mock.spec.ts` 1 ข้อ) — สวิตช์ `delayLeadsOnly` แก้ `skeleton-first-load*` ที่ไม่นิ่ง (หัวข้อ 5): **สามไฟล์นี้เป็นผลพลอยได้จากการรันทั้งชุดซ้ำ ไม่ได้อยู่ในคำสั่ง follow-up**
- ไม่แตะไฟล์ `prospect*.live.ts` และไม่แตะไฟล์ใน do-not-edit list; ไฟล์ `prospect*.live.ts` + `phone-format.service*.ts` ใน workspace คือสำเนาจาก main (หัวข้อ 6)

### 0.5 ข้อความสำหรับ `CLAUDE.md` / `README.md` / `manual/`
`CLAUDE.md` — แก้ bullet ของ Opportunities: เปลี่ยน "เฟส A: โหมดจริงยังไม่มี (host แสดง `<ts-live-missing/>`)" เป็น
"โหมดจริง (`mock:false`): `leads.live.ts` ตอบ URL ของ BFF เดิมจาก REST ของ `triplesale-service` ผ่าน HttpClient — `core/live/opportunities.live.ts` (servlet ของ lead board: `/board/leads`, `filter-state`, `detail-filter-state`, `lead-assign`, `contact-activities`, `lead-update`, `lead-materials`) + `board-master.live` + `lead-core.live` (+ `prospect.live` — รอ worker prospects); filter state อยู่ใน sessionStorage ของแท็บ (ตามผู้ใช้)".
ไม่มี key i18n ใหม่, ไม่มี route/registry ใหม่ (หน้า registered ตั้งแต่เฟส A)

---

## 1. ไฟล์ที่เพิ่ม / แก้

| ไฟล์ | สถานะ | เนื้อหา |
| --- | --- | --- |
| `src/app/core/live/opportunities.live.ts` | **แทน placeholder** (export `opportunitiesRoutes(deps): RouteHandler` คงเดิม) | ทุก servlet ของ lead board (หัวข้อ 2) + helper ที่ export ให้หน้าอื่น: `fetchLeadsJson`, `localizeLocationNames`, `toO2oLabel`, `savedFilterState`, `javaUrlEncode`, `javaTrim`, `javaParseLong`, `readBody`, `FILTER_STATE_KEY`, `DETAIL_FILTER_STATE_KEY` |
| `src/app/core/live/opportunities.live.spec.ts` | ใหม่ | 49 ข้อ ด้วย `fakeRest` |
| `src/app/features/opportunities/leads.live.ts` | ใหม่ | `createLiveOpportunities(deps): OpportunitiesBackend` = `composeRoutes(boardMasterRoutes, opportunityCoreRoutes, opportunitiesRoutes, prospectRoutes)` + `initial()` (= `LeadBoardView.init()`) |
| `src/app/features/opportunities/leads.live.spec.ts` | ใหม่ | การประกอบ + `initial()` |
| `src/app/features/opportunities/leads-view.ts` | แก้ | `backend()` เลือก mock / live (`restDepsOf(injector)`); `env.docProxy` |
| `src/app/features/opportunities/leads.ts` | แก้ | เอา `<ts-live-missing/>` ออก |
| `src/app/features/opportunities/leads.spec.ts` | แก้ | ข้อ "mock off = notice" → 3 ข้อ live ผ่าน `HttpTestingController` (first paint จาก REST, filter state ใน sessionStorage + เปิดหน้าซ้ำ, ย้ายการ์ด → `POST /leads/{id}/contact-activities`) + ข้อ docProxy; `sessionStorage.clear()` ใน `beforeEach` |
| `src/app/features/opportunities/leads.mock.ts` | แก้ | ดู 0.4 |
| `src/app/features/opportunities/leads.engine.ts` · `tools/sync-opportunities.mjs` | แก้ (generated) | ดู 0.2 |
| `src/app/core/dom/phone-format.service.ts` | แก้ (shared) | ดู 0.1 |
| `src/app/core/dom/phone-format.service.spec.ts` | ใหม่ | 2 ข้อ: `PhoneFormat.load()` ในโหมด `mock:false` ขอ `master-data/countries` ผ่าน HttpClient (ไม่เรียก `fetch`/BFF) และเบอร์ขึ้นตาม mask; service ล้ม = เบอร์ดิบ |
| `tools/compare/pages/opportunities/page.mjs` | แก้ | `newState` เก็บ `hook`; **`upstream`** = fake REST service (`/leads`, `/master-data/*`, `POST /leads/{id}/contact-activities`, และ — เพิ่มหลัง merge prospects — `GET /prospects` + `GET /prospects/{id}/quick-view`) |
| `tools/compare/pages/opportunities/scenarios.mjs` | แก้ | `cfg()` ส่ง `live: { hook }`; `fail-leads*` มี variant ของ `--live`; `skeleton-first-load*` ใช้ `delayLeadsOnly` |

ไม่แตะ: `core/live/{rest,rest-deps,rest-fake,org-json,json-java,board-master.live,lead-core.live}.ts`, `tools/compare/lib/**`, `tools/compare/run.mjs`, `core/{i18n,auth,config,navigation}/**`, `package.json`, `docs/**`

---

## 2. servlet ที่พอร์ต

URL ของหน้าเรียกแบบ Java (`../board/…`); `parsePageUrl` ตัด `../` และ `/triplesale` ให้. REST = ใต้ `/triplesale-service/api/v1`.

| URL | Java | ทำอะไร (ตรงกับโค้ด Java) | REST | สถานะ |
| --- | --- | --- | --- | --- |
| `GET /board/leads` | `LeadsBoardServlet` → `LeadBoardView.fetchLeadsJson` (+ `localizeLocationNames`) | **ไม่มี `CRM_Lead_View` → `[]` (200) ไม่เรียก service**; param: `_param` = trim + default (`viewMode`=board, `sortBy`=txdate_desc), `_intParam` = `Integer.parseInt(trim)` ผิด/ว่าง → default (page=1, perPage=20); `page<1`→1, `perPage<1`→20, ไม่มีเพดานบน; URL = `viewMode, movementTypeId, activityGroupId, activityStepId, search, showClosed, dateRangeType, dateFrom, dateTo, provinceId, districtId, activeStatus, saleGroupId, (salePersonId ไม่ส่ง), employeeId, tagIds, sortBy, page, perPage` — ค่าว่างไม่ส่ง, ค่าใส่ตามที่ trim แล้ว **มีเฉพาะ `search` ที่ `URLEncoder.encode(…,"UTF-8")`** (space → `+`, `*` ไม่ encode, `~` → `%7E`); `sendGET` = body ของ 200 เท่านั้น; ไม่ใช่ `{` / parse ไม่ได้ / `status≠200` / ไม่มี `result` → `[]`; ได้ `result` → ข้อความของ `result` (object/array/null/string/number); ว่าง → `[]`; แล้ว **`localizeLocationNames`** (อังกฤษ: `currentCityName`/`currentDistrictName` ← `province.<code>`/`district.<code>`; ไทย: `currentCountryName` ← `masterdata_th[code]`; `leads.items[]` + `kanban[].items[]`; ชื่อว่างไม่แตะ; ไม่ใช่ JSON object คืนเดิม) | `GET /leads?viewMode=…` | ✅ |
| `GET\|POST /board/filter-state` | `FilterStateServlet` | GET: ข้อความที่เก็บไว้ หรือ `null`; POST: อ่าน body (`readLine` ต่อกัน → line break หาย, trim) เก็บเมื่อไม่ว่าง → 204 | — (sessionStorage `ts.leads.filter-state:<user>`) | ✅ |
| `GET\|POST /board/detail-filter-state` | `DetailFilterStateServlet` | เหมือนข้างบน แต่ POST body ว่างหรือ `null` = ลบ | — (sessionStorage `ts.lead-detail.filter-state:<user>`) | ✅ (หน้า lead-detail ใช้) |
| `LeadBoardView.init()` → `savedFilterJson` | `LeadBoardView` | อ่าน state ที่เก็บไว้ (ไม่ว่าง) ส่งให้หน้า; ไม่มี = `null` | `OpportunitiesBackend.initial()` ใน `features/opportunities/leads.live.ts` (`savedFilterOf`) | ✅ |
| `POST /board/lead-assign` | `AssignLeadServlet` | body ว่าง → 400 `{"error":"body required"}`; PATCH ส่ง body ดิบ; ตอบ body ของ service ทุกสถานะ (`sendPATCH`) ด้วย 200, ว่าง → `{}` | `PATCH /leads/assign` | ✅ (home / activities ใช้) |
| `POST /board/contact-activities` | `ContactActivitiesServlet` + `ContactChannel.toO2oLabel` | body ไม่ใช่ JSON object → 400 `{"error":"invalid json body"}`; ไม่มี/`null` `leadId` → 400 `{"error":"leadId required"}`; ตัด `leadId` ออกจาก body ไปอยู่ใน path; `channel` ไม่ว่าง → ป้าย o2o (`call_out`/`Call out`/`CALL-OUT` → `Call Out`, … ที่ไม่รู้จัก = trim แล้วส่งต่อ); **ส่งสถานะ + body ของ service กลับตรง ๆ** (body ว่าง → `{}`; ไม่มีคำตอบ = 502) | `POST /leads/{leadId}/contact-activities` | ✅ (move-step modal; lead-detail, activities ใช้) |
| `POST /board/lead-update?action=` | `LeadUpdateServlet` | param จาก query **หรือ form body** (`application/x-www-form-urlencoded` — lead-detail ส่งแบบนี้; query ชนะ); `target-year`, `target-month` (`(int)` ของ long), `amount` (`new BigDecimal` ไม่ได้ → 0), `tags` (PUT; ตัวที่ไม่ใช่ long ข้าม), `assign` (`Long.parseLong` ไม่มี try → **500** `{"status":500,"message":"server error"}`), `active-status`, `demand`; action อื่น → 400 `{"status":400,"message":"unknown action: …"}`; ตอบ body ของ service ทุกสถานะด้วย 200 | `PATCH /leads/{target-year\|target-month\|amount\|assign\|active-status\|demand}`, `PUT /leads/{id}/tags` | ✅ (lead-detail ใช้) |
| `POST\|DELETE /board/lead-materials` | `LeadMaterialsServlet` | POST: `sendPOST` body ดิบ → ตอบ body ทุกสถานะ (200); DELETE (มี body): ตอบ body ที่ trim แล้ว (200), **ไม่มีคำตอบเลย = 500 `{}`** | `POST\|DELETE /leads/materials` | ✅ (lead-detail ใช้) |
| `GET /board/master/movement-types`, `tags`, `sale-groups`, `provinces`, `employees`, `districts`, `chat-master-data` | master servlets | **ใช้ `board-master.live.ts` ที่ทำไว้แล้ว** (ไม่เขียนซ้ำ) | `master-data/*` | ✅ (compose) |
| `GET /board/lead`, `POST /board/schedule/add\|edit` | `LeadDetailServlet` ฯลฯ | **ใช้ `lead-core.live.ts`** (หน้า leads ไม่เรียก; compose ไว้ให้ชุดเดียวกับหน้า lead อื่น) | — | ✅ (compose) |
| `GET /board/prospect-list` | `ProspectListServlet` | **placeholder `prospectRoutes`** — worker prospects | — | ⏳ รอ merge |
| `GET ../docproxy?url=` | `DocProxy` | ไม่พอร์ต — ดูหัวข้อ 3.6 | — | ❌ (ตัดสินใจแล้ว) |

---

## 3. การตัดสินใจ / ความต่างจาก servlet container

1. **`HttpSession` → `sessionStorage` ของแท็บ, key ตามผู้ใช้** (`ts.leads.filter-state:<username>`, `ts.lead-detail.filter-state:<username>`; `RestDeps.user.username`). อ่าน/เขียนใน try/catch + สำรองใน memory ถ้า storage ใช้ไม่ได้.
   ต่างจาก Java: HttpSession ใช้ร่วมกันทุกแท็บของเบราว์เซอร์และตายตอน logout/หมดเวลา — sessionStorage อยู่เฉพาะแท็บ (แท็บใหม่เริ่มสะอาด) และไม่ถูกล้างตอน logout (ข้อเสนอ 0.3). ไม่เก็บใน localStorage (จะอยู่ข้าม session ของผู้ใช้)
2. **method ผิด = JSON 405** `{"status":405,"message":"Method Not Allowed"}` (container ตอบหน้า 405 ของตัวเอง) — เหมือนที่ `lead-core.live` ทำ
3. **ไม่พอร์ต (พิสูจน์แล้วว่าโค้ด Java ใน `try` นั้นโยนไม่ได้)**: ทางโยน exception ของ `LeadsBoardServlet` (500 + `[]`), `{"error": e.getMessage()}` ของ assign / contact-activities (`Data_API` กลืน IOException ทุกตัว ตอบ `""`). ใน TS `RestDeps.call` ไม่ reject
   — ยังครอบ `try/catch` ที่ `/board/leads` (500 + `[]`) และ `lead-update` (500 `server error`) เพราะ Java มีทางโยนจริงที่นั่น (`Long.parseLong` ของ `assign`)
4. **ไม่พอร์ต cache/header**: `Cache-Control`/`Pragma`/`Expires` ของ servlet (ไม่มี HTTP cache คั่นระหว่างหน้ากับ `RestDeps.call`); ไม่มี performance cache ใน servlet กลุ่มนี้ (cache ใน session ของจังหวัด/ประเทศอยู่ที่ `board-master` — ไม่พอร์ตตามที่ทำไว้)
5. **ตัวเลข long ไม่เสียความแม่นยำ**: `lead-update` สร้าง body JSON เป็นข้อความเอง (`leadId`/`month`/id ผ่าน `BigInt`, `amount` ผ่าน `javaDecimalLiteral` ตัวเลขเท่ากับที่ `new BigDecimal(...)` + org.json เขียน — ไม่มี `+`, ไม่มีศูนย์หน้า/หลังจุด) และส่งด้วย `Content-Type: application/json; charset=UTF-8` เหมือน `Data_API`
6. **รูป `http(s)://` (`DocProxy`)**: ไม่มี BFF เปิด `<img src="../docproxy?url=…">` ไม่ผ่าน `fetch` จึงตอบจาก live backend ไม่ได้ ตัดสินใจ: **โหลดจาก URL ที่ service ส่งมาตรง ๆ** (`env.docProxy = (url) => url` เหมือน home / activities) —
   ใช้ได้เมื่อ file server ตอบ `https` (หรือหน้าเองอยู่บน `http`); `<img>` ไม่ต้องการ CORS. ถ้า file server เป็น `http` ล้วนและหน้าอยู่บน `https` เบราว์เซอร์จะบล็อก (mixed content) — ต้องให้เจ้าของระบบเลือก: file server เป็น https หรือ gateway มี proxy ที่เทียบเท่า `/docproxy` (คำถามข้อ 4 ในหัวข้อ 7).
   mock ไม่มีรูป `http` (default avatar) จึงไม่เปลี่ยนผลของ phase A
7. **ค่า `salePersonId`** ที่ `LeadBoardView` รับ ไม่ส่งเมื่อมาจาก servlet (servlet ส่ง `""`) — ส่งได้ถ้าเรียก `fetchLeadsJson(deps, { salePersonId })` ตรง ๆ (ตำแหน่งก่อน `employeeId`)

---

## 4. สิ่งที่ fake service (`page.upstream`) สมมติเกี่ยวกับ REST จริง — **ทั้งหมดมาจากโค้ด Java ไม่ใช่จากข้อมูลจริง**

- `GET /leads?…` → `{status:200, message, result}`; `result` = `{id, activityGroupId, usesWorkflowStep, statusSummary:{total,new,success,lost,inactive,active:{total,hot,warm,cold}}, wfStepSummary:[{id,code,name,count}], kanban:[{stepId,stepCode,stepName,items[],meta:{page,perPage,total,totalPages}}], leads:{items[],meta}}` (board ใช้ `kanban`, list ใช้ `leads`); รายการ (item) ตาม leads.md §8.2; ชื่อจังหวัด/เขตเป็นภาษาไทย + `currentCityCode`/`currentDistrictCode`,
  ชื่อประเทศเป็นภาษาอังกฤษ + `currentCountryCode` (ตามคอมเมนต์ใน `LeadsBoardServlet`); service ล้ม = HTTP 500 (`failLeads`)
- `GET /master-data/movement-types/LD` → envelope ดิบ `{status,message,result:{items:[{id,code,name}]}}`
- `GET /master-data/{tags?key=,sale-groups,employees}` → `{status:200,result:[{id,code,name,nameTh,colorCode,attachFile,postCode,+ ฟิลด์ที่หน้าไม่อ่าน}]}`; `GET /master-data/provinces` ปนเมืองต่างประเทศ + code ซ้ำที่มี tab นำหน้า (id ต่ำกว่า) + ชื่อไทยที่ไม่มี code
  (ตาม BACKEND_BUG_masterdata_address) — live ต้องเหลือ 6 จังหวัดที่สะอาดตามลำดับเดิม; `GET /master-data/districts?provinceId=`; `GET /master-data/countries?page=1&pageSize=1000` → `{status,result:[{code,phoneCountryCode,phoneNumberFormat}]}`
- `POST /leads/{id}/contact-activities` → body = ที่หน้าส่งโดย **ไม่มี `leadId`** และ `channel` เป็นป้าย o2o (fake ตอบ 400 ถ้าไม่ใช่ — ตัวตรวจว่าพอร์ตแปลงถูก); สำเร็จ 201 `{status:201,message,result:{id}}`; ปฏิเสธ = `{status,message,error:{code,message}}` + สถานะจริง
- บัญชีที่เรียก (viewer / demo) อ่านจาก Bearer token ของ fake sign-in (`mock.access.<claims>`); fake ไม่ตรวจ token ละเอียดไปกว่าที่ `live-upstream.mjs` ทำ
- **ไม่ได้ยืนยัน**: ชื่อ field ทั้งหมดข้างบน, ว่า `result` ของ `/leads` เป็น object เสมอ (Java รองรับ array เก่าด้วย — spec ครอบ), ว่า service ส่ง `currentCityCode`/`currentDistrictCode` มาจริง (ถ้าไม่ส่ง = หน้าอังกฤษขึ้นชื่อไทยของเมือง/เขต),
  ว่า gateway ส่ง body ของ `DELETE /leads/materials` ถึง service (browser ส่ง body กับ DELETE ได้ แต่บาง proxy ตัดทิ้ง)

---

## 5. ผลการตรวจ (ทุกตัวเลขมาจากการรันจริงใน workspace นี้ กับโค้ดสุดท้าย)

**สิ่งที่พิสูจน์ได้ = "live backend ทำเหมือน servlet ของ Java บน fixture ที่เขียนจากโค้ด Java". ไม่ใช่ "ถูกต้องกับ API จริง"** (ไม่มี test account — ต้องมี smoke test กับ UAT อีกครั้งก่อนเชื่อว่าใช้ได้จริง)

| รายการ | ผล |
| --- | --- |
| spec `src/app/core/live/opportunities.live.spec.ts` (`fakeRest`) | **49 ข้อผ่าน** — ทุก route: URL/query ที่ยิง (ลำดับ, encoding แบบ `URLEncoder`, ค่าว่างไม่ส่ง), role gate, default/clamp ของ `page`/`perPage`, ทุกทางผิดพลาด (ไม่ใช่ 200, ไม่มีคำตอบ, ไม่ใช่ JSON, ไม่ใช่ object, `status≠200`, ไม่มี `result`), TH vs EN ของชื่อสถานที่, filter state ต่อผู้ใช้, `contact-activities` (400 ทั้งสอง, channel, สถานะ/ body ของ service), `lead-update` ทุก action (form body + query, `BigDecimal`, `(int)`, `Long.parseLong` พัง = 500), `lead-materials` POST/DELETE, `lead-assign` |
| spec `src/app/features/opportunities/**` | **3 ไฟล์ 65 ข้อผ่าน** (`leads.mock.spec` 41 · `leads.spec` 19 · `leads.live.spec` 5) — host ในโหมด `mock:false` ผ่าน `HttpTestingController`: first paint จาก REST, ไม่มี URL `/board/…` และไม่เรียก `fetch`; filter state ใน sessionStorage + เปิดหน้าซ้ำที่แท็บ List; ย้ายการ์ด → `POST /leads/{id}/contact-activities` |
| spec `src/app/core/dom/**` | **5 ไฟล์ 40 ข้อผ่าน** (รวม `phone-format.service.spec.ts` ใหม่ 2 ข้อ: เบอร์โทรในโหมด live) |
| `ng build` (production) | ผ่าน **ไม่มี warning/error**; chunk `leads` 175 KB (ส่ง 30 KB); live backend (`leads.live`) เป็น lazy chunk แยกจากหน้า (โหลดเฉพาะ `mock:false`); งบ `anyComponentStyle` ไม่เปลี่ยน |
| `compare leads --live` (Angular ใช้ live backend กับ fake REST `page.upstream`; **หลัง merge prospects**) | **232/232 เหมือนทุกบรรทัด** (รันทั้งชุดเป็น 4 ชุด `--jobs 2` รอบเดียวผ่าน ไม่ต้องรันซ้ำตัวไหน). ไม่มี `pageerror`, `ready-timeout`, scenario error; request 4xx/5xx ในรายงานมีแต่ที่ scenario สั่งเอง (`fail-leads*` = fake service ตอบ 500; `dnd-modal-save-fail*` = `!fail`) — ไม่มี `[odsProspectSuggest] … 404` แล้ว. ก่อน merge prospects: 222/232 (หัวข้อ 6) |
| `compare leads` (phase A, mock ทั้งสองฝั่ง) | รอบเต็ม 232/232 เหมือน (ก่อน merge prospects, หลังแก้ mock); หลังแก้ `skeleton-first-load*` (แถวถัดไป) รันซ้ำเฉพาะตัวที่แตะ + `overview`/`en-overview`/`search-suggest`/`fail-leads` 3 รอบ เหมือนทุกรอบ |
| `skeleton-first-load` · `-dark` · `-390` (เคยไม่นิ่ง) | **แก้ที่ต้นเหตุแล้ว**: ต่างเป็นพัก ๆ (ทั้ง phase A และ `--live`, บ่อยขึ้นเมื่อเครื่องหนัก) เพราะ Java replica เสิร์ฟผ่าน HTTP/1.1 (6 connection ต่อ origin) — scenario หน่วงคำตอบ 6 รายการพร้อมกัน (tags, sale-groups, provinces, employees, movement-types, leads) จนรูป `background-image` ของ CSS ไปคิวอยู่หลังมัน → event `load` มาพร้อมข้อมูล (วัดได้: `loadEventEnd` ≈ 15.2 วิเมื่อหน่วง 15 วิ) → dump เห็นข้อมูลแทน skeleton เฉพาะฝั่ง Java; ฝั่ง Angular ไม่เป็น (เพิ่มเวลาหน่วงไม่ช่วย เพราะข้อมูลมาตอน `load` พอดี). แก้: สวิตช์ mock `delayLeadsOnly` (หน่วงเฉพาะ `/board/leads`) ใช้กับ 3 scenario นี้ → นิ่ง: `--live` 6/6 รอบ, mock 3/3 รอบ เหมือนทุกครั้ง (ทั้งสองฝั่ง 667 บรรทัด = skeleton ยังอยู่ รายการผลิตภัณฑ์โหลดแล้ว) |
| negative control | ทำลายพอร์ตชั่วคราว 2 จุด (ไม่แปลง channel เป็นป้าย o2o; ไม่แปลงชื่อเมือง/เขตเป็นอังกฤษ) → `dnd-modal-save` และ `en-overview` **ต่าง** ใน `--live` (`overview` ไม่ต่าง) แล้วคืนโค้ดและรันซ้ำ — harness จับพอร์ตที่ผิดได้จริง |

วิธีรันซ้ำ: `node tools/compare/run.mjs leads --live [--no-build] [--filter …] --jobs 2` (ทั้งชุดใช้ ~20 นาที; แบ่ง 4 ชุดถ้าเครื่องแชร์กับ worker อื่น — เคยมี `Target closed` เมื่อ Chrome ถูกปิดจากภายนอก);
spec: `CI=1 node node_modules/@angular/cli/bin/ng.js test --no-watch --include 'src/app/core/live/opportunities.live.spec.ts' --include 'src/app/features/opportunities/**/*.spec.ts'` (บนเครื่องแชร์ ng บางครั้งตาย `Fatal process out of memory: Zone` หรือ `assert(compilation)` / `esbuild … unexpected signal` เมื่อ commit memory ของเครื่องเกือบเต็ม — ไม่ใช่ข้อผิดพลาดของโค้ด: รันซ้ำเมื่อ `FreeVirtualMemory` กลับมา)

### ความต่างเล็กน้อยจาก Java ที่รู้และยอมรับ
- org.json อ่าน JSON แบบหลวม (single quote, trailing text ฯลฯ) — พอร์ตใช้ `JSON.parse`: body ที่ไม่ใช่ JSON มาตรฐานถูกปฏิเสธมากกว่า Java (service จริงส่ง JSON มาตรฐาน)
- ตัวเลขที่ไม่ใช่จำนวนเต็มใน `leadId` (`12.0`) → path เป็น `12` (Java `12.0`); `Integer/Long/BigDecimal` ที่รับเลขหลักอื่น (อารบิก/ไทย) ไม่รองรับ — หน้าส่งเลขอารบิกเสมอ
- `toLowerCase()` ของ `ContactChannel.normalizeKey` ใช้ locale ค่าเริ่มต้นของ JVM; ที่นี่ใช้ `toLowerCase()` ของ JS (ต่างได้เฉพาะ locale ตุรกีกับตัว `I`)
- ค่า `status` ของ HTTP ที่ `Response` สร้างไม่ได้ (นอก 200–599) → 502; 204/205/304 ไม่มี body (container ก็ตัด body ของสถานะพวกนี้)

---

## 6. scenario ที่พึ่งโมดูลของ worker อื่น (การ์ดแนะนำลูกค้า = prospects) — **ปิดแล้ว: 232/232**

`/board/prospect-list` (การ์ดแนะนำใต้ช่องค้นหา = `odsProspectSuggest`, `ProspectListServlet` + `ProspectListService`) เป็นของ worker prospects. ตอน merge รอบแรก `prospect.live.ts` ยังเป็น placeholder (404) →
10 scenario ที่พิมพ์ในช่องค้นหาแล้วรอการ์ดต่าง (`search-suggest` · `-dark` · `-390` · `-pick` · `search-go` · `search-enter` · `search-list` · `search-close-x` · `search-esc` · `scroll-col-search`; ตรวจแล้วว่าบรรทัดแรกที่ต่างคือ root `.ods-list.ods-ac` — เนื้อหาหน้าก่อนหน้านั้นเหมือน Java ทุกบรรทัด).
หลัง merge prospects (`prospect.live.ts` ตัวจริง + `prospect-list.live.ts`) และเพิ่ม REST ของ `ProspectListService` ใน `page.upstream` แล้ว รัน `--filter '^(search-|scroll-col-search)'`: **16/16 เหมือน**, และรอบเต็ม **232/232**.

fake REST ที่เพิ่ม (`tools/compare/pages/opportunities/page.mjs`, ตามแบบ `upstream` ของ `pages/prospects/page.mjs`; ลูกค้า/การค้นหา/แบ่งหน้าเป็นของ mock เดียวกับ Java replica — `mock.fetch('/board/prospect-list…')`):
- `GET /prospects?page&perPage&searchText` → `{status:200, message, result:[ProspectResDTO…], meta}`. แถวมีเฉพาะที่ **list** มี: `id, name, customerTel` (= `phone` ของ mock), `currentCityName` (= `addr` ของ mock; ฟิลด์ที่อยู่อื่นว่าง → `fullAddress` = จังหวัดเท่านั้น), `attachFile` (= `avatar`), `contactDate`, `marketingChanelName`, `salePerson*`, `saleGroupName`, `employee*` — **ไม่มี `code`**
- `GET /prospects/{id}/quick-view` → `{status:200, result:{code, sex, customerType, prospectEmail, convenient}}` — `code` มาจากตรงนี้เท่านั้น (enrich=1 ของ `ProspectListService` เขียนทับ). หน่วงน้อย (≤ 8 ms/รายการ เหมือน harness ของ prospects) เพราะหน้าเรียกทีละรายการ
- ผลที่ `prospectRoutes` ต้องออกมา = `{id, code, name, phone, addr, avatar}` เท่าที่การ์ดอ่าน (`odsProspectSuggest` อ่านแค่ 6 ฟิลด์นี้) — ตรงกับ mock ทุกตัวอักษร
- ไม่ได้ครอบ: ทางล้มของรายการ (`result.error`, `errorStatus`), `/board/prospect-enrich`, การกรองด้วย `marketingChannelIds`/`currentCityId` — หน้า leads ไม่ใช้ (อยู่ใน spec ของ prospects)

ข้อสังเกตตอนทำ: `node tools/workspace.mjs refresh` **ไม่ได้ดึง** `src/app/core/live/prospect*.live.ts` (regex `PULL` ของ `workspace.mjs` ไม่มี `core/live`) — ผมคัดลอก `prospect.live.ts`, `prospect-list.live.ts`, `prospect-payload.live.ts`, `prospect-files.live.ts` ตรง ๆ จาก main เข้า workspace (ไม่แก้ไฟล์เหล่านั้น) และคัดลอก `phone-format.service.ts` (+ spec) ตามที่ merge แล้วใน main ทับของผม (ต่างจากของผมแค่ลำดับ import) เพื่อให้ workspace ตรงกับ main

scenario ที่ **ไม่ได้ทดสอบเลย** (ทั้ง phase A และ B): ลากด้วยเมาส์จริง/จอสัมผัส (harness ยิง `DragEvent`), เบราว์เซอร์ที่ไม่ใช่ Chrome headless, รูปลูกค้า `http(s)://` (mock ไม่มี), การโหลดรูปผ่าน file server จริง

---

## 7. คำถามถึงเจ้าของ backend / ระบบ

ข้อ 1–7 ของ `docs/integration/leads.md` §8.3 ยังเปิดอยู่ทั้งหมด (ความหมายของ `showClosed`, ขอบเขตของ `statusSummary`/`wfStepSummary`, กลุ่มเริ่มต้นเมื่อไม่ส่ง `activityGroupId`, เพดาน `perPage`, ฟิลด์ของ `dateRangeType=custom`, รูป `http://`, filter state ฝั่ง server, สัญญาของ `forwardStatus`, dictionary ชื่อสถานที่) พร้อมข้อที่เกิดจากงานเฟส B:

1. `POST /leads/{id}/contact-activities` รับ `channel` เป็นป้าย o2o (`Call Out`, `SMS` …) และไม่ต้องมี `leadId` ใน body ใช่ไหม (Java ตัด `leadId` ออกและแปลง channel ก่อนส่ง — พอร์ตทำเหมือนกัน)
2. `DELETE /leads/materials` ต้องการ body (`{leadId, detailOrderNo}`) — gateway ส่ง body ของ DELETE ต่อให้ service หรือไม่
3. `GET /leads` ส่ง `currentCityCode` / `currentDistrictCode` / `currentCountryCode` ครบทุก item ไหม (การแปลชื่อสถานที่ฝั่ง browser ใช้ code เหล่านี้กับ `master-data.{th,en}.json` — dictionary นี้ครอบคลุมเฉพาะ 77 จังหวัด + 79 เขตในเขตกรุงเทพและปริมณฑล; เขตของจังหวัดอื่นในภาษาอังกฤษจะขึ้นชื่อไทยเหมือน servlet เดิม)
4. `filter-state` (ของ board และของ lead-detail): จะมี API เก็บฝั่ง server (ให้ตามผู้ใช้ ไม่ตามแท็บ) หรือใช้ sessionStorage ของแท็บตามนี้
5. รูป `http://` ของลูกค้า/ผู้มีสิทธิ์: file server เสิร์ฟ `https` ได้ไหม หรือ gateway มี proxy แทน `/docproxy` (ดู 3.6)
