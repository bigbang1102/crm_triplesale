#!/usr/bin/env node
/**
 * Regenerates the data-driven parts of manual/index.html from
 * src/app/core/navigation/page-registry.json, so the manual can never drift from the router.
 *
 *   npm run manual:sync
 *
 * Everything between  <!-- AUTO:name -->  and  <!-- /AUTO:name -->  is replaced.
 * Hand-written text outside those markers is never touched.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = join(root, 'src/app/core/navigation/page-registry.json');
const manualPath = join(root, 'manual/index.html');

const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const { pages, phases, statuses } = registry;

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const STATUS_LABEL = {
  live: 'ใช้งานจริง',
  'live-ui': 'UI เสร็จ/ไม่มี API',
  mock: 'ข้อมูลจำลอง',
  system: 'หน้าระบบ',
};
const POINTS = { S: 1, M: 3, L: 5, XL: 8 };

const statusBadge = (s) => `<span class="badge st-${esc(s)}">${esc(STATUS_LABEL[s] ?? s)}</span>`;
const sizeBadge = (s) => `<span class="badge size-${esc(s)}">${esc(s)}</span>`;
const code = (s) => `<code>${esc(s)}</code>`;
const phaseName = (id) => phases.find((p) => p.id === id)?.name ?? '';

const blocks = {};

/* ---------- stats ------------------------------------------------------------------------- */
{
  const total = pages.length;
  const implemented = pages.filter((p) => p.implemented).length;
  const byStatus = Object.keys(statuses).map((k) => [k, pages.filter((p) => p.status === k).length]);
  const points = pages.reduce((n, p) => n + (POINTS[p.size] ?? 0), 0);
  const donePoints = pages.filter((p) => p.implemented).reduce((n, p) => n + (POINTS[p.size] ?? 0), 0);
  blocks.stats = `
<div class="stats">
  <div class="stat"><b>${total}</b><span>หน้า/เส้นทางทั้งหมด</span></div>
  <div class="stat ok"><b>${implemented}</b><span>ย้ายเสร็จแล้ว</span></div>
  <div class="stat"><b>${total - implemented}</b><span>ยังเป็น placeholder</span></div>
  <div class="stat"><b>${donePoints}/${points}</b><span>คะแนนงาน (S=1 M=3 L=5 XL=8)</span></div>
  ${byStatus.map(([k, n]) => `<div class="stat"><b>${n}</b><span>${esc(STATUS_LABEL[k] ?? k)}</span></div>`).join('\n  ')}
</div>`;
}

/* ---------- page table --------------------------------------------------------------------- */
{
  const rows = pages
    .map(
      (p) => `
    <tr id="page-${esc(p.id)}">
      <td><b>${esc(p.title.th)}</b><br><small>${code(p.id)}</small></td>
      <td>${code('/' + p.route)}</td>
      <td>${p.requires ? code(p.requires) : '<small class="muted">—</small>'}${p.flag ? `<br><small>flag: ${code(p.flag)}</small>` : ''}</td>
      <td>${statusBadge(p.status)}${p.implemented ? ' <span class="badge done">ย้ายแล้ว</span>' : ''}</td>
      <td class="nowrap">เฟส ${p.phase} ${sizeBadge(p.size)}</td>
      <td>${p.legacy.map((f) => `<div>${code(f)}</div>`).join('')}</td>
    </tr>`,
    )
    .join('');
  blocks.pages = `
<div class="table-wrap">
<table class="data">
  <thead><tr><th>หน้า</th><th>Route ใหม่</th><th>สิทธิ์ที่ต้องมี</th><th>สถานะเดิม</th><th>เฟส / ขนาด</th><th>ไฟล์ต้นทาง (Java)</th></tr></thead>
  <tbody>${rows}
  </tbody>
</table>
</div>`;
}

/* ---------- roadmap ------------------------------------------------------------------------ */
{
  blocks.roadmap = phases
    .map((ph) => {
      const list = pages.filter((p) => p.phase === ph.id);
      const pts = list.reduce((n, p) => n + (POINTS[p.size] ?? 0), 0);
      const items = list
        .map(
          (p) => `
      <details class="page-detail">
        <summary>${esc(p.title.th)} ${sizeBadge(p.size)} ${statusBadge(p.status)} ${p.implemented ? '<span class="badge done">ย้ายแล้ว</span>' : ''}<small class="muted"> ${code('/' + p.route)}</small></summary>
        <div class="detail-body">
          ${p.notes ? `<p>${esc(p.notes)}</p>` : ''}
          ${p.apis.length ? `<h5>API</h5><ul>${p.apis.map((a) => `<li>${code(a)}</li>`).join('')}</ul>` : ''}
          <h5>ไฟล์ต้นทาง</h5><ul>${p.legacy.map((f) => `<li>${code(f)}</li>`).join('')}</ul>
        </div>
      </details>`,
        )
        .join('');
      return `
<section class="phase" id="phase-${ph.id}">
  <header><h4>เฟส ${ph.id} — ${esc(ph.name)}</h4><span class="pts">${list.length} หน้า · ${pts} คะแนน</span></header>
  <p class="goal">${esc(ph.goal)}</p>
  ${items || '<p class="muted">—</p>'}
</section>`;
    })
    .join('\n');
}

/* ---------- permission matrix --------------------------------------------------------------- */
{
  const byRole = new Map();
  for (const p of pages) {
    if (!p.requires) continue;
    for (const key of p.requires.split(',').map((k) => k.trim())) {
      if (!byRole.has(key)) byRole.set(key, []);
      byRole.get(key).push(p);
    }
  }
  const rows = [...byRole.entries()]
    .map(
      ([key, list]) =>
        `<tr><td>${code(key)}</td><td>${list.map((p) => `<a href="#page-${esc(p.id)}">${esc(p.title.th)}</a>`).join(' · ')}</td></tr>`,
    )
    .join('');
  const open = pages.filter((p) => !p.requires && p.navGroup);
  blocks.guards = `
<div class="table-wrap">
<table class="data">
  <thead><tr><th>Role key</th><th>หน้าที่ต้องใช้ key นี้</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>
<p class="muted">หน้าที่ <b>ไม่มี</b> สิทธิ์เฉพาะ (ผู้ที่ login แล้วทุกคนเข้าได้ — เหมือน PageAccessRules เดิม): ${open
    .map((p) => esc(p.title.th))
    .join(' · ')}</p>`;
}

/* ---------- route tree --------------------------------------------------------------------- */
{
  const tree = pages
    .map((p) => `${p.route.padEnd(30)} ${p.id}${p.implemented ? '' : '  (placeholder)'}`)
    .join('\n');
  blocks.routes = `<pre><code>${esc(`login                          login   (นอก Shell)\n${tree}\n**                             not-found`)}</code></pre>`;
}

/* ---------- apply -------------------------------------------------------------------------- */
let html = readFileSync(manualPath, 'utf8');
let replaced = 0;
for (const [name, body] of Object.entries(blocks)) {
  // global: a block (e.g. `stats`) may appear in several places of the manual
  const re = new RegExp(`(<!-- AUTO:${name} -->)[\\s\\S]*?(<!-- /AUTO:${name} -->)`, 'g');
  const found = html.match(re)?.length ?? 0;
  if (!found) {
    console.warn(`marker AUTO:${name} not found in manual/index.html`);
    continue;
  }
  html = html.replace(re, (_, a, b) => `${a}\n${body}\n${b}`);
  replaced += found;
}

const today = new Date().toISOString().slice(0, 10);
html = html.replace(/(<!-- AUTO:date -->)[\s\S]*?(<!-- \/AUTO:date -->)/, `$1${today}$2`);
writeFileSync(manualPath, html, 'utf8');
console.log(`manual synced: ${replaced} blocks, ${pages.length} pages, ${phases.length} phases (${today})`);
