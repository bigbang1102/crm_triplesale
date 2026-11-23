import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearFilterStates, clearSessionUi } from './session-ui';

describe('clearSessionUi (what is bound to the signed-in person goes at logout)', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it('forgets the help chat and the filter states of the pages (the HttpSession of Java), and nothing else', () => {
    sessionStorage.setItem('ai_help_chat', '[1]');
    sessionStorage.setItem('ts.leads.filter-state:demo', '{"a":1}');
    sessionStorage.setItem('ts.lead-detail.filter-state:demo', '{}');
    sessionStorage.setItem('ts.schedule.filter-state:other', '{}');
    sessionStorage.setItem('ts_login', '1');
    sessionStorage.setItem('ts_username', 'demo');
    sessionStorage.setItem('ts.leads.other:demo', 'keep');
    clearSessionUi();
    expect(Object.keys(sessionStorage).sort()).toEqual(['ts.leads.other:demo', 'ts_login', 'ts_username']);
  });

  it('clearFilterStates on its own leaves the help chat alone', () => {
    sessionStorage.setItem('ai_help_chat', '[1]');
    sessionStorage.setItem('ts.leads.filter-state:demo', '{}');
    clearFilterStates();
    expect(Object.keys(sessionStorage)).toEqual(['ai_help_chat']);
  });
});
