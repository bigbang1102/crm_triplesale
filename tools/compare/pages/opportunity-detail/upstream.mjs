// The fake REST service of a --live run of the Lead detail page (page.upstream) and the fake FILE SERVER next to it (page.files).
//
// The Angular page runs its LIVE backend (src/app/features/opportunity-detail/lead-detail.live.ts), which answers the old BFF addresses of the page from the
// REST calls the Java servlets made. This file plays triplesale-service for those calls, in the shape the JAVA CODE consumed them (the envelope
// `{status, message, result}`, the field names of the DTOs, the status and the error body of a refusal) — answered from the SAME sample set (lead-detail.mock.ts)
// the Java replica gets through its mock BFF. The mock is asked for the BFF answer of the same thing (`board/lead`, `board/prospect/save` …) and
// that answer is put into the shape of the REST service; what the servlets did on the way (unwrap, clean, rename, localise) is the live backend's work,
// so a bug in it shows up as a difference between the two pages.
//
// What this file assumes about the REAL service (nothing here was checked against it — there is no test account):
//   GET /leads/{id}[?activityGroupId=]       { status:200, message, result: <lead> }  — a refusal: its own status + { status, message, error:{code,message} }
//   GET /leads/{id}/activity-groups          { status, message, result:[{id,code,name}] }
//   GET /leads/{id}/activity-steps           { status, message, result:[{id,code,name}] }
//   GET /leads/{id}/contact-history | forward-groups | forward-employees | return-groups | accessors     { status, message, result }
//   POST /leads/{id}/close | close-step | forward | return | accessors        { status, message } (an error: its status + { status, message })
//   POST /leads/{id}/contact-activities      the channel is the label of the o2o combo ("Call Out"); no leadId in the body
//   PATCH /leads/{target-year|target-month|amount|active-status|demand|assign}, PUT /leads/{id}/tags, POST|DELETE /leads/materials
//   GET /prospects/{id}                      { status, message, result: <prospect, the GET spelling of the keys> }
//   PUT /prospects/{id}  (the keys of the request DTO; `sendDoc…` for what GET calls `senddoc…`) and PUT /prospects/{id}/extra-info
//   GET|POST /prospects/{id}/attachments, DELETE /prospects/{id}/attachments/{no}    attachFile = an ABSOLUTE address on the file server
//   GET /rv/attachments?prospectId=          { status, message, result:[{description, rv_txno, attachFile}] }
//   POST /schedules, PATCH /schedules/{id}   the envelope (HTTP 201 for a created one); a refusal: its own status + { status, message, error }
//   GET /master-data/{employees,tags,sale-groups,sale-persons,fiscal-years,material-groups,material-groups/{id}/materials,provinces,districts,sub-districts,
//       countries,business-types,occupations,marketing-channels,communication-types,activity-groups,employees/by-activity-group}   envelopes
// The list of provinces carries foreign cities and a repeated code (BACKEND_BUG_masterdata_address.md): the live backend must keep the clean ones.
//
// The file server (`/__files/<host>/<path>`) is the one the attachments point at: HEAD (the check after an upload), GET (the download of a document).

const NO_WAIT = 0;

/** the variant (the user of the scenario) rides on opts.hook = 'variant=<name>' (scenarios.mjs sets it) */
const variantOf = (state) => /^variant=(\w+)$/.exec(state.hook ?? '')?.[1] ?? 'all';

/** the O2O combo labels (ContactChannel.O2O_LABEL) → the `type` the mock knows */
const O2O = { Manual: 'manual', 'Call In': 'call_in', 'Call Out': 'call_out', SMS: 'sms', Email: 'email', Facebook: 'facebook', Line: 'line', WhatsApp: 'whatsapp' };

/** the keys the request DTO spells another way than the answer (ProspectApiPayload.GET_KEY_FALLBACK, the other direction) */
const GET_SPELLING = {
  sendDocAddress: 'senddocAddress',
  sendDocPostId: 'senddocPostId',
  sendDocDistrictId: 'senddocDistrictId',
  sendDocDistrictCode: 'senddocDistrictCode',
  sendDocDistrictName: 'senddocDistrictName',
  sendDocSubDistrictId: 'senddocSubDistrictId',
  sendDocSubDistrictCode: 'senddocSubDistrictCode',
  sendDocSubDistrictName: 'senddocSubDistrictName',
};

/** the Thai names the service gives two countries (the Thai dictionary of the app says "ไทย" and "อาเซียน" — that is what the page shows) */
const SERVICE_TH = { THA: 'ประเทศไทย', ASN: 'ไม่ระบุ' };

/** the foreign cities and the repeated code the real list of provinces carries */
const NOISE = [
  { id: 1, code: '\tP01', name: 'ชื่อเก่าที่ซ้ำรหัส' },
  { id: 9901, code: 'TYO', name: 'Tokyo', nameTh: '' },
  { id: 9902, code: '', name: 'ไม่มีรหัส' },
  { id: 9903, code: 'NYC', name: 'New York' },
];

export function makeUpstream({ VARIANTS, sleep }) {
  const backendOf = (state) => {
    const variant = variantOf(state);
    let backend = state.backends.get('rest:' + variant);
    if (!backend) state.backends.set('rest:' + variant, (backend = state.mock.createMockLeadDetail({ delayMs: NO_WAIT, employeeId: VARIANTS[variant].employeeId })));
    return backend;
  };
  /** the BFF answer of the mock, parsed */
  const ask = async (state, path, init) => {
    const r = await backendOf(state).fetch(path, init);
    const text = await r.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: r.status, text, json, contentType: r.headers.get('content-type') ?? 'application/json' };
  };
  const post = (body) => ({ method: 'POST', body: JSON.stringify(body ?? {}) });
  const envelope = (result, status = 200) => ({ status: 200, body: { status, message: 'success', result } });
  /** the answer of the mock goes out as it is: its status and its text */
  const asIs = (r) => ({ status: r.status, body: r.text });
  const absFile = (req, url) => (typeof url === 'string' && /^https?:\/\//.test(url) ? `http://${req.headers.host}/__files/${url.replace(/^https?:\/\//, '')}` : url);

  /**
   * the situations the save of a customer is made to fail in (the mock plays them on the text of the body, here the service plays them): '#500' / '#400' = the
   * service answers 500 with its message; '#gw' = a gateway in front of it answers 502 with an HTML page. ('#net' — a body that is not JSON — cannot come out of a
   * servlet: those scenarios are skipped in a --live run, see scenarios.mjs.)
   */
  const refusal = (state, body) => {
    const t = trigger(JSON.stringify(body));
    if (t === '500' || t === '400') return { status: 500, body: state.mock.SAVE_REFUSED_BODY };
    if (JSON.stringify(body).includes('#gw')) return { status: 502, headers: { 'content-type': 'text/html' }, body: state.mock.GATEWAY_BODY };
    return null;
  };

  /** a trigger the page was made to carry (the mock plays them on its own text) is played here as a failing service */
  const trigger = (text) => (/\[500\]|#500/.test(text) ? '500' : /\[400\]|#400/.test(text) ? '400' : /\[net\]|#net/.test(text) ? 'net' : 'none');

  async function upstream(req, state) {
    if (req.api !== 'service') return null;
    if (state.delay) await sleep(state.delay);
    const q = new URLSearchParams(req.search ?? '');
    const p = req.path;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const m = (re) => re.exec(p);
    let g;

    /* ---------------------------------------------------------------- GET */
    if (req.method === 'GET') {
      if ((g = m(/^\/leads\/(\d+)$/))) {
        const r = await ask(state, `board/lead?id=${g[1]}`);
        if (r.status === 200) return envelope(r.json); // (lead 903 answers {} = a lead with nothing in it)
        return asIs(r); // a refusal: its own status and its { status, message, error }
      }
      if ((g = m(/^\/leads\/(\d+)\/activity-groups$/))) return asIs(await ask(state, `board/activity-groups?leadId=${g[1]}`));
      if ((g = m(/^\/leads\/(\d+)\/activity-steps$/))) {
        const r = await ask(state, `board/activity-steps?leadId=${g[1]}${q.get('activityGroupId') ? `&activityGroupId=${q.get('activityGroupId')}` : ''}`);
        return envelope(r.json);
      }
      if ((g = m(/^\/leads\/(\d+)\/(contact-history|forward-groups|forward-employees|return-groups|accessors)$/))) {
        const bff = `board/lead/${g[2]}?leadId=${g[1]}${q.get('activityGroupId') ? `&activityGroupId=${q.get('activityGroupId')}` : ''}${q.get('currentActivityGroupId') ? `&currentActivityGroupId=${q.get('currentActivityGroupId')}` : ''}`;
        return asIs(await ask(state, bff));
      }
      if ((g = m(/^\/prospects\/(\d+)$/))) {
        const r = await ask(state, `board/prospect?id=${g[1]}`);
        if (!r.json || !Object.keys(r.json).length) return { status: 404, body: { status: 404, message: 'ไม่พบข้อมูลลูกค้า' } };
        return envelope(r.json);
      }
      if ((g = m(/^\/prospects\/(\d+)\/attachments$/))) {
        const r = await ask(state, `board/prospect/attachments?prospectId=${g[1]}`);
        return envelope((r.json?.result ?? []).map((a) => ({ ...a, attachFile: absFile(req, a.attachFile) })));
      }
      if (p === '/rv/attachments') {
        const r = await ask(state, `board/prospect/rv-attachments?prospectId=${q.get('prospectId') ?? ''}`);
        return { status: 200, body: { ...r.json, result: (r.json?.result ?? []).map((a) => ({ ...a, attachFile: absFile(req, a.attachFile) })) } };
      }
      // ---- master data
      const list = async (bff) => envelope((await ask(state, bff)).json);
      if (p === '/master-data/employees') return list(`board/employees${q.get('saleGroupId') ? `?saleGroupId=${q.get('saleGroupId')}` : ''}`);
      if (p === '/master-data/tags') return list('board/tags');
      if (p === '/master-data/sale-groups') return list('board/sale-groups');
      if (p === '/master-data/sale-persons') return list(`board/sale-persons${q.get('saleGroupId') ? `?saleGroupId=${q.get('saleGroupId')}` : ''}`);
      if (p === '/master-data/fiscal-years') return list('board/fiscal-years');
      if (p === '/master-data/material-groups') return list('board/material-groups');
      if ((g = m(/^\/master-data\/material-groups\/(\d+)\/materials$/))) return list(`board/materials?groupId=${g[1]}`);
      if (p === '/master-data/provinces') {
        const r = await ask(state, 'board/provinces');
        return envelope([...NOISE.slice(0, 1), ...NOISE.slice(1, 3), ...(r.json?.result ?? []), NOISE[3]]);
      }
      if (p === '/master-data/districts') return asIs(await ask(state, `board/districts?provinceId=${q.get('provinceId') ?? ''}`));
      if (p === '/master-data/sub-districts') return asIs(await ask(state, `board/sub-districts?districtId=${q.get('districtId') ?? ''}`));
      if (p === '/master-data/countries') {
        // the service has its own Thai names; ChatMasterDataServlet put the ones of the Thai dictionary over them (the mock gives those): give the service's back
        const r = await ask(state, 'board/chat-master-data?type=countries');
        return { status: r.status, body: { ...r.json, result: (r.json?.result ?? []).map((c) => ({ ...c, nameTh: SERVICE_TH[c.code] ?? c.nameTh })) } };
      }
      if ((g = m(/^\/master-data\/(business-types|occupations|marketing-channels|communication-types)$/))) return asIs(await ask(state, `board/chat-master-data?type=${g[1]}`));
      if (p === '/master-data/activity-groups') return asIs(await ask(state, `board/master/activity-groups?movementTypeId=${q.get('movementTypeId') ?? ''}`));
      if (p === '/master-data/employees/by-activity-group') return asIs(await ask(state, `board/master/employees-by-activity-group?activityGroupId=${q.get('activityGroupId') ?? ''}`));
      return null;
    }

    /* ---------------------------------------------------------------- the writes on a lead */
    if ((g = m(/^\/leads\/(\d+)\/(close|close-step|forward|return)$/)) && req.method === 'POST') {
      return asIs(await ask(state, `board/lead/${g[2]}`, post({ ...body, leadId: Number(g[1]) })));
    }
    if ((g = m(/^\/leads\/(\d+)\/accessors$/)) && req.method === 'POST') return asIs(await ask(state, `board/lead/accessor-add?leadId=${g[1]}`, post(body)));
    if ((g = m(/^\/leads\/(\d+)\/contact-activities$/)) && req.method === 'POST') {
      if ('leadId' in body) return { status: 400, body: { status: 400, message: 'leadId must not be in the body', error: { code: 400, message: 'leadId must not be in the body' } } };
      if ('channel' in body && !(body.channel in O2O)) {
        const bad = `channel ${JSON.stringify(body.channel)} is not a label of the o2o combo`;
        return { status: 400, body: { status: 400, message: bad, error: { code: 400, message: bad } } };
      }
      const channel = 'channel' in body ? O2O[body.channel] : undefined;
      return asIs(await ask(state, 'board/contact-activities', post({ ...body, ...(channel ? { channel } : {}), leadId: Number(g[1]) })));
    }
    if ((g = m(/^\/leads\/(target-year|target-month|amount|active-status|demand|assign)$/)) && req.method === 'PATCH') {
      return asIs(await ask(state, 'board/lead-update', post({ ...body, action: g[1] })));
    }
    if ((g = m(/^\/leads\/(\d+)\/tags$/)) && req.method === 'PUT') {
      return asIs(await ask(state, 'board/lead-update', post({ action: 'tags', leadId: Number(g[1]), tagIds: (body.tagIds ?? []).join(',') })));
    }
    if (p === '/leads/materials' && (req.method === 'POST' || req.method === 'DELETE')) {
      return asIs(await ask(state, 'board/lead-materials', { method: req.method, body: JSON.stringify(body) }));
    }

    /* ---------------------------------------------------------------- the work modal */
    if (p === '/schedules' && req.method === 'POST') {
      const r = await ask(state, 'board/schedule/add', post(body));
      // the service answers HTTP 201 for what the servlet showed as 200 (the status of the envelope decides what the servlet passes on)
      return { status: r.json?.status ?? r.status, body: r.text };
    }
    if ((g = m(/^\/schedules\/(\d+)$/)) && req.method === 'PATCH') {
      const r = await ask(state, 'board/schedule/edit', { method: 'PATCH', body: JSON.stringify({ ...body, id: Number(g[1]) }) });
      return { status: r.json?.status ?? r.status, body: r.text };
    }

    /* ---------------------------------------------------------------- the customer */
    if ((g = m(/^\/prospects\/(\d+)$/)) && req.method === 'PUT') {
      const refused = refusal(state, body);
      if (refused) return refused;
      const prospect = {};
      for (const [k, v] of Object.entries(body)) {
        if (k === 'id' || k === 'attachFileBase64') continue;
        prospect[GET_SPELLING[k] ?? k] = v;
      }
      const r = await ask(state, 'board/prospect/save', post({ prospectId: Number(g[1]), prospect }));
      return r.status === 200 ? { status: 200, body: { status: 200, message: 'success' } } : asIs(r);
    }
    if ((g = m(/^\/prospects\/(\d+)\/extra-info$/)) && req.method === 'PUT') {
      const refused = refusal(state, body);
      if (refused) return refused;
      const r = await ask(state, 'board/prospect/save', post({ prospectId: Number(g[1]), extraInfo: { sunProspectInfo: body.sunProspectInfo, satisfaction: body.satisfaction } }));
      return r.status === 200 ? { status: 200, body: { status: 200, message: 'success' } } : asIs(r);
    }
    if ((g = m(/^\/prospects\/(\d+)\/attachments$/)) && req.method === 'POST') {
      if (body.attachFileTypeCode === 'PROFILE') {
        // the picture of the customer: the mock keeps the picture itself as the address (a data URL the page can show)
        const r = await ask(state, 'board/prospect/avatar', post({ prospectId: Number(g[1]), fileContentBase64: body.attachFileBase64, fileName: body.fileName }));
        if (r.status !== 200 || !r.json?.ok) return { status: r.status === 200 ? 500 : r.status, body: { status: r.status === 200 ? 500 : r.status, message: r.json?.message ?? '' } };
        return { status: 200, body: { status: 200, message: 'success', result: { attachFile: r.json.attachFile } } };
      }
      const r = await ask(state, 'board/prospect/attachments', post({ prospectId: Number(g[1]), fileContentBase64: body.fileContentBase64, fileName: body.fileName, description: body.description }));
      if (r.status !== 200 || !r.json?.result?.attachFile) return { status: r.status === 200 ? 500 : r.status, body: { status: r.status, message: r.json?.message ?? '' } };
      return { status: 200, body: { status: 200, message: 'success', result: { attachFile: absFile(req, r.json.result.attachFile) } } };
    }
    if ((g = m(/^\/prospects\/(\d+)\/attachments\/(\d+)$/)) && req.method === 'DELETE') {
      const r = await ask(state, `board/prospect/attachments?prospectId=${g[1]}&docNo=${g[2]}`, { method: 'DELETE' });
      // (the servlet wrote "ลบเอกสารไม่สำเร็จ: " + the text of the answer; the text of the answer here is the reason itself)
      return r.status === 200 ? { status: 200, body: { status: 200, message: 'success' } } : { status: r.status, body: String(r.json?.message ?? '').replace(/^ลบเอกสารไม่สำเร็จ: /, '') };
    }
    return null;
  }

  /** the file server the attachments point at (/__files/<host>/<path>); null = not a file request */
  async function files(req, state) {
    if (!req.path.startsWith('/__files/')) return null;
    const name = req.path.slice('/__files/'.length);
    // the file of an upload the mock calls unverified is not on the server (the check after the upload finds nothing); the rest is served
    if (/unverified/.test(name) && req.method === 'HEAD') return { status: 404, headers: { 'content-type': 'text/plain' }, body: '' };
    if (req.method === 'HEAD') return { status: 200, headers: {}, body: '' };
    const backend = backendOf(state);
    const r = await backend.fetch('docproxy?url=' + encodeURIComponent(name));
    return { status: r.status, headers: Object.fromEntries(r.headers), body: Buffer.from(await r.arrayBuffer()) };
  }

  return { upstream, files };
}
