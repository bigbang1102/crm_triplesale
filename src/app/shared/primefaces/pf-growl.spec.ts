import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PfGrowl } from './pf-growl';
import type { FacesMessage } from './faces-message';

interface Widget {
  show: ReturnType<typeof vi.fn>;
}

describe('PfGrowl (the PrimeFaces growl widget)', () => {
  let started: { type: string; widgetVar: string; cfg: Record<string, unknown> }[];
  let widgets: Record<string, Widget | undefined>;

  beforeEach(() => {
    started = [];
    widgets = {};
    (window as unknown as { PrimeFaces: unknown }).PrimeFaces = {
      cw: (type: string, widgetVar: string, cfg: Record<string, unknown>) => {
        started.push({ type, widgetVar, cfg });
        widgets[widgetVar] = { show: vi.fn() };
      },
      widgets,
    };
  });
  afterEach(() => {
    delete (window as unknown as { PrimeFaces?: unknown }).PrimeFaces;
    document.body.innerHTML = '';
  });

  it('starts the widget as the server did: id, life, sticky, escape, the messages of the request', () => {
    const msgs: FacesMessage[] = [{ severity: 'warn', summary: 'ข้อความแจ้งเตือน', detail: 'กรุณาเลือกลูกค้า' }];
    new PfGrowl({ id: 'quotationForm:sdMessages', life: 4000, messages: msgs });
    expect(started).toHaveLength(1);
    expect(started[0]).toEqual({
      type: 'Growl',
      widgetVar: 'widget_quotationForm_sdMessages',
      cfg: { id: 'quotationForm:sdMessages', sticky: false, life: 4000, escape: true, msgs },
    });
  });

  it('keeps the PrimeFaces defaults: 6 s, not sticky, no messages', () => {
    new PfGrowl({ id: 'quotationForm:messages' });
    expect(started[0]?.cfg).toMatchObject({ life: 6000, sticky: false, msgs: [] });
  });

  it('show() hands the messages to the widget (an ajax update of the growl)', () => {
    const g = new PfGrowl({ id: 'f:g' });
    const msgs: FacesMessage[] = [{ severity: 'error', summary: 's', detail: 'd' }];
    g.show(msgs);
    expect(widgets['widget_f_g']?.show).toHaveBeenCalledWith(msgs);
  });

  it('destroy() removes the container the widget put into <body> and forgets the widget, so that a new one is made next time', () => {
    const container = document.createElement('div');
    container.id = 'f:g_container';
    document.body.appendChild(container);
    const g = new PfGrowl({ id: 'f:g' });
    g.destroy();
    expect(document.getElementById('f:g_container')).toBeNull();
    expect(widgets['widget_f_g']).toBeUndefined();
  });

  it('show() after destroy() does nothing', () => {
    const g = new PfGrowl({ id: 'f:g' });
    g.destroy();
    expect(() => g.show([])).not.toThrow();
  });
});
