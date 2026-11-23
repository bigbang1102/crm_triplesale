import { ChangeDetectionStrategy, Component, Type, WritableSignal, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { SessionInfo } from '@core/auth/auth.models';
import { AuthService } from '@core/auth/auth.service';
import { ConfigService } from '@core/config/config.service';
import {
  ACCESS_BUTTON_REGISTRY,
  AccessButtonCode,
  AccessButtonEntry,
} from '@core/permissions/access-buttons';
import { ROLE } from '@core/permissions/roles';
import { authStub, configStub } from '@core/testing/test-helpers';
import { Access } from './access';

@Component({
  selector: 'ts-access-host',
  imports: [Access],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button *tsAccess="'PL-PR-LS-01'">create</button>
    <button *tsAccess="'PL-PR-LS-03'">assign</button>
    <button *tsAccess="'PL-PR-LS-04'">unassigned</button>
  `,
})
class Host {}

// one component that two pages use: the page gives it its own code, so the same button can be allowed in one page and not in the other
@Component({
  selector: 'ts-shared-action',
  imports: [Access],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button *tsAccess="accessCode()">{{ accessCode() }}</button>`,
})
class SharedAction {
  readonly accessCode = input.required<AccessButtonCode>();
}

@Component({
  selector: 'ts-page-a',
  imports: [SharedAction],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ts-shared-action accessCode="PL-PR-LS-01" />`,
})
class PageA {}

@Component({
  selector: 'ts-page-b',
  imports: [SharedAction],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ts-shared-action accessCode="PL-PR-LS-03" />`,
})
class PageB {}

const REGISTRY: Partial<Record<AccessButtonCode, AccessButtonEntry>> = {
  'PL-PR-LS-01': { roles: [ROLE.pipelineLeadCreate] },
  'PL-PR-LS-03': { roles: [ROLE.pipelineLeadAssign] },
  'PL-PR-LS-04': { roles: [] },
};

async function render(roles: string[] | null, host: Type<unknown> = Host) {
  const auth = authStub(roles);
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: auth },
      {
        provide: ConfigService,
        useValue: configStub({ features: { aiHubEnabled: false, pageGuardEnabled: true } }),
      },
      { provide: ACCESS_BUTTON_REGISTRY, useValue: REGISTRY },
    ],
  });
  const fixture = TestBed.createComponent(host);
  fixture.detectChanges();
  await fixture.whenStable();
  const shown = () =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].map((b) =>
      b.textContent?.trim(),
    );
  const session = auth.session as unknown as WritableSignal<SessionInfo | null>;
  return { fixture, shown, session };
}

describe('tsAccess', () => {
  it('shows only the buttons whose role the user holds', async () => {
    const { shown } = await render([ROLE.pipelineLeadCreate]);
    expect(shown()).toEqual(['create']);
  });

  it('shows nothing without a session, and never a button that has no role yet', async () => {
    expect((await render(null)).shown()).toEqual([]);
    TestBed.resetTestingModule();
    expect((await render([ROLE.pipelineLeadCreate, ROLE.pipelineLeadAssign])).shown()).toEqual([
      'create',
      'assign',
    ]);
  });

  describe('a component that two pages share, given the code of the page that uses it', () => {
    it('shows the button in the page whose code the user may use, and not in the other', async () => {
      const roles = [ROLE.pipelineLeadAssign]; // the role of PL-PR-LS-03 (page B), not of PL-PR-LS-01 (page A)
      expect((await render(roles, PageA)).shown()).toEqual([]);
      TestBed.resetTestingModule();
      expect((await render(roles, PageB)).shown()).toEqual(['PL-PR-LS-03']);
    });

    it('does it the other way round for a user with the other role', async () => {
      const roles = [ROLE.pipelineLeadCreate];
      expect((await render(roles, PageA)).shown()).toEqual(['PL-PR-LS-01']);
      TestBed.resetTestingModule();
      expect((await render(roles, PageB)).shown()).toEqual([]);
    });
  });

  it('follows the roles when they change', async () => {
    const { fixture, shown, session } = await render([ROLE.pipelineLeadCreate]);
    session.update((s) => s && { ...s, roles: [ROLE.pipelineLeadAssign] });
    await fixture.whenStable();
    expect(shown()).toEqual(['assign']);

    session.set(null);
    await fixture.whenStable();
    expect(shown()).toEqual([]);
  });
});
