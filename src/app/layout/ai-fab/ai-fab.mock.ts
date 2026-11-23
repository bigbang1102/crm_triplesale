/* eslint-disable */
/**
 * Fake backend of the help assistant ("สอบถามการใช้งาน") — served when `mock: true` (npm start) and by the unit tests.
 *
 * It answers the calls the FAB makes to the BFF:
 *   POST <ctx>/help-api/ask            { sessionId, question, page, pageTitle }  ->  { answer, images[] }
 *   GET  <ctx>/help-api/images/<file>  a figure of the manual
 * with the same JSON shape as CHAT_BOT's /api/help/ask (HelpApiProxy forwards it untouched). The answers use the light
 * markdown the real assistant uses (**bold**, - bullets, `code`) so helpFmt() has something to show, and the page the
 * assistant is told about is echoed back so the context handed over by the FAB can be seen.
 *
 * Standalone on purpose (no Angular imports, only erasable TypeScript): the Node harness that compares the FAB with the
 * Java one imports this very file, so both pages are fed identical data.
 * Ask "ทดสอบล่ม" to get a 502 (the assistant is unreachable) and see the fallback of the page.
 */

import { reference } from '@core/mock/reference';

type Json = any;

const json = (body: Json, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface Topic {
  /** words that select this answer */
  k: string[];
  /** the answer (light markdown); `{title}` = the title of the page the user is on, `{page}` = its path as ` (`path`)`, or nothing */
  answer: string;
  images?: string[];
}

/** the answers of the assistant (`ref.aiFab.json` › `topics` / `fallback` of the shared Datasource when it has them; `{q}` = what was asked) */
const TOPICS = reference<Topic[]>('aiFab.topics', [
  {
    k: ['หน้านี้ใช้งานยังไง'],
    answer: 'หน้านี้คือ **{title}**{page} ครับ\n\n- เมนูหลักอยู่แถบซ้ายมือ\n- ตัวกรองและปุ่มค้นหาอยู่ด้านบนของตาราง\n- กดที่แถวเพื่อดูรายละเอียด\n\nถามต่อได้เลยว่าอยากทำอะไรในหน้านี้ครับ',
    images: ['images/chat-layout.svg'],
  },
  {
    k: ['เมนูอะไรบ้าง', 'เมนู'],
    answer: 'Triple Sale มีเมนูหลักตามแถบซ้ายมือครับ\n\n- **CRM** — ลูกค้าเป้าหมาย โอกาสขาย และประวัติการติดต่อ\n- **Smart Doc** — เอกสารงานขาย ใบเสร็จ/ใบกำกับ\n- **รายงาน** — รายงานสรุปต่าง ๆ\n- **AI** — AI แปลเอกสาร และ AI HUB',
    images: [],
  },
  {
    k: ['เข้าเมนู', 'เข้าไม่ได้', 'สิทธิ์'],
    answer: 'เมนูที่เห็นขึ้นกับ **สิทธิ์** ของบัญชีครับ ถ้าเมนูที่ต้องการไม่ขึ้นเลย ให้แจ้งผู้ดูแลระบบเพื่อขอเปิดสิทธิ์ (เช่น `MODULE_CHATBOX` สำหรับห้องแชท)',
    images: [],
  },
  {
    k: ['คู่มือ'],
    answer: 'คู่มือทั้งหมดรวมอยู่ที่ **ศูนย์รวมคู่มือ** ครับ — เปิดไฟล์ `dev-manual/index.html` ในโฟลเดอร์โปรเจกต์ได้เลย',
    images: [],
  },
  {
    k: ['สั่งแปล', 'แปลยังไง'],
    answer: 'เลือกเอกสารในตาราง แล้วกดปุ่ม **แปลเอกสาร** บนหัวการ์ดรายละเอียดครับ\n\n- ปุ่มนี้ขึ้นเฉพาะงานสถานะ "รอแปล"\n- กดแล้วสถานะเป็น "กำลังแปล"\n- แปลเสร็จระบบเปลี่ยนเป็น "รอตรวจ" ให้เอง',
    images: ['images/ai-translator-flow.svg'],
  },
]);

const FALLBACK = reference<string>('aiFab.fallback', 'ยังไม่พบเรื่อง "{q}" ในคู่มือครับ\n\nลองถามเรื่องเมนูต่าง ๆ ของระบบ หรือกดปุ่ม "ถามด่วน" ด้านบนช่องพิมพ์ได้เลย');
const FALLBACK_ANSWER = (q: string): string => FALLBACK.split('{q}').join(q);
const fill = (text: string, page: string, title: string): string => text.split('{title}').join(title || 'ไม่ทราบชื่อหน้า').split('{page}').join(page ? ` (\`${page}\`)` : '');

/** POST /help-api/ask */
export function mockHelpAnswer(body: { question?: string; page?: string; pageTitle?: string }): { status: number; json: Json } {
  const q = String(body.question ?? '').trim();
  if (q.includes('ทดสอบล่ม')) return { status: 502, json: { status: 502, message: 'ติดต่อผู้ช่วยสอบถามการใช้งานไม่ได้' } };
  const topic = TOPICS.find((t) => t.k.some((w) => q.includes(w)));
  if (!topic) return { status: 200, json: { answer: FALLBACK_ANSWER(q), images: [] } };
  return { status: 200, json: { answer: fill(topic.answer, String(body.page ?? ''), String(body.pageTitle ?? '')), images: topic.images ?? [] } };
}

/**
 * The fetch of the FAB in dev mode: <ctx>/help-api/ask is answered here, <ctx>/help-api/images/<file> redirects to the
 * static figure, everything else is not this module's business (the caller falls through to window.fetch).
 */
export async function mockHelpFetch(input: string, init: RequestInit | undefined, apiBase: string): Promise<Response> {
  const path = String(input).replace(apiBase, '').split('?')[0];
  if (path === '/help-api/ask' && (init?.method ?? 'GET').toUpperCase() === 'POST') {
    await new Promise((r) => setTimeout(r, 250)); // the real one takes seconds; the dots of the page need a moment to be seen
    let body: any = {};
    try {
      body = JSON.parse(String(init?.body ?? '{}'));
    } catch {
      /* bad request body */
    }
    const a = mockHelpAnswer(body);
    return json(a.json, a.status);
  }
  return json({ status: 404, message: 'ไม่รู้จักเส้นทางนี้ของผู้ช่วยสอบถามการใช้งาน' }, 404);
}

/** figures of the manual are static files of the dev server (the <img> of the page cannot be intercepted) */
export function mockHelpImageUrl(name: string): string {
  return 'assets/help-mock/' + name;
}
