import { ApiError } from '@core/http/api-error';

/**
 * เหตุผลที่ API (configmaster) ปฏิเสธ → key ข้อความไทย/อังกฤษของหน้า (app.settings.err.*) — ตารางเต็มอยู่ใน
 * docs/guide/api-flow-config-page.md ของ configmaster ข้อ 5.1 ; API ตอบ `{status, message: <code>, error: {code, description, details[]}}`.
 * ไม่อ่านข้อความภาษาอังกฤษของ API มาแสดงตรง ๆ (เป็นภาษาเครื่อง) — แมปด้วย `error.code` (+ `description` แยก 403 สองแบบ).
 */
export interface SettingsFailure {
  /** key ใน app.{th,en}.json */
  key: string;
  /** แทน {0} {1} … ในข้อความ */
  args: string[];
  /** รายละเอียดรายช่อง/รายขั้น (422, 409) จาก `error.details[]` */
  details: { field: string; message: string }[];
  /** รหัส HTTP ที่ได้ (0 = ไม่มีคำตอบ ; null = ไม่ใช่คำตอบจาก API) — ต่อท้ายข้อความเพื่อให้ไล่หาสาเหตุได้ */
  status: number | null;
}

interface ErrorBody {
  error?: { code?: string; description?: string; details?: { field?: string; message?: string }[] };
}

export function failureOf(e: unknown): SettingsFailure {
  if (!(e instanceof ApiError)) return { key: 'app.settings.err.unknown', args: [], details: [], status: null };

  const body = (e.options.body ?? {}) as ErrorBody;
  const code = body.error?.code;
  const description = body.error?.description ?? '';
  const details = (body.error?.details ?? []).map((d) => ({ field: d.field ?? '', message: d.message ?? '' }));
  const out = (key: string, args: string[] = []): SettingsFailure => ({ key: `app.settings.err.${key}`, args, details, status: e.status });

  switch (code) {
    case 'INVALID_TABLE_KEY':
      return out('invalidTable');
    case 'MASTER_TABLE_NOT_FOUND':
      return out('tableNotFound');
    case 'FORBIDDEN':
      // สองสาเหตุ ข้อความต่างกัน : บทบาทไม่มีสิทธิ์ระดับนี้ / ไม่มีสิทธิ์ในนิติบุคคล (หรือไม่พบนิติบุคคล — ตอบเหมือนกันโดยตั้งใจ)
      return description === 'Access denied' ? out('noRole') : out('noEntity');
    case 'MASTER_NOT_WRITABLE':
      return out('notWritable');
    case 'PREREQUISITE_NOT_MET':
      return out('prereq', [details.map((d) => d.message).join(', ')]);
    case 'RECORD_NOT_FOUND':
      return out('recordNotFound');
    case 'RECORD_IN_USE':
      return out('inUse');
    case 'FIELD_NOT_FOUND':
      return out('fieldNotFound');
    case 'VALIDATION_ERROR':
      return out('validation', [String(details.length)]);
    case 'MASTER_CONFIG_INVALID':
      return out('configInvalid');
  }

  if (e.status === 0) return out('offline');
  if (e.status === 401) return out('unauthorized');
  // ตอบ 200 แต่ไม่ใช่ JSON (ได้หน้าเว็บแทน) หรือ 404 ที่ไม่ใช่รูปของ API = เรียกไม่ถึง master-service : เส้นทาง /master-service ของ dev proxy ไม่ทำงาน (ยังไม่รีสตาร์ต ng serve หลังแก้ proxy.conf.json)
  if (e.status === 200 || e.status === 404) return out('noRoute');
  if (e.status === 400 || e.status === 415) return out('badRequest');
  if (e.status >= 500) return out('server');
  return out('unknown');
}

/** ข้อความของความผิดพลาดที่แปลงแล้ว + รหัส HTTP ต่อท้าย (เช่น "… (HTTP 500)") เพื่อให้ผู้ใช้ไล่หาสาเหตุได้ */
export function failureMessage(t: (key: string, ...args: (string | number)[]) => string, f: SettingsFailure): string {
  return `${t(f.key, ...f.args)}${f.status ? ` (HTTP ${f.status})` : ''}`;
}
