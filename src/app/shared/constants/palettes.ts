/**
 * Colour concepts shared by the whole system.
 * Ported 1:1 from triple_sale_main/CLAUDE.md (sections 2, 3 and 6) — the values MUST stay identical
 * to the Java frontend. Never introduce colours outside these tables.
 */

/* ------------------------------------------------------------------ */
/* 2. Activity stepper palette                                         */
/* ------------------------------------------------------------------ */

/** Index = total number of activity groups (1..12). Each row is ordered left → right. */
export const STEPPER_PALETTE: readonly (readonly string[])[] = [
  [], // 0 – unused, keeps the array index equal to the step count
  ['#0C8E6A'],
  ['#0C8E6A', '#6043B6'],
  ['#0C8E6A', '#0D61CF', '#6043B6'],
  ['#0C8E6A', '#1A8FE3', '#0D61CF', '#6043B6'],
  ['#0C8E6A', '#0AA77C', '#1A8FE3', '#0D61CF', '#6043B6'],
  ['#0C8E6A', '#0AA77C', '#1A8FE3', '#0D61CF', '#6043B6', '#7F63D2'],
  ['#0C8E6A', '#0AA77C', '#00C08B', '#1A8FE3', '#0D61CF', '#6043B6', '#7F63D2'],
  ['#0C8E6A', '#0AA77C', '#00C08B', '#009ED0', '#1A8FE3', '#0D61CF', '#6043B6', '#7F63D2'],
  ['#0C8E6A', '#0AA77C', '#00C08B', '#009ED0', '#1A8FE3', '#0D61CF', '#6043B6', '#7F63D2', '#B7A4EF'],
  ['#0C8E6A', '#0AA77C', '#00C08B', '#62E1B3', '#009ED0', '#1A8FE3', '#0D61CF', '#6043B6', '#7F63D2', '#B7A4EF'],
  ['#0C8E6A', '#0AA77C', '#00C08B', '#62E1B3', '#80E8FF', '#009ED0', '#1A8FE3', '#0D61CF', '#6043B6', '#7F63D2', '#B7A4EF'],
  ['#0C8E6A', '#0AA77C', '#00C08B', '#62E1B3', '#80E8FF', '#1DCBF1', '#009ED0', '#1A8FE3', '#0D61CF', '#6043B6', '#7F63D2', '#B7A4EF'],
];

const STEPPER_FALLBACK = '#0C8E6A';

/** Colour of the `idx`-th (0-based) activity group badge out of `total` groups. */
export function stepperColor(total: number, idx: number): string {
  const row = STEPPER_PALETTE[Math.min(total, 12)] ?? STEPPER_PALETTE[12];
  return row[Math.min(idx, row.length - 1)] ?? STEPPER_FALLBACK;
}

/* ------------------------------------------------------------------ */
/* 3. Interest / status colour                                         */
/* ------------------------------------------------------------------ */

export const INT_COLOR_MAP = {
  HOT: '#EB5050',
  WARM: '#FF8E4E',
  COLD: '#4B84FF',
  INACTIVE: '#6043B6',
  NEW: '#EB4FA0',
  LOST: '#8A92A6',
  SUCCESS: '#008B5A',
  SOLD: '#008B5A', // SOLD ≡ SUCCESS (deal closed successfully)
} as const;

export type InterestStatus = keyof typeof INT_COLOR_MAP;

/** Neutral grey used when a status is unknown. */
export const INT_COLOR_FALLBACK = INT_COLOR_MAP.LOST;

export function interestColor(status: string | null | undefined): string {
  const key = String(status ?? '').trim().toUpperCase();
  return (INT_COLOR_MAP as Record<string, string>)[key] ?? INT_COLOR_FALLBACK;
}

/* ------------------------------------------------------------------ */
/* 6. Tag palette (20 colours, picked by hashing the group name)       */
/* ------------------------------------------------------------------ */

export const TAG_PALETTE: readonly string[] = [
  '#0C8E6A', '#14A2D0', '#0D61CF', '#462D90', '#C92A76',
  '#CD1515', '#DA6624', '#DA9A24', '#87B236', '#626262',
  '#2D715E', '#338BA7', '#295794', '#5A2C94', '#8A124C',
  '#7B0505', '#A15D37', '#A28537', '#5F7A15', '#3C3C3C',
];

/**
 * Stable colour for a group name: same name → same colour on every page / reload.
 * Hash = h*31 + charCode (32-bit) — identical to `groupPillColor()` in the Java frontend.
 */
export function groupPillColor(groupName: string | null | undefined): string {
  const name = String(groupName ?? '').trim();
  if (!name) return TAG_PALETTE[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return TAG_PALETTE[Math.abs(h) % TAG_PALETTE.length];
}

/** `#RRGGBB` → `rgba(r,g,b,alpha)`. Tag background = colour at 20 % opacity, text = full colour. */
export function hexToRgba(hex: string | null | undefined, alpha: number): string {
  const h = String(hex ?? '').replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Ready-to-bind inline style for a group tag/badge. */
export function groupPillStyle(groupName: string | null | undefined): { background: string; color: string } {
  const color = groupPillColor(groupName);
  return { background: hexToRgba(color, 0.2), color };
}
