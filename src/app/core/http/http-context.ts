import { HttpContextToken } from '@angular/common/http';

/**
 * Set on the calls of the sign-in itself (login / branches / select-org). A 401 there means "wrong password" or "no sign-in
 * in progress" — the login page shows the message — and must not be taken for "the session of a signed-in user ended".
 */
export const SIGN_IN_CALL = new HttpContextToken<boolean>(() => false);

/** Set on a call that is sent again after a refresh token gave new tokens: a second 401 ends the session instead of refreshing again. */
export const REFRESH_RETRIED = new HttpContextToken<boolean>(() => false);
