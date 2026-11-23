// The fake REST services of the LIVE mode of the comparison (`node tools/compare/run.mjs <page> --live`).
//
// In live mode the Angular app runs with `mock: false`: its pages call their LIVE backends (src/app/features/<page>/<page>.live.ts), which call
// the REST services through the app's HttpClient. The harness plays those services on the harness server (the app reaches it through a
// same-origin proxy, so the cookie of the scenario selects the state):
//   • the auth service and the three routes the sign-in needs from triplesale-service  → core/http/auth-api.mock.ts (the same fake as `mock: true`)
//   • every other route of triplesale-service / dashboard-triplesale-service            → page.upstream(req, state, ctx) of the page being compared
//
// page.upstream = the contract of the REAL service as the Java code consumes it (paths, parameters, envelope, field names), answered from the
// SAME mock data the Java replica gets — so "Angular live backend ∘ fake service" must give the same page as "Java replica ∘ mock BFF".
// What it proves: the mapping BFF route → REST call, the parameter renames, the envelope handling, the role gates, the error statuses and the
// reshaping the servlets did. What it cannot prove: that the real service answers in the shape the fixtures have (no credentials here).
import { join } from 'node:path';

const PREFIX = { auth: '/triplesale-auth/api/v1', service: '/triplesale-service/api/v1', dashboard: '/dashboard-triplesale-service/api/v1' };
/** the routes of triplesale-service the sign-in itself needs (the fake of auth-api.mock.ts answers them) */
const SIGN_IN_ROUTES = /^\/(master-data\/branches|auth\/user-detail|me\/roles)(\?|$)/;

export async function createLiveUpstream(ctx, page) {
  const authMock = await ctx.loadTs(join(ctx.ngRoot, 'src/app/core/http/auth-api.mock.ts'));
  const users = await ctx.loadTs(join(ctx.ngRoot, 'src/app/core/http/mock-users.ts'));

  /** @returns {Promise<{status:number, headers?:object, body:any}|null>} null = not a REST route */
  async function handle(req, state) {
    const api = req.path.startsWith(PREFIX.auth + '/') ? 'auth' : req.path.startsWith(PREFIX.service + '/') ? 'service' : req.path.startsWith(PREFIX.dashboard + '/') ? 'dashboard' : null;
    if (!api) return null;
    const rel = req.path.slice(PREFIX[api].length) + (req.search ?? '');
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? null;
    let body;
    try {
      body = req.body ? JSON.parse(req.body) : undefined;
    } catch {
      body = req.body;
    }
    if (api === 'auth' || (api === 'service' && SIGN_IN_ROUTES.test(rel))) {
      const out = authMock.handleApi({ api, method: req.method, path: rel, body, bearer }, users.profileOf);
      if (out.status === 0) return { destroy: true };
      return json(out.status, out.body);
    }
    // a token the fake never issued = 401 like the gateway
    if (!bearer || !/^mock\.access\./.test(bearer)) return json(401, { timestamp: new Date().toISOString(), status: 401, message: 'Unauthorized', error: 'Unauthorized' });
    if (!page.upstream) return json(501, { status: 501, message: `the page "${page.name}" has no upstream (fake service) for ${req.method} ${rel}` });
    const out = await page.upstream({ api, method: req.method, path: req.path.slice(PREFIX[api].length), search: req.search ?? '', body, headers: req.headers }, state, ctx);
    if (!out) return json(404, { timestamp: new Date().toISOString(), status: 404, message: `no such route in the fake service: ${req.method} ${rel}` });
    if (out.destroy) return out;
    return json(out.status ?? 200, out.body, out.headers);
  }

  const json = (status, body, headers = {}) => ({ status, headers: { 'content-type': 'application/json;charset=UTF-8', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body ?? {}) });
  return { handle };
}
