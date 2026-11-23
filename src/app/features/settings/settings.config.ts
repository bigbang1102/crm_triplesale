/**
 * ค่าคงที่ของหน้าตั้งค่าที่ไม่ได้มาจาก config ของ backend.
 * โครง tab / subtab / ตาราง / ฟิลด์ มาจาก `GET /config/settings` (settings.api.ts · สัญญาที่ settings-config.model.ts).
 */

export const SETTINGS_ENTITIES: readonly { id: string; name: string }[] = [
  { id: 'SUN', name: 'SUN GATEWAY' },
  { id: 'GGW', name: 'GGW' },
];
