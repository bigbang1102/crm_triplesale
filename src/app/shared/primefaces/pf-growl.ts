import { forgetWidget, startWidget, widgetOf, widgetVarOf } from './pf-runtime';
import type { FacesMessage } from './faces-message';

/**
 * `p:growl`: the real `PrimeFaces.widget.Growl` (assets/vendor/primefaces/components.js). The widget draws its own container (`div.ui-growl`, `<id>_container`)
 * into <body>, one `div.ui-growl-item-container` per message that stays for `life` ms, with the fade, the close cross and the hover that keeps it. The server of
 * the Java page started it with `PrimeFaces.cw('Growl', 'widget_…', { id, sticky, life, escape, msgs: [the messages of the request] })`; this does the same, and
 * `show(msgs)` is what an ajax update of the growl does (`refresh` → `show`).
 */
export interface GrowlOptions {
  /** client id of the growl component, e.g. `quotationForm:sdMessages` — the container is `<id>_container` */
  id: string;
  /** ms a message stays (p:growl life; 6000 is the PrimeFaces default) */
  life?: number;
  sticky?: boolean;
  /** the messages the request left (shown as soon as the widget starts, as the server's `msgs` are) */
  messages?: readonly FacesMessage[];
}

interface GrowlWidget {
  show(messages: readonly FacesMessage[]): void;
}

export class PfGrowl {
  private readonly widgetVar: string;
  private readonly id: string;

  constructor(opts: GrowlOptions) {
    this.id = opts.id;
    this.widgetVar = widgetVarOf(opts.id);
    startWidget('Growl', this.widgetVar, { id: opts.id, sticky: opts.sticky ?? false, life: opts.life ?? 6000, escape: true, msgs: [...(opts.messages ?? [])] });
  }

  /** `show(msgs)`: the messages replace the ones on screen */
  show(messages: readonly FacesMessage[]): void {
    (widgetOf(this.widgetVar) as unknown as GrowlWidget | undefined)?.show(messages);
  }

  /** the widget goes with its page: its container is in <body>, outside the page's DOM */
  destroy(): void {
    forgetWidget(this.widgetVar);
    document.getElementById(`${this.id}_container`)?.remove();
  }
}
