import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '../config/config.service';
import { USERS } from '../http/mock-users';
import { AI_TOOL_ROLE } from '../permissions/ai-hub-roles';
import { ROLE } from '../permissions/roles';
import { authStub, configStub } from '../testing/test-helpers';
import { TOP_TAB_GROUPS } from './nav.config';
import { NavService } from './nav.service';

@Component({ template: '' })
class Blank {}

function setup(roles: string[] | null, aiHubEnabled = true) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', component: Blank }]),
      { provide: AuthService, useValue: authStub(roles) },
      {
        provide: ConfigService,
        useValue: configStub({ features: { aiHubEnabled, pageGuardEnabled: true } }),
      },
    ],
  });
  return TestBed.inject(NavService);
}

const ids = (list: readonly { id: string }[]) => list.map((i) => i.id);
const ALL = Object.values(ROLE) as string[];

describe('NavService', () => {
  it('fully privileged user: the same visible rail and CRM tabs as the Java menu', () => {
    const nav = setup(ALL);
    // hidden items (points, petitions, inventory, marketing) stay hidden; chat is pinned to the bottom
    expect(ids(nav.railItems())).toEqual([
      'logo',
      'crm',
      'forecast',
      'sales',
      'report',
      'aihub',
      'settings',
      'chat',
    ]);
    expect(ids(nav.tabs())).toEqual([
      'dashboard',
      'lead',
      'prospect',
      'opportunity',
      'waitlist',
      'activity',
      'calendar',
      'supportDoc',
    ]);
  });

  it('support-document dropdown: 7 documents plus the DrillDown sub-menu with 11 codes', () => {
    const nav = setup(ALL);
    const dropdown = nav.tabs().find((t) => t.id === 'supportDoc')!;
    expect(dropdown.children).toHaveLength(8);
    const drill = dropdown.children!.find((c) => c.id === 'drilldown')!;
    expect(drill.children).toHaveLength(11);
    expect(drill.children![0].route).toBe('/crm/drilldown/T-CS-01');
  });

  it('limited user only sees what their keys allow; the logo stays but is disabled', () => {
    const nav = setup([
      ROLE.modulePipeline,
      ROLE.pipelineOpportunityView,
      ROLE.pipelineScheduleAppointmentView,
    ]);
    expect(ids(nav.railItems())).toEqual(['logo', 'crm', 'forecast', 'settings']);
    expect(nav.railItems().find((i) => i.id === 'logo')!.enabled).toBe(false);
    expect(ids(nav.tabs())).toEqual(['opportunity', 'calendar']);
  });

  it('DrillDown needs CRM_Dashboard_View; the dropdown needs Pipeline_Supporting_Document_View', () => {
    const withDoc = setup([ROLE.pipelineSupportingDocumentView]);
    const dropdown = withDoc.tabs().find((t) => t.id === 'supportDoc')!;
    expect(dropdown.children!.some((c) => c.id === 'drilldown')).toBe(false);

    TestBed.resetTestingModule();
    expect(ids(setup([ROLE.modulePipeline]).tabs())).not.toContain('supportDoc');
  });

  // the left rail follows the MODULE_* roles; the tabs and the pages still ask for the FEATURE_CRM_* ones
  it.each([
    [ROLE.moduleDashboard, 'logo'],
    [ROLE.modulePipeline, 'crm'],
    [ROLE.moduleSmartDoc, 'sales'],
    [ROLE.moduleReport, 'report'],
    [ROLE.moduleChat, 'chat'], // the rail item asks for MODULE_CHATBOX (the top-bar link accepts MODULE_Chat_Box too)
  ])('rail: %s opens the item %s and no other', (role, id) => {
    const nav = setup([role], false); // AI HUB is flag-driven, so it is switched off
    // settings is always visible; the CRM role also opens the Forecast item; the chat item sits at the bottom after settings
    const expected: Record<string, string[]> = {
      logo: ['logo', 'settings'],
      crm: ['logo', 'crm', 'forecast', 'settings'],
      chat: ['logo', 'settings', 'chat'],
    };
    expect(ids(nav.railItems())).toEqual(expected[id] ?? ['logo', id, 'settings']);
    expect(nav.railItems().find((i) => i.id === 'logo')!.enabled).toBe(id === 'logo');
  });

  // the top tabs of the CRM module follow the Pipeline_* roles (the dashboard one is Pipeline_Dashboard_Access); the Schedule tab takes
  // either of its two
  it.each([
    [[ROLE.pipelineDashboardAccess], 'dashboard'],
    [[ROLE.pipelineLeadView], 'lead'],
    [[ROLE.pipelineWaitListAccess], 'waitlist'],
    [[ROLE.pipelineProspectView], 'prospect'],
    [[ROLE.pipelineOpportunityView], 'opportunity'],
    [[ROLE.pipelineContactActivityView], 'activity'],
    [[ROLE.pipelineScheduleAppointmentView], 'calendar'],
    [[ROLE.pipelineScheduleTaskView], 'calendar'],
    [[ROLE.pipelineSupportingDocumentView], 'supportDoc'],
  ])('tabs: %s opens the tab %s and no other', (roles, id) => {
    expect(ids(setup(roles).tabs())).toEqual([id]);
  });

  it('tabs: the old FEATURE_CRM_* keys no longer open any tab of the CRM module', () => {
    const old = [
      ROLE.featureDashboard,
      ROLE.featureProspect,
      ROLE.featureLead,
      ROLE.featureContactActivity,
      ROLE.featureCalendar,
      ROLE.featureDocument,
    ];
    expect(setup(old).tabs()).toEqual([]);
  });

  it('the viewer account (Lead + Calendar only, as in the Java menu) gets the CRM rail item and those two tabs', () => {
    const nav = setup(USERS['viewer'].roles, false);
    expect(ids(nav.railItems())).toEqual(['logo', 'crm', 'forecast', 'settings']);
    expect(ids(nav.tabs())).toEqual(['opportunity', 'calendar']);
  });

  it('rail: the old module / feature keys no longer open it (only the logo cell is left, disabled)', () => {
    const old = [
      ROLE.moduleCrm,
      ROLE.featureDocument,
      ROLE.featureReport,
      ROLE.moduleChat,
      ROLE.featureDashboard,
    ];
    const nav = setup(old, false);
    expect(ids(nav.railItems())).toEqual(['logo', 'settings', 'chat']); // MODULE_CHATBOX (moduleChat) still opens the chat item
    expect(nav.railItems()[0].enabled).toBe(false);
  });

  it('forecast: sits right below CRM in the rail, opens with the CRM module role, and has one tab "Sales Forecast"', () => {
    const nav = setup([ROLE.modulePipeline], false);
    const rail = ids(nav.railItems());
    expect(rail.indexOf('forecast')).toBe(rail.indexOf('crm') + 1);
    expect(nav.railItems().find((i) => i.id === 'forecast')).toMatchObject({
      label: 'Forecast',
      route: '/forecast',
      group: 'forecast',
    });
    nav.group.set('forecast');
    expect(nav.tabs().map((t) => [t.id, t.label, t.route])).toEqual([
      ['forecast', 'Sales Forecast', '/forecast'],
    ]);

    TestBed.resetTestingModule();
    const without = setup([ROLE.moduleReport], false);
    expect(ids(without.railItems())).not.toContain('forecast');
    without.group.set('forecast');
    expect(without.tabs()).toEqual([]);
  });

  it('AI HUB needs the aiHubEnabled feature flag AND the AI_ACCESS_USE role (Permission Dic.xlsx)', () => {
    expect(ids(setup(ALL, false).railItems())).not.toContain('aihub');
    TestBed.resetTestingModule();
    expect(ids(setup([ROLE.aiAccessUse], true).railItems())).toContain('aihub');
    TestBed.resetTestingModule();
    expect(ids(setup([], true).railItems())).not.toContain('aihub');
  });

  it('AI HUB menu lists only the tools the user holds an AI_*_USE for, and drops a group left empty', () => {
    const nav = setup([ROLE.aiAccessUse, ROLE.aiDocSummaryUse, ROLE.aiImageUse], true);
    nav.group.set('aihub');
    const tools = nav.tabs().flatMap((g) => (g.children ?? []).map((c) => c.id));
    // the translator is a page of its own that no AI_*_USE gates, so its link (and its group) stays
    expect(tools).toEqual(['doc-summary', 'image', 'translator']);
    expect(nav.tabs().map((g) => g.id)).toEqual(['aihub-doc', 'aihub-content', 'aihub-office']);
  });

  it('AI HUB Admin is ONE tab without a dropdown (the page has its own usage / detail / audit tabs), behind the AI_ADMIN_* rights', () => {
    const admin = (roles: string[]) => {
      TestBed.resetTestingModule();
      const nav = setup(roles, true);
      nav.group.set('aihub');
      return nav.tabs().find((g) => g.id === 'aihub-admin');
    };
    for (const role of [
      ROLE.aiAdminUsageView,
      ROLE.aiAdminUsageAllBranch,
      ROLE.aiAdminUsageExport,
      ROLE.aiAdminSystemView,
    ]) {
      const tab = admin([ROLE.aiAccessUse, role]);
      expect(tab?.route, role).toBe('/ai/hub/admin');
      expect(tab?.children, role).toBeUndefined();
    }
    expect(admin([ROLE.aiAccessUse])).toBeUndefined();
  });

  it('AI HUB menu offers every tool of the hub page (the same ids, grouped like the page) plus the translator link', () => {
    const entries = TOP_TAB_GROUPS['aihub'].filter((g) => g.id !== 'aihub-admin');
    const ids = entries.flatMap((g) => (g.children ?? []).map((c) => c.id));
    expect(new Set(ids)).toEqual(new Set([...Object.keys(AI_TOOL_ROLE), 'translator']));
    expect(ids).toHaveLength(new Set(ids).size);
    expect(entries.map((g) => g.id)).toEqual([
      'aihub-doc',
      'aihub-content',
      'aihub-dev',
      'aihub-knowledge',
      'aihub-office',
      'aihub-sales',
    ]);
  });

  it('no roles (fail-closed): only the disabled logo and the always-visible settings remain', () => {
    const nav = setup(null, false); // AI HUB is flag-driven, so switch it off for this check
    expect(ids(nav.railItems())).toEqual(['logo', 'settings']);
    expect(nav.railItems()[0].enabled).toBe(false);
    expect(nav.tabs()).toEqual([]);
  });

  it('switching group swaps the tab strip (sales tabs replace the CRM tabs)', () => {
    const nav = setup(ALL);
    nav.group.set('sale');
    // Smart Doc order (ใบเสนอราคา → ใบจอง → ใบส่งสินค้า → ใบรับเงิน); the car documents are not in the menu
    expect(ids(nav.tabs())).toEqual(['qt', 'bk', 'ob', 'rv']);
    nav.group.set('report');
    expect(nav.tabs()).toEqual([]);
  });

  it('marks tabs and rail items active from the URL / route data', async () => {
    const nav = setup(ALL);
    await TestBed.inject(Router).navigateByUrl('/crm/opportunities/12345?activityGroupId=2');
    const lead = nav.tabs().find((t) => t.id === 'opportunity')!;
    const prospect = nav.tabs().find((t) => t.id === 'prospect')!;
    expect(nav.isActive(lead)).toBe(true); // a detail URL below the tab route
    expect(nav.isActive(prospect)).toBe(false);

    await TestBed.inject(Router).navigateByUrl('/crm/drilldown/T-LS-02');
    expect(nav.isActive(nav.tabs().find((t) => t.id === 'supportDoc')!)).toBe(true); // nested child match
  });

  it('settings: one tab "Configuration & Master data" (database icon), shown to everyone, lit on /settings and on every /settings/v2/* page', async () => {
    const nav = setup(null, false); // even with no roles at all
    nav.group.set('settings');
    expect(nav.tabs()).toHaveLength(1);
    const tab = nav.tabs()[0];
    expect(tab.label).toBe('Configuration & Master data');
    expect(tab.fa).toBe('pi pi-database');
    for (const url of ['/settings', '/settings/v2/initial', '/settings/v2/finance']) {
      await TestBed.inject(Router).navigateByUrl(url);
      expect(nav.isActive(tab), url).toBe(true);
    }
    await TestBed.inject(Router).navigateByUrl('/settingsx');
    expect(nav.isActive(tab)).toBe(false); // a prefix of the text is not a parent path
  });
});
