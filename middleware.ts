import { NextRequest, NextResponse } from 'next/server';

/**
 * Legacy admin pages are redirected to /admin-dashboard.
 *
 * Security enforcement for all admin APIs is now handled at the route level
 * via bearer token validation and admin role checks.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isLegacyAdminPage = pathname === '/admin' || pathname.startsWith('/admin/');
  if (isLegacyAdminPage) {
    const url = req.nextUrl.clone();
    url.pathname = '/admin-dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
