import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const activation = readFileSync('src/lib/moni/mcp/activation.ts', 'utf8')
const activationApi = readFileSync('src/app/api/moni/mcp-activation/route.ts', 'utf8')
const acceptance = readFileSync('src/lib/moni/mcp/acceptance-status.ts', 'utf8')
const acceptanceApi = readFileSync('src/app/api/moni/mcp-acceptance-status/route.ts', 'utf8')
const acceptanceClient = readFileSync('src/components/MoniMcpAcceptanceStatusClient.tsx', 'utf8')
const connectionPage = readFileSync('src/app/mcp/connections/page.tsx', 'utf8')
const migration = readFileSync('supabase/migrations/20260808150000_moni_mcp_acceptance_preflight_link.sql', 'utf8')

test('acceptance windows persist the exact preflight and tool catalog snapshot', () => {
  assert.match(migration, /preflight_run_id uuid references public\.moni_mcp_preflight_runs/)
  assert.match(migration, /admin_tool_catalog_hash text/)
  assert.match(migration, /freelancer_tool_catalog_hash text/)
  assert.match(activation, /preflightRunId: string/)
  assert.match(activation, /adminToolCatalogHash: string/)
  assert.match(activation, /freelancerToolCatalogHash: string/)
  assert.match(activation, /preflight_run_id: input\.preflightRunId/)
  assert.match(activationApi, /\.from\('moni_mcp_preflight_runs'\)/)
  assert.match(activationApi, /\.eq\('status', 'PASS'\)/)
})

test('acceptance status is strict-admin only', () => {
  assert.match(acceptanceApi, /getStrictMcpSessionFromRequest/)
  assert.match(acceptanceApi, /session\.role !== 'admin'/)
  assert.match(acceptanceApi, /getMoniMcpAcceptanceStatus/)
})

test('acceptance status derives OAuth and tool evidence from the exact window', () => {
  assert.match(acceptance, /moni_mcp_acceptance_windows/)
  assert.match(acceptance, /moni_mcp_oauth_clients/)
  assert.match(acceptance, /moni_mcp_oauth_codes/)
  assert.match(acceptance, /moni_mcp_oauth_tokens/)
  assert.match(acceptance, /moni_mcp_tool_runs/)
  assert.match(acceptance, /\.gte\('started_at', start\)/)
  assert.match(acceptance, /\.lte\('started_at', end\)/)
})

test('acceptance status checks admin and freelancer smoke tools and forbidden access', () => {
  assert.match(acceptance, /ADMIN_SMOKE_TOOLS/)
  assert.match(acceptance, /FREELANCER_SMOKE_TOOLS/)
  assert.match(acceptance, /FREELANCER_FORBIDDEN_TOOLS/)
  assert.match(acceptance, /search_sales_and_receivables/)
  assert.match(acceptance, /forbiddenFreelancerRuns/)
  assert.match(acceptance, /failedRuns/)
})

test('acceptance status keeps ChatGPT UI visibility and data cross-check as manual evidence', () => {
  assert.match(acceptance, /freelancer_ui_visibility/)
  assert.match(acceptance, /data_cross_check/)
  assert.match(acceptance, /status === 'MANUAL'/)
  assert.match(acceptance, /AUTOMATED_PASS/)
})

test('admin page shows live acceptance status after activation controls', () => {
  assert.match(connectionPage, /MoniMcpAcceptanceStatusClient/)
  assert.match(connectionPage, /<MoniMcpActivationClient \/>[\s\S]*<MoniMcpAcceptanceStatusClient \/>/)
  assert.match(acceptanceClient, /5초마다 갱신/)
  assert.match(acceptanceClient, /다음 작업/)
  assert.match(acceptanceClient, /missing_admin_tools/)
  assert.match(acceptanceClient, /missing_freelancer_tools/)
})
