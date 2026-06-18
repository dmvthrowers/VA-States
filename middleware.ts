import { NextRequest, NextResponse } from 'next/server';
import { safeCompare } from '@/lib/tokens';

/**
 * HTTP Basic Auth guard for /admin pages AND /api/admin routes.
 * Credentials stored in ADMIN_USERNAME / ADMIN_PASSWORD env vars.
 * Fails closed: if ADMIN_PASSWORD is not configured, all access is denied.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith('/admin') && !pathname.startsWith('/api/admin')) {
    return NextResponse.next();
  }

  const expectedUser = process.env.ADMIN_USERNAME ?? 'admin';
  const expectedPass = process.env.ADMIN_PASSWORD;

  if (expectedPass) {
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      const [scheme, encoded] = authHeader.split(' ');
      if (scheme === 'Basic' && encoded) {
        let decoded = '';
        try { decoded = atob(encoded); } catch { /* malformed header → 401 below */ }
        const colon = decoded.indexOf(':');
        if (colon !== -1) {
          const user = decoded.slice(0, colon);
          const pass = decoded.slice(colon + 1);
          if (safeCompare(user, expectedUser) && safeCompare(pass, expectedPass)) {
            return NextResponse.next();
          }
        }
      }
    }
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: { code: 'unauthorized', message: 'Admin authentication required' } },
      { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="VSYC-26 Admin"' } },
    );
  }

  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="VSYC-26 Admin"' },
  });
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
