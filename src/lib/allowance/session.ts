import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { readAllowanceSession, SESSION_COOKIE_NAME } from '@/lib/allowance/store'
import type { AllowanceRole, AllowanceSessionUser } from '@/types/allowance'

export async function getSessionFromRequest(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  return readAllowanceSession(token)
}

export async function getSessionFromCookies() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value
  return readAllowanceSession(token)
}

export function hasRole(user: AllowanceSessionUser | null, roles: AllowanceRole[]) {
  if (!user) return false
  return roles.includes(user.role)
}
