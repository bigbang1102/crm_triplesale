/**
 * The product word changed from "Lead" to "Opportunity" (Thai: "โอกาสขาย"). The Java dictionaries (messages_{th,en}.properties) still
 * say Lead, and their KEYS (label.topbar.lead …) are shared with the generated pages, so only the TEXT the user reads is reworded here,
 * by tools/convert-i18n.mjs after it parsed the .properties (so `npm run i18n:convert` and `--rebrand-only` give the same result).
 *
 * Only the whole word is changed: `leadId` / `lead_id` (field names that appear inside a message) stay as they are.
 */
const THAI = /[฀-๿]/;
const TH_WORD = 'โอกาสขาย';

function thai(value) {
  let v = value.replace(/ ?\(Leads?\)/g, ''); // "ลูกค้าจากโอกาสขาย (Lead)" -> "ลูกค้าจากโอกาสขาย"
  v = v.replace(/\s*\bLead ID\b/g, 'รหัส' + TH_WORD);
  // Thai is written without spaces around a Thai word: "สร้าง Lead หรือไม่" -> "สร้างโอกาสขายหรือไม่"
  return v.replace(/(\s*)\b(?:Leads?|leads?)\b(\s*)/g, (m, before, after, offset, str) => {
    const prevCh = str[offset - 1];
    const nextCh = str[offset + m.length];
    const head = before && prevCh !== undefined && !THAI.test(prevCh) ? before : '';
    const tail = after && nextCh !== undefined && !THAI.test(nextCh) ? after : '';
    return head + TH_WORD + tail;
  });
}

function english(value) {
  return value
    .replace(/\b([Aa]) (lead|Lead)\b/g, (m, a, w) => a + 'n ' + (w === 'Lead' ? 'Opportunity' : 'opportunity'))
    .replace(/\bLEADS\b/g, 'OPPORTUNITIES')
    .replace(/\bLEAD\b/g, 'OPPORTUNITY')
    .replace(/\bLeads\b/g, 'Opportunities')
    .replace(/\bleads\b/g, 'opportunities')
    .replace(/\bLead\b/g, 'Opportunity')
    .replace(/\blead\b/g, 'opportunity');
}

export function rebrandValue(value) {
  if (typeof value !== 'string' || !/\blead/i.test(value)) return value;
  return THAI.test(value) ? thai(value) : english(value);
}

/** returns a new dictionary; the keys are untouched */
export function rebrand(dict) {
  const out = {};
  for (const [k, v] of Object.entries(dict)) out[k] = rebrandValue(v);
  return out;
}
