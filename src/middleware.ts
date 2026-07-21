import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.nextUrl.searchParams.get('format') === 'json') {
    return NextResponse.next()
  }

  const rewritten = request.nextUrl.clone()
  rewritten.pathname = rewritten.pathname.replace(/\/pdf$/, '/print-pdf')
  return NextResponse.rewrite(rewritten)
}

export const config = {
  matcher: ['/api/moni/production-records/:id/pdf'],
}
