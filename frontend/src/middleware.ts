import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // HTML pages: no caching so deploys take effect immediately
  const isStaticAsset = request.nextUrl.pathname.startsWith('/_next/static');
  if (!isStaticAsset) {
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.delete('x-nextjs-cache');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo/).*)'],
};
