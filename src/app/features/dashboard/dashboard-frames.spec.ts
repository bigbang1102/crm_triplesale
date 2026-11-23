import { afterEach, describe, expect, it } from 'vitest';
import { dashboardFrame, installFrameBridge } from './dashboard-frames';
import { calendarFrameHtml } from './frames/calendar-frame.generated';
import { kpiFrameHtml } from './frames/kpi-frame.generated';
import { createMockDashboard, resetMockDashboard } from './dashboard.mock';

const GOLD = '/dashboard-triplesale-service/api/v1';
const values = {
  calendarDataJson: JSON.stringify({ today: '2026-10-20', events: [{ title: '</script><b>x</b>' }] }),
  ggwBranch: "S'UN",
  ctx: '',
  goldApi: GOLD,
  calendarApiUrl: `${GOLD}/calendar`,
  employeeCode: 'E101',
  myTaskListJson: '[]',
  calendarTaskCreateUrl: `${GOLD}/calendar-task`,
  myCalendarListJson: '[{"id":1,"code":"MY01","name":"งานของฉัน"}]',
  myTaskCalendarListJson: '[]',
};

describe('the two iframe documents of the Dashboard (generated from the Java frames)', () => {
  describe('calendar (dashboard_calendar_frame.xhtml)', () => {
    const html = calendarFrameHtml(values);

    it('is a complete HTML document with every Facelets value replaced', () => {
      expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
      expect(html).not.toMatch(/#\{/);
      expect(html).not.toContain('<?xml');
      expect(html).not.toContain('xmlns=');
      expect(html).toContain('<title>ปฏิทินงาน</title>');
    });

    it('puts the values where the page script reads them', () => {
      expect(html).toContain(`<script type="application/json" id="gcCalApiUrl">${GOLD}/calendar</script>`);
      expect(html).toContain('<script type="application/json" id="gcEmployeeCode">E101</script>');
      expect(html).toContain(`<script type="application/json" id="gcTaskCreateUrl">${GOLD}/calendar-task</script>`);
      expect(html).toContain('id="gcMyCalListJson">[{"id":1,"code":"MY01","name":"งานของฉัน"}]</script>');
    });

    it('cannot be broken out of by the data: "<" inside a JSON value is escaped, a quote inside the branch code is escaped', () => {
      const i = html.indexOf('id="gcCalDataJson">') + 'id="gcCalDataJson">'.length;
      const block = html.slice(i, html.indexOf('</script>', i));
      expect(block).not.toContain('<');
      expect(block).toContain('\\u003c/script>');
      expect(html).toContain("var DB_GGWBRANCH = 'S\\u0027UN';");
    });

    it('asks the master data of the employees from /dashboard (the BFF path of the app, not of the Java context)', () => {
      expect(html).toContain("return '/dashboard/masterdata-all?ggwBranch='");
    });

    it('follows the theme of the Angular shell: <html data-theme> of the parent, localStorage "ts.theme"', () => {
      expect(html).toContain('return window.parent.document.documentElement;');
      expect(html).toContain("localStorage.getItem('ts.theme')");
      expect(html).not.toContain('app-theme');
    });

    it('sends its API calls through the page: the fetch bridge is the first script of the head', () => {
      const head = html.slice(0, html.indexOf('</head>'));
      expect(head.indexOf('window.parent.__tsDashFetch') < 0 && head.indexOf('P.__tsDashFetch')).toBeGreaterThan(0);
      expect(head).toContain(`var G = '${GOLD}';`);
      expect(head.indexOf('<script>')).toBeLessThan(head.indexOf('<link'));
    });

    it('loads the guard script from the app assets', () => {
      expect(html).toContain('<script src="/assets/js/frames/input_guard.js?v=20260826a"></script>');
    });
  });

  describe('KPI (dashboard_kpi_frame.xhtml)', () => {
    const data = JSON.stringify({ columns: [], records: [{ detail: '</script>' }], total: 1 });
    const html = kpiFrameHtml({ kpiListDataJson: data });

    it('embeds the list data as the JS value the script expects', () => {
      expect(html).toContain('var KPI_DATA = {"columns":[],"records":[{"detail":"\\u003c/script>"}],"total":1};');
      expect(html).not.toMatch(/#\{/);
      expect(html).toContain('<title>รายการงาน KPI</title>');
    });

    it('keeps the two placeholders the dashboard fills in when it puts the document into the iframe', () => {
      expect(html).toContain("var KPI_GOLD_API = '__GOLDAPI__';");
      expect(html).toContain("var KPI_GGW_BRANCH = '__GGW_BRANCH__';");
      expect(html).toContain("var G = '__GOLDAPI__';"); // the bridge
    });

    it('loads both guard scripts from the app assets and follows the shell theme', () => {
      expect(html).toContain('<script src="/assets/js/frames/no_autofill.js?v=20260825b"></script>');
      expect(html).toContain('<script src="/assets/js/frames/input_guard.js?v=20260826a"></script>');
      expect(html).toContain('return window.parent.document.documentElement;');
      expect(html).toContain("localStorage.getItem('ts.theme')");
    });
  });

  describe('dashboardFrame (what the dashboard asks for)', () => {
    afterEach(() => resetMockDashboard());
    const o = { ggwBranch: 'SUN', goldApi: GOLD, employeeCode: 'E101', username: 'demo', ctx: '' };

    it('calendar: the document holds the events and URLs of the backend', async () => {
      const html = await dashboardFrame('calendar', createMockDashboard({ delayMs: 0 }), o);
      expect(html).toContain('"today":"2026-10-20"');
      expect(html).toContain(`id="gcCalApiUrl">${GOLD}/calendar<`);
      expect(html).toContain("var DB_GGWBRANCH = 'SUN';");
    });

    it('kpi: the document holds the records of the backend', async () => {
      const html = await dashboardFrame('kpi', createMockDashboard({ delayMs: 0 }), o);
      expect(html).toContain('var KPI_DATA = {"columns":[{"field":"txno"');
      expect(html).toContain('KPI-2026-00001');
    });
  });

  describe('installFrameBridge', () => {
    const host = window as unknown as { __tsDashFetch?: unknown };

    it('gives the frames a fetch while the dashboard is on screen, and takes it away', () => {
      const fn = async () => new Response('{}');
      const off = installFrameBridge(fn);
      expect(host.__tsDashFetch).toBe(fn);
      off();
      expect(host.__tsDashFetch).toBeUndefined();
    });

    it('does not remove the bridge of a newer dashboard (a reload creates the new one before the old one is torn down)', () => {
      const a = async () => new Response('a');
      const b = async () => new Response('b');
      const offA = installFrameBridge(a);
      const offB = installFrameBridge(b);
      offA();
      expect(host.__tsDashFetch).toBe(b);
      offB();
    });
  });
});
