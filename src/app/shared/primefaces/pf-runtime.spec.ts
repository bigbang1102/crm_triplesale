import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PF_SCRIPTS, forgetWidget, removeDatepickerDiv, resetPrimeFacesState, startWidget, stopWidgets, widgetOf, widgetVarOf } from './pf-runtime';

describe('PrimeFaces runtime helpers', () => {
  let widgets: Record<string, { destroy?: () => void } | undefined>;
  let cw: ReturnType<typeof vi.fn>;
  let resetState: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    widgets = {};
    cw = vi.fn();
    resetState = vi.fn();
    (window as unknown as { PrimeFaces: unknown }).PrimeFaces = { cw, widgets, resetState };
  });
  afterEach(() => {
    delete (window as unknown as { PrimeFaces?: unknown }).PrimeFaces;
    document.body.innerHTML = '';
  });

  it('gives a component without a widgetVar the one PrimeFaces gives it: widget_<client id with _>', () => {
    expect(widgetVarOf('quotationForm:sd1RcvBy')).toBe('widget_quotationForm_sd1RcvBy');
    expect(widgetVarOf('quotationForm:j_idt6:0:j_idt7')).toBe('widget_quotationForm_j_idt6_0_j_idt7');
  });

  it('starts a widget with PrimeFaces.cw and finds it by its variable', () => {
    startWidget('SelectOneMenu', 'wv', { id: 'x' });
    expect(cw).toHaveBeenCalledWith('SelectOneMenu', 'wv', { id: 'x' });
    widgets['wv'] = {};
    expect(widgetOf('wv')).toBe(widgets['wv']);
    expect(widgetOf('nope')).toBeUndefined();
  });

  it('stops widgets: destroy() is called, the variable is forgotten, the select panel moved into <body> goes too', () => {
    const destroy = vi.fn();
    widgets['a'] = { destroy };
    widgets['b'] = {}; // (a widget without destroy)
    const panel = document.createElement('div');
    panel.id = 'quotationForm:sel_panel';
    document.body.appendChild(panel);
    stopWidgets(['a', 'b', 'gone'], ['quotationForm:sel']);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(widgets['a']).toBeUndefined();
    expect(widgets['b']).toBeUndefined();
    expect(document.getElementById('quotationForm:sel_panel')).toBeNull();
  });

  it('also takes away what a dialog drew into <body> (the dialog itself, the mask of a modal one) but leaves an element that is still in the page', () => {
    const dialog = document.createElement('div');
    dialog.id = 'form:confirmationDialogPros';
    const mask = document.createElement('div');
    mask.id = 'form:confirmationDialogPros_modal';
    const page = document.createElement('section');
    const inPage = document.createElement('div');
    inPage.id = 'form:inPage';
    page.appendChild(inPage);
    document.body.append(dialog, mask, page);
    stopWidgets([], ['form:confirmationDialogPros', 'form:inPage']);
    expect(document.getElementById('form:confirmationDialogPros')).toBeNull();
    expect(document.getElementById('form:confirmationDialogPros_modal')).toBeNull();
    expect(document.getElementById('form:inPage')).toBe(inPage);
  });

  it('loads the PrimeFaces 14 date picker after the calendar and the Thai locale (every script it lists is vendored: tools/lib/pf-dom.selftest.mjs checks the files)', () => {
    expect(PF_SCRIPTS.indexOf('datepicker.js')).toBeGreaterThan(PF_SCRIPTS.indexOf('calendar.js'));
    expect(PF_SCRIPTS.indexOf('locale-th.js')).toBeLessThan(PF_SCRIPTS.indexOf('datepicker.js')); // (the picker reads PrimeFaces.locales['th'] when it starts)
  });

  it('a widget whose destroy() throws (its DOM is gone) does not stop the others', () => {
    widgets['bad'] = {
      destroy: () => {
        throw new Error('detached');
      },
    };
    const ok = vi.fn();
    widgets['ok'] = { destroy: ok };
    expect(() => stopWidgets(['bad', 'ok'], [])).not.toThrow();
    expect(ok).toHaveBeenCalled();
  });

  it('forgetWidget() drops only the variable', () => {
    widgets['w'] = {};
    forgetWidget('w');
    expect(widgets['w']).toBeUndefined();
  });

  it('removes the shared datepicker div the first calendar drew into <body>', () => {
    const d = document.createElement('div');
    d.id = 'ui-datepicker-div';
    document.body.appendChild(d);
    removeDatepickerDiv();
    expect(document.getElementById('ui-datepicker-div')).toBeNull();
    expect(() => removeDatepickerDiv()).not.toThrow();
  });

  it('resetPrimeFacesState() is what a page load does to PrimeFaces; harmless when it is not loaded', () => {
    resetPrimeFacesState();
    expect(resetState).toHaveBeenCalledTimes(1);
    delete (window as unknown as { PrimeFaces?: unknown }).PrimeFaces;
    expect(() => resetPrimeFacesState()).not.toThrow();
    expect(() => stopWidgets(['x'], [])).not.toThrow();
    expect(() => forgetWidget('x')).not.toThrow();
  });
});
