import { vi } from 'vitest';

/**
 * Fakes for the specs of the screens that run PrimeFaces widgets (jsdom loads no script, and these specs are about what the HOST asks of PrimeFaces, not about
 * the widgets). Not part of the app — nothing imports this but the specs.
 */
export type TransportFactory = (o: { data?: unknown }) => { send(h: unknown, c: (s: number, t: string, r: Record<string, unknown>) => void): void; abort(): void } | undefined;

/** the ajax transport the upload helper registers with jQuery — it registers once for the whole run, so the list outlives a test */
export const transports: TransportFactory[] = [];

/**
 * The page's inline handlers (`onclick="sdOpenSaveConfirm()"`) look their function up on jsdom's own window, while the engine defines them on the global the
 * tests run in: the page functions are copied over (a browser has one window).
 */
export function exposeInlineHandlers(): void {
  const dom = (globalThis as unknown as { jsdom?: { window: Record<string, unknown> } }).jsdom;
  if (!dom) return;
  for (const [k, v] of Object.entries(globalThis)) if (typeof v === 'function' && /^(sd[A-Z]|docAtt|ctShowTab|togglePanel)/.test(k)) dom.window[k] = v;
}

/**
 * PrimeFaces and jQuery played by small fakes that keep what the host asks of them: the widgets started (`cw`), the jQuery handlers bound to the controls
 * (`.off().on()`: the change behavior of a select is one), the ajax transport the upload widget's post is answered by, the customer-search helper script.
 */
export function fakeRuntime() {
  const started: { type: string; widgetVar: string; cfg: Record<string, unknown> }[] = [];
  const bound: { target: unknown; event: string; handler: () => void }[] = [];
  const resetState = vi.fn();
  const widgets: Record<string, unknown> = {};
  (window as unknown as { PrimeFaces: unknown }).PrimeFaces = {
    cw: (type: string, widgetVar: string, cfg: Record<string, unknown>) => {
      started.push({ type, widgetVar, cfg });
      widgets[widgetVar] = { show: vi.fn() };
    },
    widgets,
    widget: {},
    resetState,
  };
  const chain = (target: unknown): unknown =>
    new Proxy(
      {},
      {
        get: (_t, name: string) => {
          if (name === 'on') return (event: string, handler: () => void) => (bound.push({ target, event, handler }), chain(target));
          return () => chain(target); // off, triggerHandler, … : nothing to do
        },
      },
    );
  const jq = Object.assign((target: unknown) => chain(target), { ajaxTransport: (_t: string, f: TransportFactory) => transports.push(f) });
  (window as unknown as { jQuery: unknown }).jQuery = jq;
  (window as unknown as { sdCustomerLazy: unknown }).sdCustomerLazy = { init: vi.fn(), onComplete: vi.fn(), onError: vi.fn() };
  return { started, bound, resetState };
}

/** what a spec removes from the window when it is done */
export function removeRuntime(): void {
  for (const k of ['PrimeFaces', 'jQuery', 'sdCustomerLazy']) delete (window as unknown as Record<string, unknown>)[k];
}
