import { describe, expect, it } from 'vitest';
import { mockHelpAnswer, mockHelpFetch, mockHelpImageUrl } from './ai-fab.mock';

describe('help assistant fake backend', () => {
  it('echoes the page it is told about for "หน้านี้ใช้งานยังไง" and attaches a figure of the manual', () => {
    const a = mockHelpAnswer({ question: 'หน้านี้ใช้งานยังไง', page: 'lead.face', pageTitle: 'โอกาสขาย' });
    expect(a.status).toBe(200);
    expect(a.json.answer).toContain('**โอกาสขาย**');
    expect(a.json.answer).toContain('`lead.face`');
    expect(a.json.images).toEqual(['images/chat-layout.svg']);
  });

  it('answers by topic, says so when the manual has nothing, and can be made unreachable', () => {
    expect(mockHelpAnswer({ question: 'ระบบนี้มีเมนูอะไรบ้าง' }).json.answer).toContain('เมนูหลัก');
    expect(mockHelpAnswer({ question: 'สั่งแปลยังไง' }).json.images).toEqual(['images/ai-translator-flow.svg']);
    const none = mockHelpAnswer({ question: 'ขอสูตรอาหารหน่อย' });
    expect(none.json.answer).toContain('ยังไม่พบเรื่อง');
    expect(none.json.images).toEqual([]);
    expect(mockHelpAnswer({ question: 'ทดสอบล่ม' }).status).toBe(502);
  });

  it('serves POST <ctx>/help-api/ask like HelpApiProxy and knows no other path', async () => {
    const ok = await mockHelpFetch('/triplesale/help-api/ask', { method: 'POST', body: JSON.stringify({ question: 'คู่มืออยู่ไหน', sessionId: 's' }) }, '/triplesale');
    expect(ok.status).toBe(200);
    expect((await ok.json()).answer).toContain('ศูนย์รวมคู่มือ');
    const other = await mockHelpFetch('/triplesale/help-api/topics', undefined, '/triplesale');
    expect(other.status).toBe(404);
  });

  it('points the figures at static files of the dev server', () => {
    expect(mockHelpImageUrl('chat-layout.svg')).toBe('assets/help-mock/chat-layout.svg');
  });
});
