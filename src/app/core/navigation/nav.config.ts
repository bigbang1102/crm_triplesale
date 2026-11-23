import {
  AI_ADMIN_AUDIT_ROLES,
  AI_ADMIN_USAGE_ROLES,
  AI_TOOL_ROLE,
} from '../permissions/ai-hub-roles';
import { FeatureFlag, ROLE } from '../permissions/roles';

/**
 * Navigation as DATA (the Java app hard-coded this in groupedMenu.xhtml and topbar.xhtml).
 * Source of every value: docs/analysis/01-shell-theme.md §2.
 *
 *  - Left rail  = RAIL_ITEMS  (module switcher, 68 px dark bar)
 *  - Top bar    = TOP_TAB_GROUPS[group]  (page tabs; the group is chosen by the active route's
 *                 `data.navGroup`, the old `navbar_menu` URL parameter)
 *
 * Visibility = not hidden && role requirement && feature flag. Items with `hidden: true` are
 * kept here on purpose (they exist in the Java menu but are `rendered="false"` until the backend
 * provides the keys) so re-enabling one is a one-line change.
 */

export type NavGroup =
  | 'home' // navbar_menu_home   CRM
  | 'sun' // navbar_menu_sun    logo → BI dashboard
  | 'sale' // navbar_menu_sale   งานขาย
  | 'report' // navbar_menu_report รายงาน
  | 'chat' // navbar_menu_chat   แชท
  | 'ai' // navbar_menu_ai     AI แปลเอกสาร
  | 'aihub' // navbar_menu_aihub  AI HUB
  | 'point' // navbar_menu_point  แต้มสะสม (hidden)
  | 'ticket' // navbar_menu_ticket คำร้อง (hidden)
  | 'product' // navbar_menu_product (hidden)
  | 'marketing' // navbar_menu_marketing (hidden)
  | 'settings' // ตั้งค่า (ใหม่ ไม่มีใน Java)
  | 'forecast'; // Forecast (ใหม่ ไม่มีใน Java)

export interface RailItem {
  id: string;
  /** literal label (the Java menu hard-codes "CRM" and "AI HUB") */
  label?: string;
  /** i18n key from messages_*.properties */
  labelKey?: string;
  route: string;
  group: NavGroup;
  /** asset files in assets/icons/menu */
  icon: string;
  iconActive?: string;
  requires?: string;
  flag?: FeatureFlag;
  hidden?: boolean;
  placement: 'top' | 'bottom';
  /** the logo cell: always rendered, clickable only when `requires` is satisfied */
  logo?: boolean;
}

export const RAIL_ITEMS: readonly RailItem[] = [
  {
    id: 'logo',
    route: '/dashboard',
    group: 'sun',
    icon: 'logo',
    requires: ROLE.moduleDashboard,
    placement: 'top',
    logo: true,
  },
  {
    id: 'points',
    labelKey: 'label.tk.title',
    route: '/points',
    group: 'point',
    icon: 'menu_ticket_star',
    iconActive: 'active_ticket_star',
    placement: 'top',
    hidden: true,
  },
  {
    id: 'petitions',
    labelKey: 'label.menu.petition',
    route: '/under-construction',
    group: 'ticket',
    icon: 'menu_bookmark',
    iconActive: 'active_bookmark',
    placement: 'top',
    hidden: true,
  },
  {
    id: 'crm',
    label: 'CRM',
    route: '/crm/home',
    group: 'home',
    icon: 'menu_work',
    iconActive: 'active_work',
    requires: ROLE.modulePipeline,
    placement: 'top',
  },
  // Forecast: เมนูใหม่ (ไม่มีใน Java) อยู่ถัดจาก CRM ; ใช้สิทธิ์โมดูลเดียวกับ CRM (ต้นแบบไม่ได้กำหนด key ของเมนู)
  {
    id: 'forecast',
    label: 'Forecast',
    route: '/forecast',
    group: 'forecast',
    icon: 'menu_forecast',
    iconActive: 'active_forecast',
    requires: ROLE.modulePipeline,
    placement: 'top',
  },
  {
    id: 'sales',
    labelKey: 'app.nav.smartDoc',
    route: '/sales/smart-doc/qt',
    group: 'sale',
    icon: 'menu_chart',
    iconActive: 'active_chart',
    requires: ROLE.moduleSmartDoc,
    placement: 'top',
  },
  {
    id: 'inventory',
    labelKey: 'label.template.inventory',
    route: '/under-construction',
    group: 'product',
    icon: 'menu_group',
    iconActive: 'active_group',
    placement: 'top',
    hidden: true,
  },
  {
    id: 'marketing',
    labelKey: 'label.menu.marketing',
    route: '/under-construction',
    group: 'marketing',
    icon: 'menu_send',
    iconActive: 'active_send',
    placement: 'top',
    hidden: true,
  },
  {
    id: 'report',
    labelKey: 'label.template.report',
    route: '/report',
    group: 'report',
    icon: 'menu_document',
    iconActive: 'active_document',
    requires: ROLE.moduleReport,
    placement: 'top',
  },
  {
    id: 'aihub',
    label: 'AI HUB',
    route: '/ai/hub',
    group: 'aihub',
    icon: 'menu_ai_hub',
    iconActive: 'active_ai_hub',
    flag: 'aiHubEnabled',
    requires: ROLE.aiAccessUse,
    placement: 'top',
  },
  // ตั้งค่า: แสดงตลอด ไม่เช็กสิทธิ์/flag (ยังไม่กำหนด key) — อยู่ท้ายสุดของแถบบน
  {
    id: 'settings',
    labelKey: 'app.nav.settings',
    route: '/settings/v2/initial',
    group: 'settings',
    icon: 'menu_settings',
    iconActive: 'active_settings',
    placement: 'top',
  },
  {
    id: 'chat',
    labelKey: 'chat.title',
    route: '/chat',
    group: 'chat',
    icon: 'menu_chat',
    requires: ROLE.moduleChat,
    placement: 'bottom',
  },
];

/* ------------------------------------------------------------------------------------------ */

export interface MenuLink {
  id: string;
  label?: string;
  labelKey?: string;
  /** omitted for a pure sub-menu header */
  route?: string;
  /** other URL prefixes that also light this link up (a tab whose pages live under more than one route) */
  alsoActive?: readonly string[];
  requires?: string;
  hidden?: boolean;
  /** nested items (dropdown → sub-menu) */
  children?: readonly MenuLink[];
  /** icon in front of a dropdown item: PrimeIcons / Font Awesome classes (`pi pi-file`) */
  iconClass?: string;
  /** query string of the link (the Admin tab of AI HUB: `/ai/hub/admin?tab=quota`) */
  query?: Readonly<Record<string, string>>;
  /** AI HUB dropdown items: gradient of the rounded icon badge [from, to] */
  badge?: readonly [string, string];
}

export interface TabDef extends MenuLink {
  /** SVG file in assets/icons/topnav (rendered as a CSS mask so it follows the text colour) */
  maskIcon?: string;
  /** Font Awesome classes (`far fa-comments`), same classes the Java topbar.xhtml uses */
  fa?: string;
  /** colour of the icon (AI HUB dropdown groups) */
  color?: string;
}

const SUPPORT_DOC_TYPES = [
  ['letter-of-intent', 'label.topbar.support_doc.intent', 'pi pi-file'],
  ['legal-credit-request', 'label.topbar.support_doc.legal_credit', 'pi pi-file-edit'],
  ['service-contract', 'label.topbar.support_doc.service_contract', 'pi pi-verified'],
  ['loan-agreement', 'label.topbar.support_doc.loan_contract', 'pi pi-money-bill'],
  ['preliminary-credit-approval', 'label.topbar.support_doc.credit_approval', 'pi pi-check-circle'],
  ['property-project-contract', 'label.topbar.support_doc.property_contract', 'pi pi-building'],
  ['credit-application', 'label.topbar.support_doc.credit_request', 'pi pi-credit-card'],
] as const;

const DRILLDOWN_CODES = [
  'T-CS-01',
  'T-PLS-01',
  'T-PLS-02',
  'T-PLS-03',
  'T-LS-01',
  'T-LS-02',
  'T-LS-03',
  'T-LS-04',
  'T-LS-05',
  'T-LE-01',
  'T-FI-01',
] as const;

/** AI HUB tool: label + the Font Awesome icon and badge gradient of topbar.xhtml (`.aihub-nav .submenu-icon`) */
const aiTool = (id: string, iconClass: string, badge: readonly [string, string]): MenuLink => ({
  id,
  labelKey: `app.nav.aiTool.${id}`,
  route: `/ai/hub/${id}`,
  requires: AI_TOOL_ROLE[id], // AI_*_USE of Permission Dic.xlsx
  iconClass: `fa-solid ${iconClass}`,
  badge,
});

/** AI HUB Admin: ONE tab (no dropdown) — the page (`features/ai/ai-admin`, token numbers only) has its own tab strip (usage · detail · audit) and offers only the ones the user's `AI_ADMIN_*` allow (super_admin passes all) */
const AI_ADMIN_TAB_ROLES = `${AI_ADMIN_USAGE_ROLES},${AI_ADMIN_AUDIT_ROLES}`;

export const TOP_TAB_GROUPS: Readonly<Record<NavGroup, readonly TabDef[]>> = {
  // CRM: แดชบอร์ด · Lead · ลูกค้าเป้าหมาย · โอกาสขาย · Waitlist · การติดต่อ · ปฏิทินงาน · ข้อมูลประกอบ ▾
  home: [
    {
      id: 'dashboard',
      labelKey: 'label.template.dashboard',
      route: '/crm/home',
      maskIcon: 'fi_grid',
      requires: ROLE.pipelineDashboardAccess,
    },
    // Lead (ใหม่ จากดีไซน์ Figma — รายชื่อผู้สนใจก่อนเป็นลูกค้าเป้าหมาย) อยู่ถัดจากแดชบอร์ด
    {
      id: 'lead',
      labelKey: 'app.nav.lead',
      route: '/crm/lead',
      maskIcon: 'fi_user-plus',
      requires: ROLE.pipelineLeadView,
    },
    {
      id: 'prospect',
      labelKey: 'label.topbar.prospect',
      route: '/crm/prospects',
      maskIcon: 'fi_users',
      requires: ROLE.pipelineProspectView,
    },
    {
      id: 'opportunity',
      labelKey: 'label.topbar.lead',
      route: '/crm/opportunities',
      maskIcon: 'fi_Briefcase',
      requires: ROLE.pipelineOpportunityView,
    },
    // Waitlist: คิวของ Lead ที่ยังไม่มีเจ้าของ (ใหม่ จากดีไซน์ Figma) ; เห็นเมื่อมี Pipeline_Wait_list_Access (หน้าเองตรวจ Pipeline_Lead_View ด้วย)
    {
      id: 'waitlist',
      labelKey: 'app.nav.waitlist',
      route: '/crm/waitlist',
      maskIcon: 'fi_list',
      requires: ROLE.pipelineWaitListAccess,
    },
    {
      id: 'activity',
      labelKey: 'label.topbar.activity',
      route: '/crm/activities',
      maskIcon: 'fi_message-circle',
      requires: ROLE.pipelineContactActivityView,
    },
    {
      id: 'calendar',
      labelKey: 'label.topbar.schedule',
      route: '/crm/schedule',
      maskIcon: 'fi_calendar',
      requires: `${ROLE.pipelineScheduleAppointmentView},${ROLE.pipelineScheduleTaskView}`,
    },
    {
      id: 'supportDoc',
      labelKey: 'label.topbar.support_doc',
      fa: 'far fa-folder-open',
      requires: ROLE.pipelineSupportingDocumentView,
      children: [
        // items inherit the dropdown's Pipeline_Supporting_Document_View; the per-type CRM_Document_<Type>_{View|Create|Edit}
        // keys (SUPPORTING_DOC_ROLE_PREFIX) gate the buttons inside the list/form pages.
        ...SUPPORT_DOC_TYPES.map(([type, labelKey, iconClass]) => ({
          id: type,
          labelKey,
          iconClass,
          route: `/crm/supporting-docs/${type}`,
        })),
        {
          id: 'drilldown',
          labelKey: 'label.topbar.drilldown',
          iconClass: 'pi pi-chart-bar',
          requires: ROLE.dashboardView,
          children: DRILLDOWN_CODES.map((code) => ({
            id: code,
            label: code,
            route: `/crm/drilldown/${code}`,
          })),
        },
      ],
    },
    {
      id: 'marketPlan',
      labelKey: 'label.topbar.market_plan',
      route: '/market-plan',
      maskIcon: 'fi_book-open',
      hidden: true,
    },
  ],

  // logo → BI dashboard has a single tab
  sun: [
    {
      id: 'dashboard',
      labelKey: 'label.template.dashboard',
      route: '/dashboard',
      maskIcon: 'fi_grid',
      requires: ROLE.featureDashboard,
    },
  ],

  // งานขาย — the Java pages inject this strip with JS (components/sales_doc_tabs.xhtml)
  // ใบเสนอราคา / ใบจอง / ใบส่งสินค้า / ใบรับเงิน = Smart Doc of the BA (features/smart-docs), in the order of its document menu;
  // the Java ports (/sales/docs/:type, /sales/receipts) still open by URL
  sale: [
    {
      id: 'qt',
      labelKey: 'label.topbar.sales_doc.quotation',
      route: '/sales/smart-doc/qt',
      requires: ROLE.featureDocument,
    },
    {
      id: 'bk',
      labelKey: 'label.topbar.sales_doc.booking',
      route: '/sales/smart-doc/so',
      requires: ROLE.featureDocument,
    },
    {
      id: 'ob',
      labelKey: 'label.sales_doc_tab.delivery',
      route: '/sales/smart-doc/do',
      requires: ROLE.featureDocument,
    },
    {
      id: 'rv',
      labelKey: 'label.rv.title',
      route: '/sales/smart-doc/rv',
      requires: ROLE.featureDocument,
    },
    // ใบเสนอราคารถยนต์ / ใบจองรถยนต์ (/sales/docs/aq · ad) are out of the menu — the pages still open by URL
  ],

  report: [],

  // either name of the chat module (the old MODULE_CHATBOX of the Java app, the MODULE_Chat_Box the backend gave it): an OR-list
  chat: [
    {
      id: 'chat',
      labelKey: 'label.topbar.chat',
      route: '/chat',
      fa: 'far fa-comments',
      requires: `${ROLE.moduleChat},${ROLE.moduleChatBox}`,
    },
  ],

  ai: [
    {
      id: 'translator',
      labelKey: 'label.topbar.ai.translator',
      route: '/ai/translator',
      fa: 'fa-solid fa-language',
    },
  ],

  aihub: [
    {
      id: 'aihub-admin',
      labelKey: 'app.nav.aiGroup.admin',
      fa: 'fa-solid fa-user-shield',
      color: '#6043b6',
      route: '/ai/hub/admin',
      requires: AI_ADMIN_TAB_ROLES,
    },
    {
      id: 'aihub-doc',
      labelKey: 'app.nav.aiGroup.doc',
      fa: 'fa-solid fa-file-lines',
      color: '#2563eb',
      children: [
        aiTool('doc-analyze', 'fa-magnifying-glass-chart', ['#2563eb', '#38bdf8']),
        aiTool('doc-summary', 'fa-list-check', ['#0891b2', '#22d3ee']),
        aiTool('data-analyze', 'fa-chart-column', ['#16a34a', '#4ade80']),
        aiTool('meeting', 'fa-microphone-lines', ['#c026d3', '#e879f9']),
        aiTool('doc-compare', 'fa-code-compare', ['#4f46e5', '#818cf8']),
        aiTool('doc-extract', 'fa-table-list', ['#0d9488', '#2dd4bf']),
        aiTool('doc-check', 'fa-clipboard-check', ['#059669', '#34d399']),
      ],
    },
    {
      id: 'aihub-content',
      labelKey: 'app.nav.aiGroup.content',
      fa: 'fa-solid fa-palette',
      color: '#db2777',
      children: [
        aiTool('slides', 'fa-display', ['#ea580c', '#fb923c']),
        aiTool('image', 'fa-image', ['#db2777', '#f472b6']),
        aiTool('video', 'fa-clapperboard', ['#e11d48', '#fb7185']),
        aiTool('music', 'fa-music', ['#9333ea', '#e879f9']),
        aiTool('social', 'fa-hashtag', ['#2563eb', '#60a5fa']),
        aiTool('article', 'fa-newspaper', ['#0f766e', '#2dd4bf']),
        aiTool('voiceover', 'fa-volume-high', ['#be185d', '#f472b6']),
        aiTool('gif', 'fa-film', ['#d97706', '#fbbf24']),
      ],
    },
    {
      id: 'aihub-dev',
      labelKey: 'app.nav.aiGroup.dev',
      fa: 'fa-solid fa-code',
      color: '#059669',
      children: [
        aiTool('code', 'fa-code', ['#059669', '#34d399']),
        aiTool('claude-code', 'fa-terminal', ['#334155', '#64748b']),
        aiTool('code-review', 'fa-glasses', ['#0d9488', '#2dd4bf']),
        aiTool('sql-assist', 'fa-database', ['#2563eb', '#60a5fa']),
        aiTool('log-doctor', 'fa-stethoscope', ['#dc2626', '#f87171']),
        aiTool('code-docs', 'fa-file-code', ['#7c3aed', '#a78bfa']),
      ],
    },
    {
      id: 'aihub-knowledge',
      labelKey: 'app.nav.aiGroup.knowledge',
      fa: 'fa-solid fa-chess-knight',
      color: '#4f46e5',
      children: [
        aiTool('strategy', 'fa-chart-line', ['#4f46e5', '#818cf8']),
        aiTool('howto', 'fa-book-open', ['#d97706', '#fbbf24']),
        aiTool('diagram', 'fa-diagram-project', ['#0d9488', '#2dd4bf']),
        aiTool('library-ask', 'fa-book-bookmark', ['#1e3a8a', '#6366f1']),
        aiTool('quiz', 'fa-graduation-cap', ['#7c3aed', '#a78bfa']),
        aiTool('faq', 'fa-circle-question', ['#0891b2', '#22d3ee']),
        aiTool('project-plan', 'fa-timeline', ['#ea580c', '#fb923c']),
        aiTool('decision', 'fa-scale-balanced', ['#be123c', '#fb7185']),
      ],
    },
    {
      id: 'aihub-office',
      labelKey: 'app.nav.aiGroup.office',
      fa: 'fa-solid fa-briefcase',
      color: '#115e59',
      children: [
        aiTool('formal-writer', 'fa-envelope-open-text', ['#115e59', '#2dd4bf']),
        aiTool('reply-draft', 'fa-reply', ['#2563eb', '#60a5fa']),
        aiTool('hr-docs', 'fa-id-badge', ['#9333ea', '#c084fc']),
        // the translator is its own page (not a tool of the hub service)
        {
          id: 'translator',
          labelKey: 'app.nav.aiTool.translator',
          route: '/ai/translator',
          iconClass: 'fa-solid fa-language',
          badge: ['#0d9488', '#5eead4'],
        },
      ],
    },
    {
      id: 'aihub-sales',
      labelKey: 'app.nav.aiGroup.sales',
      fa: 'fa-solid fa-handshake',
      color: '#a15d37',
      children: [aiTool('customer-brief', 'fa-address-card', ['#a15d37', '#fb923c'])],
    },
  ],

  // hidden groups (menu items rendered=false in Java)
  point: [
    { id: 'home', labelKey: 'label.topbar.home', route: '/points', fa: 'fas fa-house' },
    {
      id: 'promotion',
      labelKey: 'label.topbar.promotion',
      route: '/promotions',
      fa: 'fas fa-tags',
    },
  ],
  ticket: [
    { id: 'home', labelKey: 'label.topbar.home', route: '/points', fa: 'fas fa-house' },
    {
      id: 'customers',
      labelKey: 'label.topbar.customer_list',
      route: '/petitions',
      fa: 'far fa-id-card',
    },
    {
      id: 'petition',
      labelKey: 'label.topbar.petition_list',
      route: '/petitions',
      fa: 'far fa-file-lines',
    },
  ],
  product: [],
  marketing: [],
  // Forecast: แท็บเดียว (แท็บย่อยของหน้าอยู่ในหน้าเอง เหมือนต้นแบบ)
  forecast: [
    {
      id: 'forecast',
      label: 'Sales Forecast',
      route: '/forecast',
      fa: 'pi pi-chart-line',
      color: 'var(--ts-tab-label-active)',
      requires: ROLE.modulePipeline,
    },
  ],
  // Configuration & Master data (mockup: ไอคอนฐานข้อมูล + ชื่อหน้า + เส้นใต้ ที่มุมซ้ายของแถบบน) — ใช้ทั้ง /settings (v1) และ /settings/v2/*
  settings: [
    {
      id: 'config',
      label: 'Configuration & Master data',
      route: '/settings/v2/initial',
      alsoActive: ['/settings'],
      fa: 'pi pi-database',
      color: 'var(--ts-tab-label-active)',
    },
  ],
};
