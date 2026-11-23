#!/usr/bin/env node
/**
 * `npm run mockup:users-doc` — writes manual/user.html: every account of the mockup (group code · user name · password · companies · roles · what to try),
 * read from the shared file server (Datasource: users · groups · branches · roles) so the page is the data as it is NOW.
 *   node tools/mockup-users-doc.mjs                 read the shared server (MOCKUP_REMOTE_URL + MOCKUP_TOKEN of .env.mockup.local)
 *   node tools/mockup-users-doc.mjs --file ds.json   read a saved copy of GET /mockup-api/ds-all instead
 *   node tools/mockup-users-doc.mjs --dir <Datasource folder>   read users/groups/branches/roles .json of a Datasource folder
 * The passwords are those of the TEST accounts of a mockup (the same as the user name) — never put a real password in the Datasource.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'manual/user.html');

/* ---------------------------------------------------------------------------------------------- what to try with each account */
const NOTES = {
  admin: 'super_admin — ผ่านทุกการตรวจสิทธิ์ ใช้ดูทุกหน้า/ทุกปุ่ม',
  demo: 'สิทธิ์เต็มแต่ไม่ใช่ super_admin (เหมือนผู้ใช้ทั่วไปที่ได้ทุกสิทธิ์) — ใช้ลองใช้งานทุกเมนู',
  multi: 'ใช้ได้ 2 บริษัท: SUN สิทธิ์เต็ม · ACE สิทธิ์ผู้ชม (เห็นแค่โอกาสขายกับปฏิทิน) — ลองหน้าเลือกบริษัท และ "เปลี่ยนบริษัท" ในเมนูผู้ใช้ (เมนู/ข้อมูลเปลี่ยนตามบริษัท)',
  multi2: 'มี 2 บริษัทแต่ ACE ถูกปิด (block) → ระบบเลือก SUN ให้เอง ไม่ถามบริษัท (กรณี "ได้บริษัทเดียวที่ใช้งานได้")',
  noactive: 'ไม่มีบริษัทที่ใช้งานได้ → ล็อกอินไม่ได้ ขึ้นข้อความ NO_ACTIVE_COMPANY พร้อมปุ่มออกจากระบบ',
  nosys: 'ไม่มีสิทธิ์ใช้ระบบ (systemAccess = false) → ล็อกอินไม่ได้ ขึ้นข้อความ NO_SYSTEM_ACCESS',
  disabled: 'บัญชีถูกปิด → ล็อกอินไม่ได้ (403)',
  sup: 'หัวหน้าทีม A: งานขายครบ + สิทธิ์หัวหน้า (_Sup) การมอบหมาย การเพิกถอน',
  sales: 'พนักงานขาย: งานขายทั่วไป ไม่มีสิทธิ์หัวหน้า/ผู้ดูแล/ถังขยะ — เห็นลูกค้า/โอกาสขายของตนเอง',
  head: 'หัวหน้าชั้นกลาง (E103): เห็นของตนและของลูกทีม (CS0004) — ลองกรองตามสายบังคับบัญชา',
  accounting: 'การเงิน/บัญชี: เอกสารงานขาย ใบรับเงิน รายงาน ดูโอกาสขายอย่างเดียว',
  report: 'เห็นเมนูรายงานอย่างเดียว',
  viewer: 'ผู้ชม: ดูโอกาสขายและปฏิทินอย่างเดียว',
  leadview: 'เมนู Lead อ่านอย่างเดียว ไม่เห็นข้อมูลลับ (เบอร์/อีเมล/ที่อยู่ถูกปิดบัง)',
  leadedit: 'แก้ Lead / บันทึกการติดต่อ / นัดหมาย เห็นข้อมูลลับ แต่ไม่มีสิทธิ์แปลงหรือลบ',
  leadqueue: 'ผู้ดูแลคิว Lead (Waitlist): ดูคิว รับ แจก เปลี่ยนผู้รับผิดชอบ',
  entityview: 'VIEW_ALL: เห็นทุกใบในบริษัท อ่านอย่างเดียว',
  entityadmin: 'VIEW_ALL + MASTER_EDIT_ALL + TRANSACTION_EDIT_ALL: เห็นและแก้ทุกใบในบริษัท (ใช้ดูข้อมูลทั้งบริษัท เช่น Lead ทั้งหมดของ SUN)',
  configurator: 'CONFIG_ALL: จัดการสมาชิกกลุ่มกิจกรรมที่ Waitlist (ไม่ต้องเป็นสมาชิกกลุ่ม)',
};

/** accounts of the LOCAL login only (`/login?local=1`, the old form without a group code): each makes one call of the sign-in fail */
const LOCAL_ONLY = [
  ['down', 'ระบบ login ไม่ตอบ (เหมือนสายหลุด)'],
  ['err500', 'login ตอบ 500 ไม่มีข้อความ'],
  ['html500', 'login ตอบ 500 เป็นหน้า HTML'],
  ['nojson', 'login ตอบ 200 แต่ไม่ใช่ JSON'],
  ['disabled', 'login ตอบ 403 พร้อมข้อความของมันเอง'],
  ['multimix', 'ต้องเลือกบริษัท แต่รายการบริษัทรูปแบบแปลก (ไม่มีรหัส/ชื่อ มี markup ในชื่อ)'],
  ['nobranch', 'รายการบริษัทว่าง'],
  ['branchfail / branchdown', 'ดึงรายการบริษัทแล้วตอบ 500 / ไม่ตอบ'],
  ['selectfail / selectdown', 'เลือกบริษัทแล้วตอบ 500 / ไม่ตอบ'],
  ['expire', 'เลือกบริษัทแล้วตอบ 401 (โทเค็นหมดอายุระหว่างรอ)'],
];

/* ---------------------------------------------------------------------------------------------- reading the data */
function loadEnv() {
  try {
    for (const line of readFileSync(resolve(root, '.env.mockup.local'), 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$/.exec(line);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
    }
  } catch {
    // no file: the settings come from the shell
  }
}

function fetchAll() {
  loadEnv();
  const { MOCKUP_REMOTE_URL: base, MOCKUP_TOKEN: token, MOCKUP_REMOTE_IP: ip } = process.env;
  if (!base || !token) throw new Error('Set MOCKUP_REMOTE_URL and MOCKUP_TOKEN in .env.mockup.local, or pass --file <ds-all.json>.');
  const url = new URL('/mockup-api/ds-all', base);
  return new Promise((ok, fail) => {
    const req = https.request(
      { hostname: ip || url.hostname, servername: url.hostname, port: url.port || 443, path: url.pathname, method: 'GET', headers: { Host: url.host, 'x-mockup-token': token } },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => (res.statusCode === 200 ? ok(JSON.parse(body)) : fail(new Error(`HTTP ${res.statusCode} from ${url.host}`))));
      },
    );
    req.on('error', fail);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

const fileAt = process.argv.indexOf('--file');
const dirAt = process.argv.indexOf('--dir');
const readDir = (d) => Object.fromEntries(['users', 'groups', 'branches', 'roles'].map((n) => [n, JSON.parse(readFileSync(resolve(d, `${n}.json`), 'utf8'))]));
const data = dirAt > 0 ? readDir(process.argv[dirAt + 1]) : fileAt > 0 ? JSON.parse(readFileSync(resolve(process.argv[fileAt + 1]), 'utf8')) : await fetchAll();
const users = data.users ?? [];
const groups = data.groups ?? [];
const branches = data.branches ?? [];
const roles = data.roles ?? [];
if (!users.length) throw new Error('The Datasource has no users.');

/* ---------------------------------------------------------------------------------------------- html */
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const code = (v) => `<code>${esc(v)}</code>`;
const branchName = (c) => {
  const b = branches.find((x) => x.code === c);
  return b ? `${esc(b.code)} <small>${esc(b.name)}</small>` : esc(c);
};
const roleName = (c) => roles.find((r) => r.code === c)?.name ?? c;
const roleChips = (list) => (list ?? []).map((c) => `<span class="chip" title="${esc(roleName(c))}">${esc(c)}</span>`).join(' ') || '<span class="muted">—</span>';

const group = groups[0] ?? { code: '', internalCode: '' };
const prefix = group.internalCode ? `${group.internalCode}.` : '';

const CATEGORIES = [
  ['all', 'ทั้งหมด'],
  ['full', 'สิทธิ์เต็ม'],
  ['role', 'ตามบทบาท'],
  ['multi', 'หลายบริษัท'],
  ['blocked', 'ล็อกอินไม่ได้'],
];
const FULL_ROLES = new Set(['full-access', 'super-admin', 'super_admin']);
/** a role group of the Seed Workbook that gives everything of its company (`<company>:ENTITY_ADMIN`) */
const isFullRole = (r) => FULL_ROLES.has(r) || String(r).endsWith(':ENTITY_ADMIN');
/** the group an account signs in under: its own `group` (the Seed Workbook accounts), else the first group (the hand-made accounts sign in under any) */
const groupOf = (u) => groups.find((g) => u.group && String(g.code).toLowerCase() === String(u.group).toLowerCase()) ?? group;
const noteOf = (u) => NOTES[u.username] ?? u.note ?? '';

const membershipsOf = (u) =>
  u.memberships?.length
    ? u.memberships
    : (u.branches?.length ? u.branches : ['']).map((company) => ({ company, employeeId: u.employeeId, employeeCode: u.employeeCode, roleGroups: u.roleGroups, status: 'release' }));

const isBlockedUser = (u, ms) => !!u.disabled || u.systemAccess === false || ms.every((m) => m.status && m.status !== 'release');

/** the filter group of an account (blocked > several companies > full access > by role) */
function categoryOf(u, ms) {
  if (isBlockedUser(u, ms)) return 'blocked';
  if (ms.length > 1) return 'multi';
  return ms.some((m) => (m.roleGroups ?? []).some(isFullRole)) ? 'full' : 'role';
}

const statusBadge = (m, u) => {
  if (u.disabled) return '<span class="badge bad">บัญชีถูกปิด</span>';
  if (u.systemAccess === false) return '<span class="badge bad">ไม่มีสิทธิ์ใช้ระบบ</span>';
  return m.status && m.status !== 'release' ? `<span class="badge bad">ปิดใช้งาน (${esc(m.status)})</span>` : '<span class="badge ok">ใช้งานได้</span>';
};

const copyBtn = (text, label) => `<button type="button" class="copy" data-copy="${esc(text)}" aria-label="คัดลอก${esc(label)}">คัดลอก</button>`;

function accountCard(u) {
  const ms = membershipsOf(u);
  const cat = categoryOf(u, ms);
  const own = groupOf(u);
  const login = `${own.internalCode ? `${own.internalCode}.` : ''}${u.username}`;
  const search = `${u.username} ${u.profileName} ${ms.flatMap((m) => m.roleGroups ?? []).join(' ')} ${noteOf(u)} ${own.code}`.toLowerCase();
  const companies = ms
    .map(
      (m) => `<li><div class="co-h"><b>${branchName(m.company)}</b>${statusBadge(m, u)}</div>
        <div class="co-b"><span class="muted">พนักงาน</span> ${esc(m.employeeCode ?? '—')} <small class="muted">(${esc(m.employeeId ?? '')})</small></div>
        <div class="co-b">${roleChips(m.roleGroups)}${u.extraRoles?.length && ms.length === 1 ? `<br><small class="muted">+ ${esc(u.extraRoles.join(', '))}</small>` : ''}</div></li>`,
    )
    .join('');
  return `<article class="acct" data-cat="${cat}" data-q="${esc(search)}">
  <header class="acct-h"><span class="avatar" aria-hidden="true">${esc([...String(u.profileName ?? u.username)][0] ?? '?')}</span>
    <div class="who"><h3>${esc(u.profileName)}</h3><p>${esc(noteOf(u))}</p></div></header>
  <dl class="cred">
    <div><dt>รหัสกลุ่ม</dt><dd>${code(own.code)}${copyBtn(own.code, 'รหัสกลุ่ม')}</dd></div>
    <div><dt>ชื่อผู้ใช้</dt><dd>${code(login)}${copyBtn(login, 'ชื่อผู้ใช้')}</dd></div>
    <div><dt>รหัสผ่าน</dt><dd>${code(u.password)}${copyBtn(u.password, 'รหัสผ่าน')}</dd></div>
  </dl>
  <p class="local">แบบเดิม (<code>/login?local=1</code>): <code>${esc(u.username)}</code></p>
  <ul class="cos">${companies}</ul>
</article>`;
}

const cards = users.map(accountCard).join('\n');
const counts = Object.fromEntries(CATEGORIES.map(([k]) => [k, k === 'all' ? users.length : users.filter((u) => categoryOf(u, membershipsOf(u)) === k).length]));
const filterChips = CATEGORIES.map(
  ([k, label], i) => `<button type="button" class="fchip" data-cat="${k}" aria-pressed="${i === 0}">${label} <span>${counts[k]}</span></button>`,
).join('');

const roleRows = roles
  .map(
    (r) => `<tr><td>${code(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.description ?? '')}</td>
      <td><details><summary>${(r.grant ?? []).length} รายการ</summary><div class="keys">${(r.grant ?? []).map(code).join(' ')}</div></details></td>
      <td>${(r.deny ?? []).length ? `<details><summary>${r.deny.length} รายการ</summary><div class="keys">${r.deny.map(code).join(' ')}</div></details>` : '<span class="muted">—</span>'}</td></tr>`,
  )
  .join('\n');

const branchRows = branches.map((b) => `<tr><td>${code(b.code)}</td><td>${esc(b.name)}</td><td>${esc(b.nameTh ?? '')}</td><td>${code(b.id)}</td></tr>`).join('\n');
const groupRows = groups.map((g) => `<tr><td>${code(g.code)}</td><td>${code(`${g.internalCode}.`)}</td><td>${esc(g.name)}</td></tr>`).join('\n');
const localRows = LOCAL_ONLY.map(([name, what]) => `<tr><td>${code(name)}</td><td>${esc(what)}</td></tr>`).join('\n');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

const STYLE = `
  :root { color-scheme: light dark; --bg:#f4f3f9; --surface:#fff; --surface-2:#faf9fd; --ink:#1f1b2e; --muted:#6b6780; --line:#e6e2f0; --primary:#35236a; --primary-2:#1f8f78; --ok:#0f7a4d; --ok-bg:#e3f5ec; --bad:#b3261e; --bad-bg:#fdeceb; --chip:#efeaff; --info-bg:#eef4ff; --info:#2b5fd9; --shadow:0 1px 2px rgba(31,27,46,.06),0 6px 18px rgba(31,27,46,.06); }
  @media (prefers-color-scheme: dark) { :root { --bg:#12101c; --surface:#1c1830; --surface-2:#221d3a; --ink:#ece9f6; --muted:#a29db8; --line:#322c4a; --primary:#b4a3f2; --primary-2:#5fd0b2; --ok:#6fd3a5; --ok-bg:#12372a; --bad:#ff9a92; --bad-bg:#3a1a19; --chip:#2b2447; --info-bg:#182544; --info:#8db4ff; --shadow:0 1px 2px rgba(0,0,0,.4); } }
  * { box-sizing:border-box; } html { scroll-behavior:smooth; scroll-padding-top:70px; }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.65 "Noto Sans Thai","Segoe UI",system-ui,sans-serif; }
  a { color:var(--primary); }
  .hero { background:linear-gradient(135deg,#35236a 0%,#4a2fa0 45%,#1f8f78 100%); color:#fff; padding:36px 24px 56px; }
  .hero-in { max-width:1200px; margin:0 auto; } .hero .eyebrow { font-size:12px; letter-spacing:.08em; text-transform:uppercase; opacity:.8; }
  .hero h1 { margin:4px 0 8px; font-size:28px; line-height:1.3; } .hero p { margin:0; max-width:760px; opacity:.92; } .hero a { color:#fff; }
  .hero .meta { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; } .hero .pill { background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.25); padding:2px 12px; border-radius:999px; font-size:12.5px; }
  nav.toc { position:sticky; top:0; z-index:10; background:color-mix(in srgb,var(--surface) 92%,transparent); backdrop-filter:blur(8px); border-bottom:1px solid var(--line); }
  nav.toc div { max-width:1200px; margin:0 auto; padding:0 16px; display:flex; gap:4px; overflow-x:auto; } nav.toc a { flex:0 0 auto; padding:12px 12px; color:var(--muted); text-decoration:none; font-weight:500; border-bottom:2px solid transparent; }
  nav.toc a:hover { color:var(--primary); border-color:var(--primary); }
  main { max-width:1200px; margin:-28px auto 0; padding:0 16px 64px; }
  section { margin-top:28px; } h2 { margin:0 0 4px; font-size:20px; color:var(--primary); } h2 + .lead { margin:0 0 14px; color:var(--muted); }
  .panel { background:var(--surface); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); padding:20px; }
  .callout { display:flex; gap:12px; padding:14px 18px; border-radius:14px; border:1px solid color-mix(in srgb,var(--info) 30%,transparent); background:var(--info-bg); box-shadow:var(--shadow); }
  .callout b { display:block; }
  .steps { list-style:none; margin:0; padding:0; display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); counter-reset:s; }
  .steps li { counter-increment:s; position:relative; padding:14px 14px 14px 52px; background:var(--surface); border:1px solid var(--line); border-radius:12px; box-shadow:var(--shadow); }
  .steps li::before { content:counter(s); position:absolute; left:14px; top:14px; width:26px; height:26px; border-radius:50%; background:var(--primary); color:var(--surface); display:grid; place-items:center; font-weight:700; font-size:13px; }
  code { font:12.5px ui-monospace,Consolas,monospace; background:var(--chip); padding:1px 7px; border-radius:6px; word-break:break-all; } small,.muted { color:var(--muted); }
  .table-wrap { overflow-x:auto; border:1px solid var(--line); border-radius:14px; background:var(--surface); box-shadow:var(--shadow); }
  table { width:100%; border-collapse:collapse; font-size:13px; } th,td { padding:10px 14px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
  th { background:var(--surface-2); font-weight:600; white-space:nowrap; color:var(--muted); font-size:12px; } tbody tr:hover { background:var(--surface-2); } tr:last-child td { border-bottom:none; }
  .toolbar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:14px; }
  input#q { flex:1 1 260px; max-width:380px; padding:10px 14px; border:1px solid var(--line); border-radius:999px; background:var(--surface); color:var(--ink); font:inherit; }
  input#q:focus,.fchip:focus-visible,.copy:focus-visible { outline:2px solid var(--primary); outline-offset:2px; }
  .fchips { display:flex; flex-wrap:wrap; gap:6px; } .fchip { border:1px solid var(--line); background:var(--surface); color:var(--ink); padding:6px 14px; border-radius:999px; font:inherit; cursor:pointer; }
  .fchip span { color:var(--muted); margin-left:4px; font-size:12px; } .fchip[aria-pressed="true"] { background:var(--primary); border-color:var(--primary); color:var(--surface); } .fchip[aria-pressed="true"] span { color:inherit; opacity:.8; }
  .grid { display:grid; gap:14px; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); }
  .acct { display:flex; flex-direction:column; gap:12px; padding:16px; background:var(--surface); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); }
  .acct[data-cat="blocked"] { border-style:dashed; } .acct[hidden] { display:none; }
  .acct-h { display:flex; gap:12px; align-items:flex-start; } .avatar { flex:0 0 auto; width:40px; height:40px; border-radius:12px; display:grid; place-items:center; background:linear-gradient(135deg,var(--primary),var(--primary-2)); color:#fff; font-weight:700; }
  .who h3 { margin:0; font-size:15px; line-height:1.35; } .who p { margin:2px 0 0; color:var(--muted); font-size:12.5px; line-height:1.5; }
  .cred { margin:0; display:grid; gap:6px; padding:10px 12px; background:var(--surface-2); border:1px solid var(--line); border-radius:12px; }
  .cred div { display:flex; align-items:center; gap:8px; } .cred dt { flex:0 0 68px; color:var(--muted); font-size:12px; } .cred dd { margin:0; display:flex; align-items:center; gap:8px; min-width:0; flex:1; }
  .copy { margin-left:auto; border:1px solid var(--line); background:var(--surface); color:var(--primary); border-radius:8px; padding:2px 10px; font:inherit; font-size:12px; cursor:pointer; } .copy:hover { background:var(--chip); } .copy.done { color:var(--ok); border-color:var(--ok); }
  .local { margin:0; font-size:12px; color:var(--muted); }
  .cos { list-style:none; margin:0; padding:0; display:grid; gap:8px; } .cos li { padding:8px 10px; border-left:3px solid var(--primary-2); background:var(--surface-2); border-radius:0 10px 10px 0; }
  .co-h { display:flex; justify-content:space-between; gap:8px; align-items:center; flex-wrap:wrap; } .co-b { font-size:12.5px; margin-top:2px; }
  .chip { display:inline-block; margin:1px 2px 1px 0; padding:0 9px; border-radius:999px; background:var(--chip); font-size:12px; }
  .badge { display:inline-block; padding:1px 10px; border-radius:999px; font-size:12px; font-weight:600; white-space:nowrap; } .ok { color:var(--ok); background:var(--ok-bg); } .bad { color:var(--bad); background:var(--bad-bg); }
  .empty { display:none; padding:28px; text-align:center; color:var(--muted); } .keys { margin-top:6px; max-width:520px; line-height:2; } details summary { cursor:pointer; color:var(--primary); }
  footer { margin-top:36px; color:var(--muted); font-size:12.5px; text-align:center; }
  @media (max-width:560px) { .hero { padding:24px 16px 48px; } .hero h1 { font-size:22px; } .grid { grid-template-columns:1fr; } }
  @media print { nav.toc,.toolbar,.copy { display:none; } .hero { background:none; color:#000; } .acct { break-inside:avoid; box-shadow:none; } }
`;

const SCRIPT = `
(function () {
  var q = document.getElementById('q'), cards = [].slice.call(document.querySelectorAll('.acct')), chips = [].slice.call(document.querySelectorAll('.fchip')), cat = 'all';
  var empty = document.getElementById('empty');
  function apply() {
    var text = q.value.trim().toLowerCase(), n = 0;
    cards.forEach(function (c) {
      var ok = (cat === 'all' || c.dataset.cat === cat) && (!text || c.dataset.q.indexOf(text) !== -1);
      c.hidden = !ok; if (ok) n++;
    });
    empty.style.display = n ? 'none' : 'block';
  }
  q.addEventListener('input', apply);
  chips.forEach(function (b) { b.addEventListener('click', function () { cat = b.dataset.cat; chips.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); apply(); }); });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.copy'); if (!b || !navigator.clipboard) return;
    navigator.clipboard.writeText(b.dataset.copy).then(function () { var t = b.textContent; b.textContent = 'คัดลอกแล้ว'; b.classList.add('done'); setTimeout(function () { b.textContent = t; b.classList.remove('done'); }, 1400); });
  });
})();
`;

const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>บัญชีทดสอบของ Mockup — Triple Sale</title>
<style>${STYLE}</style>
</head>
<body>
<header class="hero"><div class="hero-in">
  <div class="eyebrow">Triple Sale · Mockup</div>
  <h1>บัญชีทดสอบของ Mockup</h1>
  <p>ทุกบัญชีที่ล็อกอินได้ — รหัสกลุ่ม ชื่อผู้ใช้ รหัสผ่าน บริษัท พนักงาน กลุ่มสิทธิ์ และสิ่งที่ใช้ทดสอบ · กลับไปที่ <a href="index.html">คู่มือโครงสร้างระบบ</a></p>
  <div class="meta"><span class="pill">${users.length} บัญชี</span><span class="pill">${branches.length} บริษัท</span><span class="pill">${roles.length} กลุ่มสิทธิ์</span><span class="pill">ข้อมูล ณ ${today}</span></div>
</div></header>
<nav class="toc" aria-label="สารบัญ"><div><a href="#login">วิธีเข้าสู่ระบบ</a><a href="#accounts">บัญชีผู้ใช้</a><a href="#roles">กลุ่มสิทธิ์</a><a href="#companies">กลุ่มและบริษัท</a><a href="#errors">บัญชีทดสอบข้อผิดพลาด</a></div></nav>
<main>

<div class="callout" role="note"><div><b>เป็นบัญชีทดสอบเท่านั้น</b>รหัสผ่านของทุกบัญชีเหมือนชื่อผู้ใช้ และใช้ได้เฉพาะ mockup (ข้อมูลจำลอง) — ห้ามใส่รหัสผ่านจริงในข้อมูลของ mockup · สร้างหน้านี้ใหม่ได้ด้วย <code>npm run mockup:users-doc</code></div></div>

<section id="login">
  <h2>วิธีเข้าสู่ระบบ</h2><p class="lead">สามขั้นตอน — ใช้ปุ่ม "คัดลอก" ในการ์ดบัญชีเพื่อกรอกได้เร็วขึ้น</p>
  <ol class="steps">
    <li><b>กรอกรหัสกลุ่ม</b><br>เปิดระบบที่ <a href="https://acedemo.acecloud.co.th:52336/login" target="_blank" rel="noopener noreferrer"><code>https://acedemo.acecloud.co.th:52336/login</code></a> (เว็บที่ deploy แล้ว — ใช้จากข้างนอกได้) หรือบนเครื่องตัวเอง <code>http://localhost:4300</code> จาก <code>npm run mockup</code> แล้วกรอกรหัสกลุ่ม ${groups.map((g) => code(g.code)).join(' / ')} → ถัดไป · ระบบจำรหัสไว้ใน session ครั้งต่อไปไม่ถามอีก</li>
    <li><b>กรอกชื่อผู้ใช้และรหัสผ่าน</b><br>ที่หน้า Keycloak จำลอง ชื่อผู้ใช้ขึ้นต้นด้วยรหัสภายในของกลุ่มให้อัตโนมัติ (${groups.map((g) => code(`${g.internalCode}.`)).join(' ')}) เช่น ${code(`${prefix}multi`)} — บัญชีของ Seed Workbook (EG-A / EG-B) ล็อกอินได้เฉพาะกลุ่มของตน</li>
    <li><b>เลือกบริษัท</b><br>มีบริษัทเดียวที่ใช้งานได้ = เข้าเลย · มีหลายบริษัท = หน้าเลือกบริษัท · ข้อมูลทั้งระบบเป็นของบริษัทที่เลือก</li>
  </ol>
  <p class="muted" style="margin-top:10px">ล็อกอินแบบเดิม (ไม่มีรหัสกลุ่ม ไม่ต้องใส่ ${code(prefix)}): <code>/login?local=1</code></p>
</section>

<section id="accounts">
  <h2>บัญชีผู้ใช้ (${users.length} บัญชี)</h2><p class="lead">กรองตามประเภท หรือค้นหาด้วยชื่อ ชื่อผู้ใช้ กลุ่มสิทธิ์ และสิ่งที่ใช้ทดสอบ</p>
  <div class="toolbar">
    <input id="q" type="search" placeholder="ค้นหา: ชื่อผู้ใช้ · ชื่อ · กลุ่มสิทธิ์" aria-label="ค้นหาบัญชี">
    <div class="fchips" role="group" aria-label="กรองประเภทบัญชี">${filterChips}</div>
  </div>
  <div class="grid">
${cards}
  </div>
  <div id="empty" class="empty panel" role="status">ไม่พบบัญชีที่ตรงกับเงื่อนไข</div>
  <p class="muted" style="margin-top:10px">บัญชีที่มีหลายบริษัทแสดงพนักงานและกลุ่มสิทธิ์แยกตามบริษัท · เลื่อนเมาส์บนชื่อกลุ่มสิทธิ์เพื่อดูชื่อเต็ม</p>
</section>

<section id="roles">
  <h2>กลุ่มสิทธิ์ (roles)</h2><p class="lead">รายการสิทธิ์ที่อนุญาตและห้ามของแต่ละกลุ่ม</p>
  <div class="table-wrap"><table>
    <thead><tr><th>รหัส</th><th>ชื่อ</th><th>คำอธิบาย</th><th>อนุญาต (grant)</th><th>ห้าม (deny)</th></tr></thead>
    <tbody>${roleRows}</tbody>
  </table></div>
  <p class="muted" style="margin-top:10px"><code>*</code> ในรหัสสิทธิ์ = ตัวอักษรใดก็ได้ (เช่น <code>Pipeline_*</code>) · <code>deny</code> ชนะ <code>grant</code> เสมอ · key ทั้งหมดที่แอปรู้จักอยู่ที่ <code>src/app/core/permissions/roles.ts</code></p>
</section>

<section id="companies">
  <h2>รหัสกลุ่มและบริษัท</h2><p class="lead">รหัสกลุ่ม (entitygroup) ที่กรอกหน้าแรก และบริษัทที่เลือกได้</p>
  <div class="table-wrap" style="margin-bottom:14px"><table>
    <thead><tr><th>รหัสกลุ่ม (กรอกที่หน้าแรก)</th><th>นำหน้าชื่อผู้ใช้ Keycloak</th><th>ชื่อกลุ่ม</th></tr></thead>
    <tbody>${groupRows}</tbody>
  </table></div>
  <div class="table-wrap"><table>
    <thead><tr><th>รหัส</th><th>ชื่อ</th><th>ชื่อไทย</th><th>id</th></tr></thead>
    <tbody>${branchRows}</tbody>
  </table></div>
</section>

<section id="errors">
  <h2>บัญชีทดสอบข้อความผิดพลาด</h2><p class="lead">เฉพาะ <code>/login?local=1</code> — ไม่อยู่ใน Datasource กำหนดใน <code>src/app/core/http/auth-api.mock.ts</code> ใช้ดูข้อความผิดพลาดทุกแบบของหน้า Login แบบเดิม (รหัสผ่านอะไรก็ได้ ยกเว้น <code>wrong</code> = รหัสผ่านผิด)</p>
  <div class="table-wrap"><table>
    <thead><tr><th>ชื่อผู้ใช้</th><th>ผลที่ได้</th></tr></thead>
    <tbody>${localRows}</tbody>
  </table></div>
</section>

<footer>Triple Sale · Mockup — สร้างโดย tools/mockup-users-doc.mjs</footer>
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;

writeFileSync(OUT, html, 'utf8');
console.log(`manual/user.html: ${users.length} users, ${roles.length} roles, ${branches.length} companies, ${groups.length} group(s)`);
