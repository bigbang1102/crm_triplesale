# Survey 3 — LEAD / ACTIVITY / SCHEDULE / DASHBOARD page inventory

NOTE FOR CALLER: I run in a read-only role with no file-write tool, so I could NOT create `C:\Users\yot\AppData\Local\Temp\claude\F--Angular\622e1fae-3253-4f26-a4c0-2f96fdf2c1c9\scratchpad\survey_3_pages_lead.md`. The complete Markdown report is below; please save everything from "# FULL REPORT" down to that path.

## SHORT SUMMARY (<=300 words)
- **Live pages in this group (10 screens):** login `web/index.xhtml`; CRM home `pages/index.xhtml` (uses `resources/js/dashboard.js`); lead board/list `lead.xhtml`; lead detail `lead_detail.xhtml` (+8 modals); `activity.xhtml`; `schedule.xhtml`; BI dashboard `dashboard.xhtml` → `dashboard_company.xhtml` (+`dashboard_calendar_frame`, `dashboard_kpi_frame` iframes); `drilldown.xhtml`; `report.xhtml`. Shared: `work_modal`, `move_step_modal`, `access_pop`, `components/lead/filter_modal`.
- **Architecture fact that drives the plan:** every live page is a thin JSF shell; all behaviour is inline JS calling same-origin Java servlets `/board/*`, `/dashboard/*`, `/dashboardapi`, `/goldapi/*`, `/login_proxy`, `/report-pdf`, `/docproxy`. Those servlets proxy `/triplesale-service/api/v1/...` with a Bearer token, check roles, keep filter state in HttpSession, and (activity list/detail, schedule, location-name localisation) contain real aggregation logic. The Angular team must decide: keep this BFF or port it.
- **Navigation/permissions:** top-tab groups come from `navbar_menu` + `act` URL params; page guards are `FEATURE_CRM_*` keys, in-page actions use `CRM_*` keys with `_Sup` supervisor bypass plus per-lead owner checks (`ss_employee_id`).
- **Proposed Angular:** features `home`, `lead` (board/list + detail), `activity`, `schedule`, `dashboard` (10 lazy tabs), `drilldown`, `report`, `auth`; ~25 shared components (stepbar, interest badge, step-group tag, tag pill, avatar, phone, filter-modal shell, product/group dropdowns, infinite-scroll + drag-scroll directives, work modal, move-step modal, access popover, etc.).
- **Top risks:** BFF logic, kanban DnD + per-column infinite scroll, `usesWorkflowStep` branching everywhere, leads with several active groups (`activityGroupId` must travel in URL), 3-layer permissions, 7.5k-line BI dashboard (ECharts ×~20, widget-edit mode, iframes), 7.9k-line lead_detail, schedule 4 views + 2 DnD/infinite lists, i18n/theme/font-scale/global select-enhancer.
- **Skip (dead):** all `*_bk*`, `*.bak*`, `*-tae`, `lead_step`, `lead_detail_step`, `lead_detail_sub1/2-/3`, `activity_step`, `contact_history`, `pages/index_1`, `index_bk*`, `drilldown_tcs01`, `dashboard_sun`, `dashboard_sun-xxx`, `web/index_1`, `web/dashboard/index`, `web/dashboard` (Pandora demo). Ask PO: `dashboard_gold` (branch switch commented out), `tk_dashboard` (menu hidden, mock data).

---

# FULL REPORT

Conventions: sizes in bytes (KB). `BFF` = same-origin Java servlet. "Thai labels" are decoded from `src/java/messages_th.properties`. Root = `D:\Dev-Project\CRM_PROJECT\triple_sale_main\web`. CLAUDE.md concepts (stepbar state rules, STEPPER_PALETTE, INT_COLOR_MAP, TAG_PALETTE) are referenced as **[C1]** step status, **[C2]** stepper palette, **[C3]** interest colours, **[C6]** tag palette — not repeated.

---

## 0. App shell and cross-cutting facts (apply to every page below)

### 0.1 Template / shell
- Every `pages/*.xhtml` uses `template="/WEB-INF/pages/template.xhtml"` (182 KB; PrimeFaces Pandora layout) and defines `title`, `viewname` (breadcrumb `CRM > …`), `head`, `content`. `WEB-INF/pages/{groupedMenu,topbar,menu,config,rightpanel,breadcrumb,footer}.xhtml` are the chrome. (`WEB-INF/template.xhtml`, `WEB-INF/menu.xhtml`, `ungroupedMenu` are the stock Pandora demo — ignore.)
- Left rail `groupedMenu.xhtml` (68 px, icon + label), visibility by `commonBean.hasFeature(...)`: logo → `dashboard.face` (`FEATURE_CRM_Dashboard`; logo stays but not clickable without key); "แต้มสะสม" (hidden, `rendered=false`); "คำร้อง" (hidden); **CRM** → `index.face` (`MODULE_CRM`); **งานขาย** → `sales_doc_rv_list.xhtml` (`FEATURE_CRM_Document`); "คลังสินค้า"/"การตลาด" hidden; **รายงาน** → `report.xhtml` (`FEATURE_CRM_Report`); AI HUB (`commonBean.aiHubEnabled`); chat button (`MODULE_CHATBOX`).
- Top tab bar `topbar.xhtml`, grouped by `navbar_menu` param (kept in session `ss_param_navbar`) — `CommonBean.viewTopbarPage`:
  - `navbar_menu_home` (CRM): navbar-1 **แดชบอร์ด** → `index.face` (`FEATURE_CRM_Dashboard`), navbar-2 **ลูกค้าเป้าหมาย** → `contracts.face` (`FEATURE_CRM_Prospect`), navbar-3 **โอกาสขาย** → `lead.face` (`FEATURE_CRM_Lead`), navbar-4 **การติดต่อ** → `activity.face` (`FEATURE_CRM_ContactActivity`), navbar-5 **ปฏิทินงาน** → `schedule.face` (`FEATURE_CRM_Calendar`), navbar-7 **เอกสารประกอบ** dropdown (sales_document 1–7 + nested "DrillDown" 11 codes T-CS-01…T-FI-01, guarded by `CRM_Dashboard_View`).
  - `navbar_menu_sun` (logo) shows only the dashboard tab; `navbar_menu_point`/`ticket`/`chat`/`ai`/`aihub`/`sale`/`report` other groups. Legacy URL params `pid, page_id, act (=active tab), acts, sub_id, action_type` drive `menu_active`; in Angular these become route data.
- Global behaviours loaded by the template: SweetAlert (`swal`) popups; `crm_error_popup.js` (`crmShowError`, `crmErrText`, `crmLeadFetchFailed`); **auth guard** — any fetch answered `401 {"authRequired":true}` shows a modal then clears `sessionStorage ts_login/ts_username` and goes to login (`SessionTokenFilter`); `ui_pref.js` `TS_PREF` (localStorage + 1-year cookie `tsp_*`) for theme `app-theme` (dark = `body[data-theme=dark]`), font scale `ses-fontsize`/`ses-fontnumber` (CSS var `--fs-adj`, used inside `calc(Npx + var(--fs-adj))` for **every** font size, "A/A/A" buttons in topbar); `input_guard.js` (special-char blocker); `no_autofill.js`; `open_down_select.js` (**global**: auto-wraps every native `<select>` into a custom drop-down that always opens downward, with search, plus `odsProspectSuggest` autocomplete → `GET /board/prospect-list`); `drag_scroll.js` (mouse-drag horizontal scroll of tables, `data-targets`); `support_js.js`.
- i18n: `#{commonBean.msg['label.x.y']}` from `messages_th/en/jp.properties` (hundreds of keys); several pages bridge EL→JS (`window.TS_I18N`, `DBSUN_I18N`, `DD_I18N`, `ODS_I18N`). Backend servlet `LeadsBoardServlet` also localises province/district/country names by UI language.
- Server-side page guard: `PageAccessRules` (page file name → role); `index`, `tk_dashboard`, `underconstruction` deliberately unguarded.

### 0.2 Proposed route mapping (legacy → Angular)
| Legacy URL | Proposed route | Guard (key) |
|---|---|---|
| `/index.xhtml` (login) | `/login` | — |
| `pages/index.face?pid=1&page_id=1&act=1&navbar_menu=navbar_menu_home` | `/crm/home` (post-login default) | none (+`MODULE_CRM` for menu) |
| `pages/dashboard.face` (logo) | `/dashboard` + child tabs `overview|lead|steps|pipeline|status|customer-group|status-by-customer|table|calendar|kpi` | `FEATURE_CRM_Dashboard` |
| `pages/lead.face?…action_type=list` | `/crm/opportunities` (query `tab=board|list`) | `FEATURE_CRM_Lead` (+`CRM_Lead_View` for opening cards) |
| `pages/lead_detail.face?param_lead_id=ID&activityGroupId=GID` | `/crm/opportunities/:opportunityId?activityGroupId=` | `FEATURE_CRM_Lead`, `CRM_Lead_View` |
| `pages/activity.face` | `/crm/activities` | `FEATURE_CRM_ContactActivity` |
| `pages/schedule.face?…sub_id=1` | `/crm/schedule` (`tab=calendar|board|list`, `view=year|month|week|day`) | `FEATURE_CRM_Calendar` |
| `pages/drilldown.face?code=T-CS-01` | `/crm/drilldown/:code` | `CRM_Dashboard_View` |
| `pages/report.xhtml` | `/report` | `FEATURE_CRM_Report` |
| `pages/tk_dashboard.face` | `/points` (optional, later) | none |

### 0.3 State kept (browser / session) across this group
- **HttpSession (server):** lead board filter state (`POST /board/filter-state`, read by `leadBoardView.savedFilterJson`), detail history filter (`/board/detail-filter-state`, guarded by `leadId`), schedule filter (`/board/schedule-filter-state`), navbar group, `ss_employee_id`, `ss_branch_code`, roles, token. In Angular: replace with `localStorage`/user-pref API or keep BFF.
- **sessionStorage:** `ts_login` (login response; contains token — never copy), `ts_username`, `crm_sun_lead_session` (read by lead_detail), `ld2_tab_state`, `ld2_tableview_open`.
- **TS_PREF (localStorage+cookie):** `ts_dash_selected_mt`, `ts_dash_selected_wf`, `ts_dash_selected_name`, `ts_activity_selected_mt`, `app-theme`, `ses-fontsize`, `ses-fontnumber`.
- **URL:** `param_lead_id` (alias `id`), `activityGroupId`, `leadId` (sales_doc_rv), `code` (drilldown), legacy `pid/page_id/act/acts/sub_id/navbar_menu`.

### 0.4 API gateway layer (important)
Same-origin servlets (annotated `@WebServlet`, `src/java/com/ace/manage/content/*Servlet.java`, `.../spring/servlet/*`) proxy `/triplesale-service/api/v1/...` (base from `config.properties`), attach Bearer token, check `SessionRoles`, localise, and some **aggregate** (see §4.1). Catalogue in §6.

---

## 1. Page-by-page inventory

### 1.1 `web/index.xhtml` — Login (32,997 B)
- Title: "Triple Sales - ลงชื่อเข้าใช้"; H1 "ลงชื่อเข้าใช้ TrippleSales". **Live.** Template: none (standalone XHTML, loads `input_guard.js` itself).
- UI: 2-pane split (purple brand panel + form): **Username**, **Password** (eye toggle), ปุ่ม "ลงชื่อเข้าใช้", forgot-link (shows "กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน"); 2nd step **บริษัท** select + "เข้าสู่โปรแกรม" (multi-org); busy overlay; alert box.
- API: `POST login_proxy` JSON `{action:"login"}` → `{action:"branches"}` → `{action:"select-org", org}`; 401 → re-login.
- State: `sessionStorage ts_login` (`responseCode==="COMPLETE"`), `ts_username`; `?auth=NO_TOKEN|TOKEN_EXPIRED` clears flags (loop guard); success → `pages/index.face?pid=1&page_id=1&act=1&navbar_menu=navbar_menu_home`.

### 1.2 `pages/index.xhtml` — CRM home dashboard (87,235 B) + `resources/js/dashboard.js` (151,172 B)
- Title: `CRM Dashboard`; breadcrumb "CRM › แดชบอร์ด". **Live** (landing page; menu "CRM" and top tab "แดชบอร์ด"). Template: `/WEB-INF/pages/template.xhtml`. Full-height grid (`calc(100vh-72px)`, body `overflow-y:hidden`), cards scroll internally.
- Blocks (screen order):
  1. Left top row (grid `1fr 380px`): **"ลูกค้าทั้งหมด"** + product pill dropdown (label "ทั้งหมด" until `movement-types` loads; items from API, remembers choice) + stats card `#tsStatsRow` (Total/New/Success/Lost/Inactive/Active with 🔴🟠🔵 dots, colours per [C3]); **"ลูกค้าตามขั้นตอน"** donut (hand-drawn `<canvas>` 110×110, centre "Total", hover tooltip, legend max 3 items; colours `GROUP_PALETTE` 8 colours).
  2. Card **"โอกาสขาย (n)"**: right side **"ช่วงวันที่"** two native date inputs (default via `defaultDateRangeIso()`); table columns: ชื่อลูกค้า (avatar + ellipsis name, tooltip full), เบอร์โทร (`TsPhone` format "+66 81-234-5678"), ผู้รับผิดชอบ (name **or** button "มอบหมายงาน"), "กลุ่มขั้นตอน/ขั้นตอน" (header becomes "ขั้นตอน" when product has no workflow step; group shown as tag pill via `StepGroupColor`, step as text), ระดับความสนใจ (solid pill, [C3]). Row click → `lead_detail.face?param_lead_id=&activityGroupId=` (`data-leadid`, `data-groupid`).
  3. Right sidebar (440 px): month **calendar** (SUN–SAT grid, prev/next, marks on days with appointments, click a day → day filter); **"นัดลูกค้า"** carousel (prev/next + dots) with "+ เพิ่มนัดหมาย" (needs `CRM_Schedule_Create`) and external-link icon → `schedule.face`; **"ตารางงาน"** card list + "+ เพิ่มงาน" + link; hidden "แผนเดินตลาด" card (`display:none`, mock carousel). Both cards need `CRM_Schedule_View`.
  4. Modal **"มอบหมายงาน"** (`#tsAssignOverlay`, moved to `<body>`): customer header (avatar, name, phone, interest pill), selects ทีมขาย → ผู้รับผิดชอบ / พนักงานขาย (cascading, custom searchable dropdown `csEnhance`), button "มอบหมายงาน".
- Behaviours to reproduce: **infinite scroll** 20 rows/page (`OPPS_PAGE_SIZE`), auto-fill when table not scrollable, load only appended (never re-sorted), in-flight GET de-dup (`dedupedGetJson`, abort-aware), single retry after 800 ms, stop after 5 consecutive empty pages; client-side filter **only `leadStatus==="new"`**; 2-phase render (fast: summary+schedules, slow: leads) with `AbortController`/seq token; calendar day-select (`dayFilterOn`) overrides month cards; after assign only that row updates (no reload) + toast; product choice persisted (`ts_dash_selected_mt/_wf/_name`); donut falls back to computing from leads if `stepSummary` missing.
- API: `GET ../dashboardapi?action=summary&page=1&perPage=100&movementTypeId&startDate&endDate` (→ `/api/v1/dashboard`); `GET ../dashboardapi?action=schedules&viewMode=year|list|day&dateFrom|date&movementTypeId` (→ `/api/v1/dashboard/schedules`); `GET ../board/movement-types`; `GET ../board/leads?viewMode=list&activityGroupId=0&sortBy=txdate_desc&page&perPage=20[&movementTypeId&dateRangeType=custom&dateFrom&dateTo]`; `GET ../board/master/activity-groups?movementTypeId=` (group colour/position); `GET ../board/sale-groups`, `../board/sale-persons?saleGroupId`, `../board/employees`; `POST ../board/lead-assign {leadId,saleGroupId?,salePersonId?,employeeId?}`; `GET ../board/lead?id=` (tsGoProspect).
- Includes: `components/work_modal.xhtml` (`page=dashboard`), `phone_format.js`, `step_group_color.js`, `dashboard.js`; `window.TS_I18N` bridge; flags `LD2_ROLE_/SUP_SCHEDULE_CREATE`.
- Quirks to keep: "assigned" if `employeeId` present even if backend `unassigned` flag stuck true; group name from `wfStepSummary` by id first; http image URLs go through `../docproxy?url=`.

### 1.3 `pages/lead.xhtml` — โอกาสขาย (Lead board/list) (209,405 B)
- Title `#{label.topbar.lead}` = "โอกาสขาย"; **Live**. Template: standard. CSS external `css/lead.css`. Bean use: only `leadBoardView.hasLeadViewAccess`, `leadBoardView.savedFilterJson`, `commonBean.ssEmployeeId`, `hasFeature(CRM_ContactActivity_Create / _Sup)`.
- Blocks (screen order):
  0. Full skeleton overlay (`#ldSkeleton`, board or list variant chosen from saved tab) — hidden by `applyServerResult`.
  1. **Stat top bar**: product dropdown button (`ldProductBtn`, label "ทั้งหมด"; items from `/board/master/movement-types?type=LD`; hidden group pill if product list empty), **group pill** (activity-group dropdown with colour dot from [C2], only for `usesWorkflowStep`, disabled when ≤1 group, hidden on List tab), stats row (Total/New/Success/Lost/Inactive/Active+hot/warm/cold dots) ↔ WF-step summary track (Total fixed + horizontally scrollable steps with ‹ › arrows) via segmented toggle 😊 / 🏷 (🏷 disabled when no WF).
  2. **Tabs + toolbar**: tabs "Board" / "List"; "จัดเรียง:" dropdown (`txdate_desc` เรียงจากวันที่ล่าสุด, `txdate_asc` เก่าสุด, `id_asc` ลำดับน้อยสุด, `id_desc` ลำดับมากสุด, `status` เรียงตามสถานะ); expanding search box (icon → input + "ค้นหา" + ✕; Enter/Esc; autocomplete cards `odsProspectSuggest`); filter icon with count badge.
  3. **Board tab**: horizontally scrolling kanban columns = `kanban[]` (title `stepName`, count, "N THB" sum). Card: avatar, name, prospectCode, amount "THB", "ขยาย/ย่อ" toggle, owner (`employeeName`), access-avatar stack (first 3 + "N+") with hover popover, body (address, note, txNo, ทีมขาย "Group (Person)", phone, "บันทึกล่าสุด dd/mm/yyyy"), badges: interest ([C3]; value = `leadStatus` unless ACTIVE then `activeStatus`) + tag pills (`TagPillColor`).
  4. **List tab**: table columns วันที่บันทึก, เลขที่ (txNo + movementTypeCode), รหัสลูกค้า, ชื่อลูกค้า(avatar), เบอร์โทร, ที่อยู่ (province, district / foreign=country), มูลค่า, ทีมขาย, ผู้รับผิดชอบ(avatar), กลุ่มขั้นตอน (**only if usesWorkflowStep**), ขั้นตอน, สถานะการปิด (interest badge), แท็ก; empty state "ยังไม่มีข้อมูลลูกค้าในขณะนี้ / เมื่อมีรายการลูกค้าเข้ามา ระบบจะแสดงให้โดยอัตโนมัติ".
  5. Modals: **Filter dialog** (components/lead/filter_modal), **move step modal**, **access popover**.
- Client behaviours: HTML5 **drag & drop** cards between columns (only if `canMove` = lead not SUCCESS/LOST **and** `CAN_SUP || (CAN_ROLE && employeeId==me)`); custom ghost image, edge auto-scroll (70 px, 16 px/16 ms), drop-hint overlay text ("ลากวางที่นี่เพื่อเปลี่ยนสถานะ"), optimistic move → opens move-step modal; cancel = revert; success = quiet `loadLeads(true)`. **Per-column infinite scroll** (`page/perPage/total/totalPages` meta, scroll within 80 px of bottom → `activityStepId=`), auto-fill once if column not scrollable, else "โหลดเพิ่ม" button; list tab same on container scroll (20/page). Grab-scroll (mouse drag) on board/list. Request-id race guard `_leadsReqId`. Skeleton: full on first load, content-only afterwards, `quiet` mode. Filter/tab/sort/search changes reset paging to 1. Card click → `lead_detail.face?pid=1&page_id=3&act=3&param_lead_id=ID[&activityGroupId=curAgid]` (needs `CRM_Lead_View`; saves filter first). Filter state saved on every `loadLeads` via `navigator.sendBeacon('../board/filter-state')` and restored from `SAVED_FILTER` at render.
- API: `GET ../board/leads?viewMode=board|list&movementTypeId&activityGroupId&activityStepId&search&showClosed&dateRangeType=custom&dateFrom&dateTo&provinceId&districtId&activeStatus&saleGroupId&employeeId&tagIds=csv&sortBy&page&perPage` (response `{id,activityGroupId,usesWorkflowStep,statusSummary,wfStepSummary,kanban[],leads{items,meta}}`; returns `[]` without `CRM_Lead_View`); `GET ../board/master/movement-types?type=LD`; `POST ../board/filter-state`; `POST ../board/contact-activities` (from move modal); filter-modal masters below.
- Rules: list tab sends `activityGroupId=0` unless filter group/step chosen; board `activityStepId` per column; list tab never overwrites `CUR_AGID_EFF`.

### 1.4 `pages/components/lead/filter_modal.xhtml` — "ตัวกรองการค้นหา" (lead) (54,518 B)
- Overlay dialog: header toggle **"ดูสถานะปิดโอกาสขายแล้ว"** (`showClosed`); grid: **ช่วงวันที่** (2 date inputs), **แท็ก (เลือกได้มากกว่า 1)** (custom multi-select with search + chips), **สถานะการปิด** (ทั้งหมด/SUCCESS/LOST), **ทีมขาย**, **จังหวัด**, **ผู้รับผิดชอบ**, **อำเภอ** (disabled until province chosen; cascades), and **only on List tab:** **กลุ่มขั้นตอน** (only WF products) + **ขั้นตอน** (loaded from `board` page=1 perPage=1 kanban; cached per `mid|group`, sequence guard); buttons "ล้างค่า" / "กรอง". Badge count on the toolbar icon; `ldSetFilterMode`, `ldApplyFilterToForm`, `ldRecaptureAppliedFilter`, `ldSetRestoredSnap` bridge functions (modal is a separate closure).
- API: `GET ../board/tags`, `../board/sale-groups`, `../board/provinces`, `../board/employees` (4 parallel masters, restore snapshot after they arrive), `GET ../board/districts?provinceId=`, `GET ../board/leads?viewMode=board&page=1&perPage=1&movementTypeId&activityGroupId` (step list). Also feeds tag colours to board via `ldSetTagColors`.
- Opened from: lead.xhtml filter icon; **same pattern re-implemented inline** in activity.xhtml and schedule.xhtml.

### 1.5 `pages/components/move_step_modal.xhtml` (23,763 B) — "ย้ายขั้นตอน"
- Reusable modal (used by lead.xhtml, lead_detail.xhtml). Header title + optional group badge (colour from [C2], shown only if `isMoveGroupStep`) + step badge; channel pills (Note, บันทึกโทรออก, บันทึกโทรเข้า, ข้อความ SMS, ส่งอีเมล, Facebook, LINE, WhatsApp — `data-channel` = manual/call_out/call_in/sms/email/facebook/line/whatsapp); textarea "บันทึกรายละเอียด..."; buttons "ยกเลิก"/"บันทึก".
- API: `POST ../board/contact-activities {leadId, channel, content, procedureGroupId?, procedureId}`; success → `onSuccess()` (quiet refresh) else success modal + `location.reload()`. Options: `ldOpenMoveStep({leadId, procedureId, procedureGroupId, title, group, step, color, isMoveGroupStep, onCancel, onSuccess, gateKey})`; gate disables tabs/textarea/save when `CAN_CONTACT_ACTIVITY_CREATE` false. Cancel/close/outside-click → `onCancel`.

### 1.6 `pages/components/access_pop.xhtml` (17,728 B) — popover "ผู้มีสิทธิ์เข้าถึง"
- Read-only hover popover listing accessors `{id,code,name,avatar}`; `ldShowAccessPop(el, assignees, myEmployeeId)`; two positioning modes (absolute inside `.ld-col-body` for kanban, fixed otherwise); wheel/touch stopPropagation; close delay. Title via `window.LD_ACCESS_TITLE`. Distinct from the editable modal `lead_detail/access_modal`.

### 1.7 `pages/lead_detail.xhtml` — รายละเอียด Lead (820,361 B, 7,893 lines)
- Title "รายละเอียด Lead"; breadcrumb "CRM › โอกาสขาย › รายละเอียด". **Live** (the only live lead detail; PageAccessRules `FEATURE_CRM_Lead`). Template standard; CSS `css/lead_detail.css`, `lead_detail_modal.css`. All behaviour is one inline IIFE (`ld2*`/`ld*` functions); all labels from `label.ld2.*`.
- Layout (3 columns, full height): **Left (462 px)**, **Center**, **Right history panel** (+ full-width "Table view").
  - **Left card**: back button (`history.back()`), avatar, name, code, location; **interest dropdown** (HOT/WARM/COLD/INACTIVE/NEW — LOST/SUCCESS not selectable); tags row with "เพิ่ม/แก้ไข Tag"; info panel: "เป้าหมายในเดือน" (month + year dropdowns, fiscal years), "มูลค่าดีล" (THB input), เบอร์โทร, ติดต่อครั้งแรก, ทีมขาย (+ change-sales button), ผู้รับผิดชอบ (+ add owner), ผู้มีสิทธิ์เข้าถึง (avatars → manage). Then cards **ตารางนัดหมาย** and **ตารางงาน** (list, `+` add, external link to `schedule.face`; click → view modal).
  - **Center**: **stepbar** (`#ld2StepBar`; shown only if `usesWorkflowStep`; states per [C1]; closed lead (SOLD/SUCCESS/LOST) shows current group as done; fallback order from `api.activeSteps` or inferred from task/appointment group names) above a card with tabs **ข้อมูลติดต่อ / ข้อมูลหลัก / ข้อมูลเพิ่มเติม / เอกสารประกอบ / เอกสารงานขาย**:
    - *ข้อมูลติดต่อ*: "ความต้องการ" textarea; "ผลิตภัณฑ์" list + "เพิ่มผลิตภัณฑ์" + "ทุกรายการ: สร้างใบเสนอราคา" dropdown; "รายละเอียดติดต่อ" card with 8 channel buttons (Note, call_in, call_out, LINE, Facebook, WhatsApp, Email, SMS; draggable horizontal row), textarea, switch **"ส่งต่องานให้ผู้อื่น"** (multi-target forward cards: กลุ่มขั้นตอน → ขั้นตอน → ผู้รับผิดชอบ, add/remove), "เวลาอ้างอิง" datetime-local, "ขั้นตอน" dropdown (with search), **บันทึก**; footer: "ส่งกลับแก้ไข" (return step), "ปิดแก้ไขกลุ่มขั้นตอน", "ปิดโอกาสขาย" (green). Footer shows skeleton until API confirms flags.
    - *ข้อมูลหลัก*: accordion sections ข้อมูลเบื้องต้น / ข้อมูลติดต่อ / ลูกค้าบุคคลธรรมดา | ลูกค้าองค์กร (switch by type) / ข้อมูลที่อยู่ (province→district→sub-district cascade, metro geo), avatar upload pen (jpg/png ≤2 MB → base64), phone with country code dropdown (`TsPhone` rules), "อัปเดตข้อมูล" save with confirm popup ("ไม่ใช่ตอนนี้"/"ตกลง").
    - *ข้อมูลเพิ่มเติม*: sub-tabs CS, PLS, LS, LE, CRM, ข้อมูลเพิ่มเติม (11 inner tabs: ข้อมูลลูกค้าเบื้องต้น, ข้อมูลทรัพย์ที่ต้องการยื่นกู้, …), แบบสำรวจความพึงพอใจ (matrix มากที่สุด…น้อยที่สุด), inner tabs ข้อมูลผู้กู้หลัก/ผู้กู้ร่วม; "อัปเดตข้อมูล" per section (`ld2SaveCs`).
    - *เอกสารประกอบ*: upload button, list with download (via `/docproxy`), delete.
    - *เอกสารงานขาย*: card grid `#ld2SaleDocGrid` from rv-attachments (download/preview, open `../rvreport?txno=`, or navigate to `sales_doc_rv.xhtml?leadId=&activityGroupId=`).
  - **Right panel** "ประวัติการติดต่อ": group tag, timeline list `ld2HistList`, icons: filter (opens history filter), collapse/expand panel, grip → **Table view** (per-activity-group collapsible cards coloured by [C2], columns วันที่เริ่ม / SLA จริง / ขั้นตอน / …, SLA badges "รวม n วัน").
- Behaviours: init loads `GET /board/lead` + `GET /board/activity-groups` in parallel with skeletons; role/owner gating (`ld2ApplyScheduleCreateVisibility`, `…ContactActivityVisibility`, `…ContactSaveRowVisibility`, `ldApplyClosedState`); tab and table-view restore via sessionStorage; many actions end with `location.reload()` (forward, save contact, close/return) — replace with state refresh; optimistic updates through `ldLeadUpdate`; geo cascade caches; draggable channel row; custom dropdowns with search (`ld2AddDdSearch`); toasts (`ldShowSuccessToast`, `ldShowErrorToast`); `lead-id` mismatch resets saved history filter.
- Include list (all at bottom): `lead_detail/tag_modal`, `sales_owner_modal`, `add_product_modal`, `work_modal` (page=lead_detail), `history_filter_modal`, `access_modal`, `return_step_modal`, `close_group_modal`, `close_lead_modal`, `access_pop`, `move_step_modal` (used from table view/step actions).
- API (BFF): `GET /board/lead?id&activityGroupId` (→ `/leads/{id}`: `id, prospect{id}, leadStatus, activeStatus, usesWorkflowStep, currentStep{procedureGroupId, procedureGroupName, procedureId, procedureName, wfsId, canReturn, assigneeCode/Name}, activeSteps[], appointmentList, taskList, contactHistoryList, materialList, tagList[{id,code,name,colorCode}], accessors[], saleGroup, salePerson, employee(+Name), amount, targetYear/Month, leadDemand, permissions{canAddContactActivity}`), `GET /board/activity-groups?leadId`, `GET /board/activity-steps?leadId&activityGroupId`, `GET /board/lead/contact-history?leadId`, `GET /board/detail-filter-state` + `POST` (same), `GET /board/fiscal-years`, `POST /board/lead-update {action: assign|active-status|demand|target-year|target-month|amount|tags}`, `POST /board/contact-activities {leadId,channel,content,procedureGroupId,procedureId,workRecordDate "YYYY-MM-DDTHH:mm:ss"}`, `POST /board/lead/forward {leadId,targets[{activityGroupId,activityStepId,assigneeEmployeeId}],remark?,currentActivityGroupId}`, `GET /board/lead/forward-groups?leadId&currentActivityGroupId`, `GET /board/lead/forward-employees?leadId&activityGroupId`, `GET /board/lead/return-groups?leadId`, `POST /board/lead/return {leadId,currentActivityGroupId,returnToActivityGroupId,remark}`, `POST /board/lead/close-step {leadId,wfsId,remark}`, `POST /board/lead/close {leadId,outcome:"sold"|"lost"}`, `GET /board/lead/accessors?leadId&all=true`, `POST /board/lead/accessor-add?leadId {employeeIds[]}`, `POST /board/lead-materials {leadId,materialId}`, `GET /board/material-groups`, `GET /board/materials?groupId`, `GET /board/prospect?id`, `POST /board/prospect/save`, `POST /board/prospect/avatar`, `GET|POST|DELETE /board/prospect/attachments` (`prospectId`,`docNo`), `GET /board/prospect/rv-attachments?prospectId`, `GET /board/metro-geo`, `/board/provinces`, `/board/districts?provinceId`, `/board/sub-districts?districtId`, `/board/chat-master-data?type=`, `/board/employees`, `/board/tags`, `/board/sale-groups`, `/board/sale-persons`, `/docproxy?url=`, `/rvreport?txno=`.
- Feature keys: `CRM_Lead_View, CRM_Lead_Edit, CRM_Lead_Assign(+_Sup), CRM_Lead_Sales_Person_Assign, CRM_Lead_Close(+_Sup), CRM_Lead_WorkflowStep_Close(+_Sup), CRM_Lead_WorkflowStep_Rework(+_Sup), CRM_ContactActivity_Create(+_Sup)/View, CRM_Schedule_Create(+_Sup)/Edit/View, CRM_Prospect_Edit`.

### 1.8 `pages/components/lead_detail/*` — 8 modals (all lead_detail only)
| File (size) | Modal title | Trigger | API |
|---|---|---|---|
| `tag_modal.xhtml` (17,231) | "เพิ่ม/แก้ไข Tag" — chips with colour (`ldTagColorByName`), search, บันทึก | "เพิ่ม/แก้ไข Tag" button | `GET /board/tags` (cached), `ldLeadUpdate {action:'tags', tagIds:'1,2'}` → `PUT /leads/{id}/tags` |
| `sales_owner_modal.xhtml` (24,423) | "เปลี่ยนพนักงานขาย" (ทีมขาย, พนักงานขาย) + "เพิ่มผู้รับผิดชอบ" (ผู้รับผิดชอบ, ทีมขาย, พนักงานขาย) — needs `CRM_Lead_Sales_Person_Assign` / `CRM_Lead_Assign(_Sup)` | pencil/add buttons on left card | `/board/sale-groups`, `/board/sale-persons?saleGroupId`, `/board/employees`, `ldLeadUpdate {action:'assign',…}` (optimistic) |
| `add_product_modal.xhtml` (9,625) | "เพิ่มผลิตภัณฑ์" (ประเภท, ผลิตภัณฑ์; "เพิ่มรายการ") | "เพิ่มผลิตภัณฑ์" | `/board/material-groups`, `/board/materials?groupId`, `POST /board/lead-materials` then reload |
| `history_filter_modal.xhtml` (25,506) | "ตัวกรองการค้นหา" (กลุ่มขั้นตอน, ขั้นตอน, ผู้รับผิดชอบ, เลือกช่องทางการติดต่อ: ทั้งหมด, FACEBOOK, LINE, Whatsapp, Email, Note, Call In, Call Out, SMS, Forward; ล้างค่า/กรอง; Esc/outside to close) | filter icon in history header | client-side filter `ldApplyHistFilter`; saves `POST /board/detail-filter-state`; shares forward caches `LD2_FWD_ACT_GROUPS/EMPLOYEES` |
| `access_modal.xhtml` (20,538) | "เพิ่มผู้มีสิทธิ์เข้าถึง (n)" — autocomplete employees → chips → confirm (needs `CRM_Lead_Assign`) | left card avatars/add | `GET /board/lead/accessors?leadId&all=true`, `/board/employees`, `POST /board/lead/accessor-add?leadId {employeeIds[]}` |
| `return_step_modal.xhtml` (18,886) | "ส่งกลับแก้ไข" (วันที่ส่งต่อ, กลุ่มขั้นตอน, ขั้นตอน, ส่งต่อให้, เหตุผล textarea, "ยืนยันส่งกลับ"; needs `…WorkflowStep_Rework`; disabled unless `currentStep.canReturn`) | footer link | `GET /board/lead/return-groups`, `POST /board/lead/return` |
| `close_group_modal.xhtml` (7,857) | confirm "ปิดแก้ไขกลุ่มขั้นตอน" (cancel / ยืนยัน) | footer button | `POST /board/lead/close-step` (`wfsId = cs.wfsId||cs.procedureGroupId`) |
| `close_lead_modal.xhtml` (9,404) | "ปิดโอกาสขาย": radio "ปิดโอกาสขายสำเร็จ" / "ปิดไม่สำเร็จ" | footer green button (`CRM_Lead_Close`) | `POST /board/lead/close {outcome:'sold'|'lost'}` |

### 1.9 `pages/components/work_modal.xhtml` — add/view/edit appointment & task (145,265 B)
- Used by lead_detail, activity, schedule, index (`ui:param page`). Two overlays: **View** ("งาน"/"นัดหมาย": ลูกค้า, วันที่, เวลา, หัวเรื่อง, รายละเอียด, สถานะ dropdown, pencil edit if `CRM_Schedule_Edit`, link "ไปหน้าโอกาสขาย" when opened from calendar) and **Add/Edit** ("เพิ่มงาน"/"เพิ่มนัดหมาย": ลูกค้า (searchable lazy list, filters team/owner "only mine", infinite scroll), ทีม, ผู้รับผิดชอบ dropdown (by activity group), วันที่, เวลา + "ทั้งวัน", หัวเรื่อง, รายละเอียด, สถานะ; badges group/step). Success overlay ("แก้ไขนัดหมายแล้ว"…). Validation toasts ("กรุณาเลือกลูกค้า/ระบุวันที่/หัวเรื่อง/รายละเอียด", "ไม่มีสิทธิ์แก้ไข").
- API: `POST ../board/schedule/add {leadId, taskAssigneeId, subject, detail, date, time|null, type:'APPOINTMENT'|'TASK', status, allDay, remark, procedureGroupId?, movementTypeId?, activityGroupId?}`; `PATCH ../board/schedule/edit {id, taskAssigneeId, subject, detail, date, time, status, allDay, remark}`; `GET ../board/leads?viewMode=list&sortBy=txdate_desc…` (customer search); `GET ../board/lead?id=` (resolve group); `GET ../board/master/activity-groups?movementTypeId=`; `GET ../board/employees` or `../board/master/employees-by-activity-group?activityGroupId=`.
- Permission rule: create = `_Sup || (role && owner(lead)==me)`; edit = `CRM_Schedule_Edit`; owner-check done on submit when customer search mode; globals `LD2_*` flags must be set by host page; exposes `wmOpenView/wmOpenAdd/wmOpenEdit/wmSetLeadContext`, `ldOpenAddWork/ldOpenAddAppt/ldOpenViewWork/ldOpenViewAppt`.

### 1.10 `pages/activity.xhtml` — การติดต่อ (264,848 B, 2,740 lines)
- Title "การติดต่อ"; **Live** (top tab navbar-4, `FEATURE_CRM_ContactActivity`). Template standard; CSS `resources/support/drag_scroll.css`, scripts `drag_scroll.js` (target `.ac-table-scroll`), `phone_format.js`, `step_group_color.js`.
- Layout: split — main card (left, flexible) + **right detail panel (slides open to 360 px)**; page height locked to viewport.
- Blocks:
  1. Stat top: product dropdown ("ทั้งหมด" until loaded; "เชื่อมต่อไม่ได้" on failure; remembers `ts_activity_selected_mt`), stats row (same Lead status summary / WF steps toggle 😊/🏷 with ‹ › arrows).
  2. Sub-tabs: **"แบ่งตามโอกาสขาย"** (table A0, expandable rows) / **"แบ่งตามกลุ่มขั้นตอน"** (table A1, 1 row per group of each lead) — shown for `usesWorkflowStep`; **Type B** flat table for products without WF step. Toolbar: "จัดเรียง:" (date_desc เรียงจากวันที่ล่าสุด / date_asc เรียงจากวันที่เก่าสุด / name_asc ชื่อลูกค้า (ก-ฮ) / name_desc ชื่อลูกค้า (ฮ-ก)), search "ค้นหาชื่อผู้ติดต่อ / ลูกค้า" (350 ms debounce), filter icon.
  3. Tables: A0 columns: [chevron + expand-all], ติดต่อล่าสุด, ชื่อผู้ติดต่อ, ชื่อลูกค้า (avatars), กลุ่มขั้นตอน (tag colour via `StepGroupColor` + master groups), Note, LINE, FB, WhatsApp, Email, SMS, Call, Visit (channel counts), วันที่มอบหมาย, สถานะ (interest badge ↔ tag pills by toggle). A1: ติดต่อล่าสุด, ชื่อผู้ติดต่อ, ชื่อลูกค้า (sortable icon), ความต้องการ, กลุ่มขั้นตอน, LINE, FB, Email, SMS, Note, Call, Visit, วันที่มอบหมาย, สถานะการปิด. Type B: ติดต่อล่าสุด, ชื่อผู้ติดต่อ, ชื่อลูกค้า, ขั้นตอนปัจจุบัน, Note, LINE, FB, WhatsApp, Email, SMS, Call, Visit, วันที่มอบหมาย, สถานะ. Footer "กำลังโหลด..." strip.
  4. **Right panel** (tabs "รายละเอียด" / "นัดหมาย / งาน", ✕): detail head (avatar, name, location, interest badge), เบอร์โทร, ติดต่อครั้งแรก, ทีมขาย, ผู้รับผิดชอบ, วันที่มอบหมายล่าสุด, button "ไปหน้าโอกาสขาย →"; **ประวัติการติดต่อ** (needs `CRM_ContactActivity_View`) with "เพิ่มการติดต่อ" (`CRM_ContactActivity_Create`) + filter icon (opens the same filter dialog); appointment tab: **ตารางนัดหมาย** (carousel prev/next, `+` = `CRM_Schedule_Create`, external link) and **ตารางงาน** (cards, click → `ldOpenViewWork`), both `CRM_Schedule_View`.
  5. Dialogs: **ตัวกรองการค้นหา** (toggle "ดูสถานะปิดโอกาสขายแล้ว", ช่วงวันที่ "วันที่เริ่ม/วันที่สิ้นสุด", แท็ก, สถานะการปิด (ทั้งหมด/ปิดแล้ว/…), ทีมขาย, จังหวัด, ผู้รับผิดชอบ, อำเภอ; ล้างค่า/กรอง); **เพิ่มการติดต่อ** (8 channel pills, textarea "พิมพ์รายละเอียดการติดต่อ...", "เวลาอ้างอิง" datetime-local default now, บันทึก); **เพิ่มนัดหมาย/เพิ่มงาน** (หัวข้อ, date, time, รายละเอียด) — plus `work_modal` (page=activity).
- Behaviours: server paging (`AC_PER_PAGE=20`, `meta.hasMore`), infinite scroll within 80 px, `acFillIfShort` auto-fill (max `AC_AUTOFILL_MAX`), row de-dup key `id|step_group|current_step`, request sequence guard `AC_REQ_SEQ`; first row auto-opens panel; expand row lazily loads children from `row.children` (>1 group) else `/board/activity-detail`; clicking child row opens panel for that group (`wfsId`); detail cache `AC_DETAIL_CACHE`; some filters server-side (`saleGroupId`, `employeeName`, `lastContactFrom/To`, `search`, `sortBy`, `showClosed` only if user asked) and some client-side (`acApplyClientFilter`); after saving a contact it reloads detail **and** table (counts are server aggregates); "no owner" lead → auto `POST /board/lead-assign` with `salePersonId` before creating contact; unsupported filters greyed (`acMarkUnsupportedFilters`); error popup throttled 5 s (`acLeadFailed`).
- API: `GET ../board/movement-types`; `GET ../board/activity-list?viewMode=list&movementTypeId&saleGroupId&employeeName&lastContactFrom&lastContactTo&search&sortBy&showClosed&page&perPage` → `{summary, usesWorkflowStep, rows[{id,date,agent_*,customer_*,step_group,step_group_id,current_step,note,line,fb,whatsapp,email,sms,call,visit,due_date,interest,leadStatus,tags,children[],history[]}], meta{hasMore}}`; `GET ../board/activity-detail?id&wfsId&txNo&all=1&activityGroupId` → `{customer…, history[], appointments[], tasks[], events[]}`; `GET ../board/master/activity-groups?movementTypeId=`; `GET ../board/tags|sale-groups|provinces|employees`, `../board/districts?provinceId`; `POST ../board/contact-activities {leadId,channel,content,procedureGroupId,createById,workRecordDate}`; `POST ../board/lead-assign`; `POST ../board/schedule/add {leadId,subject,detail,date,time,type,status,allDay,remark,procedureGroupId}`.
- Includes: `components/work_modal.xhtml`; flags `LD2_*SCHEDULE_*`.

### 1.11 `pages/schedule.xhtml` — ปฏิทินงาน (264,574 B, 3,377 lines)
- Title "ปฏิทินงาน"; **Live** (navbar-5). Template standard; CSS `resources/support/schedule.css`. Bean: `scheduleView.savedFilterJson`.
- Blocks:
  1. Header: product dropdown (movement types LD; hidden if none) + activity-group pill (colour [C2]; only WF products).
  2. Tabs **Calendar / Board / List** + toolbar (จัดเรียง: only Board/List: date_desc/date_asc/order_asc "เรียงจากลำดับน้อยสุด"/order_desc/status; search; filter icon with badge).
  3. **Calendar tab**: "วันนี้", prev/next, clickable label opens custom date/month/year picker, right-nav (view switcher); views **Year** (marks), **Month** (Sun–Sat grid, up to N chips + "more" popover "รายการทั้งหมด"), **Week** and **Day** (time grids, AM/PM), chips for appointments/tasks with status colours; click opens `work_modal` view (with "ไปหน้าโอกาสขาย" link). Skeleton, error page "ไม่สามารถโหลดข้อมูลได้ / ลองใหม่".
  4. **Board tab**: two sections **ตารางนัดหมาย** (columns `scheduled นัดหมาย`, `re-schedule เลื่อนนัด`, `success สำเร็จ`, `cancel ยกเลิก`) and **ตารางงาน** (`doing รอดำเนินการ`, `success`, `cancel`), count badges (icons `images/calendar_work/*`), `+ เพิ่ม`, per-column infinite scroll with IntersectionObserver sentinels (`SC_BOARD_PER_PAGE=20`), **drag cards between columns** (needs `CRM_Schedule_Edit`; optimistic + PATCH + quiet resync / revert + alert).
  5. **List tab**: two tables (appointments / tasks) columns: [status icon], วันที่/เวลา, ลูกค้า, นัดหมาย | งาน, กลุ่มขั้นตอน, ขั้นตอน, ผู้รับผิดชอบ, สถานะ (pill with calendar/clipboard icon) with 3-dot context menu ("ไปที่ Lead" needs `CRM_Lead_View`); independent infinite scroll (20/page) per table.
  6. Filter dialog: ทีมขาย (searchable dropdown), ผู้รับผิดชอบ, "เลือกดูตามตารางนัดหมาย" checkboxes (นัดหมาย/เลื่อนนัด/ยกเลิกนัด/สำเร็จ), "เลือกดูตามตารางงาน" (ดำเนินการ/ยกเลิก/สำเร็จ), ล้างค่า/กรองข้อมูล. Checked-all or none = param omitted.
- Behaviours: filter+view state saved server-side on change (`sendBeacon` `/board/schedule-filter-state`: movementTypeId, activityGroupId, calView, calYear/Month/Day, tab, filter, listSort, search) and restored on load (skeleton chosen by saved tab); `+` buttons hidden without `CRM_Schedule_Create`; request error → error page; `scRefreshCurrentTab`; custom "more" popover; week/day AM/PM formatting; year view uses `result.marks`.
- API: `GET /board/schedule/fetch?viewMode=month|week|day|year|list|board&dateFrom&dateTo&movementTypeId&activityGroupId&serviceId&assignToId&appointmentStatus&taskStatus&search&sort&page&perPage&type=appointment|task` (response `result.items[]`, `result.marks`, `summary`, groups); `PATCH /board/schedule/edit {id,leadId,subject,detail,date,time,status,allDay,remark}`; `POST /board/schedule-filter-state`; `GET /board/master/movement-types?type=LD`; `GET /board/master/activity-groups?movementTypeId=`; `GET /board/sale-groups`, `/board/employees`; add via work_modal (`POST /board/schedule/add`).
- Includes: `components/work_modal.xhtml` (page=schedule).

### 1.12 `pages/dashboard.xhtml` (104,953 B) — BI "แดชบอร์ด" shell
- Title "แดชบอร์ด" (breadcrumb Main › แดชบอร์ด); **Live** (logo → `dashboard.face`, `FEATURE_CRM_Dashboard`). Template standard; head loads ECharts 5.6 (`js/echarts-5.6.0/echarts.min.js`), Google fonts, a very large `.dbsun-root` CSS block (dark theme included), body = `<ui:include src="dashboard_company.xhtml"/>`. The branch switch (`ss_branch_code == Gold → dashboard_gold.xhtml`) is **commented out**.

### 1.13 `pages/dashboard_company.xhtml` (456,782 B, 7,542 lines) — body fragment (no template)
- H1 "Dashboard ลีดเก็บเงิน". **Live.** Data injected by `dashboardView` EL (e.g. `kpiTotalFmt`, `activityGroupJson`, `movementtypeJson`, `employeeJson`, `dashboardSunUrl`, subtitles) + client fetches.
- Header filter bar: **date-basis radios** "วันติดต่อครั้งแรก" (`contact`) / "วันที่เริ่มกิจกรรม" (`lead`) / "วันที่เริ่ม Workflow Step" (`wfs`) (only 2 shown per tab; `สถานะตามกลุ่มขั้นตอน` forces `contact`); dropdowns: ปี (year), เดือน, ช่วงวันที่ (DD/MM/YYYY text + native picker; hidden on Pipeline), ประเภทการรายการ (movementtype; only tab กลุ่มขั้นตอน), แหล่งที่มา, กลุ่มสถานะ (CS/PLS/LS/LE), อาชีพ, ประเทศ, พนักงาน (`employee`). A modal "ตัวกรองการค้นหา" (เดือน, แหล่งที่มา, กลุ่มสถานะ pills, Employee, จังหวัด, อาชีพ, ประเทศ; ล้างค่า/กรอง).
- Tabs (10): **ปฏิทินงาน** (iframe), **KPI-EventMovement** (iframe), **ภาพรวม** (default), **Lead**, **กลุ่มขั้นตอน**, **Pipeline**, **สถานะตามกลุ่มขั้นตอน**, **ลูกค้าตามกลุ่มขั้นตอน**, **สถานะตามลูกค้า**, **ตารางลีดทั้งหมด**.
  - *ภาพรวม*: KPI cards (ลีดทั้งหมด, dynamic milestone cards from API, ประเทศที่ครอบคลุม + "อันดับ 1"), widgets: แนวโน้มลีดรายวัน (line), กลุ่มสถานะ (pie %), จำนวนลีดที่ดูแล (CS bar), Top 10 สาขา, Funnel: แหล่งที่มา → ปิดเงิน, ขั้นตอนล่าสุด · Top 8, Funnel CS · เก็บเงิน, Funnel สาขา · เก็บเงิน · Top 10. **Widget edit mode** (drag-reorder + show/hide, save/cancel; layout persisted `GET|POST /dashboard/widget-layout?page=overview`; ids `kpiTotal, kpiCountries, chartTrend, chartGroup, chartCS, chartCountry, funnelSource, chartStep, funnelCs, funnelCountry` and `ms:<label>` milestones; HTML5 dragstart).
  - *Lead*: 8 charts (Lead breakdown by อาชีพ, ประเภทธุรกิจ, อำเภอ, แหล่งที่มา, ทีม, Sale Person; Success rate by Sale Person / by ทีม).
  - *กลุ่มขั้นตอน*: group panels "ขั้นตอนล่าสุดของแต่ละกลุ่ม / แต่ละกลุ่มมีลีดค้างอยู่ในขั้นตอนใดบ้าง".
  - *Pipeline*: "จำนวนลีดคงค้างรายเดือน" matrix (เดือน × แผนก, รวม, footer totals, pagination; click number → modal "รายชื่อ" via `pipeline/detail`).
  - *สถานะตามกลุ่มขั้นตอน*: KPI strip + "ตารางผลงานพนักงาน" (แผนก select, include-blocked toggle, sort toggle เรียงจากมากไปน้อย, columns ขั้นตอน/ลีดทั้งหมด/ค้างอยู่/เฉลี่ยวันค้าง/ค้างอยู่ (SLA)/จำนวนลีดที่ทำเสร็จ/เฉลี่ยวันที่ทำเสร็จ/ทำเสร็จ (SLA); expandable per-employee steps lazily).
  - *ลูกค้าตามกลุ่มขั้นตอน*: search, แผนก, sort; wide matrix (frozen "ชื่อลูกค้า" col, per-step start/end/used dates), pagination.
  - *สถานะตามลูกค้า*: customer × status/step table with department + activity-step multi-select (`activitystep=all|CS01,CS02`).
  - *ตารางลีดทั้งหมด*: search "ค้นหาชื่อลูกค้า / รหัส", 13 columns (วันที่ติดต่อแรก, รหัส, ชื่อ, ประเทศ, อาชีพ, แหล่งที่มา, ผู้รับผิดชอบ, วันเก็บเงิน, กลุ่ม, ขั้นตอนล่าสุด, ผู้รับผิดชอบล่าสุด, วันที่ติดต่อล่าสุด, ตำแหน่งงาน), numbered pagination; row → detail (`lead_list/detail?prospectCode=`).
  - *ปฏิทินงาน / KPI*: lazy-loaded inside `<iframe srcdoc>` after `fetch(dashboard_calendar_frame.xhtml)` / `fetch(dashboard_kpi_frame.xhtml)` (placeholders `__GOLDAPI__`, `__GGW_BRANCH__` replaced client-side); iframe reads parent theme (`app-theme`) and `ts_username`.
- Behaviours: **progressive parallel loading** (8 `chart-single` calls, each renders on arrival; abort + generation token on filter change), `_dbSkel` skeletons, global thin loading bar (monkey-patched fetch counter), `ggwBranch` param on every call (branch from `ss_branch_code`), month dropdown refreshed per year (`/dashboard/months`), date bounds tied to year/month, filters persisted across tab switches, ECharts instances resized on tab switch/window resize, applyDashboardFilters (legacy full reload with query string), keyboard Esc closes dropdowns/modals.
- API (BFF): `GET /dashboard/chart-single?chart={trend|group|cs|topCountries|sourceFunnel|step|csFunnel|countryFunnel|leadBreakdown|kpi|groupPanels|statusKpis}&year&month&employee&chanel&country&occupation&province&activitygroup&fromdate&todate&datebasis&movementtype&ggwBranch`; `GET /dashboard/overview`; `GET /dashboard/months?year`; `GET /dashboard/masterdata-all`; `GET /dashboard/masterdata-activitystep?activitygroup`; `GET /dashboard/api/v1/sundashboard/{overview|pipeline|pipeline/detail|customer_step_groups|customer_status_list|employee_performance|employee_performance/steps|lead_list|lead_list/detail}` (proxy to dashboard-triplesale-service); `GET /dashboard/employee-leads?type=pending|completed&group&search&page`; `GET|POST /dashboard/widget-layout?page=overview`.

### 1.14 `pages/dashboard_calendar_frame.xhtml` (153,496 B) — "ปฏิทินงาน" (Google-Calendar clone, iframe)
- Standalone doc (own fonts/FA CDN). Header: menu, logo badge "ปฏิทิน", "วันนี้", prev/next, title, search, help, settings, view dropdown (วัน/สัปดาห์/เดือน/ปี), toggle ปฏิทิน ↔ รายการ (tasks), apps grid. Sidebar: "สร้าง" button, mini month, "ค้นหาผู้คน", "หน้าการจอง", **ปฏิทินของฉัน / ปฏิทินอื่นๆ** (calendar lists with colours), grid with up to 4 chips/cell, tasks view with lists. Create/edit task modals, create calendar list, attachments.
- Data: EL JSON `calendarDashboardView.*` (`calendarDataJson`, `calendarApiUrl`, `employeeCode`, `myTaskListJson`, `calendarTaskCreateUrl`, `myCalendarListJson`, `taskCalendarListJson`) + browser calls to the Gold KPI service through `/goldapi/*`: `GET {calendar}?date_type&date_select&calendartype&employees&position&page&perPage&employee`, `GET my-task`, `GET my-calendar-list`, `GET my-task-list`, `POST|PUT /calendar-task`, `POST /calendar {name}`, `GET masterdata-all` (employee). Event kinds `appointment|task`, statuses, `assigeToShared`, attachments lists.

### 1.15 `pages/dashboard_kpi_frame.xhtml` (196,781 B) — "รายการงาน KPI" (iframe)
- Editable 18-column grid (เลขที่เอกสาร, ประเภทงาน, หัวข้องาน, บริการ, ลูกค้า, วันที่เริ่มกิจกรรม, รายละเอียด, วันที่ปิดกิจกรรม, สถานะ events, สรุปการดำเนินการ, ช่องทาง, ความสำคัญ, หัวข้อ KPI, key figure, KPI Unit, ผู้รับผิดชอบ, ผู้จัดทำ, เวลาที่สร้างเอกสาร), "+ New" row, per-row save/delete, master dropdowns (pillar, levels, units, kpiTasks, contacts, employees, branches by `ggwBranch`), attachment modal "รายการแนบ", "เพิ่มข้อมูลใหม่" modal. API via servlets `/dashboard/kpicreate|kpiupdate` → kpi-gold-service `/eventmovements` (POST/PUT/DELETE) and `/masters/{branches,kpi-tasks,kpi-units,…}`. Falls back to mock if API fails. High-effort and isolated.

### 1.16 `pages/dashboard_gold.xhtml` (276,481 B) — Gold-branch variant (status: **disabled by default**)
- Same shell/tab set as company minus Lead tab; data from `goldDashboardView` and `/golddashboard/*` servlets (mirror of `/dashboard/*`) and `/goldapi/*` proxy; uses `js/gold.js`. Include is commented out in `dashboard.xhtml`; as a bare `<ui:composition>` it cannot be opened directly in a useful way. Clarify with PO whether Gold branch still exists.

### 1.17 `pages/drilldown.xhtml` — DrillDown reports (73,051 B)
- Title "DrillDown"; breadcrumb "ข้อมูลประกอบ › DrillDown". **Live** (menu item inside "เอกสารประกอบ", key `CRM_Dashboard_View`). One page for 11 reports (`?code=T-CS-01 | T-PLS-01/02/03 | T-LS-01…05 | T-LE-01 | T-FI-01`), default T-CS-01.
- UI: card head "รหัส (จำนวน)" + "ข้อมูลตัวอย่าง" pill (when `mock:true`) + "Excel" (CSV export of the current page); error strip; table with **server-defined columns** (`columns[]`), numbered first col "ลำดับ", column header filter caret → shared filter menu (search "ค้นหาค่า", checkbox list of distinct values incl. "(ว่าง)", or calendar range for date columns, "ค้นหา"), frozen columns until /ชื่อ-นามสกุล|ชื่อลูกค้า/ (fallback 6, only ≥900 px), drag-scroll, 100 rows/page with centred pager (window 10), skeleton rows, i18n `DD_I18N`.
- API: `GET /board/drilldown?action=data&code=T-CS-01&page=1&pageSize=100` → `{success, message, data{columns[{key,label}], rows[], total, mock}}` (→ `/triplesale-service/api/v1/drilldown/{path}`; service has report catalogue `ReportDef` + label maps + composite columns). Column filters are **client-side on the current page**.
- Reuses `crm_list.css`, `drag_scroll.js`.

### 1.18 `pages/report.xhtml` — รายงาน (43,834 B)
- Title "รายงาน"; **Live** (left menu; `FEATURE_CRM_Report`). UI: header "รายงานทั้งหมด" + search "ค้นหารหัส / ชื่อรายงาน"; left card groups (**รายงาน CRM** CRMG10–14, **รายงาน SUN** SUN-LD-01…09, **รายงาน GGW** GGW-LD-01/02); right side-panel: report name + dynamic filter form by `filterDefs` (dateRange "จากวันที่", month, salePerson, owner, saleGroup, contactType, status, product, stepGroup, sort1/2, format, employee, communicationType, activityStatus, sortGgw, employeeSun, prospect; `required` flags) + "เรียกดู" button; empty-state "เลือกรายงานจากรายการด้านซ้าย…".
- Behaviour: report list currently from **mock** `resources/mock/report_mock.json` (`RPT_DATA_URL`); permissions `RPT_PERM[code]` from `commonBean.reportPermJson` (`Report_<CODE>_View`); "เรียกดู" opens `/report-pdf?code=…&k=v&dateRange_from=&dateRange_to=` in a **new tab** (PDF generated by `ReportPdfServlet`; popup-blocker toast); reports with `pdf` not true (e.g. SUN-LD-08) show toast "ยังไม่ได้ต่อกับระบบรายงาน…"; required-filter check before open; dynamic select options via `fetch` (`loadDynOptions`).

### 1.19 `pages/tk_dashboard.xhtml` — "แต้มสะสม" (43,258 B) + `tk_dashboard_mock.json` (8,917 B)
- Title "แต้มสะสม"; **hidden from menu (14/09)** but top tab navbar-8 still exists; mock-driven (`fetch('tk_dashboard_mock.json')`) + two server-generated ECharts (`petitionView.echart_2/3`, `escape=false`). Blocks: "จำนวนสมาชิก" (ทั้งหมด/สมาชิกใหม่, level cards carousel Classic/Silver/Gold, แลกแล้ว/ใช้แล้ว/หมดอายุ), "คูปองทั้งหมด"/"คูปองยอดนิยม" (tabs + list), "คะแนนที่ใช้แลกเทียบคะแนนคงเหลือ", "5 อันดับสาขาที่มีการสะสมคะแนนมากที่สุด", "คะแนนสะสมมากที่สุด", "ใช้คะแนนแลกมากที่สุด" (period filters decorative). Not in `PageAccessRules`. Defer.

### 1.20 `pages/inc/*` (belong to sales-document module — out of this group)
`save_confirm_dialog.xhtml` (45,319; "ยืนยันบันทึกข้อมูล" overlay + document tab card list), `sd_customer_field.xhtml` (2,381; lazy customer select via `sd_customer_lazy.js`), `sd_field_ro.xhtml` (2,842; read-only field). Included only by `sales_document_sub_1..7`. Not used by lead/activity/schedule/dashboard.

---

## 2. Legacy / backup / duplicate files in scope (status judged by name + references)

| File (bytes) | What it is | Status |
|---|---|---|
| `pages/lead_bk20260220.xhtml-tae` (105,125), `lead_bk_20260602.xhtml` (129,456) | old bean-based JSF lead list (`leadView`, p:tabView, p:dataTable) | backup |
| `pages/lead_step.xhtml` (137,062) | JSF board (leadView) pre-rewrite; referenced only by `PageAccessRules` + `LeadView` comment | legacy/dead |
| `pages/lead_detail_step.xhtml` (160,180) | JSF detail (`leadView`, p:dialogs); opened only by `resources/support/lead.js` which is loaded only by legacy pages | legacy/dead |
| `pages/lead_detail_sub1.xhtml` (63,336), `lead_detail_sub2-.xhtml` (25,021), `lead_detail_sub3.xhtml` (27,373) | includes of old detail (chat, contracts_master_data…) | legacy/dead |
| `pages/lead_detail_bak.xhtml` (85,919), `lead_detail_bk_20260602.xhtml` (389,722) | backups of detail | backup |
| `pages/activity_step.xhtml` (66,009) | JSF version (`activityView`) | legacy/dead |
| `pages/activity_bk20260220.xhtml-tae` (46,331), `activity_bk_20260602.xhtml` (85,593) | backups | backup |
| `pages/contact_history.xhtml` (34,633) | JSF history panel + add-contact dialog (`activityView.listContactActivityBean`), no inbound link | legacy/orphan |
| `pages/schedule_bk20260226.xhtml-tae` (47,827), `schedule_bk_20260602.xhtml` (51,468) | JSF (`scheduleView`) | backup |
| `pages/index_1.xhtml` (157,022), `index_bk20260225.xhtml-tae` (143,464), `index_bk_20260601.xhtml` (143,434) | old home using `dealerView` | backup/legacy |
| `web/index_1.xhtml` (195,393), `web/dashboard/index.xhtml` (304,633) | standalone "CRM Sun Lead — Dashboard v2.2.4" (2026-05-14), uses `dashboardView.csMasterJson` | legacy (only referenced in a Java comment) |
| `web/dashboard.xhtml` (70,922) | Pandora "Dealer" demo (Chart.js, `/WEB-INF/template.xhtml`) | legacy demo |
| `pages/dashboard_sun.xhtml` (379,091) | pre-rename copy of company dashboard (08-27) | superseded |
| `pages/dashboard_sun-xxx.xhtml` (147,912) | overview-only older tab, still listed in `PageAccessRules` | legacy |
| `pages/dashboard.xhtml.bak-20260724` (347,563), `dashboard_gold.xhtml.bak-selfcontained-20260724` (127,302), `dashboard_sun.xhtml.bak-arm` (76,667) | backups | backup |
| `pages/drilldown_tcs01.xhtml` (28,436) | JSF "ใบเจตจำนงค์" list clone (contractView) | legacy/dead |
| `pages/tk_dashboard_bk_tae20260115.xhtml` (17,348) | old tk dashboard | backup |

---

## 3. (a) Module-level proposal

### 3.1 Feature folders / routes (Angular standalone components, lazy `loadChildren`)
```
src/app/
  core/        auth (login, token interceptor, 401 {authRequired} handler, session store),
               permission.service (hasFeature, owner/_Sup helpers), pref.service (TS_PREF),
               api/ (board.api, dashboard.api, schedule.api, report.api …), i18n, error/toast (swal replacement)
  shell/       layout (grouped left rail + topbar tabs by navbar group, breadcrumb, theme, font-scale A/A/A)
  shared/      (see 3.2)
  features/
    auth/login
    home/                      -> /crm/home          (pages/index.xhtml)
    lead/                      -> /crm/opportunities         board + list + filter modal
                               -> /crm/opportunities/:opportunityId detail (+ stepbar, tabs, history panel, table view, 8 modals)
    activity/                  -> /crm/activities
    schedule/                  -> /crm/schedule      calendar | board | list, filter modal
    dashboard/                 -> /dashboard/*       overview, lead, steps, pipeline, status, customer-group,
                                                    status-by-customer, table, calendar, kpi (widget layout service)
    drilldown/                 -> /crm/drilldown/:code
    report/                    -> /report
    points/ (later)            -> /points            (tk_dashboard, mock)
```
Services/stores (signals): `LeadBoardStore`, `LeadDetailStore`, `ActivityStore`, `ScheduleStore`, `HomeDashboardStore`, `BiDashboardStore`, `MasterDataService` (movement-types, activity-groups per movementType cached, tags, sale-groups, provinces/districts, employees, countries), `FilterStateService` (replaces `/board/*-filter-state`), `WorkModalService`/`MoveStepService` (open dialogs).

### 3.2 Shared components / directives (appear repeatedly)
| Shared piece | Used in | Source behaviour |
|---|---|---|
| `StatusBar`/stats row (Total, New, Success, Lost, Inactive, Active+hot/warm/cold) ↔ WF-step track with ‹ › | lead, activity, home | `renderStats/renderWfStats`, 😊/🏷 toggle |
| `ProductDropdown` (movement types, remembers choice) | lead, activity, schedule, home | `/board/(master/)movement-types` |
| `GroupPill` dropdown (activity group, colour [C2], disabled ≤1) | lead, schedule | |
| `InterestBadge` ([C3]) / `StatusBadge` | lead, activity, home, assign modal | `INT_COLOR_MAP`, tint 20 % |
| `StepGroupTag` (stepper-palette position by master groups; fallback hash) | home, activity, schedule, lead list | `step_group_color.js` |
| `TagPill` (colorCode tint 20 %, text lightness ≤30 %) + `TagPaletteTag` ([C6] hash) | lead, activity, detail | `tag_pill_color.js` |
| `Stepbar` (shape svg, done/active/future) | lead_detail (+table view) | [C1] |
| `Avatar` (+ proxy http→/docproxy, default svg) / `AvatarStack` + `AccessPopover` | all | |
| `PhoneText` (`TsPhone`: country code, format) | lead, activity, home, detail, prospect | `phone_format.js` |
| `ExpandingSearch` (+ prospect suggest) | lead, activity, schedule | |
| `FilterModalShell` + toggle "ดูสถานะปิดโอกาสขายแล้ว", date-range, tag multi-select, searchable select, badge count | lead, activity, schedule(variant), history, dashboard | 4 near-copies today |
| `SearchableSelect`/`CustomDropdown` (always opens down) | everywhere (global auto-wrap!) | `open_down_select.js` |
| `InfiniteScroll` directive (scroll-near-bottom + auto-fill + load-more button / IntersectionObserver) | lead cols/list, activity, home, schedule, work modal | |
| `DragScroll` directive (mouse-grab horizontal scroll) | lead board/list, activity, drilldown, channel row | |
| `KanbanColumn` + HTML5 DnD (ghost, edge auto-scroll, drop hint) | lead board, schedule board | |
| `DataTable` simple (sticky head, sort, skeleton, empty state) | list tabs, dashboard tables, drilldown | |
| `Skeleton`, `EmptyState`, `ErrorPage`, `Toast`, `ConfirmDialog` | all | |
| `WorkModal` (view/add/edit appointment/task, customer search, owner list) | home, activity, schedule, lead_detail | |
| `MoveStepModal` / `ContactActivityForm` (8 channel pills + textarea + reference time) | lead, activity, lead_detail | |
| `CalendarMini` / `CalendarGrid` (month/week/day/year, more-popover) | home, schedule | |
| `EChart` wrapper (ECharts 5.6, resize, theme) + `FunnelView`, `DonutCanvas` | dashboard, home | |
| `DatePickerTh` (dd/mm/yyyy text + native picker) | dashboard header, forms | |

### 3.3 Data models (TypeScript sketch)
```ts
MovementType { id; code; name; usesWorkflowStep: boolean }
ActivityGroup { id; code; name; nameTh? }   // order = API order; colour derived by index [C2]
StatusSummary { total; new; success; lost; inactive; active: { total; hot; warm; cold } }
WfStepSummary { id; code; name; count }
LeadListItem { id; txNo; movementTypeId; movementTypeCode; prospectId?; prospectCode; prospectName; prospectAvatar; prospectTel;
  phoneCountryCode?; countryCode?; currentCityName; currentDistrictName?; currentCountryName?; amount; leadStatus; activeStatus;
  forwardStatus ("กลุ่ม - ขั้นตอน"); activityGroupId?; activityGroupName?; procedureGroupId?; saleGroupId/Name; salePersonId/Name;
  employeeId/Name/Code; unassigned?; lastUpdatedAt; tags: Tag[]; accessors: Accessor[]; note? }
KanbanColumn { stepId; stepName; items: LeadListItem[]; meta: PageMeta }   // id key varies: stepId|id|procedureId|activityStepId
LeadsResult { id (movementTypeId); activityGroupId; usesWorkflowStep; statusSummary; wfStepSummary[]; kanban[]; leads{items; meta} }
PageMeta { page; perPage; total; totalPages; hasMore? }
Tag { id; code; name; colorCode }  Accessor { id; code; name; type; attachFile }
OpportunityDetail { id; leadStatus; activeStatus; usesWorkflowStep; currentStep{procedureGroupId,procedureGroupName,procedureId,procedureName,wfsId,canReturn,...};
  activeSteps[]; prospect{id,…}; saleGroup; salePerson; employee; amount; targetYear; targetMonth; leadDemand; materialList[]; tagList[]; accessors[];
  appointmentList[]; taskList[]; contactHistoryList[]; permissions{canAddContactActivity} }
ContactActivityInput { leadId; channel: 'manual'|'call_in'|'call_out'|'sms'|'email'|'facebook'|'line'|'whatsapp'; content; procedureGroupId?; procedureId?; workRecordDate?; createById? }
ActivityRow { id; date; agent_code/name/avatar; customer_name/avatar; step_group; step_group_id; current_step; note; line; fb; whatsapp; email; sms; call; visit;
  due_date; interest; leadStatus; tags; saleGroupId; employeeId; salePersonId; children: ActivityChild[]; history: HistoryItem[] }
ScheduleItem { id; leadId; type:'APPOINTMENT'|'TASK'; subject/topic; detail; date; time; allDay; status: 'scheduled'|'re-schedule'|'success'|'cancel'|'doing'; prospectName; prospectImage;
  activityGroupId/Name; activityStepName; assignee…; remark }
HomeSummary { stats; stepSummary[{name,count}]; items[{prospectName,customerTel,handlerName,currentGroup,currentStep,leadStatus,attachFile}] }
DashboardFilters { year; month; employee; chanel; country; occupation; province; activity_group; fromdate; todate; datebasis:'contact'|'lead'|'wfs'; movementtype; ggwBranch }
DrilldownResult { success; message; data{ columns[{key,label}]; rows[]; total; mock } }
ReportDef { code; name; pdf?; pdfNote?; filters: string[] }  FilterDef { type; label; required? }
```

---

## 4. (b) 10 most complex behaviours / risks

1. **Hidden BFF logic and session state.** `/board/*`, `/dashboard/*` etc. are not thin proxies everywhere: `ContactActivityApiService` (1,009 lines) aggregates channel counts, children per group, history for `/board/activity-list`; `LeadBoardView` (1,806 lines) shapes `activity-detail`, `lead`, schedules; `LeadsBoardServlet` localises place names; role checks return `[]`; filters stored in HttpSession; images via `/docproxy`; login via `/login_proxy`. Decision needed: keep the Java BFF (lowest risk) or port to Angular+backend — response shapes in §6 must be preserved.
2. **Lead kanban**: per-column infinite scroll with meta paging, auto-fill, load-more button, DnD with owner/Sup permission, `SUCCESS/LOST` immobile, optimistic move + modal-confirm + revert, request race guard, skeleton states, edge auto-scroll, grab-scroll, filter-state persistence on every call, column id aliasing.
3. **`usesWorkflowStep` branching** drives UI in ≥8 places: stepbar, group pill, 🏷 toggle, list "กลุ่มขั้นตอน" column, filter modal fields, activity Type A/B tables, home table header and tag pills, schedule group pill, forward/return/close-group buttons; products list empty ⇒ force no-WF.
4. **Opportunities with several active groups.** Backend answers 400 unless `activityGroupId` is passed; it must propagate board → detail → sales_doc_rv, activity rows (`wfsId`), home rows (`data-groupid`), schedule links; stepbar state follows [C1] by id only; `CUR_AGID` vs `CUR_AGID_EFF` and `activityGroupId=0` on list tab.
5. **Three-layer permissions**: page `FEATURE_CRM_*`; action `CRM_*` keys; owner check (`employeeId == ss_employee_id`) bypassed by `_Sup`; special `returnToId` rule; gating of drag, add contact, schedule create/edit, forward, close, return, assign, tag, sales owner; server `PageAccessRules`. Must be a central `PermissionService` with per-record owner helpers.
6. **BI dashboard (`dashboard_company`, 7.5k lines)**: 10 tabs, ~20 ECharts/funnels/matrices, header filters with per-tab rules (date-basis radio lock, hidden dropdowns), progressive parallel loading with abort/generation tokens, widget edit mode (drag reorder/hide, server layout), per-branch `ggwBranch`, SLA tables with lazy expand, matrices with frozen columns, two iframes via `srcdoc`.
7. **Home dashboard** (`index.xhtml` + `dashboard.js`): 2-phase loading, de-duplicated GETs, retry, infinite scroll with append-only semantics (assign button relies on row index), NEW-only client filter with empty-streak guard, calendar day-filter vs month cards, assign modal cascades + in-place row update, custom canvas donut.
8. **`lead_detail` (7.9k lines)**: coupled state (form dirty/confirm, geo cascade with metro-geo, phone country-code rules, avatar upload, attachments via docproxy, product/material, multi-target forward with dependent dropdowns, table view with SLA, history filter shared caches, tab/table-view restore, reload-after-save patterns, per-tab permission gating, optimistic `ldLeadUpdate`).
9. **Schedule**: 4 calendar views with custom pickers, board with DnD status PATCH and per-column IntersectionObserver paging, two independent infinite lists, filter checkboxes with "all/none = omit" semantics, server-persisted view state, shared work modal with owner-based create rule, "more" popover.
10. **Cross-cutting look & i18n**: hundreds of Thai/EN/JP bundle keys; `--fs-adj` font scale inside every `calc()`; dark theme overrides everywhere; global `open_down_select` converting every `<select>`; colour systems ([C2], [C3], [C6], TagPillColor lighten rule, StepGroupColor); mixed-content `/docproxy` for images; backend-quirk workarounds (stuck `unassigned`, kanban id aliases, `phoneCountryCode` null, name/id mismatch of groups).

Other gotchas: `window.location.reload()` after saves (forward, contact, close) must become state refresh; `sessionStorage` token read in lead_detail (`crm_sun_lead_session`); `report.xhtml` still mock list; `drilldown` filters only client-side per page; `dashboard_kpi_frame` falls back to mock.

---

## 5. (c) Dead duplicates — safe to skip in migration
- All `*_bk*`, `*.bak*`, `*-tae`, `lead_detail_bak`, `lead_detail_bk_*`, `activity_bk*`, `schedule_bk*`, `index_bk*`, `tk_dashboard_bk_*`, `dashboard.xhtml.bak-*`, `dashboard_gold.xhtml.bak-*`, `dashboard_sun.xhtml.bak-*`.
- Pre-rewrite JSF/bean pages: `lead_step`, `lead_detail_step`, `lead_detail_sub1/2-/3`, `activity_step`, `contact_history`, `pages/index_1`, `drilldown_tcs01`.
- Superseded dashboards: `dashboard_sun`, `dashboard_sun-xxx`, `web/index_1`, `web/dashboard/index`, `web/dashboard` (Pandora demo).
- Decide with PO: `dashboard_gold` (Gold branch, include disabled), `tk_dashboard`/"แต้มสะสม" (hidden, mock), `pages/inc/*` (belongs to sales documents).

---

## 6. Appendix — API catalogue (BFF → backend `/triplesale-service/api/v1`)
| BFF path | Method | Backend / purpose | Used by |
|---|---|---|---|
| `/board/leads` | GET | `/leads` board/list (kanban, summaries, paging) | lead, home, work_modal, filter modal |
| `/board/lead?id&activityGroupId` | GET | `/leads/{id}` detail | lead_detail, work_modal, home |
| `/board/lead-update` | POST | `PATCH /leads/{target-year,target-month,amount,assign,active-status,demand}`, `PUT /leads/{id}/tags` | lead_detail |
| `/board/lead-assign` | POST | `PATCH /leads/assign` | home, activity |
| `/board/contact-activities` | POST | `POST /leads/{id}/contact-activities` (channel→label) | move modal, lead_detail, activity |
| `/board/activity-list` | GET | aggregate of `GET /contact-activities` (+`/leads/{id}/contact-history`) | activity |
| `/board/activity-detail` | GET | built from `/leads/{id}` | activity |
| `/board/activity-groups?leadId`, `/board/activity-steps?leadId&activityGroupId`, `/board/lead/contact-history?leadId` | GET | `/leads/{id}/…` | lead_detail |
| `/board/lead/{forward,forward-groups,forward-employees,return,return-groups,close,close-step,accessors,accessor-add}` | POST/GET | `/leads/{id}/…` | lead_detail |
| `/board/lead-materials`, `/board/material-groups`, `/board/materials` | POST/GET | products | lead_detail |
| `/board/prospect`, `/prospect/save`, `/prospect/avatar`, `/prospect/attachments` (GET/POST/DELETE), `/prospect/rv-attachments`, `/prospect-list`, `/prospect-leads` | mixed | prospect data & docs | lead_detail, suggest |
| `/board/schedule/fetch` | GET | `/schedules` | schedule |
| `/board/schedule/add`, `/board/schedule/edit` | POST / PATCH | `POST /schedules`, `PATCH /schedules/{id}` | work_modal, schedule |
| `/board/{filter-state, detail-filter-state, schedule-filter-state}` | GET/POST | HttpSession persistence | lead, lead_detail, schedule |
| `/board/master/movement-types?type=LD`, `/board/movement-types` | GET | `/master-data/movement-types/{type}` | lead, schedule, activity, home |
| `/board/master/activity-groups?movementTypeId`, `/board/master/employees-by-activity-group` | GET | master data | activity, schedule, home, work_modal |
| `/board/{tags,sale-groups,sale-persons,employees,provinces,districts,sub-districts,fiscal-years,metro-geo,chat-master-data}` | GET | master data | filters, forms |
| `/dashboardapi?action=summary|schedules` | GET | `/dashboard`, `/dashboard/schedules` | home |
| `/dashboard/{chart-single,overview,months,masterdata-all,masterdata-activitystep,employee-leads,widget-layout,…}` and `/dashboard/api/v1/sundashboard/*` | GET/POST | dashboard-triplesale-service | BI dashboard |
| `/goldapi/*`, `/golddashboard/*` | GET/POST/PUT/DELETE | kpi-gold-service | calendar/KPI frames, gold |
| `/board/drilldown?action=data&code&page&pageSize` | GET | `/drilldown/{path}` | drilldown |
| `/report-pdf?code&…`, `/rvreport?txno` | GET | PDF servlets | report, lead_detail |
| `/login_proxy` | POST | login / branches / select-org | login |
| `/docproxy?url=` | GET | image/doc proxy | all |

### Feature/role keys seen
Page: `MODULE_CRM, FEATURE_CRM_Dashboard, FEATURE_CRM_Prospect, FEATURE_CRM_Lead, FEATURE_CRM_ContactActivity, FEATURE_CRM_Calendar, FEATURE_CRM_Document, FEATURE_CRM_Report, CRM_Dashboard_View, MODULE_CHATBOX`. Action: `CRM_Lead_{View,Edit,Assign,Assign_Sup,Sales_Person_Assign,Close,Close_Sup,WorkflowStep_Close(_Sup),WorkflowStep_Rework(_Sup)}`, `CRM_ContactActivity_{View,Create,Create_Sup}`, `CRM_Schedule_{View,Create,Create_Sup,Edit}`, `CRM_Prospect_Edit`, `Report_<CODE>_View`.

### Open questions for the lead
1. Keep the Java `/board/*`, `/dashboard/*` BFF or call backend services directly from Angular (then re-implement activity-list/detail aggregation, filter-state, localisation)?
2. Is the Gold-branch dashboard still required? Is `tk_dashboard`/แต้มสะสม in scope for phase 1?
3. Report page: stay mock-driven + PDF servlet, or get a real report catalogue API?
