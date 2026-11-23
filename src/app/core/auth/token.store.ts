import { Injectable } from '@angular/core';
import { SessionInfo } from './auth.models';

/** What a signed-in tab keeps: the tokens of the auth service and the user it was issued to. */
export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  /** epoch ms — Java: `ss_token_expires` = login time + `expires_in` (the filter turns a late request into TOKEN_EXPIRED) */
  expiresAt: number;
  session: SessionInfo;
  /** set when the sign-in came from Keycloak: logout then ends the Keycloak session too */
  provider?: 'keycloak';
  idToken?: string;
  /** realm URL of the sign-in (logout goes to the same one) */
  issuer?: string;
}

const KEY = 'ts_auth';

/**
 * Where the access token lives now that there is no BFF holding it in an HttpSession.
 *
 * sessionStorage (decision of 2026-10-20): survives a reload, belongs to one tab, gone when the tab closes — the nearest
 * thing to the old server session, but readable by script, so the page must stay free of injected markup (the input guard
 * and the escaping of every generated page are part of that). When storage is blocked a memory copy keeps this tab working.
 *
 * Plain service with no dependencies: the HTTP interceptors read it, so it must not need HttpClient itself.
 */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  private memory: StoredAuth | null = null;

  read(): StoredAuth | null {
    if (this.memory) return this.memory;
    try {
      const raw = sessionStorage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as Partial<StoredAuth>) : null;
      if (parsed && typeof parsed.accessToken === 'string' && parsed.accessToken && typeof parsed.expiresAt === 'number' && parsed.session) {
        this.memory = parsed as StoredAuth;
      }
    } catch {
      /* storage blocked or the value is not ours */
    }
    return this.memory;
  }

  write(value: StoredAuth): void {
    this.memory = value;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(value));
    } catch {
      /* the memory copy is enough for this tab */
    }
  }

  clear(): void {
    this.memory = null;
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* nothing stored */
    }
  }

  /** true when there is a token whose time has not run out (Java: `ss_access_token` present and `now < ss_token_expires`) */
  isLive(now = Date.now()): boolean {
    const v = this.read();
    return !!v && now < v.expiresAt;
  }
}
