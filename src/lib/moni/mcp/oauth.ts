import crypto from 'node:crypto'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import {
  isAllowedChatGptRedirectUri,
  moniMcpResource,
  parseScopes,
} from '@/lib/moni/mcp/config'

export type MoniMcpIdentity = {
  tokenId: string
  clientId: string
  loginId: string
  displayName: string
  role: string
  scopes: string[]
}

type SupabaseClient = ReturnType<typeof createMoniServiceRoleClient>

const ACCESS_TOKEN_SECONDS = 60 * 60
const REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60
const AUTH_CODE_SECONDS = 5 * 60

function nowIso() {
  return new Date().toISOString()
}

function futureIso(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString()
}

export function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('base64url')
}

export function randomOAuthValue(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url')
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function verifyPkceS256(verifier: string, challenge: string) {
  if (!verifier || !challenge) return false
  return safeEqual(sha256(verifier), challenge)
}

export async function registerMcpOAuthClient(input: {
  redirectUris: string[]
  clientName?: string
}) {
  const redirectUris = Array.from(new Set(input.redirectUris.map((item) => item.trim())))
  if (!redirectUris.length || redirectUris.length > 10 || redirectUris.some((uri) => !isAllowedChatGptRedirectUri(uri))) {
    throw new Error('허용되지 않은 OAuth redirect_uri입니다.')
  }

  const supabase = createMoniServiceRoleClient()
  const fingerprint = sha256(JSON.stringify([...redirectUris].sort()))
  const { data: existing, error: existingError } = await supabase
    .from('moni_mcp_oauth_clients')
    .select('client_id,client_name,redirect_uris,created_at')
    .eq('redirect_fingerprint', fingerprint)
    .eq('is_active', true)
    .maybeSingle()
  if (existingError) throw new Error(existingError.message)
  if (existing) return existing

  const row = {
    client_id: `moni_${randomOAuthValue(24)}`,
    client_name: String(input.clientName || 'ChatGPT MONI').slice(0, 160),
    redirect_uris: redirectUris,
    redirect_fingerprint: fingerprint,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    is_active: true,
  }
  const { data, error } = await supabase
    .from('moni_mcp_oauth_clients')
    .insert(row)
    .select('client_id,client_name,redirect_uris,created_at')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export type AuthorizationRequest = {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
  scope: string
  scopes: string[]
  resource: string
}

export async function validateAuthorizationRequest(raw: Record<string, unknown>): Promise<AuthorizationRequest> {
  const clientId = String(raw.client_id || '').trim()
  const redirectUri = String(raw.redirect_uri || '').trim()
  const responseType = String(raw.response_type || '').trim()
  const state = String(raw.state || '').trim()
  const codeChallenge = String(raw.code_challenge || '').trim()
  const codeChallengeMethod = String(raw.code_challenge_method || '').trim()
  const resource = String(raw.resource || '').trim()
  const scopes = parseScopes(raw.scope)

  if (!clientId || responseType !== 'code' || !state || !codeChallenge || codeChallengeMethod !== 'S256') {
    throw new Error('OAuth authorization 요청이 올바르지 않습니다.')
  }
  if (resource !== moniMcpResource()) throw new Error('OAuth resource가 MONI MCP와 일치하지 않습니다.')
  if (!isAllowedChatGptRedirectUri(redirectUri)) throw new Error('허용되지 않은 OAuth redirect_uri입니다.')

  const supabase = createMoniServiceRoleClient()
  const { data: client, error } = await supabase
    .from('moni_mcp_oauth_clients')
    .select('client_id,redirect_uris,is_active')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const redirectUris = Array.isArray(client?.redirect_uris) ? client.redirect_uris : []
  if (!client || !redirectUris.includes(redirectUri)) throw new Error('등록되지 않은 OAuth client 또는 redirect_uri입니다.')

  return {
    clientId,
    redirectUri,
    state,
    codeChallenge,
    scope: scopes.join(' '),
    scopes,
    resource,
  }
}

export async function createAuthorizationCode(input: AuthorizationRequest & {
  loginId: string
  displayName: string
  role: string
}) {
  const code = randomOAuthValue(32)
  const supabase = createMoniServiceRoleClient()
  const { error } = await supabase.from('moni_mcp_oauth_codes').insert({
    code_hash: sha256(code),
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    resource: input.resource,
    scopes: input.scopes,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
    user_login_id: input.loginId,
    user_display_name: input.displayName,
    user_role: input.role,
    expires_at: futureIso(AUTH_CODE_SECONDS),
  })
  if (error) throw new Error(error.message)
  return code
}

async function issueTokenPair(input: {
  supabase: SupabaseClient
  clientId: string
  resource: string
  scopes: string[]
  loginId: string
  displayName: string
  role: string
  replaceTokenId?: string
}) {
  const accessToken = `moni_at_${randomOAuthValue(36)}`
  const refreshToken = `moni_rt_${randomOAuthValue(40)}`
  const row = {
    client_id: input.clientId,
    resource: input.resource,
    scopes: input.scopes,
    user_login_id: input.loginId,
    user_display_name: input.displayName,
    user_role: input.role,
    access_token_hash: sha256(accessToken),
    refresh_token_hash: sha256(refreshToken),
    access_expires_at: futureIso(ACCESS_TOKEN_SECONDS),
    refresh_expires_at: futureIso(REFRESH_TOKEN_SECONDS),
    last_used_at: nowIso(),
    revoked_at: null,
  }

  if (input.replaceTokenId) {
    const { error } = await input.supabase
      .from('moni_mcp_oauth_tokens')
      .update({ ...row, updated_at: nowIso() })
      .eq('id', input.replaceTokenId)
      .is('revoked_at', null)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await input.supabase.from('moni_mcp_oauth_tokens').insert(row)
    if (error) throw new Error(error.message)
  }

  return {
    token_type: 'Bearer',
    access_token: accessToken,
    expires_in: ACCESS_TOKEN_SECONDS,
    refresh_token: refreshToken,
    scope: input.scopes.join(' '),
  }
}

export async function exchangeAuthorizationCode(input: {
  code: string
  clientId: string
  redirectUri: string
  codeVerifier: string
  resource: string
}) {
  const supabase = createMoniServiceRoleClient()
  const codeHash = sha256(input.code)
  const { data: row, error } = await supabase
    .from('moni_mcp_oauth_codes')
    .select('*')
    .eq('code_hash', codeHash)
    .is('used_at', null)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!row || Date.parse(row.expires_at) <= Date.now()) throw new Error('invalid_grant')
  if (
    row.client_id !== input.clientId
    || row.redirect_uri !== input.redirectUri
    || row.resource !== input.resource
    || !verifyPkceS256(input.codeVerifier, row.code_challenge)
  ) throw new Error('invalid_grant')

  const { data: claimed, error: claimError } = await supabase
    .from('moni_mcp_oauth_codes')
    .update({ used_at: nowIso() })
    .eq('code_hash', codeHash)
    .is('used_at', null)
    .select('code_hash')
    .maybeSingle()
  if (claimError) throw new Error(claimError.message)
  if (!claimed) throw new Error('invalid_grant')

  return issueTokenPair({
    supabase,
    clientId: row.client_id,
    resource: row.resource,
    scopes: Array.isArray(row.scopes) ? row.scopes : ['moni:read'],
    loginId: row.user_login_id,
    displayName: row.user_display_name || row.user_login_id,
    role: row.user_role,
  })
}

export async function refreshAccessToken(input: {
  refreshToken: string
  clientId: string
  resource: string
  requestedScope?: string
}) {
  const supabase = createMoniServiceRoleClient()
  const { data: row, error } = await supabase
    .from('moni_mcp_oauth_tokens')
    .select('*')
    .eq('refresh_token_hash', sha256(input.refreshToken))
    .eq('client_id', input.clientId)
    .eq('resource', input.resource)
    .is('revoked_at', null)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!row || Date.parse(row.refresh_expires_at) <= Date.now()) throw new Error('invalid_grant')

  const originalScopes = Array.isArray(row.scopes) ? row.scopes : ['moni:read']
  const requestedScopes = input.requestedScope ? parseScopes(input.requestedScope) : originalScopes
  if (requestedScopes.some((scope) => !originalScopes.includes(scope))) throw new Error('invalid_scope')

  return issueTokenPair({
    supabase,
    clientId: row.client_id,
    resource: row.resource,
    scopes: requestedScopes,
    loginId: row.user_login_id,
    displayName: row.user_display_name || row.user_login_id,
    role: row.user_role,
    replaceTokenId: row.id,
  })
}

export async function authenticateMcpBearer(authorization: string | null): Promise<MoniMcpIdentity | null> {
  const match = /^Bearer\s+(.+)$/i.exec(String(authorization || '').trim())
  if (!match) return null
  const supabase = createMoniServiceRoleClient()
  const { data: row, error } = await supabase
    .from('moni_mcp_oauth_tokens')
    .select('id,client_id,resource,scopes,user_login_id,user_display_name,user_role,access_expires_at,revoked_at')
    .eq('access_token_hash', sha256(match[1]))
    .eq('resource', moniMcpResource())
    .is('revoked_at', null)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!row || Date.parse(row.access_expires_at) <= Date.now()) return null
  const scopes = Array.isArray(row.scopes) ? row.scopes : []
  if (!scopes.includes('moni:read')) return null

  await supabase
    .from('moni_mcp_oauth_tokens')
    .update({ last_used_at: nowIso(), updated_at: nowIso() })
    .eq('id', row.id)

  return {
    tokenId: row.id,
    clientId: row.client_id,
    loginId: row.user_login_id,
    displayName: row.user_display_name || row.user_login_id,
    role: row.user_role,
    scopes,
  }
}
