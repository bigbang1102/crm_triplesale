export type Lang = 'th' | 'en';

/** Runtime configuration, loaded from `config/app-config.json` before the app starts. */
export interface AppConfig {
  /**
   * The two REST APIs the SPA talks to directly (there is no BFF any more): the auth service (login / select-org) and
   * triplesale-service (everything else). A path ("/triplesale-service/api/v1") = same origin, which is what you want:
   * `proxy.conf.json` forwards it during `npm start`, a reverse proxy does in production (the gateway answers a browser
   * origin it does not know with 403, so calling it cross-origin does not work). A full URL is for a gateway that allows it.
   */
  api: {
    auth: string;
    service: string;
    /** dashboard-triplesale-service: the dashboard, the calendar and the KPI event movements */
    dashboard: string;
    /**
     * The generic Master-data API (`/master-tables`, `/master-setup`) behind the "Configuration & Master data" page — served by the
     * separate `configmaster` project (Spring Boot; `http://localhost:8085` in dev). Same rule as the others — a same-origin path;
     * `proxy.conf.json` forwards `/master-service` to it (prefix stripped, dev role headers added). A deployment needs its own
     * reverse-proxy route to configmaster.
     */
    master: string;
  };
  /**
   * Public origin of the gateway behind `api.*` (e.g. the UAT host that `proxy.conf.json` forwards to). The browser only ever sees the
   * same-origin path, so it cannot know this: it is used by the "Log" button to write a curl that runs outside `npm start`.
   * Leave it out when the page is served from the gateway's own origin (the page origin is then the right one).
   */
  apiOrigin?: string;
  /**
   * LEGACY — base path of the old Java WAR (BFF). Only the pages ported before the BFF was dropped still call it
   * (AI HUB, chat, translator, help assistant); each is to be moved onto `api`. Nothing in the auth flow uses it.
   */
  apiBase: string;
  /**
   * Sign in through Keycloak (authorization code + PKCE) instead of the login form. Off by default; with it on, /login sends the
   * browser to Keycloak (`/login?local=1` still shows the old form). The access token of Keycloak becomes the Bearer of the APIs.
   */
  keycloak?: { enabled: boolean; url: string; realm: string; clientId: string; groupCode?: string; groupApi?: string; loginHint?: boolean };
  /** Serve fake answers of the auth API and triplesale-service (core/http/mock-backend.interceptor.ts). */
  mock: boolean;
  defaultLang: Lang;
  features: {
    /** mirrors config.properties `aihub.menu.enabled` */
    aiHubEnabled: boolean;
    /** mirrors `triplesale.page.guard.enabled` */
    pageGuardEnabled: boolean;
    /** "Log" button in the top bar: lists the BFF calls of this tab + copy as curl (Java: ApiLog switch). Off in prod. */
    apiLog?: boolean;
    /**
     * หน้าตั้งค่า: true = ยิง `GET /config/settings` ของ triplesale-service จริง; ไม่ใส่/false = ใช้ JSON ที่ฝังมากับแอป
     * (ตั้งเป็น true ใน app-config.json เมื่อ backend ทำ endpoint นี้เสร็จ)
     */
    settingsConfigApi?: boolean;
    /**
     * Mockup only (`mock: true`): keep the data of the mock pages in Datasource/*.json and the uploaded files in Storage/ through the
     * local file server (`npm run mockup`, tools/mockup-server.mjs). Off / server not running = the mocks run from memory.
     */
    mockupServer?: boolean;
    /** the Configuration & Master data page is answered by a mock of configmaster (features/settings/settings.master-mock.ts): the mockup only */
    masterMock?: boolean;
    /**
     * Mockup only (`mock: true`): AI HUB calls the real ai-hub service through the dev proxy (`/triplesale/aihub` →
     * tools/aihub-dev-proxy.cjs) instead of the in-browser fake (ai-hub.mock.ts). The service itself runs in its mockup mode
     * (`aihub.mockup.data-dir` = Datasource: usage / audit / quota / history are JSON files, no database).
     */
    aiHubService?: boolean;
  };
  upload: {
    /** UI limit (mirrors `triplesale.upload.max.bytes`) */
    maxBytes: number;
    /** backend hard ceiling (20 M base64 chars ≈ 15,000,000 raw bytes) */
    hardCapBytes: number;
  };
  branding: {
    projectEn: string;
    version: string;
  };
}

export const DEFAULT_CONFIG: AppConfig = {
  api: {
    auth: '/triplesale-auth/api/v1',
    service: '/triplesale-service/api/v1',
    dashboard: '/dashboard-triplesale-service/api/v1',
    master: '/master-service/api/v1',
  },
  apiBase: '/triplesale',
  keycloak: { enabled: false, url: '', realm: 'triplesale', clientId: 'triplesales-web' },
  mock: false,
  defaultLang: 'th',
  features: { aiHubEnabled: true, pageGuardEnabled: true, apiLog: false },
  upload: { maxBytes: 14_680_064, hardCapBytes: 15_000_000 },
  branding: { projectEn: 'ACHIEVER CO., LTD.', version: '' },
};
