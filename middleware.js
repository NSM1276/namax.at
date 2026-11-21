// Vercel Routing Middleware. Runs before the filesystem, so <slug>.namax.at shows the
// venue page in /v/<slug>/ instead of the namax home page that also lives at "/".
// Requests for www.namax.at, namax.at and preview hosts pass through untouched.

/** Path to serve for a venue host, or null when the request is not for a venue page. */
export function venuePath(host, pathname) {
  const name = String(host || '').toLowerCase().split(':')[0];
  const match = /^([a-z0-9-]+)\.namax\.at$/.exec(name);
  if (!match || match[1] === 'www') return null;
  if (pathname.startsWith('/v/_shared/')) return null; // shared fonts are served as they are
  return `/v/${match[1]}${pathname === '/' ? '' : pathname}`;
}

export default function middleware(request) {
  const url = new URL(request.url);
  const target = venuePath(request.headers.get('host'), url.pathname);
  if (target === null) return new Response(null, { headers: { 'x-middleware-next': '1' } });
  url.pathname = target;
  return new Response(null, { headers: { 'x-middleware-rewrite': url.toString() } });
}
