import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { moniAdmin } from '@/lib/moni/db'
import type { AllowanceRole, AllowanceSessionUser } from '@/types/allowance'

const USERS_TABLE = 'allowance_platform_users'
const SESSIONS_TABLE = 'allowance_platform_sessions'
const SESSION_MINUTES = 30

export const SESSION_COOKIE_NAME = 'moni_allowance_session'

type AuthRow = {
  login_id: string
  role: AllowanceRole
  password_hash: string
  freelancer_ref_id: number | null
  display_name: string | null
}

type SessionRow = {
  token: string
  role: AllowanceRole
  login_id: string
  freelancer_ref_id: number | null
  display_name: string | null
  expires_at: string
}

export class AllowanceAuthStorageError extends Error {
  constructor() {
    super('MONI 인증 저장소에 연결할 수 없습니다.')
    this.name = 'AllowanceAuthStorageError'
  }
}

function nextExpiryIso() {
  return new Date(Date.now() + SESSION_MINUTES * 60 * 1000).toISOString()
}

function sessionTokenHash(rawToken: string) {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

function normalizeLoginId(value: string) {
  return value.trim()
}

async function getCurrentUser(loginId: string) {
  const { data, error } = await moniAdmin
    .from(USERS_TABLE)
    .select('login_id, role, password_hash, freelancer_ref_id, display_name')
    .eq('login_id', loginId)
    .maybeSingle()

  if (error) throw new AllowanceAuthStorageError()
  return data as AuthRow | null
}

export async function verifySecureAllowanceLogin(loginId: string, password: string): Promise<AllowanceSessionUser | null> {
  const normalizedLoginId = normalizeLoginId(loginId)
  if (!normalizedLoginId || !password) return null

  const row = await getCurrentUser(normalizedLoginId)
  if (!row) return null

  const ok = await bcrypt.compare(password, row.password_hash)
  if (!ok) return null

  return {
    role: row.role,
    loginId: row.login_id,
    freelancerId: row.freelancer_ref_id,
    displayName: row.display_name ?? (row.role === 'admin' ? '관리자' : '프리랜서'),
  }
}

export async function createSecureAllowanceSession(user: AllowanceSessionUser) {
  const rawToken = crypto.randomBytes(32).toString('base64url')
  const tokenHash = sessionTokenHash(rawToken)
  const now = new Date().toISOString()

  const { error } = await moniAdmin.from(SESSIONS_TABLE).insert({
    token: tokenHash,
    role: user.role,
    login_id: user.loginId,
    freelancer_ref_id: user.freelancerId,
    display_name: user.displayName,
    expires_at: nextExpiryIso(),
    created_at: now,
    updated_at: now,
  })

  if (error) throw new AllowanceAuthStorageError()
  return rawToken
}

async function destroyByHash(tokenHash: string) {
  const { error } = await moniAdmin.from(SESSIONS_TABLE).delete().eq('token', tokenHash)
  if (error) throw new AllowanceAuthStorageError()
}

export async function readSecureAllowanceSession(rawToken: string | null | undefined): Promise<AllowanceSessionUser | null> {
  if (!rawToken) return null
  const tokenHash = sessionTokenHash(rawToken)

  const { data, error } = await moniAdmin
    .from(SESSIONS_TABLE)
    .select('token, role, login_id, freelancer_ref_id, display_name, expires_at')
    .eq('token', tokenHash)
    .maybeSingle()

  if (error) throw new AllowanceAuthStorageError()
  if (!data) return null

  const session = data as SessionRow
  if (Date.parse(session.expires_at) <= Date.now()) {
    await destroyByHash(tokenHash)
    return null
  }

  const currentUser = await getCurrentUser(session.login_id)
  if (!currentUser) {
    await destroyByHash(tokenHash)
    return null
  }

  const identityChanged =
    currentUser.role !== session.role ||
    currentUser.freelancer_ref_id !== session.freelancer_ref_id

  if (identityChanged) {
    await destroyByHash(tokenHash)
    return null
  }

  const { error: touchError } = await moniAdmin
    .from(SESSIONS_TABLE)
    .update({ expires_at: nextExpiryIso(), updated_at: new Date().toISOString() })
    .eq('token', tokenHash)

  if (touchError) throw new AllowanceAuthStorageError()

  return {
    role: currentUser.role,
    loginId: currentUser.login_id,
    freelancerId: currentUser.freelancer_ref_id,
    displayName: currentUser.display_name ?? (currentUser.role === 'admin' ? '관리자' : '프리랜서'),
  }
}

export async function destroySecureAllowanceSession(rawToken: string | null | undefined) {
  if (!rawToken) return
  await destroyByHash(sessionTokenHash(rawToken))
}
