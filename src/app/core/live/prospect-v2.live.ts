/**
 * The record of the new service (`GET /api/v1/prospects/{id}` and `…/trash/{id}`) in the flat keys the old pages read. Shared by the form (the detail page) and
 * the list (the side panel): both ask the same record.
 */
import { type JObj, isArr, isObj, optString, parseJson } from './org-json';

/**
 * The answer of the new service → the flat keys `detailToContract` (the form) and the panel of the list read. The new answer nests what
 * the old one had flat: `currentAddress { subDistrict, district, province, country, postCode }`, `occupation`, `salePerson`, `marketingChannel`,
 * `contactBack` (each `{ id, code?, name }`), `sex` MALE / FEMALE. A key the answer already has flat is left alone. The names come with the record:
 * no master list is needed to put a name to an id. A field the service hides is `****` or null: it is kept as it came.
 */
export function normalizeProspectV2(root: JObj): JObj {
  // with `sections=` the record is under `result.base` (and the documents under `result.attachments`): lift the record to the top
  const r: JObj = isObj(root['base']) ? { ...root, ...(root['base'] as JObj) } : root;
  if (r !== root) delete r['base'];
  const out: JObj = { ...r };
  const obj = (key: string): JObj | null => (isObj(r[key]) ? (r[key] as JObj) : null);
  const text = (o: JObj | null, key: string): string => (o ? optString(o, key, '') : '');
  const put = (key: string, value: string): void => {
    if (value !== '') out[key] = value;
  };
  const sex = optString(r, 'sex', '').toUpperCase();
  if (sex === 'MALE') out['sex'] = 'M';
  else if (sex === 'FEMALE') out['sex'] = 'F';

  const area = obj('currentAddress');
  if (area) {
    // the street line of the address (the name of the key is not in the draft of the spec: the usual ones are tried)
    out['currentAddress'] = text(area, 'address') || text(area, 'addressLine') || text(area, 'line') || text(area, 'street') || '';
    for (const [key, code, name] of [
      ['subDistrict', 'currentSubDistrictCode', 'currentSubDistrictName'],
      ['district', 'currentDistrictCode', 'currentDistrictName'],
      ['province', 'currentCityCode', 'currentCityName'],
      ['country', 'currentCountryCode', 'currentCountryName'],
    ] as const) {
      const o = isObj(area[key]) ? (area[key] as JObj) : null;
      put(code, text(o, 'code'));
      put(name, text(o, 'name'));
    }
    put('currentPostId', text(area, 'postCode'));
  }
  const pairs: ReadonlyArray<readonly [string, string, string]> = [
    ['occupation', 'occupationCode', 'occupationName'],
    ['salePerson', 'salePersonCode', 'salePersonName'],
    ['marketingChannel', 'marketingChanelCode', 'marketingChanelName'],
    ['contactBack', 'contactBackCode', 'contactBackName'],
    ['saleGroup', 'saleGroupCode', 'saleGroupName'],
  ];
  for (const [key, code, name] of pairs) {
    const o = obj(key);
    put(code, text(o, 'code'));
    put(name, text(o, 'name'));
  }
  return out;
}

/**
 * The documents of a prospect, from the answer of `GET /prospects/{id}?sections=…` (there is no list of attachments of its own): each attachment
 * `{ id, type { id, name }, description, createdAt, downloadUrl }` → the row the page reads (`docNo`, `attachFile` = the download path as the service
 * gave it, `fileName` = the description, else the type: the service keeps no file name). Oldest first, like the old list (the page reverses it).
 */
export function attachmentsEnvelope(answer: string): string {
  const root = parseJson(answer);
  const result = isObj(root) && isObj(root['result']) ? root['result'] : null;
  // `result.attachments` as a list, or as `{ items: [...] }` (the draft of the spec and the sections of the service differ on this)
  const atts = result ? result['attachments'] : undefined;
  const list = isArr(atts) ? atts : isObj(atts) && isArr(atts['items']) ? atts['items'] : [];
  const rows: JObj[] = [];
  for (const a of list) {
    if (!isObj(a)) continue;
    const type = isObj(a['type']) ? a['type'] : null;
    const typeName = type ? optString(type, 'name', '') : '';
    const description = optString(a, 'description', '');
    rows.push({
      docNo: optString(a, 'id', ''),
      attachFile: optString(a, 'downloadUrl', ''),
      description,
      fileName: description || typeName,
      attachFileTypeCode: type ? optString(type, 'code', typeName) : '',
      createdAt: optString(a, 'createdAt', ''),
    });
  }
  return JSON.stringify({ status: 200, result: rows });
}

/** the documents that came with a record (`sections=…,ATTACHMENTS`), kept for the first read of the documents of that prospect: no second call for them */
const KEPT = new Map<string, string>();
export const keepAttachments = (id: string, answer: string): void => void KEPT.set(id, attachmentsEnvelope(answer));
export function takeAttachments(id: string): string | undefined {
    const kept = KEPT.get(id);
    KEPT.delete(id);
    return kept;
}
