// Scenarios of the Lead detail comparison. Each function is run INSIDE the page under test (Java replica / Angular app) with
// (sleep, side, win) in scope, after the prelude of lib/scenario-pre.mjs and the page prelude (`pre` in page.mjs: tab(), sub(), note(), stubDialogs(), leadReady()).
// add(name, opts, fn):  opts = { w, h, theme, lang, settle, wait, roots, frames, ready, lead, group, variant }
//
// The cast (lead-detail.mock.ts, checked by lead-detail.mock.spec.ts): 29 = the lead of the signed-in demo user (owner 1001, 5 groups, in the last
// one, 3 appointments, 2 tasks); 7 = another owner, in the middle group; 1 = first group of 7; 87 = 2 groups; 21 = 3 groups; 3 = 7 groups in the last;
// 240 = 12 groups; 239 = 1 group; 108 / 27 = no workflow step; 30 = SUCCESS; 40 = LOST; 237 = SOLD; 132 / 44 = no owner; 52 = no team; 35 = no history;
// 129 = no appointments / tasks; 17 = a company; 900..903 / 999 = the lead API fails.
export default function (addScenario) {
  // a scenario whose name says "reload" ends in a reload of the page (its own: the Java page reloads, the Angular page starts again): see opts.reload of lib/runner.mjs
  var add = function (name, opts, fn) {
    // (the page is big and the machine runs several browsers at once: a longer patience than the default 15 s)
    // (opts.hook = who is signed in, for the fake REST service of a --live run: it cannot read the variant from the token — see upstream.mjs)
    addScenario(name, Object.assign({ readyTimeout: 30000 }, /reload/.test(name) ? { reloads: true } : {}, opts, opts && opts.variant ? { hook: 'variant=' + opts.variant } : {}), fn);
  };
  var L = { main: 29, other: 7, first: 1, mid: 42, g2: 87, g3: 21, g7: 3, g12: 240, g1: 239, nowf: 108, nowf2: 27, success: 30, lost: 40, sold: 237, noowner: 44, noteam: 52, nohist: 35, nosched: 129, company: 17 };
  var q = function (s) { return JSON.stringify(s); };
  var LEAD = function (n, extra) { return Object.assign({ lead: n }, extra || {}); };
  var SETTLED = 'await leadReady();';

  /* ---- first paint, themes, viewports, language, font buttons ---- */
  add('overview', {}, SETTLED);
  add('overview-dark', { theme: 'dark' }, SETTLED);
  [[1024, 768], [768, 1024], [390, 844], [1920, 1080]].forEach(function (s) {
    add('overview-' + s[0], { w: s[0], h: s[1] }, SETTLED);
  });
  add('overview-dark-390', { theme: 'dark', w: 390, h: 844 }, SETTLED);
  add('en-overview', { lang: 'en' }, SETTLED);
  add('en-overview-dark', { lang: 'en', theme: 'dark' }, SETTLED);
  add('fs-plus', {}, 'await leadReady(); fontAdj("2px"); await sleep(600);');
  add('fs-minus', {}, 'await leadReady(); fontAdj("-2px"); await sleep(600);');
  add('fs-plus-dark', { theme: 'dark' }, 'await leadReady(); fontAdj("2px"); await sleep(600);');
  add('fs-plus-main-tab', {}, 'await leadReady(); fontAdj("2px"); await tab("main");');

  /* ---- the stepbar and the left card for leads of every shape ---- */
  [['other', L.other], ['first', L.first], ['mid', L.mid], ['g1', L.g1], ['g2', L.g2], ['g3', L.g3], ['g7', L.g7], ['g12', L.g12], ['nowf', L.nowf], ['nowf2', L.nowf2],
    ['success', L.success], ['lost', L.lost], ['sold', L.sold], ['noowner', L.noowner], ['noteam', L.noteam], ['nohist', L.nohist], ['nosched', L.nosched], ['company', L.company]].forEach(function (p) {
    add('lead-' + p[0], LEAD(p[1]), SETTLED);
    add('lead-' + p[0] + '-dark', LEAD(p[1], { theme: 'dark' }), SETTLED);
  });
  add('lead-g12-390', LEAD(L.g12, { w: 390, h: 844 }), SETTLED);
  add('lead-g12-1920', LEAD(L.g12, { w: 1920, h: 1080 }), SETTLED);
  add('lead-first-group-param', LEAD(L.first, { group: 101 }), SETTLED);
  add('en-lead-nowf', LEAD(L.nowf, { lang: 'en' }), SETTLED);
  add('en-lead-g12', LEAD(L.g12, { lang: 'en' }), SETTLED);

  /* ---- permission variants ---- */
  add('perm-owner-own-lead', LEAD(L.main, { variant: 'owner' }), SETTLED);
  add('perm-owner-other-lead', LEAD(L.other, { variant: 'owner' }), SETTLED);
  add('perm-all-other-lead', LEAD(L.other), SETTLED);
  add('perm-viewer', LEAD(L.main, { variant: 'viewer' }), SETTLED);
  add('perm-viewer-dark', LEAD(L.main, { variant: 'viewer', theme: 'dark' }), SETTLED);
  add('perm-noactivity', LEAD(L.main, { variant: 'noactivity' }), SETTLED);
  add('perm-viewer-main-tab', LEAD(L.main, { variant: 'viewer' }), 'await leadReady(); await tab("main");');

  /* ---- the five tabs, the sub tabs of "ข้อมูลเพิ่มเติม" and its inner tabs ---- */
  ['main', 'extra', 'docs', 'saledocs'].forEach(function (t) {
    add('tab-' + t, {}, 'await leadReady(); await tab(' + q(t) + ');');
    add('tab-' + t + '-dark', { theme: 'dark' }, 'await leadReady(); await tab(' + q(t) + ');');
  });
  ['main', 'extra', 'docs'].forEach(function (t) {
    add('tab-' + t + '-390', { w: 390, h: 844 }, 'await leadReady(); await tab(' + q(t) + ');');
    add('tab-' + t + '-768', { w: 768, h: 1024 }, 'await leadReady(); await tab(' + q(t) + ');');
  });
  add('en-tab-main', { lang: 'en' }, 'await leadReady(); await tab("main");');
  add('en-tab-extra', { lang: 'en' }, 'await leadReady(); await tab("extra");');
  add('tab-main-company', LEAD(L.company), 'await leadReady(); await tab("main");');
  add('tab-main-company-dark', LEAD(L.company, { theme: 'dark' }), 'await leadReady(); await tab("main");');
  add('tab-main-sections', {}, 'await leadReady(); await tab("main"); $$(".ld2-form-section-head").forEach(function (h, i) { if (i > 0) click(h); }); await sleep(300);');
  add('tab-main-sections-close-first', {}, 'await leadReady(); await tab("main"); click($(".ld2-form-section-head")); await sleep(300);');
  add('tab-main-sections-company', LEAD(L.company), 'await leadReady(); await tab("main"); $$(".ld2-form-section-head").forEach(function (h, i) { if (i > 0) click(h); }); await sleep(300);');
  add('tab-main-no-owner', LEAD(L.noowner), 'await leadReady(); await tab("main");');
  ['cs', 'pls', 'ls', 'le', 'crm', 'extra2', 'survey'].forEach(function (s) {
    add('sub-' + s, {}, 'await leadReady(); await tab("extra"); await sub(' + q(s) + ');');
  });
  add('sub-cs-dark', { theme: 'dark' }, 'await leadReady(); await tab("extra");');
  add('sub-survey-dark', { theme: 'dark' }, 'await leadReady(); await tab("extra"); await sub("survey");');
  add('sub-survey-390', { w: 390, h: 844 }, 'await leadReady(); await tab("extra"); await sub("survey");');
  add('inner-co', {}, 'await leadReady(); await tab("extra"); await inner("co");');
  add('inner-co-dark', { theme: 'dark' }, 'await leadReady(); await tab("extra"); await inner("co");');
  ['basic', 'asset', 'custintv', 'cointv', 'contact', 'result', 'interest', 'summary', 'status', 'installment', 'ref'].forEach(function (k) {
    add('x2-' + k, {}, 'await leadReady(); await tab("extra"); await sub("extra2"); await x2(' + q(k) + ');');
  });
  add('x2-interest-dark', { theme: 'dark' }, 'await leadReady(); await tab("extra"); await sub("extra2"); await x2("interest");');
  add('extra-other-lead', LEAD(L.other), 'await leadReady(); await tab("extra"); await sub("ls");');
  add('extra-closed-lead', LEAD(L.success), 'await leadReady(); await tab("extra"); await sub("cs");');
  add('main-closed-lead', LEAD(L.success), 'await leadReady(); await tab("main");');
  add('main-viewer', LEAD(L.main, { variant: 'viewer' }), 'await leadReady(); await tab("main");');
  add('docs-empty', LEAD(28), 'await leadReady(); await tab("docs");');
  add('docs-many', LEAD(31), 'await leadReady(); await tab("docs");');
  add('saledocs-empty', LEAD(27), 'await leadReady(); await tab("saledocs");');
  add('saledocs-dark', LEAD(L.main, { theme: 'dark' }), 'await leadReady(); await tab("saledocs");');
  add('docs-viewer', LEAD(L.main, { variant: 'viewer' }), 'await leadReady(); await tab("docs");');
  add('tab-restore-after-reload', {}, 'await leadReady(); await tab("extra"); await sub("pls"); return "__RELOAD__";');

  /* ---- the left card: interest, target month / year, amount, demand ---- */
  add('interest-open', {}, 'await leadReady(); click("#ld2Interest"); await sleep(300);');
  add('interest-open-dark', { theme: 'dark' }, 'await leadReady(); click("#ld2Interest"); await sleep(300);');
  add('interest-pick-hot', {}, 'await leadReady(); click("#ld2Interest"); await sleep(200); click(".ld2-int-opt[data-val=HOT]"); await sleep(500);');
  add('interest-pick-cold', {}, 'await leadReady(); click("#ld2Interest"); await sleep(200); click(".ld2-int-opt[data-val=COLD]"); await sleep(500);');
  add('interest-pick-then-reload', {}, 'await leadReady(); click("#ld2Interest"); await sleep(200); click(".ld2-int-opt[data-val=NEW]"); await sleep(500); return "__RELOAD__";');
  add('interest-closed-lead', LEAD(L.success), 'await leadReady(); click("#ld2Interest"); await sleep(300);');
  add('interest-viewer', LEAD(L.main, { variant: 'viewer' }), 'await leadReady(); click("#ld2Interest"); await sleep(300);');
  add('interest-close-by-outside-click', {}, 'await leadReady(); click("#ld2Interest"); await sleep(200); click(document.body); await sleep(200);');
  add('month-open', {}, 'await leadReady(); click("#ld2MonthBtn"); await sleep(300);');
  add('month-pick', {}, 'await leadReady(); click("#ld2MonthBtn"); await sleep(200); click($$("#ld2MonthDd .ld2-prod-dd-item")[4]); await sleep(500);');
  add('month-pick-then-reload', {}, 'await leadReady(); click("#ld2MonthBtn"); await sleep(200); click($$("#ld2MonthDd .ld2-prod-dd-item")[1]); await sleep(500); return "__RELOAD__";');
  add('year-open', {}, 'await leadReady(); click("#ld2YearBtn"); await sleep(900);');
  add('year-open-dark', { theme: 'dark' }, 'await leadReady(); click("#ld2YearBtn"); await sleep(900);');
  add('year-pick', {}, 'await leadReady(); click("#ld2YearBtn"); await sleep(900); click($$("#ld2YearDd .ld2-prod-dd-item")[3]); await sleep(500);');
  add('year-open-then-month', {}, 'await leadReady(); click("#ld2YearBtn"); await sleep(900); click("#ld2MonthBtn"); await sleep(300);');
  add('amount-type-filter', {}, 'await leadReady(); typeIn("#ld2Amount", "12a3.4.5x"); await sleep(200);');
  add('amount-blur-save', {}, 'await leadReady(); typeIn("#ld2Amount", "1234567.5"); blur("#ld2Amount"); await sleep(500);');
  add('amount-blur-same', {}, 'await leadReady(); blur("#ld2Amount"); await sleep(300);');
  add('amount-blur-empty', {}, 'await leadReady(); typeIn("#ld2Amount", ""); blur("#ld2Amount"); await sleep(300);');
  add('amount-then-reload', {}, 'await leadReady(); typeIn("#ld2Amount", "777000"); blur("#ld2Amount"); await sleep(500); return "__RELOAD__";');
  add('need-edit-save', {}, 'await leadReady(); typeIn("#ld2CtNeed", "ต้องการสินเชื่อรีไฟแนนซ์ 2 ล้านบาท"); blur("#ld2CtNeed"); await sleep(500);');
  add('need-then-reload', {}, 'await leadReady(); typeIn("#ld2CtNeed", "ความต้องการใหม่"); blur("#ld2CtNeed"); await sleep(500); return "__RELOAD__";');
  add('need-unchanged-blur', {}, 'await leadReady(); blur("#ld2CtNeed"); await sleep(300);');
  add('amount-viewer', LEAD(L.main, { variant: 'viewer' }), 'await leadReady(); click("#ld2MonthBtn"); await sleep(300);');

  /* ---- tags ---- */
  add('tags-open', {}, 'await leadReady(); click("#ld2EditTagBtn"); await sleep(900);');
  add('tags-open-dark', { theme: 'dark' }, 'await leadReady(); click("#ld2EditTagBtn"); await sleep(900);');
  add('tags-toggle', {}, 'await leadReady(); click("#ld2EditTagBtn"); await sleep(900); $$("#ld2TagmChips .ld2-tagm-chip").slice(0, 3).forEach(click); await sleep(300);');
  add('tags-max-six', {}, 'await leadReady(); click("#ld2EditTagBtn"); await sleep(900); $$("#ld2TagmChips .ld2-tagm-chip").forEach(click); await sleep(300);');
  add('tags-save', {}, 'await leadReady(); click("#ld2EditTagBtn"); await sleep(900); $$("#ld2TagmChips .ld2-tagm-chip").slice(0, 2).forEach(click); click("#ld2TagSaveBtn"); await sleep(600);');
  add('tags-save-then-reload', {}, 'await leadReady(); click("#ld2EditTagBtn"); await sleep(900); $$("#ld2TagmChips .ld2-tagm-chip").slice(4, 6).forEach(click); click("#ld2TagSaveBtn"); await sleep(600); return "__RELOAD__";');
  add('tags-clear-all', {}, 'await leadReady(); click("#ld2EditTagBtn"); await sleep(900); $$("#ld2TagmChips .ld2-tagm-chip.sel").forEach(click); click("#ld2TagSaveBtn"); await sleep(600);');
  add('tags-close-by-outside', {}, 'await leadReady(); click("#ld2EditTagBtn"); await sleep(900); click("#ld2TagModal"); await sleep(300);');
  add('tags-close-by-x', {}, 'await leadReady(); click("#ld2EditTagBtn"); await sleep(900); click("#ld2TagModal .ld2-tagm-close"); await sleep(300);');
  add('tags-viewer', LEAD(L.main, { variant: 'viewer' }), 'await leadReady(); await sleep(100);');
  add('en-tags-open', { lang: 'en' }, 'await leadReady(); click("#ld2EditTagBtn"); await sleep(900);');

  /* ---- sales team / owner / access ---- */
  add('sales-open', {}, 'await leadReady(); click("#ld2TeamEditBtn"); await sleep(900);');
  add('sales-open-dark', { theme: 'dark' }, 'await leadReady(); click("#ld2TeamEditBtn"); await sleep(900);');
  add('sales-pick-team', {}, 'await leadReady(); click("#ld2TeamEditBtn"); await sleep(900); pick("#ld2SmTeam", "2002"); await sleep(700);');
  add('sales-save', {}, 'await leadReady(); click("#ld2TeamEditBtn"); await sleep(900); pick("#ld2SmTeam", "2002"); await sleep(700); pick("#ld2SmAgent", "3004"); click("#ld2SalesModalSaveBtn"); await sleep(600);');
  add('sales-save-then-reload', {}, 'await leadReady(); click("#ld2TeamEditBtn"); await sleep(900); pick("#ld2SmTeam", "2002"); await sleep(700); pick("#ld2SmAgent", "3004"); click("#ld2SalesModalSaveBtn"); await sleep(600); return "__RELOAD__";');
  add('sales-no-team-lead', LEAD(L.noteam), 'await leadReady(); click("#ld2TeamEditBtn"); await sleep(900);');
  add('sales-close-by-outside', {}, 'await leadReady(); click("#ld2TeamEditBtn"); await sleep(900); click("#ld2SalesModal"); await sleep(300);');
  add('owner-modal-open', LEAD(L.noowner), 'await leadReady(); click("#ld2OwnerAddBtn"); await sleep(900);');
  add('owner-modal-open-dark', LEAD(L.noowner, { theme: 'dark' }), 'await leadReady(); click("#ld2OwnerAddBtn"); await sleep(900);');
  add('owner-modal-save', LEAD(L.noowner), 'await leadReady(); click("#ld2OwnerAddBtn"); await sleep(900); pick("#ld2OmEmployee", "1003"); click("#ld2OwnerModalSaveBtn"); await sleep(600);');
  add('owner-modal-save-then-reload', LEAD(L.noowner), 'await leadReady(); click("#ld2OwnerAddBtn"); await sleep(900); pick("#ld2OmEmployee", "1003"); click("#ld2OwnerModalSaveBtn"); await sleep(600); return "__RELOAD__";');
  add('owner-no-owner-lead', LEAD(L.noowner), 'await leadReady();');
  add('owner-viewer-no-owner', LEAD(L.noowner, { variant: 'viewer' }), 'await leadReady();');
  add('access-modal-nowf', LEAD(L.nowf), 'await leadReady(); click(".ld2-acc-add-btn"); await sleep(900);');
  add('access-modal-nowf-dark', LEAD(L.nowf, { theme: 'dark' }), 'await leadReady(); click(".ld2-acc-add-btn"); await sleep(900);');
  add('access-modal-search', LEAD(L.nowf), 'await leadReady(); click(".ld2-acc-add-btn"); await sleep(900); typeIn("#ld2AccSearch", "สม"); await sleep(400);');
  add('access-modal-search-none', LEAD(L.nowf), 'await leadReady(); click(".ld2-acc-add-btn"); await sleep(900); typeIn("#ld2AccSearch", "zzzz"); await sleep(400);');
  add('access-modal-pick-chip', LEAD(L.nowf), 'await leadReady(); click(".ld2-acc-add-btn"); await sleep(900); typeIn("#ld2AccSearch", ""); await sleep(300); win.ldPickAccSearchResult(1002); win.ldPickAccSearchResult(1003); await sleep(300);');
  add('access-modal-confirm', LEAD(L.nowf), 'await leadReady(); click(".ld2-acc-add-btn"); await sleep(900); win.ldPickAccSearchResult(1002); win.ldPickAccSearchResult(1003); await sleep(200); click("#ld2AccConfirmBtn"); await sleep(900);');
  add('access-modal-confirm-fail', LEAD(L.nowf), 'await leadReady(); click(".ld2-acc-add-btn"); await sleep(900); win.ldPickAccSearchResult(1008); await sleep(200); click("#ld2AccConfirmBtn"); await sleep(900);');
  add('access-modal-remove-chip', LEAD(L.nowf), 'await leadReady(); click(".ld2-acc-add-btn"); await sleep(900); win.ldPickAccSearchResult(1002); win.ldPickAccSearchResult(1003); await sleep(200); win.ldRemoveAccess(1002); await sleep(200);');
  add('access-modal-clear-search', LEAD(L.nowf), 'await leadReady(); click(".ld2-acc-add-btn"); await sleep(900); typeIn("#ld2AccSearch", "สม"); await sleep(300); click("#ld2AccSearchClear"); await sleep(300);');
  add('access-modal-close', LEAD(L.nowf), 'await leadReady(); click(".ld2-acc-add-btn"); await sleep(900); win.ldCloseAccessModal(); await sleep(300);');
  add('access-pop-hover', {}, 'await leadReady(); var el = $(".ld-card-team-avs"); el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true })); await sleep(400);');
  add('access-pop-hover-dark', { theme: 'dark' }, 'await leadReady(); var el = $(".ld-card-team-avs"); el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true })); await sleep(400);');
  add('access-pop-leave', {}, 'await leadReady(); var el = $(".ld-card-team-avs"); el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true })); await sleep(300); el.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true })); await sleep(500);');
  add('access-pop-close-button', {}, 'await leadReady(); var el = $(".ld-card-team-avs"); el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true })); await sleep(300); click(".ld-access-pop-close"); await sleep(300);');
  add('access-pop-me-first', LEAD(L.main), 'await leadReady(); var el = $(".ld-card-team-avs"); el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true })); await sleep(400);');

  /* ---- appointments / tasks carousel ---- */
  add('appt-next', {}, 'await leadReady(); click($(".ld2-appt-card").parentNode.querySelector("button[onclick*=ldApptNext]")); await sleep(300);');
  add('appt-next-twice', {}, 'await leadReady(); win.ldApptNext(); win.ldApptNext(); await sleep(300);');
  add('appt-prev-after-next', {}, 'await leadReady(); win.ldApptNext(); win.ldApptPrev(); await sleep(300);');
  add('appt-none', LEAD(L.nosched), 'await leadReady(); await sleep(100);');
  add('appt-add-hidden-viewer', LEAD(L.main, { variant: 'viewer' }), 'await leadReady(); await sleep(100);');
  add('appt-add-owner-variant', LEAD(L.other, { variant: 'owner' }), 'await leadReady(); await sleep(100);');

  /* ---- the contact form: channels, text, the step list, saving ---- */
  ['call_in', 'call_out', 'line', 'facebook', 'whatsapp', 'email', 'sms'].forEach(function (c) {
    add('channel-' + c, {}, 'await leadReady(); click(".ld2-channel-btn[data-channel=" + ' + q(c) + ' + "]"); await sleep(200);');
  });
  add('channel-line-dark', { theme: 'dark' }, 'await leadReady(); click(".ld2-channel-btn[data-channel=line]"); await sleep(200);');
  add('channel-drag-scroll', { w: 390, h: 844 }, 'await leadReady(); var r = $("#ld2ChannelRow"); r.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 200 })); document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1, clientX: 100 })); document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })); await sleep(300);');
  add('contact-text', {}, 'await leadReady(); typeIn("#ld2ContactTa", "โทรหาลูกค้าแล้ว นัดส่งเอกสารวันพุธ"); await sleep(200);');
  add('contact-viewer', LEAD(L.main, { variant: 'viewer' }), 'await leadReady(); click("#ld2StepBtn"); await sleep(300);');
  add('contact-other-lead-all', LEAD(L.other), 'await leadReady(); click("#ld2StepBtn"); await sleep(900);');
  add('contact-owner-variant-own', LEAD(L.main, { variant: 'owner' }), 'await leadReady(); click("#ld2StepBtn"); await sleep(900);');
  add('contact-owner-variant-other', LEAD(L.other, { variant: 'owner' }), 'await leadReady(); click("#ld2StepBtn"); await sleep(900);');
  add('step-dd-open', {}, 'await leadReady(); click("#ld2StepBtn"); await sleep(900);');
  add('step-dd-open-dark', { theme: 'dark' }, 'await leadReady(); click("#ld2StepBtn"); await sleep(900);');
  add('step-dd-search', {}, 'await leadReady(); click("#ld2StepBtn"); await sleep(900); typeIn("#ld2StepDd .ld2-fwd-dd-search input", "ตรวจ"); await sleep(300);');
  add('step-dd-pick', {}, 'await leadReady(); click("#ld2StepBtn"); await sleep(900); click($$("#ld2StepDd .ld2-prod-dd-item")[0]); await sleep(300);');
  add('step-dd-close-by-outside', {}, 'await leadReady(); click("#ld2StepBtn"); await sleep(900); click(document.body); await sleep(300);');
  add('step-dd-nowf', LEAD(L.nowf), 'await leadReady(); click("#ld2StepBtn"); await sleep(900);');
  add('step-dd-first-group-lead', LEAD(L.first), 'await leadReady(); click("#ld2StepBtn"); await sleep(900);');
  add('contact-save-toast', {}, 'await leadReady(); click(".ld2-channel-btn[data-channel=line]"); typeIn("#ld2ContactTa", "ลูกค้าสนใจดอกเบี้ยคงที่ 3 ปี"); click("#ld2ContactSaveBtn"); await toast();');
  add('contact-save-reload', {}, 'await leadReady(); markPage(); click(".ld2-channel-btn[data-channel=line]"); typeIn("#ld2ContactTa", "ลูกค้าสนใจดอกเบี้ยคงที่ 3 ปี"); click("#ld2ContactSaveBtn"); await afterReload();');
  add('contact-save-other-step-reload', {}, 'await leadReady(); markPage(); click("#ld2StepBtn"); await sleep(900); click($$("#ld2StepDd .ld2-prod-dd-item")[1]); typeIn("#ld2ContactTa", "ย้ายขั้นตอน"); click("#ld2ContactSaveBtn"); await afterReload();');
  add('contact-save-empty-reload', {}, 'await leadReady(); markPage(); click("#ld2ContactSaveBtn"); await afterReload();');
  add('contact-save-error-500', {}, 'await leadReady(); typeIn("#ld2ContactTa", "บันทึก #500"); click("#ld2ContactSaveBtn"); await sleep(900);');
  add('contact-save-error-400', {}, 'await leadReady(); typeIn("#ld2ContactTa", "บันทึก #400"); click("#ld2ContactSaveBtn"); await sleep(900);');
  add('contact-save-error-dark', { theme: 'dark' }, 'await leadReady(); typeIn("#ld2ContactTa", "บันทึก #500"); click("#ld2ContactSaveBtn"); await sleep(900);');
  add('contact-save-nowf-reload', LEAD(L.nowf), 'await leadReady(); markPage(); typeIn("#ld2ContactTa", "ติดต่อลูกค้า"); click("#ld2ContactSaveBtn"); await afterReload();');
  add('contact-closed-lead', LEAD(L.success), 'await leadReady(); typeIn("#ld2ContactTa", "x"); await sleep(200);');
  add('contact-save-reference-time-reload', {}, 'await leadReady(); markPage(); typeIn("#ld2CaDateTime", "2026-10-18T09:30"); typeIn("#ld2ContactTa", "เวลาอ้างอิง"); click("#ld2ContactSaveBtn"); await afterReload();');

  /* ---- forward the work to other people ---- */
  add('fwd-toggle-on', {}, 'await leadReady(); click("#ldForwardSlider"); await sleep(1500);');
  add('fwd-toggle-on-dark', { theme: 'dark' }, 'await leadReady(); click("#ldForwardSlider"); await sleep(1500);');
  add('fwd-toggle-on-390', { w: 390, h: 844 }, 'await leadReady(); click("#ldForwardSlider"); await sleep(1500);');
  add('fwd-toggle-off', {}, 'await leadReady(); click("#ldForwardSlider"); await sleep(1500); click("#ldForwardSlider"); await sleep(300);');
  add('fwd-group-dd-open', {}, 'await leadReady(); click("#ldForwardSlider"); await sleep(1500); click("#ld2FwdGroupBtn1"); await sleep(300);');
  add('fwd-pick-parallel-group', {}, 'await leadReady(); click("#ldForwardSlider"); await sleep(1500); click("#ld2FwdGroupBtn1"); await sleep(200); click("#ld2FwdGroupDd1 .ld2-prod-dd-item[data-val=\\"103\\"]"); await sleep(900);');
  add('fwd-add-card', {}, 'await leadReady(); click("#ldForwardSlider"); await sleep(1500); click("#ld2FwdGroupBtn1"); await sleep(200); click("#ld2FwdGroupDd1 .ld2-prod-dd-item[data-val=\\"103\\"]"); await sleep(900); click("#ldFwdAddBtn"); await sleep(1500);');
  add('fwd-add-card-then-remove', {}, 'await leadReady(); click("#ldForwardSlider"); await sleep(1500); click("#ld2FwdGroupBtn1"); await sleep(200); click("#ld2FwdGroupDd1 .ld2-prod-dd-item[data-val=\\"103\\"]"); await sleep(900); click("#ldFwdAddBtn"); await sleep(1500); click($$(".ld2-fwd-trash")[0]); await sleep(500);');
  add('fwd-step-dd-open', {}, 'await leadReady(); click("#ldForwardSlider"); await sleep(1500); click("#ld2FwdStepBtn1"); await sleep(300);');
  add('fwd-to-dd-open', {}, 'await leadReady(); click("#ldForwardSlider"); await sleep(1500); click("#ld2FwdToBtn1"); await sleep(300);');
  add('fwd-to-dd-search', {}, 'await leadReady(); click("#ldForwardSlider"); await sleep(1500); click("#ld2FwdToBtn1"); await sleep(300); typeIn("#ld2FwdToDd1 .ld2-fwd-dd-search input", "สม"); await sleep(300);');
  add('fwd-submit-default-toast', {}, 'await leadReady(); click("#ldForwardSlider"); await sleep(1500); click("#ld2ContactSaveBtn"); await toast();');
  add('fwd-submit-default-reload', {}, 'await leadReady(); markPage(); click("#ldForwardSlider"); await sleep(1500); typeIn("#ld2ContactTa", "ส่งต่อให้ทีมถัดไป"); click("#ld2ContactSaveBtn"); await afterReload();');
  add('fwd-submit-incomplete', {}, 'await leadReady(); click("#ldForwardSlider"); await sleep(1500); click("#ld2FwdGroupBtn1"); await sleep(200); click("#ld2FwdGroupDd1 .ld2-prod-dd-item[data-val=\\"102\\"]"); await sleep(900); $$("#ld2FwdToDd1 .ld2-prod-dd-item").forEach(function (e) { e.classList.remove("ld2-dd-selected"); }); click("#ld2ContactSaveBtn"); await sleep(600);');
  add('fwd-submit-error-500', {}, 'await leadReady(); click("#ldForwardSlider"); await sleep(1500); typeIn("#ld2ContactTa", "ส่งต่อ #500"); click("#ld2ContactSaveBtn"); await sleep(900);');
  add('fwd-submit-error-400', {}, 'await leadReady(); click("#ldForwardSlider"); await sleep(1500); typeIn("#ld2ContactTa", "ส่งต่อ #400"); click("#ld2ContactSaveBtn"); await sleep(900);');
  add('fwd-nowf', LEAD(L.nowf), 'await leadReady(); click("#ldForwardSlider"); await sleep(1500);');
  add('fwd-nowf-submit-reload', LEAD(L.nowf), 'await leadReady(); markPage(); click("#ldForwardSlider"); await sleep(1500); click("#ld2ContactSaveBtn"); await afterReload();');
  add('fwd-first-group-lead', LEAD(L.first), 'await leadReady(); click("#ldForwardSlider"); await sleep(1500);');
  add('fwd-viewer', LEAD(L.main, { variant: 'viewer' }), 'await leadReady(); await sleep(100);');
  add('fwd-owner-variant-other', LEAD(L.other, { variant: 'owner' }), 'await leadReady(); await sleep(100);');
  add('fwd-closed-lead', LEAD(L.success), 'await leadReady(); await sleep(100);');

  /* ---- return, close the step group, close the lead ---- */
  add('return-open', {}, 'await leadReady(); click("#ldBtnReturnStep"); await sleep(1200);');
  add('return-open-dark', { theme: 'dark' }, 'await leadReady(); click("#ldBtnReturnStep"); await sleep(1200);');
  add('return-open-390', { w: 390, h: 844 }, 'await leadReady(); click("#ldBtnReturnStep"); await sleep(1200);');
  add('return-pick-group', {}, 'await leadReady(); click("#ldBtnReturnStep"); await sleep(1200); pick("#ld2RtGroupSel", "2"); await sleep(300);');
  add('return-no-reason', {}, 'await leadReady(); click("#ldBtnReturnStep"); await sleep(1200); click("#ld2RtSubmitBtn"); await sleep(600);');
  add('return-confirm-toast', {}, 'await leadReady(); click("#ldBtnReturnStep"); await sleep(1200); typeIn("#ld2RtRemark", "เอกสารไม่ครบ"); click("#ld2RtSubmitBtn"); await toast();');
  add('return-confirm-reload', {}, 'await leadReady(); markPage(); click("#ldBtnReturnStep"); await sleep(1200); typeIn("#ld2RtRemark", "เอกสารไม่ครบ"); click("#ld2RtSubmitBtn"); await afterReload();');
  add('return-confirm-error-500', {}, 'await leadReady(); click("#ldBtnReturnStep"); await sleep(1200); typeIn("#ld2RtRemark", "ส่งกลับ #500"); click("#ld2RtSubmitBtn"); await sleep(900);');
  add('return-close-by-cancel', {}, 'await leadReady(); click("#ldBtnReturnStep"); await sleep(1200); win.ldCloseReturnStepModal(); await sleep(300);');
  add('return-first-group-lead-disabled', LEAD(L.first), 'await leadReady(); await sleep(100);');
  add('return-viewer', LEAD(L.main, { variant: 'viewer' }), 'await leadReady(); await sleep(100);');
  add('return-owner-variant-other', LEAD(L.other, { variant: 'owner' }), 'await leadReady(); await sleep(100);');
  add('return-single-destination', LEAD(L.g2), 'await leadReady(); click("#ldBtnReturnStep"); await sleep(1200);');
  add('closegroup-open', {}, 'await leadReady(); click("#ldBtnCloseGroup"); await sleep(400);');
  add('closegroup-open-dark', { theme: 'dark' }, 'await leadReady(); click("#ldBtnCloseGroup"); await sleep(400);');
  add('closegroup-confirm-toast', {}, 'await leadReady(); click("#ldBtnCloseGroup"); await sleep(400); click("#ld2CloseGroupModal button[onclick*=ldConfirmCloseGroup]"); await toast();');
  add('closegroup-confirm-reload', {}, 'await leadReady(); markPage(); click("#ldBtnCloseGroup"); await sleep(400); click("#ld2CloseGroupModal button[onclick*=ldConfirmCloseGroup]"); await afterReload();');
  add('closegroup-confirm-error', LEAD(21), 'await leadReady(); click("#ldBtnCloseGroup"); await sleep(400); click("#ld2CloseGroupModal button[onclick*=ldConfirmCloseGroup]"); await sleep(900);');
  add('closegroup-cancel', {}, 'await leadReady(); click("#ldBtnCloseGroup"); await sleep(400); click("#ld2CloseGroupModal button[onclick*=ldCloseGroupModal]"); await sleep(300);');
  add('closegroup-hidden-nowf', LEAD(L.nowf), 'await leadReady(); await sleep(100);');
  add('closelead-open', {}, 'await leadReady(); click("#ldBtnCloseLead"); await sleep(400);');
  add('closelead-open-dark', { theme: 'dark' }, 'await leadReady(); click("#ldBtnCloseLead"); await sleep(400);');
  add('closelead-pick-fail', {}, 'await leadReady(); click("#ldBtnCloseLead"); await sleep(400); click("#ld2CloseOptFail"); await sleep(300);');
  add('closelead-confirm-success-toast', { wait: 250 }, 'await leadReady(); click("#ldBtnCloseLead"); await sleep(400); click("#ld2CloseLeadConfirmBtn"); await toast();');
  add('closelead-confirm-success-reload', {}, 'await leadReady(); markPage(); click("#ldBtnCloseLead"); await sleep(400); click("#ld2CloseLeadConfirmBtn"); await afterReload();');
  add('closelead-confirm-fail-reload', {}, 'await leadReady(); markPage(); click("#ldBtnCloseLead"); await sleep(400); click("#ld2CloseOptFail"); click("#ld2CloseLeadConfirmBtn"); await afterReload();');
  add('closelead-confirm-error-alert', LEAD(21), 'await leadReady(); stubDialogs(); click("#ldBtnCloseLead"); await sleep(400); click("#ld2CloseLeadConfirmBtn"); await sleep(900);');
  add('closelead-cancel', {}, 'await leadReady(); click("#ldBtnCloseLead"); await sleep(400); click("#ld2CloseLeadNotNowBtn"); await sleep(300);');
  add('closelead-viewer', LEAD(L.main, { variant: 'viewer' }), 'await leadReady(); await sleep(100);');
  add('closelead-owner-variant-other', LEAD(L.other, { variant: 'owner' }), 'await leadReady(); await sleep(100);');

  /* ---- products ---- */
  add('prod-add-open', {}, 'await leadReady(); click("#ld2AddProdBtn"); await sleep(900);');
  add('prod-add-open-dark', { theme: 'dark' }, 'await leadReady(); click("#ld2AddProdBtn"); await sleep(900);');
  add('prod-add-pick-type', {}, 'await leadReady(); click("#ld2AddProdBtn"); await sleep(900); pick("#ld2PmType", "5001"); await sleep(700);');
  add('prod-add-pick-product', {}, 'await leadReady(); click("#ld2AddProdBtn"); await sleep(900); pick("#ld2PmType", "5001"); await sleep(700); pick("#ld2PmProduct", "6002"); await sleep(300);');
  add('prod-add-save-reload', {}, 'await leadReady(); markPage(); click("#ld2AddProdBtn"); await sleep(900); pick("#ld2PmType", "5001"); await sleep(700); pick("#ld2PmProduct", "6002"); click("#ld2PmSaveBtn"); await afterReload();');
  add('prod-add-cancel', {}, 'await leadReady(); click("#ld2AddProdBtn"); await sleep(900); win.ldCloseAddProdModal(); await sleep(300);');
  add('prod-add-viewer', LEAD(L.main, { variant: 'viewer' }), 'await leadReady(); await sleep(100);');
  add('prod-delete', LEAD(1), 'await leadReady(); click($("#ld2ProdList img[onclick*=ldDeleteMaterial]")); await sleep(600);');
  add('prod-delete-then-reload', LEAD(1), 'await leadReady(); click($("#ld2ProdList img[onclick*=ldDeleteMaterial]")); await sleep(600); return "__RELOAD__";');
  add('prod-list-many', LEAD(2), 'await leadReady(); await sleep(100);');
  add('prod-quote-menu-open', LEAD(1), 'await leadReady(); click($(".ld2-prod-btn")); await sleep(300);');
  add('prod-quote-menu-pick-rv', LEAD(1), 'await leadReady(); stubDialogs(); click($(".ld2-prod-btn")); await sleep(300); click($(".ld2-prod-dd.show .ld2-prod-dd-item[data-action=rv]")); await sleep(400);');
  add('prod-quote-menu-pick-quote', LEAD(1), 'await leadReady(); click($(".ld2-prod-btn")); await sleep(300); click($(".ld2-prod-dd.show .ld2-prod-dd-item[data-action=booking]")); await sleep(300);');
  add('prod-quote-static-menu', LEAD(L.nowf), 'await leadReady(); click($("#ld2TabContact .ld2-prod-action .ld2-prod-btn")); await sleep(300);');

  /* ---- attachments (supporting documents) and sales documents ---- */
  var PDF = 'new File(["%PDF-1.4 mock"], "contract.pdf", { type: "application/pdf" })';
  add('docs-upload-ok', {}, 'await leadReady(); await tab("docs"); setFiles("#ld2FileInput", [' + PDF + ']); await sleep(1400);');
  add('docs-upload-ok-after', {}, 'await leadReady(); await tab("docs"); setFiles("#ld2FileInput", [' + PDF + ']); await sleep(3500);');
  add('docs-upload-multiple', {}, 'await leadReady(); await tab("docs"); setFiles("#ld2FileInput", [' + PDF + ', new File(["x"], "scan.png", { type: "image/png" })]); await sleep(3800);');
  add('docs-upload-not-allowed', {}, 'await leadReady(); await tab("docs"); setFiles("#ld2FileInput", [new File(["x"], "virus.exe", { type: "application/x-msdownload" })]); await sleep(800);');
  add('docs-upload-not-allowed-dark', { theme: 'dark' }, 'await leadReady(); await tab("docs"); setFiles("#ld2FileInput", [new File(["x"], "virus.exe", { type: "application/x-msdownload" })]); await sleep(800);');
  add('docs-upload-failed', {}, 'await leadReady(); await tab("docs"); setFiles("#ld2FileInput", [new File(["x"], "bad.pdf", { type: "application/pdf" })]); await sleep(1500);');
  add('docs-upload-partial', {}, 'await leadReady(); await tab("docs"); setFiles("#ld2FileInput", [' + PDF + ', new File(["x"], "bad.pdf", { type: "application/pdf" })]); await sleep(2000);');
  add('docs-upload-unverified', {}, 'await leadReady(); await tab("docs"); setFiles("#ld2FileInput", [new File(["x"], "unverified.pdf", { type: "application/pdf" })]); await sleep(1500);');
  add('docs-upload-button', {}, 'await leadReady(); await tab("docs"); var clicked = 0; $("#ld2FileInput").addEventListener("click", function (e) { e.preventDefault(); clicked++; }); click("#ld2UploadDocBtn"); await sleep(200); note("input-click", clicked);');
  add('docs-upload-hidden-closed-lead', LEAD(L.success), 'await leadReady(); await tab("docs");');
  add('docs-upload-hidden-viewer', LEAD(L.main, { variant: 'viewer' }), 'await leadReady(); await tab("docs");');
  add('docs-download', {}, 'await leadReady(); stubDialogs(); await tab("docs"); click($(".ld2-dl-btn")); await sleep(900);');
  add('docs-delete-call', {}, 'await leadReady(); stubDialogs(); await tab("docs"); win.ldDeleteDoc(0); await sleep(900);');
  add('docs-delete-call-bad-index', {}, 'await leadReady(); stubDialogs(); await tab("docs"); win.ldDeleteDoc(9); await sleep(300);');
  add('saledocs-download', {}, 'await leadReady(); stubDialogs(); await tab("saledocs"); click($(".ld2-sale-dl-btn")); await sleep(400);');
  add('saledocs-download-second', {}, 'await leadReady(); stubDialogs(); await tab("saledocs"); click($$(".ld2-sale-dl-btn")[1]); await sleep(400);');
  add('en-docs', { lang: 'en' }, 'await leadReady(); await tab("docs");');

  /* ---- the history panel: filter, collapse, empty ---- */
  add('hist-filter-open', {}, 'await leadReady(); click("#ld2HistFilterBtn"); await sleep(1500);');
  add('hist-filter-open-dark', { theme: 'dark' }, 'await leadReady(); click("#ld2HistFilterBtn"); await sleep(1500);');
  add('hist-filter-open-390', { w: 390, h: 844 }, 'await leadReady(); click("#ld2HistFilterBtn"); await sleep(1500);');
  add('en-hist-filter-open', { lang: 'en' }, 'await leadReady(); click("#ld2HistFilterBtn"); await sleep(1500);');
  add('hist-filter-open-nowf', LEAD(L.nowf), 'await leadReady(); click("#ld2HistFilterBtn"); await sleep(1500);');
  add('hist-filter-apply-group', {}, 'await leadReady(); click("#ld2HistFilterBtn"); await sleep(1500); pick("#ld2HFGroup", "104"); await sleep(900); click("#ld2HFApply"); await sleep(600);');
  add('hist-filter-apply-step', {}, 'await leadReady(); click("#ld2HistFilterBtn"); await sleep(1500); pick("#ld2HFGroup", "101"); await sleep(900); pick("#ld2HFStep", "10102"); click("#ld2HFApply"); await sleep(600);');
  add('hist-filter-apply-owner', {}, 'await leadReady(); click("#ld2HistFilterBtn"); await sleep(1500); pick("#ld2HFOwner", "1002"); click("#ld2HFApply"); await sleep(600);');
  add('hist-filter-apply-channel-note', {}, 'await leadReady(); click("#ld2HistFilterBtn"); await sleep(1500); click("#ld2HFAll"); await sleep(100); click("#ld2HistFilterOverlay input[data-val=manual]"); click("#ld2HFApply"); await sleep(600);');
  add('hist-filter-apply-channel-two', {}, 'await leadReady(); click("#ld2HistFilterBtn"); await sleep(1500); click("#ld2HFAll"); await sleep(100); click("#ld2HistFilterOverlay input[data-val=line]"); click("#ld2HistFilterOverlay input[data-val=sms]"); click("#ld2HFApply"); await sleep(600);');
  add('hist-filter-apply-none-found', {}, 'await leadReady(); click("#ld2HistFilterBtn"); await sleep(1500); click("#ld2HFAll"); await sleep(100); click("#ld2HistFilterOverlay input[data-val=forward]"); pick("#ld2HFOwner", "1008"); click("#ld2HFApply"); await sleep(600);');
  add('hist-filter-all-checkbox-toggle', {}, 'await leadReady(); click("#ld2HistFilterBtn"); await sleep(1500); click("#ld2HFAll"); await sleep(100); click("#ld2HistFilterOverlay input[data-val=sms]"); await sleep(200);');
  add('hist-filter-clear', {}, 'await leadReady(); click("#ld2HistFilterBtn"); await sleep(1500); click("#ld2HFAll"); pick("#ld2HFOwner", "1002"); await sleep(200); click("#ld2HFClear"); await sleep(300);');
  add('hist-filter-esc', {}, 'await leadReady(); click("#ld2HistFilterBtn"); await sleep(1500); key("Escape"); await sleep(300);');
  add('hist-filter-outside', {}, 'await leadReady(); click("#ld2HistFilterBtn"); await sleep(1500); click("#ld2HistFilterOverlay"); await sleep(300);');
  add('hist-filter-close-x', {}, 'await leadReady(); click("#ld2HistFilterBtn"); await sleep(1500); click("#ld2HFClose"); await sleep(300);');
  add('hist-filter-reopen-restores', {}, 'await leadReady(); click("#ld2HistFilterBtn"); await sleep(1500); pick("#ld2HFOwner", "1002"); click("#ld2HistFilterOverlay input[data-val=sms]"); click("#ld2HFApply"); await sleep(500); click("#ld2HistFilterBtn"); await sleep(1500);');
  add('hist-filter-then-reload', {}, 'await leadReady(); click("#ld2HistFilterBtn"); await sleep(1500); pick("#ld2HFOwner", "1002"); click("#ld2HFApply"); await sleep(500); return "__RELOAD__";');
  add('hist-filter-viewer', LEAD(L.main, { variant: 'viewer' }), 'await leadReady(); click("#ld2HistFilterBtn"); await sleep(1500);');
  add('hist-panel-collapse', {}, 'await leadReady(); click("#ld2PanelToggleBtn"); await sleep(400);');
  add('hist-panel-collapse-dark', { theme: 'dark' }, 'await leadReady(); click("#ld2PanelToggleBtn"); await sleep(400);');
  add('hist-panel-collapse-then-expand', {}, 'await leadReady(); click("#ld2PanelToggleBtn"); await sleep(300); click("#ld2PanelToggleBtn"); await sleep(400);');
  add('hist-empty', LEAD(L.nohist), 'await leadReady(); await sleep(100);');
  add('hist-empty-dark', LEAD(L.nohist, { theme: 'dark' }), 'await leadReady(); await sleep(100);');
  add('hist-nowf-lead', LEAD(L.nowf), 'await leadReady(); await sleep(100);');
  add('hist-long-390', LEAD(L.g7, { w: 390, h: 844 }), 'await leadReady(); await sleep(100);');

  /* ---- the table view of the history ---- */
  add('tv-open', {}, 'await leadReady(); click("#ld2GripBtn"); await sleep(1500);');
  add('tv-open-dark', { theme: 'dark' }, 'await leadReady(); click("#ld2GripBtn"); await sleep(1500);');
  add('tv-open-390', { w: 390, h: 844 }, 'await leadReady(); click("#ld2GripBtn"); await sleep(1500);');
  add('tv-open-1920', { w: 1920, h: 1080 }, 'await leadReady(); click("#ld2GripBtn"); await sleep(1500);');
  add('en-tv-open', { lang: 'en' }, 'await leadReady(); click("#ld2GripBtn"); await sleep(1500);');
  add('tv-back', {}, 'await leadReady(); click("#ld2GripBtn"); await sleep(1500); click(".ld2-tv-back"); await sleep(400);');
  add('tv-group-collapse', {}, 'await leadReady(); click("#ld2GripBtn"); await sleep(1500); click($(".ld2-tv-group-head")); await sleep(300);');
  add('tv-restore-after-reload', {}, 'await leadReady(); click("#ld2GripBtn"); await sleep(1500); return "__RELOAD__";');
  add('tv-restore-then-back-reload', {}, 'await leadReady(); click("#ld2GripBtn"); await sleep(1500); click(".ld2-tv-back"); await sleep(300); return "__RELOAD__";');
  [['g1', L.g1], ['g2', L.g2], ['g12', L.g12], ['nowf', L.nowf], ['success', L.success], ['lost', L.lost], ['sold', L.sold], ['first', L.first], ['nohist', L.nohist]].forEach(function (p) {
    add('tv-lead-' + p[0], LEAD(p[1]), 'await leadReady(); click("#ld2GripBtn"); await sleep(1700);');
  });
  add('tv-lead-mid-dark', LEAD(7, { theme: 'dark' }), 'await leadReady(); click("#ld2GripBtn"); await sleep(1700);');
  add('tv-noactivity', LEAD(L.main, { variant: 'noactivity' }), 'await leadReady(); await sleep(100);');
  add('tv-viewer', LEAD(L.main, { variant: 'viewer' }), 'await leadReady(); click("#ld2GripBtn"); await sleep(1500);');
  add('tv-owner-variant-other', LEAD(7, { variant: 'owner' }), 'await leadReady(); click("#ld2GripBtn"); await sleep(1500);');
  add('tv-end-step-modal', LEAD(7), 'await leadReady(); click("#ld2GripBtn"); await sleep(1700); click($(".ld2-tv-end-btn")); await sleep(500);');
  add('tv-end-step-modal-dark', LEAD(7, { theme: 'dark' }), 'await leadReady(); click("#ld2GripBtn"); await sleep(1700); click($(".ld2-tv-end-btn")); await sleep(500);');
  add('tv-end-step-submit-toast', LEAD(7), 'await leadReady(); click("#ld2GripBtn"); await sleep(1700); click($(".ld2-tv-end-btn")); await sleep(500); typeIn("#ld2MsText", "จบขั้นตอน"); click("#ld2MsSubmitBtn"); await toast();');
  add('tv-end-step-submit-reload', LEAD(7), 'await leadReady(); markPage(); click("#ld2GripBtn"); await sleep(1700); click($(".ld2-tv-end-btn")); await sleep(500); typeIn("#ld2MsText", "จบขั้นตอน"); click("#ld2MsSubmitBtn"); await afterReload();');
  add('tv-end-step-submit-error', LEAD(7), 'await leadReady(); click("#ld2GripBtn"); await sleep(1700); click($(".ld2-tv-end-btn")); await sleep(500); typeIn("#ld2MsText", "#500"); click("#ld2MsSubmitBtn"); await sleep(900);');
  add('tv-end-step-cancel', LEAD(7), 'await leadReady(); click("#ld2GripBtn"); await sleep(1700); click($(".ld2-tv-end-btn")); await sleep(500); click("#ld2MsCancelBtn"); await sleep(300);');
  add('tv-end-step-outside', LEAD(7), 'await leadReady(); click("#ld2GripBtn"); await sleep(1700); click($(".ld2-tv-end-btn")); await sleep(500); click("#ld2MoveStepOverlay"); await sleep(300);');
  add('tv-end-step-channel', LEAD(7), 'await leadReady(); click("#ld2GripBtn"); await sleep(1700); click($(".ld2-tv-end-btn")); await sleep(500); click(".ld2-ms-tab[data-channel=line]"); await sleep(200);');
  add('tv-end-step-owner-other', LEAD(7, { variant: 'owner' }), 'await leadReady(); click("#ld2GripBtn"); await sleep(1700); await sleep(100);');
  add('tv-add-contact-modal', {}, 'await leadReady(); click("#ld2GripBtn"); await sleep(1700); click($(".ld2-tv-add-btn, .ld2-tv-addct-btn")); await sleep(500);');
  add('tv-add-contact-modal-dark', { theme: 'dark' }, 'await leadReady(); click("#ld2GripBtn"); await sleep(1700); click($(".ld2-tv-add-btn, .ld2-tv-addct-btn")); await sleep(500);');
  add('tv-add-contact-submit-reload', {}, 'await leadReady(); markPage(); click("#ld2GripBtn"); await sleep(1700); click($(".ld2-tv-add-btn, .ld2-tv-addct-btn")); await sleep(500); typeIn("#ld2MsText", "เพิ่มการติดต่อ"); click("#ld2MsSubmitBtn"); await afterReload();');
  add('tv-next-group-modal', LEAD(59), 'await leadReady(); click("#ld2GripBtn"); await sleep(1700); click($(".ld2-tv-end-btn")); await sleep(1200);');
  add('tv-next-group-modal-dark', LEAD(59, { theme: 'dark' }), 'await leadReady(); click("#ld2GripBtn"); await sleep(1700); click($(".ld2-tv-end-btn")); await sleep(1200);');
  add('tv-next-group-confirm-toast', LEAD(59), 'await leadReady(); click("#ld2GripBtn"); await sleep(1700); click($(".ld2-tv-end-btn")); await sleep(1200); click("#ld2NgSubmitBtn"); await toast();');
  add('tv-next-group-confirm-reload', LEAD(59), 'await leadReady(); markPage(); click("#ld2GripBtn"); await sleep(1700); click($(".ld2-tv-end-btn")); await sleep(1200); click("#ld2NgSubmitBtn"); await afterReload();');
  add('tv-next-group-no-assignee', LEAD(59), 'await leadReady(); click("#ld2GripBtn"); await sleep(1700); click($(".ld2-tv-end-btn")); await sleep(1200); pick("#ld2NgAssigneeSel", ""); click("#ld2NgSubmitBtn"); await sleep(600);');
  add('tv-next-group-cancel', LEAD(59), 'await leadReady(); click("#ld2GripBtn"); await sleep(1700); click($(".ld2-tv-end-btn")); await sleep(1200); click("#ld2NextGroupModal .ld2-ng-cancel"); await sleep(300);');
  add('tv-close-lead-button', LEAD(4), 'await leadReady(); click("#ld2GripBtn"); await sleep(1700); click($(".ld2-tv-close-btn")); await sleep(500);');
  add('tv-close-lead-button-owner-other', LEAD(2, { variant: 'owner' }), 'await leadReady(); click("#ld2GripBtn"); await sleep(1700); await sleep(100);');

  /* ---- the main tab: update confirmation, saving, customer type, phone, address, photo ---- */
  add('main-save-confirm-open', {}, 'await leadReady(); await tab("main"); click("#ld2SaveMainBtn"); await sleep(400);');
  add('main-save-confirm-open-dark', { theme: 'dark' }, 'await leadReady(); await tab("main"); click("#ld2SaveMainBtn"); await sleep(400);');
  add('main-save-confirm-cancel', {}, 'await leadReady(); await tab("main"); click("#ld2SaveMainBtn"); await sleep(300); click("#ld2UpdCancelBtn"); await sleep(300);');
  add('main-save-confirm-outside', {}, 'await leadReady(); await tab("main"); click("#ld2SaveMainBtn"); await sleep(300); click("#ld2UpdConfirmModal"); await sleep(300);');
  add('main-save-ok-swal', {}, 'await leadReady(); await tab("main"); click("#ld2SaveMainBtn"); await sleep(300); click("#ld2UpdOkBtn"); await sleep(900);');
  add('main-save-ok-refresh', {}, 'await leadReady(); await tab("main"); typeIn("#ld2MName", "สมศักดิ์ ทดสอบ"); click("#ld2SaveMainBtn"); await sleep(300); click("#ld2UpdOkBtn"); await sleep(3600);');
  add('main-save-name-required', {}, 'await leadReady(); await tab("main"); typeIn("#ld2MName", ""); click("#ld2SaveMainBtn"); await sleep(700);');
  add('main-save-error', {}, 'await leadReady(); await tab("main"); typeIn("#ld2MRemark", "#500"); click("#ld2SaveMainBtn"); await sleep(300); click("#ld2UpdOkBtn"); await sleep(900);');
  // (the page gets an answer that is not JSON: no servlet answers like that — it always wrote JSON — so a --live run skips it; the gateway variant below is the situation a real service can be in)
  add('main-save-network-error', { live: false }, 'await leadReady(); await tab("main"); typeIn("#ld2MRemark", "#net"); click("#ld2SaveMainBtn"); await sleep(300); click("#ld2UpdOkBtn"); await sleep(900);');
  add('main-save-gateway-error', {}, 'await leadReady(); await tab("main"); typeIn("#ld2MRemark", "#gw"); click("#ld2SaveMainBtn"); await sleep(300); click("#ld2UpdOkBtn"); await sleep(900);');
  add('main-save-company-ok', LEAD(L.company), 'await leadReady(); await tab("main"); click("#ld2SaveMainBtn"); await sleep(300); click("#ld2UpdOkBtn"); await sleep(900);');
  add('main-save-viewer-hidden', LEAD(L.main, { variant: 'viewer' }), 'await leadReady(); await tab("main");');
  add('main-customer-type-company', {}, 'await leadReady(); await tab("main"); click("input[name=ctype2][value=juristic]"); await sleep(300);');
  add('main-customer-type-back', {}, 'await leadReady(); await tab("main"); click("input[name=ctype2][value=juristic]"); await sleep(200); click("input[name=ctype2][value=person]"); await sleep(300);');
  add('main-gender-male', {}, 'await leadReady(); await tab("main"); click("input[name=gender2][value=ชาย]"); await sleep(200);');
  add('main-phone-typing', {}, 'await leadReady(); await tab("main"); typeIn("#ld2MPhone", "0812345678"); await sleep(300);');
  add('main-phone-code-change', {}, 'await leadReady(); await tab("main"); await sleep(600); pick("#ld2MPhoneCode", "JPN"); await sleep(300); typeIn("#ld2MPhone", "09012345678"); await sleep(300);');
  add('main-country-change', {}, 'await leadReady(); await tab("main"); await sleep(600); pick("#ld2MCountry", "SGP"); await sleep(400);');
  add('main-contact-phones-formatting', {}, 'await leadReady(); await tab("main"); click($$(".ld2-form-section-head")[1]); await sleep(300); typeIn("#ld2CPhone1", "0899998888"); typeIn("#ld2CPhone2", "0811112222"); await sleep(300);');
  add('main-geo-province', {}, 'await leadReady(); await tab("main"); click($$(".ld2-form-section-head")[4]); await sleep(1500); pick("#ld2AdrCityId", "P03"); await sleep(1200);');
  add('main-geo-district', {}, 'await leadReady(); await tab("main"); click($$(".ld2-form-section-head")[4]); await sleep(1500); pick("#ld2AdrCityId", "P03"); await sleep(1200); pick("#ld2AdrDistrictId", "P03D2"); await sleep(1200);');
  add('main-geo-subdistrict-zip', {}, 'await leadReady(); await tab("main"); click($$(".ld2-form-section-head")[4]); await sleep(1500); pick("#ld2AdrCityId", "P03"); await sleep(1200); pick("#ld2AdrDistrictId", "P03D2"); await sleep(1200); pick("#ld2AdrSubDistrict", "P03D2S3"); await sleep(600);');
  add('main-geo-send-address', {}, 'await leadReady(); await tab("main"); click($$(".ld2-form-section-head")[4]); await sleep(1500); pick("#ld2AdrSendCityId", "P02"); await sleep(1200);');
  add('main-address-section-open-dark', { theme: 'dark' }, 'await leadReady(); await tab("main"); click($$(".ld2-form-section-head")[4]); await sleep(1200);');
  add('main-avatar-ok', {}, 'await leadReady(); await tab("main"); setFiles("#ld2AvatarInput", [await pngFile("me.png", 600, 600)]); await sleep(1200);');
  add('main-avatar-too-small', {}, 'await leadReady(); await tab("main"); setFiles("#ld2AvatarInput", [await pngFile("me.png", 300, 300)]); await sleep(900);');
  add('main-avatar-wrong-type', {}, 'await leadReady(); await tab("main"); setFiles("#ld2AvatarInput", [new File(["x"], "me.gif", { type: "image/gif" })]); await sleep(500);');
  add('main-avatar-too-big', {}, 'await leadReady(); await tab("main"); setFiles("#ld2AvatarInput", [new File([new Uint8Array(3 * 1024 * 1024)], "big.png", { type: "image/png" })]); await sleep(500);');
  add('main-avatar-server-fails', {}, 'await leadReady(); await tab("main"); setFiles("#ld2AvatarInput", [await pngFile("fail.png", 600, 600)]); await sleep(1200);');
  add('main-load-company-fields', LEAD(L.company), 'await leadReady(); await tab("main"); click($$(".ld2-form-section-head")[3]); await sleep(400);');

  /* ---- the extra-information tab: saving ---- */
  add('extra-save-cs-ok', {}, 'await leadReady(); await tab("extra"); click("#ld2CsSaveBtn"); await sleep(700);');
  add('extra-save-cs-error', {}, 'await leadReady(); await tab("extra"); typeIn("#ld2CsDescProperty", "#500"); click("#ld2CsSaveBtn"); await sleep(700);');
  add('extra-save-cs-network', { live: false }, 'await leadReady(); await tab("extra"); typeIn("#ld2CsDescProperty", "#net"); click("#ld2CsSaveBtn"); await sleep(700);');
  add('extra-save-cs-gateway', {}, 'await leadReady(); await tab("extra"); typeIn("#ld2CsDescProperty", "#gw"); click("#ld2CsSaveBtn"); await sleep(700);');
  add('extra-save-pls-ok', {}, 'await leadReady(); await tab("extra"); await sub("pls"); click("#ld2PlsSaveBtn"); await sleep(700);');
  add('extra-save-survey-ok', {}, 'await leadReady(); await tab("extra"); await sub("survey"); click("#ld2SvSaveBtn"); await sleep(700);');
  add('extra-save-x2-ok', {}, 'await leadReady(); await tab("extra"); await sub("extra2"); await x2("asset"); click("#ld2X2AssetSaveBtn"); await sleep(700);');
  add('extra-save-closed-hidden', LEAD(L.success), 'await leadReady(); await tab("extra"); await sub("survey");');
  add('extra-cs-edit-fields', {}, 'await leadReady(); await tab("extra"); typeIn("#ld2CsDesiredAmount", "2500000"); click("input[name=vip][value=N-VIP]"); pick("#ld2CsLoanType", "refinance"); await sleep(400);');
  add('extra-survey-status-other', {}, 'await leadReady(); await tab("extra"); await sub("survey"); click("input[name=svStatus][value=\\"อื่นๆ\\"]"); await sleep(300);');
  add('extra-survey-checkbox-other', {}, 'await leadReady(); await tab("extra"); await sub("survey"); click("#svQ6OtherCb"); await sleep(300);');
  add('extra-ls-district-cascade', {}, 'await leadReady(); await tab("extra"); await sub("ls"); await sleep(1200); pick("#ld2LsCity", "P05"); await sleep(1200);');
  add('extra-other-lead-fills', LEAD(L.other), 'await leadReady(); await tab("extra"); await sub("crm");');
  add('hist-filter-group-dd-open', {}, 'await leadReady(); click("#ld2HistFilterBtn"); await sleep(1500); click($$("#ld2HistFilterOverlay .ld2-csel-btn")[0]); await sleep(300);');

  /* ---- the work modal (components/work_modal.xhtml, page=lead_detail): add / view / edit an appointment or a task ---- */
  // (lead 29: appointments cancel · scheduled all-day · re-schedule, tasks doing · success all-day; lead 129 has none; 30 is closed (SUCCESS); 108 has no workflow)
  var WM_FILL = 'typeIn("#ld2AwSubject", "นัดพบลูกค้าเพื่อเซ็นสัญญา"); typeIn("#ld2AwDetail", "เตรียมเอกสารตัวจริงมาด้วย"); typeIn("#ld2AwDate", "2026-10-28"); typeIn("#ld2AwTime", "14:30");';
  var WM_DONE = 'await waitFor(function () { return !!$("#wmSuccessOverlay.show"); }, 6000); await sleep(200);';
  add('wm-add-appt-open', {}, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900);');
  add('wm-add-appt-open-dark', { theme: 'dark' }, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900);');
  add('wm-add-appt-open-390', { w: 390, h: 844 }, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900);');
  add('wm-add-appt-open-dark-390', { theme: 'dark', w: 390, h: 844 }, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900);');
  add('wm-en-add-appt-open', { lang: 'en' }, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900);');
  add('wm-add-task-open', {}, 'await leadReady(); click("#ld2AddWorkBtn"); await sleep(900);');
  add('wm-add-task-open-dark', { theme: 'dark' }, 'await leadReady(); click("#ld2AddWorkBtn"); await sleep(900);');
  add('wm-en-add-task-open', { lang: 'en' }, 'await leadReady(); click("#ld2AddWorkBtn"); await sleep(900);');
  add('wm-add-appt-fs-plus', {}, 'await leadReady(); fontAdj("2px"); click("#ld2AddApptBtn"); await sleep(900);');
  add('wm-add-owner-dd-open', {}, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900); click("#ld2AwOwnerBtn"); await sleep(600);');
  add('wm-add-owner-dd-open-dark', { theme: 'dark' }, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900); click("#ld2AwOwnerBtn"); await sleep(600);');
  add('wm-add-owner-dd-search', {}, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900); click("#ld2AwOwnerBtn"); await sleep(600); typeIn("#ld2AwOwnerSearch", "E10"); await sleep(400);');
  add('wm-add-owner-pick', {}, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900); click("#ld2AwOwnerBtn"); await sleep(600); click($$(".wm-own-item")[1]); await sleep(300);');
  add('wm-add-owner-text-mode', { variant: 'owner' }, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900);');
  add('wm-add-denied-other-lead', LEAD(L.other, { variant: 'owner' }), 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900);');
  add('wm-add-denied-viewer', LEAD(L.main, { variant: 'viewer' }), 'await leadReady(); win.ldOpenAddAppt(); await sleep(600);');
  add('wm-add-status-dd-open', {}, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900); click("#ld2AwStatusBtn"); await sleep(400);');
  add('wm-add-status-dd-open-task', {}, 'await leadReady(); click("#ld2AddWorkBtn"); await sleep(900); click("#ld2AwStatusBtn"); await sleep(400);');
  add('wm-add-status-pick', {}, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900); click("#ld2AwStatusBtn"); await sleep(300); click($$("#ld2AwStatusList .wm-sd-item")[1]); await sleep(300);');
  add('wm-add-status-blocked-closed-lead', LEAD(L.success), 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900); click("#ld2AwStatusBtn"); await sleep(400);');
  add('wm-add-allday-toggle', {}, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900); click("#ld2AwAllDay"); await sleep(300);');
  add('wm-add-allday-toggle-off', {}, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900); click("#ld2AwAllDay"); await sleep(200); click("#ld2AwAllDay"); await sleep(300);');
  add('wm-add-fill', {}, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900); ' + WM_FILL + ' await sleep(300);');
  add('wm-add-nowf-lead', LEAD(L.nowf), 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900);');
  add('wm-add-closed-lead', LEAD(L.success), 'await leadReady(); click("#ld2AddWorkBtn"); await sleep(900);');
  add('wm-add-validate-date', {}, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900); typeIn("#ld2AwDate", ""); click("#ld2AwSubmitBtn"); await sleep(600);');
  add('wm-add-validate-subject', {}, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900); click("#ld2AwSubmitBtn"); await sleep(600);');
  add('wm-add-validate-subject-dark', { theme: 'dark' }, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900); click("#ld2AwSubmitBtn"); await sleep(600);');
  add('wm-add-validate-detail', {}, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900); typeIn("#ld2AwSubject", "หัวข้อ"); click("#ld2AwSubmitBtn"); await sleep(600);');
  add('wm-add-close-x', {}, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900); click("#ld2AddWorkOverlay .ld2-aw-close"); await sleep(400);');
  add('wm-add-close-by-overlay', {}, 'await leadReady(); click("#ld2AddWorkBtn"); await sleep(900); click("#ld2AddWorkOverlay"); await sleep(400);');
  add('wm-add-appt-submit-success', {}, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900); ' + WM_FILL + ' click("#ld2AwSubmitBtn"); ' + WM_DONE);
  add('wm-add-appt-submit-success-dark', { theme: 'dark' }, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900); ' + WM_FILL + ' click("#ld2AwSubmitBtn"); ' + WM_DONE);
  add('wm-add-task-submit-success', {}, 'await leadReady(); click("#ld2AddWorkBtn"); await sleep(900); ' + WM_FILL + ' click("#ld2AwSubmitBtn"); ' + WM_DONE);
  add('wm-en-add-appt-submit-success', { lang: 'en' }, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900); ' + WM_FILL + ' click("#ld2AwSubmitBtn"); ' + WM_DONE);
  add('wm-add-appt-submit-reload', {}, 'await leadReady(); markPage(); click("#ld2AddApptBtn"); await sleep(900); ' + WM_FILL + ' click("#ld2AwSubmitBtn"); await afterReload(12000);');
  add('wm-add-task-submit-reload', {}, 'await leadReady(); markPage(); click("#ld2AddWorkBtn"); await sleep(900); ' + WM_FILL + ' click("#ld2AwSubmitBtn"); await afterReload(12000);');
  add('wm-add-allday-submit-reload', {}, 'await leadReady(); markPage(); click("#ld2AddApptBtn"); await sleep(900); click("#ld2AwAllDay"); typeIn("#ld2AwSubject", "งานทั้งวัน"); typeIn("#ld2AwDetail", "รายละเอียดงานทั้งวัน"); typeIn("#ld2AwDate", "2026-10-30"); click("#ld2AwSubmitBtn"); await afterReload(12000);');
  add('wm-add-nowf-submit-reload', LEAD(L.nowf), 'await leadReady(); markPage(); click("#ld2AddApptBtn"); await sleep(900); ' + WM_FILL + ' click("#ld2AwSubmitBtn"); await afterReload(12000);');
  add('wm-add-empty-lead-submit-reload', LEAD(L.nosched), 'await leadReady(); markPage(); click("#ld2AddApptBtn"); await sleep(900); ' + WM_FILL + ' click("#ld2AwSubmitBtn"); await afterReload(12000);');
  add('wm-add-submit-error', {}, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900); typeIn("#ld2AwSubject", "ทดสอบ #fail"); typeIn("#ld2AwDetail", "รายละเอียด"); click("#ld2AwSubmitBtn"); await sleep(1200);');
  add('wm-add-submit-error-dark', { theme: 'dark' }, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900); typeIn("#ld2AwSubject", "ทดสอบ #fail"); typeIn("#ld2AwDetail", "รายละเอียด"); click("#ld2AwSubmitBtn"); await sleep(1200);');
  add('wm-add-submit-error-then-fix', {}, 'await leadReady(); click("#ld2AddApptBtn"); await sleep(900); typeIn("#ld2AwSubject", "ทดสอบ #fail"); typeIn("#ld2AwDetail", "รายละเอียด"); click("#ld2AwSubmitBtn"); await sleep(1200); click(".swal-button--confirm"); await sleep(500);');
  add('wm-view-appt-open', {}, 'await leadReady(); await appt(1); click(".ld2-appt-card"); await sleep(900);');
  add('wm-view-appt-open-dark', { theme: 'dark' }, 'await leadReady(); await appt(1); click(".ld2-appt-card"); await sleep(900);');
  add('wm-view-appt-open-390', { w: 390, h: 844 }, 'await leadReady(); await appt(1); click(".ld2-appt-card"); await sleep(900);');
  add('wm-en-view-appt', { lang: 'en' }, 'await leadReady(); await appt(1); click(".ld2-appt-card"); await sleep(900);');
  add('wm-view-appt-closed', {}, 'await leadReady(); await appt(0); click(".ld2-appt-card"); await sleep(900);');
  add('wm-view-appt-closed-dark', { theme: 'dark' }, 'await leadReady(); await appt(0); click(".ld2-appt-card"); await sleep(900);');
  add('wm-view-appt-resched', {}, 'await leadReady(); await appt(2); click(".ld2-appt-card"); await sleep(900);');
  add('wm-view-task-open', {}, 'await leadReady(); click($$(".ld2-task-card")[0]); await sleep(900);');
  add('wm-view-task-open-dark', { theme: 'dark' }, 'await leadReady(); click($$(".ld2-task-card")[0]); await sleep(900);');
  add('wm-view-task-closed', {}, 'await leadReady(); click($$(".ld2-task-card")[1]); await sleep(900);');
  add('wm-view-nowf-lead', LEAD(L.nowf), 'await leadReady(); click($(".ld2-task-card, .ld2-appt-card")); await sleep(900);');
  add('wm-view-closed-lead', LEAD(L.success), 'await leadReady(); click($(".ld2-appt-card")); await sleep(900);');
  add('wm-view-viewer', LEAD(L.main, { variant: 'viewer' }), 'await leadReady(); await appt(1); click(".ld2-appt-card"); await sleep(900);');
  add('wm-view-owner-variant-other', LEAD(L.other, { variant: 'owner' }), 'await leadReady(); await appt(0); click(".ld2-appt-card"); await sleep(900);');
  add('wm-view-status-dd-open', {}, 'await leadReady(); await appt(1); click(".ld2-appt-card"); await sleep(900); click("#ld2VwStatusBtn"); await sleep(400);');
  add('wm-view-status-dd-open-task', {}, 'await leadReady(); click($$(".ld2-task-card")[0]); await sleep(900); click("#ld2VwStatusBtn"); await sleep(400);');
  add('wm-view-status-pick', {}, 'await leadReady(); await appt(1); click(".ld2-appt-card"); await sleep(900); click("#ld2VwStatusBtn"); await sleep(300); click($$("#ld2VwStatusList .wm-sd-item")[3]); await sleep(300);');
  add('wm-view-close-x', {}, 'await leadReady(); await appt(1); click(".ld2-appt-card"); await sleep(900); click("#ld2ViewWorkOverlay .ld2-aw-close"); await sleep(400);');
  add('wm-view-close-by-overlay', {}, 'await leadReady(); click($$(".ld2-task-card")[0]); await sleep(900); click("#ld2ViewWorkOverlay"); await sleep(400);');
  add('wm-view-status-save-success', {}, 'await leadReady(); await appt(1); click(".ld2-appt-card"); await sleep(900); click("#ld2VwStatusBtn"); await sleep(300); click($$("#ld2VwStatusList .wm-sd-item")[3]); await sleep(200); click("#ld2VwSubmitBtn"); ' + WM_DONE);
  add('wm-view-status-save-reload', {}, 'await leadReady(); markPage(); await appt(1); click(".ld2-appt-card"); await sleep(900); click("#ld2VwStatusBtn"); await sleep(300); click($$("#ld2VwStatusList .wm-sd-item")[3]); await sleep(200); click("#ld2VwSubmitBtn"); await afterReload(12000);');
  add('wm-view-task-status-save-reload', {}, 'await leadReady(); markPage(); click($$(".ld2-task-card")[0]); await sleep(900); click("#ld2VwStatusBtn"); await sleep(300); click($$("#ld2VwStatusList .wm-sd-item")[2]); await sleep(200); click("#ld2VwSubmitBtn"); await afterReload(12000);');
  add('wm-edit-open', {}, 'await leadReady(); await appt(1); click(".ld2-appt-card"); await sleep(900); click("#ld2VwEditBtn"); await sleep(700);');
  add('wm-edit-open-dark', { theme: 'dark' }, 'await leadReady(); await appt(1); click(".ld2-appt-card"); await sleep(900); click("#ld2VwEditBtn"); await sleep(700);');
  add('wm-edit-open-task', {}, 'await leadReady(); click($$(".ld2-task-card")[0]); await sleep(900); click("#ld2VwEditBtn"); await sleep(700);');
  add('wm-edit-open-resched', {}, 'await leadReady(); await appt(2); click(".ld2-appt-card"); await sleep(900); click("#ld2VwEditBtn"); await sleep(700);');
  add('wm-edit-closed-item-blocked', {}, 'await leadReady(); await appt(0); click(".ld2-appt-card"); await sleep(900); click("#ld2VwEditBtn"); await sleep(500);');
  add('wm-edit-validate-subject', {}, 'await leadReady(); await appt(1); click(".ld2-appt-card"); await sleep(900); click("#ld2VwEditBtn"); await sleep(700); typeIn("#ld2AwSubject", ""); click("#ld2AwSubmitBtn"); await sleep(600);');
  add('wm-edit-change-fields', {}, 'await leadReady(); await appt(2); click(".ld2-appt-card"); await sleep(900); click("#ld2VwEditBtn"); await sleep(700); typeIn("#ld2AwSubject", "นัดใหม่"); typeIn("#ld2AwDetail", "รายละเอียดใหม่"); typeIn("#ld2AwDate", "2026-11-02"); typeIn("#ld2AwTime", "10:15"); await sleep(300);');
  add('wm-edit-submit-success', {}, 'await leadReady(); await appt(2); click(".ld2-appt-card"); await sleep(900); click("#ld2VwEditBtn"); await sleep(700); typeIn("#ld2AwSubject", "นัดใหม่"); click("#ld2AwSubmitBtn"); ' + WM_DONE);
  add('wm-edit-submit-reload', {}, 'await leadReady(); markPage(); await appt(2); click(".ld2-appt-card"); await sleep(900); click("#ld2VwEditBtn"); await sleep(700); typeIn("#ld2AwSubject", "นัดใหม่"); typeIn("#ld2AwDetail", "รายละเอียดใหม่"); typeIn("#ld2AwDate", "2026-11-02"); typeIn("#ld2AwTime", "10:15"); click("#ld2AwSubmitBtn"); await afterReload(12000);');
  add('wm-edit-task-submit-reload', {}, 'await leadReady(); markPage(); click($$(".ld2-task-card")[0]); await sleep(900); click("#ld2VwEditBtn"); await sleep(700); typeIn("#ld2AwSubject", "งานใหม่"); click("#ld2AwSubmitBtn"); await afterReload(12000);');
  add('wm-edit-submit-error', {}, 'await leadReady(); await appt(2); click(".ld2-appt-card"); await sleep(900); click("#ld2VwEditBtn"); await sleep(700); typeIn("#ld2AwSubject", "แก้ #fail"); click("#ld2AwSubmitBtn"); await sleep(1200);');
  add('wm-edit-viewer-no-pencil', LEAD(L.main, { variant: 'viewer' }), 'await leadReady(); click($$(".ld2-task-card")[0]); await sleep(900); win.wmEditWork(); await sleep(400);');

  /* ---- the modals in English and with the A A A font buttons ---- */
  var MODAL_OPENS = {
    tags: 'click("#ld2EditTagBtn"); await sleep(900);',
    sales: 'click("#ld2TeamEditBtn"); await sleep(900);',
    prod: 'click("#ld2AddProdBtn"); await sleep(900);',
    hist: 'click("#ld2HistFilterBtn"); await sleep(1500);',
    return: 'click("#ldBtnReturnStep"); await sleep(1200);',
    closegroup: 'click("#ldBtnCloseGroup"); await sleep(400);',
    closelead: 'click("#ldBtnCloseLead"); await sleep(400);',
    fwd: 'click("#ldForwardSlider"); await sleep(1500);',
    tv: 'click("#ld2GripBtn"); await sleep(1700);',
    endstep: 'click("#ld2GripBtn"); await sleep(1700); click($(".ld2-tv-end-btn")); await sleep(700);',
    viewappt: 'click(".ld2-appt-card"); await sleep(900);',
    viewtask: 'click(".ld2-task-card"); await sleep(900);',
    addappt: 'click("#ld2AddApptBtn"); await sleep(900);',
  };
  Object.keys(MODAL_OPENS).forEach(function (k) {
    var lead = k === 'endstep' ? LEAD(L.other) : {};
    add('en-modal-' + k, Object.assign({ lang: 'en' }, lead), 'await leadReady(); ' + MODAL_OPENS[k]);
    add('fs-modal-' + k, Object.assign({}, lead), 'await leadReady(); fontAdj("2px"); ' + MODAL_OPENS[k]);
    add('fs-minus-modal-' + k, Object.assign({}, lead), 'await leadReady(); fontAdj("-2px"); ' + MODAL_OPENS[k]);
  });
  add('en-modal-closelead-dark', { lang: 'en', theme: 'dark' }, 'await leadReady(); ' + MODAL_OPENS.closelead);
  add('en-modal-return-dark', { lang: 'en', theme: 'dark' }, 'await leadReady(); ' + MODAL_OPENS.return);
  add('en-modal-viewappt-dark', { lang: 'en', theme: 'dark' }, 'await leadReady(); ' + MODAL_OPENS.viewappt);
  add('en-modal-addappt-fill', { lang: 'en' }, 'await leadReady(); ' + MODAL_OPENS.addappt + ' typeIn("#ld2AwSubject", "Meeting"); typeIn("#ld2AwDetail", "Bring the documents"); await sleep(300);');
  add('en-wm-validate-subject', { lang: 'en' }, 'await leadReady(); ' + MODAL_OPENS.addappt + ' click("#ld2AwSubmitBtn"); await sleep(600);');
  add('en-contact-save-toast', { lang: 'en' }, 'await leadReady(); typeIn("#ld2ContactTa", "Called the customer"); click("#ld2ContactSaveBtn"); await toast();');
  add('en-contact-save-error', { lang: 'en' }, 'await leadReady(); typeIn("#ld2ContactTa", "Called the customer #500"); click("#ld2ContactSaveBtn"); await sleep(900);');
  add('en-return-no-reason', { lang: 'en' }, 'await leadReady(); ' + MODAL_OPENS.return + ' click("#ld2RtSubmitBtn"); await sleep(600);');
  /* ---- the lead API fails (the page says why in a dialog; nothing else is drawn) ---- */
  var FAILS = { ready: 'true' };
  add('lead-api-403', LEAD(900, FAILS), 'await sleep(1000);');
  add('lead-api-403-dark', LEAD(900, Object.assign({ theme: 'dark' }, FAILS)), 'await sleep(1000);');
  add('lead-api-403-en', LEAD(900, Object.assign({ lang: 'en' }, FAILS)), 'await sleep(1000);');
  add('lead-api-403-390', LEAD(900, Object.assign({ w: 390, h: 844 }, FAILS)), 'await sleep(1000);');
  add('lead-api-403-fs-plus', LEAD(900, FAILS), 'fontAdj("2px"); await sleep(1000);');
  add('lead-api-400', LEAD(901, FAILS), 'await sleep(1000);');
  add('lead-api-500', LEAD(902, FAILS), 'await sleep(1000);');
  add('lead-api-500-dark', LEAD(902, Object.assign({ theme: 'dark' }, FAILS)), 'await sleep(1000);');
  add('lead-api-empty', LEAD(903, FAILS), 'await sleep(1500);');
  add('lead-api-404', LEAD(999, FAILS), 'await sleep(1000);');
  add('lead-api-viewer-403', LEAD(900, Object.assign({ variant: 'viewer' }, FAILS)), 'await sleep(1000);');
}
