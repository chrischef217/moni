import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import {
  readSecureAllowanceSession,
  SESSION_COOKIE_NAME,
} from '@/lib/allowance/secure-auth'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import type { AllowanceSessionUser } from '@/types/allowance'

async function currentRegisteredUser(user: AllowanceSessionUser) {
  const supabase = createMoniServiceRoleClient()
  const { data, error } = await supabase
    .from('allowance_platform_users')
    .select('login_id,role,freelancer_ref_id,display_name')
    .eq('login_id', user.loginId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data || data.role !== user.role) return null
  return {
    role: data.role,
    loginId: data.login_id,
    freelancerId: data.freelancer_ref_id ?? null,
    displayName: data.display_name || user.displayName || data.login_id,
  } as AllowanceSessionUser
}

async function readStrictMcpSession(token: string) {
  if (!token) return null
  const session = await readSecureAllowanceSession(token)
  if (!session) return null
  return currentRegisteredUser(session)
}

export async function getStrictMcpSessionFromCookies() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value?.trim() || ''
  return readStrictMcpSession(token)
}

export async function getStrictMcpSessionFromRequest(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value?.trim() || ''
  return readStrictMcpSession(token)
}

export async function verifyCurrentMcpIdentity(input: {
  loginId: string
  role: string
}) {
  const supabase = createMoniServiceRoleClient()
  const { data, error } = await supabase
    .from('allowance_platform_users')
    .select('login_id,role,display_name')
    .eq('login_id', input.loginId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data || data.role !== input.role) return null
  return {
    loginId: data.login_id,
    role: data.role,
    displayName: data.display_name || data.login_id,
  }
}
