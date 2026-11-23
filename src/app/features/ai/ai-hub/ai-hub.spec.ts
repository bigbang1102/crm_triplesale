import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@core/config/config.service';
import { PermissionService } from '@core/permissions/permission.service';
import { configStub } from '@core/testing/test-helpers';
import { DialogService } from '@shared/ui/notify/dialog.service';
import { ToastService } from '@shared/ui/notify/toast.service';
import { AiHub } from './ai-hub';
import { AiHubView } from './ai-hub-view';

/** the engine starts after the fake backend chunk has loaded (`import('./ai-hub.mock')`) — wait for its first effect */
const engineStarted = (el: HTMLElement) => vi.waitFor(() => expect(el.querySelector('.aih-view.on')).toBeTruthy());

interface Who {
  /** `aihub.menu.enabled` */
  flagOn?: boolean;
  /** has CRM_Prospect_View (Sales & Customer AI) */
  prospects?: boolean;
  /** super_admin (the Admin screen) */
  admin?: boolean;
  /** roles the user does not hold (everything else is held) */
  denied?: string[];
}

function setup({ flagOn = true, prospects = true, admin = true, denied = [] }: Who = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ConfigService, useValue: configStub({ mock: true }) },
      { provide: PermissionService, useValue: { flag: () => flagOn, has: (spec: string) => (spec.startsWith('AI_ADMIN') ? admin : spec === 'CRM_Prospect_View' ? prospects : !denied.some((d) => spec.split(',').includes(d))), isSuperAdmin: () => admin } },
      DialogService,
      ToastService,
    ],
  });
}

/** every tool screen of the Java page in markup order (Admin sits right after home; `customer-brief` needs CRM_Prospect_View) */
const SCREENS = [
  'doc-analyze', 'doc-summary', 'doc-compare', 'doc-extract', 'doc-check', 'data-analyze', 'meeting', 'slides', 'image', 'video',
  'music', 'social', 'article', 'voiceover', 'gif', 'customer-brief', 'code', 'code-review', 'sql-assist', 'log-doctor', 'code-docs',
  'strategy', 'howto', 'diagram', 'library-ask', 'quiz', 'faq', 'project-plan', 'decision', 'formal-writer', 'reply-draft', 'hr-docs',
  'claude-code',
];
/** cards on the hub home for a user who sees everything (Sales & Customer AI included) */
const TOOL_CARDS = 34;

describe('AI HUB screens', () => {
  it('home: the Java markup is rendered with its groups and tool cards linking to /ai/hub/<tool>', async () => {
    setup();
    const fixture = TestBed.createComponent(AiHubView);
    fixture.componentRef.setInput('tool', '');
    fixture.detectChanges();
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    await engineStarted(el);
    expect(el.querySelector('#aihRoot')).toBeTruthy();
    expect(el.querySelectorAll('.aih-view.on')).toHaveLength(1);
    expect(el.querySelector('.aih-view.on')?.getAttribute('data-tool')).toBe('home');
    expect([...el.querySelectorAll('.aih-group')].map((g) => g.getAttribute('data-g'))).toEqual(['doc', 'content', 'dev', 'know', 'office', 'sales']);
    const links = [...el.querySelectorAll<HTMLAnchorElement>('a.aih-tool')].map((a) => a.getAttribute('href'));
    expect(links).toHaveLength(TOOL_CARDS);
    expect(links).toContain('/ai/hub/doc-analyze');
    expect(links).toContain('/ai/hub/library-ask');
    fixture.destroy();
  });

  it('a tool route shows only that tool; unknown tools fall back to the hub home', async () => {
    setup();
    for (const [tool, shown] of [['slides', 'slides'], ['not-a-tool', 'home']]) {
      const fixture = TestBed.createComponent(AiHubView);
      fixture.componentRef.setInput('tool', tool);
      fixture.detectChanges();
      await fixture.whenStable();
      await engineStarted(fixture.nativeElement);
      const on = (fixture.nativeElement as HTMLElement).querySelectorAll('.aih-view.on');
      expect(on).toHaveLength(1);
      expect(on[0].getAttribute('data-tool')).toBe(shown);
      fixture.destroy();
    }
  });

  it('every tool section exists exactly once, with its run button and the sample-result badge', async () => {
    setup();
    const fixture = TestBed.createComponent(AiHubView);
    fixture.componentRef.setInput('tool', '');
    fixture.detectChanges();
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    await engineStarted(el);
    const tools = [...el.querySelectorAll('.aih-view[data-tool]')].map((v) => v.getAttribute('data-tool'));
    expect(tools).toEqual(['home', 'admin', ...SCREENS]);
    // the engine adds "ตัวอย่างผลลัพธ์" next to every result title and a run button exists per tool
    expect(el.querySelectorAll('.aih-view:not([data-tool="home"]) .aih-run').length).toBeGreaterThanOrEqual(SCREENS.length - 2);
    fixture.destroy();
  });

  it('turns an in-page /ai/hub link into router navigation instead of a page load', async () => {
    setup();
    const router = TestBed.inject(Router);
    const navigated: string[] = [];
    router.navigateByUrl = ((url: string) => {
      navigated.push(url);
      return Promise.resolve(true);
    }) as Router['navigateByUrl'];

    const fixture = TestBed.createComponent(AiHubView);
    fixture.componentRef.setInput('tool', '');
    fixture.detectChanges();
    await fixture.whenStable();

    const card = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a.aih-tool[href="/ai/hub/image"]')!;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    card.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(navigated).toEqual(['/ai/hub/image']);
    fixture.destroy();
  });

  it('hides the Admin screen and the Sales & Customer AI group from a user who is neither super_admin nor allowed to view prospects', async () => {
    setup({ prospects: false, admin: false });
    const fixture = TestBed.createComponent(AiHubView);
    fixture.componentRef.setInput('tool', '');
    fixture.detectChanges();
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    await engineStarted(el);
    const tools = [...el.querySelectorAll('.aih-view[data-tool]')].map((v) => v.getAttribute('data-tool'));
    expect(tools).not.toContain('admin');
    expect(el.querySelector('.aih-group[data-g="sales"]')).toBeNull();
    expect(el.querySelector('a.aih-tool[href="/ai/hub/customer-brief"]')).toBeNull();
    fixture.destroy();
  });

  it('home: a tool without its AI_*_USE is not offered; the group count and the total follow, and an empty group goes', async () => {
    setup({ denied: ['AI_DOC_SUMMARY_USE', 'AI_SLIDES_USE', 'AI_IMAGE_USE', 'AI_VIDEO_USE', 'AI_MUSIC_USE', 'AI_SOCIAL_USE', 'AI_ARTICLE_USE', 'AI_VOICEOVER_USE', 'AI_GIF_USE'] });
    const fixture = TestBed.createComponent(AiHubView);
    fixture.componentRef.setInput('tool', '');
    fixture.detectChanges();
    await fixture.whenStable();
    await engineStarted(fixture.nativeElement);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('a.aih-tool[href="/ai/hub/doc-summary"]')).toBeNull();
    expect(el.querySelector('a.aih-tool[href="/ai/hub/doc-analyze"]')).toBeTruthy();
    expect(el.querySelector('.aih-group[data-g="doc"] .aih-group-count')?.textContent).toContain('6');
    expect(el.querySelector('.aih-group[data-g="content"]')).toBeNull(); // every Content Creation tool is denied → the group goes
    expect(el.querySelector('[data-tool-count]')?.textContent).toBe(String(el.querySelectorAll('a.aih-tool').length));
    fixture.destroy();
  });

  it('route: a tool page needs AI_ACCESS_USE and its own AI_*_USE, else the no-permission notice replaces it', async () => {
    for (const [denied, expectNotice] of [[['AI_IMAGE_USE'], true], [['AI_ACCESS_USE'], true], [['AI_DOC_SUMMARY_USE'], false]] as const) {
      TestBed.resetTestingModule();
      setup({ denied: [...denied] });
      const fixture = TestBed.createComponent(AiHub);
      fixture.componentRef.setInput('tool', 'image');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('.fa-lock') !== null).toBe(expectNotice);
      fixture.destroy();
    }
  });

  it('shows Sales & Customer AI to CRM_Prospect_View and Admin to super_admin, independently', async () => {
    setup({ prospects: true, admin: false });
    let fixture = TestBed.createComponent(AiHubView);
    fixture.componentRef.setInput('tool', '');
    fixture.detectChanges();
    await fixture.whenStable();
    await engineStarted(fixture.nativeElement);
    expect(fixture.nativeElement.querySelector('.aih-group[data-g="sales"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.aih-view[data-tool="admin"]')).toBeNull();
    fixture.destroy();

    TestBed.resetTestingModule();
    setup({ prospects: false, admin: true });
    fixture = TestBed.createComponent(AiHubView);
    fixture.componentRef.setInput('tool', '');
    fixture.detectChanges();
    await fixture.whenStable();
    await engineStarted(fixture.nativeElement);
    expect(fixture.nativeElement.querySelector('.aih-view[data-tool="admin"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.aih-group[data-g="sales"]')).toBeNull();
    fixture.destroy();
  });

  it('shows the "AI HUB is switched off" notice when the feature flag is off (no tool screens at all)', async () => {
    setup({ flagOn: false });
    const fixture = TestBed.createComponent(AiHub);
    fixture.detectChanges();
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('app.aiHub.disabledTitle');
    expect(el.querySelector('#aihRoot')).toBeNull();
    fixture.destroy();
  });
});
