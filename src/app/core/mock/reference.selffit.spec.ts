import { describe, expect, it, vi } from 'vitest';

/** the modules whose lists the export writes (the same as `tools/mockup-export-seed.mjs`) */
const MODULES: Array<() => Promise<unknown>> = [
  () => import('./schedule-seed'),
  () => import('../../features/home/home.mock'),
  () => import('../../features/activities/activities.mock'),
  () => import('../../features/opportunities/opportunities.mock'),
  () => import('../../features/opportunity-detail/opportunity-detail.mock'),
  () => import('../../features/receipts/receipts.mock'),
  () => import('../../features/sales-docs/form/sales-doc.mock'),
  () => import('../../features/report/report.mock'),
  () => import('../../features/dashboard/dashboard.mock'),
  () => import('../../features/dashboard/dashboard.mock.gold'),
  () => import('../../features/drilldown/drilldown.mock'),
  () => import('../../features/ai/translator/translator.mock'),
  () => import('../../features/ai/ai-hub/ai-hub.mock.more'),
  () => import('../../features/ai/ai-hub/ai-hub.mock'),
  () => import('../../features/settings/settings.mock'),
  () => import('../../features/settings/settings.master-mock'),
  () => import('../../features/prospects/prospects.mock'),
  () => import('../../features/prospects/form/prospect-form.mock'),
  () => import('../../features/leads/leads.options'),
  () => import('../http/mock-countries'),
  () => import('../../layout/ai-fab/ai-fab.mock'),
];

describe('the lists the export writes', () => {
  it('should each be accepted again when read back as a document (else the page silently keeps the list of the code)', async () => {
    vi.resetModules();
    for (const load of MODULES) await load();
    // the mocks that ask for their lists only when they build their data
    const registering = [
      await import('../../features/forecast/forecast.mock'),
      await import('../../features/chat/chat.mock'),
      await import('../../features/supporting-docs/supporting-doc.mock'),
      await import('../../features/leads/leads.mock'),
    ];
    for (const m of registering) m.registerReferenceLists();
    const { referenceNotAcceptingThemselves } = await import('./reference');
    const unfit = referenceNotAcceptingThemselves();
    expect(unfit).toEqual([]);
  });
});
