/**
 * `TS_PREF` of the Java app (resources/js/ui_pref.js): what the user chose on a screen (a filter, the theme, the font size), kept across
 * reloads, browser restarts and new sign-ins. localStorage can throw (a private window, a browser that blocks site data), so every value
 * is also written to a long-lived cookie and read back from whichever still has it.
 *
 * Same behaviour as the original: `get` gives "" for a value that was never kept (the caller falls back to its default); the cookie is
 * `tsp_<key>`, one year, `SameSite=Lax` — its path is "/" here (Java: the context path of the web app, which this app does not have).
 */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const COOKIE_PREFIX = 'tsp_';

const lsGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const lsSet = (key: string, val: string): boolean => {
  try {
    localStorage.setItem(key, val);
    return true;
  } catch {
    return false;
  }
};
const lsRemove = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unusable = nothing to remove */
  }
};
const cookieName = (key: string): string => COOKIE_PREFIX + encodeURIComponent(key);
const cookieGet = (key: string): string | null => {
  try {
    const name = cookieName(key) + '=';
    for (const raw of (document.cookie || '').split(';')) {
      const c = raw.replace(/^\s+/, '');
      if (c.startsWith(name)) return decodeURIComponent(c.substring(name.length));
    }
  } catch {
    /* cookies blocked */
  }
  return null;
};
const cookieSet = (key: string, val: string): void => {
  try {
    document.cookie = `${cookieName(key)}=${encodeURIComponent(val)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
  } catch {
    /* cookies blocked */
  }
};
const cookieRemove = (key: string): void => {
  try {
    document.cookie = `${cookieName(key)}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    /* cookies blocked */
  }
};

export const tsPref = {
  /** the kept value; "" when neither place has one */
  get(key: string): string {
    const v = lsGet(key);
    if (v !== null && v !== '') return v;
    const c = cookieGet(key);
    if (c !== null && c !== '') {
      lsSet(key, c); // localStorage works again: write it back so that both agree
      return c;
    }
    return '';
  },
  /** written to both places — one that cannot be written leaves the other */
  set(key: string, val: unknown): void {
    const v = val === null || val === undefined ? '' : String(val);
    lsSet(key, v);
    cookieSet(key, v);
  },
  remove(key: string): void {
    lsRemove(key);
    cookieRemove(key);
  },
};
