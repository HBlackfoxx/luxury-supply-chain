import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  const isPublicPath = path === '/login' || path === '/' || path.startsWith('/customer')
  const isProtectedPath = path.startsWith('/b2b') || path.startsWith('/admin')

  // Get auth token from cookies
  const authToken = request.cookies.get('auth-token')

  if (isProtectedPath && !authToken) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (path === '/' && authToken) {
    // Redirect to appropriate dashboard if already logged in
    return NextResponse.redirect(new URL('/b2b', request.url))
  }

  if (path === '/' && !authToken) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)']
}