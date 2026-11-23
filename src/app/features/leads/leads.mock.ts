/**
 * ข้อมูลจำลองของเมนู Lead (ไม่มี backend): 95 รายการตั้งต้น (New Lead 3 · Contacting 10 · Inactive 2 · Disqualified 20 · Converted 60
 * ตามดีไซน์) + การเพิ่ม / แก้ไข / ลบ / นำเข้า / เปลี่ยนสถานะ / บันทึกเป็นลูกค้าเป้าหมาย / สร้างโอกาสขาย / การติดต่อ / นัดหมาย.
 *
 * ไม่ผูก framework และ deterministic (ไม่ใช้ Date.now / Math.random — วันที่ที่ใช้ส่งมาเป็นอาร์กิวเมนต์ของคำสั่งเขียนทุกตัว) เพื่อให้
 * `journaledSync` (core/mockup) เล่นคำสั่งซ้ำตอนเปิดแอปครั้งต่อไปแล้วได้ข้อมูลเดิม.
 * ลูกค้าเป้าหมาย / โอกาสขายที่สร้างจาก Lead ไปอยู่ในฐานข้อมูลร่วม (core/mock/shared-db.ts) จึงโผล่ในหน้าอื่นด้วย.
 */
// FAST-DEBT(API): เมนู Lead ยังไม่มี backend · ข้อมูลทั้งหมดมาจาก mock นี้ ไม่เคยยิง API จริง · เมื่อมี API ให้สร้าง leads.api.ts แล้วสลับที่ leads.backend.ts · somyot · 2026-11-20
import { upsertSharedLead, upsertSharedProspect } from '@core/mock/shared-db';
import { castFilter } from '@core/mock/company-scope';
import { seedHash } from '@core/mock/crm-seed';
import { reference } from '@core/mock/reference';
import { employeeCodeOfOwner, isTransitionAllowed } from './leads.access';
import { phoneKey } from './leads.csv';
import { sendToQueue } from '@core/mock/waitlist';
import {
  LEAD_OWNERS,
  LEAD_SOURCES,
  type ContactKind,
  type ConvertForm,
  type ImportRow,
  type Lead,
  type LeadCounts,
  type LeadForm,
  type LeadItem,
  type LeadHistory,
  type LeadHistoryAction,
  type LeadQuery,
  type LeadScope,
  type LeadStatus,
} from './leads.types';

const FIRST = reference('leads.firstNames', ['มัลลิกา', 'อารยา', 'ชญานี', 'กรภัทร', 'ณัฐเดช', 'พิมพ์ภา', 'นภัสสร', 'สารภี', 'นิติธร', 'ปาณิศา', 'กิจพร', 'ณภัตรา', 'ธนกร', 'วรัญญา', 'ปกรณ์', 'กัญญ์วรา', 'ศุภวิชญ์', 'ลลิตา', 'ภูณัฐ', 'สุชาดา'] as const);
const LAST = reference('leads.lastNames', ['จิตราพรชัยวัฒนา', 'จันทรพร', 'สุวรรณเวชธาดา', 'ปั่นแก้ว', 'วรวงศ์คุณากร', 'กาญจนาศักดาพร', 'จันทรทรัพย์', 'ใจน้อม', 'พงศ์พัฒนา', 'ปรีดาศิริกุล', 'รุ่งทิพย์', 'โชคชัย', 'ศรีสวัสดิ์วงศ์', 'เลิศวิริยะกุล', 'เจริญรัตนากร'] as const);
const AREAS = reference('leads.areas', ['บางรัก, กรุงเทพมหานคร', 'สาทร, กรุงเทพมหานคร', 'Australia', '', '', ''] as const);
const SEED_COUNTS: Readonly<Record<LeadStatus, number>> = { new: 3, contacting: 10, inactive: 2, disqualified: 20, converted: 60 };
const NEWEST = '2026-11-04';

const pad = (n: number, w: number): string => String(n).padStart(w, '0');

/** `YYYY-MM-DD` ลบ `days` วัน (คำนวณแบบ UTC เพื่อไม่พึ่ง timezone) */
function minusDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) - days * 86_400_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1, 2)}-${pad(t.getUTCDate(), 2)}`;
}

/** สถานะของ Lead ลำดับที่ i (0 = ใหม่สุด) : สองรายการใหม่สุดเป็น New Lead ที่เหลือสลับตามจำนวนในดีไซน์ */
function statusPlan(): LeadStatus[] {
  const rest: LeadStatus[] = [];
  (Object.keys(SEED_COUNTS) as LeadStatus[]).forEach((s) => {
    const left = s === 'new' ? SEED_COUNTS[s] - 2 : SEED_COUNTS[s];
    for (let i = 0; i < left; i++) rest.push(s);
  });
  // สลับลำดับด้วย hash ของตำแหน่ง (จำนวนของแต่ละสถานะคงเดิม)
  const order = rest.map((s, i) => ({ s, k: seedHash(i, 92) })).sort((a, b) => a.k - b.k).map((x) => x.s);
  return ['new', 'new', ...order];
}

function seedLead(i: number, status: LeadStatus): Lead {
  const created = i < 2 ? NEWEST : minusDays(NEWEST, 3 + i * 2 + (seedHash(i, 93) % 3));
  const area = AREAS[seedHash(i, 94) % AREAS.length];
  const [district = '', province = ''] = area.split(', ');
  const mine = seedHash(i, 95) % 10 < 7;
  const ownerCode = mine ? LEAD_OWNERS[0].code : LEAD_OWNERS[1 + (seedHash(i, 99) % (LEAD_OWNERS.length - 1))].code;
  // ใบที่แปลงแล้วจดวันที่/ผู้แปลง/ผู้รับผิดชอบตอนแปลง (flow §3.10) — ไม่ผูก Prospect จริง (ข้อมูลตั้งต้นของลูกค้าเป็นอีกชุด)
  const conversion = status === 'converted' ? { convertedAt: minusDays(created, -3), convertedBy: ownerCode, convertedOwner: ownerCode } : {};
  return {
    ...conversion,
    id: 100 + i,
    code: `LD-P23-${pad(5671 - i * 7, 5)}`,
    createdDate: created,
    status,
    name: i === 0 ? 'มัลลิกา จิตราพรชัยวัฒนา' : `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 11) % LAST.length]}`,
    phoneCode: '+66',
    phone: `08${seedHash(i, 96) % 10}${pad(seedHash(i, 97) % 10_000_000, 7)}`,
    email: i % 3 === 0 ? `lead${i}@example.com` : '',
    source: LEAD_SOURCES[seedHash(i, 98) % LEAD_SOURCES.length],
    ownerCode,
    address: area && !province ? area : '',
    country: area === 'Australia' ? 'Australia' : 'ไทย',
    province,
    district,
    subdistrict: '',
    postcode: '',
    taxId: '',
    firstContactDate: minusDays(created, 5 + (seedHash(i, 100) % 40)),
    contacts: i % 4 === 0 ? [{ id: i * 10 + 1, kind: 'callOut', text: 'ลูกค้ายังไม่ได้ส่งเอกสารให้', at: `${minusDays(created, 1)} 11:00`, byCode: LEAD_OWNERS[0].code }] : [],
    items: i % 5 === 0 ? [{ id: i * 10 + 2, kind: 'appointment', title: 'นัดลูกค้า (หัวเรื่อง)', date: minusDays(created, -14), time: '09:30', allDay: false, detail: '', status: 'นัดหมาย' }] : [],
  };
}

const norm = (v: string): string => v.trim().toLowerCase();

const inScope = (l: Lead, scope: LeadScope): boolean => (scope === 'trash' ? !!l.trashed : !l.trashed && (scope === 'queue' ? l.ownerCode === '' : l.ownerCode !== ''));

const entry = (action: LeadHistoryAction, at: string, byCode: string, fromCode: string, toCode: string, reason: string): LeadHistory => ({ action, at, byCode, fromCode, toCode, reason });

const QUEUE_NAMES = reference('leads.queueNames', ['ชัยพร สายสุวรรณ', 'ธิดารัตน์ วงศ์ไพศาล', 'พงศกร ใจเย็น', 'วิมลรัตน์ บุญมาก'] as const);

/** Lead ที่ยังรอในคิว (Wait List): ไม่มีเจ้าของ · เรียงเก่าสุดก่อน */
function seedQueue(): Lead[] {
  return QUEUE_NAMES.map((name, j) => {
    const base = seedLead(900 + j, 'new');
    const created = minusDays(NEWEST, 1 + j * 2);
    return { ...base, id: 300 + j, code: `LD-P23-${pad(5000 - j, 5)}`, name, createdDate: created, firstContactDate: created, ownerCode: '', contacts: [], items: [], history: [entry('queueIn', `${created} 09:00`, '', '', '', '')] };
  });
}

/** แปลงเป็นลูกค้าเป้าหมายได้เมื่อ New / Contacting / Inactive (flow LD-53) */
const isConvertible = (l: Lead): boolean => l.status === 'new' || l.status === 'contacting' || l.status === 'inactive';

/** the seed leads of the company now (a lead the user added has an id from 1000: never filtered) */
const FIRST_ADDED_ID = 1000;
const ownShare = (mine: (id: number) => boolean) => (l: Lead): boolean => l.id >= FIRST_ADDED_ID || mine(l.id);

export class LeadsMock {
  // the leads the menu starts with: the list of the shared Datasource (`ref.leads.json` › leads) when it has one, else the formulas above
  // (each company starts with its own share of them: `company-scope.ts`; what a user adds has an id from 1000 and lives in the journal of its company)
  private leads: Lead[] = reference<Lead[]>('leads.leads', [...statusPlan().map((s, i) => seedLead(i, s)), ...seedQueue()]).filter(ownShare(castFilter()));
  private nextLeadId = 1000;
  private nextSub = 1;
  private nextProspectId = 2000;
  private nextOpportunityId = 8000;

  /** รายการตามสถานะ / ค้นหา / ตัวกรอง / เรียง + จำนวนของแต่ละสถานะ (นับหลังค้นหา+ตัวกรอง ก่อนเลือกสถานะ) */
  list(q: LeadQuery): { rows: Lead[]; counts: LeadCounts } {
    const needle = norm(q.search);
    const f = q.filter;
    const searchable = (l: Lead): string[] => (q.searchContacts === false ? [l.name, l.code] : [l.name, l.phone, l.code, l.email]);
    const scope = q.scope ?? 'owned';
    const matched = this.leads.filter((l) => {
      if (!inScope(l, scope) || (q.canSee && !q.canSee(l))) return false;
      if (needle && !searchable(l).some((v) => norm(v).includes(needle))) return false;
      if (f.sources.length && !f.sources.includes(l.source)) return false;
      if (f.ownerCode && l.ownerCode !== f.ownerCode) return false;
      if (f.dateFrom && l.createdDate < f.dateFrom) return false;
      if (f.dateTo && l.createdDate > f.dateTo) return false;
      return true;
    });
    const counts: LeadCounts = { all: matched.length, new: 0, contacting: 0, inactive: 0, disqualified: 0, converted: 0 };
    for (const l of matched) counts[l.status]++;
    const rows = matched.filter((l) => !q.status || l.status === q.status);
    rows.sort((a, b) => {
      // คิวเรียงเก่าสุดก่อนเสมอ (flow LD-37)
      if (scope === 'queue') return a.createdDate.localeCompare(b.createdDate) || a.id - b.id;
      if (q.sort === 'name') return a.name.localeCompare(b.name, 'th');
      const byDate = a.createdDate.localeCompare(b.createdDate) || a.id - b.id;
      return q.sort === 'oldest' ? byDate : -byDate;
    });
    return { rows, counts };
  }

  /** ใบที่ยังไม่อยู่ในถังขยะ (ใบในถังเหมือนไม่มี) */
  get(id: number): Lead | undefined {
    return this.leads.find((l) => l.id === id && !l.trashed);
  }

  /**
   * ใบที่ใช้งานอยู่และเบอร์ตรงกัน (ไม่นับใบในถังและใบ Disqualified — flow §3.9 LD-65) : ไว้เตือนตอนสร้าง/กู้คืน ; `0000` ไม่ใช้ตรวจซ้ำ
   */
  duplicatesOf(phone: string, exceptId = -1): Lead[] {
    const key = phoneKey(phone);
    return key ? this.leads.filter((l) => l.id !== exceptId && !l.trashed && l.status !== 'disqualified' && phoneKey(l.phone) === key) : [];
  }

  /** ใบที่อยู่ในถังขยะ */
  getTrashed(id: number): Lead | undefined {
    return this.leads.find((l) => l.id === id && l.trashed);
  }

  /** ตัวเลือกที่มาในตัวกรอง = ที่มาที่ใช้อยู่จริง */
  sources(): string[] {
    return [...new Set(this.leads.map((l) => l.source))].sort();
  }

  /* ================================================================================================ writes (journaled) */

  create(form: LeadForm, today: string): Lead {
    const id = this.nextLeadId++;
    const lead: Lead = {
      ...form,
      history: form.ownerCode === '' ? [entry('queueIn', `${today} 00:00`, '', '', '', '')] : [],
      id,
      code: `LD-P26-${pad(id - 999, 5)}`,
      createdDate: today,
      status: 'new',
      firstContactDate: today,
      contacts: [],
      items: [],
    };
    this.leads = [...this.leads, lead];
    return lead;
  }

  update(id: number, form: LeadForm): Lead | undefined {
    return this.patch(id, (l) => ({ ...l, ...form }));
  }

  /** เปลี่ยนสถานะด้วยมือตามตารางของ flow §3.2 (ไม่อนุญาต = ไม่เปลี่ยนและคืน undefined) */
  setStatus(id: number, status: LeadStatus): Lead | undefined {
    const lead = this.get(id);
    if (!lead || !isTransitionAllowed(lead.status, status)) return undefined;
    return this.patch(id, (l) => ({ ...l, status }));
  }

  /** ย้ายไปถังขยะ (ไม่ลบจริง) — ใบ Converted ลบไม่ได้ (flow §3.6) */
  remove(id: number, byCode = '', at = ''): boolean {
    const lead = this.get(id);
    if (!lead || lead.status === 'converted') return false;
    this.patch(id, (l) => ({ ...l, trashed: true, trashedAt: at.slice(0, 10), trashedBy: byCode, history: [...(l.history ?? []), entry('trash', at, byCode, l.ownerCode, l.ownerCode, '')] }));
    return true;
  }

  /**
   * กู้คืนจากถังขยะ: ตรวจซ้ำก่อน — เบอร์ตรงกับใบอื่นที่ใช้งานอยู่ (ไม่อยู่ถัง ไม่ใช่ Disqualified) = `duplicate` ไม่กู้ (flow §3.6, §3.9) ;
   * กลับเป็นใบเดิม (สถานะ · เจ้าของ · ประวัติเหมือนก่อนลบ) ; ใบที่ลบตอนอยู่ในคิวกลับเข้าคิว
   */
  restore(id: number, byCode: string, at: string): 'ok' | 'missing' | 'duplicate' {
    const lead = this.getTrashed(id);
    if (!lead) return 'missing';
    const key = phoneKey(lead.phone);
    if (key && this.leads.some((l) => l.id !== id && !l.trashed && l.status !== 'disqualified' && phoneKey(l.phone) === key)) return 'duplicate';
    this.patch(id, (l) => ({ ...l, trashed: false, trashedAt: undefined, trashedBy: undefined, history: [...(l.history ?? []), entry('restore', at, byCode, l.ownerCode, l.ownerCode, '')] }));
    return 'ok';
  }

  /**
   * รับ / แจก / เปลี่ยนผู้รับผิดชอบ: `take` และ `give` ใช้ได้เฉพาะใบที่ยังรออยู่ในคิว (คนแรกได้ คนที่สองได้ undefined = "มีคนรับไปแล้ว") ;
   * `change` ใช้กับใบที่มีเจ้าของและยังไม่ปิด (New / Contacting / Inactive) → ใบที่ได้ หรือ undefined
   */
  assign(id: number, kind: 'take' | 'give' | 'change', toCode: string, byCode: string, at: string, reason = ''): Lead | undefined {
    const lead = this.get(id);
    if (!lead || !toCode) return undefined;
    if (kind === 'change' ? lead.ownerCode === '' || !isConvertible(lead) || lead.ownerCode === toCode : lead.ownerCode !== '') return undefined;
    return this.patch(id, (l) => ({ ...l, ownerCode: toCode, history: [...(l.history ?? []), entry(kind, at, byCode, l.ownerCode, toCode, reason)] }));
  }

  /** คืนเข้าคิว: ใบมีเจ้าของและยังไม่ปิด · ต้องบอกเหตุผล (flow LD-36) · นัด/งาน/บันทึกการติดต่อค้างเป็นของเดิม */
  returnToQueue(id: number, byCode: string, at: string, reason: string): Lead | undefined {
    const lead = this.get(id);
    if (!lead || lead.ownerCode === '' || !isConvertible(lead) || !reason.trim()) return undefined;
    return this.patch(id, (l) => ({ ...l, ownerCode: '', history: [...(l.history ?? []), entry('return', at, byCode, l.ownerCode, '', reason.trim())] }));
  }

  /** นำเข้ารายชื่อที่เลือก (เฉพาะแถวที่ `new`) → จำนวนที่เพิ่ม */
  importRows(rows: readonly ImportRow[], source: string, ownerCode: string, today: string): number {
    let added = 0;
    for (const r of rows) {
      if (r.state !== 'new') continue;
      this.create(
        {
          name: `${r.firstName} ${r.lastName}`.trim(),
          phoneCode: '+66',
          phone: r.phone,
          email: r.email,
          source,
          ownerCode,
          address: r.address,
          country: 'ไทย',
          province: '',
          district: '',
          subdistrict: '',
          postcode: '',
          taxId: '',
        },
        today,
      );
      added++;
    }
    return added;
  }

  /**
   * บันทึกเป็นลูกค้าเป้าหมาย: ลูกค้าไปอยู่ในฐานข้อมูลร่วม (ทุกหน้าเห็น) และ Lead เป็น Converted อ่านอย่างเดียวคงอยู่ในรายการ
   * พร้อมจด Prospect ที่เกิด · ผู้แปลง · ผู้รับผิดชอบตอนแปลง · วันที่ (flow §3.10) → id ลูกค้า ; ใบที่แปลงไม่ได้ (Converted / Disqualified) → undefined
   */
  convert(id: number, form: ConvertForm, today: string, byCode = ''): number | undefined {
    const lead = this.get(id);
    if (!lead || !isConvertible(lead)) return undefined;
    const prospectId = this.addProspect(lead, today, form.ownerCode);
    // ไม่เลือกผู้รับผิดชอบ = ส่งลูกค้าเป้าหมายเข้า Wait List ของ Prospect (assignment.destination = WAITLIST — flow §3.10)
    if (form.ownerCode === '') sendToQueue('prospect', prospectId, today, lead.ownerCode);
    this.patch(id, (l) => ({ ...l, status: 'converted', prospectId, convertedAt: today, convertedBy: byCode, convertedOwner: form.ownerCode }));
    return prospectId;
  }

  /** สร้างโอกาสขาย + บันทึกลูกค้าเป้าหมาย: เหมือน `convert` และเปิดโอกาสขายให้ลูกค้าคนนั้น (ผู้รับผิดชอบตามที่เลือก) */
  createOpportunity(id: number, form: ConvertForm, today: string, byCode = ''): { prospectId: number; opportunityId: number } | undefined {
    const lead = this.get(id);
    if (!lead || !isConvertible(lead)) return undefined;
    const prospectId = this.addProspect(lead, today, form.ownerCode);
    const opportunityId = this.nextOpportunityId++;
    upsertSharedLead(opportunityId, { prospectId, status: 'ACTIVE', interest: 'NEW', groupIdx: 0, createdDate: today, ownerCode: employeeCodeOfOwner(form.ownerCode) || undefined }, true);
    this.patch(id, (l) => ({ ...l, status: 'converted', prospectId, opportunityId, convertedAt: today, convertedBy: byCode, convertedOwner: form.ownerCode }));
    return { prospectId, opportunityId };
  }

  /** บันทึกการติดต่อ: ใบ Converted และ Disqualified (ดูอย่างเดียว · flow §3.2) บันทึกไม่ได้ ; New / Inactive เป็น Contacting อัตโนมัติ (flow T2, T4) */
  addContact(id: number, kind: ContactKind, text: string, at: string, byCode: string, system = false): void {
    const lead = this.get(id);
    // `system`: a note the system writes itself (the reason of a status change) — it is kept on a Disqualified lead too and does not wake it
    if (!lead || lead.status === 'converted' || (lead.status === 'disqualified' && !system)) return;
    const wake = !system && (lead.status === 'new' || lead.status === 'inactive');
    this.patch(id, (l) => ({ ...l, status: wake ? 'contacting' : l.status, contacts: [{ id: this.nextSub++ + 100_000, kind, text, at, byCode }, ...l.contacts] }));
  }

  addItem(id: number, item: Omit<LeadItem, 'id'>): void {
    const lead = this.get(id);
    if (!lead || lead.status === 'converted' || lead.status === 'disqualified') return;
    this.patch(id, (l) => ({ ...l, items: [...l.items, { ...item, id: this.nextSub++ + 200_000 }] }));
  }

  /* ================================================================================================ helpers */

  private patch(id: number, fn: (l: Lead) => Lead): Lead | undefined {
    let out: Lead | undefined;
    this.leads = this.leads.map((l) => (l.id === id ? (out = fn(l)) : l));
    return out;
  }

  /** `ownerCode` is the code of the Lead menu (CS000x); the shared database knows the employee (E10x) — empty = no owner (the queue) */
  private addProspect(lead: Lead, today: string, ownerCode = ''): number {
    const prospectId = this.nextProspectId++;
    const [first = '', ...rest] = lead.name.trim().split(/\s+/);
    upsertSharedProspect(
      prospectId,
      { fullName: lead.name, firstName: first, lastName: rest.join(' '), code: `P${pad(prospectId, 5)}`, phone: lead.phone, email: lead.email, province: lead.province, source: lead.source, createdDate: today, ...(ownerCode ? { ownerCode: employeeCodeOfOwner(ownerCode) } : {}) },
      true,
    );
    return prospectId;
  }
}

/** asks for every list once, so the export of the Datasource documents (tools/mockup-export-seed.mjs) can write them */
export const registerReferenceLists = (): void => void new LeadsMock();
