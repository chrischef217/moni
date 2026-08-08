import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const preflight = readFileSync('src/lib/moni/mcp/preflight.ts', 'utf8')
const preflightApi = readFileSync('src/app/api/moni/mcp-preflight/route.ts', 'utf8')
const activationApi = readFileSync('src/app/api/moni/mcp-activation/route.ts', 'utf8')
const preflightClient = readFileSync('src/components/MoniMcpPreflightClient.tsx', 'utf8')
const activationClient = readFileSync('src/components/MoniMcpActivationClient.tsx', 'utf8')
const connectionPage = readFileSync('src/app/mcp/connections/page.tsx', 'utf8')
const migration = readFileSync('supabase/migrations/20260808090000_moni_mcp_preflight_runs.sql', 'utf8')

test('MCP preflight audit storage is service-role only', () => {
  assert.match(migration, /moni_mcp_preflight_runs/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all .* from anon, authenticated/)
  assert.match(migration, /grant all .* to service_role/)
  assert.match(migration, /admin_tool_catalog_hash text not null/)
  assert.match(migration, /freelancer_tool_catalog_hash text not null/)
})

test('preflight deterministically hashes both role tool catalogs', () => {
  assert.match(preflight, /currentMcpToolCatalogHashes/)
  assert.match(preflight, /listMcpToolsForRole\('admin'\)/)
  assert.match(preflight, /listMcpToolsForRole\('freelancer'\)/)
  assert.match(preflight, /createHash\('sha256'\)/)
  assert.match(preflight, /stableValue/)
})

test('preflight verifies OAuth metadata, resource metadata, CORS and role policy', () => {
  assert.match(preflight, /oauthMetadataUrl\(\)/)
  assert.match(preflight, /protectedResourceMetadataUrl\(\)/)
  assert.match(preflight, /method: 'OPTIONS'/)
  assert.match(preflight, /access-control-allow-origin/)
  assert.match(preflight, /offline_access/)
  assert.match(preflight, /ADMIN_REQUIRED_TOOLS/)
  assert.match(preflight, /FREELANCER_FORBIDDEN_TOOLS/)
  assert.match(preflight, /readOnlyHint === true/)
  assert.match(preflight, /destructiveHint === false/)
})

test('preflight is strict-admin only and persists an audit result', () => {
  assert.match(preflightApi, /getStrictMcpSessionFromRequest/)
  assert.match(preflightApi, /session\.role !== 'admin'/)
  assert.match(preflightApi, /runMoniMcpPreflight/)
  assert.match(preflight, /\.from\('moni_mcp_preflight_runs'\)/)
  assert.match(preflight, /status: 'PASS' \| 'FAIL'/)
})

test('acceptance window requires a recent passing preflight and matching hashes', () => {
  assert.match(preflight, /PREFLIGHT_TTL_MINUTES = 30/)
  assert.match(preflight, /catalogHashesMatch/)
  assert.match(preflight, /data\.status === 'PASS' && catalogHashesMatch/)
  assert.match(preflight, /assertRecentPassingMcpPreflight/)
  assert.match(activationApi, /await assertRecentPassingMcpPreflight\(\)/)
  assert.match(activationClient, /Preflight Gate/)
  assert.match(activationClient, /disabled=\{working \|\| reason\.trim\(\)\.length < 3 \|\| !canOpen\}/)
})

test('admin connection page forces preflight before activation controls', () => {
  assert.match(connectionPage, /MoniMcpPreflightClient/)
  assert.match(connectionPage, /<MoniMcpPreflightClient \/>[\s\S]*<MoniMcpActivationClient \/>/)
  assert.match(preflightClient, /사전점검 실행/)
  assert.match(preflightClient, /moni-mcp-preflight-updated/)
})
