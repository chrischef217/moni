import { NextRequest, NextResponse } from 'next/server'
import {
  destroySecureAllowanceSession,
  SESSION_COOKIE_NAME,
} from '@/lib/allowance/secure-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value

  try {
    await destroySecureAllowanceSession(token)
  } catch {
    // Cookie revocation must still succeed locally even if the DB is temporarily unavailable.
  }

  const response = NextResponse.json({ ok: true }, { status: 200 })
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })

  return response
}
