import { NextRequest, NextResponse } from 'next/server';

/**
 * HTTP Basic Auth guard for /admin routes.
 * Credentials stored in ADMIN_USERNAME / ADMIN_PASSWORD env vars.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    const [scheme, encoded] = authHeader.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = atob(encoded);
      const colon = decoded.indexOf(':');
      const user = decoded.slice(0, colon);
      const pass = decoded.slice(colon + 1);

      const expectedUser = process.env.ADMIN_USERNAME ?? 'admin';
      const expectedPass = process.env.ADMIN_PASSWORD ?? '';

      if (user === expectedUser && pass === expectedPass) {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="VSYC-26 Admin"' },
  });
}

export const config = {
  matcher: ['/admin/:path*'],
};
