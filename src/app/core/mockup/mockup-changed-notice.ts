/**
 * The small notice that says somebody else changed the data this page shows, with a button that loads the page again. Framework-free, drawn straight
 * into <body> (the pages are generated, not ours to change), once: a second change while it is up only keeps it up.
 *
 * FAST-DEBT(STD): fixed Thai text, not `t('…')` — it lives with the file layer of the mockup, which starts before the dictionaries · somyot · 2026-11-20
 */
const NOTICE_ID = 'ts-mockup-changed';
const STYLE_ID = 'ts-mockup-changed-style';

const CSS = `
#${NOTICE_ID}{position:fixed;right:20px;bottom:20px;z-index:2147483000;display:flex;align-items:center;gap:12px;max-width:min(440px,calc(100vw - 40px));padding:12px 14px 12px 16px;
background:var(--ts-surface,#fff);color:var(--ts-text-header,#11142d);border:1px solid var(--ts-border,#e5e7eb);border-left:4px solid var(--ts-primary-300,#5b3cb7);border-radius:10px;
box-shadow:0 8px 24px rgba(16,24,40,.18);font:14px/1.5 var(--ts-font,'Noto Sans Thai','Sarabun','Leelawadee UI','Segoe UI',system-ui,sans-serif)}
@media (prefers-color-scheme:dark){#${NOTICE_ID}{--ts-surface:#1e293b;--ts-text-header:#f1f5f9;--ts-border:#374151}}
#${NOTICE_ID} span{flex:1}
#${NOTICE_ID} button{font:inherit;font-weight:600;border:0;border-radius:8px;cursor:pointer}
#${NOTICE_ID} .cn-go{padding:7px 14px;background:var(--ts-primary,#35236a);color:#fff}
#${NOTICE_ID} .cn-x{padding:4px 8px;background:transparent;color:inherit;opacity:.6}
#${NOTICE_ID} button:focus-visible{outline:3px solid var(--ts-primary-300,#5b3cb7);outline-offset:2px}
`;

/** changes what the notice says (when it is up) */
export function setChangedNoticeText(text: string): void {
  const span = document.getElementById(NOTICE_ID)?.querySelector('span');
  if (span) span.textContent = text;
}

/** shows the notice (or keeps it); `reload` is what the button does (the page again, by default) */
export function showChangedNotice(reload: () => void = () => location.reload()): HTMLElement {
  const existing = document.getElementById(NOTICE_ID);
  if (existing) return existing;
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.append(style);
  }
  const box = document.createElement('div');
  box.id = NOTICE_ID;
  box.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = 'มีการเปลี่ยนแปลงข้อมูลจากผู้ใช้อื่น';
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'cn-go';
  go.textContent = 'รีเฟรชหน้า';
  go.addEventListener('click', reload);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'cn-x';
  close.setAttribute('aria-label', 'ปิด');
  close.textContent = '✕';
  close.addEventListener('click', () => box.remove());
  box.append(text, go, close);
  document.body.append(box);
  return box;
}
