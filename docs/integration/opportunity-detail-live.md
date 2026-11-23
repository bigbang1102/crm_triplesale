# INTEGRATION — LIVE backend ของหน้า `lead-detail` (`/crm/opportunities/:opportunityId`) + โมดูล `src/app/core/live/opportunity-actions.live.ts` (เฟส B)

workspace: `triple_sale_angular_ws_lead-detail` · route `crm/opportunities/:opportunityId` · ต้นฉบับ Java ที่ย้ายใหม่ (ยังไม่มีใครพอร์ต): `LeadCloseServlet`, `LeadCloseStepServlet`, `LeadForwardServlet`, `LeadReturnServlet`,
`LeadAccessorAddServlet`, `LeadContactHistoryServlet`, `LeadForwardGroupsServlet`, `LeadForwardEmployeesServlet`, `LeadReturnGroupsServlet`, `LeadAccessorsSearchServlet`
(+ helper ที่เรียก: `Data_API.sendGET/sendPOST`, `TriplesaleApi`, `URLEncoder`, org.json) · servlet อื่นของหน้านี้ใช้โมดูลที่ merge แล้ว (ดูหัวข้อ 2)

> **สถานะ: ประกอบเสร็จ มี spec และ `--live` ของ harness — แต่พิสูจน์ได้เพียง "live backend ทำเหมือน servlet ของ Java บน fixture ที่เขียนจากโค้ด Java"**
> ไม่ได้ตรวจกับ `triplesale-service` จริง (ไม่มี test account; ไม่มี OpenAPI สาธารณะ) — **ห้ามเขียนว่า "ยืนยันกับ API จริงแล้ว"**. รูปคำตอบที่ fake service สมมติอยู่หัวข้อ 6
> ผลตรวจ (จำนวน spec, `--live`, build) อยู่หัวข้อ 7

---

## 0. สิ่งที่ผู้ประสานงานต้อง merge / ตัดสินใจ

**ไม่มีการแก้ไฟล์ shared** (`core/live/{rest,rest-deps,rest-fake,org-json,json-java,board-master.live,lead-core.live}.ts`, `tools/lib/**`, `tools/compare/lib/**`, `tools/compare/run.mjs`, `core/{i18n,auth,config,navigation}/**`, `package.json`, `docs/**`, `CLAUDE.md`, `README.md`, `manual/**` — ไม่แตะ).
`merge --apply` คัดลอกไฟล์ที่เพิ่ม/แก้ในหัวข้อ 1 ได้ตามปกติ. สิ่งที่ผู้ประสานงานทำเองเพิ่ม (เอกสาร):

### 0.1 ข้อความสำหรับ `CLAUDE.md` / `README.md` / `manual/`
`CLAUDE.md` — bullet ของ Lead detail: เปลี่ยน "โหมดจริงยังไม่มี (`<ts-live-missing />`)" เป็น
"โหมดจริง (`mock:false`): `lead-detail.live.ts` ตอบ URL ของ BFF เดิม (`../board/lead`, `../board/lead/close` …) จาก REST ของ `triplesale-service` ผ่าน HttpClient — ประกอบจาก `core/live`:
`board-master` + `lead-core` + `leads` (lead-update, lead-materials, contact-activities, detail-filter-state → sessionStorage ของแท็บ) + `prospect` (+ `/docproxy`) + `activities` + **`lead-actions.live.ts`** (close, close-step, forward, return, accessor-add,
contact-history, forward-groups, forward-employees, return-groups, accessors)"
`manual/index.html` / `manual-lead-detail.html` — ย่อหน้า "โหมดจริง": ลิงก์ไป `docs/integration/lead-detail-live.md` (ผู้ประสานงานย้าย INTEGRATION.md นี้เข้า `docs/integration/` ตามธรรมเนียม) ไม่มี key i18n ใหม่, ไม่มี route/registry ใหม่

### 0.2 `tools/sync-opportunity-detail.mjs` + `src/app/features/opportunity-detail/lead-detail.engine.ts` (generated) — รูป `http(s)://` ผ่าน `env.docProxy` (decision ของ worker นี้ — ดูหัวข้อ 3.3)
เป็นไฟล์ของหน้านี้ (merge ตามปกติ). 2 swap `? ('../docproxy?url=' + encodeURIComponent(u)) : u;` → `? env.docProxy(u) : u;` (สคริปต์หน้า + `access_pop`), ฟิลด์ `docProxy: (url: string) => string` ใน `OpportunityDetailEnv`,
บรรทัดหัว engine แก้คำอธิบาย (mock หรือ live). รัน `node tools/sync-opportunity-detail.mjs` แล้ว diff ของ engine มีแค่ 4 จุดนี้ (html/scss ไม่เปลี่ยน; รันซ้ำแล้วไม่เปลี่ยนอีก). host ให้ `docProxy: (url) => url` ทั้ง mock และ live (เหมือน leads / home / activities).
`fetch('../docproxy?url=…')` ของ "ดาวน์โหลดเอกสาร" **ไม่ถูกแตะ** — ยังเป็น `env.fetch` และ `prospect.live.ts` ตอบให้ (`/docproxy`)

### 0.3 (แนะนำ) `src/app/core/dom/session-ui.ts` — `clearSessionUi()` ตอน logout
เหมือนข้อ 0.3 ของ `leads-live.md`: ตัวกรองประวัติที่บันทึกไว้ (`ts.lead-detail.filter-state:<username>`, ค่าคงที่ `DETAIL_FILTER_STATE_KEY` ใน `core/live/opportunities.live.ts`) อยู่ใน `sessionStorage` ของแท็บ จึงไม่หายตอน logout ถ้าแท็บเดิมใช้ต่อ (Java: HttpSession ถูกทำลาย)

### 0.4 ข้อสังเกตเรื่องไฟล์ของหน้าอื่น (ไม่ได้แก้ — ไม่ใช่ของ worker นี้)
`src/app/features/sales-docs/form/sales-doc-backend.ts` ประกาศ `UPLOAD_ACCEPT_EXT = '.7z, .csv, …'` (คั่นด้วย `, `) แต่ `FileServerAccess.uploadAcceptAttr()` ของ Java ใช้ `String.join(",", new TreeSet<>(ALLOWED_EXT))` (คั่นด้วย `,` ไม่มีเว้นวรรค — `allowedUploadExtText()` ต่างหากที่ใช้ `, `).
หน้า lead-detail (mock เดิมก็ใช้ `, ` เช่นกัน — แก้แล้ว หัวข้อ 4) และ prospects ถูกต้องแล้ว; sales-doc form ควรตรวจ

---

## 1. ไฟล์ที่เพิ่ม / แก้

| ไฟล์ | สถานะ | เนื้อหา |
| --- | --- | --- |
| `src/app/core/live/opportunity-actions.live.ts` | **ใหม่** | `opportunityActionRoutes(deps): RouteHandler` = 10 servlet (หัวข้อ 2.1) + `javaBlank` (`String.isBlank()`), `NO_CONTENT` (ข้อความ stand-in) |
| `src/app/core/live/opportunity-actions.live.spec.ts` | ใหม่ | 36 ข้อด้วย `fakeRest` |
| `src/app/features/opportunity-detail/lead-detail.live.ts` | ใหม่ | `createLiveOpportunityDetail(deps, io?)` = `composeRoutes(boardMasterRoutes, opportunityCoreRoutes, opportunitiesRoutes, prospectRoutes, activityRoutes, opportunityActionRoutes)` + `initial()` (= `commonBean.uploadAcceptExt` = `uploadAcceptAttr()`) |
| `src/app/features/opportunity-detail/lead-detail.live.spec.ts` | ใหม่ | 6 ข้อ: การประกอบ (ทุก address ของหน้า → REST call ที่ถูกต้อง ตามลำดับ), `initial()`, role gate ของ `/board/lead`, detail-filter-state ใน sessionStorage, `/docproxy` ผ่าน file server, 404 |
| `src/app/features/opportunity-detail/lead-detail-view.ts` | แก้ | `backend()` เลือก mock / live (`restDepsOf(injector)`); `env.docProxy`; `open()` ของ `../rvreport?txno=` ในโหมด live (หัวข้อ 3.4) |
| `src/app/features/opportunity-detail/lead-detail.ts` | แก้ | เอา `<ts-live-missing />` / `ConfigService` ออก |
| `src/app/features/opportunity-detail/lead-detail-backend.ts` | แก้ | คอมเมนต์ (มี 2 implementation) |
| `src/app/features/opportunity-detail/lead-detail.spec.ts` | แก้ | ข้อ "mock off = not connected" → 8 ข้อ live ผ่าน `HttpTestingController` + ข้อ docProxy (28 ข้อ) |
| `src/app/features/opportunity-detail/lead-detail.mock.ts` (+ `.mock.spec.ts`) | แก้ | ให้ตรงกับ servlet จริงมากขึ้น (หัวข้อ 4) — เฟส A ยัง identical |
| `src/app/features/opportunity-detail/lead-detail.engine.ts` · `tools/sync-opportunity-detail.mjs` | แก้ (generated) | ดู 0.2 |
| `tools/compare/pages/opportunity-detail/upstream.mjs` | **ใหม่** | `makeUpstream({VARIANTS, sleep})` → `upstream` (fake REST ของ triplesale-service) + `files` (fake file server `/__files/<host>/<path>`) |
| `tools/compare/pages/opportunity-detail/page.mjs` | แก้ | `upstream`, `files`; `newState` เก็บ `hook`/`live`; `handle` ตอบ `/__files/` และ (ใน `--live`) `metro-geo` เป็นไฟล์ asset เดียวกับที่แอปอ่าน; `normalize` map `http://127.0.0.1:PORT/__files/` → `https://` |
| `tools/compare/pages/opportunity-detail/scenarios.mjs` | แก้ | `opts.variant` → `hook: 'variant=<ชื่อ>'` (fake REST อ่านตัวผู้ใช้จาก token ไม่ได้); `main-save-network-error` + `extra-save-cs-network` เป็น `live: false`; scenario ใหม่ `main-save-gateway-error`, `extra-save-cs-gateway` (หัวข้อ 5) |

ไม่แตะ: ไฟล์ใน do-not-edit list ทั้งหมด; `tools/compare/lib/**` (ไม่ต้องแก้ lib ใด ๆ — hook `ngSession` ที่ phase A เพิ่มใน `runner.mjs` ใช้ต่อ)

---

## 2. servlet ที่พอร์ต / ประกอบ

URL ของหน้าเรียกแบบ Java (`../board/…`); `parsePageUrl` ตัด `../` และ `/triplesale` ให้. REST = ใต้ `/triplesale-service/api/v1`.

### 2.1 พอร์ตใหม่ใน `lead-actions.live.ts` (ทั้ง 10 ตัวอ่านจาก Java ทั้งไฟล์)

ทุกตัว: **ไม่เช็ค role** (Java ไม่เช็ค — service ตัดสิน); method ผิด = JSON 405 (container ตอบหน้า 405 ของตัวเอง); ตอบ HTTP 200 เสมอเมื่อถึง service (หน้าอ่าน `status`/`message` ใน body).

| URL | Java | ทำอะไร (ตรงกับโค้ด Java) | REST |
| --- | --- | --- | --- |
| `POST /board/lead/close` | `LeadCloseServlet` | body JSON (`readLine` ต่อกัน → trim); `leadId = String.valueOf(body.opt("leadId"))` (ไม่มี/`null`/blank (`isBlank`)/`"null"` → 400); `outcome = optString("outcome","")` ต้องเป็น `sold`/`lost` เป๊ะ ไม่งั้น **400 `{"status":400,"message":"missing params: leadId, outcome (sold\|lost)"}`**; body ไป service = `{"outcome":"sold\|lost"}`; ตอบ body ของ service **ทุกสถานะ** (`sendPOST`), ว่าง → `{"status":204,"message":"no content"}` | `POST /leads/{leadId}/close` |
| `POST /board/lead/close-step` | `LeadCloseStepServlet` | `wfsId = optLong("wfsId",0)` ต้อง > 0 (ไม่งั้น 400 `missing params: leadId, wfsId`); `remark = optString("remark","")`; body = `{wfsId, remark}` | `POST /leads/{leadId}/close-step` |
| `POST /board/lead/forward` | `LeadForwardServlet` | `targets = optJSONArray("targets")` (ต้องเป็น array จริง, ไม่ว่าง ไม่งั้น 400 `missing params: leadId, targets`); body = `{targets}` + `currentActivityGroupId` **เฉพาะ > 0** + `remark` **เฉพาะที่ไม่ blank (`String.isBlank`)** | `POST /leads/{leadId}/forward` |
| `POST /board/lead/return` | `LeadReturnServlet` | `currentActivityGroupId`, `returnToActivityGroupId` (`optLong`) ต้อง > 0 ทั้งคู่ (ไม่งั้น 400 `missing params: leadId, currentActivityGroupId, returnToActivityGroupId`); body = `{currentActivityGroupId, returnToActivityGroupId, remark}` | `POST /leads/{leadId}/return` |
| `POST /board/lead/accessor-add?leadId=` | `LeadAccessorAddServlet` | `leadId` จาก query (trim; ไม่มี → 400 `{"status":400,"message":"missing param: leadId"}` — เช็คก่อนอ่าน body); body ว่าง → 400 `{"status":400,"message":"body required"}`; **ส่ง body ต่อทั้งก้อนโดยไม่ตรวจเนื้อหา**; ตอบ body ทุกสถานะ, ว่าง (trim) → `{}` | `POST /leads/{leadId}/accessors` |
| `GET /board/lead/contact-history?leadId=` | `LeadContactHistoryServlet` | ไม่มี leadId → 400 `{"error":"leadId required"}`; `sendGET` (เฉพาะ **200**; อย่างอื่น = "") → ว่าง (trim) → `{}` | `GET /leads/{leadId}/contact-history` |
| `GET /board/lead/forward-groups?leadId=&currentActivityGroupId=` | `LeadForwardGroupsServlet` | ไม่มี leadId → 400 `{"status":400,"message":"missing param: leadId"}`; `currentActivityGroupId` ต่อ URL เฉพาะที่ไม่ว่าง (trim + `URLEncoder`); `sendGET`; ว่าง (`isBlank`) → `{"status":204,"message":"no content"}` (HTTP 200) | `GET /leads/{leadId}/forward-groups[?currentActivityGroupId=]` |
| `GET /board/lead/forward-employees?leadId=&activityGroupId=&currentActivityGroupId=` | `LeadForwardEmployeesServlet` | เหมือนข้างบน; ลำดับ query = `activityGroupId` แล้ว `currentActivityGroupId` (เฉพาะที่ไม่ว่าง) | `GET /leads/{leadId}/forward-employees[?activityGroupId=&currentActivityGroupId=]` |
| `GET /board/lead/return-groups?leadId=&currentActivityGroupId=` | `LeadReturnGroupsServlet` | เหมือน forward-groups | `GET /leads/{leadId}/return-groups[?currentActivityGroupId=]` |
| `GET /board/lead/accessors?leadId=` | `LeadAccessorsSearchServlet` | ส่ง `?all=true` เสมอ (ไม่ส่ง searchText/page/perPage — หน้าไม่มี); ว่าง → stand-in 204 | `GET /leads/{leadId}/accessors?all=true` |

รายละเอียดที่ตั้งใจให้เหมือน Java (มี spec ทุกข้อ): leadId ของ POST ใส่ใน path ตามค่า JSON (ไม่ trim, ตัวเลข/สตริงก็ได้); ของ GET/accessor-add `trim()`; ตัวเลขใน body ส่งเป็น JSON number; body ส่งด้วย `Content-Type: application/json; charset=UTF-8` (เหมือน `Data_API.sendPOST`); `String.isBlank()` นับ whitespace ของ Java (ไม่รวม U+00A0/U+2007/U+202F) ไม่ใช่ `trim()` ของ JS.

### 2.2 ประกอบจากโมดูลที่ merge แล้ว (ไม่เขียนซ้ำ — ลำดับใน `composeRoutes` สำคัญเมื่อ 2 โมดูลตอบ address เดียวกัน)

| โมดูล | URL ที่หน้านี้ใช้ |
| --- | --- |
| `board-master.live` | `/board/employees`, `tags`, `sale-groups`, `sale-persons`, `fiscal-years`, `material-groups`, `materials`, `provinces`, `districts`, `sub-districts`, `metro-geo`, `chat-master-data`, `master/activity-groups`, `master/employees-by-activity-group` |
| `lead-core.live` | `/board/lead` (`LeadDetailServlet`: 403 ถ้าไม่มี `CRM_Lead_View`; error ส่งต่อรูปเดิม; `*NameI18n`), `/board/schedule/add`, `/board/schedule/edit` |
| `leads.live` | `/board/lead-update` (ทุก action), `/board/lead-materials`, `/board/detail-filter-state` (HttpSession → sessionStorage ของแท็บ ต่อผู้ใช้), `/board/contact-activities` (+ `/board/leads` ของ customer search ใน work modal) |
| `prospect.live` | `/board/prospect`, `/board/prospect/save` · `attachments` · `avatar` · `rv-attachments`, `/docproxy` |
| `activities.live` | `/board/activity-groups`, `/board/activity-steps` |

`/board/contact-activities` และ `/board/lead-assign` มี 2 พอร์ต (`opportunitiesRoutes`, `activityRoutes` — servlet เดียวกัน): ใส่ `opportunitiesRoutes` ก่อน `activityRoutes` (พอร์ตของ lead board; พฤติกรรมเท่ากัน — scenario `contact-*`, `tv-*-submit` ของ `--live` ผ่านหมด).
Servlet ของหน้านี้ที่ **ไม่พอร์ต**: ไม่มี — ตรวจรายการ URL ทั้งหมดจาก `lead_detail.xhtml` + include 11 ไฟล์ + `work_modal.xhtml` + `access_pop.xhtml` + `move_step_modal.xhtml` (`grep` ของ `../board/…`, `fetch(`, `window.open`, `docproxy`, `rvreport`) เทียบกับ route ของโมดูลข้างบนแล้ว ไม่มี URL ใดไม่มีเจ้าของ ยกเว้น 2 อย่างที่ไม่ใช่ `fetch` (หัวข้อ 3.3, 3.4)

---

## 3. การตัดสินใจ / สิ่งที่ไม่พอร์ต (ตัดสินแบบระมัดระวัง — ถ้าไม่เห็นด้วยแจ้งได้)

1. **ไม่พอร์ต `catch (Exception)` → HTTP 500 `{"status":500,"message":…}`** ของทั้ง 10 servlet: ภายใน `try` ไม่มีอะไรโยนได้ (`TriplesaleApi.authTokenFresh()` คืน `""` อย่างมาก, `Data_API` กลืนทุก `IOException` แล้วคืน `""`) — ใน TS `RestDeps.call` ไม่ reject. ไม่พอร์ต header `Cache-Control`/`Pragma`/`Expires` (ไม่มี HTTP cache คั่น)
2. **token / 401**: `SessionTokenFilter` ตอบ 401 `{"authRequired":true}` เมื่อไม่มี token — ตอนนี้ interceptor ของแอปจัดการ 401 (session หมด) ให้ทุก call; `authTokenFresh()` ไม่มีอะไรให้พอร์ต
3. **รูป `http(s)://` ใน `<img src>` (`DocProxy`)**: `<img>` ไม่ผ่าน `fetch` จึงตอบจาก live backend ไม่ได้. ตัดสินใจ: **โหลดจาก URL ที่ service ส่งมาตรง ๆ** (`env.docProxy = (url) => url` — เหมือน leads / home / activities). ใช้ได้เมื่อ file server ตอบ `https` (หรือหน้าอยู่บน `http`); ถ้า file server เป็น `http` ล้วนและหน้าอยู่บน `https` เบราว์เซอร์บล็อก (mixed content) — คำถามข้อ 3 หัวข้อ 8. mock ไม่มีรูป `http(s)://` (มีแต่ data URL ของรูปที่เพิ่งอัปโหลด) จึงไม่เปลี่ยนผลของเฟส A
   ส่วน **ดาวน์โหลดเอกสาร** (`ldDownloadDoc` / `ldDownloadSaleDoc`) เป็น `fetch('../docproxy?url=…')` → `prospect.live.ts` ดึงจาก file server ด้วย `fetch` ของเบราว์เซอร์ (ต้องมี CORS ที่ file server — คำถามข้อ 3)
4. **`../rvreport?txno=` (PDF ใบรับเงินใน tab เอกสารงานขาย)**: เปิดด้วย `env.open` ไม่ใช่ `fetch`; ไม่มี servlet และ **ไม่มี REST endpoint** ที่ Bearer เรียกได้ (`RvJasperReportServlet` ยิง JasperReports โดยไม่ใส่ token แล้ว stream) → host ในโหมด live เปิด tab ใหม่ด้วยข้อความของหน้า receipts (`liveReceiptFile` — 400 `ต้องระบุ txno…` / 502 `เชื่อมต่อระบบรายงานไม่ได้…`) ทำใน click เอง (ไม่ให้ popup blocker บล็อก). ไม่มีใครแก้ระบบรายงานให้ — คำถามข้อ 4. ไม่มี scenario ที่คลิกการ์ด RV (phase A ไม่มี) จึงไม่กระทบ harness; มี spec ของ host
5. **`commonBean.uploadAcceptExt`** = `FileServerAccess.uploadAcceptAttr()` = `String.join(",", new TreeSet<>(ALLOWED_EXT))` (คั่นด้วย `,` ไม่มีเว้นวรรค): live ใช้ `uploadAcceptAttr()` จาก `prospect-files.live.ts`. mock เฟส A เดิมใช้ `, ` (ผิดจาก Java) → แก้ (หัวข้อ 4)
6. **ตัวกรองประวัติที่บันทึกไว้ (`DetailFilterStateServlet`, HttpSession)** → `sessionStorage` ของแท็บ key `ts.lead-detail.filter-state:<username>` (ทำไว้ใน `leads.live.ts`) — พฤติกรรมข้ามแท็บ/ข้ามเครื่องหายไป (Java: อยู่ใน session ของเบราว์เซอร์ทุกแท็บ ตายตอน session หมด) คำถามข้อ 6
7. **`ProspectDetailServlet` / `ProspectSaveServlet` กับ DB**: ตรวจแล้ว (ดู `prospects-live.md` §3.1) `mergeDirectDbSunInfo` อยู่หลัง `ENABLE_DB_MERGE_PATCH = false` และ fallback เขียน DB ปิดถาวร → คำถามข้อ 9.1 ของ `lead-detail.md` ปิดแล้ว: ไม่มีอะไรที่เบราว์เซอร์ทำไม่ได้
8. **`/board/metro-geo`**: `deps.asset('assets/data/metro-geo.json')` (ไฟล์เดียวกับที่ servlet อ่านจาก classpath; หน้าใช้เป็น fallback เท่านั้น — master-data live มาก่อน). ใน `--live` Java replica เสิร์ฟไฟล์เดียวกันนี้ (ไม่ใช่ข้อมูลสังเคราะห์ของ mock) และไม่หน่วง เพราะ asset ของแอปไม่ผ่าน servlet
9. **สิ่งที่พอร์ตตามเดิมทั้งที่ดูเป็นบั๊ก** (บอกไว้ให้เจ้าของระบบตัดสิน — ไม่ได้ "แก้"): (ก) service ตอบสถานะผิดพลาดแต่ **body ว่าง** (หรือเชื่อมต่อไม่ได้เลย) → servlet ตอบ 200 + `{"status":204,"message":"no content"}`; หน้า "ปิดกลุ่มขั้นตอน" (`close-step`) ถือ `204` เป็นสำเร็จ ("ปิดแก้ไขกลุ่มขั้นตอนสำเร็จ" ทั้งที่ล้ม) ส่วน "ปิดโอกาสขาย" ถือ `204` เป็นล้มเหลว (alert) — ไม่สม่ำเสมอ;
   (ข) `GET` ของ forward-groups / forward-employees / return-groups / accessors / contact-history ถือเฉพาะ HTTP **200** ว่ามีข้อมูล — ถ้า service ตอบ 201/204 พร้อม body ก็เป็น stand-in; (ค) `sendPOST` ส่ง `leadId` ที่ไม่ trim ลง URL

---

## 4. mock ของหน้า (`lead-detail.mock.ts`) ที่แก้ให้ตรงกับ servlet จริง

Java replica ของ harness ใช้ mock ตัวเดียวกับหน้า Angular ในเฟส A — mock จึงต้อง "ตอบเหมือน servlet" ไม่ใช่แค่ "ตอบรูปเดียวกับ service". mock ไม่ตรงกับ servlet 5 จุด — 4 จุดที่ `--live` จับได้ + 1 จุดที่พบจากการอ่านโค้ด Java (ตรวจจากโค้ดแล้วแก้ที่ mock; เฟส A ไม่กระทบเพราะสองฝั่งใช้ mock เดียวกัน):

| จุด | เดิม (mock) | servlet จริง (ที่ live backend ทำ) | scenario ที่จับได้ |
| --- | --- | --- | --- |
| `MOCK_UPLOAD_ACCEPT` | `.7z, .csv, …` | `uploadAcceptAttr()` = `.7z,.csv,…` (ไม่มีเว้นวรรค) | (ไม่ต่างใน harness เพราะ replica อ่านจาก `initial()` ของ mock เดียวกัน — พบจากการอ่านโค้ด) |
| ชื่อประเทศภาษาไทยของ `chat-master-data?type=countries` | THA `ประเทศไทย`, ASN `ไม่ระบุ` | `translateEnvelopeResultTh`: dictionary `master-data.th.json` ทับ `nameTh` → THA `ไทย`, ASN `อาเซียน` | `overview` + ทุก scenario ที่มี select ประเทศ (เห็นตั้งแต่ scenario แรก) |
| ผลอัปโหลดเอกสารที่ "ตรวจไม่พบไฟล์" | `verifyReason: NOT_FOUND`, ข้อความสั้น | `verifyFailMessage` ของ probe ที่ได้ HTTP 404: `อัปโหลดสำเร็จ แต่ตรวจสอบไฟล์บน O2O ไม่ผ่าน — ไม่พบไฟล์ที่ file server … [HTTP_404]`; ผ่าน = `verifyReason: OK` | `docs-upload-unverified` |
| บันทึกข้อมูลลูกค้าถูกปฏิเสธ (`#500`/`#400`) | HTTP 200 `{ok:false, message:'บันทึกข้อมูลลูกค้าไม่สำเร็จ (mock)'}` | HTTP **502** `{ok:false, via:'api', status, message:'API ตอบ <status> — <body ของ service>'}` (`ProspectSaveServlet.apiErrorMessage`) | `main-save-error`, `extra-save-cs-error` |
| `#net` ของบันทึกข้อมูลลูกค้า | body ไม่ใช่ JSON (HTML 502) | **ไม่มี servlet ตอบแบบนี้** (เขียน JSON เสมอ) — เป็นทางที่หน้าอ่านด้วย `.catch` เท่านั้น | `main-save-network-error`, `extra-save-cs-network` → **`live: false`** (ข้ามใน `--live`); เพิ่ม `main-save-gateway-error`, `extra-save-cs-gateway` (`#gw`: gateway หน้า service ตอบ 502 HTML → ข้อความ `API ตอบ 502 — <html>…`) ที่รันทั้งสองโหมด |

---

## 5. harness `--live` (`node tools/compare/run.mjs lead-detail --live`)

- **ทุก scenario ไม่ใช้ `page.mjs` ซ่อนความต่าง**: ความต่างของสภาพแวดล้อมที่ normalize เพิ่มมีอย่างเดียว — URL ของ file server (`http://127.0.0.1:PORT/__files/` → `https://`: fake REST ต้องให้ที่อยู่ไฟล์ที่เบราว์เซอร์ดึงได้ ต่างจากที่อยู่สังเคราะห์ `https://files.example.test/…` ของ mock)
- **ผู้ใช้ของ scenario**: variant `owner`/`viewer`/`noactivity` เปลี่ยนทั้งสิทธิ์และ `employeeId` ใน session ฝั่ง Angular แต่ Bearer token ของ fake sign-in เป็นของ demo เสมอ → scenario ส่ง `opts.hook = 'variant=<ชื่อ>'` (เป็น `/__reset?hook=` ที่ runner มีอยู่แล้ว) ให้ fake REST รู้ว่าใครเรียก
- **ไม่แก้ `tools/compare/lib/**`** เลย
- **negative control** (พิสูจน์ว่า harness จับพอร์ตผิดได้จริง): แก้ `lead-actions.live.ts` ชั่วคราว 2 จุด — body ของ `close` ส่ง `sold` เสมอ และ `forward-employees` ไม่ส่ง `activityGroupId` → `closelead-confirm-fail-reload`, `fwd-to-dd-open`, `fwd-submit-default-toast` **ต่าง** (33 / 32 / 9 บรรทัด) ทั้งรอบแรกและรอบรันซ้ำ; คืนโค้ดแล้ว (diff กับต้นฉบับว่าง)

---

## 6. สิ่งที่ fake service (`upstream.mjs`) สมมติเกี่ยวกับ REST จริง — **ทั้งหมดมาจากโค้ด Java ไม่ใช่จากข้อมูลจริง**

- `GET /leads/{id}[?activityGroupId=]` → `{status:200, message, result:<lead>}` โดย `<lead>` มี `prospect{…currentCityCode/Name…}`, `prospectInfo`, `currentStep`, `activeSteps`, `appointmentList`, `taskList`, `contactHistoryList`, `materialList`, `tagList`, `accessors`, `saleGroup`, `salePerson`, `employee`, `amount`, `targetYear/Month`, `leadDemand`, `permissions`… (รูปของ mock = สิ่งที่สคริปต์ของหน้าอ่าน); ลีดที่ปฏิเสธ → สถานะนั้นจริง + `{status, message, error:{code, message}}`; ลีด 903 → `result: {}`
- `GET /leads/{id}/activity-groups|activity-steps` → envelope `result:[{id, code, name}]`; `contact-history` → `result:{groups:[{procedureGroupId, steps:[…], sla…}]}`; `forward-groups` → `result:[{id, code, name, orderNo}]`; `forward-employees` → `result:[{id, code, name, attachFile}]`; `return-groups` → `result:[{procedureName, returnToId, returnDestinations:[{activityGroupId, …, returnToId, returnToCode, returnToName}]}]`; `accessors?all=true` → `result:[{id, code, name, type, attachFile}]`
- `POST /leads/{id}/close|close-step|forward|return|accessors` → `{status:200, message:'success'}`; ล้มเหลว = สถานะนั้น + `{status, message}`; `POST /leads/{id}/contact-activities` ต้องไม่มี `leadId` ใน body และ `channel` เป็นป้าย o2o (`Call Out` …) — ไม่ใช่ → 400 (ตัวตรวจว่าพอร์ตแปลงถูก)
- `PATCH /leads/{target-year|target-month|amount|active-status|demand|assign}`, `PUT /leads/{id}/tags` (`{tagIds:[…]}`), `POST|DELETE /leads/materials` → `{status:200,…}`
- `GET /prospects/{id}` → `{status:200, result:<prospect>}` ชื่อ key แบบ **GET** (`senddocAddress` …); `PUT /prospects/{id}` รับ key แบบ DTO (`sendDocAddress` …) — fake แปลงกลับ; key ที่อยู่นอก `MAIN_KEYS` service ทิ้งเงียบ ๆ (พอร์ต `mainBody` ทำให้เท่านั้น); `PUT …/extra-info` `{sunProspectInfo, satisfaction}`
- `GET|POST /prospects/{id}/attachments`, `DELETE …/{no}`: `attachFile` เป็น URL แบบ **absolute** บน file server จำลอง (`/__files/<host>/<path>`); การอัปโหลดตอบ `{status:200, result:{attachFile}}` (ไม่มี `verified` — `verified` มาจาก probe `HEAD` ของ live backend เอง); ไฟล์ชื่อ `unverified` → `HEAD` 404; รูปโปรไฟล์ (`attachFileTypeCode: PROFILE`) → fake ใช้ data URL ของรูปเองเป็น `attachFile` (mock เก็บรูปเป็น data URL; service จริงตอบ URL ของ file server)
- `GET /rv/attachments?prospectId=` → `{status, result:[{description, rv_txno, attachFile}]}`
- `POST /schedules` → HTTP 201 `{status:201, result:{id}}`; `PATCH /schedules/{id}` → 200; ปฏิเสธ = สถานะนั้น + `{status, message, error}`
- master: `GET /master-data/{employees,tags?key=,sale-groups,sale-persons,fiscal-years,material-groups,material-groups/{id}/materials,provinces,districts,sub-districts,countries,business-types,occupations,marketing-channels,communication-types,activity-groups,employees/by-activity-group}` → envelope; **provinces** ปนเมืองต่างประเทศ + รหัสซ้ำที่มี tab นำหน้า + ชื่อไทยที่ไม่มี code (ตาม `BACKEND_BUG_masterdata_address.md`) — live ต้องเหลือเฉพาะแถวสะอาดตามลำดับเดิม; **countries** ให้ชื่อไทยของ service (`ประเทศไทย`, `ไม่ระบุ`) แล้วให้ live backend ทับด้วย dictionary ของแอป
- ผู้เรียก (variant) อ่านจาก `state.hook`, ไม่ใช่จาก token; ทุก request หน่วง `latencyMs` (120 ms) เหมือน replica
- **ไม่ได้ยืนยัน**: ชื่อ field ทั้งหมดข้างบน; ว่า service ตอบ `GET /leads/{id}` ที่ไม่มี `activityGroupId` สำหรับลีดหลายกลุ่มด้วย 400 ตามที่ `Data_API.sendGETWithStatus` คอมเมนต์ไว้; ว่า `close`/`close-step`/`forward`/`return` ตอบ body เป็น `{status:200|201|204,…}` หรือ 204 ไม่มี body (กรณีหลังจะถูกอ่านเป็น stand-in `204` — หัวข้อ 3 ข้อ 9); ว่า `POST /leads/{id}/accessors` รับ `{employeeIds:[…]}` หลายคน; ว่า file server ตอบ CORS สำหรับ `fetch` ข้าม origin (ดาวน์โหลดเอกสาร + probe หลังอัปโหลด) และ `HEAD`

---

## 7. ผลการตรวจ (ตัวเลขทุกตัวมาจากการรันจริงใน workspace นี้ กับโค้ดสุดท้าย)

**สิ่งที่พิสูจน์ได้ = "live backend ทำเหมือน servlet ของ Java บน fixture ที่เขียนจากโค้ด Java". ไม่ใช่ "ถูกต้องกับ API จริง"** (ไม่มี test account — ต้องมี smoke test กับ UAT อีกครั้งก่อนเชื่อว่าใช้ได้จริง)

| รายการ | ผล |
| --- | --- |
| spec `src/app/core/live/opportunity-actions.live.spec.ts` (`fakeRest`) | **36 ข้อผ่าน** — ทุก route ของ 10 servlet: URL/query ที่ยิง (ลำดับ, `URLEncoder`, ค่าว่างไม่ส่ง, trim), body ที่ส่ง (`{outcome}`, `{wfsId,remark}`, `targets` + เงื่อนไข `currentActivityGroupId`/`remark`, `{currentActivityGroupId,returnToActivityGroupId,remark}`, body ดิบของ accessor-add), ทุก 400 และข้อความ, ทุกทางผิดพลาด (ไม่ใช่ 200, 201/204, ไม่มีคำตอบ, body ว่าง/whitespace/NBSP), `isBlank` ของ Java, ไม่มี role gate, 405 |
| spec `src/app/features/opportunity-detail/**` | **3 ไฟล์ 55 ข้อผ่าน** (`lead-detail.mock.spec` 21 · `lead-detail.spec` 28 · `lead-detail.live.spec` 6) — host ในโหมด `mock:false` ผ่าน `HttpTestingController`: วาดลีดจาก REST (ไม่มี `/board/`, ไม่เรียก `fetch` ของ browser), `?activityGroupId=`, ไม่มี `CRM_Lead_View` → 403 ไม่ยิง service, service ปฏิเสธ 403, บันทึกการติดต่อ → `POST /leads/29/contact-activities` (ไม่มี `leadId`, `channel: Manual`), ปิดลีด → `POST /leads/29/close {outcome}` แล้วหน้าเริ่มใหม่, tab ข้อมูลหลักยิง `master-data/*` + `prospects/*`, `../rvreport` เปิด tab ข้อความ, รูป `http(s)://` โหลดจาก URL ตรง ๆ |
| `ng build` (production) | ผ่าน **ไม่มี warning/error/เกิน budget**; chunk lazy `lead-detail` 722.4 kB raw (103.7 kB ส่งจริง; เดิม 724.7 kB) · `lead-detail-mock` 49.4 kB (lazy แยก) · `lead-detail-live` 4.0 kB (lazy แยก — โมดูล `core/live/*` เป็น chunk ร่วมกับ leads/prospects); initial bundle ไม่เปลี่ยน |
| **`compare lead-detail --live`** (Angular ใช้ live backend กับ fake REST `upstream.mjs`) | **545 / 545 เหมือนทุกบรรทัด** — รอบเต็มรอบเดียว `--jobs 2` (3,001 วินาที) ไม่ต้องรันซ้ำตัวไหน; ไม่มี `pageerror`, `ready-timeout`, scenario error; request 4xx/5xx ในรายงานมีแต่ที่ scenario สั่งเอง (`contact-save-error-*`, `*-confirm-error*`, `docs-upload-failed`, `main-save-error`, `wm-*-submit-error*`, `lead-api-*`). 547 scenario ทั้งหมด − 2 ที่ `live: false` (`main-save-network-error`, `extra-save-cs-network`: หัวข้อ 4) |
| รอบแรกของ `--live` (ก่อนแก้ mock) | 540 / 545: ต่าง 5 ตัว — `docs-upload-unverified`, `main-save-error`, `extra-save-cs-error`, `main-save-network-error`, `extra-save-cs-network` (ทั้งหมดคือ mock ไม่ตรง servlet — หัวข้อ 4) + `lead-g12` ต่างในรอบขนานแล้วเหมือนเมื่อรันซ้ำ (หัวข้อ 9). หลังแก้ → 20/20 ของชุดที่เกี่ยวข้อง แล้ว 545/545 ในรอบเต็ม |
| `compare lead-detail` (เฟส A, mock ทั้งสองฝั่ง; หลังแก้ mock + engine + เพิ่ม 2 scenario) | **547 / 547 เหมือนทุกบรรทัด** (3,012 วินาที) |
| generator | `node tools/sync-opportunity-detail.mjs` รันซ้ำแล้ว sha1 ของ `.html/.scss/.engine.ts/-modal.scss` ตรงกัน (idempotent); diff ของ engine จากก่อนแก้มีแค่ 4 จุดของ `docProxy` + คอมเมนต์หัว |
| negative control | ทำลายพอร์ตชั่วคราว (หัวข้อ 5) → 3 จาก 4 scenario **ต่าง** ทั้งรอบแรกและรอบรันซ้ำ แล้วคืนโค้ด (diff ว่าง) |

---

## 8. คำถามถึงเจ้าของ backend / ระบบ

ข้อ 1–6 ของ `docs/integration/lead-detail.md` §9 ที่เกี่ยวกับ BFF: ข้อ 1 (DB) ปิดแล้ว (หัวข้อ 3 ข้อ 7), ข้อ 2 (rvreport) ยังเปิด (ข้อ 4 ข้างล่าง), ข้อ 3 (ตัวกรองประวัติ) ตัดสินแล้วเป็น sessionStorage (ข้อ 6). คำถามที่เกิดจากงานเฟส B:

1. **สถานะ/ body ของ `POST /leads/{id}/close | close-step | forward | return`** เมื่อสำเร็จ: ตอบ 200/201 พร้อม `{status,…}` หรือ 204 ไม่มี body? (servlet เดิมแปลง body ว่างเป็น `{"status":204,"message":"no content"}` — หน้า "ปิดโอกาสขาย" ถือ 204 ว่าล้มเหลว หน้า "ปิดกลุ่มขั้นตอน" ถือว่าสำเร็จ; ถ้าของจริงคือ 204 ไม่มี body การปิดลีดจะขึ้นว่าล้มเหลวทั้งที่สำเร็จ)
2. **รูปแบบ error** ของ `GET /leads/{id}` (`error.message`), ของ `POST …/accessors` (`ไม่สามารถเพิ่มผู้มีสิทธิ์ได้`?) และของ `forward-*`/`return-groups` — หน้าอ่าน `error.message` / `message` ของ body; และ `GET /leads/{id}/forward-groups|forward-employees|return-groups|accessors` ตอบ 200 เสมอเมื่อมีข้อมูลใช่ไหม (servlet ถือเฉพาะ 200)
3. **file server**: ตอบ `https` และมี CORS สำหรับ origin ของแอปไหม (ใช้กับ `fetch` ดาวน์โหลดเอกสาร + `HEAD` ตรวจหลังอัปโหลด และกับ `<img src>` ที่ไม่ต้องใช้ CORS) — หรือจะมี proxy เทียบเท่า `/docproxy` ที่ gateway
4. **PDF ใบรับเงิน (`/rvreport`)**: จะมี endpoint ใน service (`GET /rv/{txno}/form?format=pdf`) หรือชี้ report server ตรง — จนกว่าจะตัดสิน การ์ด RV ในโหมด live เปิด tab ข้อความ "ยังไม่ได้เชื่อมระบบรายงาน"
5. **`PUT /prospects/{id}`** ตัด key นอก DTO ทิ้งเงียบ ๆ จริงไหม และ `GET /prospects/{id}` สะกด key ที่อยู่ส่งเอกสารเป็น `senddoc…` (พิมพ์เล็ก) จริงไหม (พอร์ต `mainBody` อ่านทั้งสองแบบ)
6. **ตัวกรองประวัติของหน้า lead-detail** (`detail-filter-state`): จะมี API เก็บฝั่ง server (ตามผู้ใช้ ไม่ตามแท็บ) หรือใช้ sessionStorage ของแท็บตามนี้ (เหมือนคำถามข้อ 4 ของ `leads-live.md`)

---

## 9. ความเสี่ยง / สิ่งที่ยังไม่ได้ตรวจ

- **ไม่ได้ทดสอบกับ API จริงเลย** — fixture มาจากโค้ด Java; ทุกข้อใน "สิ่งที่ไม่ได้ยืนยัน" ของหัวข้อ 6 ต้องมี smoke test ด้วยบัญชีทดสอบ
- **scenario ที่เคยต่างในรอบขนาน** (`lead-g12`, รอบแรกของรอบเต็มครั้งแรก): select แขวง/ตำบลของลีด 12 กลุ่มมี placeholder เพิ่ม 1 ตัวฝั่ง Angular เพราะสคริปต์ของหน้า (`ld2StripSelectedPlaceholders` ถอด placeholder ที่ +400 ms แล้ว cascade จังหวัด→เขต→แขวง 3 hop × 120 ms ที่จบก่อน/หลังจุดนั้น) — เป็น race ภายในสคริปต์ของหน้าเอง (Java ก็มี) ที่ไวต่อเวลาของ hop REST; รันซ้ำทีละตัวเหมือนทุกบรรทัด (และผ่านในรอบเต็มครั้งสุดท้าย). ไม่แก้ที่ harness
- **`ng test` / `ng build` / Chrome ของ harness บนเครื่องแชร์** อาจตาย out-of-memory — รันซ้ำเมื่อ memory ว่าง (ไม่ใช่ข้อผิดพลาดของโค้ด)
- **ใช้ `fetch` ของเบราว์เซอร์กับ file server** (probe + ดาวน์โหลด): ต้องมี CORS — ถ้าไม่มี การอัปโหลดจะขึ้น "ตรวจสอบไฟล์ไม่ผ่าน [NETWORK]" และดาวน์โหลดไม่ได้
- **ไม่มี scenario** ที่ครอบ: การคลิกการ์ด RV (rvreport), รูป `http(s)://` ใน `<img>` (mock ไม่มี), ลากไฟล์ด้วยเมาส์จริง, เบราว์เซอร์อื่นนอก Chrome headless

## 10. วิธีรันซ้ำ

```bash
node tools/sync-opportunity-detail.mjs                                          # สร้าง .html/.scss/.engine.ts ใหม่ (idempotent)
CI=1 node tools/compare/run.mjs lead-detail --live --jobs 2              # build Angular (development) → Angular ใช้ live backend กับ fake REST (upstream.mjs) → เทียบ (~50 นาที เมื่อเครื่องไม่ว่าง)
node tools/compare/run.mjs lead-detail --live --no-build --filter '^fwd-' --jobs 2
node tools/compare/run.mjs lead-detail --live --show main-save-error --limit 20
CI=1 node tools/compare/run.mjs lead-detail --jobs 2                     # เฟส A (mock ทั้งสองฝั่ง)
CI=1 NG_CLI_ANALYTICS=false node node_modules/@angular/cli/bin/ng.js test --no-watch --include 'src/app/core/live/opportunity-actions.live.spec.ts' --include 'src/app/features/opportunity-detail/**/*.spec.ts'
CI=1 NG_CLI_ANALYTICS=false node node_modules/@angular/cli/bin/ng.js build
```
