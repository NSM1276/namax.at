// Vercel Routing Middleware. Runs before the filesystem, so <slug>.namax.at is answered by the
// venue page function instead of the namax home page that also lives at "/".
// Requests for www.namax.at, namax.at and preview hosts pass through untouched.
// The page function reads the slug from the Host header itself; nothing is passed in the URL.

// The tab and home-screen icons as PNG/ICO (Google shows a PNG or ICO icon next to the result); drawn by the picture function.
export const ICONS = { '/favicon.ico': 'ico', '/favicon.png': 'png', '/apple-touch-icon.png': 'apple' };

/** Path to serve for a venue host, or null when the request is not for a venue page. */
export function venuePath(host, pathname) {
  const name = String(host || '').toLowerCase().split(':')[0];
  const match = /^([a-z0-9-]+)\.namax\.at$/.exec(name);
  if (!match || match[1] === 'www') return null;
  if (pathname.startsWith('/api/') || pathname.startsWith('/v/_shared/')) return null; // chat, photo, hit; shared fonts
  if (Object.hasOwn(ICONS, pathname)) return '/api/venue/og';
  return '/api/venue/page';
}

// Run only where a venue page can be answered: not for chat/photo/hit calls, the shared venue files, or namax.at's own
// fonts, styles and scripts. Every middleware run is billed, and a page view loads several of those files (Nasim, 2026-11-24).
export const config = { matcher: ['/((?!api/|v/_shared/|fonts/|css/|js/|_vercel/).*)'] };

export default function middleware(request) {
  const url = new URL(request.url);
  const target = venuePath(request.headers.get('host'), url.pathname);
  if (target === null) return new Response(null, { headers: { 'x-middleware-next': '1' } });
  if (target === '/api/venue/og') url.searchParams.set('icon', ICONS[url.pathname]);
  url.pathname = target; // the query (?k=…) stays as it is
  return new Response(null, { headers: { 'x-middleware-rewrite': url.toString() } });
}
