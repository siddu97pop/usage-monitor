import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUTH_COOKIE = 'usage_auth';
const LOGIN_PATH = '/login';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page and its API route through always
  if (pathname === LOGIN_PATH || pathname === '/api/auth') {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const expected = process.env.AUTH_PASSWORD;

  // If no password is configured, allow all (dev mode)
  if (!expected) return NextResponse.next();

  if (token === expected) return NextResponse.next();

  // Redirect to login
  const url = request.nextUrl.clone();
  url.pathname = LOGIN_PATH;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
