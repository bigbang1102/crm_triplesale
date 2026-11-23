/**
 * The page shown INSTEAD of the app when the data of the mockup cannot be read. The data lives only on the shared file server (Datasource + Storage on
 * the Docker host); the app has no data of its own to show in its place — without the server there is nothing to display, and saying so is better than
 * a screen full of numbers that come from nowhere. Framework-free and drawn straight into <body>, because it appears before Angular starts.
 *
 * It looks like the rest of the system (the `--ts-*` tokens, with the same values as fallbacks, and a dark scheme), and while the server is away it
 * asks for it every few seconds and opens the app by itself as soon as it answers.
 *
 * FAST-DEBT(STD): the text is fixed Thai, not `t('…')` — the dictionaries are not loaded yet at this point · somyot · 2026-11-20
 */
export type MockupUnavailable = 'down' | 'empty';

const OVERLAY_ID = 'ts-mockup-unavailable';
const STYLE_ID = 'ts-mockup-unavailable-style';
const POLL_MS = 5000;
const HEALTH_URL = '/mockup-api/health';

interface Step {
  text: string;
  code?: string;
}
interface Content {
  title: string;
  lead: string;
  statusLabel: string;
  statusValue: string;
  steps: Step[];
  code: string;
}

const CONTENT: Record<MockupUnavailable, Content> = {
  down: {
    title: 'ยังเชื่อมต่อเซิร์ฟเวอร์ข้อมูลไม่ได้',
    lead: 'ข้อมูลของระบบทดลอง (mockup) เก็บอยู่ที่เซิร์ฟเวอร์ข้อมูลกลางเพียงแห่งเดียว เมื่อเซิร์ฟเวอร์ไม่พร้อม แอปจึงไม่แสดงข้อมูลใด ๆ',
    statusLabel: 'เซิร์ฟเวอร์ข้อมูล (Datasource + Storage)',
    statusValue: 'ไม่พร้อมใช้งาน',
    steps: [
      { text: 'เปิด container', code: 'triple-sales-mockup-data' },
      { text: 'รอสถานะ healthy แล้วสั่ง', code: 'docker restart triple-sales-mockup-gateway' },
      { text: 'ถ้ายังไม่ขึ้น ตรวจ MOCKUP_REMOTE_URL และ MOCKUP_TOKEN ใน', code: '.env.mockup.local' },
    ],
    code: 'MOCKUP_DATA_UNAVAILABLE',
  },
  empty: {
    title: 'เซิร์ฟเวอร์ข้อมูลยังไม่มีเอกสารให้ใช้งาน',
    lead: 'ต่อเซิร์ฟเวอร์ได้ แต่ไม่พบเอกสารข้อมูลเลย — โฟลเดอร์ Datasource ว่าง หรืออ่านด้วยกุญแจที่ไม่ถูกต้อง',
    statusLabel: 'เซิร์ฟเวอร์ข้อมูล (Datasource + Storage)',
    statusValue: 'ไม่มีเอกสาร',
    steps: [
      { text: 'ใส่เอกสารตั้งต้นเข้าเซิร์ฟเวอร์ด้วย', code: 'npm run mockup:seed -- --apply' },
      { text: 'ตรวจว่า MOCKUP_TOKEN ใน', code: '.env.mockup.local' },
      { text: 'ตรงกับกุญแจของเซิร์ฟเวอร์ แล้วกดลองใหม่' },
    ],
    code: 'MOCKUP_DATA_EMPTY',
  },
};

/** the look: the tokens of the system with their own values as fallbacks (this page can appear before the style sheet is applied), dark by the scheme of the machine */
const CSS = `
#${OVERLAY_ID}{--mu-bg:var(--ts-surface-2,#f4f5f9);--mu-card:var(--ts-surface,#fff);--mu-line:var(--ts-border,#e5e7eb);--mu-text:var(--ts-text-header,#11142d);--mu-muted:var(--ts-text-muted,#606b85);--mu-brand:var(--ts-primary,#35236a);--mu-brand-2:var(--ts-primary-300,#5b3cb7);--mu-warn:var(--ts-warning,#e08a0b);--mu-warn-bg:rgba(224,138,11,.12);--mu-code-bg:rgba(53,35,106,.07);--mu-code:#35236a;
position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;overflow:auto;
font-family:var(--ts-font,'Noto Sans Thai','Sarabun','Leelawadee UI','Segoe UI',system-ui,sans-serif);color:var(--mu-text);
background:radial-gradient(1200px 520px at 50% -10%,rgba(91,60,183,.16),transparent 60%),var(--mu-bg)}
@media (prefers-color-scheme:dark){#${OVERLAY_ID}{--mu-bg:#0f172a;--mu-card:#1e293b;--mu-line:#374151;--mu-text:#f1f5f9;--mu-muted:#cbd5e1;--mu-code-bg:rgba(148,163,184,.16);--mu-code:#e2e8f0;--mu-warn-bg:rgba(224,138,11,.2)}}
#${OVERLAY_ID} *{box-sizing:border-box}
#${OVERLAY_ID} .mu-card{width:min(560px,100%);background:var(--mu-card);border:1px solid var(--mu-line);border-radius:var(--ts-radius-lg,14px);box-shadow:0 12px 32px rgba(16,24,40,.12);overflow:hidden}
#${OVERLAY_ID} .mu-bar{height:5px;background:linear-gradient(90deg,var(--mu-brand),var(--mu-brand-2))}
#${OVERLAY_ID} .mu-body{padding:28px 32px 24px}
#${OVERLAY_ID} .mu-head{display:flex;gap:16px;align-items:flex-start}
#${OVERLAY_ID} .mu-icon{flex:none;width:52px;height:52px;border-radius:14px;background:var(--mu-warn-bg);color:var(--mu-warn);display:flex;align-items:center;justify-content:center}
#${OVERLAY_ID} h1{margin:2px 0 6px;font-size:20px;line-height:1.35;font-weight:600;color:var(--mu-text)}
#${OVERLAY_ID} .mu-lead{margin:0;font-size:14px;line-height:1.65;color:var(--mu-muted)}
#${OVERLAY_ID} .mu-status{margin:20px 0 4px;border:1px solid var(--mu-line);border-radius:10px;padding:12px 14px;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;justify-content:space-between;font-size:13px}
#${OVERLAY_ID} .mu-status b{font-weight:600}
#${OVERLAY_ID} .mu-pill{display:inline-flex;align-items:center;gap:7px;padding:3px 11px;border-radius:999px;background:var(--mu-warn-bg);color:var(--mu-warn);font-weight:600}
#${OVERLAY_ID} .mu-pill i{width:7px;height:7px;border-radius:50%;background:currentColor}
#${OVERLAY_ID} .mu-sub{margin:14px 0 8px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--mu-muted);font-weight:600}
#${OVERLAY_ID} ol{margin:0;padding:0;list-style:none;counter-reset:mu;display:grid;gap:10px}
#${OVERLAY_ID} li{counter-increment:mu;display:flex;gap:12px;align-items:flex-start;font-size:14px;line-height:1.6}
#${OVERLAY_ID} li::before{content:counter(mu);flex:none;width:24px;height:24px;border-radius:50%;background:var(--mu-code-bg);color:var(--mu-brand-2);font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;margin-top:1px}
#${OVERLAY_ID} .mu-step{min-width:0}
#${OVERLAY_ID} code{display:block;width:fit-content;max-width:100%;margin:6px 0 0;padding:4px 10px;border-radius:6px;background:var(--mu-code-bg);color:var(--mu-code);font:12.5px/1.6 Consolas,'SFMono-Regular',Menlo,monospace;overflow-wrap:anywhere}
#${OVERLAY_ID} .mu-foot{margin-top:22px;padding-top:18px;border-top:1px solid var(--mu-line);display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;justify-content:space-between}
#${OVERLAY_ID} .mu-wait{display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--mu-muted)}
#${OVERLAY_ID} .mu-spin{width:14px;height:14px;border-radius:50%;border:2px solid var(--mu-line);border-top-color:var(--mu-brand-2);animation:mu-spin .9s linear infinite}
#${OVERLAY_ID} button{font:inherit;font-size:14px;font-weight:600;padding:9px 22px;border:0;border-radius:var(--ts-radius,10px);background:var(--mu-brand);color:#fff;cursor:pointer;transition:filter .15s}
#${OVERLAY_ID} button:hover{filter:brightness(1.15)}
#${OVERLAY_ID} button:focus-visible{outline:3px solid var(--mu-brand-2);outline-offset:2px}
#${OVERLAY_ID} .mu-code{margin-top:14px;font-size:11.5px;color:var(--mu-muted);text-align:right}
@keyframes mu-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){#${OVERLAY_ID} .mu-spin{animation:none}}
@media (max-width:480px){#${OVERLAY_ID} .mu-body{padding:22px 20px 18px}#${OVERLAY_ID} .mu-head{flex-direction:column;gap:12px}}
`;

const ICON =
  '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01"/><path d="M3 21 21 3" stroke-width="2"/></svg>';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let timer: ReturnType<typeof setInterval> | undefined;

/** true when the file server answers (the same address the app asks) */
async function serverAnswers(): Promise<boolean> {
  try {
    return (await fetch(HEALTH_URL, { cache: 'no-store' })).ok;
  } catch {
    return false;
  }
}

/**
 * draws the page over everything; `reload` is what the button does (the page again, by default). `poll`: ask for the server every few seconds and call
 * `reload` once it answers (default: while it is away, not while it is up but empty).
 */
export function showMockupUnavailable(kind: MockupUnavailable, reload: () => void = () => location.reload(), poll: boolean = kind === 'down'): HTMLElement {
  document.getElementById(OVERLAY_ID)?.remove();
  if (timer !== undefined) clearInterval(timer);
  timer = undefined;
  if (!document.getElementById(STYLE_ID)) {
    const style = el('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.append(style);
  }
  const c = CONTENT[kind];

  const box = el('div');
  box.id = OVERLAY_ID;
  box.setAttribute('role', 'alert');
  const card = el('div', 'mu-card');
  card.append(el('div', 'mu-bar'));
  const body = el('div', 'mu-body');

  const head = el('div', 'mu-head');
  const icon = el('div', 'mu-icon');
  icon.innerHTML = ICON; // a fixed drawing of ours, no data in it
  const heading = el('div');
  heading.append(el('h1', undefined, c.title), el('p', 'mu-lead', c.lead));
  head.append(icon, heading);

  const status = el('div', 'mu-status');
  const pill = el('span', 'mu-pill');
  pill.append(el('i'), document.createTextNode(c.statusValue));
  status.append(el('b', undefined, c.statusLabel), pill);

  const steps = el('ol');
  for (const step of c.steps) {
    const li = el('li');
    const content = el('div', 'mu-step');
    content.append(document.createTextNode(step.text));
    if (step.code) content.append(el('code', undefined, step.code));
    li.append(content);
    steps.append(li);
  }

  const foot = el('div', 'mu-foot');
  const wait = el('div', 'mu-wait');
  wait.setAttribute('aria-live', 'polite');
  if (poll) wait.append(el('span', 'mu-spin'), el('span', undefined, 'กำลังตรวจสอบอัตโนมัติ — จะเปิดหน้าให้เองเมื่อเซิร์ฟเวอร์กลับมา'));
  const button = el('button', undefined, 'ลองใหม่');
  button.type = 'button';
  button.addEventListener('click', reload);
  foot.append(wait, button);

  body.append(head, status, el('div', 'mu-sub', 'วิธีแก้'), steps, foot, el('div', 'mu-code', `รหัส: ${c.code}`));
  card.append(body);
  box.append(card);
  document.body.append(box);
  button.focus();

  if (poll) {
    timer = setInterval(() => {
      void serverAnswers().then((up) => {
        if (up && document.getElementById(OVERLAY_ID) === box) reload();
      });
    }, POLL_MS);
  }
  return box;
}
