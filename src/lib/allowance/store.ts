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
const FALLBACK_STATE_TABLE = 'inventory_logs'
const FALLBACK_STATE_MARKER = '__allowance_state__'
const FALLBACK_STATE_ACTION = 'in'
const FALLBACK_STATE_UNIT = 'state'
const FALLBACK_STATE_BUSINESS_ID = 'default'

export const SESSION_COOKIE_NAME = 'moni_allowance_session'
const SESSION_MINUTES = 30
const FALLBACK_ADMIN_LOGIN_ID = 'admin'
const FALLBACK_ADMIN_PASSWORD = '1111'
const FALLBACK_SESSION_PREFIX = 'fallback'
const FALLBACK_SESSION_SECRET =
  process.env.JWT_SECRET?.trim() ||
  process.env.ALLOWANCE_SESSION_SECRET?.trim() ||
  process.env.NEXTAUTH_SECRET?.trim() ||
  'moni-allowance-fallback-secret'

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

type FallbackSessionPayload = {
  role: AllowanceRole
  loginId: string
  freelancerId: number | null
  displayName: string
  exp: number
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
  let message = ''

  if (error instanceof Error) {
    message = error.message
  } else if (error && typeof error === 'object') {
    const record = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const parts = [record.message, record.details, record.hint, record.code]
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim())

    if (parts.length > 0) {
      message = parts.join(' / ')
    } else {
      try {
        message = JSON.stringify(error)
      } catch {
        message = ''
      }
    }
  }

  if (!message) {
    message = '알 수 없는 오류가 발생했습니다.'
  }

  if (message.includes('relation') && message.includes('does not exist')) {
    return '수당지급 관리 DB 테이블이 아직 생성되지 않았습니다. migration SQL 적용이 필요합니다.'
  }
  if (message.includes('PGRST205') || message.includes("Could not find the table 'public.allowance_platform_state'")) {
    return '수당지급 관리 DB 테이블이 아직 생성되지 않았습니다. migration SQL 적용이 필요합니다.'
  }
  if (message.toLowerCase().includes('fetch failed') || message.includes('ENOTFOUND')) {
    return '수당지급 관리 DB에 연결할 수 없습니다. Supabase URL/키 설정을 확인해 주세요.'
  }
  return message
}

function isMissingAllowanceTableError(error: unknown) {
  const message = toStorageErrorMessage(error)
  return (
    message.includes('수당지급 관리 DB 테이블이 아직 생성되지 않았습니다') ||
    message.includes('allowance_platform_state') ||
    message.includes('allowance_platform_users') ||
    message.includes('allowance_platform_sessions')
  )
}

function encodePayload(value: object) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function decodePayload<T>(encoded: string): T | null {
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8')
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

function signFallbackSession(encodedPayload: string) {
  return crypto.createHmac('sha256', FALLBACK_SESSION_SECRET).update(encodedPayload).digest('base64url')
}

function createFallbackSession(user: AllowanceSessionUser) {
  const payload: FallbackSessionPayload = {
    role: user.role,
    loginId: user.loginId,
    freelancerId: user.freelancerId,
    displayName: user.displayName,
    exp: Date.now() + SESSION_MINUTES * 60 * 1000,
  }

  const encoded = encodePayload(payload)
  const signature = signFallbackSession(encoded)
  return `${FALLBACK_SESSION_PREFIX}.${encoded}.${signature}`
}

function readFallbackSession(token: string): AllowanceSessionUser | null {
  const [prefix, encoded, signature] = token.split('.')
  if (prefix !== FALLBACK_SESSION_PREFIX || !encoded || !signature) return null

  const expected = signFallbackSession(encoded)
  if (signature.length !== expected.length) return null
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null

  const payload = decodePayload<FallbackSessionPayload>(encoded)
  if (!payload) return null
  if (payload.exp <= Date.now()) return null

  return {
    role: payload.role,
    loginId: payload.loginId,
    freelancerId: payload.freelancerId,
    displayName: payload.displayName || (payload.role === 'admin' ? '관리자' : '프리랜서'),
  }
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

async function readStateFromAuditFallback(): Promise<AllowanceState> {
  const orderedResult = await moniAdmin
    .from(FALLBACK_STATE_TABLE)
    .select('memo')
    .eq('item_name', FALLBACK_STATE_MARKER)
    .order('created_at', { ascending: false })
    .limit(20)

  let rows = orderedResult.data
  if (orderedResult.error) {
    const plainResult = await moniAdmin
      .from(FALLBACK_STATE_TABLE)
      .select('memo')
      .eq('item_name', FALLBACK_STATE_MARKER)
      .limit(20)

    if (plainResult.error) {
      throw new Error(toStorageErrorMessage(plainResult.error))
    }
    rows = plainResult.data
  }

  for (const row of rows ?? []) {
    const memo = (row as { memo?: string | null }).memo
    if (!memo) continue
    try {
      const parsed = JSON.parse(memo) as Partial<AllowanceState>
      if (parsed && typeof parsed === 'object') {
        return decodeState(parsed)
      }
    } catch {
      // ignore invalid legacy payload
    }
  }

  const initial = DEFAULT_ALLOWANCE_STATE
  await writeStateToAuditFallback(initial)
  return initial
}

async function writeStateToAuditFallback(state: AllowanceState): Promise<void> {
  const encoded = encodeState(state)
  const { error: purgeError } = await moniAdmin
    .from(FALLBACK_STATE_TABLE)
    .delete()
    .eq('item_name', FALLBACK_STATE_MARKER)

  if (purgeError) throw new Error(toStorageErrorMessage(purgeError))

  const basePayload = {
    action: FALLBACK_STATE_ACTION,
    item_name: FALLBACK_STATE_MARKER,
    quantity: 0,
    unit: FALLBACK_STATE_UNIT,
    memo: JSON.stringify(encoded),
    business_id: FALLBACK_STATE_BUSINESS_ID,
  }

  const { error } = await moniAdmin.from(FALLBACK_STATE_TABLE).insert(basePayload)

  if (!error) return

  const message = toStorageErrorMessage(error)
  const missingBusinessIdColumn =
    message.toLowerCase().includes('business_id') &&
    (message.toLowerCase().includes('column') || message.toLowerCase().includes('schema'))

  if (!missingBusinessIdColumn) {
    throw new Error(message)
  }

  const { business_id: _ignored, ...fallbackPayload } = basePayload
  const { error: retryError } = await moniAdmin.from(FALLBACK_STATE_TABLE).insert(fallbackPayload)
  if (retryError) throw new Error(toStorageErrorMessage(retryError))
}

export async function readAllowanceState(): Promise<AllowanceState> {
  // Always prefer the shared fallback document store for consistency across mixed DB schemas.
  try {
    return await readStateFromAuditFallback()
  } catch {
    // If fallback table is unavailable, try the dedicated allowance table.
  }

  try {
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
  } catch (error) {
    if (isMissingAllowanceTableError(error)) {
      return readStateFromAuditFallback()
    }
    throw error
  }
}

export async function writeAllowanceState(nextState: AllowanceState): Promise<AllowanceState> {
  const normalized = normalizeAllowanceState(nextState)
  const encoded = encodeState(normalized)

  // Primary write path: shared fallback store (available on restored Supabase project).
  await writeStateToAuditFallback(normalized)

  try {
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
  } catch (error) {
    if (!isMissingAllowanceTableError(error)) {
      throw error
    }
  }

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

  if (existingError) {
    if (isMissingAllowanceTableError(existingError)) return
    throw new Error(toStorageErrorMessage(existingError))
  }

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
  // First check the canonical allowance state credentials.
  const state = await readAllowanceState()
  const admin = state.admin_account
  if (loginId.trim() === admin.login_id && password.trim() === admin.password) {
    return {
      role: 'admin',
      loginId: admin.login_id,
      freelancerId: null,
      displayName: '관리자',
    }
  }

  const freelancer = state.freelancers.find(
    (item) => item.login_id.trim() === loginId.trim() && item.password.trim() === password.trim(),
  )
  if (freelancer) {
    return {
      role: 'freelancer',
      loginId: freelancer.login_id,
      freelancerId: freelancer.id,
      displayName: freelancer.name || '프리랜서',
    }
  }

  try {
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
  } catch (error) {
    const isFallbackAdmin =
      loginId.trim() === FALLBACK_ADMIN_LOGIN_ID && password.trim() === FALLBACK_ADMIN_PASSWORD

    if (isFallbackAdmin) {
      return {
        role: 'admin',
        loginId: FALLBACK_ADMIN_LOGIN_ID,
        freelancerId: null,
        displayName: '관리자',
      }
    }

    throw new Error(toStorageErrorMessage(error))
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

  if (error) {
    return createFallbackSession(user)
  }

  return token
}

export async function readAllowanceSession(token: string | null | undefined): Promise<AllowanceSessionUser | null> {
  if (!token) return null

  const fallback = readFallbackSession(token)
  if (fallback) return fallback

  const { data, error } = await moniAdmin
    .from(SESSIONS_TABLE)
    .select('token, role, login_id, freelancer_ref_id, display_name, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (error) {
    if (isMissingAllowanceTableError(error)) return null
    throw new Error(toStorageErrorMessage(error))
  }
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
  if (token.startsWith(`${FALLBACK_SESSION_PREFIX}.`)) return

  const { error } = await moniAdmin
    .from(SESSIONS_TABLE)
    .update({ expires_at: nextExpiryIso(), updated_at: new Date().toISOString() })
    .eq('token', token)

  if (error) {
    if (isMissingAllowanceTableError(error)) return
    throw new Error(toStorageErrorMessage(error))
  }
}

export async function destroyAllowanceSession(token: string | null | undefined) {
  if (!token) return
  if (token.startsWith(`${FALLBACK_SESSION_PREFIX}.`)) return
  const { error } = await moniAdmin.from(SESSIONS_TABLE).delete().eq('token', token)
  if (error) {
    if (isMissingAllowanceTableError(error)) return
    throw new Error(toStorageErrorMessage(error))
  }
}
