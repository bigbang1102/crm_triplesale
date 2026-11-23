# ตัวเทียบหน้า Java กับ Angular (headless)

ตรวจว่าหน้าที่พอร์ตมา **เหมือนหน้า Java จริง** — DOM, ข้อความ, attribute, ตำแหน่ง/ขนาด, computed style และพิกเซลของ `<canvas>` (ECharts) ทีละบรรทัด ทั้งตอนเปิดหน้าและหลังทำ "สถานการณ์" (คลิกแท็บ, เปลี่ยนตัวกรอง, เปิด modal, สลับธีม/ภาษา/ขนาดจอ …)

```bash
node tools/compare/run.mjs <page> [options]
```

## หลักการ

1. **Java** — สร้างหน้า Java จริงใหม่จากไฟล์ใน `triple_sale_main/web` (markup + CSS + script ของหน้า, EL ถูกแทนค่าเหมือนที่ server ทำ) ใส่ใน *shell replica* (เมนู/topbar/footer สร้างจาก Facelets + CSS จริง — `lib/shell-replica.mjs`) แล้วเสิร์ฟจาก harness server เล็ก ๆ (พอร์ตสุ่ม)
2. **Angular** — `ng build --configuration development` ได้ snapshot (`.compare/ng-build`) เสิร์ฟแบบ SPA; login แบบ mock หนึ่งครั้ง แล้วใส่ session ให้ทุกแท็บ
3. **ข้อมูลชุดเดียวกัน** — ฝั่ง Java เรียก BFF/API ที่ harness server ซึ่งตอบด้วย **mock ตัวเดียวกับที่หน้า Angular ใช้** (`*.mock.ts` โหลดเข้า Node โดย `lib/load-ts.mjs`) — ต่อ 1 scenario ได้ backend ใหม่ 1 ชุด (ไม่ปนกัน, รันขนานได้)
4. ทุก scenario รันทั้งสองฝั่งใน browser context ใหม่ (Chrome headless ผ่าน `puppeteer-core`, ไม่ต้องโหลด browser) → dump ข้อความ → เทียบทีละบรรทัด → ตัวที่ต่างจะถูกรันซ้ำทีละตัวอีกรอบ (กันจังหวะเวลา) ก่อนรายงาน

## ใช้งาน

```bash
node tools/compare/run.mjs dashboard --list                    # รายชื่อ scenario
node tools/compare/run.mjs dashboard                           # ทั้งหมด (build Angular → รัน → เทียบ)
node tools/compare/run.mjs dashboard --filter '^tab-' --no-build   # เฉพาะบางตัว, ใช้ snapshot เดิม
node tools/compare/run.mjs dashboard --side java --filter overview # ฝั่งเดียว (ดูว่า replica ของ Java ขึ้นไหม)
node tools/compare/run.mjs dashboard --show tab-table-390          # diff ของ scenario ที่เคยรันแล้ว (ไม่รันใหม่)
node tools/compare/run.mjs dashboard --show tab-table-390 --style  # สรุป computed style ที่ต่าง แยกตาม element + property
node tools/compare/run.mjs dashboard --show tab-table-390 --geom   # … ตำแหน่ง/ขนาดที่ต่าง
node tools/compare/run.mjs dashboard --cmp --mode dom              # เทียบ dump เดิมใหม่ด้วยโหมดหลวมขึ้น
```

| option | ความหมาย |
| --- | --- |
| `--filter <regex>` | เฉพาะ scenario ที่ชื่อตรง |
| `--side both\|java\|ng` | ฝั่งที่รัน (ค่าเริ่ม both) |
| `--jobs <n>` | จำนวน browser context ขนาน (ค่าเริ่ม 6; เครื่อง 28 คอร์ทำ dashboard 119 scenario ใน ~6 นาที) — ถ้าเครื่องช้า/ได้ diff แปลก ๆ ลดเหลือ 2 |
| `--mode all\|style\|dom` | `dom` = โครงสร้าง+attribute+ข้อความ · `style` = + สี/ฟอนต์ (ไม่รวมตำแหน่ง) · `all` = ทุกอย่าง |
| `--limit <n>` | จำนวนบรรทัด diff ต่อ scenario ที่แสดง |
| `--no-build` | ใช้ `ng build` ครั้งก่อน (เร็ว — ใช้ตอนแก้เฉพาะ scenario / harness) |
| `--no-confirm` | ไม่รันซ้ำตัวที่ต่าง |

ผลลัพธ์อยู่ใน `.compare/<page>/` (ไม่ใช่ซอร์ส — ลบทิ้งได้): `dumps/<scenario>-<java|ng>.txt`, `report.txt`; snapshot ของ Angular ที่ `.compare/ng-build/`
exit code 0 = ทุก scenario เหมือน, 1 = มีที่ต่าง

เมื่อ scenario ต่าง: เริ่มจาก `--show <name>` (บรรทัดแรกที่ต่างมักเป็นสาเหตุ), ถ้าเป็นเรื่องสี/ฟอนต์/ขนาดให้ใช้ `--style` / `--geom`. อย่า "ปรับ harness ให้เหมือน" — แก้ที่ generator / mock / host จนหน้า Angular ตรงกับ Java; ความต่างที่เป็นของสภาพแวดล้อมจริง ๆ ต้องเขียนเหตุผลไว้ใน `page.mjs` (`normalize`) หรือในหัวไฟล์ scenario

## โครงของหน้าที่เทียบ — `pages/<page>/`

### `page.mjs` (default export)

```js
export default {
  name: 'dashboard',
  roots: ['.dbsun-root', '#dbsunModalHost'],   // selector ที่ dump (เอกสารหลัก)
  ready: `document.querySelector('.dbsun-root .tab-btn') && …`,   // JS expression (string): หน้าพร้อมแล้ว — ใช้ได้ทั้งสองฝั่ง
  javaPath: (lang, opts) => '/triplesale/dashboard.html',          // URL ฝั่ง Java (ภาษา th|en)
  ngPath: (lang, opts) => '/dashboard',                            // route ฝั่ง Angular
  latencyMs: 150,                      // หน่วงการตอบ API ฝั่ง Java (จำลอง network)
  pre: `var tab = async function (t) { … }`,   // helper เพิ่มเติมของ scenario ของหน้านี้ (โค้ดที่รัน "ในหน้า")
  normalize: (line) => line,           // ความต่างที่ตั้งใจ (เช่น prefix ของ URL API) — ใช้เท่าที่จำเป็น
  async build(ctx) { … return { '/triplesale/dashboard.html': file }; },   // สร้างหน้า Java replica → map path → ไฟล์
  async newState({ sid, delay }, ctx) { … },                       // backend ใหม่ต่อ 1 scenario (โหลด *.mock.ts ผ่าน ctx.loadTs)
  async handle(req, state, ctx) { … return { status, headers, body } | null; },   // API + เอกสารเพิ่มเติม (iframe …) ที่หน้า Java ขอ
};
```

`ctx` = `{ shell, ngRoot, javaRoot, out, loadTs(entry), readJson(rel) }`. `shell.build(group, active, fileName, { head, content, tail })` ใส่เนื้อหาหน้าลงใน shell (group = กลุ่มเมนู `home`/`sale`/…; `TOPBAR_PAGES` ใน `lib/shell-replica.mjs` ระบุ topbar ของแต่ละกลุ่ม — เพิ่มถ้ากลุ่มใหม่ต้องใช้), `shell.TEMPLATE_SCRIPTS()` = สคริปต์ท้าย `<body>` ที่ template.xhtml โหลดทุกหน้า, `shell.read('pages/x.xhtml')` อ่านไฟล์ Java.

ตัวอย่างเต็ม: `pages/dashboard/page.mjs` (หน้าที่ markup + script อยู่ในไฟล์ Java 2 ไฟล์, ค่า `#{bean.xxxJson}` ถูกแทนด้วย `initial` จาก mock, มี iframe 2 ตัวที่ server ประกอบ HTML ให้)

### `scenarios.mjs`

```js
export default function (add) {
  add('overview', {}, async function () {});                                  // แค่เปิดหน้า
  add('overview-dark', { theme: 'dark' }, async function () {});
  add('tab-status', { w: 390, h: 844 }, async function () { await tab('status'); });
  add('modal', {}, async function (sleep, side, win) { click('#btnOpen'); await sleep(800); });
}
```

- `opts`: `w`,`h` (viewport, ค่าเริ่ม 1280×800) · `theme` (`light`|`dark`) · `lang` (`th`|`en`) · `settle` (ms หลังพร้อม, ค่าเริ่ม 1800) · `wait` (ms ก่อน dump, ค่าเริ่ม 600) · `roots` (แทน `page.roots`) · `frames: [{ sel, name, roots }]` (dump เอกสารใน iframe ด้วย) · `ready` (แทน `page.ready`)
- ฟังก์ชันของ scenario **ถูกรันในหน้า** (ไม่ใช่ใน Node): ตัวแปรอิสระอย่าง `click`, `typeIn`, `tab` มาจาก prelude — `lib/scenario-pre.mjs` (`$`, `$$`, `click`, `typeIn`, `pick`, `key`, `waitFor`, `fdoc`/`fclick`/`ftype` สำหรับ iframe, `fontAdj` สำหรับปุ่ม A A A) + `page.pre`. อย่าอ้างอะไรจากขอบเขตของไฟล์ `.mjs` ในตัวฟังก์ชัน (มันถูก `toString()` ไปรันในหน้า)
- ค่า `sleep`, `side` (`'java'`/`'ng'`), `win` ส่งเข้าฟังก์ชัน. โยน error = บันทึกเป็น `SCENARIO-ERROR` ท้าย dump ของฝั่งนั้น (ฝั่งที่ไม่ error จะต่างทันที)
- ชุดที่ควรมี: หน้าแรก (สว่าง/มืด, ขนาดจอ 390 · 768 · 1280 · 1920, ไทย/อังกฤษ), ทุกแท็บ/โหมด, ทุกตัวกรอง/ค้นหา/เรียง/แบ่งหน้า, ทุก modal (เปิด, ค่าเริ่มต้น, validation, ปิดด้วย Esc), การสร้าง/แก้/ลบที่ทำให้ข้อมูลเปลี่ยน, ปุ่ม A A A (`fontAdj('2px')`)

## ความต่างที่เกิดจากสภาพแวดล้อม (ไม่ใช่ความต่างของหน้า)

- ค่าที่เป็น "ตอนนี้" (`new Date()`) ในแถวใหม่ → ต่างตามเวลา dump
- scrollbar ของ document ซ่อนไว้ทั้งคู่ (`--hide-scrollbars`; `CMP_SCROLLBARS=1` เปิด) — replica ของ Java เลื่อนทั้งเอกสาร ส่วน shell ของ Angular เลื่อนในกล่องของมันเอง
- ฟอนต์: ECharts วัดตัวอักษรตอน `DOMContentLoaded` ด้วยฟอนต์ที่โหลดอยู่ตอนนั้น (หน้า Java จริงก็มี race นี้) — replica ใส่ `<link rel=preload>` ให้
- Angular เก็บ theme ที่ `<html>` ส่วน Java ที่ `<body>` (dump ปรับให้ตรงกัน), ฟอนต์ `NotoSansThai` (Java) = `"Noto Sans Thai"` (Angular) — ไฟล์เดียวกัน
- เวลา/animation: dump ปิด animation/transition ทุกตัว; scenario ที่พึ่งเวลาควรรอด้วย `waitFor(...)` แทน `sleep` เดาเวลา

## การแก้ปัญหา

- `ready-timeout` ในรายงาน = selector/expression `ready` ไม่เป็นจริงภายใน 15 วิ (หน้าไม่ขึ้นหรือ error) — ดู `browser errors / failed requests` ท้ายรายงาน (`pageerror`, `HTTP 404 …`)
- ผลต่างแปลก ๆ เป็นครั้งคราวเมื่อ `--jobs` สูง → ลอง `--jobs 2`, หรือรันตัวนั้นเดี่ยว ๆ (`--filter '^name$'`)
- Chrome ไม่เจอ → ตั้ง `CHROME_PATH` (ค่าเริ่ม: Chrome / Edge ที่ติดตั้งไว้)
- Java ไม่อยู่ข้างโปรเจกต์ → ตั้ง `TS_JAVA_ROOT` (โฟลเดอร์ `triple_sale_main`)
