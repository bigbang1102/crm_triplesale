import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeRest } from '@core/live/rest-fake';
import { resetMockProspects } from '../prospects.mock';
import { ProspectFormView, ProspectSession } from './prospect-form.bean';
import { apiErrorText, apiResponseOk, duplicateCheckBody, duplicateRefusal, duplicateStopText, parseDuplicateVerdict } from './prospect-form.logic';
import { CREATE_PROSPECT_OPEN, createLiveProspectFormApi } from './prospect-form.live';
import { createMockProspectForm, resetMockProspectForm } from './prospect-form.mock';
import { ProspectFormService } from './prospect-form.service';
import { newContractBean } from './prospect-form-types';

const verdict = (kind: string, matches: unknown[] = []): string => JSON.stringify({ status: 200, result: { result: kind, matches } });

describe('duplicateCheckBody', () => {
  it('the keys of the service from what the form holds; blanks are null; phones are digits; the three slots go as lists', () => {
    const c = newContractBean('2026-11-16');
    Object.assign(c, {
      customer_name: ' สมชาย ใจดี ',
      tel: '081-234 5678',
      id_card: '1-1001-00123-45-6',
      prospect_email: 'somchai@mail.com',
      prospect_phone2: '089-999 0000',
      prospect_tel1: '02 111 2222',
      prospect_line: 'Usample0001',
      prospect_facebook: '  ',
    });
    expect(duplicateCheckBody(c, 'RELEASE', null)).toEqual({
      checkFor: 'RELEASE',
      excludeProspectId: null,
      phoneCountryId: null,
      mainPhone: '0812345678',
      idCard: '1-1001-00123-45-6',
      taxId: null,
      backupPhone: null,
      homePhone: '021112222',
      mobilePhones: [null, '0899990000', null],
      telephones: ['021112222', null, null],
      email: 'somchai@mail.com',
      name: 'สมชาย',
      lastname: 'ใจดี',
      passport: null,
      socialAccounts: [{ channelType: 'LINE', pageId: null, accountId: 'Usample0001' }],
    });
  });

  it('the name is split at the first space as the form draws it: a single word has no surname; the rest after the first space is the surname', () => {
    const body = (name: string) => duplicateCheckBody(Object.assign(newContractBean('2026-11-16'), { customer_name: name }), 'RELEASE', null);
    expect(body('สมชาย')).toMatchObject({ name: 'สมชาย', lastname: null });
    expect(body('สมชาย  ใจดี มาก')).toMatchObject({ name: 'สมชาย', lastname: 'ใจดี มาก' });
    expect(body('   ')).toMatchObject({ name: null, lastname: null });
  });

  it('an edit excludes the record itself', () => {
    expect(duplicateCheckBody(newContractBean('2026-11-16'), 'EDIT', ' 01a1d32d ')).toMatchObject({ checkFor: 'EDIT', excludeProspectId: '01a1d32d' });
  });
});

describe('the verdict', () => {
  it('reads result.result and the matches (code and name of the preview, group, fields)', () => {
    const v = parseDuplicateVerdict(verdict('DUPLICATE_WEAK', [{ prospectId: 'p1', group: 'B', fields: ['EMAIL'], preview: { code: 'P001', name: 'สมชาย' } }]));
    expect(v).toEqual({ kind: 'DUPLICATE_WEAK', matches: [{ code: 'P001', name: 'สมชาย', group: 'B', fields: ['EMAIL'] }] });
  });

  it('no usable answer is null: nothing, an error body, a 4xx, another shape, an unknown kind', () => {
    for (const text of ['', 'x', '{}', JSON.stringify({ status: 422, error: { code: 'VALIDATION_ERROR' } }), JSON.stringify({ status: 200, result: { result: 'MAYBE' } })]) {
      expect(parseDuplicateVerdict(text)).toBeNull();
    }
  });

  it('blocked, hidden and strong stop the save (strong names the other record and what matched); weak and none let it through', () => {
    const strong = parseDuplicateVerdict(verdict('DUPLICATE_STRONG', [{ group: 'A', fields: ['MAIN_PHONE', 'ID_CARD'], preview: { code: 'P001', name: 'สมชาย' } }]))!;
    expect(duplicateStopText(strong)).toBe('พบลูกค้าซ้ำในระบบ ไม่สามารถบันทึกได้\nP001 สมชาย (เบอร์โทรหลัก, เลขบัตรประชาชน)');
    expect(duplicateStopText(parseDuplicateVerdict(verdict('DUPLICATE_BLOCKED'))!)).toContain('ระงับใช้งาน');
    expect(duplicateStopText(parseDuplicateVerdict(verdict('DUPLICATE_HIDDEN'))!)).toContain('ไม่มีสิทธิ์');
    expect(duplicateStopText(parseDuplicateVerdict(verdict('DUPLICATE_WEAK'))!)).toBeNull();
    expect(duplicateStopText(parseDuplicateVerdict(verdict('NONE'))!)).toBeNull();
  });
});

describe('a refusal of the check', () => {
  const forbidden = JSON.stringify({ timestamp: 't', status: 403, message: 'FORBIDDEN', error: { code: 'FORBIDDEN', description: 'You do not have permission to create a prospect', details: [] } });

  it('403 and 422 are refusals with the reason of the service; a 5xx, no answer or another shape is not (the save goes on)', () => {
    expect(duplicateRefusal(forbidden)).toBe('[403] ไม่มีสิทธิ์ตรวจสอบข้อมูลซ้ำ ไม่สามารถบันทึกได้\nYou do not have permission to create a prospect');
    expect(duplicateRefusal(JSON.stringify({ status: 422, message: 'VALIDATION_ERROR' }))).toBe('[422] ข้อมูลไม่ถูกต้อง ไม่สามารถตรวจสอบข้อมูลซ้ำได้\nVALIDATION_ERROR');
    for (const text of ['', 'x', '{}', JSON.stringify({ status: 500, message: 'x' }), JSON.stringify({ status: 404 }), verdict('NONE')]) expect(duplicateRefusal(text)).toBeNull();
  });

  it('a 403 stops the save at the button and in the save itself: nothing opens, nothing is saved, the reason is shown', async () => {
    resetMockProspectForm();
    resetMockProspects();
    const backend = createMockProspectForm();
    const bean = new ProspectFormView(new ProspectFormService(backend.api), { today: () => '2026-11-16', session: new ProspectSession() });
    vi.spyOn(backend.api, 'duplicateCheck').mockResolvedValue(forbidden);
    const create = vi.spyOn(backend.api, 'createProspect');
    await bean.init({ action_type: 'add' });
    bean.assign('#{contractView.contractBean.customer_name}', 'สมชาย ใหม่', 'text');
    expect(await bean.checkDuplicateBeforeSave()).toBe(false);
    expect(bean.takeScripts().join('\n')).toContain('You do not have permission');
    await bean.textAlert('P');
    await bean.saveProspectAndLead();
    expect(create).not.toHaveBeenCalled();
    expect(bean.takeScripts().join('\n')).toContain('403');
  });
});

describe('POST /prospects/duplicate-checks (live)', () => {
  it('posts the body as it is and answers the text whatever the status', async () => {
    const { deps, calls } = fakeRest(() => ({ status: 422, text: '{"status":422}' }));
    const api = createLiveProspectFormApi(deps);
    expect(await api.duplicateCheck({ checkFor: 'RELEASE' })).toBe('{"status":422}');
    expect(calls.map((c) => [c.method, c.path, c.body])).toEqual([['POST', '/prospects/duplicate-checks', { checkFor: 'RELEASE' }]]);
  });
});

describe('POST /prospects (create) is closed for now', () => {
  it('createProspect sends nothing and answers the message of a failure; the update is not affected', async () => {
    expect(CREATE_PROSPECT_OPEN).toBe(false);
    const { deps, calls } = fakeRest(() => ({ status: 201, text: '{"status":201}' }));
    const api = createLiveProspectFormApi(deps);
    const answer = await api.createProspect({ name: 'a' });
    expect(calls).toHaveLength(0);
    expect(apiResponseOk(answer)).toBe(false);
    expect(apiErrorText(answer)).toContain('ปิดการสร้างลูกค้าไว้ชั่วคราว');
    await api.updateProspect(5, { id: 5 });
    expect(calls.map((c) => [c.method, c.path])).toEqual([['PUT', '/prospects/5']]);
  });
});

describe('the save asks the check first', () => {
  beforeEach(() => {
    resetMockProspectForm();
    resetMockProspects();
  });

  function setup() {
    const backend = createMockProspectForm();
    const bean = new ProspectFormView(new ProspectFormService(backend.api), { today: () => '2026-11-16', session: new ProspectSession() });
    return { backend, bean };
  }
  const nameIt = (bean: ProspectFormView, name: string): void => bean.assign('#{contractView.contractBean.customer_name}', name, 'text');

  it('a create (P) is checked as RELEASE; none: the customer is saved', async () => {
    const { backend, bean } = setup();
    const check = vi.spyOn(backend.api, 'duplicateCheck');
    const create = vi.spyOn(backend.api, 'createProspect');
    await bean.init({ action_type: 'add' });
    nameIt(bean, 'สมชาย ใหม่');
    await bean.textAlert('P');
    expect(check).toHaveBeenCalledTimes(1);
    expect(check.mock.calls[0][0]).toMatchObject({ checkFor: 'RELEASE', excludeProspectId: null, name: 'สมชาย', lastname: 'ใหม่' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('a strong or blocked duplicate stops the save: it says so and nothing is saved', async () => {
    for (const name of ['X-DUP-STRONG', 'X-DUP-BLOCKED']) {
      const { backend, bean } = setup();
      const create = vi.spyOn(backend.api, 'createProspect');
      await bean.init({ action_type: 'add' });
      nameIt(bean, name);
      await bean.textAlert('P');
      expect(create).not.toHaveBeenCalled();
      expect(bean.takeScripts().join('\n')).toContain('พบข้อมูลซ้ำ');
    }
  });

  it('a weak duplicate does not stop the save', async () => {
    const { backend, bean } = setup();
    const create = vi.spyOn(backend.api, 'createProspect');
    await bean.init({ action_type: 'add' });
    nameIt(bean, 'X-DUP-WEAK');
    await bean.textAlert('P');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('a check that cannot be read does not stop the save (the service checks again when it saves)', async () => {
    const { backend, bean } = setup();
    vi.spyOn(backend.api, 'duplicateCheck').mockResolvedValue('');
    const create = vi.spyOn(backend.api, 'createProspect');
    await bean.init({ action_type: 'add' });
    nameIt(bean, 'สมชาย');
    await bean.textAlert('P');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('an update (U) is checked as EDIT with the record itself excluded; a stop keeps the record as it was', async () => {
    const { backend, bean } = setup();
    const check = vi.spyOn(backend.api, 'duplicateCheck');
    const update = vi.spyOn(backend.api, 'updateProspect');
    await bean.init({ action_type: 'edit', id: '1' });
    await bean.textAlert('U');
    expect(check.mock.calls[0][0]).toMatchObject({ checkFor: 'EDIT', excludeProspectId: '1' });
    expect(update).toHaveBeenCalledTimes(1);
    check.mockResolvedValue(verdict('DUPLICATE_STRONG', [{ group: 'A', fields: ['ID_CARD'], preview: { code: 'P9', name: 'x' } }]));
    await bean.textAlert('U');
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('the button of the add form checks BEFORE its window opens: a strong duplicate does not open it; the check that passed is not asked again by the save of the window', async () => {
    const stop = setup();
    await stop.bean.init({ action_type: 'add' });
    nameIt(stop.bean, 'X-DUP-STRONG');
    expect(await stop.bean.checkDuplicateBeforeSave()).toBe(false);
    expect(stop.bean.takeScripts().join('\n')).toContain('พบข้อมูลซ้ำ');

    const { backend, bean } = setup();
    const check = vi.spyOn(backend.api, 'duplicateCheck');
    await bean.init({ action_type: 'add' });
    nameIt(bean, 'สมชาย ใหม่');
    expect(await bean.checkDuplicateBeforeSave()).toBe(true);
    expect(check).toHaveBeenCalledTimes(1);
    await bean.saveProspectAndLead(); // the same data: no second check
    expect(check).toHaveBeenCalledTimes(1);
    await bean.saveProspectAndLead(); // used once: the next save asks again
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('data changed after the check at the button is checked again by the save of the window', async () => {
    const { backend, bean } = setup();
    const check = vi.spyOn(backend.api, 'duplicateCheck');
    await bean.init({ action_type: 'add' });
    nameIt(bean, 'สมชาย ใหม่');
    await bean.checkDuplicateBeforeSave();
    nameIt(bean, 'สมศักดิ์ ใหม่');
    await bean.saveProspectAndLead();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('the lead modal (saveProspectAndLead) is checked; a merge the user confirmed is not checked again', async () => {
    const { backend, bean } = setup();
    const check = vi.spyOn(backend.api, 'duplicateCheck');
    await bean.init({ action_type: 'add' });
    nameIt(bean, 'X-DUP-STRONG');
    await bean.saveProspectAndLead();
    expect(check).toHaveBeenCalledTimes(1);
    expect(bean.takeScripts().join('\n')).toContain('พบข้อมูลซ้ำ');
    bean.request['confirmMerge'] = 'true';
    await bean.saveProspectAndLead();
    expect(check).toHaveBeenCalledTimes(1);
  });
});
