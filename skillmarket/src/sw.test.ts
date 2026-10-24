/** Runs public/sw.js inside a sandbox with a fake Cache API and network, to test the offline behaviour. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

type Handler = (event: Record<string, unknown>) => void;

class FakeCache {
  store = new Map<string, Response>();
  async add(url: string) { const r = await (globalThis as never as { __net: (u: string) => Promise<Response> }).__net(url); if (!r.ok) throw new Error('bad'); this.store.set(url, r); }
  async addAll(urls: string[]) { for (const u of urls) await this.add(u); }
  async put(req: Request | string, res: Response) { this.store.set(typeof req === 'string' ? req : new URL(req.url).pathname + new URL(req.url).search, res); }
  async match(req: Request | string) { return this.store.get(this.key(req))?.clone(); }
  key(req: Request | string) { if (typeof req === 'string') return req; const u = new URL(req.url); return u.origin === 'https://app.test' ? u.pathname + u.search : req.url; }
}

function setup(assets: string[], network: (url: string) => Promise<Response>) {
  const caches = new Map<string, FakeCache>();
  const handlers: Record<string, Handler> = {};
  const log = { skipWaiting: 0, claimed: 0, networkCalls: [] as string[] };
  const fakeCaches = {
    async open(name: string) { if (!caches.has(name)) caches.set(name, new FakeCache()); return caches.get(name)!; },
    async keys() { return [...caches.keys()]; },
    async delete(name: string) { return caches.delete(name); },
    async match(req: Request | string) { for (const c of caches.values()) { const hit = await c.match(req); if (hit) return hit; } return undefined; },
  };
  const net = async (u: string | Request) => { const url = typeof u === 'string' ? u : u.url; log.networkCalls.push(url); return network(url); };
  (globalThis as Record<string, unknown>).__net = (u: string) => net(u.startsWith('http') ? u : `https://app.test${u}`);
  const source = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8').replace('/*__PRECACHE_ASSETS__*/[]', JSON.stringify(assets));
  const self = {
    location: { origin: 'https://app.test' },
    addEventListener: (type: string, fn: Handler) => { handlers[type] = fn; },
    skipWaiting: () => { log.skipWaiting++; },
    clients: { claim: async () => { log.claimed++; } },
  };
  vm.runInNewContext(source, { self, caches: fakeCaches, fetch: net, URL, Response, Request, Promise, setTimeout, console });
  const dispatch = async (type: string, extra: Record<string, unknown> = {}) => {
    let waited: Promise<unknown> = Promise.resolve();
    let responded: Promise<Response> | null = null;
    handlers[type]({ ...extra, waitUntil: (p: Promise<unknown>) => { waited = p; }, respondWith: (p: Promise<Response>) => { responded = p; } });
    await waited;
    return responded ? await (responded as Promise<Response>) : null;
  };
  return { caches, log, dispatch, handlers };
}

const ok = (body: string, status = 200) => new Response(body, { status });
const request = (path: string, init: { method?: string; mode?: string } = {}) =>
  ({ url: `https://app.test${path}`, method: init.method ?? 'GET', mode: init.mode ?? 'cors' });

let online: boolean;
const network = async (url: string) => {
  if (!online) throw new TypeError('Failed to fetch');
  const path = new URL(url).pathname;
  if (path === '/missing.png') return ok('nope', 404);
  if (path === '/boom') return ok('server error', 500);
  return ok(`body:${path}`);
};

beforeEach(() => { online = true; });

describe('install and activate', () => {
  it('precaches the shell and the injected build assets', async () => {
    const sw = setup(['/assets/index-abc.js', '/assets/index-abc.css'], network);
    await sw.dispatch('install');
    const shell = sw.caches.get('skillmarket-shell-v1')!;
    expect([...shell.store.keys()].sort()).toEqual(
      ['/', '/assets/index-abc.css', '/assets/index-abc.js', '/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/manifest.webmanifest', '/offline.html'].sort());
  });

  it('fails the install if a core shell file cannot be fetched (so a broken SW is never activated)', async () => {
    const sw = setup([], async (url) => (url.endsWith('/offline.html') ? ok('x', 404) : ok('x')));
    await expect(sw.dispatch('install')).rejects.toThrow();
  });

  it('tolerates a missing optional build asset', async () => {
    const sw = setup(['/assets/ok.js', '/missing.png'], network);
    await expect(sw.dispatch('install')).resolves.toBeNull();
    expect(sw.caches.get('skillmarket-shell-v1')!.store.has('/assets/ok.js')).toBe(true);
  });

  it('removes old caches on activate and takes control', async () => {
    const sw = setup([], network);
    await sw.dispatch('install');
    sw.caches.set('skillmarket-shell-v0', new FakeCache());
    sw.caches.set('something-else', new FakeCache());
    await sw.dispatch('activate');
    expect([...sw.caches.keys()].sort()).toEqual(['skillmarket-shell-v1']);
    expect(sw.log.claimed).toBe(1);
  });

  it('only skips waiting when told to by the page', async () => {
    const sw = setup([], network);
    sw.handlers.message({ data: { type: 'OTHER' } });
    expect(sw.log.skipWaiting).toBe(0);
    sw.handlers.message({ data: { type: 'SKIP_WAITING' } });
    expect(sw.log.skipWaiting).toBe(1);
  });
});

describe('fetch handling', () => {
  it('ignores non-GET requests and cross-origin API calls (Supabase)', async () => {
    const sw = setup([], network);
    expect(await sw.dispatch('fetch', { request: request('/api', { method: 'POST' }) })).toBeNull();
    expect(await sw.dispatch('fetch', { request: { url: 'https://abc.supabase.co/rest/v1/skills', method: 'GET', mode: 'cors' } })).toBeNull();
  });

  it('serves built assets from the cache without touching the network', async () => {
    const sw = setup(['/assets/app.js'], network);
    await sw.dispatch('install');
    sw.log.networkCalls.length = 0;
    online = false;                                                          // fully offline
    const res = await sw.dispatch('fetch', { request: request('/assets/app.js') });
    expect(await res!.text()).toBe('body:/assets/app.js');
    expect(sw.log.networkCalls).toEqual([]);
  });

  it('caches an unseen asset on first fetch, then serves it offline', async () => {
    const sw = setup([], network);
    await sw.dispatch('install');
    await sw.dispatch('fetch', { request: request('/assets/lazy-chunk.js') });
    online = false;
    const again = await sw.dispatch('fetch', { request: request('/assets/lazy-chunk.js') });
    expect(await again!.text()).toBe('body:/assets/lazy-chunk.js');
  });

  it('does not cache failed responses', async () => {
    const sw = setup([], network);
    await sw.dispatch('install');
    const res = await sw.dispatch('fetch', { request: request('/assets/../missing.png') });
    expect(res!.status).toBe(404);
    expect(sw.caches.get('skillmarket-runtime-v1')?.store.size ?? 0).toBe(0);
  });

  it('navigations use the network when online', async () => {
    const sw = setup([], network);
    await sw.dispatch('install');
    const res = await sw.dispatch('fetch', { request: request('/marketplace', { mode: 'navigate' }) });
    expect(await res!.text()).toBe('body:/marketplace');
  });

  it('offline navigations fall back to the cached app shell, so deep links still open', async () => {
    const sw = setup([], network);
    await sw.dispatch('install');
    online = false;
    const res = await sw.dispatch('fetch', { request: request('/skills/123', { mode: 'navigate' }) });
    expect(await res!.text()).toBe('body:/');
  });

  it('server errors on navigation also fall back to the shell', async () => {
    const sw = setup([], network);
    await sw.dispatch('install');
    const res = await sw.dispatch('fetch', { request: request('/boom', { mode: 'navigate' }) });
    expect(await res!.text()).toBe('body:/');
  });

  it('shows the offline page if the shell was never cached', async () => {
    const sw = setup([], network);
    online = false;
    sw.caches.set('skillmarket-shell-v1', new FakeCache());
    await sw.caches.get('skillmarket-shell-v1')!.put('/offline.html', ok('offline page'));
    const res = await sw.dispatch('fetch', { request: request('/anything', { mode: 'navigate' }) });
    expect(await res!.text()).toBe('offline page');
  });

  it('stale-while-revalidate for fonts: answers from cache, refreshes in the background', async () => {
    const sw = setup([], network);
    const font = { url: 'https://fonts.gstatic.com/s/font.woff2', method: 'GET', mode: 'cors' };
    online = true;
    await sw.dispatch('fetch', { request: font });                           // first call fills the cache
    sw.log.networkCalls.length = 0;
    const res = await sw.dispatch('fetch', { request: font });
    expect(res).not.toBeNull();
    expect(sw.log.networkCalls).toEqual([font.url]);                         // revalidated
  });
});

describe('build output', () => {
  it('keeps the precache placeholder so the build step can inject the asset list', () => {
    expect(readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8')).toContain('/*__PRECACHE_ASSETS__*/[]');
  });
});
