import { NextRequest, NextResponse } from 'next/server';

const BOT_UA_RE = /(bot|crawler|spider|scrapy|curl|wget|python-requests|httpclient|headless|facebookexternalhit|slurp)/i;

/**
 * Legacy admin pages are redirected to /admin-dashboard.
 *
 * Security enforcement for all admin APIs is now handled at the route level
 * via bearer token validation and admin role checks.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isApi = pathname.startsWith('/api/');
  if (isApi) {
    const method = req.method.toUpperCase();
    const ua = req.headers.get('user-agent') ?? '';
    const isBotLike = BOT_UA_RE.test(ua);

    // Block obvious crawler traffic probing API GET routes. This protects free
    // limits by dropping requests before they reach route handlers/DB/KV.
    if (isBotLike && method === 'GET' && pathname !== '/api/health') {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    const res = NextResponse.next();
    res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return res;
  }

  const isLegacyAdminPage = pathname === '/admin' || pathname.startsWith('/admin/');
  if (isLegacyAdminPage) {
    const url = req.nextUrl.clone();
    url.pathname = '/admin-dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
};
