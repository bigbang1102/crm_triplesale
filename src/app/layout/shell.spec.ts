import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { DomGuards } from '@core/dom/dom-guards';
import { Shell } from './shell';

describe('Shell', () => {
  it('starts the template-level DOM scripts (no_autofill / input_guard / TsPhone) once it is rendered and stops them with it', async () => {
    const guards = { start: vi.fn(), stop: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: DomGuards, useValue: guards }] });
    // the frame itself (rail, top bar, footer) is covered elsewhere; only its wiring is under test here
    TestBed.overrideComponent(Shell, { set: { imports: [], template: '', styles: '' } });

    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(guards.start).toHaveBeenCalledTimes(1);
    expect(guards.stop).not.toHaveBeenCalled();

    fixture.destroy();
    expect(guards.stop).toHaveBeenCalledTimes(1);
  });
});
