# Survey 2 - Backend / Core layer of `triple_sale_main` (JSF/PrimeFaces -> Angular)

Scope: authentication, HTTP/API access, error handling, i18n, configuration, realtime, domain model.
Source: `D:\Dev-Project\CRM_PROJECT\triple_sale_main` (SVN working copy, read-only) + sibling projects `triple_sale_chat`, `chat-webhook-socket-io`, `triple_sale_ai_bot`.
Surveyed 2026-10-19 (app version string in config: `1.1.0-260918-v2`, latest `versions` entry 1.0.21). **No secret values are reproduced; only property names.**

Confidence legend used in tables: **H** = read the code that makes/handles the call; **M** = inferred from comments/DTO names or only seen in client JS; **L** = seen only as a string / legacy / probably dead.

---

## 0. TL;DR - the 12 facts an Angular developer must know

1. **The browser never talks to the business backend directly.** The WAR (`/triplesale` context) is a **BFF**: ~100 `@WebServlet`s (`/board/*`, `/dashboard/*`, `/chat-api/*`, `/ai-api/*`, `/rvapi`, `/docproxy` ...) forward to the real microservices and attach the `Authorization: Bearer` token **server-side**. The token lives in the HTTP session (`ss_access_token`) and is **never sent to JS**. Browser auth = `JSESSIONID` cookie only (`fetch(..., {credentials:'same-origin'})`).
2. **Real backend** = a gateway exposing `triplesale-auth` (login), `triplesale-service` (CRM REST, `/api/v1/...`), `dashboard-triplesale-service`, `triplesale-chat` (+ Socket.IO), plus side services (CHAT_BOT analytics+help, aitran-service, ai-hub, a legacy JasperReports server). Base URLs are in `config.properties` and differ per environment (LAN dev / UAT / prod `suncrm.acecloud.co.th`).
3. **Login is 3-step against `triplesale-auth`**, done by `POST /login_proxy` (one servlet, 3 `action`s): `login` -> (if `requires_org_selection`) `branches` -> `select-org`. After success the servlet also calls `/auth/user-detail` and `/me/roles` and stores everything in session.
4. **Access token lifetime = `expires_in` (default 3600 s). A refresh token is stored but NEVER used.** After expiry the next request gets `TOKEN_EXPIRED` and the user is bounced to the login page. HTTP session timeout is 180 min (`web.xml`) but the token expires first.
5. **Unauthenticated detection** is done by `SessionTokenFilter`: page navigations -> `302 /index.face?auth=NO_TOKEN|TOKEN_EXPIRED`; JSON/fetch calls -> `401 {"authRequired":true,"responseCode":"NO_TOKEN|TOKEN_EXPIRED","message":...}`; `template.xhtml` monkey-patches `window.fetch` to show a modal and redirect to login. Spring Security itself is effectively **permitAll everywhere** (CSRF disabled).
6. **Authorization = role strings** from `GET /triplesale-service/api/v1/me/roles` (cached in session `ss_roles`; no refresh until re-login). Menus use `FEATURE_*` / `MODULE_*` keys, fine-grained buttons use `CRM_<Area>_<Action>` keys, a **page guard table** (`PageAccessRules`) maps page -> required role, and individual servlets re-check roles. `super_admin` (aliases) bypasses everything. Fail-closed: no roles => nothing visible.
7. **Envelope (new-gen services):** `{timestamp?, status, message, result, meta?:{page,perPage,total,totalPages}}`; errors `{status, message, error:{code, message|description, details?}}`. Several older endpoints use `result.items[]`+`result.total` or `result.result[]`. The BFF often **swallows errors into `[]`/`{}` with HTTP 200** (legacy) - newer servlets forward the real status.
8. **Pagination is inconsistent** (`page`+`perPage` on leads/prospects/schedules/contact-activities/chat; `page`+`pageSize` on documents, rv, drilldown, master-data). Infinite scroll is the UI norm (20 rows/page default).
9. **i18n**: only **th (default) and en** are wired (`messages_th/en.properties`, 2,838 keys each, perfectly in parity). `messages_jp.properties` is a **broken stub (120 keys, content is Thai)** and is *not* registered. Locale is chosen via `?lang=th|en` -> session `session_change_language` (+ best-effort `PATCH /me/preference`); **Thai is forced as default at every login**. The backend returns Thai-only master data, so the BFF post-translates province/district/country names (`masterdata_*.properties`).
10. **Realtime** = Socket.IO v4 client against Netty-SocketIO in `triple_sale_chat` (port 3321). Events: `message:new`, `conversation:update`, `socket:error` (server->client) and `conversation:join` (client->server). In the WAR it runs through a **long-polling-only proxy** (`/socket.io/*`) that adds the Bearer header; an Angular app that can reach the socket host should use WebSocket with `auth:{token}`.
11. **Uploads are base64-in-JSON** (no multipart anywhere in `triplesale-service`). Hard backend ceiling = **15,000,000 raw bytes** (20 M base64 chars); UI limit `triplesale.upload.max.bytes` = 14,680,064 (14 MB). Allowed extensions are whitelisted client + server.
12. **Many modules are mock/unwired**: promotion, market plan, petitions (PT/TK), the new sales-doc forms (qt/bk/ob/aq/ad) and `sales_document_*` forms are mostly local/mock or partially wired. See section 4.14 before estimating effort.

---

## 1. Topology & environments

### 1.1 Services the WAR talks to (config keys -> purpose)

| Service | Config key (env-specific) | Path prefix on that host | Auth the WAR sends | Notes |
|---|---|---|---|---|
| Auth | `triplesale.auth.base` | `/triplesale-auth/api/v1/...` | none (login) / Bearer (select-org, me/preference) | Dev LAN port 3310 |
| CRM API | `triplesale.api.base` | `/triplesale-service/api/v1/...` | Bearer | Dev LAN port 3300. OpenAPI: `GET {base}/triplesale-service/v3/api-docs` (referenced in `ProspectApiPayload` comments; a local `apidocs.json` is mentioned in docs but **is not in the repo**) |
| Dashboard | `triplesale.api.dashboard` | `/dashboard-triplesale-service/api/v1/{sundashboard,dashboards,golddashboard,...}` | **none** for the `sundashboard/*` proxy (open, filtered by `ggwBranch` param); Bearer for `callChartApi` and `/goldapi/*` | Dev LAN port 3307 (SUN earlier 3301). Old `kpi-gold-service` path is 404 now |
| Chat REST | `triplesale.chat.base` | `/triplesale-chat/api/v1/...` | Bearer | Spring Boot 3.5, context-path `/triplesale-chat`, port 3320 |
| Chat Socket | `triplesale.chat.socket` | `/socket.io` | Bearer (header) | port 3321; prod via `.../chat-socket` |
| Analytics + Help bot (CHAT_BOT) | `triplesale.ai.base` (+ key `triplesale.ai.key` -> header `X-Analytics-Key`) | `/api/analytics/customer...`, `/api/help/...`, `/product-images/{id}` | Bearer + `X-Analytics-Key` (analytics only) | port 8082; prod `/ai-base` route did not exist yet |
| AI translate | `aitran.service.base` (+ `aitran.api.key`) | actions `action=list/save/edit/quotation/file/translated/chat...` and external `/aitran-api/*` | `X-Api-Key` (server side) | port 8095 |
| AI HUB | `aihub.service.base` (+ `aihub.api.key`), switch `aihub.menu.enabled` | `/aihub-api/...` (`tools`, `files/{id}`, `library/{id}`, usage) | `X-Api-Key` (server side) | port 8096 |
| Reports (legacy JasperReports "red") | `triplesale.report.base` (report_config.properties) | `/red/rpt/jasperReport?...` (PDF) | none (server IP allow-listed) | WAR streams PDF back |
| File server (O2O) | derived (`triplesale.file.base`, host allow-list in `FileServerAccess`) | `/prospect/<epoch>/<file>` etc. | none | accessed only through `/docproxy` |

### 1.2 Environments seen in `config.properties` (commented alternates)

| Env | API / Auth / Dashboard base | Chat | AI | Report |
|---|---|---|---|---|
| **Production** | `https://suncrm.acecloud.co.th` (gateway; per-service `strip_path`) | `https://suncrm.acecloud.co.th/triplesale-chat`, socket `.../chat-socket` (alt host `chat.goldgateway.co.th:52341/52342`) | `.../ai-translator`, `.../ai-base` (missing) | `https://suncrm.acecloud.co.th` |
| **UAT** (currently active in file) | `https://uattriplesaleo2o.acecloud.co.th` (api, auth, dashboard, file) | LAN `192.168.24.233:3320/3321` | LAN `192.168.24.233:8082/8095/8096` | `https://suncrm.acecloud.co.th` |
| **Dev LAN** | `http://192.168.24.177:3300` (api) / `:3310` (auth) / `:3307` (dashboard); file `acedemo.acecloud.co.th:51774` | `192.168.24.233` | `192.168.24.233` | `192.168.24.177:8180/8080` |

Gateway caveat (from `versions`, 1.0.21): production gateway needs `strip_path` set per route; the UAT gateway had HTTP 500 on `/master-data/branches` and `/auth/user-detail` at times (the code has an override key `triplesale.api.branches.base` and fallbacks for this).

### 1.3 Context path
The WAR deploys as `/triplesale` (`target/triplesale.war`). Pages derive it from `location.pathname.split('/')[1] || 'triplesale'`. JSF servlet maps `*.face` and `*.xhtml`; page URLs look like `/triplesale/pages/lead.face?pid=1&page_id=1&act=1&navbar_menu=navbar_menu_*`. Welcome page `index.xhtml` = the login page. Other leftovers in code mention `/triplesalemain`, `/triple_sale_demo` (old names).
---

## 2. Authentication & authorization (answers Q1)

### 2.1 The only real login flow: `POST {ctx}/login_proxy` (JSON) - confidence H

UI: `web/index.xhtml` (the welcome page, not `web/login/index.xhtml`). Plain `fetch('login_proxy', {method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body})`. Servlet: `com.ace.spring.servlet.login.LoginProxyServlet` (30 s upstream timeout, 10 s connect).

```
Step 1  POST {ctx}/login_proxy                    body {username, password}
        -> POST {auth.base}/triplesale-auth/api/v1/auth/login   body {username, password}   (org is NOT sent any more; key triplesale.auth.org is unused)
        upstream 2xx: {status:200,message,result:{access_token, refresh_token, expires_in, requires_org_selection}}   (legacy flat shape also accepted: payload at top level)
        BFF reply to browser (token never included):
            requires_org_selection=false -> {"responseCode":"COMPLETE","username":..}
            requires_org_selection=true  -> {"responseCode":"ORG_REQUIRED","username":..}   (token kept in session as ss_pending_token / ss_pending_username)
            failure  -> HTTP = upstream status (502 on network error, 400 if empty fields)
                        {"responseCode":"ERROR","failMessage":"<Thai text>"}
                        "Invalid user credentials" or HTTP 401 -> failMessage = "wrong username or password" (Thai); empty fields -> "please enter Username and Password"
Step 2  POST {ctx}/login_proxy  body {action:"branches"}        (only when ORG_REQUIRED)
        -> GET {api.base | triplesale.api.branches.base}/triplesale-service/api/v1/master-data/branches   Bearer <pending token>
        reply {"responseCode":"COMPLETE","branches":[{id,code,name,nameTh},...]}   (401 + "session expired" if no ss_pending_token)
        side effect: session ss_branch_map = {branchId: code} (fallback source for ss_branch_code)
Step 3  POST {ctx}/login_proxy  body {action:"select-org", org:"<branch id as string>"}
        -> POST {auth.base}/triplesale-auth/api/v1/auth/select-org   body {org}   Bearer <pending token>
        success -> real token -> finishLogin(); reply {"responseCode":"COMPLETE","username":..}; pending attrs removed
```
`finishLogin()` (used by step 1 w/o org selection and by step 3):
1. `SharedCaches.clearAll()` (server-wide caches), clear RV branch cache.
2. Session: `ss_access_token`, `ss_refresh_token`, `ss_token_expires` (epoch ms = now + `expires_in`*1000, default 3600), `ssousername`.
3. `GET {api.base}/triplesale-service/api/v1/auth/user-detail` (Bearer, 20 s) -> `ss_user_detail` (whole `result` as JSON string), `ss_branch_code` (= `result.employee.branch.code`, e.g. "SUN"), `ss_employee_id` (= `result.employee.id`), `ss_profile_name` (= `result.profile.name`). Failure is non-fatal (logged).
4. `GET {api.base}/triplesale-service/api/v1/me/roles` (Bearer, 20 s) -> `ss_roles` (`Set<String>`). Failure is non-fatal but leaves roles empty => **all menus disappear** (fail-closed). A `TEMP_GRANT_SUPER_ADMIN` switch (currently `false`) can inject `super_admin`.
5. `ensureBranchCode()` after select-org: if `ss_branch_code` still empty, fill from `ss_branch_map[org]`.

Browser side after COMPLETE: `sessionStorage.ts_login = <json>`, `sessionStorage.ts_username`, then `location.href = pages/index.face?pid=1&page_id=1&act=1&navbar_menu=navbar_menu_home`. On the login page, if `ts_login.responseCode==='COMPLETE'` and URL has no `auth=` it auto-redirects to the home page; if `?auth=NO_TOKEN|TOKEN_EXPIRED` is present it **clears** `ts_login/ts_username` and shows the form (prevents redirect loops).
"Forgot password" = static message "contact the administrator". UI has show/hide password, org dropdown (`nameTh || name || code`, label `"<name> (<code>)"`), Enter-key submit, loading overlay.

### 2.2 Other login paths in the repo (all legacy / dead - do NOT port)
| Artifact | What it is | Status |
|---|---|---|
| Spring Security `<form-login login-page="/login/" ... username-parameter="username" password-parameter="password">` + `CustomAuthenticationHandler` + `UserDetailsServiceImpl` (Hibernate `Yot_User_Account` + roles in MySQL `red`) | Old DB-backed form login, success -> `/pages/dashboard.face?pid=..`; sets session `roles`, `authen`. `filterProcessesUrl=/login` | **Legacy**, the real UI never posts to it (`web/login/index.xhtml` is just a `<meta refresh>` to `{server_api}/red/login/posgoldgui.jsp`). Keep only `/logout`. |
| `loginsso` servlet + `login_do` + `login_error` + `web/sso/*.jsp` (`j_security_check`, `ssousername/ssopassword/ssocompanyid` params, raw JDBC to `jdbc<ns>.properties`, sets `has_roles`, `sso_*`) | "SSO" from the old ERP ("red") - auto-posting hidden form to container security | **Legacy / unused**. No external SSO provider (no OAuth/SAML/OIDC) exists in the current app. |
| `LoginController` (JSF bean) | old JSF login that forwards to `/logout` | Legacy |
| `TriplesaleApi.authTokenFresh_XXX` (commented): `POST /auth/token` with headers `username/password/deviceID/mversion` and static config credentials; `ApiConfig.LOGIN` = `/oauth/requesttoken_mv3` | Pre-login-page "service account" token | Dead (commented / unused) |
| `web/login.xhtml` | PrimeFaces "Pandora" demo template | Dead |

### 2.3 Token lifetime, refresh, logout, timeouts
* Token: opaque to the WAR (JWT-like, WAR does not parse it). Expiry tracked as `ss_token_expires`.
* **No refresh flow.** `ss_refresh_token` is saved and only deleted on expiry (`SessionTokenFilter`). The chat service independently validates tokens by calling `{AUTH_VERIFY_URL}` = `/triplesale-service/api/v1/auth/user-detail` (caching result).
* HTTP session timeout: **180 min** (`web.xml`). JSF state saving = client. JSF `numberOfViewsInSession=30`.
* **Logout**: browser does `location.href = {ctx}/logout` (after a SweetAlert confirm "Confirm logout?" and clearing the AI-help chat from sessionStorage). Spring Security `<logout invalidate-session="true" delete-cookies="JSESSIONID,SPRING_SECURITY_REMEMBER_ME_COOKIE" logout-success-url="/index.face">` (CSRF disabled so a plain GET works). **The backend token is not revoked** (no auth-service logout call). `SharedCachesSessionListener` clears server-wide caches when a session dies. `ts_login/ts_username` in sessionStorage are intentionally NOT cleared at logout.
* Keyboard: `Escape` triggers `rc_checkLogin()` (JSF remote command) in template.

### 2.4 How a page learns it is unauthenticated - `SessionTokenFilter` (`@WebFilter`) - H
Covered URL patterns: `/pages/*, /board/*, /rvapi, /dashboardapi, /dashboard/*, /golddashboard/*, /api/*, /chat-api/*, /ai-api/*, /help-api/*, /rvreceipt, /rvreport, /report-pdf, /docproxy, /docattach`.
**Not covered:** `/index.face` (login), `/login_proxy`, `/socket.io/*` (self-check -> `401 {"authRequired":true,"responseCode":"NO_TOKEN","status":401}`), `/aihub/*`, `/aitran` (both self-check session, 401/503), `/aitran-api/*` (API-key guarded upstream), `/goldapi/*` (**no session check at all** - attaches Bearer only if present; security gap to close in the new design).

| Condition | Page / navigation (`/pages/*`, `*.face`, `*.xhtml`, `/rvreceipt`, `/rvreport`, `/report-pdf`, `/docproxy`, `/docattach`) | JSF ajax (`Faces-Request: partial/ajax`) | API / fetch |
|---|---|---|---|
| no `ss_access_token` | `302 {ctx}/index.face?auth=NO_TOKEN` | XML `<partial-response><redirect url=".../index.face?auth=NO_TOKEN"/>` | `401 application/json {"authRequired":true,"responseCode":"NO_TOKEN","message":"Please log in"(Thai)}` + `Cache-Control: no-store` |
| `now >= ss_token_expires` | same, code `TOKEN_EXPIRED` (also removes `ss_access_token/ss_refresh_token/ss_token_expires`) | same | same with `TOKEN_EXPIRED`, message "session expired, please log in again" (Thai) |
| authenticated | adds `X-Content-Type-Options: nosniff`, then page-guard (2.6), then continues | | |

Client auth guard (in `WEB-INF/pages/template.xhtml`, every page): wraps `window.fetch`; on `status===401` it clones the response, parses JSON, and if `authRequired` shows a modal (title "Session expired"/"Please log in", button OK) that clears `sessionStorage.ts_login/ts_username` and goes to `/<ctx>/index.face`. Only one modal at a time (`__authModalShown`). Other 401s (without `authRequired`) are not intercepted.

**Angular equivalent:** an `HttpInterceptor` for 401 (+ `authRequired` or just 401), a route guard (token present & not expired & role), and handling of the `?auth=` query on `/login`.

### 2.5 Spring Security rules (`applicationSecurity.xml`) - H
Config: `<http auto-config="true" request-matcher="ant">`, **`<csrf disabled="true"/>`**, form-login `/login/` (legacy), logout as above. `intercept-url` rules - **every rule is `permitAll`; there is no catch-all deny**, so unmatched URLs are also open. The real access control is `SessionTokenFilter` + role checks.

| Pattern(s) | Access | Why / what it is |
|---|---|---|
| `/login/**`, `/WEB-INF/**`, `/`, `/index.face`, `/index.xhtml`, `/index.html`, `/login_proxy` | permitAll | login page + login proxy |
| `/pages/**`, `/dashboard/**`, `/golddashboard/**`, `/goldapi/**`, `/board/**`, `/board/lead-create`, `/chat-api/**`, `/ai-api/**`, `/help-api/**`, `/socket.io/**`, `/docproxy`, `/api/**`, `/rvapi`, `/dashboardapi`, `/docattach`, `/rvreceipt`, `/rvreport`, `/report-pdf`, `/aitran`, `/aitran-api/**`, `/aihub/**` | permitAll | needed so Spring does not 302 fetch calls to `/login/` and return HTML; real check is the filter/servlet |
| static: `/**/*.{css,js,map,png,jpg,jpeg,gif,svg,ico,webp,woff,woff2,ttf,eot,otf,mp3}`, `/css/** /js/** /resources/** /fonts/** /images/**`, `/jakarta.faces.resource/**`, fontawesome dirs | permitAll | assets |
| `/logout` | (Spring default logout filter) | invalidates session, deletes cookies, redirect `/index.face` |

CORS: **none in the WAR.** `web.xml` has a Tomcat `CorsFilter` block **commented out**; `com.ace.utils.CorsFilter` (`*` origin) exists but is not registered. All browser calls are same-origin. Upstream CORS facts: `triplesale-chat` `CorsConfig` allows `/api/**` for origins in `cors.allowed-origins` (default `http://localhost:8080`); the dashboard SUN service was CORS-opened for the WAR origin in the past while the "gold" API blocked it (hence `/goldapi` proxy); CORS of `triplesale-service` for a new origin is **unknown - must be asked from the backend team**.

### 2.6 Authorization model - H
**Source of truth:** `GET /triplesale-service/api/v1/me/roles` -> `result` = array of strings, or array of objects with one of `roleName|role|name|code` (parser accepts both). Stored once at login as an immutable `Set<String>`.

Evaluation (`SessionRoles`): `hasRole("A,B")` = any (case-sensitive exact), `hasAllRoles`, `hasRolePrefix("Report_")`. **super_admin aliases** (case-insensitive): `super_admin, superadmin, "super admin", role_super_admin, super_super_crm` -> pass everything. Empty roles -> false.

Three layers:
1. **Menu visibility** (`groupedMenu.xhtml`, `topbar.xhtml`): `MODULE_CRM` (CRM menu group), `FEATURE_CRM_Dashboard`, `FEATURE_CRM_Prospect`, `FEATURE_CRM_Lead`, `FEATURE_CRM_ContactActivity`, `FEATURE_CRM_Calendar`, `FEATURE_CRM_Document`, `FEATURE_CRM_Report`, `MODULE_CHATBOX`; report entries `Report_<CODE>_View` (e.g. `Report_SUN-LD-01_View`; any `Report_*` shows the Report menu); AI HUB menu uses `aihub.menu.enabled`.
2. **Page guard** `PageAccessRules` (flag `triplesale.page.guard.enabled`, default on): page file name (no extension) -> required role(s); on failure `403` HTML page (or JSF redirect to `/pages/index.face?pid=1&page_id=1&act=1` for ajax). Pages **not** listed are open to any logged-in user.

| Pages | Required role |
|---|---|
| `chatbot` | `MODULE_CHATBOX` |
| `dashboard, dashboard_sun, dashboard_gold, dashboard_company, dashboard_kpi_frame, dashboard_calendar_frame` | `FEATURE_CRM_Dashboard` |
| `drilldown, drilldown_tcs01` | `CRM_Dashboard_View` |
| `contracts, contracts_master_data, supporting_documents` | `FEATURE_CRM_Prospect` |
| `lead, lead_detail, lead_detail_step, lead_detail_sub1, lead_detail_sub3, lead_step` | `FEATURE_CRM_Lead` |
| `activity, activity_step, contact_history` | `FEATURE_CRM_ContactActivity` |
| `schedule` | `FEATURE_CRM_Calendar` |
| `sales_document, sales_document_2..7, sales_document_sub_2..7, sales_doc, sales_doc_pay, sales_doc_rv, sales_doc_rv_list, quotation, AA` | `FEATURE_CRM_Document` |
| `report` | `FEATURE_CRM_Report` |
| intentionally unguarded: `index, ai_translator, market_plan*, promotion*, pt_*, tk_dashboard, underconstruction`, (`ai_hub` governed by switch) | - |

3. **API/servlet gates** (re-check because URLs can be called directly): `/board/leads` and `/board/lead` need `CRM_Lead_View` (else `[]` / 403 `{status,message,error}`); drilldown `CRM_Dashboard_View`; RV create/attach/approve `CRM_RV_View,CRM_RV_Edit,FEATURE_CRM_Document` (any); chat proxy: `MODULE_CHATBOX` + (`Chat_Assigner_View` or `Chat_Social_Admin_View`), reply `Chat_Reply`, link prospect `Chat_Prospect_Create`, bot toggles/AI companies `Chat_AI_Chat_Bot`, channel/quick-message CRUD + secrets/webhook-info `Chat_Social_Admin_View`; analytics proxy `MODULE_CHATBOX` + `Chat_AI_Analytics_AI`; chat prospect creation `Chat_Prospect_Create`; AI HUB library admin `AIHUB_Library_Manage`; API-log tool `super_admin` unless `triplesale.apilog.require.superadmin=false`.

Fine-grained button/field roles seen in xhtml/JS (`commonBean.hasFeature(...)`): `CRM_Prospect_{View,Create,Edit}`, `CRM_Lead_{View,Edit,Assign,Assign_Sup,Close,Close_Sup,Sales_Person_Assign,WorkflowStep_Rework,WorkflowStep_Rework_Sup,WorkflowStep_Close,WorkflowStep_Close_Sup}`, `CRM_Schedule_{View,Create,Create_Sup,Edit}`, `CRM_ContactActivity_{View,Create,Create_Sup}`, `CRM_RV_{View,Edit}`, `CRM_Dashboard_View`, and per-document `CRM_Document_<Type>_{View,Create,Edit}` for `LetterofIntent, LegalCreditServiceRequest, Servicecontract, LoanAgreement, PreliminaryCreditApproval, PropertyProjectContract, CreditApplication`. The `_Sup` variants = supervisor override; the non-Sup variants additionally require the user to be the **lead owner** (compare `ss_employee_id` with lead assignee) for schedule/activity/assign/rework/close actions.

Active company/branch: chosen at login (`select-org`); `ss_branch_code` (= employee's home branch) is sent as `ggwBranch` to dashboard APIs; backend filters data by the *selected org* (`activeBranchId`). Topbar shows `"<username> (<branch name>)"` via `ActiveBranch` (session `ss_active_branch_*`; the old `GET /me/permission-context` was removed from the backend on 20/08/2026).

### 2.7 Session attribute catalogue (server) - what the Angular auth store must model
| Key | Content | Set by |
|---|---|---|
| `ss_access_token` | Bearer access token | login_proxy |
| `ss_refresh_token` | refresh token (unused) | login_proxy |
| `ss_token_expires` | epoch ms | login_proxy |
| `ssousername` | username typed at login | login_proxy |
| `ss_pending_token`, `ss_pending_username`, `ss_branch_map` | between login and select-org | login_proxy |
| `ss_user_detail` | JSON of `/auth/user-detail` `result` (employee{id,code,branch{id,code,name}}, profile{name}, preference{lang...}) | login_proxy |
| `ss_branch_code`, `ss_employee_id`, `ss_profile_name` | derived from user-detail | login_proxy |
| `ss_roles` | `Set<String>` | login_proxy |
| `session_change_language` | `th` / `en` | `?lang=` handler |
| `ss_active_branch_*` | cached branch name/code | ActiveBranch |
| `ld_filter_state`, schedule/detail filter states, `salesDocAttachStore`, countries/provinces caches, RV branches cache | per-user UI state/caches kept in session | respective servlets |
Client storage: cookie `JSESSIONID`; `sessionStorage` `ts_login`, `ts_username`, `ct_avatar`, AI-help chat; `localStorage`/cookies via `TS_PREF` (`tsp_*` cookie mirror, 1 year): `app-theme` (light/dark), `ses-fontsize`, `ses-fontnumber`, `ss-navbar-active`, dashboard/activity filters, `cb_sec_*` (chat panels), `ts_ai_base` (debug override), `aihub.model.*`.
---

## 3. How the browser reaches data (answers Q2)

### 3.1 Four mechanisms (all in one app)
| # | Mechanism | Used by | Notes |
|---|---|---|---|
| A | **Same-origin `fetch()` -> BFF servlet -> upstream REST** (`/board/*`, `/dashboard/*`, `/rvapi`, `/dashboardapi`, `/chat-api/*`, `/ai-api/*`, `/help-api/*`, `/goldapi/*`, `/aihub/*`, `/aitran`) | ~680 `fetch(` calls in `web/` (5 `XMLHttpRequest`, 1 `$.ajax` - the rest of jQuery use is legacy) | JSON in/out, cookie auth. Relative URLs like `../board/schedule/add` (relative to `/triplesale/pages/x.face`) or `#{request.contextPath}/board/...` |
| B | **JSF beans (server-rendered)**: `@Named @ViewScoped` beans (`ContractView`, `LeadBoardView`, `DashboardView`, `GoldDashboardView`, `Sales_DocumentView`, `CalendarDashboardView`, `ChatView`, `ReportView` ...) call `Data_API`/`TriplesaleApi` in `@PostConstruct`/actions and inject results into the page via EL (`#{dashboardView.dashboardSunUrl}`, `#{commonBean.msg['key']}`) or PrimeFaces ajax (`rc_*` remote commands) | first paint of many pages, forms in `contracts_master_data`, `sales_document_*` | Must be re-implemented as Angular services - there is no HTTP endpoint for what these beans do except where a servlet mirrors it |
| C | **Navigation / iframes**: `window.open('/report-pdf?...')`, `/rvreceipt`, `/rvreport`, `<img src="/docproxy?url=...">`, `<iframe srcdoc>` for dashboard KPI/calendar frames (`__GOLDAPI__` placeholder replaced with `{ctx}/goldapi`) | PDFs, previews | Cookie-authenticated GETs; filter returns 302 (not JSON) when logged out |
| D | **Direct browser -> external**: only CDN scripts (socket.io 4.7.5, font-awesome, Google Fonts) and, historically, the SUN dashboard service (`SUN_API` constant from `dashboardView.dashboardSunUrl`, overridden to the proxy route in the final script block of `dashboard_company.xhtml`) | | Avoid in Angular unless CORS is confirmed |

Rule of thumb: **every Angular `HttpClient` call should target the logical endpoints in section 4 (upstream column)** and carry `Authorization: Bearer <access_token>` itself (or a thin BFF must be written).

### 3.2 Token propagation (describe only)
* Server: `TriplesaleApi.authTokenFresh()` reads `ss_access_token` from the current request's session (via `CurrentRequest` ThreadLocal listener) and returns it without the `Bearer ` prefix; `Data_API.sendGET/POST/PUT/PATCH/DELETE` prepend `Authorization: Bearer `. Servlet proxies add the header themselves.
* Worker threads cannot read the session, so tokens are captured on the request thread and passed in (e.g. `ProspectListService` enrich pool).
* Extra server-side headers: `X-Analytics-Key` (CHAT_BOT analytics), `X-Api-Key` (aitran/ai-hub), `actor` + `sessionKey` appended **as query params** to aitran/ai-hub calls (caller-supplied copies are stripped). Dashboard SUN proxy sends **no** auth header.
* Upstream timeouts: `Data_API` connect/read **240 s** (!), login 10/30 s, user-detail/roles 20 s, chat proxy 30 s, socket poll 70 s, analytics ~90 s, dashboard proxy 15/20 s, prospect-enrich 5/15 s.
* A built-in developer tool (`/board/api-log`, "Log" button on topbar, `ApiLog`) keeps the last `triplesale.apilog.max` (300) server-side calls per session with curl replays that include the real Bearer token - **never port this into the new client; it only exists because the token is hidden**.

### 3.3 Base-URL configuration
`config.properties` keys (hot-reloaded on file change, no restart): `triplesale.api.base`, `triplesale.auth.base`, `triplesale.api.dashboard`, `triplesale.file.base`, `triplesale.chat.base`, `triplesale.chat.socket`, `triplesale.ai.base`, `aitran.service.base`, `aihub.service.base`, `triplesale.report.base` (in `report_config.properties`). Optional override `triplesale.api.branches.base`. Angular: use `environment.*.ts` with the same keys per env (see section 8).

### 3.4 Behaviours the BFF adds that an Angular client must reproduce (not visible in the upstream contract)
1. **Role pre-checks** (see 2.6) - UI should also hide/disable; server returns 403 / empty.
2. **Location-name localisation** (`MasterDataI18n`): backend sends provinces/districts in **Thai only** and countries in **English only** (`nameTh` empty). For `lang=en`: `currentCityName/currentDistrictName` replaced by `province.<CODE>` / `district.<CODE>` lookups; for `lang=th`: `currentCountryName` replaced by `masterdata_th.properties[code]` (270 countries). `OpportunityDetail` adds `currentCityNameI18n/currentDistrictNameI18n/currentCountryNameI18n` rather than overwriting. Files: `masterdata_th.properties` (270 keys = country codes), `masterdata_en.properties` (162 keys: `province.<CODE>` x77, `district.<CODE>` x79, product/sales-status names like `LD-WFS-A=...`).
3. **Province list cleaning**: `/master-data/provinces` returns 2,739 rows (2,659 foreign cities). BFF keeps Thai-only names with non-empty code, de-dupes by code (keeps highest id) -> 77 provinces; session-cached.
4. **Address data fallback**: `/master-data/sub-districts` is empty, so `GET /board/metro-geo` serves a bundled `metro_geo.json` (77 KB, 488 rows, 79 districts, 6 provinces: Bangkok metro) `{p,pid,pn,d,dn,s,sn,z}` with zip codes.
5. **Field renames / cleanups before forwarding**: schedule add: `activityGroupId` -> `procedureGroupId`, drops `movementTypeId`; contact-activity add: `leadId` moved to path, `channel` converted to O2O label (`call_out`->`Call Out`, `callin`->`Call In`, `sms`->`SMS`, `email`->`Email`, `facebook`, `line`->`Line`, `whatsapp`->`WhatsApp`, `manual`->`Manual`); prospect PUT body filtered to `ContactReqDTO` fields and `sendDoc*` keys renamed (request `sendDocXxx` vs response `senddocXxx`); `customerType` `company` (legacy) normalised to `juristic`, `taxBranch` defaults `00000` for juristic (backend validator).
6. **File URL normalisation** (`AttachUrl`): backend prefixes host on every GET and again on PUT -> `http://h/http://h/...` chains; `collapse()` for display, `toRelative()` before sending. Files are served via `/docproxy?url=` (allow-listed host, inline only for pdf/png/jpg/jpeg/gif/webp, others forced download + CSP sandbox).
7. **Aggregation**: lead list "enrichment" with `/prospects/{id}/quick-view` (parallel, 1 thread by config), RV/documents list paging, dashboard `enrichOpportunityImages` (fills missing `attachFile` by matching prospect name from `/prospects?page=1&pageSize=500`).
8. **Caching in session / server**: countries (271), Thai provinces, RV master data (8 sets), dashboard responses (`triplesale.api.dashboard.cache.ttl=30` s). Cleared at login/logout.
9. **Server-local persistence with no backend API**: dashboard widget layout (JSON files per employee), filter states (HttpSession), sales-document attachments (`salesDocAttachStore` in session, because `POST /documents/{id}/attachments` failed), countries/provinces/RV caches. These need an explicit decision in Angular (localStorage, new API, or BFF).
10. **Filter state persistence** (`/board/filter-state`, `/board/detail-filter-state`, `/board/schedule-filter-state`): GET returns the JSON saved in session, POST saves it (replaces sessionStorage so state survives navigation). In Angular use `localStorage`/NgRx persistence.
---

## 4. API catalogue (answers Q3)

Legend: **BFF** = same-origin route the current JS calls (`{ctx}` = `/triplesale`); **Upstream** = real REST call (prefix omitted: `{api}` = `triplesale.api.base` + `/triplesale-service/api/v1`; `{auth}` = `triplesale.auth.base` + `/triplesale-auth/api/v1`; `{dash}` = `triplesale.api.dashboard` + `/dashboard-triplesale-service/api/v1`; `{chat}` = `triplesale.chat.base` + `/api/v1`). All upstream calls use `Authorization: Bearer` unless stated. "H/M/L" = confidence.

### 4.1 Auth / current user
| BFF | Upstream | Purpose / params | Conf |
|---|---|---|---|
| `POST /login_proxy` `{username,password}` | `POST {auth}/auth/login` | step 1 (see 2.1) | H |
| `POST /login_proxy` `{action:"branches"}` | `GET {api}/master-data/branches` (pending token) | org picker `[{id,code,name,nameTh}]` | H |
| `POST /login_proxy` `{action:"select-org",org}` | `POST {auth}/auth/select-org` `{org}` | real token | H |
| (login side-call) | `GET {api}/auth/user-detail` | `result{employee{id,code,branch{id,code,name}},profile{name},preference{lang,...}}` | H |
| (login side-call) | `GET {api}/me/roles` | roles array | H |
| `?lang=th\|en` on any page | `PATCH {auth}/me/preference` `{lang}` | best-effort persistence of language (theme/fontSize planned in doc comment, only `lang` implemented); **not read back at login** (Thai forced) | H |
| `GET /logout` | - | Spring Security logout | H |
| `GET /board/api-log[?view=roles]`, `POST /board/api-log?action=clear`, `DELETE` | - (in-memory) | dev tool; `view=roles` returns session roles | H (do not port) |
| `GET /board/debug/session-roles` | - | debug | H (do not port) |

### 4.2 Opportunities (= "โอกาสขาย", sales opportunities) - main CRM resource
| BFF | Upstream | Key params / body | Response (key fields) | Conf |
|---|---|---|---|---|
| `GET /board/leads` | `GET {api}/leads?viewMode=board\|list` | `movementTypeId, activityGroupId, activityStepId (single kanban column, infinite scroll), search, showClosed, dateRangeType, dateFrom, dateTo (YYYY-MM-DD), provinceId, districtId, activeStatus, saleGroupId, salePersonId, employeeId, tagIds, sortBy (default txdate_desc), page (1), perPage (20)` | `result` = `{statusSummary:{total,success,lost,inactive,new}, kanban:[{stepId,stepCode,stepName,amount,items:[LeadCard]}], leads:{items:[LeadCard]}, wfStepSummary?}`; BFF returns `result` only, `[]` on error/no role | H |
| `GET /board/lead?id&activityGroupId` | `GET {api}/leads/{id}[?activityGroupId=]` | needs `CRM_Lead_View`; backend 400 if workflow lead lacks `activityGroupId` | `result` = OpportunityDetail (id, txNo?, contactDate, targetMonth, targetYear, employeeName, activeStatus, leadStatus, leadDemand, amount, usesWorkflowStep, materialList[], appointmentList[], taskList[], contactHistoryList[], tagList[], activeSteps[], currentStep, prospect{...}, prospectInfo{...}); errors forwarded as `{status,message,error:{code,message}}` with real HTTP status | H |
| `POST /board/lead-create` | `POST {api}/leads` then optional `PATCH {api}/leads/assign` | `{prospectId, movementTypeId, procedureGroupId, assignToId, employeeId, saleGroupId?}` (saleGroup default "CS01") | `{status,result:{txNo,...}}` | H |
| `POST /board/lead-update?action=` | `PATCH {api}/leads/target-year` `{leadId,yearCode}`; `/target-month` `{leadId,month}`; `/active-status` `{leadId,activeStatus}` (hot/warm/cold); `/demand` `{leadId,demand}`; `/amount` `{leadId,amount}`; `/assign`; `PUT {api}/leads/{id}/tags` | partial updates | backend JSON passthrough | H |
| `POST /board/lead-assign` | `PATCH {api}/leads/assign` | `{leadId, employeeId?, salePersonId?, saleGroupId?, wfsId?}` | passthrough | H |
| `POST /board/lead/close` | `POST {api}/leads/{leadId}/close` | `{leadId, outcome:"sold"\|"lost"}` | passthrough | H |
| `POST /board/lead/close-step` | `POST {api}/leads/{leadId}/close-step` | `{leadId, wfsId, remark}` ("lock current workflow step") | passthrough | H |
| `POST /board/lead/forward` | `POST {api}/leads/{leadId}/forward` | `{leadId, targets:[{activityGroupId,activityStepId,assigneeEmployeeId}], currentActivityGroupId?, remark?}` | passthrough | H |
| `POST /board/lead/return` | `POST {api}/leads/{leadId}/return` | `{leadId, currentActivityGroupId, returnToActivityGroupId, remark}` | passthrough | H |
| `GET /board/lead/forward-groups?leadId&currentActivityGroupId` | `GET {api}/leads/{id}/forward-groups` | | groups list | H |
| `GET /board/lead/forward-employees?leadId&activityGroupId&currentActivityGroupId` | `GET {api}/leads/{id}/forward-employees` | | employees | H |
| `GET /board/lead/return-groups?leadId&currentActivityGroupId` | `GET {api}/leads/{id}/return-groups` | | groups | H |
| `GET /board/forward-assignees?id&activityStepId` | `GET {api}/leads/{id}/forward-assignees` | | assignees | H |
| `GET /board/activity-groups?leadId` | `GET {api}/leads/{id}/activity-groups` | - | ordered left->right, `{id,name,code}`; drives Stepbar | H |
| `GET /board/activity-steps?leadId&activityGroupId` | `GET {api}/leads/{id}/activity-steps` | - | steps of a group | H |
| `GET /board/lead/contact-history?leadId` | `GET {api}/leads/{id}/contact-history` | - | list `{channel, content, procedureGroupName/Id/Code, procedureName/Id/Code, salePerson{...}, changeDate}` | H |
| `GET /board/lead/accessors?leadId` | `GET {api}/leads/{id}/accessors?all=true` | - | people who can access the lead | H |
| `POST /board/lead/accessor-add?leadId` | `POST {api}/leads/{id}/accessors` `{employeeIds:[..]}` | - | batch add | H |
| `POST/DELETE /board/lead-materials` | `POST/DELETE {api}/leads/materials` (DELETE **with body**) | - | trade items (materialList) | M |
| `GET /board/prospect-leads?prospectId&keyword` | `GET {api}/leads` (+ `/master-data/movement-types/LD`) | - | leads of a customer, aggregated per product/group | H |
| `GET /board/activity-detail?id&txNo&wfsId&activityGroupId` | `GET {api}/leads/{id}` | - | popup detail | M |

Lead statuses: `leadStatus` = `new / success / lost / inactive` (UI treats `SOLD` == `SUCCESS`), `activeStatus` = `hot / warm / cold`. Stepbar rule: `state = done (index<active) / active (id == currentStep.procedureGroupId and status not SUCCESS|LOST) / future`; show only when `usesWorkflowStep=true`. Colours: INT_COLOR_MAP (`HOT #EB5050, WARM #FF8E4E, COLD #4B84FF, INACTIVE #6043B6, NEW #EB4FA0, LOST #8A92A6, SUCCESS/SOLD #008B5A`), activity stepper palette by group count (rows for 1..12 groups), 20-colour tag palette hashed from group name (`h=h*31+charCode`, `abs(h)%20`) - see project `CLAUDE.md` sections 1-3 and 6.

### 4.3 Prospects (= customers / "ลูกค้าเป้าหมาย")
| BFF | Upstream | Params / body | Notes | Conf |
|---|---|---|---|---|
| `GET /board/prospect-list` | `GET {api}/prospects` | `page, perPage(<=200, default 20), searchText, marketingChannelIds (repeat), currentCityId, currentDistrictId, salePersonId, sortBy` (UI keys `date_desc->contactDate_desc`, `date_asc`, `name_asc`, `name_desc`, overridable by `contracts.list.sortby.<key>`) | returns `{items:[...], meta:{page,perPage,total,totalPages}}`; row fields: `id, code, name, customerTel, phoneCountryCode, sex, customerType, prospectEmail, prospectLine/Facebook/Instagram/Twitter, contactDate, convenient, marketingChanelName, currentAddress, currentCityName, currentDistrictName, currentSubDistrictName, currentPostId, currentCountryCode/Name, employeeCode/Name, saleGroup*, salePerson*, attachFile`; country names localised by BFF | H |
| `GET /board/prospect-enrich?ids=` | `GET {api}/prospects/{id}/quick-view` (parallel) | - | fills code/sex/type/email/socials/address lazily after list render | H |
| `GET /board/prospect?id` | `GET {api}/prospects/{id}` | - | full detail incl. `sunProspectInfo`, `satisfaction`, `senddocXxx` | H |
| `POST /board/prospect/save` `{prospectId, prospect?, extraInfo?}` | `PUT {api}/prospects/{id}` (main, body filtered by `ProspectApiPayload.mainBody`) **then** `PUT {api}/prospects/{id}/extra-info` `{sunProspectInfo, satisfaction}` | - | main failing aborts extra; 502 with upstream message | H |
| (ContractView bean) | `POST {api}/prospects` (create; requires `movementTypeId`; `confirmMerge`; avoid sending a found `employeeId` - backend 500 on 25/08) | - | | H |
| `POST /board/chat-prospect-create` | `GET {api}/master-data/activity-groups?movementTypeId=` then `POST {api}/prospects/chat` | - | body `{name, customerTel, marketingChanelId, convenient, ggwBranchId, employeeId, assignToId, remark, movementTypeId, procedureGroupId}` (role `Chat_Prospect_Create`) | H |
| `POST /board/prospect/avatar` `{prospectId, attachFileBase64, fileName}` | ensure-sun-row, `POST {api}/prospects/{id}/attachments` (type `PROFILE`), `GET` full + merge + `PUT {api}/prospects/{id}` | - | returns `{ok,attachFile}` | H |
| `GET/POST/DELETE /board/prospect/attachments` (`?prospectId`, `docNo`) | `GET/POST {api}/prospects/{id}/attachments`; `DELETE {api}/prospects/{id}/attachments/{detailOrderNo}` | - | POST `{prospectId, fileContentBase64, fileName, description}` -> upstream body `{fileContentBase64,fileName,attachFileTypeCode:"DOC",description}`; BFF verifies file exists (HEAD) afterwards because backend returns 201 even when it fails to write the file (see 5.7) | H |
| `GET /board/prospect/rv-attachments?prospectId` | `GET {api}/rv/attachments?prospectId=` | - | "Sales documents" tab of lead detail | H |
| `POST /board/prospect/update` | (legacy direct DB `ProspectBoDao`) | - | replaced by `/save` | L |
| `GET /board/chat-master-data?type=` | see master data | - | dropdowns for the chat "add customer" form | H |
`customerType` values: `person`, `juristic` (legacy `company`).

### 4.4 Contact activities ("การติดต่อ")
| BFF | Upstream | Params / body | Conf |
|---|---|---|---|
| `POST /board/contact-activities` `{leadId, channel, ...}` | `POST {api}/leads/{leadId}/contact-activities` | `leadId` removed from body, `channel` mapped to O2O label; real HTTP status forwarded | H |
| `GET /board/activity-list` | `GET {api}/contact-activities` (config `activity.list.source=api`; `aggregate` = old mode combining `/leads` + `/leads/{id}/contact-history`) | `viewMode, movementTypeId, groupBy=lead\|group, leadId, page, perPage, search, showClosed, activeStatus, saleGroupId, employeeName, assignDateFrom/To, lastContactFrom/To, sortBy`; backend answers 403 without role `CRM_ContactActivity_View`; BFF returns `{summary, usesWorkflowStep, rows:[...], meta:{page,perPage,total,totalPages,hasMore}}`; `activity.list.group.topup=true` | H |
| `GET /api/v1/contact-activities` (in-WAR mimic of a backend route that "went missing") | aggregate | `movementTypeId, groupBy, leadId, contactName` | L |

Channel codes (UI buttons): `call_in/call_out, sms, email, facebook, line, whatsapp, manual` (+ others -> sent as typed).

### 4.5 Schedule / calendar ("ปฏิทินงาน": appointments + tasks)
| BFF | Upstream | Params / body | Conf |
|---|---|---|---|
| `GET /board/schedule/fetch` | `GET {api}/schedules` | `viewMode=month\|week\|day\|list, type, dateFrom, dateTo (YYYY-MM-DD), sort, page, perPage, movementTypeId, activityGroupId, serviceId, assignToId, appointmentStatus, taskStatus, search`; empty body -> `{status:204,result:{viewMode,items:[]}}` | H |
| `POST /board/schedule/add` | `POST {api}/schedules` | `{leadId, taskAssigneeId, subject*, detail*, date, time(HH:mm\|null if all-day), type:"APPOINTMENT"\|"TASK", status:"doing", procedureGroupId?}` (`subject`,`detail` required by backend; `procedureGroupId` required if lead has a running workflow); response envelope checked: `status>=400` -> HTTP error | H |
| `PATCH /board/schedule/edit` (also POST) | `PATCH {api}/schedules/{id}` | `{id, taskAssigneeId, subject, detail, date, time, status}` | H |
| `POST /board/schedule/status` `{id, completed}` | `PATCH {api}/schedules/{id}` | task done checkbox: status `"success"` / `"doing"` | H |
| (not deployed) | `POST {api}/leads/schedules/cancel` `{id}` | cancel button; backend 404 as of 31/08 | H |
| `GET/POST /board/schedule-filter-state` | session | UI filter persistence | H |
| `GET /dashboardapi?action=schedules&viewMode&date&dateFrom&dateTo&movementTypeId` | `GET {api}/dashboard/schedules` | calendar widget on home | H |
Gold-branch calendar/KPI iframes (`dashboard_calendar_frame`, `dashboard_kpi_frame`) use `{dash}` through `/goldapi/*`: `GET /calendar`, `/calendar-task`, `/my-task`, `/my-task-list`, `/my-calendar-list`, `/employee-gold`, `/masters/{task-types,prospects,products,pillar-tasks,levels,...}?ggwBranch=`, `/eventmovements` (KPI-EventMovement: `POST /eventmovements`, `PUT /eventmovements/{id}`) (M).

### 4.6 Master data (read-only dropdowns; all `GET`, Bearer)
| BFF | Upstream (under `{api}/master-data/`) | Notes / known problems | Conf |
|---|---|---|---|
| `/board/master/movement-types?type=LD`, `/board/movement-types` | `movement-types/{LD}` | products (`id, code, name`) | H |
| `/board/master/activity-groups?movementTypeId` | `activity-groups?movementTypeId=` | workflow groups | H |
| `/board/master/employees-by-activity-group?activityGroupId` | `employees/by-activity-group?activityGroupId=` | | H |
| `/board/employees[?saleGroupId]` | `employees` | `id, code, name, attachFile` | H |
| `/board/sale-persons[?saleGroupId]`, `/board/sale-groups` | `sale-persons`, `sale-groups` | | H |
| `/board/tags?key=` | `tags?key=` | `colorCode` | H |
| `/board/provinces` | `provinces` | cleaned (5.7) | H |
| `/board/districts?provinceId`, `/board/sub-districts?districtId` | `districts?provinceId=`, `sub-districts?districtId=` | sub-districts empty/500 -> use `/board/metro-geo` | H |
| `/board/fiscal-years` | `fiscal-years` | | H |
| `/board/material-groups`, `/board/materials?groupId` | `material-groups`, `material-groups/{id}/materials` | products catalogue for trade items | H |
| `/board/chat-master-data?type=` | `marketing-channels`, `employees`, `sale-persons`, `branches`, `movement-types/LD` (as `products`), `countries` (271 rows, session cached; adds `phoneCountryCode, phoneNumberFormat`) | `type=countries` also drives phone formatting (`TsPhone`) | H |
| (ContractView) | `marketing-channels?page=1&pageSize=1000`, `countries`, `business-types`, `occupations`, `sale-persons`, `sale-groups`, `communication-types` | `pageSize` ignored by provinces | H |
| (RV) | `materials`, `currencies`, `receive-methods`, `attach-file-types`, `business-branches?page=1&perPage=500`, `branches` | | H |
| (Sales docs) | `prospects/search?key=` (customer picker), `employees` | | H |
| `/board/metro-geo` | local `metro_geo.json` | | H |

Normalised master item (BFF `MasterDataItemBean`): `{id:long, code, name, nameTh, colorCode?, postCode?}`; `provinces` has `name`(TH)/`nameTh`(EN) **swapped** in the UAT data, `countries.nameTh` empty.

### 4.7 Sales documents, receipts (RV)
| BFF | Upstream | Params / body | Conf |
|---|---|---|---|
| `GET /board/sales-document-list?formType&page&perPage` | `GET {api}/documents?formType=&page=&pageSize=` | list of the **7 legacy form types**: internal `formintent, formloan, servicecontract, loanagreement, preloanapprove, propertycontract, formsun` <-> backend `formType` (switch `triplesale.api.documents.formtype.style=old\|new`; new = `LetterofIntent, LegalCreditServiceRequest, Servicecontract, LoanAgreement, PreliminaryCreditApproval, PropertyProjectContract, CreditApplication`). Response `result.items[]`/`result.result[]` + `total`; **backend has no filter params** (filtering done in memory by walking all pages); rows normalised to `{id, quotationNo(txNo), quotationDate, customerCode, customerName, customerAvatar, salesperson, receiveDate, status}`; max perPage 100 | H |
| (bean) `Sales_DocumentView` | `GET {api}/documents/{id}?formType=`; `POST {api}/documents` (body includes `formType`, `formsun{borrower,coBorrower,guarantor}` for credit application); `PUT {api}/documents/{id}?formType=`; `POST {api}/documents/{id}/attachments?formType=` (`contentBase64`) | attachments persist was 500 at times -> `/docattach` serves files from a **session store** (`salesDocAttachStore`: view/download/describe) | M |
| `GET /rvapi?action=list` | `GET {api}/rv` | `search, status, dateFrom, dateTo, page, pageSize` | H |
| `GET /rvapi?action=detail&id` / `leads&search` / `materials` / `currencies` / `branches` / `receiveMethods` / `attachFileTypes` / `products` | `GET {api}/rv/{id}`, `/rv/leads`, master-data (see 4.6) | | H |
| `POST /rvapi?action=calculate` | `POST {api}/rv/calculate` (RvCalculateReqDTO) | | H |
| `POST /rvapi?action=create` | `POST {api}/rv` (RvCreateReqDTO) **then re-GET to verify** (backend once returned 200 without inserting) | role `CRM_RV_View,CRM_RV_Edit,FEATURE_CRM_Document` | H |
| `POST /rvapi?action=attach&id` | `POST {api}/rv/{id}/attachments` (`contentBase64`) + verify | | H |
| `POST /rvapi?action=approve&txno` | `POST {api}/rv/approve?txno=` | (added by backend 06/08/2026) | H |
| `GET /rvreceipt?...` | WAR-generated receipt PDF (`RvReceiptPdfServlet`) | `window.open` | M |
| `GET /rvreport?txno=` | `{report.base}/red/rpt/jasperReport?...` form `RV-01` (legacy ERP) | PDF | H |
Document **type codes** used by the *new* UI (`web/pages/sales_doc_*`): `qt` quotation (ใบเสนอราคา), `bk` booking (ใบจอง), `ob` delivery (ใบส่งสินค้า), `aq` auto quotation (ใบเสนอราคารถยนต์), `ad` auto booking / vehicle booking agreement (ใบจองรถยนต์), `rv` receipt (ใบรับเงิน, real API), `so` sales order (removed 12/10/2026), `pv` payment voucher (legacy `PvView`, no live page). Only `rv` and the 7 legacy form types are wired to APIs; qt/bk/ob/aq/ad forms are front-end only (customer picker uses `/board/prospect-list`).

### 4.8 Dashboards
| BFF | Upstream | Params | Conf |
|---|---|---|---|
| `GET /dashboardapi?action=summary&movementTypeId&startDate&endDate&page&perPage` | `GET {api}/dashboard` | home dashboard: `stats + stepSummary(donut) + items[opportunities]`; BFF fills missing `attachFile` | H |
| `GET /dashboard/api/v1/sundashboard/{endpoint}?{query}` (allow-listed; 30 s response cache; **no auth header**) | `GET {dash}/sundashboard/{endpoint}`; **`overview` goes to `{dash}/dashboards/overview`** | allow-list: `overview, daily_trend, activitygroup_summary, cs_performance, top_countries, funnel, funnel_cs, funnel_country, latest_step, activitygroup, stage_summary, pipeline, pipeline/detail, employee_performance, employee_performance/steps, employee_performance/pending_list, employee_performance/completed_list, customer_step_groups, customer_status_list, lead_list, lead_list/detail, masterdata/{years,months,activity_group,activitystep,employee,movementtype,chanel,country,province,occupation}`. Common query params: `ggwBranch (session ss_branch_code or "all"), year, month, fromdate, todate, datebasis (contact\|...), employee, chanel, country, occupation, province, activitygroup, movementtype` | H |
| `GET /dashboard/{overview,chart-single,charts,months,pipeline,pipeline-detail,employee-performance,employee-performance-steps,employee-leads,leads,lead-detail,customer_status_list,customer_step_groups,masterdata-all,masterdata-activitystep,widget-layout}` | `DashboardView` bean wrapper around the same SUN API (older servlet layer; page JS now mostly calls the proxy route above); `GET/POST /dashboard/widget-layout?page=overview` stores the per-user overview layout `{widgets:[{id,visible,order}]}` as a **JSON file on the Tomcat server** (`<catalina.base>/dashboard-widget-layout/`, keyed by employeeId+page) - no backend API exists for it, decide a new home (API or localStorage) | per-widget filters as above | M |
| `GET /golddashboard/*` (same list) | `GET {dash}/golddashboard/{funnel,funnel_cs,funnel_province,activitygroup,pipeline,pipeline/detail,overview,masterdata/*}` (historic path `kpi-gold-service`) | Gold-branch variant | M |
| `* /goldapi/{path}` | `{dash}/{path}` any method, Bearer attached if present | calendar/KPI iframes | H |

### 4.9 Reports
| BFF | Upstream | Params | Conf |
|---|---|---|---|
| `GET /report-pdf?code=<CODE>&<filters>` | `GET {report.base}/red/rpt/jasperReport?...` (params from `report_config.properties`: `.jasper`, `.jrxml`, `.name`, `.datefmt`, `.col.<filter>` -> `externalSQLWhere`, `.param.<k>`, `.orderby.<v>` whitelist, `.whereprefix`, `.mode=legacy`) | returns `application/pdf`; permission `Report_<CODE>_View`; codes: `CRMG10..CRMG14, GGW-LD-01, GGW-LD-02, SUN-LD-01..07, SUN-LD-09` (see 8.4) | H |
| `GET /board/drilldown?action=reports\|data&code&fromdate&todate&page&pageSize` | `GET {api}/drilldown/{tcs01,tpls01,tpls02,tpls03,ls01..ls05,tle01,tf1}` | 11 reports `T-CS-01, T-PLS-01..03, T-LS-01..05, T-LE-01, T-FI-01`; role `CRM_Dashboard_View`; `tcs01` has no date filter; columns are derived from the first rows' keys and Thai labels (normalised key compare: ignore case/`_`/`-`); `drilldown.mock=true` gives mock data; Excel export via `/T-XX-nn` servlets | H |

### 4.10 Files
| BFF | Behaviour | Conf |
|---|---|---|
| `GET /docproxy?url=<encoded file url>` | fetch from file server (allow-listed host, `X-DocProxy-Reason` header on failure: `BLOCKED_HOST/BLOCKED_EXT/BAD_URL/UPSTREAM_<n>/NETWORK`), inline for pdf/png/jpg/jpeg/gif/webp else attachment | H |
| `GET /docattach?action=view\|download&docId&i`, `POST ?action=describe` | session-stored sales-document attachments | H |
| Upload rule (all attachments) | JSON `{fileContentBase64 \| contentBase64, fileName, description?}`; allowed extensions `.pdf .png .jpg .jpeg .gif .webp .doc .docx .xls .xlsx .csv .txt .ppt .pptx .zip .rar .7z`; UI pre-check; see 5.6 | H |

### 4.11 Chat REST (`triplesale-chat`, via `/chat-api/*` proxy: `/chat-api/<path>` -> `{chat.base}/<path>`; also `/chat-api/files/...` public file serve) - H
| Method + path (`/api/v1/...`) | Purpose / params |
|---|---|
| `GET /conversations` | inbox: `platform (LINE\|FACEBOOK\|INSTAGRAM\|WHATSAPP\|TIKTOK), pageId, q, unread, starred, linked, sort (latest\|unread\|starred\|team), page, perPage (20)` -> `result[ConversationResponse]`, `meta` |
| `GET /conversations/counts` | tab counters `{LINE:36,FACEBOOK:4,...,ALL:41}` (same filters except platform/pageId) |
| `GET /conversations/channels?platform=` | accounts (pages) per channel |
| `GET /conversations/{id}/messages?page&perPage` (server default 50; UI loads 20 and fetches 20 more when scrolled to top) / `POST /conversations/{id}/messages` | send: `{message, msgType:'TEXT'\|'IMAGE'\|'VIDEO'\|'AUDIO'\|'FILE'\|'STICKER'\|'LOCATION'\|'PRODUCT'\|'TEMPLATE', attachments, clientMessageId, internalNote?}` |
| `PATCH /conversations/{id}/read`, `PATCH /conversations/{id}/star`, `GET /conversations/{id}/ai-context`, `GET /conversations/{id}/quick-messages` | |
| `POST /uploads` (multipart `file`) -> `{url,previewUrl,filename}`; `GET /files/{filename}`; `GET /messages/{id}/content` | media (the only multipart endpoints in the whole system) |
| `GET/POST /chat-channels`, `GET/PATCH/DELETE /chat-channels/{id}`, `POST /chat-channels/probe`, `POST /chat-channels/{id}/check`, `GET /chat-channels/webhook-info`, `POST /chat-channels/tiktok/connect`, `GET /chat-channels/{id}/secrets`, `GET/POST/DELETE /chat-channels/{id}/access[/{employeeId}]` | account registry (LINE, Facebook, Instagram, WhatsApp, TikTok) |
| `GET/POST /quick-messages`, `GET /quick-messages/scopes`, `GET/PATCH/DELETE /quick-messages/{id}` | per-branch canned replies |
| `GET/POST /ai-companies`, `GET /ai-companies/scopes`, `GET/PATCH/DELETE /ai-companies/{id}`, `POST /ai-companies/try` | knowledge the bot uses |
| `GET /chatbot/status`, `GET/PATCH /chatbot/channels[/{id}]`, `GET /chatbot/switches`, `PATCH /chatbot/switches/{scope}/{scopeKey}`, `GET/PATCH /chatbot/conversations/{id}` `{enabled}` | 3-level bot switch: global AND (room ?? page) |
| `GET /prospect-social/check?pageId=`, `GET /prospect-social/contacts`, `POST/DELETE /prospect-social/link` | link chat user <-> prospect (role `Chat_Prospect_Create`) |
| `GET /master-data/branches`, `/master-data/outlets` | chat-side lookups |
| `POST /inbound/messages`, `POST/GET /webhook/{line,meta,whatsapp,tiktok}`, `GET /webhook/tiktok/oauth` | provider webhooks (not called by the browser) |
| `GET /health`, `/health/db` | |
Chat responses use the standard `ApiResponse` envelope. `ConversationResponse` fields: `id, channelType, pageId, userId, profileName, profileImage, profileStatus, contactEmail/Phone, location, note, status(OPEN|PENDING|CLOSED), unreadCount, starred, lastMessageAt, lastMessagePreview, lastMessageType, lastMessageDirection, prospectName, prospectCode, leadId, assignedTo, source, ggwBranchId/Code/Name, createdAt, updatedAt`. `MessageResponse`: `id, conversationId, channelType, direction(IN|OUT), msgType, body, attachments(json), meta(json), providerMessageId, sentAt, readAt, deliveryStatus(PENDING|SENT|DELIVERED|READ|FAILED), createdAt, senderType(AGENT|BOT|SYSTEM), senderUsername, senderEmployeeId, senderName`.

### 4.12 AI services
| BFF | Upstream | Notes | Conf |
|---|---|---|---|
| `POST /ai-api/api/analytics/customer` (`/insight`, `/topics`, `/ask`) | CHAT_BOT `POST {ai.base}/api/analytics/customer[...]` | numbers/charts fast; `/insight` & `/ask` wait for LLM (tens of seconds); roles `MODULE_CHATBOX` + `Chat_AI_Analytics_AI`; header `X-Analytics-Key` added server-side; BFF also checks the conversation's branch via chat service | H |
| `POST /help-api/ask`, `GET /help-api/{topics,steps,images/*,health}`, `DELETE /help-api/session/{id}` | `{ai.base}/api/help/...` | floating "usage help" assistant on every page; login required (filter) but no role | H |
| `GET /ai-api/product-images/{id}` | CHAT_BOT `{ai.base}/product-images/{id}` (the chat service also exposes `/triplesale-chat/product-images/{id}` publicly for LINE) | product images the bot attaches | M |
| `/aitran?action=list\|save(multipart)\|edit\|quotation\|file\|translated\|chat\|<button>` | aitran-service | document translation; `save` streams multipart (hundreds of MB), `actor`/`sessionKey` appended server-side | H |
| `/aitran-api/{customer-confirmed,pending-translation,quotation-pdf,mark-translated}` | aitran-service (external callers: Activepieces) | `X-Api-Key` forwarded from caller; no session | H |
| `GET /aihub/tools`, `POST /aihub/tools/{id}` (multipart), `GET /aihub/files/{id}[?download=1]`, `GET /aihub/library/{id}`, `/aihub/usage` | ai-hub `{aihub.base}/aihub-api/...` | `actor` + branch + `libraryAdmin` flag appended; 503 when `aihub.menu.enabled=false`; Range header forwarded | H |

### 4.13 Other servlets present in the WAR (legacy / out of scope)
`/linewebhook`, `/fbwebhook`, `/webhook`, `/webhook_old`, `/line_page_id`, `/lineupdateprofile`, `/lineupdateavatar`, `/fbupdateprofile` (old social webhooks now owned by `triple_sale_chat`), `/send_otp`, `/verify_otp`, `/g_ocr`, `/slip_ocr`, `/QRCodeServlet`, `/BarCodeServlet`, `/SignatureServlet`, `/DownloadFile`, `/testapi`, `/testreport`, `/pt_petition`, `/pt_petition_detail`, `/T-*-nn` (drilldown Excel export). Conf L.

### 4.14 Modules that are mock / not wired (do not size as "API integration")
* **Promotion** (`promotion*.xhtml`, `PromotionView`/`PromotionBean`, `promotion_mock.json`) - mock only; menu hidden (`rendered=false`).
* **Market plan** (`market_plan*.xhtml`, `MarketPlanView`, `MarketPlanBean`: id,title,status draft|confirm|progress|done, progress 0-100, owners, dates) - mock; no menu link.
* **Petitions PT / TK dashboard** (`pt_*`, `tk_*`, `PetitionView` 8k lines legacy, `tk_dashboard_mock.json`) - mock/legacy; menu hidden.
* **Sales doc forms qt/bk/ob/aq/ad** - UI work in progress (changelog 1.0.10), no backend integration (only customer picker). `sales_doc_type_list` is a list shell ("No records found").
* `underconstruction`, `quotation.xhtml` (link to non-existent `quatat.face`), `AA.xhtml` (hidden), `contracts_additional_data` (orphan) etc. - dead pages (I18N_SURVEY lists 22 orphan files; real scope ~40-49 pages).
---

## 5. Conventions (answers Q4)

### 5.1 JSON envelopes
**Standard (triplesale-service, triplesale-chat; per `triple_sale_ai_bot/CLAUDE.md` "API Dev Standards V.0.0.2")**
```json
{ "timestamp":"...", "status":200, "message":"success", "result": <object|array>, "meta":{"page":1,"perPage":20,"total":100,"totalPages":5} }
```
Error (observed variants - parse defensively):
```json
{ "timestamp":"2026-08-26T13:22:51.6084567", "status":400, "message":"Malformed request body",
  "error":{ "code":400, "message":"String value length (20051112) exceeds the maximum allowed (20000000, ...)" } }
{ "status":400, "message":"Validation error", "error":{ "code":400, "message":"activityGroupId required ..." } }
{ "status":422, "message":"VALIDATION_ERROR", "error":{ "code":"VALIDATION_ERROR","description":"...","details":[{"field":"email","message":"must not be empty"}] } }
```
* `error.code` may be number or string; the human reason is in `error.message` (services) or `error.description`; the top-level `message` is often generic ("Malformed request body"). Client rule used everywhere (`crmErrText`): show `message`, then `error` (if string) or `error.message` (if different), then JSON of `error.details | error.fieldErrors | error.errors`, joined by " - ".
* **Always check both HTTP status and body `status`** - a 2xx HTTP with `status>=400` in the body exists (e.g. schedules), and `unwrapLeadResult` accepts only HTTP 200 + body `status==200` + `result`.
* Response shapes that deviate: documents `result.items[]` + `result.total` (or `result.result[]`); leads `result` object with `kanban/leads/statusSummary`; dashboard services return raw objects/arrays (client unwraps by trying keys `result,data,items,rows,list,people`, and `xAxis/series` for charts); `overview` KPI `{total,totalFmt,closed,closedFmt,closedPct,closedPctFmt,avgDays,avgDaysFmt,countries,topCountry}`; `/rv` write endpoints add a `verify` block (BFF re-reads to confirm persistence).
* **BFF-originated shapes the old JS depends on:** login `{responseCode:"COMPLETE|ORG_REQUIRED|ERROR", failMessage, username, branches}`; 401 `{authRequired:true, responseCode, message}`; proxies `{error:"..."}` (dashboard/gold), `{status:502,message:"chat backend unreachable"}`, `{status:403,message:"<role reason>"}`; `{"message":"unknown action"}`; avatar `{ok,attachFile|message}`; `[]`/`{}` on failure for older servlets (e.g. `/board/leads`, master-data servlets), **with HTTP 200**.

### 5.2 Error handling behaviour
| Situation | Old behaviour | Angular guidance |
|---|---|---|
| 401 (no/expired token) | modal -> `/index.face` (clear `ts_login`) | interceptor -> logout + redirect to `/login?auth=TOKEN_EXPIRED` |
| 403 | JSON `{status,message[,error]}` from BFF or backend; lead detail shows popup then goes back; page-level 403 HTML | toast/dialog with `error.message`; keep user on page; guard routes beforehand |
| 4xx validation | swal popup (icon error, OK) with `crmErrText` text | same; field-level mapping from `error.details` |
| 5xx / network | `Data_API.sendGET` returns `""` on any non-200 (callers then fall back to `[]`/`{}`); newer servlets forward real status; UI text "cannot connect to Service: <msg>" | do not silently swallow - surface; retry only idempotent GETs |
| upload failed | message from `error.message` appended to top-level message | same |
| empty POST body from backend | treated as success (schedule add -> `{status:201,success:true}`) | accept 200/201/204 |
`Data_API` GET only accepts HTTP 200 (201 for POST/PUT counted OK). Upstream timeouts up to 240 s - set sane per-call timeouts in Angular (LLM endpoints need ~90 s+).

### 5.3 Pagination
* `page` is 1-based. Parameter pair differs: **`page`+`perPage`** (leads, prospects, schedules, contact-activities, rv master `business-branches`, chat, `/dashboard`), **`page`+`pageSize`** (documents, rv list, drilldown, master-data lists, contacts) - `contact-activities` doc also mentions `pageNo`.
* Defaults/limits: UI page size 20 everywhere; BFF caps `perPage` at 200 (prospects) / 100 (documents); chat messages default 50; master-data `pageSize` often ignored (provinces returns everything).
* `meta{page,perPage,total,totalPages}` when present drives "has more"; fallback = "got a full page => maybe more". Lists use infinite scroll + skeletons, not paginator widgets (except DrillDown tables).
* Lead board: column-level infinite scroll by `activityStepId`; list view by `page`.

### 5.4 Dates, numbers, phones, names
| Item | Wire | Display |
|---|---|---|
| Dates | `YYYY-MM-DD` in query/body (`dateFrom/dateTo/startDate/endDate/fromdate/todate/date`); `time` `HH:mm` (null when all-day); BFF converts prospect `contactDate` to `dd/MM/yyyy` | `dd/MM/yyyy` (Gregorian) with Thai month/day names from i18n keys (`label.month`, `label.month_s`, `label.dow`); calendars Thai-localised; DrillDown forces `th-TH-u-ca-gregory`; chat shows Buddhist year (+543) when the message year differs (Thai UI); AI HUB shows BE dates |
| Timestamps | ISO-8601 with offset (chat `OffsetDateTime`); **older chat socket builds sent epoch seconds as float** (`1792405887.19`) - convert with `n<1e12 ? n*1000 : n` | local time; JVM/Thai time zone (UTC+7) assumed |
| Numbers | JSON numbers / `BigDecimal` for `amount` | `Intl.NumberFormat('th-TH',{maximumFractionDigits:2})`; Thai baht |
| Phone | digits only on save; `phoneCountryCode` (e.g. `+66`, default country `THA`) + `phoneNumberFormat` pattern (e.g. "XX XXX XXXX") from countries master | `+66 88-854-545`: groups [2,3,4] joined with "-"; over-long DB values trimmed from the front (`0812345678 -> 81-234-5678`); rules in `phone_format.js` (`TsPhone`) |
| Person names | `name` | shown **without code prefix** everywhere (changelog 1.0.21) |
| IDs | 64-bit numeric ids like `1004400123` (fit in JS Number); many endpoints take them as strings | keep as `number` or `string` consistently |

### 5.5 Special value conventions
`customerType`: `person|juristic`; `leadStatus`: `new|success|lost|inactive` (+`SOLD`); `activeStatus`: `hot|warm|cold`; schedule `type`: `APPOINTMENT|TASK`; task status `doing|success`; lead close `outcome`: `sold|lost`; RV `status` filter free text; chat `platform`: `LINE|FACEBOOK|INSTAGRAM|WHATSAPP|TIKTOK`; document `status` (e.g. `ACTIVE` -> shown as "success" in Thai, mapping duplicated in `Sales_DocumentBean:162` and `Sales_DocumentView:521`).

### 5.6 File upload
* **All `triplesale-service` upload endpoints take `application/json` with base64** (no multipart): prospects `fileContentBase64`; rv/documents `contentBase64`; avatar uses attach type `PROFILE`, documents `DOC`.
* Limits: backend Jackson `maxStringLength` = 20,000,000 chars => **max raw size 15,000,000 bytes (~14.3 MB)** (`CT_API_MAX_B64_CHARS=20000000`, `CT_MAX_FILE_BYTES=floor(20000000/4)*3`). UI limit = `triplesale.upload.max.bytes` (14,680,064 = 14 MB; default 14 MB if missing/invalid) used for `p:fileUpload sizeLimit` and the warning message. Pre-check **before** reading/encoding the file.
* Extension whitelist (client `TsAttachTypes` + server `FileServerAccess.ALLOWED_EXT`): `.pdf .png .jpg .jpeg .gif .webp .doc .docx .xls .xlsx .csv .txt .ppt .pptx .zip .rar .7z`.
* After upload the BFF **HEADs the returned URL on the file server** and reports failure (backend can answer 201 without writing the file - bug 5.7 #1).
* Other uploads: chat `POST /uploads` multipart `file`; AI translate multipart (stream, up to GB); AI HUB multipart (`files` + form fields).
* Download/preview: via `/docproxy` (same-origin) because the file server has no CORS/X-Frame; filenames may contain Thai/spaces (URI-encode illegal chars).

### 5.7 Known backend bugs/limits the front end works around (from `BACKEND_BUG_*`, `BACKEND_LIMIT_*`, code comments)
| # | Defect (date) | Front-end workaround to carry over |
|---|---|---|
| 1 | `POST /prospects/{id}/attachments` returns **201 but file not written** (intermittent since ~19-26/08, 12/12 failures on 27/08; also `employee/` store) | verify file by HEAD after upload; warn user; keep record of `attachFile` path as returned (epoch-millis folder `prospect<epoch>/<file>`) |
| 2 | Upload ceiling 14.3 MB + misleading top-level `message` ("Malformed request body") | size pre-check at 15,000,000 B; surface `error.message` |
| 3 | master-data **countries**: `nameTh` empty for all 271 rows; 14 duplicate countries (e.g. `ARE`/`UAE`, `GBR`/`UK`, `SGP`/`SIG`...) | Thai names from `masterdata_th.properties`; do not dedupe (ids referenced by old data) |
| 4 | **provinces**: 2,739 rows, 2,659 foreign cities; mojibake in 182 rows (Latin-1 read as TIS-620); 27 codes with leading TAB (duplicate Thai provinces); `pageSize` ignored; `name`/`nameTh` swapped (TH in `name`, EN in `nameTh`) | keep Thai-only names (U+0E00-0E7F + spaces), non-empty code, trim code, de-dupe keep highest id -> 77 |
| 5 | **sub-districts**: empty table / HTTP 500 for `provinceId`/`districtCode`; **districts** 3 misspellings (`เขตหลักสี`, `อ.กําแพงแสน`, `อ.ลําลูกกา`); no postcode field anywhere | bundled `metro_geo.json` (6 provinces only!) with zip; normalise sara-am + prefix match when joining |
| 6 | master data is **single-language** (13 endpoints, no `*En`, no locale negotiation) | `masterdata_*.properties` overrides by `code`; show original Thai when no override |
| 7 | `POST /rv` once answered 200 without inserting; attachments 500 | re-GET to verify, show real result |
| 8 | `POST /prospects` returns 500 when `employeeId` resolves to a real employee (25/08); requires `movementTypeId`; `taxBranch` required for juristic (400) | omit `employeeId` (`triplesale.api.prospect_send_employee_id=false`), always send `movementTypeId`, default `taxBranch=00000` |
| 9 | `GET /leads/{id}` -> 400 if workflow lead lacks `activityGroupId`; 403 without token | pass `activityGroupId` from board click |
| 10 | `POST /leads/schedules/cancel` 404 (not deployed) | button kept but endpoint pending (clarify `PATCH /schedules/{id}` status value) |
| 11 | `/documents` has no filter params; `/prospects` has no `ids`/`fields`; | client-side filtering after walking pages; per-id `quick-view` |
| 12 | UAT gateway: HTTP 500 for `/master-data/branches` and `/auth/user-detail` intermittently | `triplesale.api.branches.base` override; `ss_branch_map` fallback for `ss_branch_code` |
| 13 | `GET /me/permission-context` removed (20/08); `/me/roles` missing on early UAT | roles required - TEMP `super_admin` grant switch exists in code |
| 14 | Dashboard SUN API needs `ggwBranch` (param renamed `branch` -> `ggwbranch` -> `ggwBranch`); without it dropdowns empty | always send branch (`ss_branch_code`, fallback `all`) |
| 15 | Backend prefixes host on every GET and again on PUT (URL chains `http://h/http://h/...`) | `collapse()` for display, `toRelative()` before saving |
| 16 | `prospectInstragram` (typo) in full detail vs `prospectInstagram` in list/quick-view; quick-view lacks 3 detail fields | read both spellings |
| 17 | `salePersonId` filter on `/prospects` once returned 500 | BFF distinguishes API failure from "no customers" |
| 18 | `kpi-gold-service` path moved to `dashboard-triplesale-service`; gold API blocks CORS | all through `/goldapi` |
| 19 | Backend labels: `activity-groups` mix of Thai/English/garbage names (`activitygroupname`), `forwardStatus` is a free string "Group - Step" | display as-is; match logic by `id`, never by name |
| 20 | `NON_WORKFLOW_PRODUCTS` in `dashboard.js` compares Thai product names (`["ผลิตภัณฑ์ B","ผลิตภัณฑ์ D"]`) | replace with code/flag `usesWorkflowStep` |
---

## 6. Internationalisation (answers Q5)

### 6.1 Languages and files
| File | Size | Keys | Role |
|---|---|---|---|
| `src/java/messages_th.properties` | 393 KB | **2,838** | UI labels, Thai (default + fallback). Mixed `\uXXXX` escapes and raw UTF-8 - loaded through a UTF-8 `Reader` so both forms coexist |
| `src/java/messages_en.properties` | 138 KB | **2,838** (exact key parity with th; 0 keys only in one side; 68 values identical to th; no `???` placeholders left after the 14-15/10 clean-up) | UI labels, English |
| `src/java/messages_jp.properties` | 9.7 KB | 120 | **Broken stub**: values are Thai (`label.template.language=ไทย`), copy of an old template section. `I18n.SUPPORTED = {th, en}` -> **Japanese is NOT supported**. Drop it or build from scratch |
| `src/java/masterdata_th.properties` | 10 KB | 270 | **code -> Thai name** for countries (`ABW=อารูบา`, key = ISO-3-like `code` from `/master-data/countries`) because backend `nameTh` is empty |
| `src/java/masterdata_en.properties` | 7 KB | 162 | **code -> English name** for backend data that is Thai-only: `province.<CODE>` x77, `district.<CODE>` x79, plus product/status codes (`LD-WFS-A=Product A (with WorkFlow Step)`, `SALE-001=Sales Status`...) |
Key-count breakdown (en): `label.*` 2,342; `chat.*` 494; `masterdata.*` 4; `autodealer.*` 1. Largest label modules: `ld2` (lead detail v2) 371, `cmd` 238, `ad` (auto dealer) 164, `rv` 140, `sd7` 132, `template` 114, `dbsun` 114, `qt` 104, `pd` 102, `bk` 101, `pm` 84, `cpd` 74, `sd` 63, `contracts` 59, `activity` 46, `dashboard` 38, `pdoc` 37, `qtf` 32, `topbar` 30, `ob` 29, `lead` 27, `drilldown` 24, `cv` 24, `tk` 23, `schedule` 22, `mp` 21; `chat.*` areas: `ai` 117, `ch` 93, `kb` 65, `qm` 44 ... Naming convention: `label.<module>.<snake_case_name>` (module = short page/feature code), `chat.<area>.<name>[.<sub>]`, placeholders `{0}` (64 values - only the chat JS `T(key, arg)` helper replaces `{0}`).

### 6.2 masterdata_* vs messages_*
* `messages_*` = **static UI text** keyed by semantic key; chosen by UI language; missing key -> th -> the key string itself (deliberately visible on screen).
* `masterdata_*` = **override table for server data** keyed by a stable backend `code`; `_en` supplies English for Thai-only data (used when UI = en), `_th` supplies Thai for English-only data (countries; used when UI = th). Missing code -> original string (never an error). Applied in BFF servlets (`LeadsBoardServlet`, `LeadDetailServlet`, `ProspectListService`, `ChatMasterDataServlet`, activity list) - in Angular, implement a `MasterDataTranslatePipe/Service` and apply on lists + dropdown labels.

### 6.3 How the locale is chosen and persisted
1. Default **`th`**, every login (explicit decision 30/07/2026: preference restored from backend was disabled; code left commented).
2. User clicks the flag menu in topbar (`#tsLangFlagTrigger`, options TH/EN) -> `change_language(lang)` sets `?lang=<th|en>` on the **current URL** and reloads (old fallback: JSF remote command with `param_language`, `param_return_url`).
3. `CommonBean.init()` -> `applyLanguageFromRequest()` accepts only `I18n.isSupported(lang)`, stores `session_change_language` in the HTTP session and fires `PATCH {auth}/me/preference {lang}` (best effort, no-op if no token).
4. `I18n.fromSession(req)` is used by servlets (BFF) to pick the language for error texts (`label.ld2.lead_no_permission`, ...) and data translation.
5. Persistence = HTTP session only (lost at logout/timeout); theme/font size are separate (`TS_PREF`).
6. Known UX bug fixed: reload used to drop the query string (I18N_SURVEY 5.2) - now returns to the same URL (same-origin path validated against open redirect).
Angular: keep `lang` in `localStorage` + `PATCH /me/preference`, default `th` on login, no page reload needed.

### 6.4 How JS gets its strings
No client-side bundle: xhtml inlines translated text via EL `'#{commonBean.msg['label.x.y']}'` (map access returns the key if missing) into attributes/JS strings; `chatbot.xhtml` builds a `CB_T` object (`T(k,a)`, `TT(k,fallback)` - fallback exists because Tomcat's ResourceBundle caches may return `???key???` until context reload); `drilldown.xhtml` uses `window.DD_I18N`; `window.INPUT_GUARD_I18N` for the special-character blocker. In Angular export both property files to JSON dictionaries (e.g. `assets/i18n/{th,en}.json`).

### 6.5 Untranslated / problematic areas (from `I18N_SURVEY.md`, dated 27/07/2026 + later changelogs)
* The survey's estimate: 40 live pages (22 orphans excluded), ~8,580 hard-coded Thai spots (7,010 xhtml, 1,570 Java), ~3,400 unique strings; biggest pages `lead_detail` (1,414), `contracts_master_data` (888), `sales_doc_rv` (562), `sales_document_sub_7` (463), `dashboard_gold` (449), `dashboard_sun` (445), `chatbot` (296). Since then **both property files were filled to 2,838 keys**, but pages/JS may still contain residual Thai; 540 Thai strings live in Java-generated JS (`executeScript`).
* **Backend-sourced text stays Thai** and cannot be translated client-side: kanban `stepName`, `movementTypeName`, `forwardStatus` ("Customer Service - ติดตามลูกค้าครั้งที่ 1"), dashboard `stepSummary[].name`, `currentGroup/currentStep`, most master-data dropdowns (only provinces, countries, occupations are bilingual and provinces has swapped fields), user-entered text, error messages (backend/BFF Thai strings shown verbatim; the survey recommends the backend return error *codes*).
* Code that uses Thai strings as keys (must not be translated; replace with codes): `CHANNEL_API_MAP` (lead_detail), `METHOD_CODE` (sales_doc_rv), `NON_WORKFLOW_PRODUCTS` (dashboard.js), duplicated maps `GROUP_META` (4 copies: CS/AN/PLS/LS/FI/LE/CRM -> Thai), 9+ Thai month tables, document-status and schedule-status maps (each 2 copies).
* Dates/numbers localisation: see 5.4; reports (Jasper) pass `lang=th`, `lang=en` untested.

---

## 7. Realtime (answers Q6)

### 7.1 Components
| Component | Tech | Where | Status |
|---|---|---|---|
| **triple_sale_chat** | Spring Boot 3.5.3, Java 24, PostgreSQL schema `backoffice`, **Netty-SocketIO** (Socket.IO server, EIO v4) | REST `:3320/triplesale-chat`, Socket.IO `:3321` path `/socket.io` | **current**, used by CRM `chatbot.face` |
| CHAT_BOT (`AWS_SageMaker/CHAT_BOT`, not in repo) | Spring Boot + AWS Bedrock | `:8082` | AI replies, analytics, help assistant; chat service proxies product images and calls it |
| `chat-webhook-socket-io` | Node/Express 5 + socket.io 4.8 + LINE SDK + multer | `:3001` | **old prototype** (LINE webhook `POST /webhook`, `POST /send-image-to-line`, `/send-location-to-line`; events `send-to-line`, `line-message`, `message-status`; used by `web/chat.html`, `web/chat/index.xhtml`). Superseded - do not port |
| `triple_sale_ai_bot` | docs only (coding standard, deploy notes, FB review, SQL) | - | reference; nginx exposes only `3320` (`/triplesale-chat/`) to the Internet for webhooks (LINE/Meta/WhatsApp/TikTok) and `product-images`; 3321 is internal |

### 7.2 Browser connection (as implemented in `web/pages/chatbot.xhtml`)
```js
// socket.io client 4.7.5 from CDN
var CTX_PATH = '/' + (location.pathname.split('/')[1] || 'triplesale');
socket = io(location.origin, { path: CTX_PATH + '/socket.io', transports: ['polling'], reconnection: true });
socket.on('connect', () => { if (CUR_ID && findChat(CUR_ID)._real) socket.emit('conversation:join', String(CUR_ID)); refreshConversations(); });
socket.on('message:new', onSockMsg);          // payload = MessageResponse
socket.on('conversation:update', onSockConv); // payload = ConversationResponse
// emit 'conversation:join' (string conversationId) whenever a room is opened
```
* **Transport is long-polling only** because the WAR servlet proxy (`ChatSocketProxy`, `/socket.io/*` -> `{triplesale.chat.socket}/socket.io/*`, GET/POST, 70 s timeout) cannot upgrade to WebSocket; it checks `ss_access_token` (else `401 {"authRequired":true,"responseCode":"NO_TOKEN"}`) and adds `Authorization: Bearer`. Direct WebSocket from Angular is possible if the socket host is reachable (note: 3321 is not exposed publicly in prod; prod alias `.../chat-socket`).
* **Server auth (`SocketIOConfig.authorize`)**: token from header `Authorization`, else Socket.IO `auth:{token}`, else query `?token=`; validated like REST (`TokenAuthFilter`: JWT shape + exp, optionally remote verify via `/auth/user-detail`, cached). Failed -> handshake refused. The user's **branch** is derived from the token (`effectiveBranchId`, selected org) and stored for filtering.
* Optional handshake query params: `conversationId` (auto-join), `platform` (platform room).
* **Rooms**: branch room (auto), conversation room (`conversation:join`, only conversations of the user's branch - otherwise server emits `socket:error` "no permission (different branch)"), platform room.
* **Events**: server->client `message:new` (new/updated message, carries `direction`, `conversationId`), `conversation:update` (room summary: last message, unread, resolved, starred null-safe, profile name/avatar; sent to branch room or broadcast), `socket:error` (string). Client->server: `conversation:join`.
* Client logic to replicate: dedupe by message id/`clientMessageId` (`web-<ts>-<rand>`; optimistic send + `providerMessageId` merge), `unread` counters (IN & not current room => +1; current room => `PATCH /conversations/{id}/read`), do **not** overwrite per-user `starred` or `prospectName` from socket payload, re-sync inbox via REST on every (re)connect (`refreshConversations`, merge not replace), refresh tab counters (`/conversations/counts`) when a *new* room appears, convert epoch-seconds timestamps (5.4).
* Only `chatbot.xhtml` uses sockets. Everything else is request/response (AI translator polls, lead board has a timer `BOARD_AS_TIMER`, no push).

### 7.3 Chat page feature map (for scoping)
Inbox with channel tabs (LINE/Facebook/Instagram/WhatsApp/TikTok) + counters, search `q`, filters (unread/starred/linked), sort (latest/unread/starred/team); room view with infinite scroll up (20), send text/image/video/audio/file/sticker/location/product/template, internal notes (`internalNote:true`), quick messages, link/unlink prospect (`prospect-social/link`), create customer from chat (`/board/chat-prospect-create`), bot switches (global/page/room), AI company knowledge CRUD, channel registry CRUD (secrets viewable with `Chat_Social_Admin_View`), analytics AI panel (`/ai-api/api/analytics/customer*`), floating help assistant.
---

## 8. Configuration, environments, feature flags (answers Q7)

### 8.1 Config mechanism
`com.ace.utils.PropertyFileConfig` loads classpath `*.properties` (UTF-8), caches the parsed file and **re-checks `File.lastModified()` on every access** => editing `config.properties` takes effect without restarting Tomcat. A sibling `config-secrets.properties` (any classpath location, recommended `$CATALINA_BASE/lib/`, **never committed**; template `config-secrets.properties.example`) overlays the same keys. Server-side env override for the analytics key: env `TRIPLESALE_AI_KEY` or `-Dtriplesale.ai.key`. Angular equivalent: `environment.ts` + runtime `config.json` (via `APP_INITIALIZER`) so ops can change hosts without rebuild; **secrets must stay server-side (a new BFF or gateway) - they cannot ship in the browser bundle.**

### 8.2 `config.properties` keys (non-secret values shown; secrets = names only)
| Group | Key | Value now / meaning | Differs per env? |
|---|---|---|---|
| Branding | `label.general.project.th/.en`, `label.general.version` (`1.1.0-260918-v2`), `label.general.copyright` | shown on login/footer (`commonBean.version`) | no |
| Base URLs | `triplesale.api.base` | CRM API host (UAT now) | **yes** |
| | `triplesale.auth.base` | auth host | **yes** |
| | `triplesale.api.dashboard` | dashboard host | **yes** |
| | `triplesale.file.base` | file server host (used for `/docproxy` allow-list) | **yes** |
| | `triplesale.chat.base`, `triplesale.chat.socket` | chat REST / Socket.IO | **yes** |
| | `triplesale.ai.base` | CHAT_BOT (analytics + help) | **yes** |
| | `aitran.service.base`, `aihub.service.base` | AI translate / AI HUB | **yes** |
| | `triplesale.api.branches.base` (optional, absent) | override for `/master-data/branches` when the gateway is broken | only when needed |
| | `triplesale.auth.org` (`triplesale`) | **unused** since 13/08 (org now chosen via select-org) | - |
| Secrets (names only) | `triplesale.ai.key` (-> header `X-Analytics-Key`), `aitran.api.key`, `aihub.api.key` | also in `config-secrets.properties` (names `aitran.api.key`, `aihub.api.key`); production must supply via secrets file / env, not config.properties | **yes** |
| Documents | `triplesale.api.documents.formtype.style` = `old` (`new` when backend migrated) | switch of the 7 formType value sets | when backend changes |
| Activity | `activity.list.source=api` (`aggregate` = legacy combine), `activity.list.group.topup=true` | | no |
| Customers | `contracts.list.enrich.threads=1`, `contracts.list.sortby.<key>`, `triplesale.api.prospect_creates_lead=true`, `triplesale.api.prospect_send_employee_id=false` | tuned to backend defects | no |
| Dashboard | `triplesale.api.dashboard.cache.ttl=30` (s) | proxy response cache | no |
| Upload | `triplesale.upload.max.bytes=14680064` | UI file size cap (14 MB) | no |
| Permissions | `triplesale.page.guard.enabled=true` | page-level role guard; `false` = emergency off | no |
| Dev tooling | `triplesale.apilog.enabled=true`, `triplesale.apilog.max=300`, `triplesale.api.log=<dir>` (Windows path now; Linux path commented), `triplesale.apilog.require.superadmin=false` (**dev only - must be absent/true in prod**: log contains real tokens) | | **yes** |
| AI HUB | `aihub.menu.enabled=true` (hot switch: menu + page + `/aihub/*` -> 503 when false) | | per tenant |
| Mock | `drilldown.mock` (absent; `true` => mock drilldown data) | | no |
| Legacy (read by dead code, not in file) | `label.general.domain`, `label.general.pid`, `label.general.monitor.query`, `triplesale.api.contact.*`, `triplesale.api.lead.*`, `triplesale.api.master.*` (-> "Missing config key"), `triplesale.api.auth.username/password/deviceid`, `triplesale.api.auth.token` | | - |

Compile-time constants (not config): `SessionRoles.TEMP_GRANT_SUPER_ADMIN=false`, `Data_API.CURL_DUMP_ENABLED=true` with `CURL_DUMP_SHOW_TOKEN=true` (**logs curl with real Bearer to server log**), `ApiLog.REQUIRE_SUPER_ADMIN=true`, `Data_API` body log limits 2,000 / 65,536 chars.

### 8.3 Other config files
| File | What | Note |
|---|---|---|
| `jdbc.properties` (keys: `jdbc.driverClassName, jdbc.url, jdbc.username, jdbc.password, hibernate.dialect, hibernate.show_sql, hibernate.format_sql, hibernate.generate_statistics`) | legacy MySQL `red` DB + Hibernate (user/role tables `Yot_User_*`, `Napsaleorder`) | App boots with **zero** DB connections (c3p0 `initialPoolSize=0`); not needed by the Angular app. **Security finding:** a commented-out PostgreSQL block in this SVN-tracked file contains a plaintext password - values not reproduced here; rotate/remove |
| `config-secrets.properties(.example)` | secret overlay (names: `aitran.api.key`, `aihub.api.key`) | see 8.1 |
| `report_config.properties` | JasperReports catalogue (8.4) | |
| `log4j.properties` | console appender only, root `info` | |
| `theme_1.properties` | CSS root colours read by `commonBean.getRootColor` | |
| `resources/api-config.properties` | one wiremock URL (dead) | |
| `applicationContext.xml` | Spring: PropertySourcesPlaceholder(jdbc), `PropertyFileConfig` bean(`config.properties`), c3p0 pool, Hibernate `SessionFactory` (scan `com.ace.spring.model`), tx manager, component-scan `com.ace.spring` | legacy persistence |
| `web.xml` | Spring context listener, SpringSecurity filter chain, UTF-8 filter, **session timeout 180**, error page `/error.jsp`, JSF `Production` stage, client state saving, `FACELETS_REFRESH_PERIOD=0` (dev hot reload; comment says production should be -1), PrimeFaces theme `pandora-#{guestPreferences.componentTheme}`, Faces servlet `*.face` + `*.xhtml`, mime types | |
| `versions` (614 lines) | central release changelog (latest 1.0.21 not yet deployed) | per-dev logs in `src/java/changelog/changelog_{arm,pee,tae,yot}` |
| `src/java/sql/*` | `aitran_*.sql` (translation service schema, now owned by aitran-service) | |

### 8.4 Report configuration (`report_config.properties`, 256 lines)
* Single host key **`triplesale.report.base`** (currently the production gateway) - moving servers = change this line; previous values kept as comments (`192.168.24.177:8180/8080`, UAT ERP). `triplesale.report.path_logo` = logo path **on the report server's disk**.
* Per report `<CODE>`: `.jasper` (required), `.jrxml`, `.name` (title), `.datefmt` (default `yyyy-MM-dd`), `.col.<filterKey>` (SQL column -> appended to `externalSQLWhere`), `.param.<filterKey>` (plain report parameter), `.orderby.<value>` (whitelist for `externalSQLOrderBy`, anything else ignored), `.fixed` (constant params), `.whereprefix` (e.g. `and`; GGW-LD-01 returns 0-byte PDF without it), `.mode=legacy` + `.legacyurl`, optional per-report `.base`.
* Codes configured: `CRMG10, CRMG11, CRMG12, CRMG13, CRMG14` (CRM G-series; CRMG10 = lead list report "รายงานรายชื่อโอกาสขาย"), `GGW-LD-01, GGW-LD-02`, `SUN-LD-01 ... SUN-LD-07, SUN-LD-09`. Permission per report: role `Report_<CODE>_View`; UI permission map = `commonBean.reportPermJson`. Request: `GET /report-pdf?code=<CODE>&dateRange_from&dateRange_to&owner&status&sort...` (filter keys from `report_mock.json` `filterDefs`); servlet fetches PDF and streams it with a "no PDF/0 bytes" fallback.
* RV receipt form `RV-01` uses `TriplesaleApi.rvJasperReportUrl(txno)` (`exportTo=pdf`, `externalSQLWhere` on `txNo`/`txType='RV'`, path contains `/rv/rv/` twice, `%20` not `+`).

### 8.5 What must be environment-configurable in Angular
`apiBase, authBase, dashboardBase, fileBase, chatBase, chatSocketUrl/path, aiBase (CHAT_BOT), aitranBase, aihubBase, reportBase` + flags `pageGuardEnabled, aihubMenuEnabled, documentsFormTypeStyle (old|new), activityListSource, uploadMaxBytes (default 14,680,064; hard cap 15,000,000), drilldownMock, apiLogEnabled(dev)`; secrets (`X-Analytics-Key`, `X-Api-Key`, aitran/aihub keys) must live in a server component.

---

## 9. Domain model (answers Q8)

Terminology trap: **"contracts" (`contracts.face`, `ContractView/ContractBean`) = customer/prospect list**, not legal contracts. The word "Chanel" (single n) is the backend spelling (`marketingChanelId/Name`).

| Entity | Key fields (source) | Relations / notes |
|---|---|---|
| **User / Employee** | `employee{id, code, name, attachFile, branch{id,code,name}}`, `profile{name}`, `preference{lang,...}` (user-detail); `ssousername` | roles via `/me/roles`; `ss_employee_id` compared to lead owner |
| **Company / Branch ("org")** | `{id (e.g. 1004400123), code ("SUN","ACE","GOLD",...), name ("SUN GATEWAY"), nameTh}` from `/master-data/branches`; `ggwBranch` code in dashboards; `ggwBranchId/Code/Name` in chat | selected at login (select-org) = active branch that filters data; `business-branches` is a different list (RV) |
| **Prospect (customer)** `ProspectResDTO/ProspectDetailDTO` | `id, code, name, customerType(person\|juristic), sex, taxBranch, idCardOrPassport, birthDate, age, nationality, occupation, position, companyName, customerTel + phoneCountryCode, mobile1-3, phone1-3, fax, prospectEmail, prospectLine/Facebook/Instagram/Twitter, contactDate, contactMethod (contactDateMethod), convenient, remark, sourceLocation, marketingChanelId/Name, employee{Code,Name}, saleGroup{Id,Code,Name}, salePerson{Id,Code,Name}, currentAddress/CityId/CityName/DistrictId/DistrictName/SubDistrictName/PostId/CountryCode/CountryName, sendDocAddress/City/District/SubDistrict/Post/Country (+ request/response casing difference), officeAddress/officePhone/officeContactName/Phone, relationWithCustomer, attachFile/downloadAttachFile/attachFileBase64, sunProspectInfo{...extended CRM info incl. *_sf satisfaction columns}, satisfaction{...}` | has many Opportunities, Attachments (`detailOrderNo`, `attachFileTypeCode` PROFILE/DOC, `description`), chat links (`prospect-social/link`), RV documents |
| **Lead (โอกาสขาย)** `LeadListItemResDTO / LeadDetailResDTO` | card: `id, txNo, txDate, leadStatus, activeStatus, prospectId/Code/Name/Tel/Avatar, currentCityName/Code, currentDistrictName/Code, currentCountryName/Code, marketingChanelName, movementTypeId/Code/Name, salePersonId/Code/Name, salesOwnerId/Code/Name, unassigned, saleGroupId/Code/Name, targetMonth, targetYearCode/Name, forwardStatus, leadDemand, lastUpdatedAt, amount, tags`; detail adds `contactDate, targetYear, employeeName, usesWorkflowStep, materialList[], appointmentList[], taskList[], contactHistoryList[], tagList[], activeSteps[], currentStep, prospect, prospectInfo{personalInfo, contactInfo, addressInfo, ...}` | belongs to Prospect + Movement type (product) + Sale group + owner; accessors list; tags; trade items (materials) |
| **Movement type (product, type `LD`)** | `{id, code (e.g. LD-WFS-A..E), name}`; flag "has workflow step" | selects workflow; dashboards filter `movementtype` |
| **Activity group / step (workflow)** | group `{id, code, name}` ordered; step/procedure `{id, code, name}`; workflow-step instance `{wfsTxNo, wfsStatus, detailOrderNo, procedureGroupId/Code/Name, procedureId/Code/Name, assigneeId/Code/Name}`; kanban column `{stepId, stepCode, stepName, amount}`; actions forward (fork to several teams), return, close-step, close lead | codes seen in dashboards: CS, AN, PLS, LS, FI, LE, CRM (`GROUP_META`) |
| **Contact activity / contact history** | `{channel, content, procedureGroup*, procedure*, salePerson{...}, changeDate}`; list row `lead_id, lead_txno, prospect_*, content, content_from, date/time, contact_txno, topic, priority, detail, status, contacttype{id,code,name}, notifier_name, assign_to{id,code,name}, color, customer_tel` | channels Call In/Out, SMS, Email, Facebook, Line, WhatsApp, Manual |
| **Schedule (appointment/task)** | `{id, leadId, type APPOINTMENT\|TASK, subject, detail, date, time, status doing\|success..., taskAssigneeId, procedureGroupId, completed}` + list filters (appointmentStatus, taskStatus, serviceId, assignToId) | month/week/day/list views; calendar of dashboards |
| **Tag** | `{id, code, name, colorCode}` | lead tags (`PUT /leads/{id}/tags`) |
| **Material / product catalogue** | `{id, code, name}` in material-groups; lead `materialList` (item shape unknown); RV items | |
| **Sales documents (legacy 7 form types)** | list row `{id, txNo, txDate, customerCode, customerName, customerAvatar, receiveByName\|createdBy, receiveDate, status}`; credit application `formsun{borrower, coBorrower, guarantor}` (each a flat string map) ; attachments | `LetterofIntent (formintent), LegalCreditServiceRequest (formloan), Servicecontract, LoanAgreement, PreliminaryCreditApproval (preloanapprove), PropertyProjectContract, CreditApplication (formsun)`; permissions `CRM_Document_<Type>_{View,Create,Edit}` |
| **New sales docs (UI only)** | `qt` quotation, `bk` booking, `ob` delivery note, `aq` auto quotation, `ad` auto booking (vehicle booking agreement), `so` sales order (removed) ; payment methods 5 kinds (cash, credit term, instalment, 7% deposit, 0% advance), VAT modes, item table (price x qty, line discount baht/%, bill discount) | no backend yet |
| **Receipt RV (ใบรับเงิน)** | `txno, txtype=RV, payer (lead/prospect), items(materials), payments (receive method, card/account, change for cash), currency + exchangeRate, branch (business-branches), attachments (attach-file-types), approval status (`/rv/approve`)` | PDF `RV-01`; `PV` payment voucher legacy |
| **Report** | code, name, filters (`dateRange, owner, status, sort...`) | permissions `Report_<CODE>_View` |
| **Drilldown report** | `T-CS-01, T-PLS-01..03, T-LS-01..05, T-LE-01, T-FI-01` -> dynamic columns | |
| **Dashboard objects** | KPI `{total, closed, closedPct, avgDays, countries, topCountry}`, funnels (source/cs/country), pipeline (+detail), activity-group summary, employee performance (+steps, pending/completed lists), customer step groups/status list, lead list | filters year/month/date range/basis/employee/channel/country/occupation/province/group/product/branch |
| **Chat** | Conversation (`id, channelType, pageId, userId, profile*, status OPEN/PENDING/CLOSED, unreadCount, starred, last message*, prospectName/Code, leadId, assignedTo, ggwBranch*`), Message (see 4.11), ChannelAccount (registry; secrets hidden), QuickMessage (`name` <= 2000 chars, `description` <= 100, `usagestatus`), AI company knowledge, bot switches | per-branch scoping |
| **Promotion / Market plan / Petition** (mock) | Promotion `{id, code, name, description, number_sales, number_view, fromdate, todate, valid_from, valid_to, image, thumbnail_image, specialcondition, matlist, discount_value, price_per_unit, type, quantity}`; MarketPlan `{id, title, status draft\|confirm\|progress\|done, progress 0-100, img, owners[], startDate, endDate, createdBy, lastUpdated}`; Petition `{name, avatarUrl, score}` | no API |
| **Legacy (ignore)** | `Napsaleorder`, `Yot_User_*`, gold shop/garage/auto-repair beans (`ProductBean`, `GarageBean`, `RepairplanBean`, `MssoshopBean`, `PvBean`...) | dead modules from earlier products (~1,300 Thai strings in classes with no live page) |

---

## 10. Implications for the Angular core layer (recommendations)

1. **Choose the integration model first.** The old design = BFF with server-held token. Options: (a) keep/rewrite a thin BFF (Node/Spring) that exposes the same logical routes and holds tokens/keys (safest; secrets for aitran/ai-hub/analytics must be server-side anyway; also handles file proxying, cache, role pre-checks, location-name translation); (b) call the gateway directly from Angular with `Authorization: Bearer` (requires CORS for the new origin on `triplesale-auth`, `triplesale-service`, `triplesale-chat`, dashboard; token kept in memory/sessionStorage - XSS exposure; **ask backend whether a refresh endpoint exists** because the old app never used `refresh_token`). Hybrid is likely: direct for CRUD, BFF for secrets/PDF/file proxy.
2. **Core services/interceptors to build:** `ConfigService` (runtime `config.json`), `AuthService` (3-step login, token store, `expires_at`, `requires_org_selection`, logout, `?auth=` handling, user-detail + roles load), `AuthInterceptor` (Bearer), `ErrorInterceptor` (401/403/5xx, envelope check incl. body `status`, `crmErrText`-style message extraction, Thai-text pass-through), `RoleService` + `roleGuard`/`PageAccessRules` map (section 2.6) + structural directive `*hasRole`, super_admin aliases, `_Sup`/owner rule helper, `I18nService` (th/en JSON from the two properties files; fallback th -> key; `{0}` args; locale in localStorage + `PATCH /me/preference`; default th at login), `MasterDataI18nService` (code overrides, provinces cleaning, metro-geo fallback), `PhoneFormatService` (TsPhone), `DateService` (dd/MM/yyyy + Thai names, YYYY-MM-DD wire, epoch-seconds guard), `FileUploadService` (base64, size 15,000,000 B / 14 MB UI, extension whitelist, post-upload verification), `FilePreviewService` (replacement for `/docproxy`), `PaginationHelper` (page/perPage vs pageSize, infinite scroll), `FilterStateService` (replaces `/board/*filter-state`), `SocketService` (socket.io-client 4.x, events above), `ApiLog`-like dev interceptor (dev builds only, tokens redacted).
3. **Do not port**: legacy form-login, `loginsso`/`j_security_check`, `LoginController`, JDBC/Hibernate layer, `ProspectUpdateServlet` (direct DB), api-log tool with tokens, gold-shop/garage legacy beans, `messages_jp`, chat-webhook-socket-io prototype, LINE/FB webhook servlets in the WAR.
4. **Parity checklist for server-side transformations** (section 3.4) - these silently change data the UI expects (country/province translation, Thai-only provinces, channel labels, `activityGroupId`->`procedureGroupId`, `AttachUrl`, enrichment, session caches, `ggwBranch` injection).
5. **Open questions for the backend/DevOps team:** CORS allow-list for the Angular origin; refresh-token/`/auth/refresh`; OpenAPI (`/triplesale-service/v3/api-docs`) access for typed client generation; whether `dashboard-triplesale-service` should keep being unauthenticated; exposure of Socket.IO (3321) and WebSocket support through the gateway (`chat-socket` route); file-server access/CORS for `attachFile` URLs; `/me/roles` response schema; status of the known bugs in 5.7 (#1 file persistence, #3-#5 address master data, `/leads/schedules/cancel`); which of promotion/market plan/petition/sales-doc forms are in scope.

---

## Appendix A - where to look in the Java project (relative to `triple_sale_main`)
| Topic | Files |
|---|---|
| Login & session | `src/java/com/ace/spring/servlet/login/{LoginProxyServlet,SessionTokenFilter,PageAccessRules}.java`, `com/ace/utils/{SessionRoles,TriplesaleApi,CurrentRequest,ActiveBranch,Data_API}.java`, `web/index.xhtml`, `web/WEB-INF/pages/template.xhtml` (auth guard ~L1138, logout ~L1915), `src/java/applicationSecurity.xml`, `web/WEB-INF/web.xml` |
| Language | `com/ace/utils/{I18n,MasterDataI18n,CommonBean}.java`, `messages_*.properties`, `masterdata_*.properties`, `I18N_SURVEY.md`, `web/WEB-INF/pages/topbar.xhtml` (flag menu) |
| BFF servlets | `com/ace/manage/content/*Servlet.java` (`/board/*`, `/dashboard/*`), `com/ace/spring/servlet/*` (proxies, RV, reports, files) |
| Services | `ProspectListService`, `ContactActivityApiService`, `SalesDocumentListService`, `RvApiService`, `DashboardApiService`, `DrilldownApiService`, `ProspectApiPayload` |
| Realtime | `web/pages/chatbot.xhtml` (~L3700 config, ~L4300 socket), `ChatSocketProxy`, `ChatApiProxy`, `AnalyticsApiProxy`, `HelpApiProxy`; sibling `triple_sale_chat/src/main/java/com/crm/ace/triplesale/{controller,socket,config,filter}` |
| Config | `src/java/{config.properties,config-secrets.properties.example,report_config.properties,jdbc.properties}`, `PropertyFileConfig` |
| Known backend problems | `BACKEND_BUG_attachments_not_saved.md`, `BACKEND_BUG_masterdata_address.md`, `BACKEND_LIMIT_attachments_20MB.md`, `CLAUDE.md` (UI concepts: stepper/status colours, tag palette) |
| `_api_wiring_backup/` | Backup (July 2026) of the first RV API wiring: `RvApiService.java`, `RvApiServlet.java`, `sales_doc_rv_APIWIRED.xhtml`, `sales_doc_rv_list_APIWIRED.xhtml` - historical, superseded by the live files; `src/java/metro_geo.json` = 77 KB bundled Thai address dataset (488 sub-district rows `{p,pid,pn,d,dn,s,sn,z}`, 79 districts, 6 Bangkok-metro provinces) served by `/board/metro-geo` |
