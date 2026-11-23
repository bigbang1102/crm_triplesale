/**
 * The address a browser loads a stored file from (`<img src>`, a download link).
 *
 * The file links of the services are absolute addresses on the API host (`attachFile` of a prospect). While the app runs on the dev server (localhost) that host
 * is the UAT one, whose certificate Chrome does not trust, so an `<img>` / `<a>` that goes to it directly is refused ("Your connection is not private") although the
 * API calls — made through the dev proxy — work. Here such a link goes through the proxy too (`/ts-files` in proxy.conf.json → the API origin): the same origin as the
 * page. Anywhere else (a deployed build behind the gateway, a link of another host, a relative path) the address is returned as it is. Framework-free.
 */
export const FILE_PROXY_PREFIX = '/ts-files';

export function browserFileUrl(url: string, apiOrigin: string | undefined, page: { origin: string; hostname: string }): string {
  if (!apiOrigin || !/^https?:\/\//i.test(url)) return url;
  if (page.hostname !== 'localhost' && page.hostname !== '127.0.0.1') return url;
  let target: URL;
  let api: URL;
  try {
    target = new URL(url);
    api = new URL(apiOrigin);
  } catch {
    return url;
  }
  if (target.origin !== api.origin || target.origin === page.origin) return url;
  return `${FILE_PROXY_PREFIX}${target.pathname}${target.search}`;
}
