/**
 * The page links of the Java app (`lead_detail.face?pid=1&page_id=3&act=3&param_lead_id=7`, `sales_doc_rv.xhtml?navbar_menu=navbar_menu_sale`)
 * as the routes of this app. The generated page engines keep the Java code `location.href = '…face?…'` as it was, with ONE
 * swap: the target goes through `javaLinkToRoute()` and the host navigates the router there.
 *
 * Java carried the menu state in the URL (`pid`, `page_id`, `act`, `acts`, `sub_id`, `navbar_menu`, `action_type`); the router
 * has it from the route (the registry), so those parameters are dropped. What is left (`param_lead_id`, `doc`, `leadId` …) is the
 * business parameter of the page and becomes a path segment or a query parameter, as the registry's `route` says.
 *
 * One rule per page; a page port adds / corrects ITS rule (and the spec) — nothing else in this file.
 */

/** query parameters that only told the Java shell which menu to highlight */
const MENU_NOISE = new Set(['pid', 'page_id', 'act', 'acts', 'sub_id', 'navbar_menu', 'action_type', 'faces-redirect']);

/** sales_document, sales_document_2 … sales_document_7 → the `:type` of /crm/supporting-docs/:type */
const SUPPORTING_DOC_TYPES: Record<string, string> = {
  '': 'letter-of-intent',
  '2': 'legal-credit-request',
  '3': 'service-contract',
  '4': 'loan-agreement',
  '5': 'preliminary-credit-approval',
  '6': 'property-project-contract',
  '7': 'credit-application',
};

type Rule = (q: URLSearchParams, tail: string) => string;

const query = (q: URLSearchParams, drop: string[] = [], keepNoise: string[] = []): string => {
  const keep = new URLSearchParams();
  q.forEach((v, k) => {
    if ((!MENU_NOISE.has(k) || keepNoise.includes(k)) && !drop.includes(k)) keep.append(k, v);
  });
  const s = keep.toString();
  return s ? `?${s}` : '';
};

/** Java page name (file name without extension) → route */
const RULES: Record<string, Rule> = {
  index: () => '/crm/home',
  dashboard: () => '/dashboard',
  lead: (q) => `/crm/opportunities${query(q)}`,
  lead_detail: (q) => `/crm/opportunities/${encodeURIComponent(q.get('param_lead_id') ?? q.get('leadId') ?? q.get('id') ?? '')}${query(q, ['param_lead_id', 'leadId', 'id'])}`,
  activity: (q) => `/crm/activities${query(q)}`,
  schedule: (q) => `/crm/schedule${query(q)}`,
  market_plan: (q) => `/market-plan${query(q)}`,
  contracts:(q) => `/crm/prospects${query(q)}`,
  // action_type (add | view | edit) is the mode of the form here, not a menu parameter: it stays in the query
  // a record to look at (anything but add / edit) is the detail page; add and edit stay on the form
  contracts_master_data: (q) => {
    const id = q.get('id');
    const mode = q.get('action_type');
    if (id && mode !== 'edit' && mode !== 'add') return `/crm/prospects/${encodeURIComponent(id)}/detail${query(q, ['id', 'action_type'])}`;
    return `/crm/prospects/${encodeURIComponent(id ?? 'new')}${query(q, ['id'], ['action_type'])}`;
  },
  supporting_documents: () => '/crm/supporting-docs',
  // no ?code= = the report the page opens by itself (DEFAULT_CODE of drilldown.xhtml)
  drilldown: (q) => `/crm/drilldown/${encodeURIComponent(q.get('code')?.trim() || 'T-CS-01')}${query(q, ['code'])}`,
  sales_doc_rv_list: (q) => `/sales/receipts${query(q)}`,
  // ?leadId= of the Java link is ?opportunityId= in the address of the receipt form (the form still sends leadId to the API)
  sales_doc_rv: (q) => {
    const p = new URLSearchParams();
    q.forEach((v, k) => p.append(k === 'leadId' ? 'opportunityId' : k, v));
    return `/sales/receipts/${encodeURIComponent(q.get('id') ?? 'new')}${query(p, ['id'])}`;
  },
  sales_doc_type_list: (q) => `/sales/docs/${encodeURIComponent(q.get('doc') ?? '')}${query(q, ['doc'])}`,
  report: (q) => `/report${query(q)}`,
  // the AI HUB: ?tool=<tool> is the last segment (customer-brief …); the rest (prospectId …) is the business parameter of the tool
  ai_hub: (q) => `/ai/hub${q.get('tool')?.trim() ? `/${encodeURIComponent(q.get('tool')!.trim())}` : ''}${query(q, ['tool'])}`,
};

const SALES_DOC_FORM = /^sales_doc_(qt|bk|ob|aq|ad)_form$/;
const SUPPORTING_LIST = /^sales_document(?:_([2-7]))?$/;
const SUPPORTING_FORM = /^sales_document_sub_([1-7])$/;

/**
 * The route for a link of the Java app, or `null` when it is not a page link of this app (an external URL, a file, `#`).
 * Relative / absolute paths and the context path (`/triplesale/pages/lead.face`) are all accepted.
 */
export function javaLinkToRoute(href: string): string | null {
  const m = /(?:^|[/])([A-Za-z0-9_]+)\.(?:face|xhtml)(?:\?([^#]*))?(?:#.*)?$/.exec(String(href ?? '').trim());
  if (!m) return null;
  const page = m[1];
  const q = new URLSearchParams((m[2] ?? '').replace(/&amp;/g, '&'));

  const rule = RULES[page];
  if (rule) return rule(q, '');
  const form = SALES_DOC_FORM.exec(page);
  if (form) return `/sales/docs/${form[1]}/${encodeURIComponent(q.get('id') ?? 'new')}${query(q, ['id'])}`;
  const list = SUPPORTING_LIST.exec(page);
  if (list) return `/crm/supporting-docs/${SUPPORTING_DOC_TYPES[list[1] ?? '']}${query(q)}`;
  const sub = SUPPORTING_FORM.exec(page);
  if (sub) {
    // `quotation_id=<id>` (or `id`) is the document; action_type says what to do with it: edit and detail are the mode of the form (a new one is always `add`)
    const id = q.get('quotation_id') ?? q.get('id') ?? 'new';
    const action = q.get('action_type');
    const mode = id !== 'new' && (action === 'edit' || action === 'detail') ? `action_type=${action}` : '';
    const rest = query(q, ['quotation_id', 'id', 'pms']).replace(/^\?/, '');
    return `/crm/supporting-docs/${SUPPORTING_DOC_TYPES[sub[1] === '1' ? '' : sub[1]]}/${encodeURIComponent(id)}${[mode, rest].filter(Boolean).length ? `?${[mode, rest].filter(Boolean).join('&')}` : ''}`;
  }
  return null;
}
