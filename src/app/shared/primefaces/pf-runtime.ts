import { loadScript } from '@core/dom/load-script';

/**
 * The PrimeFaces widget scripts of the Java pages (jQuery, core.js, components.js — select, radio, check box, dialog, growl … —, the calendar and the PrimeFaces 14
 * date picker with their Thai locale, the file upload and its client validation), loaded on demand and only once: `public/assets/vendor/primefaces/*` is the very code of primefaces-14.0.7-jakarta.jar (tools/sync-supporting-doc-pf.mjs). The server
 * of the Java page started each widget with an inline `PrimeFaces.cw('Type', 'widgetVar', {cfg})`; the host does the same, with the configuration the
 * generator took from the component (`<page>.meta.ts`).
 */
const BASE = 'assets/vendor/primefaces/';
/** the scripts in the order the Java page's head loads them (each needs the ones before): p:calendar → calendar.js, p:datePicker → datepicker.js */
export const PF_SCRIPTS = ['jquery.js', 'jquery-plugins.js', 'core.js', 'components.js', 'locale-th.js', 'calendar.js', 'datepicker.js', 'validation.js', 'fileupload.js'] as const;
const ORDER = PF_SCRIPTS;

interface PfWidget {
  destroy?: () => void;
  jq?: { remove(): void };
}
interface PfGlobal {
  cw(type: string, widgetVar: string, cfg: Record<string, unknown>): void;
  widgets: Record<string, PfWidget | undefined>;
  settings?: Record<string, unknown>;
}
const pf = (): PfGlobal => (window as unknown as { PrimeFaces: PfGlobal }).PrimeFaces;

let loading: Promise<void> | undefined;

/** loads the scripts in order (each needs the one before) */
export function loadPrimeFaces(): Promise<void> {
  loading ??= (async () => {
    for (const f of ORDER) await loadScript(BASE + f);
  })().catch((e) => {
    loading = undefined; // a later call may try again
    throw e;
  });
  return loading;
}

/** `PrimeFaces.cw(type, widgetVar, cfg)`: starts (or, for a part of the page that was drawn again, restarts) a widget */
export function startWidget(type: string, widgetVar: string, cfg: Record<string, unknown>): void {
  pf().cw(type, widgetVar, cfg);
}

/** the widget object of `widgetVar` (`PF('x')`) */
export const widgetOf = (widgetVar: string): PfWidget | undefined => pf()?.widgets?.[widgetVar];

/** `widget_<client id>`: the widget variable PrimeFaces gives a component that has no `widgetVar` of its own */
export const widgetVarOf = (clientId: string): string => `widget_${clientId.replace(/[^\w]/g, '_')}`;

/**
 * Stops widgets: the parts they put into <body> (the panel of a select, the datepicker) go with them. Called when the page is left and
 * before a part of the page is drawn again.
 */
export function stopWidgets(widgetVars: readonly string[], clientIds: readonly string[]): void {
  const g = pf();
  if (!g) return;
  for (const v of widgetVars) {
    try {
      g.widgets[v]?.destroy?.();
    } catch {
      /* a widget whose DOM is gone */
    }
    delete g.widgets[v];
  }
  // the select panel / the date picker panel is moved into <body> by the widget (appendTo): the page's own copy is gone with its DOM, the moved one is not;
  // a dialog is moved into <body> too (with the mask `<id>_modal` it draws when it is modal)
  for (const id of clientIds) {
    document.getElementById(`${id}_panel`)?.remove();
    document.getElementById(`${id}_modal`)?.remove();
    const moved = document.getElementById(id);
    if (moved && moved.parentElement === document.body) moved.remove();
  }
}

/** the shared datepicker `<div id="ui-datepicker-div">` is drawn into <body> by the first calendar; it goes when the page does */
export function removeDatepickerDiv(): void {
  document.getElementById('ui-datepicker-div')?.remove();
}

/**
 * What a page load does to PrimeFaces: the z-index counter starts at 1000 again, the widgets are forgotten, the requests in flight are aborted
 * (`PrimeFaces.resetState`). The screens run in a single-page app, where PrimeFaces stays loaded when one of them is left for another.
 */
export function resetPrimeFacesState(): void {
  (window as unknown as { PrimeFaces?: { resetState?: () => void } }).PrimeFaces?.resetState?.();
}

/** a widget forgotten by its variable: the next `cw` with it makes a new one instead of refreshing the old (whose DOM may be gone) */
export function forgetWidget(widgetVar: string): void {
  const g = pf();
  if (g) delete g.widgets[widgetVar];
}
