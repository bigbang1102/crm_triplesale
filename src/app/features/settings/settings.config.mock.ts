import { reference } from '@core/mock/reference';
import { ConfigTable, SettingsConfigResponse, settingsConfigProblem, settingsTablesProblem } from './settings-config.model';
import response from './settings.config.response.json';
import tables from './settings.tables.response.json';

/**
 * คำตอบจำลองของ `GET /config/settings` — ไฟล์ JSON เป็นก้อนเดียวกับที่ส่งให้ backend (docs/integration/settings-config.json);
 * โหลดผ่าน dynamic import จาก SettingsApi จึงไม่เข้า bundle หลักและไม่ถูกใช้เมื่อ `mock: false`.
 * ทั้งโครง (เมนู หมวด ขั้นตอน ตาราง) และนิยามตารางอ่านจาก Datasource กลาง (`ref.settingsConfig.json` › response / tables) ได้ เมื่อรูปถูกต้อง — ไม่ถูก = ใช้ไฟล์ JSON ในโค้ด
 */
export const SETTINGS_CONFIG_RESPONSE = reference('settingsConfig.response', response as unknown as SettingsConfigResponse, undefined, (doc) => settingsConfigProblem(doc) === undefined);

/** คำตอบจำลองของ `GET /config/settings/tables/{name}` ทีละตาราง (docs/integration/settings-tables.json) */
export const SETTINGS_TABLE_RESPONSES = reference('settingsConfig.tables', tables as unknown as Record<string, ConfigTable>, undefined, (doc) => settingsTablesProblem(doc) === undefined);
