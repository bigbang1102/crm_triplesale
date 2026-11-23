/** ฟังก์ชันจัดรูปแบบของหน้า Lead — ไม่ผูก framework */

const THAI_CODE = '+66';
const MOBILE_DIGITS = 9;

/**
 * เบอร์โทรสำหรับแสดง: `+66` + เบอร์มือถือไทย 9 หลักแบ่งเป็น `XX XXX XXXX` (ตัด 0 หน้า / 66 หน้าออก)
 * เบอร์ที่ไม่ใช่รูปแบบนี้แสดงตามที่กรอก. ไม่มีเบอร์ = `-`
 */
export function formatPhone(code: string, phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '-';
  const national = digits.startsWith('66') && digits.length > MOBILE_DIGITS ? digits.slice(2) : digits.replace(/^0/, '');
  if (code === THAI_CODE && national.length === MOBILE_DIGITS) return `${code} ${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`;
  return `${code} ${phone.trim()}`;
}
