/**
 * Who is in each activity group at the start (id of `SEED_GROUPS` → employee codes of `SEED_EMPLOYEES`) — no imports, so the shared database
 * can use it. The members of a group are the only people who may see its Wait List, take or be given its opportunities, and own them
 * (multi-tenant docs: lead-prospect-opportunity-flow.md §5.7 — "สมาชิกของ Activity Group เท่านั้น").
 * FAST-DEBT(REQ): the real membership is by position (`activity_group_position_item`); the mockup lists employees directly · somyot · 2026-11-20
 */
export const SEED_GROUP_MEMBERS: Record<number, string[]> = {
  101: ['E101', 'E102', 'E103', 'E105'], // CS  ฝ่ายบริการลูกค้า
  102: ['E101', 'E104', 'E106'], // AN  วิเคราะห์สินเชื่อ
  103: ['E101', 'E102', 'E107', 'E108'], // PLS พิจารณาผลิตภัณฑ์
  104: ['E101', 'E103', 'E106', 'E108'], // LS  สินเชื่อ
  105: ['E104', 'E105', 'E108'], // FI  การเงิน
  106: ['E102', 'E106', 'E107'], // LE  นิติกรรม
  107: ['E103', 'E104', 'E105', 'E108'], // CRM ดูแลหลังการขาย
};
