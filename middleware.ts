import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const target = request.nextUrl.clone()
  target.pathname = '/api/moni/agent-v2'
  return NextResponse.rewrite(target)
}

export const config = {
  matcher: ['/api/moni/agent-chat'],
}
