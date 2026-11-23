/**
 * A scripted `RestDeps` for the specs of the live backends (no Angular, no network): `answer(call)` plays the REST service, `calls`
 * records what the backend asked. Used by `*.live.spec.ts`; nothing of the app imports it.
 */
import type { RestDeps, RestResult } from './rest';

export interface FakeCall {
  method: string;
  /** the whole URL as the HttpClient got it */
  url: string;
  /** the URL without the base of the service (`/drilldown/tcs01?page=1`), or the whole URL when it is another API */
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/** what the scripted service says: a `{status, text}`, an object / array (200 + its JSON), or a string (200 + that text) */
export type FakeAnswer = RestResult | object | string | null;

export interface FakeOptions {
  roles?: string[];
  lang?: 'th' | 'en';
  /** `masterdata_en/th.properties` as `code → name` */
  master?: { en?: Record<string, string>; th?: Record<string, string> };
  /** messages of the page (`label.…` of messages_xx.properties) */
  messages?: Record<string, string>;
  /** static files by path (`assets/data/metro-geo.json`) */
  assets?: Record<string, string>;
  user?: Partial<RestDeps['user']>;
}

export const SERVICE_API = '/triplesale-service/api/v1';
export const DASHBOARD_API = '/dashboard-triplesale-service/api/v1';

export function fakeRest(answer: (call: FakeCall) => FakeAnswer | Promise<FakeAnswer>, o: FakeOptions = {}) {
  const calls: FakeCall[] = [];
  const deps: RestDeps = {
    call: async (method, url, body, headers) => {
      const call: FakeCall = { method, url, path: url.startsWith(SERVICE_API) ? url.slice(SERVICE_API.length) : url, body, headers };
      calls.push(call);
      const a = await answer(call);
      if (a === null) return { status: 0, text: '' };
      if (typeof a === 'string') return { status: 200, text: a };
      if ('status' in a && 'text' in a && typeof (a as RestResult).text === 'string') return a as RestResult;
      return { status: 200, text: JSON.stringify(a) };
    },
    serviceApi: SERVICE_API,
    dashboardApi: DASHBOARD_API,
    user: { username: 'u', employeeId: 1, employeeCode: 'E1', branchCode: 'B1', branchId: 1, ...o.user },
    hasRole: (r) => (o.roles ?? []).includes(r),
    lang: () => o.lang ?? 'th',
    masterText: (lang, key) => o.master?.[lang]?.[key],
    message: (key) => o.messages?.[key] ?? key,
    asset: async (path) => o.assets?.[path] ?? null,
  };
  return { deps, calls };
}
