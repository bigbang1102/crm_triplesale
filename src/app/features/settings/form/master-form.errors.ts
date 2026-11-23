import { ApiField } from '../settings.api';

/**
 * ข้อความ `details[].message` ของ API (ภาษาเครื่อง) → ข้อความไทย/อังกฤษของช่อง ; ตารางเต็มอยู่ใน api-flow-config-page.md ข้อ 5.2
 * key อยู่ใน app.{th,en}.json (app.settings.fe.*) ; ที่ไม่รู้จักแสดงข้อความของ API ตามเดิม (ไม่ซ่อนข้อมูล).
 */
export type Translate = (key: string, ...args: (string | number)[]) => string;

interface Rule {
  re: RegExp;
  /** key ย่อยใต้ app.settings.fe. */
  key: string;
  /** อาร์กิวเมนต์ {1}.. ที่ดึงจาก regex (ช่องแรก {0} คือชื่อช่องเสมอ) */
  args?: (m: RegExpExecArray, label: (field: string) => string) => string[];
}

const RULES: Rule[] = [
  { re: /^required$/, key: 'required' },
  { re: /^must not be blank$/, key: 'blank' },
  { re: /^too short \(min (\d+)\)$/, key: 'tooShort', args: (m) => [m[1]] },
  { re: /^too long \(max (\d+)\)$/, key: 'tooLong', args: (m) => [m[1]] },
  { re: /^invalid format \((.+)\)$/, key: 'format' },
  { re: /^must be one of \[(.*)\]$/, key: 'oneOf', args: (m) => [m[1]] },
  { re: /^must be a number$/, key: 'number' },
  { re: /^must be an integer$/, key: 'integer' },
  { re: /^must be >= (.+)$/, key: 'min', args: (m) => [m[1]] },
  { re: /^must be <= (.+)$/, key: 'max', args: (m) => [m[1]] },
  { re: /^too many decimal places \(max (\d+)\)$/, key: 'decimals', args: (m) => [m[1]] },
  { re: /^out of range$/, key: 'range' },
  { re: /^must be a date/, key: 'date' },
  { re: /^must not be before (.+)$/, key: 'notBefore', args: (m, label) => [label(m[1])] },
  { re: /^sum of \[(.*)\] must equal (.+) \(now (.+)\)$/, key: 'sum', args: (m, label) => [m[1].split(',').map((x) => label(x.trim())).join(', '), m[2], m[3]] },
  { re: /^duplicate selection \(rows (\d+) and (\d+)\)$/, key: 'duplicate', args: (m) => [m[1], m[2]] },
  { re: /^too many rows \(max (\d+)\)$/, key: 'tooManyRows', args: (m) => [m[1]] },
  { re: /^file upload is not supported/, key: 'file' },
  { re: /^must not reference itself$/, key: 'self' },
  { re: /^reference not found/, key: 'refInvalid' },
  { re: /^already exists$/, key: 'exists' },
  // ข้อผิดพลาดของโปรแกรม (หน้าส่งช่อง/ชนิดข้อมูลที่ไม่ตรงกับฟอร์ม) — ผู้ใช้แก้เองไม่ได้
  { re: /^(unknown field|unknown section|system field cannot be set|must be text|must be a uuid|must be true or false|option cannot be mapped|must be an ISO-8601)/, key: 'program' },
];

/**
 * @param field ช่องที่ผิด (ใช้ชื่อไทย + `errorText` ของช่อง)
 * @param labelOf ชื่อไทยของช่องอื่นจาก key (ข้อความข้ามช่อง เช่น "ไม่ก่อน {วันที่เริ่ม}")
 */
export function fieldMessage(t: Translate, field: Pick<ApiField, 'label' | 'errorText'>, message: string, labelOf: (key: string) => string = (k) => k): string {
  for (const rule of RULES) {
    const m = rule.re.exec(message);
    if (!m) continue;
    // รูปแบบผิด : ถ้าช่องมีข้อความไทยของตัวเอง (errorText) ใช้ข้อความนั้นก่อน
    if (rule.key === 'format' && field.errorText) return field.errorText;
    return t(`app.settings.fe.${rule.key}`, field.label, ...(rule.args?.(m, labelOf) ?? []));
  }
  return message;
}
