import { inject } from '@angular/core';
import { Data, Route, Routes } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { PAGES, PageDef } from '@core/navigation/page-registry';
import { PermissionService } from '@core/permissions/permission.service';
import { authGuard, pageGuard } from '@core/permissions/guards';
import { Shell } from '@layout/shell';

/**
 * Route table — generated from `core/navigation/page-registry.json`.
 *
 * Every page in the registry gets a lazy route. Pages that are not ported yet render the
 * MigrationPlaceholder; to ship a page:
 *   1. build the component under src/app/features/<feature>/
 *   2. add its loader to IMPLEMENTED below
 *   3. set `"implemented": true` in page-registry.json   (a unit test checks both agree)
 */
const placeholder = () => import('@features/system/migration-placeholder').then((m) => m.MigrationPlaceholder);
const systemPage = () => import('@features/system/system-page').then((m) => m.SystemPage);

export interface Implementation {
  load: Route['loadComponent'];
  data?: Data;
}

// AI HUB: when the feature flag is off the page itself shows the "AI HUB ปิดใช้งานอยู่" notice (like the Java page),
// so the guard must not turn the route into a 404 — `flag: undefined` overrides the registry value for the guard.
const aiHub: Implementation = { load: () => import('@features/ai/ai-hub/ai-hub').then((m) => m.AiHub), data: { flag: undefined } };

export const IMPLEMENTED: Readonly<Record<string, Implementation>> = {
  // <title> of web/index.xhtml
  // Keycloak with a group code (keycloak.groupApi set): the page asks for the group code instead of user / password
  login: {
    load: () => {
      const auth = inject(AuthService);
      const group = auth.keycloakAsksGroup() && new URLSearchParams(location.search).get('local') !== '1';
      return group
        ? import('@features/auth/group-login/group-login').then((m) => m.GroupLogin)
        : import('@features/auth/login/login').then((m) => m.Login);
    },
    data: { windowTitle: 'Triple Sales - ลงชื่อเข้าใช้' } },
  'ai-hub-home': aiHub,
  'ai-hub': aiHub,
  chat: { load: () => import('@features/chat/chat').then((m) => m.Chat) },
  'ai-translator': { load: () => import('@features/ai/translator/translator').then((m) => m.Translator) },
  // the new dashboard design (generated from the designer's snapshot);
  // the Java port features/dashboard stays in the code, unrouted
  dashboard: {
    load: () => import('@features/sales-dashboard/sales-dashboard').then((m) => m.SalesDashboard),
  },
  // งานขาย › Smart Doc (ใบเสนอราคา · ใบจอง · ใบส่งสินค้า · ใบรับเงิน) of the BA — generated from its prototype
  'smart-doc': { load: () => import('@features/smart-docs/smart-doc').then((m) => m.SmartDoc) },
  report: { load: () => import('@features/report/report').then((m) => m.Report) },
  'supporting-docs': { load: () => import('@features/supporting-docs/supporting-docs').then((m) => m.SupportingDocs) },
  'supporting-doc-list': { load: () => import('@features/supporting-docs/list/supporting-doc-list').then((m) => m.SupportingDocList) },
  'supporting-doc-form': { load: () => import('@features/supporting-docs/form/supporting-doc-form').then((m) => m.SupportingDocForm) },
  opportunities: { load: () => import('@features/opportunities/opportunities').then((m) => m.Opportunities) },
  'opportunity-detail': { load: () => import('@features/opportunity-detail/opportunity-detail').then((m) => m.OpportunityDetail) },
  activities: { load: () => import('@features/activities/activities').then((m) => m.Activities) },
  leads: { load: () => import('@features/leads/leads').then((m) => m.Leads) },
  waitlist: { load: () => import('@features/leads/lead-waitlist').then((m) => m.LeadWaitlist) },
  prospects: { load: () => import('@features/prospects/prospects').then((m) => m.Prospects) },
  'prospect-detail': { load: () => import('@features/prospects/detail/prospect-detail').then((m) => m.ProspectDetail) },
  'prospect-form': { load: () => import('@features/prospects/form/prospect-form').then((m) => m.ProspectForm) },
  drilldown: { load: () => import('@features/drilldown/drilldown').then((m) => m.Drilldown) },
  home: { load: () => import('@features/home/home').then((m) => m.Home) },
  schedule: { load: () => import('@features/schedule/schedule').then((m) => m.Schedule) },
  receipts: { load: () => import('@features/receipts/receipts').then((m) => m.Receipts) },
  'receipt-form': { load: () => import('@features/receipts/receipt-form').then((m) => m.ReceiptForm) },
  'sales-doc-list': { load: () => import('@features/sales-docs/list/sales-doc-list').then((m) => m.SalesDocList) },
  'sales-doc-form': { load: () => import('@features/sales-docs/form/sales-doc-form').then((m) => m.SalesDocForm) },
  forecast: { load: () => import('@features/forecast/forecast').then((m) => m.Forecast) },
  settings: { load: () => import('@features/settings/settings').then((m) => m.Settings) },
  'settings-v2-p0': { load: () => import('@features/settings/v2/initial/initial').then((m) => m.SettingsInitial) },
  'settings-v2-p1': { load: () => import('@features/settings/v2/organization/organization').then((m) => m.SettingsOrganization) },
  'settings-v2-p2': { load: () => import('@features/settings/v2/sales-flow/sales-flow').then((m) => m.SettingsSalesFlow) },
  'settings-v2-p3': { load: () => import('@features/settings/v2/customer/customer').then((m) => m.SettingsCustomer) },
  'settings-v2-p4': { load: () => import('@features/settings/v2/finance/finance').then((m) => m.SettingsFinance) },
  'settings-v2-p5': { load: () => import('@features/settings/v2/extra/extra').then((m) => m.SettingsExtra) },
  forbidden: { load: systemPage, data: { kind: 'forbidden' } },
  'under-construction': { load: systemPage, data: { kind: 'under-construction' } },
};

function toRoute(page: PageDef): Route {
  const impl = IMPLEMENTED[page.id];
  return {
    path: page.route,
    loadComponent: impl?.load ?? placeholder,
    canActivate: page.id === 'login' ? [] : [pageGuard],
    // `data` is read by the guards, NavService (navGroup → which top tabs / rail item is active)
    // and the title strategy
    data: { page, navGroup: page.navGroup, requires: page.requires, flag: page.flag, ...impl?.data },
  };
}

const login = PAGES.find((p) => p.id === 'login')!;

export const routes: Routes = [
  toRoute(login),
  // Keycloak sends the browser back here (outside the Shell, like /login)
  { path: 'auth/callback', loadComponent: () => import('@features/auth/callback/auth-callback').then((m) => m.AuthCallback) },
  // the chat page in embed mode: what the quick chat box of every page shows in its iframe (outside the Shell: no menu / top bar)
  {
    path: 'chat-embed',
    canActivate: [authGuard, pageGuard],
    loadComponent: () => import('@features/chat/chat-embed').then((m) => m.ChatEmbed),
    data: { requires: PAGES.find((p) => p.id === 'chat')?.requires },
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: firstAllowedRoute },
      // old URLs of the opportunity pages (they were /crm/leads) — bookmarks keep working
      { path: 'crm/leads', pathMatch: 'full', redirectTo: 'crm/opportunities' },
      { path: 'crm/leads/:opportunityId', pathMatch: 'full', redirectTo: 'crm/opportunities/:opportunityId' },
      ...PAGES.filter((p) => p.id !== 'login').map(toRoute),
      { path: '**', loadComponent: systemPage, data: { kind: 'not-found' } },
    ],
  },
];

const HOME_ROUTE = 'crm/home';

/** where "/" goes: the home page, or — for an account that may not see it — the first page of the menu it may open (never the /forbidden page) */
function firstAllowedRoute(): string {
  const perm = inject(PermissionService);
  const open = (p: PageDef): boolean => perm.has(p.requires) && (!p.flag || perm.flag(p.flag));
  const home = PAGES.find((p) => p.route === HOME_ROUTE);
  if (home && open(home)) return HOME_ROUTE;
  return PAGES.find((p) => p.navGroup !== null && p.implemented && !p.route.includes(':') && open(p))?.route ?? HOME_ROUTE;
}
