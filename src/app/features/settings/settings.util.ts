import type { ResourceRef } from '@angular/core';

/** `resource.value()` THROWS while the resource is in an error state (a refused call) — read it only when it holds a value. */
export function valueOf<T>(res: ResourceRef<T | undefined> | null | undefined): T | undefined {
  return res?.hasValue() ? res.value() : undefined;
}

/** `yyyy-MM-dd` → `dd/MM/yyyy` (ตามกติกาของ API : client จัดรูปแบบวันที่เอง) */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** ISO-8601 → `dd/MM/yyyy HH:mm` ตามเวลาของเครื่อง */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
