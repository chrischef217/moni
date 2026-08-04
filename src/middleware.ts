import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (pathname === '/api/moni/agent-chat') {
    const rewritten = request.nextUrl.clone()
    rewritten.pathname = '/api/moni/agent-runtime'
    return NextResponse.rewrite(rewritten)
  }

  if (request.nextUrl.searchParams.get('format') === 'json') {
    return NextResponse.next()
  }

  const rewritten = request.nextUrl.clone()
  rewritten.pathname = rewritten.pathname.replace(/\/pdf$/, '/print-pdf')
  return NextResponse.rewrite(rewritten)
}

export const config = {
  matcher: [
    '/api/moni/agent-chat',
    '/api/moni/production-records/:id/pdf',
  ],
}
