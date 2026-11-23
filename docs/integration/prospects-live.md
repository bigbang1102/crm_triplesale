# INTEGRATION — workspace `ws_prospects` · เฟส B (live adapter) ของหน้า Prospects + servlet `prospect*` ที่ทุกหน้าใช้

ผู้ทำ: worker `ws_prospects` (เฟส B) · ขอบเขต: `src/app/core/live/prospect.live.ts` (+ ไฟล์ย่อย `prospect-*.live.ts`) และ live backend ของหน้า `crm/prospects`
(เอกสารเฟส A ของหน้า DrillDown / Prospects อยู่ที่ `docs/integration/prospects.md` — ไม่ได้แก้)

> **ความจริงที่ต้องอ่านก่อน**: ไม่มีบัญชีทดสอบของ UAT (`triplesale-service` ต้องใช้ Bearer ทุก endpoint และไม่มี OpenAPI สาธารณะ) —
> ผลทั้งหมดด้านล่างพิสูจน์ได้เพียง **"live backend ทำเหมือน servlet ของ Java บน fixture ที่เขียนจากโค้ด Java"** (spec + `--live` กับ service จำลอง)
> **ไม่ใช่** "ถูกต้องกับข้อมูลจริง". ทุกข้อสมมติเกี่ยวกับรูป response ของ service จริงอยู่ในหัวข้อ 5. ต้องมี smoke test ด้วยบัญชีทดสอบจริงอีกครั้ง.

---

## 0. สิ่งที่ผู้ประสานงานต้อง merge / ตัดสินใจ (ไฟล์ shared)

### 0.1 `src/app/core/dom/phone-format.service.ts` — master ประเทศของเบอร์โทรในโหมด live (สำคัญ: กระทบทุกหน้าที่แสดงเบอร์)
`PhoneFormat.fetch()` ในโหมดไม่ใช่ mock เรียก `fetch('/triplesale/board/chat-master-data?type=countries')` = **URL ของ BFF ที่ไม่มีอีกแล้ว**
(ใน dev proxy / production ได้ HTML ของ SPA กลับมา → `TsPhone` ยอมแพ้ → ทุกเบอร์แสดงเป็นเลขดิบ ไม่มีรหัสโทร/รูปแบบ). การแก้ที่ต้นทาง (ไม่ได้แก้ในงานนี้เพราะไม่ใช่ไฟล์ของ worker):
```ts
// phone-format.service.ts — ส่วนที่ไม่ใช่ mock
private readonly injector = inject(Injector);
private async fetch(input: string, init?: RequestInit): Promise<Response> {
  if (this.config.value.mock) return (await import('../http/mock-countries')).mockCountriesResponse();
  // live: ไม่มี BFF — route เดียวกับที่ servlet เคยตอบ = board-master.live (GET /master-data/countries + ชื่อไทยจาก dictionary)
  const { boardMasterRoutes } = await import('../live/board-master.live');
  const { restDepsOf } = await import('../live/rest-deps');
  const { composeRoutes } = await import('../live/rest');
  return composeRoutes(boardMasterRoutes(restDepsOf(this.injector)))(input, init);
}
```
**workaround ที่ทำไว้แล้วในหน้านี้** (`prospects-view.ts` → `seedPhoneCountries`, ทำเฉพาะโหมด live): host ถาม `GET /board/chat-master-data?type=countries` ผ่าน live backend แล้วเรียก
`window.TsPhone.setCountries(list)` ก่อนที่หน้าจะวาดเบอร์แรก. เมื่อ shell แก้เองแล้ว โค้ดนี้ยังไม่ผิด (เป็น no-op ทางพฤติกรรม) — ลบทิ้งได้ (พร้อม 2 spec ที่ชื่อ "live mode seeds the phone master…" / "in mock mode the host does not ask…").
หน้าอื่นที่แสดงเบอร์ (leads, lead-detail, activities, schedule, home …) จะเจอปัญหาเดียวกันจนกว่าจะแก้ข้อนี้.

### 0.2 การประกอบ route ในหน้าอื่น
- `prospectRoutes(deps)` **รวม `/docproxy` ไว้แล้ว** (ไฟล์เอกสาร/พรีวิว PDF ของแท็บ "เอกสารประกอบ" ใน lead-detail ใช้ `fetch('../docproxy?url=')`) — หน้า lead-detail / chat / receipt-form ที่ compose `prospectRoutes` ได้ครบโดยไม่ต้องเพิ่ม
- `/board/lead-create` **ไม่อยู่ใน `prospectRoutes`** — เป็น export แยก `opportunityCreateRoutes(deps)` (ไฟล์เดียวกัน): หน้า Prospects ใช้, หน้าฟอร์มลูกค้า (`contracts_master_data`) ควร compose ด้วยเมื่อมี modal เดียวกัน
- **รูปที่ Java ชี้ผ่าน `/docproxy` ใน `<img src>`** (avatar ในตาราง/หน้าอื่น): ไม่มี servlet ให้ proxy → ดูข้อ 3.3 — หน้าอื่นที่ยังสร้าง `../docproxy?url=` เอง (lead-detail engine บรรทัด ~519, ~1450, ~9196; leads/schedule/activities/home ใช้ `env.docProxy` = URL ตรงอยู่แล้ว) จะได้ลิงก์ที่ไม่มีคนตอบ — ต้องตัดสินใจร่วมกัน (host ส่ง `docProxy: (u) => u` แบบ activities/home/schedule)

### 0.3 เอกสารที่ผู้ประสานงานควรอัปเดต (ไม่ได้แก้ — `docs/**`, `CLAUDE.md`, `manual/**` เป็นไฟล์ shared)
- `docs/integration/prospects.md` §0/§5/§6: เปลี่ยน "ยังไม่มี live adapter / `<ts-live-missing />`" เป็น "live แล้ว — ดู INTEGRATION.md นี้"; ตาราง §5 ของ Prospects แต่ละแถวมีผลพอร์ตในหัวข้อ 2 ข้างล่าง; คำถามข้อ 1–2 ในหัวข้อ 6 → ตอบ/ยกต่อที่หัวข้อ 6 ของไฟล์นี้
- `CLAUDE.md` bullet ที่ว่า "เฟส A = โหมด mock เท่านั้น: เมื่อ `mock:false` หน้าขึ้น `<ts-live-missing />`" — หน้า `prospects` พ้นแล้ว
- bullet ที่แนะนำสำหรับ `CLAUDE.md`: *"prospect servlet ทั้งหมดอยู่ที่ `core/live/prospect.live.ts` (`prospectRoutes`, `opportunityCreateRoutes`) + `prospect-{list,payload,files}.live.ts`; หน้า Prospects = `features/prospects/prospects.live.ts`"*

### 0.4 ไม่มีการแก้ไฟล์ shared อื่น
ไม่ได้แก้ `rest*.ts`, `org-json.ts`, `json-java.ts`, `board-master.live.ts`, `lead-core.live.ts`, `tools/lib/**`, `tools/compare/lib/**`, `tools/compare/run.mjs`, `core/{i18n,auth,config,navigation}`, `package.json`, `docs/**`, `CLAUDE.md`, `README.md`, `manual/**`, `public/assets/i18n/**`.
ไม่ต้องเพิ่ม key i18n (ข้อความที่ servlet Java ฝังเป็นภาษาไทยในโค้ด คงไว้เหมือน Java: `'ต้องระบุ prospectId'`, `'ไม่มีสิทธิ์สร้างลูกค้าจากห้องแชท'`, …).

## 1. ไฟล์ที่เพิ่ม / แก้ (ทั้งหมดอยู่ใน workspace)

### เพิ่ม
| ไฟล์ | หน้าที่ |
|---|---|
| `src/app/core/live/prospect.live.ts` | **แทน placeholder** (export `prospectRoutes(deps)` เดิมคงไว้ + พารามิเตอร์ที่ 2 ไม่บังคับ `io` สำหรับ file server) — route ของ servlet ทั้ง 11 ตัว + `opportunityCreateRoutes(deps)` (`POST /board/lead-create`) |
| `src/app/core/live/prospect-list.live.ts` | `ProspectListService` (list, enrich/quick-view, `ContractBean`, `toRowJson`/`toEnrichJson`, `avatarSrc`, `countryNameOf`) |
| `src/app/core/live/prospect-payload.live.ts` | `ProspectApiPayload` (MAIN_KEYS 104 / SATISFACTION_KEYS 34 / EXTRA_INFO_KEYS 488 — **คัดลอกด้วยสคริปต์จาก `.java`** ไม่พิมพ์เอง, `mainBody`, `extraInfoBody`, taxBranch ของนิติบุคคล) + `AttachUrl` (`collapse`, `toRelative`) |
| `src/app/core/live/prospect-files.live.ts` | `FileServerAccess` (นามสกุลที่อัปโหลดได้, `toUri`, `checkTarget`, `probe`) + `DocProxy` + ข้อความ `verifyFailMessage` |
| `src/app/core/live/prospect{,-list,-payload,-files}.live.spec.ts` | spec ของทุก route (ดูหัวข้อ 4) |
| `src/app/features/prospects/prospects.live.ts` | `createLiveProspects(deps, io?)` = `composeRoutes(prospectRoutes, opportunityCreateRoutes, boardMasterRoutes)` + `initial()` (`uploadAcceptExt`) |
| `src/app/features/prospects/prospects.live.spec.ts` | spec ของหน้า (ประกอบ route, ค่า EL, master data ของตัวกรอง/modal) |

> ไฟล์ `prospect-*.live.ts` (นอกจาก `prospect.live.ts`) เป็นไฟล์ใหม่ใน `core/live/` ที่ brief ไม่ได้ระบุชื่อ — ตั้งชื่อนำหน้า `prospect` ตามแบบ `dashboard.live.parse.ts` (แยกส่วน pure ที่ใหญ่ออกจากไฟล์ route) ขอให้ผู้ประสานงานรับเข้าไปด้วย

### แก้
| ไฟล์ | การแก้ |
|---|---|
| `src/app/features/prospects/prospects-view.ts` | `backend()` เลือก mock / live (`restDepsOf(injector)`); `seedPhoneCountries` (ข้อ 0.1) |
| `src/app/features/prospects/prospects.ts` | ลบ `ts-live-missing` / `live` |
| `src/app/features/prospects/prospects.mock.ts` | (1) รหัส+ชื่ออังกฤษของผลิตภัณฑ์ใช้รหัสที่มีใน `masterdata_en.properties` (`LD-WFS-A/B/D`; อีก 2 ตัวไม่มีใน dictionary จึงชื่ออังกฤษ = ชื่อไทย) — เหตุผล: ชื่ออังกฤษของ movement type ในโหมด live มาจาก **dictionary ตาม code** (`MasterDataI18n.translate`) ไม่ใช่จาก service; fixture เดิม (`LD01`…) ไม่มีใน dictionary จึงทำให้ฝั่ง live ต่างจาก mock. (2) ข้อความ "อัปโหลดสำเร็จ แต่ตรวจสอบไฟล์บน O2O ไม่ผ่าน…" + `verifyReason` ของไฟล์ที่ไม่พบ ตรงกับ `ProspectAttachmentsServlet.verifyFailMessage` จริง (`[HTTP_404]`; เดิมเป็นข้อความที่เดา `[NOT_FOUND]`). (3) export เพิ่ม `mockProspect(id)` / `BROKEN_FROM` ให้ service จำลองของ harness ใช้ข้อมูลชุดเดียวกัน. **ทั้งสองฝั่งของ compare ใช้ mock เดียวกัน จึงไม่กระทบผลเฟส A** (ตรวจซ้ำแล้ว — ดูหัวข้อ 4) |
| `src/app/features/prospects/prospects.mock.spec.ts` | ตามการแก้ข้างบน (2 บรรทัด) |
| `src/app/features/prospects/prospects.spec.ts` | แทนเทสต์ "mock off → ts-live-missing" ด้วย 3 เทสต์ (host ถาม live backend / seed master เบอร์โทร / โหมด mock ไม่ถาม) |
| `tools/compare/pages/prospects/page.mjs` | `upstream` (REST service จำลอง) + `files` (file server จำลอง) + `normalize` ของ address file server |
| `tools/compare/pages/prospects/scenarios.mjs` | `live: false` ของ scenario ที่ REST ทำไม่ได้ (ดูหัวข้อ 4) |

---

## 2. servlet ที่พอร์ต / ไม่พอร์ต

| URL | Java | REST ที่เรียก | สถานะ |
|---|---|---|---|
| `GET /board/prospect-list` | `ProspectListServlet` + `ProspectListService` | `GET /prospects?page&perPage[&searchText][&marketingChannelIds…][&currentCityId][&currentDistrictId][&salePersonId][&sortBy]`; `enrich=1` → `GET /prospects/{id}/quick-view` ทีละแถว | พอร์ตครบ (paging/clamp, `sortBy` map, `result.error`+`errorStatus`, `meta` ทุกกรณี, ทุกฟิลด์ของ row, ชื่อประเทศไทย/อังกฤษ) |
| `GET /board/prospect-enrich` | `ProspectEnrichServlet` | `GET /prospects/{id}/quick-view` ทีละ id (≤ 200 id) | พอร์ตครบ; **ไม่พอร์ต cache 120 วินาที** (ข้อ 3.5) |
| `GET /board/prospect?id=` | `ProspectDetailServlet` + `LeadBoardView.fetchProspectByIdJson` | `GET /prospects/{id}` | พอร์ตครบ; DB-merge `sunProspectInfo` **ไม่พอร์ต** (ข้อ 3.1) |
| `GET /board/prospect-leads` | `ProspectLeadsServlet` | `GET /master-data/movement-types/LD`, `GET /leads?viewMode=list&page=1&perPage=100[&movementTypeId][&activityGroupId][&search]` ต่อผลิตภัณฑ์/กลุ่มขั้นตอน | พอร์ตครบ (ลำดับยิง, `String.valueOf(null)`="null" ของกลุ่มที่ไม่มี id, กรอง prospectId, เรียง txDate ใหม่→เก่าแบบ stable) |
| `POST /board/prospect/save` | `ProspectSaveServlet` | `PUT /prospects/{id}`, `PUT /prospects/{id}/extra-info` | พอร์ตครบ (`mainBody`/`extraInfoBody`, ลำดับ+เงื่อนไขของ 2 เส้น, 400/502 และข้อความ); fallback เขียน DB ปิดอยู่ใน Java (`ENABLE_DB_FALLBACK=false`) จึงไม่มีให้พอร์ต |
| `POST /board/prospect/update` | `ProspectUpdateServlet` | — (Java เขียน DB ผ่าน `ProspectBoDao`) | **ไม่พอร์ต**: ตรวจ body/id เหมือน servlet แล้วตอบ `501`; ไม่มีหน้าไหนเรียก (lead_detail รวมเข้า `/board/prospect/save` แล้ว) — ข้อ 3.2 |
| `GET/POST/DELETE /board/prospect/attachments` | `ProspectAttachmentsServlet` | `GET\|POST /prospects/{id}/attachments`, `DELETE …/{docNo}` + probe ไฟล์ | พอร์ตครบ **ยกเว้น** `ensureForProspect` (DB) — ข้อ 3.2; probe ทำจากเบราว์เซอร์ — ข้อ 3.3 |
| `POST /board/prospect/avatar` | `ProspectAvatarServlet` | `POST /prospects/{id}/attachments` (PROFILE) → `GET` + `PUT /prospects/{id}` → `GET` (verify) | พอร์ตครบ **ยกเว้น** `ensureForProspect` (DB) |
| `GET /board/prospect/rv-attachments` | `RvAttachmentsServlet` | `GET /rv/attachments?prospectId=` | พอร์ตครบ |
| `POST /board/chat-prospect-create` | `ChatProspectCreateServlet` | `GET /master-data/activity-groups?movementTypeId=`, `POST /prospects/chat` | พอร์ตครบ (role `Chat_Prospect_Create`, สาขา = สาขาของผู้ใช้ — `deps.user.branchId` แทน `ss_user_detail.employee.branch.id`) |
| `GET /docproxy?url=` | `DocProxy` (+ `FileServerAccess`) | file server ตรงจากเบราว์เซอร์ | พอร์ตเป็น fetch ตรง (ต้อง CORS) — ข้อ 3.3 |
| `POST /board/lead-create` | `LeadCreateServlet` (หน้า Prospects ใช้; ไม่อยู่ในรายการของ brief แต่ page contract ต้องการ) | `POST /leads`, `PATCH /leads/assign` | พอร์ตครบ → `opportunityCreateRoutes` |
| master data ของตัวกรอง/modal | `ChatMasterData`, `Provinces`, `Districts`, `SalePersons`, `Employees`, `MovementTypes`, `MasterActivityGroups`, `MasterEmployeesByActivityGroup` | — | ใช้ `boardMasterRoutes` ที่มีอยู่ (ไม่เขียนซ้ำ) |
| 2 remote command ของแท็บเอกสาร | `ContractView.loadProspectDocs / deleteProspectDocument` | host เรียก `/board/prospect/attachments` (GET/DELETE) ตาม `prospects.docs.ts` เฟส A | ใช้ route ข้างบน — เทียบกับ `ContractView` แล้ว REST/การกรอง PROFILE/การกลับลำดับ เหมือนกัน |

---

## 3. การตัดสินใจ (ตัดสินแบบระมัดระวัง — ถ้าไม่เห็นด้วยแจ้งได้)

### 3.1 `ProspectDetailServlet` กับ DB (`SunProspectInfoBoDao`) — จุดที่ brief ระบุว่ายาก
อ่านโค้ดแล้ว: ส่วนที่เข้า DB (`mergeDirectDbSunInfo` → `SunProspectInfoBoDao.loadByProspectId`) อยู่หลัง `ENABLE_DB_MERGE_PATCH = false` และ **ปิดอยู่ใน Java ตั้งแต่ 24/07** (backend แจ้งว่า API ส่ง `sunProspectInfo` ครบแล้ว รวม `*_sf`).
ดังนั้นพฤติกรรมจริงของ servlet วันนี้ = `GET /prospects/{id}` อย่างเดียว → พอร์ตตรงตามนั้น ไม่เสียอะไรไป. **คำถามถึง backend**: ยืนยันว่า `GET /prospects/{id}` คืน `sunProspectInfo` ครบทุกคอลัมน์ (โดยเฉพาะ `*_sf`) — ถ้าไม่ครบ ต้องการ REST ที่อ่านแถว `ggwsunprospectinfo` (มี/จะมีไหม?).

### 3.2 สิ่งที่ Java ทำกับ DB โดยตรง — ไม่มี REST ให้แทน
- `SunProspectInfoBoDao.ensureForProspect(pid)` (เรียกก่อน `POST /prospects/{id}/attachments` ในทั้ง `ProspectAttachmentsServlet` และ `ProspectAvatarServlet`) = INSERT แถวใน `backoffice.ggwsunprospectinfo` ถ้ายังไม่มี เพราะ "API `/attachments` ตอบ 400 ถ้ายังไม่มีแถว sun". **ข้ามไป**: ลูกค้าที่ยังไม่มีแถวนี้จะอัปโหลดเอกสาร/รูปไม่ได้ (ผู้ใช้เห็นข้อความจาก service เอง) → **คำถามถึง backend** (ข้อ 6.1).
- `POST /board/prospect/update` (`ProspectBoDao.updateProspect`) — ไม่พอร์ต ตอบ 501 (ข้อความบอกให้ใช้ `/board/prospect/save` = `PUT /prospects/{id}`); ไม่มีผู้เรียก.
  (ถ้าผู้ใช้อยากให้ route นี้ทำงานแทนด้วย `PUT /prospects/{id}` — เป็นการเปลี่ยนพฤติกรรม ไม่ได้ทำเอง)

### 3.3 ดาวน์โหลด / รูป: `/docproxy`
Java: servlet ดึงไฟล์จาก file server (ไม่มี CORS / X-Frame) แล้ว stream กลับแบบ same-origin พร้อม allow-list host. ไม่มี Tomcat → ตัดสินใจดังนี้
- **`fetch('/docproxy?url=')` (พรีวิว PDF, ดาวน์โหลดของแท็บเอกสาร)** → live route ทำ `fetch(<url ของไฟล์>)` ด้วย **global fetch** (ไม่ใช่ HttpClient ของแอป: ตัวนั้นแนบ Bearer และอ่านได้แต่ text) แล้วตอบ `Response` ด้วย header เหมือน servlet: pdf/png/jpg/jpeg/gif/webp → `inline` + content-type จากนามสกุล; อย่างอื่น → `application/octet-stream` + `attachment; filename*=UTF-8''…` + `Content-Security-Policy: sandbox`; ผิดพลาด → 400 `MISSING_URL`/`BAD_URL`, 403 `BAD_URL`/`BLOCKED_EXT`, 502 `UPSTREAM_<n>`/`NETWORK` พร้อม header `X-DocProxy-Reason`. **ต้องการ CORS บน file server** (`Access-Control-Allow-Origin` ของแอป, อนุญาต GET/HEAD) ไม่งั้นทุกอย่างจบที่ `NETWORK`.
  allow-list host (`BLOCKED_HOST`) **ไม่พอร์ต** — มันกัน *เซิร์ฟเวอร์* ไม่ให้เป็น open proxy (servlet เป็น permitAll); fetch จากเบราว์เซอร์ไปถึงได้เท่าที่เบราว์เซอร์ของผู้ใช้ไปถึงอยู่แล้ว. เช็ค scheme http(s) + "เป็นไฟล์" (`;`, `..`, นามสกุล 1–10 ตัวอักษร) ยังอยู่.
- **probe หลังอัปโหลด** (`FileServerAccess.probe`: HEAD → GET `Range: bytes=0-0`) → ทำจากเบราว์เซอร์ด้วยวิธีเดียวกัน; ถ้า CORS ปิด ผลคือ `verified:false` + `[NETWORK]` ทุกครั้ง (ผู้ใช้เห็นคำเตือนว่าไฟล์อาจเปิดไม่ได้ — จริงด้วย เพราะการดาวน์โหลดก็จะล้มเหมือนกัน).
- **`<img src>` ที่ Java ชี้ `/docproxy?url=…`** (avatar ของแถวในตาราง): `<img>` ไม่ผ่าน `fetch` จึง intercept ไม่ได้ → `avatarSrc` ของ live คืน **URL ของไฟล์ตรง ๆ** (ที่ `collapse` แล้ว) — ตรงกับที่ host อื่นทำ (`docProxy: (url) => url`). รูปจะโหลดได้ถ้า file server เป็น https (mixed-content: หน้า https โหลดรูป http ไม่ได้ — ปัญหาที่ docproxy เคยแก้) → **คำถามถึงผู้ดูแล infra** (ข้อ 6.3). ถ้าโหลดไม่ได้ engine ใช้รูป default (`onerror`).
- ที่อยู่ไฟล์ที่เป็น path สัมพัทธ์ (`prospect/123/a.pdf`) Java ตอบ `403 BAD_URL` — live ทำเหมือนกัน (service จริงตอบเป็น URL เต็ม; mock ของเราใช้ path สัมพัทธ์เพื่อไม่ออกเครือข่าย — ในการ compare `--live` service จำลองตอบเป็น URL เต็มของ file server จำลอง และ `normalize` ตัด host ของ harness ออก).

### 3.4 อัปโหลด = JSON base64 ไม่ใช่ multipart
Java ส่ง `{fileContentBase64, fileName, attachFileTypeCode, description}` เป็น JSON ให้ service (ไม่ใช่ multipart) และหน้าเว็บส่ง base64 ให้ servlet — live ทำเหมือนเดิมทุกประการ ผ่าน `deps.call` (HttpClient + Bearer). ตรวจนามสกุล (400 + รายการที่รองรับ) **ก่อน** ส่งไฟล์.

### 3.5 cache ที่ไม่พอร์ต
`ProspectListService.DETAIL_CACHE` (120 วินาที, ≤ 500 รายการ, key `id_lang`) เป็น cache เพื่อความเร็ว → ไม่พอร์ต (เบราว์เซอร์ถามใหม่ทุกครั้ง ข้อมูลที่แก้แล้วจึงเห็นทันที; `invalidateDetail` ที่ `ContractView` เรียกหลังบันทึกจึงไม่จำเป็น).
**ผลที่เห็นได้ข้อเดียว**: Java cache enrich ที่ *ล้มเหลว* (รายละเอียดว่าง) ไว้ 2 นาที; live ถามซ้ำ.

### 3.6 enrich ทีละเส้น + timeout
`contracts.list.enrich.threads=1` (backend ขอให้ไม่ยิงขนาน) → `ENRICH_THREADS = 1` ใน `prospect-list.live.ts`: `quick-view` ถูกยิงทีละ id ตามลำดับแถว (spec ตรวจว่าไม่มี 2 เส้นซ้อนกัน). ผลคือหน้าตาราง 20 แถว = 20 เส้นต่อเนื่อง (Java ก็เป็นอย่างนั้น แต่อยู่ฝั่ง server). อยากเร็วขึ้น: เปลี่ยนค่าคงที่ หรือให้ backend ทำ endpoint รวม (ข้อ 6.2).
timeout ของ GET ใน `ProspectListService` (15 วินาที) พอร์ตด้วย `Promise.race` (ไม่ตอบ/ช้า = status 0 = เหมือน Java). timeout อื่น ๆ (180–240 วินาทีของ `Data_API`) ใช้ของเบราว์เซอร์.

### 3.7 ข้อความ exception ของ org.json
servlet ที่ล้มด้วย exception ตอบ 500 พร้อม `e.getMessage()` ของ org.json (เช่น body ไม่ใช่ JSON). ข้อความจริงขึ้นกับเวอร์ชันของ `org.primefaces.shaded.json` ที่ไม่รู้ → ใช้ข้อความโดยประมาณ (`A JSONObject text must begin with '{'`) — หน้าเว็บไม่เคยส่ง body แบบนั้น. สถานะ/โครง JSON ของ error ตรง Java.

### 3.8 ความต่างเล็ก ๆ ที่ตั้งใจ
- `id` ใน `GET /board/prospect?id=` ถูก `encodeURIComponent` ก่อนต่อ path (Java ต่อ string ดิบ — id ที่มี `/`, `?` ทำให้ path/query เพี้ยนได้) — id ตัวเลขไม่ต่าง.
- `HttpServlet` ของ Java ตอบ 405 เป็นหน้า HTML ของ container; live ตอบ `405 {"status":405,"message":"Method Not Allowed"}` (เหมือน `lead-core.live.ts`).
- `ApiLog.record(...)` ของ servlet = API log ของ interceptor (top bar) — ไม่ต้องพอร์ต.

## 4. ผลการตรวจ

### 4.1 spec (`ng test`, เฉพาะไฟล์ของงานนี้ — 7 ไฟล์ / **195 เทสต์ ผ่านทั้งหมด**)
| ไฟล์ | เทสต์ |
|---|---|
| `core/live/prospect-payload.live.spec.ts` | `AttachUrl`, `ProspectApiPayload` (mainBody / extraInfoBody / key lists / taxBranch) |
| `core/live/prospect-files.live.spec.ts` | นามสกุลที่อัปโหลดได้, `encodeIllegalChars`, `toUri`, `checkTarget`, `probe` (HEAD→GET Range, NETWORK, BAD_URL…), `verifyFailMessage` ทุก reason, `/docproxy` ทุก header/สถานะ |
| `core/live/prospect-list.live.spec.ts` | `/board/prospect-list` (query ทุก param+ลำดับ+encode, clamp, sortBy, row ทุก field, ประเทศ th/en, meta ทุกกรณี, ทุกทาง error → `result.error`/`errorStatus`, enrich=1: ทีละเส้น/ลำดับ/overwrite/เฉพาะที่ว่าง/ล้มเหลว), `/board/prospect-enrich` |
| `core/live/prospect.live.spec.ts` | `/board/prospect`, `/board/prospect-leads`, `/board/prospect/save`, `/update` (501), `/attachments` (GET/POST/DELETE ทุก error + probe), `/avatar`, `/rv-attachments`, `/board/chat-prospect-create`, `/board/lead-create`, `/docproxy`, 405, route ที่ไม่ใช่ของเรา |
| `features/prospects/prospects.live.spec.ts` | ประกอบ route ของหน้า, `uploadAcceptExt`, รายการนามสกุลของ core = ของหน้า |
| `features/prospects/prospects.spec.ts` (host) | + host เลือก live, seed master เบอร์โทร (live), โหมด mock ไม่ถาม |
| `features/prospects/prospects.mock.spec.ts` | ปรับ 2 บรรทัดตามข้อ 1 |

คำสั่ง: `CI=1 node node_modules/@angular/cli/bin/ng.js test --no-watch --include 'src/app/core/live/prospect*.spec.ts' --include 'src/app/features/prospects/**/*.spec.ts'`

### 4.2 harness `--live` — หน้า `prospects`: **252 / 252 identical** (255 scenario − 3 ที่ `live: false`)
`node tools/compare/run.mjs prospects --live --no-build --jobs 4` → "all 252 scenario(s) identical" (742 วินาที). `upload-unverified` ต่างในรอบแรกของรอบสุดท้าย (timing ภายใต้โหลดของเครื่อง: preview PDF ที่มาช้ากว่า 1.6 วินาทีของ scenario) แล้ว identical เมื่อรันซ้ำเดี่ยวตามขั้นตอน confirm ของ harness และเมื่อรันแยก — มี scenario ลักษณะนี้ที่ flaky ตอนเครื่องไม่ว่างเพียงไม่กี่ตัว (`upload-*`, `lead-*`) และผ่านทุกครั้งเมื่อรันเดี่ยว. (ก่อนหน้านั้นรันทั้งชุดแบ่ง 3 ช่วง รวม 255 ทั้งหมด identical หรือเป็น `live:false`; ช่วงที่รัน 2 ชุดพร้อมกันมี timeout ของ puppeteer — หายเมื่อรันซ้ำเดี่ยว.)

**ไม่ได้ซ่อนความต่างด้วยการแก้ harness** — สิ่งที่แก้ในฝั่ง harness/fixture ทั้งหมดและเหตุผล:
| รายการ | เหตุผล |
|---|---|
| `live: false` — `list-error-0` | "service ไม่ตอบเลย" (`errorStatus 0`) เล่นไม่ได้: แอปคุย service จำลองผ่าน proxy ของ harness (`lib/servers.mjs`) และ proxy ตอบ 502 เมื่อ upstream ตัดการเชื่อมต่อ. กรณี status 0 ครอบคลุมใน `prospect-list.live.spec.ts` |
| `live: false` — `list-enrich-fails`, `list-enrich-fails-open-panel` | hook ทำให้ **request enrich ทั้งก้อน** ล้ม (HTTP 500 = servlet โยน exception). ด้วย REST ไม่มีอะไรทำให้ servlet โยน: quick-view ที่ล้ม = รายละเอียดว่างใน HTTP 200 (`enrichFromDetail` return เฉย ๆ) → หน้าตั้ง `data-enriched=1` และรายการแนะนำไม่มีรหัส. พฤติกรรมจริงนี้ระบุใน spec ("a detail that fails … leaves the row as the list gave it", "a failed detail is an EMPTY detail, not an error"). (mock เฟส A ตอบ 500 ทั้งก้อน — เป็นสมมติของเฟส A ที่ไม่ตรง Java) |
| `normalize`: ตัด `http://127.0.0.1:<port>/__files/` | service จริงตอบ `attachFile` เป็น URL เต็ม (mock ใช้ path สัมพัทธ์เพื่อไม่ออกเครือข่าย); host ของ harness สุ่มและไม่ใช่สิ่งที่หน้าแสดง |
| file server จำลอง (`page.files`): `<img>` (`Sec-Fetch-Dest: image`) ตอบ 404; ไฟล์ `*missing*` 404; ไฟล์ `*UNVERIFIED*` HEAD 404 แต่ GET ได้ | ให้เหมือนสภาพแวดล้อมเดิมของ replica Java (path สัมพัทธ์ที่ไม่มีไฟล์ = 404 ตอนโหลดรูปตรง; `/docproxy` ของ mock เสิร์ฟไฟล์ UNVERIFIED ได้ แต่ถูกนับเป็น "ตรวจไม่ผ่าน") |
| mock: รหัสผลิตภัณฑ์ที่มีใน dictionary; ข้อความ unverified ตาม Java | ข้อ 1 ด้านบน — แก้ **ฝั่ง fixture ให้ตรง Java** (ชื่ออังกฤษมาจาก dictionary ตาม code; ข้อความจาก `verifyFailMessage`) ไม่ใช่แก้ฝั่ง live |
| `quick-view` ของ service จำลองหน่วง ≤ 8 ms ต่อเส้น (ส่วน list/อื่น ๆ หน่วง 150 ms เท่า replica) | หน้าตารางยิง quick-view 20 เส้นต่อเนื่อง; ถ้าหน่วงเส้นละ 150 ms scenario ที่รอ 0.9–1.2 วินาทีจะเห็นสถานะกลางทาง ซึ่งเป็นเรื่องความเร็วของ fake ไม่ใช่ความต่างของหน้า |

สิ่งที่ `--live` พิสูจน์: mapping route BFF → การเรียก REST (path/param/ลำดับ), การแปลง envelope → row ของหน้า, การรวม list+quick-view, ชื่อประเทศ, ข้อความ error ของ list/อัปโหลด/สร้าง Lead/มอบหมายผู้รับผิดชอบ, ขั้นตอนอัปโหลด→ตรวจไฟล์→รีโหลดรายการ, ดาวน์โหลด/พรีวิวผ่าน file server จำลอง, master data ของตัวกรองและ modal, TH/EN.
**ไม่ได้พิสูจน์**: ว่า service จริงตอบรูปเดียวกับ fixture (หัวข้อ 5); route ที่หน้า Prospects ไม่ได้เรียก (`/board/prospect`, `/board/prospect-leads`, `/board/prospect/save`, `/update`, `/avatar`, `/rv-attachments`, `/board/chat-prospect-create`) — 7 route นี้พิสูจน์ด้วย spec เท่านั้น (ใช้โดย lead-detail / chat / receipt-form ซึ่งต้องเรียก `--live` ของหน้านั้นเองหลัง merge).

### 4.3 เฟส A ยัง identical หลังแก้ mock
`node tools/compare/run.mjs prospects --no-build --jobs 3 --filter 'lead|upload-unverified|overview$|^en-overview$'` → **59 / 59 identical** (scenario ที่แตะผลิตภัณฑ์/ข้อความ unverified ครบ). ไม่ได้รันโหมด mock ทั้ง 255 ตัวซ้ำ (ส่วนที่แก้ใน mock มีเฉพาะ 2 จุดข้างต้น และทั้งสองฝั่งอ่าน mock ตัวเดียวกัน).

### 4.4 build
`node node_modules/@angular/cli/bin/ng.js build` (production) ผ่าน ไม่มี warning / budget error; chunk `prospects` 101.76 kB raw (20.80 kB transfer) — live backend เป็น lazy chunk แยก (`import('./prospects.live')`), ไม่เข้า bundle ของโหมด mock.
`tsc -p tsconfig.app.json --noEmit` ผ่าน.

### 4.5 scenario ที่พึ่งโมดูลของ worker อื่น
**ไม่มี** — หน้า Prospects ใช้เฉพาะ `prospectRoutes`, `opportunityCreateRoutes` (ของเรา) และ `boardMasterRoutes` (มีอยู่แล้ว); ไม่ได้ compose `opportunitiesRoutes` / placeholder อื่น.

### 4.6 สิ่งที่ยังเหลือ / ไม่ได้ทำ
- ตรวจกับ service จริง (ไม่มีบัญชีทดสอบ) — smoke test: เปิดหน้า, ค้นหา, เลื่อนหลายหน้า, อัปโหลด/ลบ/พรีวิว/ดาวน์โหลดเอกสาร, สร้าง Lead, ตัวกรองทั้ง 4 + `ensureForProspect` (ข้อ 6.1) + CORS ของ file server (ข้อ 6.3)
- `/board/prospect/update` ไม่พอร์ต (ข้อ 3.2); `ensureForProspect` ไม่พอร์ต
- แก้ `PhoneFormat` ที่ shell (ข้อ 0.1)
- `--live` ของหน้า lead-detail / chat / receipt-form เพื่อพิสูจน์ route ที่ spec เท่านั้นครอบคลุม

---

## 5. สิ่งที่ service จำลอง (`page.upstream`) สมมติเกี่ยวกับ REST จริง — ตรวจกับของจริงไม่ได้

fixture มาจาก **โค้ด Java** (ชื่อ field ที่ Java อ่าน) ไม่ใช่จากข้อมูลจริง. ถ้า service จริงต่างจากนี้ live adapter จะพังเฉพาะจุดนั้น.

| endpoint | สมมติ |
|---|---|
| `GET /prospects` | envelope `{status, message, result:[row…], meta:{page, perPage, total, totalPages}}` (Java อ่าน `result` หรือ `results`; `meta` ไม่มีก็ได้). query: `page, perPage, searchText, marketingChannelIds` (ซ้ำ key ต่อ id), `currentCityId, currentDistrictId, salePersonId, sortBy` ∈ `contactDate_desc/asc, name_asc/desc` (**ค่า sortBy เป็นค่าที่ Java เดาเอง** — apidocs ไม่ระบุ; override ได้ใน `config.properties` ของ Java ซึ่งไม่มีค่านี้ตั้งไว้) |
| แถวของ list | `id, name, contactDate (yyyy-MM-dd), marketingChanelName (สะกดตามนี้), customerTel, phoneCountryCode, countryCode, attachFile, currentAddress, currentSubDistrictName, currentDistrictName, currentCityName, currentPostId, currentCountryName (อังกฤษ), currentCountryCode, salePersonCode/salePersonName (แบน; หรือ salePerson{code,name}), saleGroupCode/saleGroupName (หรือ saleGroup{…}), employeeCode/employeeName (= ผู้บันทึก)`. **ไม่มี** `code`, `sex`, อีเมล, โซเชียล ใน list (fake ใส่ให้เฉพาะ hook `X-FULL`). Instagram สะกด `prospectInstragram` ใน list, `prospectInstagram` ใน quick-view |
| `GET /prospects/{id}/quick-view` | `{status, result:{code, sex ("M"/"F"/"1"/"2"), customerType ("person"/"juristic"/"company"), prospectEmail, prospectLine, prospectFacebook, prospectTwitter, prospectInstagram, convenient, currentAddress…currentCountryCode, salePersonCode/Name, saleGroupCode/Name, employeeCode/Name}}` — **fake ใส่ `currentSubDistrictName`, `currentPostId`, `currentCountryCode` ด้วย** (เพื่อให้หน้าเห็นที่อยู่เต็ม/ชื่อประเทศไทยเหมือน mock เฟส A) ทั้งที่คอมเมนต์ใน `ProspectListService.enrichFromDetail` บอกว่า quick-view จริง "ไม่มีแขวง/ตำบล/รหัสประเทศ" และไม่มี `contactBackName` (ช่อง "ช่องทางติดต่อ" จึงว่าง) |
| `GET /prospects/{id}` | `{status:200, result:{…prospect…}}` ส่งต่อเป็นข้อความ `result` |
| `…/attachments` | GET: `result:[{detailOrderNo, attachFile, description, attachFileTypeCode}]` เรียงเก่า→ใหม่; `attachFile` เป็น **URL เต็ม** (`http://host/prospect/<epoch>/<ชื่อไฟล์>`, ไม่ encode); POST: `result.attachFile`; ข้อผิดพลาด `{message, error:{message}}`; DELETE: 2xx (body ว่างได้) |
| `POST /leads`, `PATCH /leads/assign` | `{status:201, message, result:{id, txNo}}` / `{status:200}`; สำเร็จ = `status` ∈ 200/201/204 ใน body (ไม่ดู HTTP status) |
| master data | envelope `{status:200, result:[…]}` ตามที่ `board-master.live.ts` อ่าน (ไม่ได้ทดสอบซ้ำ — งานของ worker อื่น) |
| file server | `HEAD`/`GET` ตอบ 200 (ไฟล์ที่เก็บแล้ว) หรือ 404; ตอบ CORS ได้ |

---

## 6. คำถามถึงเจ้าของ backend / infra

1. **`ggwsunprospectinfo` ก่อน `POST /prospects/{id}/attachments`** — Java ต้อง INSERT แถวนี้ผ่าน DB ก่อน (`ensureForProspect`) เพราะ "`/attachments` ตอบ 400 ถ้ายังไม่มีแถว sun". service ยังต้องการเงื่อนไขนี้ไหม? มี REST ที่สร้างแถว (หรือ service สร้างเองตอน POST) หรือจะมีไหม? ไม่งั้นลูกค้าที่ยังไม่มีแถวจะอัปโหลดเอกสาร/รูปโปรไฟล์ไม่ได้.
2. **endpoint รวม `quick-view`** — หน้าตาราง 20 แถว = `GET /prospects/{id}/quick-view` 20 เส้นต่อเนื่อง (ทีมหลังบ้านขอให้ไม่ขนาน). ขอ `GET /prospects/quick-view?ids=1,2,3` (หรือใส่ `code`/`sex`/โซเชียลลง list) ได้ไหม? ตอนนี้ปรับได้ที่ `ENRICH_THREADS` (`prospect-list.live.ts`).
3. **file server (O2O)**: (ก) ตอบ CORS สำหรับ origin ของแอป (`GET`, `HEAD`, header `Range`) ได้ไหม — ไม่งั้นพรีวิว PDF / ดาวน์โหลด / การตรวจไฟล์หลังอัปโหลดล้มเหลวทั้งหมด; (ข) เป็น https ไหม — ไม่งั้นรูป avatar (`<img src>`) โดน mixed-content บล็อก; (ค) หรือจะมี route ผ่าน gateway (same-origin) แทน `/docproxy`? ค่า `attachFile` ที่ service ตอบเป็น URL เต็มเสมอหรือ path สัมพัทธ์?
4. **`GET /prospects/{id}`** ส่ง `sunProspectInfo` ครบทุกคอลัมน์ (รวม `*_sf`) จริงไหม — ถ้าไม่ครบ Java เคยมี DB-merge (ปิดอยู่); ต้องการ REST ที่อ่านแถว `ggwsunprospectinfo`?
5. **`POST /board/prospect/update`** (`ProspectBoDao.updateProspect` เขียน `ggwprospect` ตรง) — ยืนยันได้ไหมว่าตัดทิ้งได้ (ไม่มีหน้าไหนเรียกแล้ว; การแก้ข้อมูลหลักคือ `PUT /prospects/{id}` ผ่าน `/board/prospect/save`).
6. ค่า `sortBy` ของ `GET /prospects` (`contactDate_desc/asc`, `name_asc/desc`) เป็นค่าที่ Java เดา — ยืนยัน; และ `meta.totalPages`/`total` ตอบเสมอไหม (ถ้าไม่ตอบ หน้าจะเดาจาก "ได้ครบ perPage = มีต่อ").
7. `quick-view` มี `prospectInstagram` (สะกดถูก) และ field ของผู้บันทึก (`employeeCode/employeeName`), พนักงานขาย/ทีม (`salePerson*`, `saleGroup*`) จริงตามคอมเมนต์ใน Java (ที่ยืนยันจาก Postman) ไหม.
8. ข้อความไทยฝังตายตัวใน servlet (เช่น `'ต้องระบุ prospectId'`, `'ไม่มีสิทธิ์สร้างลูกค้าจากห้องแชท'`, ข้อความ `verifyFailMessage`) — คงตาม Java; จะย้ายเป็น key i18n ไหม (ต้องแก้ Java+Angular พร้อมกัน).

---

## 7. วิธีรันซ้ำ
```
CI=1 node node_modules/@angular/cli/bin/ng.js test --no-watch --include 'src/app/core/live/prospect*.spec.ts' --include 'src/app/features/prospects/**/*.spec.ts'
node tools/compare/run.mjs prospects --live --jobs 3            # live (Angular เรียก REST จำลอง) — ใช้เวลานาน; รองรับ --filter / --no-build
node tools/compare/run.mjs prospects --jobs 3                   # โหมด mock เดิม (เฟส A) ต้องยัง identical
node node_modules/@angular/cli/bin/ng.js build                  # production build
```
