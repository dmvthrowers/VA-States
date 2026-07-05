import { NextRequest, NextResponse } from 'next/server';
import { safeCompare } from '@/lib/tokens';

/**
 * HTTP Basic Auth guard for /admin pages AND /api/admin routes.
 * Credentials stored in ADMIN_USERNAME / ADMIN_PASSWORD env vars.
 *
 * Fails closed: if ADMIN_PASSWORD is not configured, everything under
 * /admin and /api/admin returns 401.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
  if (!isProtected) {
    return NextResponse.next();
  }

  const expectedUser = process.env.ADMIN_USERNAME ?? 'admin';
  const expectedPass = process.env.ADMIN_PASSWORD;

  // Fail closed — never allow access when the password isn't configured.
  if (expectedPass) {
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      const [scheme, encoded] = authHeader.split(' ');
      if (scheme === 'Basic' && encoded) {
        let decoded = '';
        try {
          decoded = atob(encoded);
        } catch {
          /* malformed base64 → fall through to 401 */
        }
        const colon = decoded.indexOf(':');
        if (colon !== -1) {
          const user = decoded.slice(0, colon);
          const pass = decoded.slice(colon + 1);

          // Constant-time comparison; evaluate both to avoid short-circuit timing.
          const userOk = safeCompare(user, expectedUser);
          const passOk = safeCompare(pass, expectedPass);
          if (userOk && passOk) {
            return NextResponse.next();
          }
        }
      }
    }
  }

  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="VSYC-26 Admin"' },
  });
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
