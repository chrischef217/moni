import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import {
  readSecureAllowanceSession,
  SESSION_COOKIE_NAME,
} from '@/lib/allowance/secure-auth'
import type { AllowanceRole, AllowanceSessionUser } from '@/types/allowance'

export async function getSessionFromRequest(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  return readSecureAllowanceSession(token)
}

export async function getSessionFromCookies() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value
  return readSecureAllowanceSession(token)
}

export function hasRole(user: AllowanceSessionUser | null, roles: AllowanceRole[]) {
  if (!user) return false
  return roles.includes(user.role)
}
