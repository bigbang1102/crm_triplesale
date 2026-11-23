# Survey 1: Application SHELL and THEME (read-only survey of triple_sale_main)

**Delivery note.** I run in read-only mode with no file-write tool, so I could NOT create `C:\Users\yot\AppData\Local\Temp\claude\F--Angular\622e1fae-3253-4f26-a4c0-2f96fdf2c1c9\scratchpad\survey_1_shell_theme.md`. The full Markdown report is below; please save it to that path. I also accidentally created one scratch list, `/tmp/live_pages.txt` (outside the project, harmless, not deleted). Nothing under D:\Dev-Project was touched.

## SHORT SUMMARY (<=300 words)

- **One shell for the real app:** `/WEB-INF/pages/template.xhtml` is used by about 63 live pages. The 35 root-level pages (Pandora demo kit) use the stock `/WEB-INF/template.xhtml` and are dead. Login (`index.xhtml`) and the dashboard fragments are standalone.
- **Layout:** it is a 68px dark icon rail (`layout-slim-plus`, `#0F172A`, always visible, no hamburger) plus a 44px sticky white top tab bar, an `#EAEEFD` content area (8px padding), and a fixed 30px footer.
- **Pandora defaults in use:** only `layout-slim-plus`, grouped menu, `layout-menu-dark` and `layout-topbar-modify` are in use. Static, overlay, horizontal and ungrouped modes exist only behind a hidden config panel (`display:none`), so they are effectively dead.
- **No breadcrumb and no right panel:** `breadcrumb.xhtml` is commented out of the template and the right panel is static demo data. The legacy Pandora topbar (search, notifications, help) is `display:none`.
- **Menu is static XHTML, not DB-built.** Visibility comes from `commonBean.hasFeature('<role key>')`, backed by the session set `ss_roles` loaded from `GET /me/roles` at login. Left rail has 5 visible items plus 4 hidden ones. The top tab bar is context-dependent: the `navbar_menu` URL parameter selects a tab group, the `act` parameter selects the active tab.
- **Topbar controls:** font-size A-/A/A+ (-2/0/+2 px), light/dark switch, user name + active branch, a user menu with Logout only, a TH/EN flag switch, and a "Log" API-viewer button. There is no company switcher after login (the company is chosen on the login page).
- **Theme:** palette is purple `#35236A` (primary action/nav) plus green `#00C08B` (accent) on a `#0F172A` rail. The dark theme is a `body[data-theme]` switch with slate values. Font is Noto Sans Thai, 14px base, letter-spacing .36px.
- **Persistence:** theme and font size persist in localStorage plus a cookie (`TS_PREF`). Language is a server session value changed via `?lang=`.
- **Stack:** PrimeFaces 14.0.7 on Mojarra 4.0.7. Many modern pages are plain HTML/JS with zero `p:` tags. Charts are ECharts 5.6.0, maps are Leaflet and Google (`p:gmap`), icons are Font Awesome 5.9/6.1.1 plus PrimeIcons.

---

# FULL REPORT

## 0. Source map

| Thing | Location |
|---|---|
| Active template | `web/WEB-INF/pages/template.xhtml` (2709 lines, 182 KB, lots of inline CSS/JS) |
| Active shell parts | `web/WEB-INF/pages/{menu,groupedMenu,topbar,footer,config,rightpanel,breadcrumb,ai_menu,api_log}.xhtml` |
| Stock Pandora copies (dead except the 35 demo pages) | `web/WEB-INF/{template,menu,groupedMenu,ungroupedMenu,topbar,config,rightpanel,footer,breadcrumb}.xhtml` |
| Dead | `web/WEB-INF/pages/template_1.xhtml` (104 KB, referenced by no page), `topbar.xhtml.bak-apilogbtn-202609290935` |
| Config bean (layout classes) | `src/java/org/primefaces/pandora/view/GuestPreferences.java` (session-scoped, CDI `@Named`) |
| Shell data bean | `src/java/com/ace/utils/CommonBean.java` (3511 lines) |
| Roles / branch | `com/ace/utils/SessionRoles.java`, `ActiveBranch.java`, `com/ace/spring/servlet/login/{LoginProxyServlet,SessionTokenFilter,PageAccessRules}.java` |
| i18n | `src/java/messages_{th,en}.properties` (2843 keys each; `messages_jp` is unused, `I18n.SUPPORTED = {th,en}`, default `th`) |
| Legacy colour file | `src/java/theme_1.properties` (read via `commonBean.getRootColor(key)` and injected into template CSS) |
| Servlet mapping | `*.face` and `*.xhtml` both go to the Faces Servlet. Welcome file `index.xhtml` is the login page. Session timeout 180 min. Client-side state saving. |

### Which template do pages use

| Template attribute | Files |
|---|---|
| `/WEB-INF/pages/template.xhtml` | 79 files (63 after excluding `*bk*`, `*bak*`, `*-tae`, `*_BK`, `sun-xxx`, `_1`). All CRM pages in `web/pages/` plus `web/underconstruction.xhtml`. |
| `/WEB-INF/template.xhtml` | 35 files, the root-level Pandora showcase (blocks, button, calendar, charts, crud, dashboard, formlayout, input, table, tree, typography and so on). Dead for the CRM. |
| No template (standalone) | `index.xhtml` (login), `login.xhtml`, `pages/dashboard_{company,gold,sun}.xhtml` (fragments `ui:include`d by `dashboard.xhtml`), `pages/dashboard_{kpi,calendar}_frame.xhtml` (full HTML for iframes), `pages/lead_detail_sub1/sub3.xhtml` (fragments), `pages/components/*`, `pages/inc/*` |

`ui:define` regions used by pages: `title` (78), `viewname` (78), `content` (78), `head` (79). The template has four insertion points: `title`, `head`, `content`, plus `viewname`. **`viewname` feeds `breadcrumb.xhtml`, whose include is commented out (`<!--ui:include src="./breadcrumb.xhtml" /-->`), so no breadcrumb is ever rendered.** Page titles are i18n keys such as `#{commonBean.msg['label.topbar.lead']}` or literals ("CRM", "Triple Sale", "แดชบอร์ด"). The default title is `ACE Cloud`.

## 1. Layout anatomy

### 1.1 DOM tree (template.xhtml body, in order)

1. `#tsNetBar` (offline/online status bar) and `#tsOfflineOverlay` (full-screen blocker). Both are fixed and appear only on connectivity events.
2. Inline scripts: set `body[data-theme]` from `TS_PREF 'app-theme'` before paint, plus the global `fetch` auth guard (see section 6).
3. `div.layout-wrapper.layout-topbar-modify.layout-menu-dark.layout-slim-plus` containing:
   - `p:dialog statusDialog` (modal, no header, the blocking "loading" dialog)
   - `p:confirmDialog global="true"` (width 350, fade, buttons "ไม่ใช่" flat and "ตกลง")
   - `rightpanel.xhtml` (static demo content, hidden)
   - `menu.xhtml`, which is `div.menu-wrapper.layout-menu-page` (inline `z-index:2000`) holding the profile stub plus `groupedMenu.xhtml`
   - `div.layout-main`
     - `topbar.xhtml` (the visible bar is `div.ui-navbar-top-header`; the Pandora `div.layout-topbar` is `display:none`)
     - `div#crm_main_body_page.layout-content` (inline `background-color:#EAEEFD`). It renders `ui:insert name="content"` only when `commonBean.usage_status` is true. That flag is hard-coded true, so the "denied.png" fallback never shows.
     - `config.xhtml` (`.layout-config`, `display:none`)
     - `footer.xhtml`
     - `div.layout-mask`
   - `p:ajaxStatus`: 32x32 spinner (`pi pi-spin pi-spinner`) fixed right:7px bottom:7px
4. Outside the wrapper: `p:sidebar sidebarMain` (the "ตั้งค่าระบบ CRM" settings drawer, right, 45% wide, tabs ข้อมูลทั่วไป / รายการเมนู / ข้อมูลการชำระ / รายงานเอกสาร / Line OA / แหล่งที่มา). Its only opener is the hidden gear (`display:none`), so it is effectively dead. Also `p:dialog system_settingsDialog`, `dialogChannel`, and `dlg_chat` (Bootstrap-3 chat widget; its open buttons are hidden). Dead.
5. `ai_menu.xhtml` (floating AI FAB) and `api_log.xhtml` (Log overlay), placed outside `.layout-wrapper` on purpose (the layout-main transform breaks `position:fixed`).

Wrapper class string comes from `GuestPreferences.getLayoutConfig()`: `"layout-topbar-" + topbarTheme + " layout-menu-" + (menuColor=="colored" ? menuTheme : menuColor) + " " + menuMode`. With the defaults this gives `layout-topbar-modify layout-menu-dark layout-slim-plus`. `body` also gets `ui-input-filled` only if `inputStyle=="filled"` (default `outlined`, so none).

### 1.2 Regions (effective, desktop >=993px)

| Region | Element | Size / position | Behaviour |
|---|---|---|---|
| Left rail | `.menu-wrapper.layout-menu-page` | width **68px**, height 100%, `position:fixed; left:0; top:0`, z-index **2000** (inline; theme default 999). Rail background `#0F172A` (forced with `!important` in both themes). Flex column, `gap:18px`, `padding-bottom:40px`. | Always visible. Never collapses, no hamburger, no overlay. Scrolls vertically if too tall (`overflow:visible` for slim). |
| Main column | `.layout-main` | `margin-left:68px`, `min-height:100vh`, flex column. `padding-top:0 !important` (topbar.css overrides the theme's 30px). | Document scrolls (`body{overflow-x:hidden}`). |
| Top tab bar | `.ui-navbar-top-header` | height **44px**, `padding:0 24px`, flex `space-between`, `position:sticky; top:0; z-index:500`, white bg, `border-bottom:1px solid #E5E7EB`, shadow `0 1px 4px rgba(0,0,0,.08)` | Sticky inside `.layout-main`, so it is offset by the rail automatically. |
| Content | `#crm_main_body_page.layout-content` | `padding:8px !important` (project_root.css; theme default 24px), bg `#EAEEFD` | Pages use `calc(100vh - 44px)` (most common), `-72px`, `-74px`, `-76px` (44 top + 30 footer) and so on. |
| Footer | `.layout-footer` | `position:fixed; bottom:0; width:100%; height:30px !important; padding:8px 40px; z-index:99` | Left: "© {year} **{project_en}** All Rights Reserved". Right: "version {version}". Both 12px, `#969696` (dark `#6B7280`). |
| Breadcrumb | n/a | none | Not rendered. |
| Right panel | `.layout-rightpanel` | 260px, slides in from the right | Never opens (button `display:none`). Static "Amelia Cabal" demo data. Dead. |
| Config panel | `.layout-config` | 400px right drawer | `display:none` inline. Unreachable. |
| Floating AI FAB | `#aiFabRoot` | `position:fixed; right:24px; bottom:46px; z-index:2001` (toast 2002, help window 2003). Draggable (position stored in localStorage). | Items come from `resources/mock/ai_menu.json`: "AI แปลเอกสาร" (opens `ai_translator.face?...navbar_menu_ai`) and "สอบถามการใช้งาน" (opens a help-chat window, `POST <ctx>/help-api/ask`). Icon `images/mascot/triplesale-robot-254.png`. |
| Log overlay | `.alg-overlay` | full-screen, z-index 20000, panel `min(1180px,94vw) x min(84vh,900px)`, radius 14px, header `#35236A` | Opened by the topbar "Log" button. |

Stacking order (low to high): footer 99, topbar 500, dropdown 1000/1001, PF dialogs from 1001, rail 2000, AI FAB 2001-2003, API log 20000, auth modal 99999, swal and net-bar 999999, offline overlay 2147483000.

### 1.3 Menu modes and what decides them

`GuestPreferences` (session-scoped, resets on new session) holds the options below. It is only editable through the hidden `config.xhtml`, so users cannot change it in practice.

| Property | Default (live) | Other values (hidden panel only) |
|---|---|---|
| `menuMode` | `layout-slim-plus` | `layout-static` (adds `layout-static-active`), `layout-overlay`, `layout-horizontal`, `layout-slim` |
| `groupedMenu` | `true` | `false` selects `ungroupedMenu.xhtml` (the stock Pandora demo tree with Dealer, UI Kit and so on; dead) |
| `menuColor` | `dark` | `light`, `colored` |
| `menuTheme` | `modify` (14 palettes) | |
| `topbarTheme` | `modify` | 20 themes |
| `componentTheme` | `bluegrey`, used as `primefaces.THEME = pandora-#{guestPreferences.componentTheme}` | 15 colour themes |
| `layoutPrimaryColor` | `modify`, loads `pandora-layout/css/layout-modify.css` (346 KB) | `layout-blue.css` and 13 others (334 KB each, unused) |
| `inputStyle` | `outlined` | `filled` |
| `darkLogo` | false | true when the topbar theme is "light" |

`menu.xhtml` picks the menu with `<ui:include src="#{guestPreferences.groupedMenu ? 'groupedMenu.xhtml' : 'ungroupedMenu.xhtml'}"/>`.

### 1.4 Collapsed / expanded and responsive

- Desktop >=993px: rail 68px, `.layout-main` margin-left 68px (theme CSS).
- <=992px (template override, "กติกา 21/07": the rail must NOT collapse): rail pinned with `transform:translate3d(0,0,0)`, width **60px**, and `.layout-main` margin-left **80px** for slim-plus (a mismatch with the 60px rail; unfixed bug). The Pandora profile block collapses to icons.
- The theme also sets `.layout-content{padding:32px 13px}` at <=992px, but project_root.css `padding:8px !important` wins.
- Breakpoints actually used in the theme or template: 992/993 (shell), 640 and 1024 (theme pieces). The template has empty `@media` shells at 380, 640, 854, 1024, 1152, 1280, 1366, 1440, 1600, 1920, 2048, 2560, 3440, 3840 and 4096 (no rules). Pages use their own: `max-width` 600, 767/768, 1023, 1279 (most common), 1599, and `min-width` 1280, 1600, 1920. `project_layout6.css` adds, only at >=1870px, `.tempate_top_menu_txt{font-size:var(--tempate_top_menu_txt)}` and `.ui-inputswitch-checked{background:#00C08B}`.
- No dynamic collapse. The only variable layout input is the user font-scale (section 3).
- Login page: 2-column grid at >=992px (form left, brand image right), single column below, with a second step at <=576px (smaller paddings).

## 2. Menu

### 2.1 Left rail: `groupedMenu.xhtml` (static XHTML, 588 lines; not bean- or DB-generated)

The rail is a plain `<ul>` inside `div.layout-main-grouped-menu` (width 68px). Each item is `li.layout-menu-grouped-menu` containing `a > span > i.pi-menu.pi-menu-item-custom-N` plus a label span. The visibility conditions are JSF `rendered=` flags evaluated per request. They read role keys from the session set `ss_roles`, which comes from `GET {api}/triplesale-service/api/v1/me/roles` at login and is cached in the session. A trailing "po:menu rendered=false" block is a dead copy of the demo tree.

| # | Label (th / en) | i18n key | Icon class (`.pi-menu-item-custom-N`) → SVG (normal / active) | Target (relative to `/pages/`, `.face` = JSF) | Visible when |
|---|---|---|---|---|---|
| 1 | Logo (no text) | n/a | `images/logo/logo.png` (335x335), shown 44.9px wide in an 80px-high cell | `dashboard.face?pid=1&page_id=1&act=1&navbar_menu=navbar_menu_sun` | Always shown. **Clickable only with `hasFeature('FEATURE_CRM_Dashboard')`**; otherwise the same logo is non-clickable at `opacity:.5` |
| 2 | แต้มสะสม / Loyalty Points | `label.tk.title` | custom-4 → `icon_menu/menu_ticket_star.svg` / `active_ticket_star.svg` | `tk_dashboard.face?pid=1&page_id=8&act=8&action_type=list&navbar_menu=navbar_menu_point` | **Hidden** (`rendered="false"`) |
| 3 | คำร้อง / Petitions | `label.menu.petition` | custom-3 → `menu_bookmark.svg` / `active_bookmark.svg` | `underconstruction.xhtml?navbar_menu=navbar_menu_ticket` | **Hidden** |
| 4 | **CRM** (literal) | none | custom-2 → `menu_work.svg` / `active_work.svg` (20x20) | `index.face?pid=1&page_id=1&act=1&navbar_menu=navbar_menu_home` | `hasFeature('MODULE_CRM')` |
| 5 | **งานขาย / Sales** | `label.menu.sales` | custom-7 → `menu_chart.svg` / `active_chart.svg` (21x20, drawn as background-image) | `sales_doc_rv_list.xhtml?navbar_menu=navbar_menu_sale` | `hasFeature('FEATURE_CRM_Document')` |
| 6 | คลังสินค้า / Inventory | `label.template.inventory` | custom-5 → `menu_group.svg` / `active_group.svg` | `underconstruction.xhtml?navbar_menu=navbar_menu_product` | **Hidden** |
| 7 | การตลาด / Marketing | `label.menu.marketing` | custom-6 → `menu_send.svg` / `active_send.svg` | `underconstruction.xhtml?navbar_menu=navbar_menu_marketing` | **Hidden** |
| 8 | **รายงาน / Report** | `label.template.report` | custom-9 → `menu_document.svg` / `active_document.svg` | `report.xhtml?navbar_menu=navbar_menu_report` | `hasFeature('FEATURE_CRM_Report')` |
| 9 | **AI HUB** (literal) | none | custom-10 → `menu_ai_hub.svg` / `active_ai_hub.svg` | `ai_hub.face?pid=1&page_id=16&act=16&navbar_menu=navbar_menu_aihub` | `commonBean.aiHubEnabled` = `config.properties` key `aihub.menu.enabled=true` |
| 10 | แชท / Chat (pinned bottom-left, absolute, icon 28x28, label white) | `chat.title` | `menu_chat.svg` (no active swap; active = `#chatMenuBtn.chat-active` → bg `rgba(255,255,255,.18)`, radius 10px, icon `brightness(1.4)`) | `chatbot.face?pid=1&page_id=14&act=14&navbar_menu=navbar_menu_chat` (click handler on a div) | `hasFeature('MODULE_CHATBOX')` |

**Resulting visible rail for a fully-privileged user:** Logo, CRM, งานขาย, รายงาน, AI HUB, plus Chat at the bottom. Items 2, 3, 6 and 7 are hard-hidden pending backend keys. Icon SVGs live in `web/images/icon_menu/` (`menu_*.svg` and `active_*.svg`, plus unused `*_home`, `*_social`).

**Item look:**
- Item cell 68px wide x **66px** high (`height:66px !important`), flex column, centred, `gap:8px`, `border-left:2px solid transparent`.
- Label: 12px (`--font-size-small`), weight 400, white, centred, letter-spacing .2px.
- Hover: bg `rgba(0,192,139,.10)`, left border `2px #00C08B`, label `#00C08B`, icon swaps to the `active_*` SVG.
- Active (`.menu-active`, set on both the `li` and its `i`): same as hover.
- Active detection (JS in `groupedMenu.xhtml`): match the `navbar_menu` URL parameter against each link's own `navbar_menu`. Fallback: match the page file name. Fallback: remember the last group in `sessionStorage['menu_navbar']`. The Chat button is matched separately. Logo group `navbar_menu_sun` deliberately highlights nothing.
- Row `margin-bottom:10px` for PF menu items; `ul` gap 8px.

### 2.2 Top tab bar: `topbar.xhtml` (static XHTML)

Tabs are `p:panel.panel-navbar > div#navbar-N.ui-navbar-top-sup-item-header`. Two stacked conditions decide whether a tab shows:
1. `commonBean.viewTopbarPage('topbar-page-NNN')`, an allow-list per **tab group**. The group is the `navbar_menu` URL parameter. It is remembered in the session (`ss_param_navbar`) and defaults to `navbar_menu_home`. Unknown group names return `true` for every tab (see the note below).
2. An optional `commonBean.hasFeature(...)` role key.

The active tab is `commonBean.menu_active eq 'N'`, where N comes from the URL parameter **`act`** (default "1"). Active style is described in section 4.

Group → allowed tab ids (from `CommonBean.viewTopbarPage`):

| `navbar_menu` group | Tabs shown |
|---|---|
| `navbar_menu_home` (CRM; default) | 001, 002, 003, 004, 005, 007, 012 |
| `navbar_menu_ticket` | 008, 009, 010 |
| `navbar_menu_point` | 008, 011 |
| `navbar_menu_chat` | 013 |
| `navbar_menu_ai` | 014 |
| `navbar_menu_sun` | 001 |
| `navbar_menu_aihub` | none of the above; 4 AI-HUB dropdown tabs 17-20 are shown and all other panels hidden by a scoped `<style>` |
| any other, e.g. `navbar_menu_sale`, `navbar_menu_report` | all allowed by the Java method, but the `UC_MENUS` script hides every panel except `navbar-8` ("หน้าหลัก", which then just reloads the current URL) |

So the **งานขาย and รายงาน left-rail pages show only a single "หน้าหลัก" tab**.

All tabs (th / en labels from `messages_th/en.properties`):

| id / act | Tab | Label key | Icon | URL (resolved against `/pages/`) | Extra visibility |
|---|---|---|---|---|---|
| navbar-1 (001) | แดชบอร์ด / Dashboard | `label.template.dashboard` | mask `topnav/fi_grid.svg` | `index.face?pid=1&page_id=1&act=1` | `FEATURE_CRM_Dashboard` |
| navbar-2 (002) | ลูกค้าเป้าหมาย / Prospects | `label.topbar.prospect` | `topnav/fi_users.svg` | `contracts.face?pid=1&page_id=2&act=2&action_type=list` | `FEATURE_CRM_Prospect` |
| navbar-3 (003) | โอกาสขาย / Lead | `label.topbar.lead` | `topnav/fi_Briefcase.svg` | `lead.face?pid=1&page_id=3&act=3&action_type=list` | `FEATURE_CRM_Lead` |
| navbar-4 (004) | การติดต่อ / Activities | `label.topbar.activity` | `topnav/fi_message-circle.svg` | `activity.face?pid=1&page_id=4&act=4&action_type=list` | `FEATURE_CRM_ContactActivity` |
| navbar-5 (005) | ปฏิทินงาน / Calendar | `label.topbar.schedule` | `topnav/fi_calendar.svg` | `schedule.face?pid=1&page_id=5&act=5&sub_id=1` | `FEATURE_CRM_Calendar` |
| navbar-6 (006) | เอกสารการขาย dropdown | `label.topbar.sales_doc` | none | `quatat/AA.face?...&acts=61-67&tx_type=qt/so/ob/rv/pv` (7 items) | **permanently hidden** (`style="display:none"`) |
| navbar-7 (007) | **ข้อมูลประกอบ / Supporting Documents** (dropdown, `pi-chevron-down`) | `label.topbar.support_doc` | FA `far fa-folder-open` | see 7 items below | `FEATURE_CRM_Document` |
| navbar-12 | แผนเดินตลาด / Market Plan (dropdown) | `label.topbar.market_plan` | `topnav/fi_book-open.svg` | `market_plan.face` and `market_plan_map.face`, `act=12` | `rendered="false"` (hidden) |
| navbar-8 | หน้าหลัก / Home | `label.topbar.home` | FA `fas fa-house` | `tk_dashboard.face?pid=1&page_id=8&act=8&action_type=list` | groups ticket/point (008), and the sale/report case |
| navbar-9 | รายการลูกค้า / Customers | `label.topbar.customer_list` | FA `far fa-id-card` | `pt_customer_list.face?...act=9` | group ticket |
| navbar-10 | รายการคำร้อง / Petitions | `label.topbar.petition_list` | FA `far fa-file-lines` | `pt_petition_list.face?...act=10` | group ticket |
| navbar-11 | รายการโปรโมชั่น / Promotions | `label.topbar.promotion` | FA `fas fa-tags` | `promotion.face?...act=11` | group point |
| navbar-13 | จัดการแชท / Chat Management | `label.topbar.chat` | FA `far fa-comments` | `chatbot.face?pid=1&page_id=14&act=14&navbar_menu=navbar_menu_chat` | group chat |
| navbar-15 | AI แปลเอกสาร / AI Document Translator | `label.topbar.ai.translator` | FA `fa-solid fa-language` | `ai_translator.face?...act=15&navbar_menu=navbar_menu_ai` | group ai |
| navbar-17..20 | AI HUB dropdowns (see below) | literal English group names | FA | `ai_hub.face?...&act=17-20&acts=...&tool=...&navbar_menu=navbar_menu_aihub` | `navbar_menu_aihub` **and** `aiHubEnabled` |

**navbar-7 dropdown items** (`pi` icon + label; acts 71-77, URLs `/pages/sales_document.face`, `sales_document_2..7.face`, `?pid=1&page_id=7&act=7&acts=7N&sub_id=N&action_type=list`):
1. `label.topbar.support_doc.intent` ใบเจตจำนงค์ (`pi-file`)
2. `legal_credit` ใบขอใช้บริการนิติกรรมและสินเชื่อ (`pi-file-edit`)
3. `service_contract` สัญญาบริการ (`pi-verified`)
4. `loan_contract` สัญญาเงินกู้ (`pi-money-bill`)
5. `credit_approval` ใบอนุมัติวงเงินเบื้องต้น (`pi-check-circle`)
6. `property_contract` สัญญาโครงการอสังหาริมทรัพย์ (`pi-building`)
7. `credit_request` ใบคำขอสินเชื่อ (`pi-credit-card`)

Then a nested **DrillDown** submenu (`label.topbar.drilldown`, `pi-chart-bar`, chevron-right), shown only with `hasFeature('CRM_Dashboard_View')`. It has 11 sub-items, all to `drilldown.face?...&code=<X>`: T-CS-01, T-PLS-01, T-PLS-02, T-PLS-03, T-LS-01, T-LS-02, T-LS-03, T-LS-04, T-LS-05, T-LE-01, T-FI-01 (acts 78-88, sub_id 8-18).

**AI HUB dropdowns (navbar-17..20)** (icons coloured: `#2563EB` / `#DB2777` / `#059669` / `#4F46E5`):
- 17 "Document AI": วิเคราะห์เอกสาร (`doc-analyze`), สรุปเอกสาร (`doc-summary`), วิเคราะห์ข้อมูล (`data-analyze`), สรุปการประชุม (`meeting`)
- 18 "Content Creation": ทำสไลด์ (`slides`), สร้างรูปภาพ (`image`), สร้างคลิป (`video`), สร้างเพลง (`music`)
- 19 "Developer AI": เขียนโค้ด (`code`)
- 20 "Knowledge & Strategy": วิเคราะห์กลยุทธ์ (`strategy`), ศึกษาวิธีทำงาน (`howto`), สร้างแผนภาพ (`diagram`), ถามคลังเอกสาร (`library-ask`)

Active sub-item (`.navbar-subitem-active`): matched by JS on file name, then `acts`, then `sub_id`.

**Page-level role gate:** `PageAccessRules` (server filter `SessionTokenFilter`) maps page file name to a required role key, so a visible menu equals an enterable page. Roles: `chatbot→MODULE_CHATBOX`; `dashboard*→FEATURE_CRM_Dashboard`; `drilldown*→CRM_Dashboard_View`; `contracts*, supporting_documents→FEATURE_CRM_Prospect`; `lead*→FEATURE_CRM_Lead`; `activity*, contact_history→FEATURE_CRM_ContactActivity`; `schedule→FEATURE_CRM_Calendar`; `sales_document*, sales_doc*, quotation, AA→FEATURE_CRM_Document`; `report→FEATURE_CRM_Report`; `super_admin` (aliases: super_admin, superadmin, ROLE_SUPER_ADMIN, super_super_crm) passes all. Pages not listed (e.g. `pt_*`, `promotion*`, `market_plan*`, `ai_*`) are open to any logged-in user.

## 3. Topbar controls

Everything lives in `div.ui-navbar-top-header`. Left cluster = tabs (section 2.2). Right cluster = `li.topbar-item.language` (flex, gap 16px):

| Control | Visual | Behaviour | Data |
|---|---|---|---|
| Font-size buttons ×3 | Three "A" in 26x26 circles, glyph sizes **16 / 20 / 24px**, colour `#374151`; active = bg `rgba(0,192,139,.15)` (dark: .25), colour `#00C08B`, weight 700 | `changeFontSize(el, -2 / 0 / +2)` sets CSS custom properties on `:root`: `--fs-adj` (-2/0/+2px, used 2652 times in `calc(Npx + var(--fs-adj))`), and `--font-size-mini/small/0..10`, `--font-size`, `--styled-font-size`, `--header-font-size`, `--tempate_top_menu_txt`, `--index_top_card_txt*` = base ± size | Persisted via `TS_PREF` keys `ses-fontsize` and `ses-fontnumber`. Default: middle (index 1, 0px). |
| Light/dark switch | `label.ui-switch` 52x32 track, transparent bg + 1.5px border (`rgba(0,0,0,.15)` light, `rgba(255,255,255,.3)` dark), 28px knob with sun/moon glyph | `changeMenuColor()`: sets `body[data-theme="dark"|"light"]`, writes `TS_PREF 'app-theme'`, and also fires server `rc_MenuColorDark/Light` (sets `guestPreferences.menuColor`, no visible effect because the rail is colour-pinned) | Default **light** if nothing stored. Applied before first paint by an inline script. |
| User name | FA `far fa-user` 14px + name 12px/400, letter-spacing .2px (`#374151` light, `#9CA3AF` dark) + chevron-down 12px `#6B7280` | Click opens the user menu overlay | Name = `sessionScope.ss_profile_name` (fallback `commonBean.username` = session `ssousername`) |
| Active branch | `(<name>)` 12px `#6B7280`, tooltip `label.usermenu.branch` ("สาขาที่ใช้งานอยู่") | Read-only; **no company/branch switcher after login** (the company is chosen on the login page, "select-org") | `commonBean.activeBranchName` → `ActiveBranch.name(session)` (`ss_user_detail.employee.branch`, then `/me/permission-context`, then `ss_branch_code`); hidden if empty |
| User-menu overlay | white, 200px min, 1px `#E3E3E3`, radius 8px, shadow `0 4px 12px rgba(0,0,0,.10)`, z-index 9999, item padding 10px 16px, 14px | One item: `pi-sign-out` "ออกจากระบบ" (`label.usermenu.logout`). Click shows a swal confirm ("ยืนยันการออกจากระบบ" / "คุณต้องการออกจากระบบใช่หรือไม่?", buttons ยกเลิก / ออกจากระบบ, danger mode), then navigates to `/<ctx>/logout`. Closes on outside click or Esc. | |
| Language flag | 24px flag image (`thailand.png` / `england.png`, radius 3px) in a padded rounded button; hover bg `#F1F2F4` | Opens a small overlay (172px): "ไทย" and "English" with a green `pi-check` (`#00C08B`) on the current one. Selecting runs `change_language(code)` = reload the same URL with `?lang=th|en` (`location.replace`). | `commonBean.currentLang`. Server stores the session key `session_change_language` and syncs the preference to the backend. **Login always resets to th.** Only th and en are supported. |
| "Log" button | Bordered pill (1px `#E3E3E3`, radius 7px, 12px, colour `#35236A`) with FA `fas fa-terminal` | `algOpen()` opens the API-log overlay (`api_log.xhtml`): lists the server-side HTTP calls this session made (to triplesale-service, chat, ai) with a copyable curl. Endpoints: `GET <ctx>/board/api-log`, `POST ...?action=clear`, `GET ...?view=roles`. | Shown to everyone since 29/09/2026 (config `triplesale.apilog.require.superadmin=false`; the server check is `ApiLog.accessAllowed()`). It exposes bearer tokens. Treat it as a dev tool and gate it in the Angular app. |
| Right spacers | 25px spacer before the avatar slot, 40px at the end | | |

**NOT present in the live bar** (exists in the hidden legacy `.layout-topbar`, `display:none`): search, notifications, help, tags, "change password" overlay (Old / New / Confirm, `commonBean.change_Password()`), a settings cog (shown only for user `s000`, also `display:none`), and "back to menu". The Esc handler calls `rc_checkLogin`, which is a no-op in Java. The settings drawer and Chat dialog are dead as described above.

## 4. Theme

### 4.1 Where values come from

- `web/css/project_root.css` (24 KB, "live", loaded in `<head>` for all pages): font stack, size tokens, tag colours, button/card helper classes.
- `template.xhtml` inline `<style>` blocks (~900 lines): PF overrides, badges, status colours (injected at render from `theme_1.properties` via `commonBean.getRootColor`), light/dark rules, `:root{--primary-100…}`.
- `web/resources/support/topbar.css` (17 KB): top-bar, dropdowns, switch.
- `web/resources/support/dark_mode.css` (58 KB, `?v=20260904c`): global dark theme.
- Theme CSS: `resources/pandora-layout/css/layout-modify.css` (346 KB, Pandora structural CSS), PrimeFaces theme `resources/primefaces-pandora-bluegrey/theme.css` (212 KB).
- **Figma-style tokens like `--Primary`, `--Secondary`, `--Line`, `--Text-Primary` are NEVER defined**; they are always used with fallback values (shown below), so the fallback is the real value.

### 4.2 Palette (hex values)

**Brand / chrome**

| Role | Hex | Notes |
|---|---|---|
| Action primary / nav accent ("Secondary" in Figma tokens) | **`#35236A`** | buttons (`--primary-100`), active tab text/underline (light), swal header, API-log header |
| Primary ramp | `--primary-100:#35236a; --primary-200:#483090; --primary-300:#5b3cb7`; `--accent-100/200/300:#5f4ab1` | `:root` in template |
| Accent green ("Primary" in Figma tokens) | **`#00C08B`** | menu hover/active, switch checked, check marks, active font-size button; `--tag-color-1`-like greens used elsewhere |
| Light-purple hover/selected | `#E8E2FB` | tab hover, active dropdown item, switch |
| Rail background (fixed in both themes) | `#0F172A` | white text; hover `rgba(0,192,139,.10)` |
| Content background (light) | `#EAEEFD` | `#crm_main_body_page` inline; page `.dbsun-root` uses `#fafbff` |
| Surface / card | `#FFFFFF` | `.card` radius 4px, shadow `0 2px 8px rgba(0,0,0,.08)`, padding `.5em`; "card-top" radius 10px border `1px #EEE` |
| Topbar bg | `#FFFFFF` | border `#E5E7EB`; dropdown border `#E5E7EB` |
| Border/line | `--Line:#EAEAEA` (also `#EDEDED`) | menu/dropdown `#E3E3E3`; scrollbar thumb `#D9DCE8`, hover `#B9BEC9` |
| Page-level bg variants | `--background-100 #fcfcfd`, `-200 #ededf3`, `-300 #dddde9` | |

**Text**

| Token / use | Hex |
|---|---|
| `--Text-Primary` | `#383838` (default tab/label/value text; 104 uses) |
| `--Text-Secondary` (form labels) | `#697A8D` |
| `--text-color-header` / `.title-header-*` | `#11142D` |
| `--text-color-text` / `--text-color-text-weak` | `#121C2D` / `#606B85` |
| `--Text-Disabled` (footer) | `#969696` |
| `--Text-Hover` | `#B6B9BF` (also `#383838`) |
| `--Text-On-Color` | `#FFF` |
| `--Text-Color-Primary` (KPI value) | `#202020` |
| Topbar labels | light: `#374151` (hover `#111827`); dark: `#9CA3AF` (hover `#E5E7EB`, active `#fff`) |
| `--font-color-normal / -weight / -active / -hover / -disabled` | `#4B5563 / #111827 / #120AC8 / #120AC8 / #9CA3AF` |

**Status (two sets; the CLAUDE.md set is the project rule, use it)**

| Status | `CLAUDE.md` rule (use this) | Legacy `theme_1.properties` badge (text / bg) |
|---|---|---|
| HOT | `#EB5050` | `#F04C5F` / `#F8DFDB` |
| WARM | `#FF8E4E` | `#FF7121` / `#FFEADE` |
| COLD | `#4B84FF` | `#4575BA` / `#D9E0F0` |
| INACTIVE | `#6043B6` | `#492F7C` / `#D8D2E4` |
| NEW | `#EB4FA0` | `#E88CB4` / `#FCD0E2` |
| LOST | `#8A92A6` | `#525356` / `#9C9FA6` |
| SUCCESS / SOLD | `#008B5A` | `#289936` / `#73DE80` |
| (legacy only) CANCEL, WAIT | n/a | `#851E1E` / `#FC6262`; `#555555` / `#A4A4A4` |

Other legacy tokens in `theme_1.properties`: `theme.color.0 #FFFFFF`, `.1 #492D7C`, `.2 #02C173` (`2_1 #C8FFE8`, `2_2 #00A762`), `.3 #120AC8` (`3_1 #8783A6`, `3_2 #0F0A85`), `.4 #187CFF` (`4_1 #AFD2FF`, `4_2 #1768D2`), success `#26E152`, error `#F8322F`. Used for: scrollbar hover, table paginator active (`.3`), input focus ring (`2_1`), blue buttons.

**Badges:** `.ace-badge` is 100px wide, radius 7px, padding `.3em .5rem`, uppercase, weight 700, 14px, letter-spacing .3px, centred.

**Tag palette (20) and stepper palette:** `:root --tag-color-1..20` (+ `-rgba-N` at 0.2 alpha): `#0C8E6A #14A2D0 #0D61CF #462D90 #C92A76 #CD1515 #DA6624 #DA9A24 #87B236 #626262 #2D715E #338BA7 #295794 #5A2C94 #8A124C #7B0505 #A15D37 #A28537 #5F7A15 #3C3C3C`. Tag style: bg = colour at 20% alpha, text = full colour. Colour is chosen by `hash(name) % 20` (see CLAUDE.md §6). Activity stepper palette is in CLAUDE.md §2.

**Other component colours:** swal confirm `#0D61CF` (hover `#0A52B0`, active `#08459A`, focus ring `rgba(13,97,207,.29)`). Offline bar red `#FF4F4F`, online `#4CAF50`. Auth-modal button `#4F46E5`. Other: scrollbar 8px wide (`#D9DCE8` thumb, radius 4px; dark `#374151`/`#4B5563`).

**Dark mode** (`body[data-theme="dark"]`, set by toggle; the rail stays `#0F172A`):

| Element | Value |
|---|---|
| Page / wrapper / layout-main | `#111827` |
| Content area `#crm_main_body_page` | `#1F2937` (ID rule beats the generic `#111827`) |
| Card / `.panel` | `#1E293B`, border `#374151` |
| Hover / table head | `#293548` |
| Input | `#0F172A` (disabled `#1F2937`, border `#374151`) |
| Topbar and footer | `#111827`, border `#374151` |
| Dropdown / user menu | `#1F2937`, border `#374151`, shadow `0 8px 24px rgba(0,0,0,.5)` |
| Text | `#F1F5F9` (headings/primary), `#E5E7EB`, `#D1D5DB` (labels), `#9CA3AF` (muted/topbar), `#6B7280` (footer) |
| Active tab underline / label | `#6366F1` / `#fff` |
| Active sub-item | bg `#293548`, text `#C4B5FD`, left bar `#7F63D2` |
| Dialog backdrop (offline) | `rgba(17,20,24,.72)` + `blur(2px)` |

Dark rules work by attribute selectors that rewrite inline white/grey backgrounds (`[style*="background:#fff"]` → `#1E293B`, etc.) and dark text colours. Angular should model this with real tokens rather than copy the hack.

### 4.3 Typography

| Item | Value |
|---|---|
| Body family | **`NotoSansThai`** (local variable TTF `web/fonts/Noto_Sans_Thai/NotoSansThai-VariableFont_wdth_wght.ttf`, `@font-face` in `project_root.css` *without* a weight range, so bold is probably synthesized in the source app). Token `--font-family-noto`. Forced on h1-h6, span, p, button, ul, li, div, a, tr, td, `.ui-widget*`. Standalone pages (login, dashboards, frames) load Google Fonts *Noto Sans Thai* 400-800/900 and *Inter* (login, dashboard) / *Be Vietnam Pro* (dashboard headings), so they have real weights. |
| Other fonts present | IBM Plex Sans (Pandora default, woff in `pandora-layout/fonts`, overridden), Kanit and KIT*/PSL* TTFs (unreferenced in live code), `dashboard` icon font `ace-*` (4 glyphs: `ace-edit ace-buyback ace-sales ace-bath`) |
| Document base | `html{font-size:13px}` (rem = 13px), `body{letter-spacing:.36px; overflow-x:hidden}`; PF `.ui-widget{font-size:var(--font-size-0)=14px}` |
| Size scale (tokens) | mini 10, small 12, 0:**14**, 1:16, 2:18, 3:20, 4:22, 5:24, 6:26, 7:28, 8:30, 9:32, 10:34 px. All shift by the A-/A/A+ amount (-2/0/+2). |
| Roles | labels `.title-text-label, label`: 14px / 400 / lh 20px / `#697A8D`; values `.title-text-value`: 14px / 400 / `#383838`; `.title-header-header`: 18px / 600 / lh 120% / ls .08px / `#11142D`; `.title-header-text`: 16px / 600; dialog title 18px (project_root) / padding 16px; top-tab label 16px / 400 / lh 18px; side-menu label 12px / 400; KPI title `.index_top_card_txt` 16px / 500 `#8A92A6`; KPI value 24px / 700 / ls .48px `#202020`; footer 12-13px |
| Form controls | `[type=text]` and `[role=combobox]`: padding 10px, 14px / lh 20px; `.ui-inputfield` radius .25em, 16px (template) |

### 4.4 Spacing / radius / shadow conventions

- Content padding 8px; card padding `.5em`/`1em`; card radius 4px, shadow `0 2px 8px rgba(0,0,0,.08)`. Page-level modern cards use radius 10-16px (dashboard `--radius:16px`, `--shadow-sm: 0 1px 2px rgba(15,23,42,.04), 0 1px 3px rgba(15,23,42,.06)`, `--shadow-md: 0 4px 12px rgba(79,124,255,.08), 0 2px 4px rgba(15,23,42,.04)`, `--shadow-lg: 0 12px 28px rgba(79,124,255,.12), 0 4px 8px rgba(15,23,42,.06)`).
- Dialog: padding 16px, shadow removed (`0 0 0 0`), content bg transparent, backdrop PF default.
- **Pill buttons** (`.ui-button-custom`): `padding:8px 12px; border-radius:140px; gap:4px; bg #35236A; border 1px #35236A; text #fff 14px/18px`. `.ui-button-custom-inline`: white bg, `1px #EAEAEA` border, text `#35236A`, same pill. `.btm-button-plus`: bg `#35236A`, 14px / 600. PF `.ui-button` fallback: bg and border `var(--primary-100)` = `#35236A`, `drop-shadow(3px 3px 3px #aaa)` removed later by `-webkit-filter:none`.
- Inputs: hover border `--primary-100`, focus ring `0 0 0 .2em #C8FFE8` with border `--primary-100`. Radio, select highlight uses `--primary-100`. Inputswitch checked `#00C08B`.
- Transitions: .2s ease (tab hover), .15s (dropdown), .3s for body bg/colour.
- Dropdown (top tab): min-width 200px, radius 6px, `padding:6px 0`, item `padding:12px 16px` 16px font; opens below with an 8px "bridge" and a 0.4s close delay (visibility+opacity). Light: border `1px #E5E7EB`, shadow `0 4px 12px rgba(0,0,0,.08)`, hover bg `#F3F4F6`; active item bg `#E8E2FB`, text `#35236A`, weight 600, inset left bar `3px #35236A`; submenu icon `#35236A`, 16px wide, 14px.
- Tabs: height 44px; active = bottom border 2px (light `#35236A`, base CSS `#383838`, dark `#6366F1`); hover bg `#E8E2FB`; icon: masked SVG 18x18 colour `#7C848D` (active/hover `#383838`), FA icon 15px `#383838`. Exact horizontal padding is `4px` through the `.panel-navbar div:first-child` rule stacked on `8px 12px`; verify visually in a browser.
- Global scrollbar: 8px thin, thumb `#D9DCE8`, radius 4px; PF scrollpanel vbar 5px.
- `layout-ajax-loader` spinner at bottom-right; `statusDialog` for blocking loads.

### 4.5 Layout-config panel (`config.xhtml`)

Tabs: **Theme** (palettes: ~90 predefined 4-colour combos from `GuestPreferences.palettes`), **Menu** (Mode: Static, Overlay, Horizontal, Slim, Slim Plus; Type: Grouped, Ungrouped; Color: light / dark / colored; Theme: 14-15 colour chips), **Topbar** (20 colour chips), **Components** (Input Style outlined/filled; PF component theme, 15 chips). Actions call `guestPreferences.set*` (**server session only, not persisted across logins, not per user**) and `PrimeFaces.PandoraConfigurator.*` (swaps CSS files on the client; Pandora's own `$.cookie('pandora_menu_static', 'pandora_expandeditems')` for menu state). The panel and its gear are `display:none`, so none of this is reachable. **Angular should skip it** and keep one fixed theme + the toggle. The only user-persisted theme-like prefs are `app-theme`, `ses-fontsize`, `ses-fontnumber` (localStorage + cookie `tsp_<key>`, 1-year max-age, path = context path), written by `resources/js/ui_pref.js` (`window.TS_PREF.get/set/remove`; the same helper stores per-page filters).

### 4.6 CSS files that matter (path, purpose, size)

| File | Purpose | Size | Status |
|---|---|---|---|
| `web/css/project_root.css` | global tokens, font, tag colours, helper button/label classes, scrollbar | 24 KB | live (every page) |
| `web/css/project_layout6.css` | `>=1870px` tweak | 1 KB | live; `project_layout1-5.css` only in comments |
| `web/css/project_support.css` | 1 rule | 0.2 KB | live |
| `web/style.css` | `ace-*` icon font | 1 KB | live; `web/ace-icon/style.css` = duplicate |
| `web/resources/support/topbar.css` | top tab bar, switch, dropdowns | 17 KB | live |
| `web/resources/support/dark_mode.css` | global dark theme | 58 KB | live |
| `web/resources/pandora-layout/css/layout-modify.css` | structural theme (rail, topbar, footer, card) | 346 KB | live; 13 other `layout-*.css` (~334 KB each) dead |
| `web/resources/primefaces-pandora-bluegrey/theme.css` | PF component theme | 212 KB | live; 13 sibling theme folders dead |
| `web/resources/pandora-layout/css/primeicons.css`, `primeflex.min.css` | icon font (241 icons), grid/utility CSS | 13 KB / 359 KB | live; `primeflex-v2.min.css` dead |
| `web/resources/demo/css/demo.css` | demo-kit CSS, loaded globally | 16 KB | loaded but mostly irrelevant |
| `web/css/lead.css`, `lead_detail.css`, `lead_detail_modal.css` | lead list / detail / modals | 58 / 128 / 26 KB | live (`resources/support/lead*.css` = older copies used by `lead_step`, `lead_detail_step`, backups) |
| `web/resources/support/crm_form.css`, `crm_list.css`, `sd2_list.css` | form / list / sales-doc list | 62 / 35 / 30 KB | live |
| `web/resources/support/sales_doc_form.css`, `sales_doc_qt_v3.css`, `sales_doc_auto.css`, `sales_doc_print.css` | sales-doc forms, print | 53 / 69 / 13 / 10 KB | live |
| `web/resources/support/{activity,contract,quotation,drag_scroll,responsive_legacy}.css` | per-feature | 15 / 5 / 29 / 4 / 2 KB | live |
| Dead / backup | `resources/support/{document,document_sub,schedule}.css` (only backups link them), `css/old/*`, `css/mobiscroll.jquery.min.css` (420 KB, demo `index_1` only), `css/icons_mobiscroll.*`, `fonts/KIT*, PSL*, Kanit` (only in `template_1`), `erp_backup`, `_api_wiring_backup`, `topbar.xhtml.bak-*`, `template_1.xhtml`, `*_bk_*`, `*-tae`, `hs_err_pid*.log` | | dead |

Standalone and per-page palettes also exist and are not shared with the shell: login `--tx-purple-1 #4a1e9e, --tx-purple-2 #6a2bd1, --tx-purple-3 #8a3df2, --tx-green-1 #58c389, --tx-green-2 #2fb37a, --tx-ink #1a1230, --tx-border #e7e3ef, --tx-bg-input #f6f4fa` (button `#4a1e9e`, input height 46px radius 6px, brand image `images/background/Tripple_Sales_Login_Image.jpg` on the right half); dashboard `--c1 #ff5f6d --c2 #ffb84d --c3 #00d4a8 --c4 #4f7cff --c5 #a26bff --c6 #ff7eb6 --ink #0f172a --border #e6e9f4`; AI-HUB, quotation, "gc-", "qm-", "qt-", "aih-" namespaces per page.

## 5. Third-party UI stack

**Server stack:** PrimeFaces **14.0.7** (Jakarta), Mojarra **4.0.7**, Weld, Spring 6.2.19 + Security 6.5.11; PrimeFaces config: `primefaces.FONT_AWESOME=true`, theme `pandora-bluegrey`, Pandora theme jar `pandora-theme:4.0.0`. Locale: `primefaces:locales/locale-th.js` is loaded at the end of body (Thai calendar texts); `open_down_select.js` patches PF SelectOneMenu and native selects (always open downward, with a search box, Thai month/day names from i18n).

**`p:` tag counts**, live top-level pages (70 files, backups excluded; 31 of them use no `p:` tags at all): 2418 total. Top types: outputLabel 716, inputText 490, commandButton 326, selectOneMenu 167, ajax 155, column 85, inputTextarea 45, dialog 41, **calendar 41**, **datePicker 33**, graphicImage 30, tab 27, remoteCommand 27, linkButton 27, spacer 19, commandLink 18, selectBooleanCheckbox 16, panel 13, autoComplete 13, selectOneRadio 12, growl 12, confirm 12, tag 11, tabView 10, **dataTable 10**, scrollPanel 9, fileUpload 9, inputSwitch 8, panelGrid 7, menuitem 4, link 4, sidebar 3, outputPanel 3, **gmap 3**, inputMask 2, button 2; singles: treeTable, toggleSwitch, progressBar, menuButton, dataList, contextMenu, carousel, card. Also `h:` tags: outputText 327, panelGroup 222, outputLabel 73, panelGrid 71, form 44.

- Including backups, there are 4299 `p:` tags across `pages/`. `pages/components/*` (35 files) and `pages/inc/*` are almost entirely plain HTML/JS (only 1 file with `p:` tags: selectOneMenu, remoteCommand, ajax).
- **PF-heavy pages:** `sales_document_sub_7` (635; the `_sub_1..6` copies have 15 each), `lead_step` (222), `lead_detail_step` (199), `contracts_241030` (147), `contracts_master_data` (146), `lead_detail_sub1` (143), `promotion_create` (114), `quotation` (103), `tk_petition_detail` (76).
- **Custom-HTML pages (0 `p:` tags, heavy custom CSS/JS + fetch to servlets):** `index` (dashboard), `lead`, `lead_detail` (820 KB), `activity`, `schedule`, `chatbot` (744 KB), `dashboard*`, `drilldown`, `report`, `sales_doc_rv_list`, `sales_doc_rv`, `sales_doc_*_form`, `ai_hub`, `ai_translator`, `market_plan`, `market_plan_map`, `tk_dashboard`, `supporting_documents`. For the Angular port these are free-form UI, not PrimeNG-equivalent.

**Other libraries:**

| Need | Library (version) | Where |
|---|---|---|
| Charts | **ECharts 5.6.0** (local `js/echarts-5.6.0`, loaded per page via `ui:define head`: `dashboard`, `dashboard_company/gold/sun`, `tk_dashboard`; chart types seen: bar 15, line 8, pie 5). ECharts 5.3.2 (local; legacy Java-generated HTML only). Chart.js 1.0.2 local and 4.4.2 CDN (demo `index_1` only). `p:donutChart` (backup page only). | |
| Calendar / date | PF `p:calendar` + `p:datePicker` (locale th); **no FullCalendar in live pages** (only backup `schedule_bk` and demo `calendar.xhtml`); `schedule.xhtml` is a custom calendar (`resources/support/schedule.*` is dead, schedule logic is inline). | |
| Maps | **Leaflet 1.9.4** (CDN, `market_plan_map`), Google Maps via `p:gmap` (`market_plan_land`, `market_plan_map_land`), OpenLayers v4.6.5 + geojson (69 MB folder `web/openlayers`, **no live references**) | |
| Icons | **Font Awesome 5.9.0 and 6.1.1** (both local, both loaded in template; 6.1.1 wins), FA 6.5.1 CDN on standalone pages, **PrimeIcons** (`pi pi-*`, 126 files use `pi`, 85 use FA), masked SVGs for the topnav, SVG set for the left rail, `ace-*` icon font | |
| UI helper | **SweetAlert**: `js/sweetalert/sweetalertv1.min.js` is the *v2 (promise) API* despite its name, used by 38 files (`swal({title,text,icon,buttons,dangerMode})`); `sweetalertv2/` (SweetAlert2) unused | |
| CSS frameworks | PrimeFlex (359 KB, grid + utilities such as `grid`, `col-*`, `field`, `ui-fluid`), **Bootstrap 5.3.3 (CDN) on 5 pages** (ai_translator, work_modal, dashboard_kpi_frame, schedule, index_1), **Bootstrap 3.3.7 (CDN) loaded on *every* shell page** through the chat widget include inside `template.xhtml`, which can affect global base styles | |
| Realtime / files | `socket.io` 4.7.5 CDN (chatbot, ai_translator, chat widget), PF `fileUpload` (9) + Dropzone 5.9.3 CDN (`quotation`, `sales_doc_pay`), twemoji 14.0.2 CDN (chatbot) | |
| jQuery | bundled by PrimeFaces 14 (`resources/js/jquery.min.js` is an empty stub); jquery.cookie embedded in `pandora-layout/js/layout.js` (34 KB); `prism.js` (syntax highlight, demo); sceditor, mobiscroll (demo/dead) | |
| Custom JS in `resources/js` | `ui_pref.js` (TS_PREF), `open_down_select.js` (dropdown), `no_autofill.js`, `input_guard.js` (blocks special characters; i18n message), `crm_error_popup.js`, `step_group_color.js`, `tag_pill_color.js`, `phone_format.js`, `attach_file_types.js`, `dashboard.js`, `ai_hub.js` | |

## 6. How the shell exposes session info

| Item | Where rendered | Source |
|---|---|---|
| User name | topbar `#tsUserMenuTrigger` | `sessionScope.ss_profile_name` (from `/auth/user-detail` → `profile.name`), fallback `commonBean.username` (session `ssousername`) |
| Active branch / company | topbar `(…)` span with `.ts-active-branch` | `commonBean.activeBranchName` = `ActiveBranch.name(session)`; session keys `ss_active_branch_{id,code,name}`, `ss_branch_code`, `ss_user_detail`, `ss_branch_map`, `ss_employee_id` |
| Roles | not displayed; drive visibility via `hasFeature()` | `ss_roles` (Set<String>) via `SessionRoles`; `isSuperAdmin()`; the Log overlay has a "สิทธิ์" tab that lists them |
| Language | topbar flag; `LANG` JS var in `ai_menu`; all labels | `session_change_language` (`th`/`en`) via `commonBean.currentLang` and `commonBean.msg['key']` / `showLanguage('key')` |
| Project name / version | footer | `config.properties`: `label.general.project.en` (**ACHIEVER CO., LTD.**), `label.general.version` (**1.1.0-260918-v2**); login shows "Version …" bottom-right |
| Auth/session | no UI | `ss_access_token`, `ss_refresh_token`, `ss_token_expires` (never rendered). A global `fetch` wrapper catches **401 `{"authRequired":true,...}`** and shows a modal ("เซสชันหมดอายุ" / "กรุณาเข้าสู่ระบบ", button "ตกลง") that clears `sessionStorage ts_login/ts_username` and goes to `/<ctx>/index.face`. Page navigations get a 302 to `index.face?auth=NO_TOKEN|TOKEN_EXPIRED`. |
| Login flow | `index.xhtml` posts JSON to `login_proxy` (`action: login`, branches, `select-org`). Response `ORG_REQUIRED` triggers step 2 "เลือกบริษัท" (select + button "เข้าสู่โปรแกรม"); `COMPLETE` stores `sessionStorage ts_login` (`{responseCode:"COMPLETE"}`) and redirects to `pages/index.face?pid=1&page_id=1&act=1&navbar_menu=navbar_menu_home`. | |
| Other persisted UI state | | `localStorage`: `app-theme`, `ses-fontsize`, `ses-fontnumber`, `aihub.model.*`, AI-FAB position; `sessionStorage`: `menu_navbar`, `ts_login`, `ts_username`, AI-help chat; cookie `tsp_*` mirrors TS_PREF |

URL conventions to reproduce as routes: `…/pages/<name>.face?pid=1&page_id=<n>&act=<n>[&acts=<n>][&sub_id=<n>][&action_type=list][&navbar_menu=<group>]`. `act` drives the top-tab highlight, `navbar_menu` the top-tab group and left-rail highlight, `acts`/`sub_id`/`tool`/`code` the sub-menu highlight. Language switch = `?lang=th|en`. Logout = `GET /<ctx>/logout`.

## 7. Dead / backup list (do not migrate)

- `web/WEB-INF/{template,menu,groupedMenu,ungroupedMenu,topbar,config,rightpanel,footer,breadcrumb}.xhtml` and the 35 root-level demo pages (blocks, button, calendar, charts, chronoline, crud, dashboard, display, documentation, elevation, empty, file, flexbox, floatlabel, formlayout, grid, help, icons, input, invalidstate, invoice, list, media, menu, messages, misc, overlay, panel, setup, spacing, table, text, tree, typography, …).
- `web/WEB-INF/pages/{template_1.xhtml, topbar.xhtml.bak-*, ungroupedMenu.xhtml, rightpanel.xhtml, breadcrumb.xhtml, config.xhtml (hidden)}`; the Pandora PF theme and layout variants other than `modify` / `bluegrey`; `resources/primeblocks`, `resources/demo/*` (other than loaded demo.css), `openlayers/`, `js/chartjs`, `js/mobiscroll*`, `js/text_editor`, `js/sweetalertv2`, `js/gold.js` (289 KB), `fonts/{KIT,PSL,Kanit}*`, `erp_backup/`, `_api_wiring_backup/`, `*_bk_*`, `*bak*`, `*-tae`, `*_BK`, `*-xxx` pages, `contracts_241030`, `sales_doc_list_legacy`, `jshell.history`, `hs_err_pid*.log`.

## 8. Angular rebuild notes (suggested)

1. **Shell component tree:** `AppShell` → `SideRail` (68px, fixed, `#0F172A`, z 2000), `TopTabs` (44px sticky, z 500), `<router-outlet>` inside `main` (margin-left 68px, padding 8px, bg `#EAEEFD` light / `#1F2937` dark), `FooterBar` (fixed 30px). Add `FloatingAiFab`, `ApiLogDialog` (optional, dev), `OfflineOverlay`, `AuthExpiredDialog`, global `LoadingBar`.
2. **Config-driven nav** (replace the XHTML hard-coding):
   - `railItems: { key:'crm', labelKey, icon:{normal,active,size}, route, navbarMenu, requires?:string, flag?:'aiHub', hidden?:boolean }[]` with the values in §2.1.
   - `topTabGroups: Record<navbarMenu, string[] tabIds>` from §2.2 and `tabs: {id, act, labelKey, icon, route, requires?, children?[]}` from the same table.
   - Role keys come from `/me/roles` once, kept in a signal/store; `hasFeature(key)` equals the Java call; super-admin aliases as above; mirror `PageAccessRules` as route guards.
3. **Theme tokens:** define the `:root` variables of §4.2 with the real hex values (do not reuse the undefined Figma names without values). Use `body[data-theme="light|dark"]` on `<body>`, set before first render from localStorage `app-theme` (default light). Font scale: `--fs-adj` plus the `--font-size-*` set recalculated on A-/A/A+ (±2px). Persist `app-theme`, `ses-fontsize`, `ses-fontnumber`.
4. **Fonts:** self-host Noto Sans Thai with `font-weight:100 900` (the original relies on one variable file), body 14px with `letter-spacing:.36px`; base `html{font-size:13px}` if PrimeNG rem sizing should match.
5. **Library mapping hints:** ECharts 5.x (`ngx-echarts`), Leaflet 1.9.4, PrimeNG date picker with Thai locale, PrimeIcons + FA 6, SweetAlert (promise API v2) styled as in §4.2, socket.io-client 4.x for chat pages.
6. **Do not reproduce:** legacy topbar (search/notifications/change-password), config panel, right panel, breadcrumb, `Log` button for ordinary users, the settings drawer, and the Bootstrap 3 global side effects (re-declare only what the visible look needs).
7. **Gaps to verify visually in the running app (could not run it):** the exact top-tab horizontal padding, whether Noto bold is synthesized, the default body text colour (`#000` vs `#191a1c` vs `#495057` depending on CSS load order), the blank 24px band at the top of the rail from the hidden profile block, and the 60px-rail / 80px-margin mismatch at <=992px.
