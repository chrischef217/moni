import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const config = readFileSync('src/lib/moni/mcp/config.ts', 'utf8')
const oauth = readFileSync('src/lib/moni/mcp/oauth.ts', 'utf8')
const tools = readFileSync('src/lib/moni/mcp/tools.ts', 'utf8')
const mcpRoute = readFileSync('src/app/mcp/route.ts', 'utf8')
const authMetadata = readFileSync('src/app/.well-known/oauth-authorization-server/route.ts', 'utf8')
const resourceMetadata = readFileSync('src/app/.well-known/oauth-protected-resource/route.ts', 'utf8')
const migration = readFileSync('supabase/migrations/202608050001_moni_mcp_readonly_oauth.sql', 'utf8')
const home = readFileSync('src/app/page.tsx', 'utf8')
const loginRoute = readFileSync('src/app/api/allowance/auth/login/route.ts', 'utf8')
const postLogin = readFileSync('src/lib/allowance/post-login.ts', 'utf8')
const postLoginRoute = readFileSync('src/app/api/allowance/auth/post-login/route.ts', 'utf8')

test('MCP remains disabled until PMO explicitly enables it', () => {
  assert.match(config, /MONI_MCP_ENABLED/)
  assert.match(config, /=== 'true'/)
  assert.match(mcpRoute, /if \(!isMoniMcpEnabled\(\)\) return disabled\(\)/)
})

test('OAuth uses PKCE S256 and ChatGPT callback restriction', () => {
  assert.match(oauth, /verifyPkceS256/)
  assert.match(oauth, /code_challenge_method.*S256/s)
  assert.match(config, /hostname === 'chatgpt\.com'/)
  assert.match(config, /pathname\.startsWith\('\/connector\/oauth\/'\)/)
  assert.match(authMetadata, /code_challenge_methods_supported: \['S256'\]/)
  assert.match(authMetadata, /token_endpoint_auth_methods_supported: \['none'\]/)
})

test('MCP challenges unauthenticated calls with protected resource metadata', () => {
  assert.match(mcpRoute, /WWW-Authenticate/)
  assert.match(mcpRoute, /resource_metadata=/)
  assert.match(resourceMetadata, /authorization_servers/)
  assert.match(resourceMetadata, /moni:read/)
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

test('OAuth login return is a one-time internal consent path', () => {
  assert.match(postLogin, /url\.pathname !== '\/oauth\/authorize'/)
  assert.match(postLogin, /raw\.startsWith\('\/'\)/)
  assert.match(postLogin, /raw\.startsWith\('\/\/'\)/)
  assert.match(loginRoute, /POST_LOGIN_COOKIE_NAME/)
  assert.match(loginRoute, /url\.origin !== request\.nextUrl\.origin/)
  assert.match(home, /redirect\('\/api\/allowance\/auth\/post-login'\)/)
  assert.match(postLoginRoute, /maxAge: 0/)
})
