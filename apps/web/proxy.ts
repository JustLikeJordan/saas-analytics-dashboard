import { NextRequest, NextResponse } from 'next/server';

const PROTECTED_ROUTES = ['/upload', '/billing', '/admin'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (isProtected) {
    // TODO(Story 1.3): Add JWT validation — currently only checks cookie presence
    const token = request.cookies.get('access_token')?.value;

    if (!token) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/upload/:path*', '/billing/:path*', '/admin/:path*'],
};
