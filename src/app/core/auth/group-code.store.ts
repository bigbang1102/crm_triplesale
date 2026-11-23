/**
 * The group code (รหัสกลุ่ม) the user typed on the login page, kept for the browser session: the next sign-in of this session goes
 * straight on to the identity provider and the code is not asked again — until the session ends (the browser / tab is closed or the site
 * data is cleared) or the user asks to change the group (`/login?changeGroup=1`, the link of the company page).
 * sessionStorage on purpose (not localStorage): a code that stays for ever on a shared machine would let anyone open that group's sign-in.
 * Framework-free.
 */
export const GROUP_CODE_KEY = 'ts_group_code';

const storage = (): Storage | null => {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null; // storage blocked (private window, site data off): the code is simply not remembered
  }
};

/** the remembered group code, or '' */
export function rememberedGroupCode(): string {
  try {
    return storage()?.getItem(GROUP_CODE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function rememberGroupCode(code: string): void {
  try {
    const value = code.trim();
    if (value) storage()?.setItem(GROUP_CODE_KEY, value);
  } catch {
    // not remembered: the user is asked again next time
  }
}

export function forgetGroupCode(): void {
  try {
    storage()?.removeItem(GROUP_CODE_KEY);
  } catch {
    // nothing to forget
  }
}
