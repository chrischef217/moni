import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { moniAdmin } from '@/lib/moni/db'
import { decryptText, encryptText } from '@/lib/allowance/crypto'
import { normalizeAllowanceState } from '@/lib/allowance/state'
import type { AllowanceRole, AllowanceSessionUser, AllowanceState, Freelancer } from '@/types/allowance'
import { DEFAULT_ALLOWANCE_STATE } from '@/types/allowance'

const STATE_TABLE = 'allowance_platform_state'
const USERS_TABLE = 'allowance_platform_users'
const SESSIONS_TABLE = 'allowance_platform_sessions'
const STATE_ID = 'main'

export const SESSION_COOKIE_NAME = 'moni_allowance_session'
const SESSION_MINUTES = 30

type SessionRow = {
  token: string
  role: AllowanceRole
  login_id: string
  freelancer_ref_id: number | null
  display_name: string | null
  expires_at: string
}

type AuthRow = {
  login_id: string
  role: AllowanceRole
  password_hash: string
  freelancer_ref_id: number | null
  display_name: string | null
}

function nextExpiryIso() {
  return new Date(Date.now() + SESSION_MINUTES * 60 * 1000).toISOString()
}

function isEncryptedFormat(value: string) {
  return value.split('.').length === 3
}

function decryptMaybe(value: string) {
  if (!value) return ''
  if (!isEncryptedFormat(value)) return value
  const decrypted = decryptText(value)
  return decrypted || ''
}

function encodeFreelancer(item: Freelancer): Freelancer {
  return {
    ...item,
    rrn: item.rrn ? encryptText(item.rrn) : '',
    password: item.password ? encryptText(item.password) : '',
  }
}

function decodeFreelancer(item: Freelancer): Freelancer {
  return {
    ...item,
    rrn: decryptMaybe(item.rrn),
    password: decryptMaybe(item.password),
  }
}

function encodeState(state: AllowanceState) {
  return {
    ...state,
    admin_account: {
      ...state.admin_account,
      password: state.admin_account.password ? encryptText(state.admin_account.password) : '',
    },
    freelancers: state.freelancers.map(encodeFreelancer),
  }
}

function decodeState(raw: Partial<AllowanceState> | null | undefined): AllowanceState {
  const normalized = normalizeAllowanceState(raw)
  return {
    ...normalized,
    admin_account: {
      ...normalized.admin_account,
      password: decryptMaybe(normalized.admin_account.password),
    },
    freelancers: normalized.freelancers.map(decodeFreelancer),
  }
}

function toStorageErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
  if (message.includes('relation') && message.includes('does not exist')) {
    return '수당지급 관리 DB 테이블이 아직 생성되지 않았습니다. migration SQL 적용이 필요합니다.'
  }
  return message
}

async function fetchStatePayload() {
  const { data, error } = await moniAdmin
    .from(STATE_TABLE)
    .select('payload')
    .eq('id', STATE_ID)
    .maybeSingle()

  if (error) throw new Error(toStorageErrorMessage(error))
  return (data?.payload as Partial<AllowanceState> | null | undefined) ?? null
}

export async function readAllowanceState(): Promise<AllowanceState> {
  const payload = await fetchStatePayload()
  if (payload) return decodeState(payload)

  const initial = DEFAULT_ALLOWANCE_STATE
  const encoded = encodeState(initial)

  const { error } = await moniAdmin.from(STATE_TABLE).upsert(
    {
      id: STATE_ID,
      payload: encoded,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )

  if (error) throw new Error(toStorageErrorMessage(error))

  return initial
}

export async function writeAllowanceState(nextState: AllowanceState): Promise<AllowanceState> {
  const normalized = normalizeAllowanceState(nextState)
  const encoded = encodeState(normalized)

  const { error } = await moniAdmin.from(STATE_TABLE).upsert(
    {
      id: STATE_ID,
      payload: encoded,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )

  if (error) throw new Error(toStorageErrorMessage(error))

  await syncAllowanceUsers(normalized)

  return normalized
}

export async function syncAllowanceUsers(state: AllowanceState) {
  const entries = [
    {
      login_id: state.admin_account.login_id,
      password: state.admin_account.password,
      role: 'admin' as const,
      freelancer_ref_id: null,
      display_name: '관리자',
    },
    ...state.freelancers.map((item) => ({
      login_id: item.login_id,
      password: item.password,
      role: 'freelancer' as const,
      freelancer_ref_id: item.id,
      display_name: item.name,
    })),
  ].filter((row) => row.login_id.trim())

  const { data: existingRows, error: existingError } = await moniAdmin
    .from(USERS_TABLE)
    .select('login_id,password_hash')

  if (existingError) throw new Error(toStorageErrorMessage(existingError))

  const existingMap = new Map<string, string>()
  ;(existingRows ?? []).forEach((row: { login_id: string; password_hash: string }) => {
    existingMap.set(row.login_id, row.password_hash)
  })

  const rowsToUpsert: AuthRow[] = []
  for (const entry of entries) {
    const rawPassword = entry.password?.trim() || '1111'
    const currentHash = existingMap.get(entry.login_id)
    let passwordHash = currentHash ?? ''

    if (!passwordHash || !(await bcrypt.compare(rawPassword, passwordHash))) {
      passwordHash = await bcrypt.hash(rawPassword, 10)
    }

    rowsToUpsert.push({
      login_id: entry.login_id,
      role: entry.role,
      password_hash: passwordHash,
      freelancer_ref_id: entry.freelancer_ref_id,
      display_name: entry.display_name,
    })
  }

  const { error: upsertError } = await moniAdmin.from(USERS_TABLE).upsert(rowsToUpsert, { onConflict: 'login_id' })
  if (upsertError) throw new Error(toStorageErrorMessage(upsertError))

  const validIds = new Set(rowsToUpsert.map((row) => row.login_id))
  const staleIds = Array.from(existingMap.keys()).filter((loginId) => !validIds.has(loginId))

  for (const staleId of staleIds) {
    const { error: deleteError } = await moniAdmin.from(USERS_TABLE).delete().eq('login_id', staleId)
    if (deleteError) throw new Error(toStorageErrorMessage(deleteError))
  }
}

export async function verifyAllowanceLogin(loginId: string, password: string): Promise<AllowanceSessionUser | null> {
  const state = await readAllowanceState()
  await syncAllowanceUsers(state)

  const { data, error } = await moniAdmin
    .from(USERS_TABLE)
    .select('login_id, role, password_hash, freelancer_ref_id, display_name')
    .eq('login_id', loginId)
    .maybeSingle()

  if (error) throw new Error(toStorageErrorMessage(error))
  if (!data) return null

  const row = data as AuthRow
  const ok = await bcrypt.compare(password, row.password_hash)
  if (!ok) return null

  return {
    role: row.role,
    loginId: row.login_id,
    freelancerId: row.freelancer_ref_id,
    displayName: row.display_name ?? (row.role === 'admin' ? '관리자' : '프리랜서'),
  }
}

export async function createAllowanceSession(user: AllowanceSessionUser) {
  const token = crypto.randomUUID()

  const { error } = await moniAdmin.from(SESSIONS_TABLE).insert({
    token,
    role: user.role,
    login_id: user.loginId,
    freelancer_ref_id: user.freelancerId,
    display_name: user.displayName,
    expires_at: nextExpiryIso(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  if (error) throw new Error(toStorageErrorMessage(error))

  return token
}

export async function readAllowanceSession(token: string | null | undefined): Promise<AllowanceSessionUser | null> {
  if (!token) return null

  const { data, error } = await moniAdmin
    .from(SESSIONS_TABLE)
    .select('token, role, login_id, freelancer_ref_id, display_name, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (error) throw new Error(toStorageErrorMessage(error))
  if (!data) return null

  const row = data as SessionRow
  const expired = Date.parse(row.expires_at) <= Date.now()
  if (expired) {
    await destroyAllowanceSession(token)
    return null
  }

  await touchAllowanceSession(token)

  return {
    role: row.role,
    loginId: row.login_id,
    freelancerId: row.freelancer_ref_id,
    displayName: row.display_name ?? (row.role === 'admin' ? '관리자' : '프리랜서'),
  }
}

export async function touchAllowanceSession(token: string) {
  const { error } = await moniAdmin
    .from(SESSIONS_TABLE)
    .update({ expires_at: nextExpiryIso(), updated_at: new Date().toISOString() })
    .eq('token', token)

  if (error) throw new Error(toStorageErrorMessage(error))
}

export async function destroyAllowanceSession(token: string | null | undefined) {
  if (!token) return
  const { error } = await moniAdmin.from(SESSIONS_TABLE).delete().eq('token', token)
  if (error) throw new Error(toStorageErrorMessage(error))
}
