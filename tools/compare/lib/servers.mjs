// The two local servers of a comparison run (random ports, closed at the end):
//   ng       the production-like snapshot of the Angular app (`ng build --configuration development`), SPA fallback
//   harness  what the Java side needs: the Java replica pages, the page's backend (the SAME mock the Angular page runs),
//            the static files of the Java web/ folder, the Angular public/ folder (fonts …) and Font Awesome
import { createServer, request as httpRequest } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.eot': 'application/vnd.ms-fontobject', '.json': 'application/json', '.ico': 'image/x-icon', '.map': 'application/json',
  '.xhtml': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' };

const listen = (server) => new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server.address().port)));
const inside = (root, p) => {
  const f = normalize(join(root, p));
  return f.startsWith(resolve(root)) ? f : null;
};

async function sendFile(res, file, extra = {}) {
  const content = await readFile(file);
  res.writeHead(200, { ...CORS, ...extra, 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(content);
}

/**
 * @param {string} dir  the `ng build` output
 * @param {{ live?: boolean, proxy?: { prefixes: string[], to: string } }} [opts]
 *   live  = the app runs with `mock: false` (config/app-config.json is served with the flag off) — its pages call their LIVE backends;
 *   proxy = the REST prefixes (/triplesale-auth …) are forwarded to the harness server, which plays the services (same origin for the
 *           app, so the cookie of the scenario reaches it)
 */
export async function startNg(dir, opts = {}) {
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (opts.proxy?.prefixes.some((p) => path.startsWith(p))) {
        const target = new URL(req.url, opts.proxy.to);
        const up = httpRequest(target, { method: req.method, headers: { ...req.headers, host: target.host } }, (r) => {
          res.writeHead(r.statusCode ?? 502, r.headers);
          r.pipe(res);
        });
        up.on('error', (e) => { res.writeHead(502); res.end(String(e?.message ?? e)); });
        req.pipe(up);
        return;
      }
      if (opts.live && path === '/config/app-config.json') {
        const cfg = JSON.parse(await readFile(join(dir, 'config/app-config.json'), 'utf8'));
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        return res.end(JSON.stringify({ ...cfg, mock: false }));
      }
      let file = inside(dir, path === '/' ? 'index.html' : path.slice(1));
      const ok = file && (await stat(file).then((s) => s.isFile(), () => false));
      if (!ok) {
        if (extname(path)) { res.writeHead(404); return res.end('404 ' + path); }
        file = join(dir, 'index.html'); // SPA fallback
      }
      await sendFile(res, file);
    } catch (e) {
      res.writeHead(500);
      res.end(String(e?.message ?? e));
    }
  });
  const port = await listen(server);
  return { origin: `http://127.0.0.1:${port}`, close: () => server.close() };
}

const readBody = async (req) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
};

/**
 * @param {object} o
 * @param {string} o.javaWeb    web/ of the Java project
 * @param {string} o.ngRoot     root of the Angular project
 * @param {Record<string,string>} o.pages   url path -> file of a built Java replica page
 * @param {(sid:string, delay:number, hook:string)=>Promise<any>} o.newState   a fresh backend for one scenario run (hook: opts.live.hook of a --live scenario)
 * @param {(req:{method:string,path:string,search:string,body?:string,headers:object}, state:any)=>Promise<null|{status:number,headers?:object,body:any}>} o.handle
 */
export async function startHarness({ javaWeb, ngRoot, pages, newState, handle }) {
  const states = new Map();
  const sidOf = (req) => /(?:^|;\s*)cmp_sid=([\w-]+)/.exec(req.headers.cookie ?? '')?.[1] ?? 'default';
  const stateOf = async (sid) => {
    if (!states.has(sid)) states.set(sid, await newState(sid, 0, ''));
    return states.get(sid);
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const path = decodeURIComponent(url.pathname);
    try {
      if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
      const sid = sidOf(req);
      if (path === '/__reset') {
        states.set(sid, await newState(sid, Number(url.searchParams.get('delay') ?? 0), url.searchParams.get('hook') ?? ''));
        res.writeHead(200, CORS);
        return res.end('reset');
      }
      const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
      const r = await handle({ method: req.method, path, search: url.search, body, headers: req.headers }, await stateOf(sid));
      // `destroy` = no answer at all (the connection is dropped): the page's fetch rejects with "TypeError: Failed to fetch", as with a network error
      if (r?.destroy) return void req.socket.destroy();
      if (r) {
        res.writeHead(r.status, { ...CORS, 'cache-control': 'no-store', ...(r.headers ?? {}) });
        return res.end(r.body);
      }
      let file = pages[path];
      if (!file) {
        if (path.startsWith('/__fa/')) file = inside(join(ngRoot, 'node_modules/@fortawesome/fontawesome-free'), path.slice('/__fa/'.length));
        else if (path.startsWith('/__pub/')) file = inside(join(ngRoot, 'public'), path.slice('/__pub/'.length));
        else if (path.startsWith('/triplesale/')) file = inside(javaWeb, path.slice('/triplesale/'.length));
        else if (path.startsWith('/images/')) file = inside(javaWeb, path.slice(1)); // (the rail icons of the shell ask for the context-less path)
      }
      if (!file) { res.writeHead(404, CORS); return res.end('not found ' + path); }
      if (path.startsWith('/triplesale/') && extname(file).toLowerCase() === '.css') {
        // Facelets resolves the EL of the stylesheets the server serves: #{resource['library:name']} (the icon fonts, background images) and the context path
        const css = (await readFile(file, 'utf8'))
          .replace(/#\{resource\['([\w.-]+):([^']+)'\]\}/g, '/triplesale/resources/$1/$2')
          .replace(/#\{request\.contextPath\}/g, '/triplesale');
        res.writeHead(200, { ...CORS, 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(css);
      }
      await sendFile(res, file);
    } catch (e) {
      res.writeHead(404, CORS);
      res.end('404 ' + path + ' ' + (e?.message ?? ''));
    }
  });
  const port = await listen(server);
  return { origin: `http://127.0.0.1:${port}`, close: () => server.close() };
}
