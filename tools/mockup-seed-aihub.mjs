#!/usr/bin/env node
// สร้างข้อมูลตัวอย่างของเมนู Admin (token เท่านั้น) ให้ service ai-hub ในโหมด mockup (aihub.mockup.data-dir)
//
//   node tools/mockup-seed-aihub.mjs [--dir <Datasource>] [--out <โฟลเดอร์เขียน>] [--force] [--days 60] [--end 2026-11-21] [--seed N]
//
// อ่านจาก <Datasource> (ค่าเริ่มต้น env MOCKUP_DATASOURCE หรือ D:\mockup-data\Datasource):
//   seed.workbook.master.json (04_branch · 05_positionorganize = ฝ่าย · 08_position · 11_employee · 12_employee_position ·
//                              ทุกแถวมี "businessentity (code)") · seed.org.json · users.json · branches.json · groups.json
// เขียน (ค่าเริ่มต้นลงโฟลเดอร์เดียวกับที่อ่าน ; --out = โฟลเดอร์อื่น เช่น scratch สำหรับทดสอบ):
//   aihub.org.json    โครงองค์กร บริษัท → ฝ่าย/แผนก → พนักงาน (company.code = branch code ที่ session ของผู้ใช้ส่งมา)
//   aihub.usage.json  การใช้งาน AI ย้อนหลัง N วัน (token เท่านั้น — ไม่มีต้นทุน/ราคา/เครดิต : ค่าเป็น 0)
//   aihub.audit.json  การกระทำของผู้ดูแลตัวอย่าง (ตั้ง/ลบโควตา ส่งออก Audit)
//   aihub.quota.json  โควตา COMPANY / DEPARTMENT / USER ตัวอย่าง ให้เห็นสถานะ ok / warn / full
// ไม่เขียนทับไฟล์ aihub.*.json ที่มีอยู่แล้ว เว้นแต่ --force ; ผลซ้ำได้ทุกครั้ง (PRNG กำหนดแน่นอนจาก --seed)
// สัญญา: docs/ai-admin-token-api.md · ไม่มี dependency (Node 22)

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DIR = 'D:\\mockup-data\\Datasource';
const FILES = ['aihub.org.json', 'aihub.usage.json', 'aihub.audit.json', 'aihub.quota.json'];
const BANGKOK_OFFSET_MIN = 7 * 60;
const NO_DEPARTMENT = '-';
const NO_DEPARTMENT_NAME = 'ไม่ระบุฝ่าย/แผนก';

// ── เครื่องมือ AI ที่นับ token จริงของ service (id / กลุ่ม / ชื่อ ตรงกับ HubTool แต่ละตัวใน jar) ──────────────
// w = น้ำหนักการเลือก · inM/outM = ค่ากลางของ token เข้า/ออก · haiku = โอกาสใช้ Haiku แทน Sonnet
const TOOLS = [
  { id: 'chat', group: 'assistant', title: 'แชทกับผู้ช่วย AI', w: 22, inM: 900, outM: 600, haiku: 0.6, label: () => '' },
  { id: 'doc-analyze', group: 'document', title: 'วิเคราะห์เอกสาร', w: 18, inM: 9000, outM: 2200, haiku: 0.15, label: (r) => r.pick(DOC_FILES) },
  { id: 'doc-summary', group: 'document', title: 'สรุปเอกสาร', w: 13, inM: 7000, outM: 900, haiku: 0.5, label: (r) => r.pick(DOC_FILES) },
  { id: 'data-analyze', group: 'document', title: 'วิเคราะห์ข้อมูล', w: 7, inM: 5000, outM: 1800, haiku: 0.2, label: (r) => r.pick(DATA_FILES) },
  { id: 'doc-compare', group: 'document', title: 'เปรียบเทียบเอกสาร', w: 3, inM: 14000, outM: 2500, haiku: 0.1, label: (r) => r.pick(DOC_FILES) },
  { id: 'meeting', group: 'document', title: 'สรุปการประชุม', w: 3, inM: 16000, outM: 2800, haiku: 0.1, label: (r) => r.pick(MEETINGS) },
  { id: 'library-ask', group: 'knowledge', title: 'ถามคลังเอกสาร', w: 9, inM: 3500, outM: 700, haiku: 0.5, label: (r) => r.pick(QUESTIONS) },
  { id: 'howto', group: 'knowledge', title: 'ศึกษาวิธีทำงาน', w: 4, inM: 1500, outM: 1800, haiku: 0.3, label: (r) => r.pick(HOWTO) },
  { id: 'strategy', group: 'knowledge', title: 'วิเคราะห์กลยุทธ์', w: 4, inM: 2500, outM: 3200, haiku: 0.1, label: (r) => r.pick(STRATEGY) },
  { id: 'diagram', group: 'knowledge', title: 'สร้างแผนภาพ', w: 2, inM: 1800, outM: 2200, haiku: 0.3, label: (r) => r.pick(DIAGRAMS) },
  { id: 'code', group: 'developer', title: 'เขียนโค้ด', w: 5, inM: 3000, outM: 3500, haiku: 0.2, label: (r) => r.pick(CODE_FILES) },
  { id: 'slides', group: 'content', title: 'ทำสไลด์', w: 5, inM: 2200, outM: 3800, haiku: 0.1, label: (r) => r.pick(SLIDES) },
  { id: 'social', group: 'content', title: 'โพสต์โซเชียล', w: 6, inM: 800, outM: 900, haiku: 0.5, label: (r) => r.pick(SOCIAL) },
  { id: 'customer-brief', group: 'sales', title: 'สรุปลูกค้า', w: 9, inM: 2600, outM: 1200, haiku: 0.4, label: (r) => r.pick(CUSTOMERS) },
];
// model ใน ModelCatalog ของ service (key / modelId จริง)
const MODELS = {
  sonnet: { key: 'claude-sonnet', id: 'us.anthropic.claude-sonnet-5-5' },
  haiku: { key: 'claude-haiku', id: 'us.anthropic.claude-haiku-5-5' },
};
// น้ำหนักเพิ่มตามลักษณะงานของฝ่าย (ตรวจจากชื่อ/รหัสฝ่าย)
const DEPARTMENT_BIAS = [
  { match: /พัฒนา|DEV/i, boost: { code: 6, diagram: 2, chat: 1.3 } },
  { match: /ขาย|SALES|CRM|ดูแลหลัง|สินเชื่อ|บริการลูกค้า/i, boost: { 'customer-brief': 3, social: 1.2, 'library-ask': 1.5 } },
  { match: /การตลาด|MKT|Online/i, boost: { social: 4, slides: 3, strategy: 2 } },
  { match: /บริหาร|EXEC|ผู้บริหาร/i, boost: { strategy: 3, meeting: 3, 'doc-summary': 2 } },
  { match: /การเงิน|FI\b|ADMIN|นิติ|วิเคราะห์สินเชื่อ|AN\b/i, boost: { 'doc-analyze': 2, 'data-analyze': 3, 'doc-compare': 2 } },
];
const ERROR_CATEGORIES = ['TIMEOUT', 'THROTTLED', 'SERVICE_UNAVAILABLE', 'INVALID_RESPONSE'];

const DOC_FILES = ['สัญญาซื้อขาย.pdf', 'ใบเสนอราคา_Q4.pdf', 'รายงานประจำเดือน.docx', 'นโยบายบริษัท.pdf', 'ข้อกำหนดโครงการ.docx', 'บันทึกข้อตกลง.pdf', 'แผนงานปี 2027.pdf', 'ใบแจ้งหนี้ค้างชำระ.pdf'];
const DATA_FILES = ['ยอดขายรายเดือน.xlsx', 'รายชื่อลูกค้า.csv', 'ต้นทุนสินค้า.xlsx', 'ลีดแคมเปญ.xlsx', 'สต็อกคงเหลือ.csv'];
const MEETINGS = ['ประชุมทีมขายประจำสัปดาห์', 'ประชุมทบทวนเป้าไตรมาส', 'ประชุมโครงการ CRM', 'ประชุมผู้บริหารรายเดือน'];
const QUESTIONS = ['ขั้นตอนอนุมัติใบเสนอราคา', 'นโยบายการลาพักร้อน', 'เงื่อนไขการรับประกันสินค้า', 'วิธีเบิกค่าใช้จ่ายเดินทาง', 'อัตราค่าคอมมิชชั่น'];
const HOWTO = ['การทำ Pipeline ลูกค้าใหม่', 'การติดตามลีดที่เงียบไป', 'การเขียนอีเมลเสนอราคา', 'การจัดลำดับความสำคัญของงาน'];
const STRATEGY = ['กลยุทธ์ตลาดไตรมาส 1', 'วิเคราะห์คู่แข่งหลัก', 'แผนขยายช่องทางออนไลน์', 'ทบทวนราคาขาย'];
const DIAGRAMS = ['ผังขั้นตอนอนุมัติ', 'โครงสร้างองค์กร', 'Flow การรับลูกค้าใหม่'];
const CODE_FILES = ['report.service.ts', 'lead-import.mjs', 'quota.spec.ts', 'export-csv.ts', 'dashboard.scss'];
const SLIDES = ['สรุปผลงานไตรมาส', 'แนะนำสินค้าใหม่', 'นำเสนอลูกค้า VIP', 'แผนการตลาด 2027'];
const SOCIAL = ['โปรโมชันปลายปี', 'ประกาศรับสมัครงาน', 'ขอบคุณลูกค้า', 'เปิดตัวรุ่นใหม่'];
const CUSTOMERS = ['บริษัท ศรีสยามพาณิชย์', 'ห้างหุ้นส่วน ธนบุรีเทรด', 'บริษัท กรีนเฮาส์ ดีเวลลอปเมนท์', 'คุณสมศักดิ์ รักษาทรัพย์', 'บริษัท ไทยเมกะโลจิสติกส์'];

// ── ตัวช่วย ────────────────────────────────────────────────────────────────────────────────────────────

/** PRNG แบบ mulberry32 — ผลเหมือนเดิมทุกครั้งเมื่อ seed เท่ากัน */
function makeRandom(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    gauss: () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next()),
    weighted(items, weightOf) {
      const total = items.reduce((s, it) => s + weightOf(it), 0);
      let x = next() * total;
      for (const it of items) {
        x -= weightOf(it);
        if (x < 0) return it;
      }
      return items[items.length - 1];
    },
  };
}

function parseArgs(argv) {
  const opts = { dir: process.env.MOCKUP_DATASOURCE || DEFAULT_DIR, out: '', force: false, days: 60, end: '2026-11-21', seed: 20261121 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} ต้องมีค่า`);
      return argv[++i];
    };
    if (a === '--dir') opts.dir = value();
    else if (a === '--out') opts.out = value();
    else if (a === '--force') opts.force = true;
    else if (a === '--days') opts.days = Number.parseInt(value(), 10);
    else if (a === '--end') opts.end = value();
    else if (a === '--seed') opts.seed = Number.parseInt(value(), 10);
    else if (a === '--help' || a === '-h') opts.help = true;
    else throw new Error(`ไม่รู้จักตัวเลือก ${a}`);
  }
  if (!Number.isInteger(opts.days) || opts.days < 1 || opts.days > 400) throw new Error('--days ต้องเป็น 1–400');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.end)) throw new Error('--end ต้องเป็น yyyy-MM-dd');
  if (!Number.isInteger(opts.seed)) throw new Error('--seed ต้องเป็นจำนวนเต็ม');
  opts.out = opts.out || opts.dir;
  return opts;
}

const readJson = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const pad = (n, w = 2) => String(n).padStart(w, '0');

/** ISO เวลาไทย เช่น 2026-11-20T10:23:45+07:00 จากเวลา UTC (ms) */
function bangkokIso(utcMs) {
  const d = new Date(utcMs + BANGKOK_OFFSET_MIN * 60000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+07:00`;
}

/** ตัดวงเล็บท้ายชื่อผู้ใช้ทดลอง เช่น "สมชาย ใจดี (ทดลอง)" */
const cleanName = (s) => String(s || '').replace(/\s*\([^)]*\)\s*$/g, '').trim();

// ── โครงองค์กร ─────────────────────────────────────────────────────────────────────────────────────────

/** รายการสมาชิกของผู้ใช้ทุกคนในทุกบริษัท : { company, employeeCode, username, name } */
function membershipsOf(users) {
  const list = [];
  for (const u of users) {
    const ms = Array.isArray(u.memberships) && u.memberships.length
      ? u.memberships
      : (u.branches || []).map((company) => ({ company, employeeCode: u.employeeCode }));
    for (const m of ms) {
      const code = m.employeeCode || u.employeeCode;
      if (m.company && code) list.push({ company: m.company, employeeCode: String(code), username: u.username, name: cleanName(u.profileName) });
    }
  }
  return list;
}

/** ฝ่ายของพนักงาน SUN : ตำแหน่ง (เช่น "CS-Sup") ตรงรหัสกลุ่มใน seed.org.json ก่อน ไม่ก็กลุ่มแรกที่เป็นสมาชิก */
function sunDepartmentOf(code, org) {
  for (const p of org.employeePositions?.[code] || []) {
    const head = String(p).split(/[-\s]/)[0].toLowerCase();
    const g = org.groups.find((x) => String(x.code).toLowerCase() === head);
    if (g) return g;
  }
  return org.groups.find((g) => (org.groupMembers?.[g.id] || []).includes(code));
}

function addEmployee(company, deptCode, deptName, emp) {
  let dept = company.departments.find((d) => d.code === deptCode);
  if (!dept) {
    dept = { code: deptCode, name: deptName, employees: [] };
    company.departments.push(dept);
  }
  if (!company.departments.some((d) => d.employees.some((e) => e.id === emp.id))) dept.employees.push(emp);
}

function buildOrg({ branches, workbook, seedOrg, users }) {
  const memberships = membershipsOf(users);
  const usernameOf = (company, code) => memberships.find((m) => m.company === company && m.employeeCode === code)?.username || '';
  const companies = [];
  const byCode = new Map();
  const companyOf = (code) => {
    if (!byCode.has(code)) {
      const b = branches.find((x) => x.code === code);
      const c = { code, name: b?.nameTh || b?.name || code, departments: [] };
      byCode.set(code, c);
      companies.push(c);
    }
    return byCode.get(code);
  };
  for (const b of branches) companyOf(b.code);

  // บริษัท SUN : ฝ่าย = กลุ่มใน seed.org.json · พนักงาน = employees ของ seed.org
  const sun = companyOf('SUN');
  for (const g of seedOrg.groups) sun.departments.push({ code: `SUN-${g.code}`, name: g.name, employees: [] });
  for (const e of seedOrg.employees) {
    const g = sunDepartmentOf(e.code, seedOrg);
    addEmployee(sun, g ? `SUN-${g.code}` : NO_DEPARTMENT, g ? g.name : NO_DEPARTMENT_NAME,
      { id: e.code, name: e.name, username: usernameOf('SUN', e.code) });
  }

  // บริษัทใน workbook (A1/B1/B2) : ฝ่าย = 05_positionorganize · พนักงาน = 11_employee ผ่านตำแหน่งหลัก (12_employee_position + 08_position)
  const entity = (row) => row['businessentity (code)'];
  const positionDept = new Map(workbook['08_position'].map((p) => [`${entity(p)}|${p.code}`, p['positionorganize (code)']]));
  const mainPosition = new Map();
  for (const ep of workbook['12_employee_position']) {
    const key = `${entity(ep)}|${ep['employee (code)']}`;
    if (!mainPosition.has(key) || ep.is_main === 'Y') mainPosition.set(key, ep['position (code)']);
  }
  for (const d of workbook['05_positionorganize']) companyOf(entity(d)).departments.push({ code: d.code, name: d.name, employees: [] });
  for (const e of workbook['11_employee']) {
    const company = companyOf(entity(e));
    const deptCode = positionDept.get(`${entity(e)}|${mainPosition.get(`${entity(e)}|${e.code}`)}`);
    const dept = company.departments.find((d) => d.code === deptCode);
    addEmployee(company, dept ? dept.code : NO_DEPARTMENT, dept ? dept.name : NO_DEPARTMENT_NAME,
      { id: e.code, name: e.name, username: e['username (user)'] || usernameOf(entity(e), e.code) });
  }

  // ผู้ใช้ที่เข้าระบบได้จริงแต่ไม่อยู่ในข้อมูลองค์กรข้างบน (เช่น admin / ACE) = พนักงานไม่ระบุฝ่าย ของบริษัทที่เขาเข้า
  for (const m of memberships) {
    addEmployee(companyOf(m.company), NO_DEPARTMENT, NO_DEPARTMENT_NAME, { id: m.employeeCode, name: m.name, username: m.username });
  }
  for (const c of companies) {
    c.departments = c.departments.filter((d) => d.employees.length > 0 || d.code !== NO_DEPARTMENT);
    c.departments.sort((a, b) => (a.code === NO_DEPARTMENT) - (b.code === NO_DEPARTMENT));
  }
  return companies;
}

// ── การใช้งาน ───────────────────────────────────────────────────────────────────────────────────────────

/** วันที่ (yyyy-MM-dd) ย้อนหลังจากวันสุดท้าย N วัน เรียงเก่า → ใหม่ */
function daysBack(end, count) {
  const endMs = Date.UTC(...end.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  return Array.from({ length: count }, (_, i) => new Date(endMs - (count - 1 - i) * 86400000));
}

function toolWeights(deptKey) {
  const boosts = DEPARTMENT_BIAS.filter((b) => b.match.test(deptKey)).map((b) => b.boost);
  return new Map(TOOLS.map((t) => [t.id, t.w * boosts.reduce((m, b) => m * (b[t.id] || 1), 1)]));
}

/** ระดับการใช้ AI ของพนักงานแต่ละคน : หนัก / ปกติ / เบา / ไม่ใช้เลย */
function activityOf(random) {
  const x = random.next();
  if (x < 0.1) return { name: 'none', perDay: [0, 0], weekend: 0 };
  if (x < 0.3) return { name: 'light', perDay: [0, 2], weekend: 0.02 };
  if (x < 0.8) return { name: 'normal', perDay: [1, 4], weekend: 0.05 };
  return { name: 'heavy', perDay: [3, 7], weekend: 0.12 };
}

function makeRow(random, emp, company, branch, tool, atMs, status) {
  const model = random.chance(tool.haiku) ? MODELS.haiku : MODELS.sonnet;
  const ok = status === 'ok';
  const size = (mean) => Math.max(20, Math.round(mean * Math.exp(random.gauss() * 0.55)));
  const input = ok ? size(tool.inM) : 0;
  const output = ok ? size(tool.outM) : 0;
  return {
    id: 0,
    created_at: bangkokIso(atMs),
    created_by: emp.name,
    employee_id: emp.id,
    username: emp.username || null,
    employee_name: emp.name,
    ggwbranchid: branch?.id ?? null,
    ggwbranchcode: company.code,
    ggwbranchname: company.name,
    department_code: emp.deptCode === NO_DEPARTMENT ? null : emp.deptCode,
    department_name: emp.deptCode === NO_DEPARTMENT ? null : emp.deptName,
    tool_id: tool.id,
    tool_group: tool.group,
    model_key: model.key,
    model_id: model.id,
    models: model.id,
    input_tokens: input,
    output_tokens: output,
    total_tokens: input + output,
    images: 0,
    video_seconds: 0,
    audio_seconds: 0,
    status,
    error_category: ok ? null : random.pick(ERROR_CATEGORIES),
    elapsed_ms: ok ? random.int(900, 42000) : random.int(30000, 100000),
    label: ok ? tool.label(random) || null : null,
    cost_usd: 0,
    credits: 0,
  };
}

function buildUsage({ companies, branches, opts, random }) {
  const days = daysBack(opts.end, opts.days);
  const rows = [];
  const staff = companies.flatMap((c) => c.departments.flatMap((d) => d.employees.map((e) => ({
    company: c, branch: branches.find((b) => b.code === c.code), emp: { ...e, deptCode: d.code, deptName: d.name },
    weights: toolWeights(`${d.code} ${d.name}`), activity: activityOf(random),
  }))));
  for (const day of days) {
    const weekday = day.getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;
    for (const s of staff) {
      const count = isWeekend ? (random.chance(s.activity.weekend) ? 1 : 0) : random.int(...s.activity.perDay);
      for (let i = 0; i < count; i++) {
        const tool = random.weighted(TOOLS, (t) => s.weights.get(t.id));
        const minutes = random.int(8 * 60 + 15, 18 * 60);
        const atMs = day.getTime() + (minutes - BANGKOK_OFFSET_MIN) * 60000 + random.int(0, 59) * 1000;
        rows.push(makeRow(random, s.emp, s.company, s.branch, tool, atMs, random.chance(0.03) ? 'error' : 'ok'));
      }
    }
  }
  rows.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  rows.forEach((r, i) => { r.id = i + 1; });
  return rows;
}

// ── โควตา / audit ───────────────────────────────────────────────────────────────────────────────────────

const roundTo = (n, step) => Math.max(step, Math.round(n / step) * step);

/** ยอด token ของเดือนสุดท้าย แยกตามบริษัท / ฝ่าย / พนักงาน */
function monthUse(rows, monthPrefix) {
  const company = new Map();
  const dept = new Map();
  const user = new Map();
  for (const r of rows) {
    if (!r.created_at.startsWith(monthPrefix)) continue;
    const add = (m, k) => m.set(k, (m.get(k) || 0) + r.total_tokens);
    add(company, r.ggwbranchcode);
    add(dept, `${r.ggwbranchcode}|${r.department_code || NO_DEPARTMENT}`);
    add(user, `${r.ggwbranchcode}|${r.employee_id}`);
  }
  return { company, dept, user };
}

function buildQuotas({ companies, use, updatedAt }) {
  const rows = [];
  const find = (code) => companies.find((c) => c.code === code);
  const topUser = (companyCode, exclude) => {
    const c = find(companyCode);
    const all = c?.departments.flatMap((d) => d.employees.map((e) => ({ e, d, used: use.user.get(`${companyCode}|${e.id}`) || 0 }))) || [];
    return all.filter((x) => !exclude.includes(x.e.id) && x.used > 0).sort((a, b) => b.used - a.used)[0];
  };
  const base = (level, company, dept, userEmp, tokens, note, enabled = true) => ({
    level,
    branch_code: company.code,
    branch_name: company.name,
    department_code: dept ? dept.code : null,
    department_name: dept ? dept.name : null,
    user_key: userEmp ? userEmp.id : null,
    user_name: userEmp ? userEmp.name : null,
    monthly_tokens: tokens,
    monthly_cost_usd: 0,
    warn_percent: 80,
    enabled,
    note,
    updated_by: 'ผู้ดูแลระบบ',
    updated_at: updatedAt,
  });
  const put = (companyCode, level, deptCode, usedOf, percentOfLimit, note, opts = {}) => {
    const company = find(companyCode);
    const dept = deptCode ? company?.departments.find((d) => d.code === deptCode) : null;
    if (!company || (deptCode && !dept)) return undefined;
    const used = usedOf(company, dept);
    const tokens = opts.floor ? Math.max(1000, Math.floor((used * percentOfLimit) / 100)) : roundTo(used / (percentOfLimit / 100) || 1_000_000, 10_000);
    const row = base(level, company, dept, null, tokens, note, opts.enabled !== false);
    rows.push(row);
    return row;
  };
  const companyUsed = (c) => use.company.get(c.code) || 0;
  const deptUsed = (c, d) => use.dept.get(`${c.code}|${d.code}`) || 0;
  put('SUN', 'COMPANY', null, companyUsed, 62, 'โควตาซัน เกตเวย์ (ปกติ)');
  put('A1', 'COMPANY', null, companyUsed, 88, 'ใกล้เต็ม (เตือนที่ 80%)');
  put('B1', 'COMPANY', null, companyUsed, 33, 'โควตาบ้านดี เรสซิเดนซ์ (เหลือมาก)');
  put('SUN', 'DEPARTMENT', 'SUN-CS', deptUsed, 45, 'ฝ่ายบริการลูกค้า (ปกติ)');
  put('A1', 'DEPARTMENT', 'A1-PO-MKT', deptUsed, 91, 'ฝ่ายการตลาด ใกล้เต็ม');
  put('B2', 'DEPARTMENT', 'B2-PO-MKT', deptUsed, 90, 'ฝ่ายการตลาด B2 ใช้ครบแล้ว (ตัวอย่างสถานะเต็ม)', { floor: true });
  put('B1', 'DEPARTMENT', 'B1-PO-DEV', deptUsed, 50, 'ฝ่ายพัฒนา (ปิดใช้งานชั่วคราว)', { enabled: false });
  const fullUser = topUser('A1', ['A1-E001']);
  if (fullUser) {
    const c = find('A1');
    rows.push(base('USER', c, fullUser.d, fullUser.e, Math.max(1000, Math.floor(fullUser.used * 0.85)), 'พนักงานใช้ครบโควตาส่วนตัว (ตัวอย่างสถานะเต็ม)'));
  }
  const warnUser = topUser('SUN', ['E101', 'E001']);
  if (warnUser) {
    const c = find('SUN');
    rows.push(base('USER', c, warnUser.d, warnUser.e, roundTo(warnUser.used / 0.85, 5_000), 'พนักงานใกล้เต็มโควตาส่วนตัว'));
  }
  const okUser = topUser('B1', ['B1-E001']);
  if (okUser) rows.push(base('USER', find('B1'), okUser.d, okUser.e, roundTo(okUser.used * 3, 10_000), 'พนักงานมีโควตาส่วนตัว (ปกติ)'));
  return rows;
}

function buildAudit({ companies, branches, quotas, endDate }) {
  const adminOf = (companyCode) => {
    const c = companies.find((x) => x.code === companyCode);
    return c?.departments.flatMap((d) => d.employees).find((e) => e.username) || { id: 'E001', name: 'ผู้ดูแลระบบ', username: 'admin' };
  };
  const endMs = Date.UTC(...endDate.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  const at = (daysAgo, hour, minute) => endMs - daysAgo * 86400000 + ((hour * 60 + minute) - BANGKOK_OFFSET_MIN) * 60000;
  const eventOf = (companyCode, when, action, target, detail) => {
    const who = companyCode === 'SUN' ? { id: 'E001', name: 'ผู้ดูแลระบบ', username: 'admin' } : adminOf(companyCode);
    const branch = branches.find((b) => b.code === companyCode);
    return {
      created_at: bangkokIso(when),
      employee_id: who.id,
      username: who.username || null,
      employee_name: who.name,
      ggwbranchid: branch?.id ?? null,
      ggwbranchcode: companyCode,
      ggwbranchname: companies.find((c) => c.code === companyCode)?.name || companyCode,
      tool_id: 'admin-tokens',
      action,
      target: target || null,
      status: 'ok',
      error_category: null,
      detail: detail || null,
    };
  };
  const quotaDetail = (q) => `monthlyTokens=${q.monthly_tokens} · warnPercent=${q.warn_percent}`;
  const targetOf = (q) => `${q.level}|${q.branch_code}|${q.level === 'COMPANY' ? '' : q.level === 'DEPARTMENT' ? q.department_code : q.user_key}`;
  const events = quotas.slice(0, 6).map((q, i) => eventOf(q.branch_code, at(12 - i, 9 + (i % 5), 10 + i * 7), 'quota-save', targetOf(q), quotaDetail(q)));
  events.push(eventOf('A1', at(6, 15, 42), 'audit-export', null, 'days=7'));
  events.push(eventOf('SUN', at(4, 11, 5), 'quota-delete', 'DEPARTMENT|SUN|SUN-LS', null));
  events.push(eventOf('SUN', at(2, 16, 20), 'audit-export', null, 'days=30'));
  events.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  events.forEach((e, i) => { e.id = i + 1; });
  return events;
}

// ── เขียนไฟล์ ───────────────────────────────────────────────────────────────────────────────────────────

/** เขียนไฟล์ถ้ายังไม่มี (หรือสั่ง --force) — คืน true เมื่อเขียน */
function writeIfAllowed(file, text, force) {
  if (!force && fs.existsSync(file)) return false;
  fs.writeFileSync(file, text, { encoding: 'utf8', flag: 'w' });
  return true;
}

/** array ใหญ่ : 1 object ต่อบรรทัด (อ่านง่าย / diff ง่าย) */
const linesJson = (rows) => (rows.length ? `[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]\n` : '[]\n');

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
    return;
  }
  const input = {
    branches: readJson(opts.dir, 'branches.json'),
    workbook: readJson(opts.dir, 'seed.workbook.master.json'),
    seedOrg: readJson(opts.dir, 'seed.org.json'),
    users: readJson(opts.dir, 'users.json'),
  };
  readJson(opts.dir, 'groups.json'); // ต้องอ่านได้ (ชุดข้อมูลครบ) — ชื่อกลุ่มไม่ถูกใช้ในโครงบริษัท
  const random = makeRandom(opts.seed);
  const companies = buildOrg(input);
  const usage = buildUsage({ companies, branches: input.branches, opts, random });
  const monthPrefix = opts.end.slice(0, 7);
  const use = monthUse(usage, monthPrefix);
  const updatedAt = bangkokIso(Date.UTC(...opts.end.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v)))) + (10 * 60 - BANGKOK_OFFSET_MIN) * 60000);
  const quotas = buildQuotas({ companies, use, updatedAt });
  const audit = buildAudit({ companies, branches: input.branches, quotas, endDate: opts.end });

  fs.mkdirSync(opts.out, { recursive: true });
  const org = { updatedAt, companies };
  const outputs = {
    'aihub.org.json': `${JSON.stringify(org, null, 2)}\n`,
    'aihub.usage.json': linesJson(usage),
    'aihub.audit.json': linesJson(audit),
    'aihub.quota.json': `${JSON.stringify(quotas, null, 2)}\n`,
  };
  const counts = { 'aihub.org.json': `${companies.length} บริษัท`, 'aihub.usage.json': `${usage.length} แถว`, 'aihub.audit.json': `${audit.length} เหตุการณ์`, 'aihub.quota.json': `${quotas.length} โควตา` };
  for (const name of FILES) {
    const file = path.join(opts.out, name);
    console.log(writeIfAllowed(file, outputs[name], opts.force) ? `เขียน   ${file} (${counts[name]})` : `ข้าม    ${file} (มีอยู่แล้ว — ใช้ --force เพื่อเขียนทับ)`);
  }
  console.log(`\nข้อมูล ${opts.days} วัน ถึง ${opts.end} · เดือน ${monthPrefix} ใช้ไปแล้ว:`);
  for (const c of companies) {
    const headcount = c.departments.reduce((n, d) => n + d.employees.length, 0);
    console.log(`  ${c.code.padEnd(4)} ${String(use.company.get(c.code) || 0).padStart(10)} token · ${c.departments.length} ฝ่าย · ${headcount} คน · ${c.name}`);
  }
  const blocked = quotas.filter((q) => {
    const used = q.level === 'COMPANY' ? use.company.get(q.branch_code) : q.level === 'DEPARTMENT' ? use.dept.get(`${q.branch_code}|${q.department_code}`) : use.user.get(`${q.branch_code}|${q.user_key}`);
    return q.enabled && (used || 0) >= q.monthly_tokens;
  });
  for (const q of blocked) console.log(`  ! โควตาเต็ม (จะถูกปฏิเสธ 429 ในเดือน ${monthPrefix}): ${q.level} ${q.branch_code}/${q.level === 'USER' ? q.user_key : q.department_code || ''}`);
}

try {
  main();
} catch (e) {
  console.error(`mockup-seed-aihub: ${e.message}`);
  process.exitCode = 1;
}
