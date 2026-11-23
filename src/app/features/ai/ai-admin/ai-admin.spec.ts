import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import { PermissionService } from '@core/permissions/permission.service';
import { configStub } from '@core/testing/test-helpers';
import { DialogService } from '@shared/ui/notify/dialog.service';
import { ToastService } from '@shared/ui/notify/toast.service';
import { AiHub } from '../ai-hub/ai-hub';
import { AI_ADMIN_FETCH } from './ai-admin.api';
import { AI_ADMIN_IDENTITY } from './ai-admin.identity';
import { AiAdmin } from './ai-admin';

const ALL = [
  'AI_ACCESS_USE',
  'AI_ADMIN_USAGE_VIEW',
  'AI_ADMIN_USAGE_ALL_BRANCH',
  'AI_ADMIN_USAGE_EXPORT',
  'AI_ADMIN_QUOTA_MANAGE',
  'AI_ADMIN_SYSTEM_VIEW',
];

interface Options {
  query?: Record<string, string>;
  held?: string[];
  mock?: boolean;
  fetch?: () => Promise<Response>;
}

function setup({ query = {}, held = ALL, mock = true, fetch }: Options = {}) {
  const roles = new Set(held);
  const params = convertToParamMap(query);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { queryParamMap: of(params), snapshot: { queryParamMap: params } },
      },
      { provide: ConfigService, useValue: configStub({ mock, apiBase: '/triplesale' }) },
      { provide: AuthService, useValue: { session: signal({ branch: { code: 'A1' } }) } },
      {
        provide: PermissionService,
        useValue: {
          has: (spec: string) => spec.split(',').some((r) => roles.has(r)),
          isSuperAdmin: () => false,
          flag: () => true,
        },
      },
      { provide: AI_ADMIN_IDENTITY, useValue: () => ({}) },
      ...(fetch ? [{ provide: AI_ADMIN_FETCH, useValue: fetch }] : []),
      DialogService,
      ToastService,
    ],
  });
}

const text = (el: HTMLElement) => el.textContent ?? '';

async function render(options: Options = {}) {
  setup(options);
  const fixture = TestBed.createComponent(AiAdmin);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

beforeEach(() => TestBed.resetTestingModule());

describe('AiAdmin host', () => {
  it('should open the usage page by default and offer exactly the three pages', async () => {
    const { fixture, el } = await render();
    const tabs = [...el.querySelectorAll('.aad-tab')].map((a) => a.getAttribute('href'));
    expect(tabs).toEqual([
      '/ai/hub/admin?tab=usage',
      '/ai/hub/admin?tab=detail',
      '/ai/hub/admin?tab=audit',
    ]);
    expect(el.querySelector('ts-ai-admin-usage')).toBeTruthy();
    expect(el.querySelector('.aad-tab.is-active')?.getAttribute('href')).toContain('tab=usage');
    fixture.destroy();
  });

  it('should open the page named by ?tab= and hide a page the user may not open', async () => {
    const audit = await render({ query: { tab: 'audit' } });
    expect(audit.el.querySelector('ts-ai-admin-audit')).toBeTruthy();
    audit.fixture.destroy();
    TestBed.resetTestingModule();

    const limited = await render({ query: { tab: 'audit' }, held: ['AI_ADMIN_USAGE_VIEW'] });
    expect([...limited.el.querySelectorAll('.aad-tab')]).toHaveLength(2);
    expect(limited.el.querySelector('ts-ai-admin-audit')).toBeNull();
    expect(limited.el.querySelector('ts-ai-admin-usage')).toBeTruthy();
    limited.fixture.destroy();
  });

  it('should say there is no permission when the user holds none of the Admin rights', async () => {
    const { fixture, el } = await render({ held: [] });
    expect(el.querySelector('.aad-alert')).toBeTruthy();
    expect(el.querySelector('ts-ai-admin-usage')).toBeNull();
    fixture.destroy();
  });
});

describe('usage page', () => {
  it('should show token tiles and a row per company, then drill into the departments and back', async () => {
    const { fixture, el } = await render();
    await vi.waitFor(() => expect(el.querySelectorAll('.aad-table tbody tr').length).toBe(2));
    expect(el.querySelectorAll('.aad-tile').length).toBe(5);
    expect(text(el)).toContain('ไพรม์ ออโต้ อิมพอร์ต');

    el.querySelector<HTMLButtonElement>('.aad-table tbody button.aad-link')?.click();
    await vi.waitFor(() =>
      expect(el.querySelectorAll('.aad-table tbody tr').length).toBeGreaterThanOrEqual(3),
    );
    expect(el.querySelector('.aad-crumbs strong')?.textContent?.trim()).toBeTruthy();

    el.querySelector<HTMLButtonElement>('.aad-crumbs button.aad-link')?.click();
    await vi.waitFor(() => expect(el.querySelectorAll('.aad-table tbody tr').length).toBe(2));
    fixture.destroy();
  });

  it('should not contain any money or error-rate wording', async () => {
    const { fixture, el } = await render();
    await vi.waitFor(() => expect(el.querySelectorAll('.aad-table tbody tr').length).toBe(2));
    expect(text(el)).not.toMatch(/cost|price|usd|thb|baht|credit|latency|ต้นทุน|ราคา|เครดิต|บาท/i);
    fixture.destroy();
  });

  it('should show the service error and no data when the real service is unreachable (no mock behind it)', async () => {
    const { fixture, el } = await render({
      mock: false,
      fetch: () => Promise.reject(new TypeError('Failed to fetch')),
    });
    await vi.waitFor(() => expect(el.querySelector('.aad-alert.is-error')).toBeTruthy());
    expect(el.querySelector('.aad-table')).toBeNull();
    fixture.destroy();
  });
});

describe('detail page', () => {
  const query = {
    tab: 'detail',
    company: 'A1|ไพรม์ ออโต้ อิมพอร์ต',
    department: 'A1-SALES|ฝ่ายขาย',
  };

  it('should show modules, models, the quota chain and the quota form for a quota manager', async () => {
    const { fixture, el } = await render({ query });
    await vi.waitFor(() => expect(el.querySelector('.aad-chain')).toBeTruthy());
    expect(el.querySelectorAll('.aad-chain li').length).toBeGreaterThanOrEqual(2);
    expect(el.querySelector('.aad-chain li.is-blocking')).toBeTruthy();
    expect(text(el)).toContain('Document AI');
    expect(text(el)).toContain('Claude Sonnet 5.5');
    await vi.waitFor(() =>
      expect(
        el.querySelectorAll('ts-ai-admin-quota .aad-table tbody tr').length,
      ).toBeGreaterThanOrEqual(4),
    );
    expect(el.querySelectorAll('ts-ai-admin-quota button[aria-label]').length).toBeGreaterThan(0);
    // the add / edit form is a popup: not in the page until the pen (or the add button) is pressed
    expect(el.querySelector('form.aad-form')).toBeNull();
    el.querySelector<HTMLButtonElement>('ts-ai-admin-quota .aad-btn-icon:not(.is-danger)')?.click();
    await vi.waitFor(() =>
      expect(el.querySelector('[role="dialog"].aad-modal form.aad-form')).toBeTruthy(),
    );
    el.querySelector<HTMLButtonElement>(
      '.aad-modal .aad-form-actions button:not(.is-primary)',
    )?.click();
    await vi.waitFor(() => expect(el.querySelector('.aad-modal')).toBeNull());
    fixture.destroy();
  });

  it('should be read-only without the quota-manage right: the table, no form and no edit buttons', async () => {
    const { fixture, el } = await render({
      query,
      held: ['AI_ADMIN_USAGE_VIEW', 'AI_ADMIN_USAGE_ALL_BRANCH'],
    });
    await vi.waitFor(() =>
      expect(
        el.querySelectorAll('ts-ai-admin-quota .aad-table tbody tr').length,
      ).toBeGreaterThanOrEqual(4),
    );
    expect(el.querySelector('form.aad-form')).toBeNull();
    expect(el.querySelector('ts-ai-admin-quota .aad-btn-icon')).toBeNull();
    fixture.destroy();
  });
});

describe('audit page', () => {
  it('should list usage rows with token columns only and offer the CSV export to an exporter', async () => {
    const { fixture, el } = await render({ query: { tab: 'audit' } });
    await vi.waitFor(() =>
      expect(el.querySelectorAll('.aad-table-wide tbody tr').length).toBeGreaterThan(0),
    );
    const heads = [...el.querySelectorAll('.aad-table-wide thead th')].map((th) =>
      text(th as HTMLElement),
    );
    expect(heads).toHaveLength(11);
    expect(heads.join(' ')).not.toMatch(/status|latency|cost|สถานะ|ต้นทุน/i);
    expect(
      [...el.querySelectorAll('.aad-filters .aad-btn')]
        .map((b) => text(b as HTMLElement))
        .join(' '),
    ).toContain('app.aiAdmin.audit.export');
    fixture.destroy();
  });

  it('should hide the export without the export right', async () => {
    const { fixture, el } = await render({
      query: { tab: 'audit' },
      held: ['AI_ADMIN_SYSTEM_VIEW'],
    });
    await vi.waitFor(() =>
      expect(el.querySelectorAll('.aad-table-wide tbody tr').length).toBeGreaterThan(0),
    );
    expect(text(el.querySelector('.aad-filters') as HTMLElement)).not.toContain(
      'app.aiAdmin.audit.export',
    );
    fixture.destroy();
  });
});

describe('route /ai/hub/admin', () => {
  it('should render the hand-written Admin, not the generated Java view, for the tool "admin"', async () => {
    setup();
    const fixture = TestBed.createComponent(AiHub);
    fixture.componentRef.setInput('tool', 'admin');
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('ts-ai-admin')).toBeTruthy();
    expect(el.querySelector('ts-ai-hub-view')).toBeNull();
    fixture.destroy();
  });
});
