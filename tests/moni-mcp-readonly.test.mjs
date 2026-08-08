import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const config = readFileSync('src/lib/moni/mcp/config.ts', 'utf8')
const activation = readFileSync('src/lib/moni/mcp/activation.ts', 'utf8')
const oauth = readFileSync('src/lib/moni/mcp/oauth.ts', 'utf8')
const tools = readFileSync('src/lib/moni/mcp/tools.ts', 'utf8')
const mcpRoute = readFileSync('src/app/mcp/route.ts', 'utf8')
const mcpSession = readFileSync('src/lib/moni/mcp/session.ts', 'utf8')
const authorizePage = readFileSync('src/app/oauth/authorize/page.tsx', 'utf8')
const authorizeComplete = readFileSync('src/app/oauth/authorize/complete/route.ts', 'utf8')
const tokenRoute = readFileSync('src/app/oauth/token/route.ts', 'utf8')
const registerRoute = readFileSync('src/app/oauth/register/route.ts', 'utf8')
const revokeRoute = readFileSync('src/app/oauth/revoke/route.ts', 'utf8')
const connectionApi = readFileSync('src/app/api/moni/mcp-connections/route.ts', 'utf8')
const activationApi = readFileSync('src/app/api/moni/mcp-activation/route.ts', 'utf8')
const connectionPage = readFileSync('src/app/mcp/connections/page.tsx', 'utf8')
const connectionClient = readFileSync('src/components/MoniMcpConnectionsClient.tsx', 'utf8')
const activationClient = readFileSync('src/components/MoniMcpActivationClient.tsx', 'utf8')
const authMetadata = readFileSync('src/app/.well-known/oauth-authorization-server/route.ts', 'utf8')
const resourceMetadata = readFileSync('src/app/.well-known/oauth-protected-resource/route.ts', 'utf8')
const migration = readFileSync('supabase/migrations/202608050001_moni_mcp_readonly_oauth.sql', 'utf8')
const acceptanceMigration = readFileSync('supabase/migrations/202608080001_moni_mcp_acceptance_windows.sql', 'utf8')
const home = readFileSync('src/app/page.tsx', 'utf8')
const loginRoute = readFileSync('src/app/api/allowance/auth/login/route.ts', 'utf8')
const postLogin = readFileSync('src/lib/allowance/post-login.ts', 'utf8')
const postLoginRoute = readFileSync('src/app/api/allowance/auth/post-login/route.ts', 'utf8')

test('MCP permanent activation remains explicit while acceptance windows are audited and temporary', () => {
  assert.match(config, /MONI_MCP_ENABLED/)
  assert.match(config, /=== 'true'/)
  assert.match(activation, /mode: 'PERMANENT_ENV'/)
  assert.match(activation, /mode: 'ACCEPTANCE_WINDOW'/)
  assert.match(activation, /Math\.min\(30/)
  assert.match(acceptanceMigration, /enabled_until <= enabled_at \+ interval '30 minutes'/)
  assert.match(acceptanceMigration, /enable row level security/)
  assert.match(acceptanceMigration, /revoke all .* from anon, authenticated/)
  assert.match(acceptanceMigration, /grant all .* to service_role/)
})

test('MCP and OAuth execution honor runtime activation instead of bypassing the gate', () => {
  assert.match(mcpRoute, /isMoniMcpRuntimeEnabled/)
  assert.match(mcpRoute, /if \(!\(await isMoniMcpRuntimeEnabled\(\)\)\) return disabled\(\)/)
  assert.match(tokenRoute, /isMoniMcpRuntimeEnabled/)
  assert.match(registerRoute, /isMoniMcpRuntimeEnabled/)
  assert.match(authorizeComplete, /isMoniMcpRuntimeEnabled/)
  assert.match(authorizePage, /getMoniMcpActivationState/)
})

test('acceptance credentials cannot be reused outside their activation window', () => {
  assert.match(activation, /isMoniMcpCredentialCreatedAtAllowed/)
  assert.match(activation, /created >= start && created <= end/)
  assert.match(activation, /Permanent mode must never resurrect credentials created inside a historical/)
  assert.match(oauth, /isMoniMcpCredentialCreatedAtAllowed\(row\.created_at\)/)
  assert.match(oauth, /\.select\('id,client_id,resource,scopes,user_login_id,user_display_name,user_role,access_expires_at,revoked_at,created_at'\)/)
  assert.match(activation, /\.from\('moni_mcp_oauth_codes'\)[\s\S]*\.delete\(\)/)
})

test('OAuth revocation remains available even when MCP execution is disabled', () => {
  assert.doesNotMatch(revokeRoute, /isMoniMcpEnabled/)
  assert.doesNotMatch(revokeRoute, /isMoniMcpRuntimeEnabled/)
  assert.match(revokeRoute, /can only reduce access/)
  assert.match(revokeRoute, /must not reveal whether a token existed/)
})

test('OAuth uses PKCE S256 and ChatGPT callback restriction', () => {
  assert.match(oauth, /verifyPkceS256/)
  assert.match(oauth, /code_challenge_method.*S256/s)
  assert.match(config, /hostname === 'chatgpt\.com'/)
  assert.match(config, /pathname\.startsWith\('\/connector\/oauth\/'\)/)
  assert.match(authMetadata, /code_challenge_methods_supported: \['S256'\]/)
  assert.match(authMetadata, /token_endpoint_auth_methods_supported: \['none'\]/)
})

test('OAuth rejects unknown scopes and always includes MONI read access', () => {
  assert.match(oauth, /function strictRequestedScopes/)
  assert.match(oauth, /requested\.some\(\(scope\) => !allowed\.has\(scope\)\)/)
  assert.match(oauth, /throw new Error\('invalid_scope'\)/)
  assert.match(oauth, /if \(!scopes\.includes\('moni:read'\)\) scopes\.unshift\('moni:read'\)/)
  assert.match(oauth, /const scopes = strictRequestedScopes\(raw\.scope\)/)
})

test('MCP challenges unauthenticated calls with protected resource metadata', () => {
  assert.match(mcpRoute, /WWW-Authenticate/)
  assert.match(mcpRoute, /resource_metadata=/)
  assert.match(resourceMetadata, /authorization_servers/)
  assert.match(resourceMetadata, /scopes_supported: MONI_MCP_SCOPES/)
  assert.match(config, /'moni:read'/)
})

test('MCP exposes only role-filtered read-only tools', () => {
  assert.match(tools, /READ_ONLY_MCP_TOOLS/)
  assert.doesNotMatch(tools, /READ_ONLY_MCP_TOOLS[\s\S]*'report_pmo_event'/)
  assert.match(tools, /readOnlyHint: true/)
  assert.match(tools, /destructiveHint: false/)
  assert.match(tools, /assertToolAllowedForRole/)
})

test('MCP JSON-RPC supports initialize, tool listing and tool calls', () => {
  assert.match(mcpRoute, /request\.method === 'initialize'/)
  assert.match(mcpRoute, /request\.method === 'tools\/list'/)
  assert.match(mcpRoute, /request\.method === 'tools\/call'/)
  assert.match(mcpRoute, /structuredContent/)
  assert.match(mcpRoute, /isError: true/)
})

test('OAuth database stores hashes, never raw access or refresh tokens', () => {
  assert.match(migration, /access_token_hash text not null unique/)
  assert.match(migration, /refresh_token_hash text not null unique/)
  assert.doesNotMatch(migration, /\n\s*access_token\s+text/)
  assert.doesNotMatch(migration, /\n\s*refresh_token\s+text/)
  assert.match(migration, /enable row level security/g)
  assert.match(migration, /revoke all .* from anon, authenticated/g)
})

test('OAuth refresh rotation consumes the exact presented refresh token once', () => {
  assert.match(oauth, /const expectedRefreshTokenHash = sha256\(input\.refreshToken\)/)
  assert.match(oauth, /\.eq\('refresh_token_hash', expectedRefreshTokenHash\)/)
  assert.match(oauth, /expectedRefreshTokenHash,/)
  assert.match(oauth, /update = update\.eq\('refresh_token_hash', input\.expectedRefreshTokenHash\)/)
  assert.match(oauth, /if \(!replaced\) throw new Error\('invalid_grant'\)/)
})

test('OAuth login return is a one-time internal consent path', () => {
  assert.match(postLogin, /url\.pathname !== '\/oauth\/authorize'/)
  assert.match(postLogin, /raw\.startsWith\('\/'\)/)
  assert.match(postLogin, /raw\.startsWith\('\/\/'\)/)
  assert.match(loginRoute, /POST_LOGIN_COOKIE_NAME/)
  assert.match(loginRoute, /url\.origin !== request\.nextUrl\.origin/)
  assert.match(home, /redirect\('\/api\/allowance\/auth\/post-login'\)/)
  assert.match(postLoginRoute, /maxAge: 0/)
})

test('MCP OAuth rejects fallback sessions and verifies the current DB user', () => {
  assert.match(mcpSession, /token\.startsWith\('fallback\.'\)/)
  assert.match(mcpSession, /allowance_platform_users/)
  assert.match(mcpSession, /data\.role !== user\.role/)
  assert.match(authorizePage, /getStrictMcpSessionFromCookies/)
  assert.match(authorizeComplete, /getStrictMcpSessionFromRequest/)
})

test('every MCP bearer request revalidates the current MONI identity before JSON-RPC', () => {
  assert.match(mcpRoute, /verifyCurrentMcpIdentity/)
  assert.match(mcpRoute, /const identity = await strictBearerIdentity/)
  assert.match(mcpRoute, /if \(!identity\) return unauthorized\(\)/)
  assert.doesNotMatch(mcpRoute, /handleRpcRequest\(current, authorization\)/)
})

test('OAuth metadata advertises a no-secret token revocation endpoint', () => {
  assert.match(authMetadata, /revocation_endpoint:/)
  assert.match(authMetadata, /revocation_endpoint_auth_methods_supported: \['none'\]/)
  assert.match(revokeRoute, /access_token_hash\.eq/)
  assert.match(revokeRoute, /refresh_token_hash\.eq/)
})

test('connection management is strict-admin only and never selects token hashes', () => {
  assert.match(connectionApi, /getStrictMcpSessionFromRequest/)
  assert.match(connectionApi, /session\.role !== 'admin'/)
  assert.doesNotMatch(connectionApi, /select\([^)]*access_token_hash/)
  assert.doesNotMatch(connectionApi, /select\([^)]*refresh_token_hash/)
  assert.match(connectionApi, /action: z\.literal\('revoke_token'\)/)
  assert.match(connectionApi, /action: z\.literal\('disable_client'\)/)
})

test('acceptance activation is strict-admin only with bounded duration', () => {
  assert.match(activationApi, /getStrictMcpSessionFromRequest/)
  assert.match(activationApi, /session\.role !== 'admin'/)
  assert.match(activationApi, /z\.number\(\)\.int\(\)\.min\(5\)\.max\(30\)/)
  assert.match(activationApi, /openMoniMcpAcceptanceWindow/)
  assert.match(activationApi, /closeMoniMcpAcceptanceWindow/)
  assert.match(activationClient, /수용검사 창 열기/)
  assert.match(activationClient, /즉시 닫기/)
})

test('admin connection page exposes activation and revocation controls', () => {
  assert.match(connectionPage, /getStrictMcpSessionFromCookies/)
  assert.match(connectionPage, /MoniMcpActivationClient/)
  assert.match(connectionClient, /action: 'revoke_token'/)
  assert.match(connectionClient, /action: 'revoke_client'/)
  assert.match(connectionClient, /action: 'disable_client'/)
  assert.match(connectionClient, /토큰 원문과 해시는 화면에 표시하지 않습니다/)
})
