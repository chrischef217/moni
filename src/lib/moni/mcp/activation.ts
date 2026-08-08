import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { isMoniMcpEnabled } from '@/lib/moni/mcp/config'

export type MoniMcpActivationState = {
  enabled: boolean
  mode: 'PERMANENT_ENV' | 'ACCEPTANCE_WINDOW' | 'DISABLED'
  windowId: string | null
  enabledAt: string | null
  enabledUntil: string | null
  enabledByLoginId: string | null
  enabledByDisplayName: string | null
  reason: string | null
  preflightRunId: string | null
  adminToolCatalogHash: string | null
  freelancerToolCatalogHash: string | null
}

function disabledState(): MoniMcpActivationState {
  return {
    enabled: false,
    mode: 'DISABLED',
    windowId: null,
    enabledAt: null,
    enabledUntil: null,
    enabledByLoginId: null,
    enabledByDisplayName: null,
    reason: null,
    preflightRunId: null,
    adminToolCatalogHash: null,
    freelancerToolCatalogHash: null,
  }
}

export async function getMoniMcpActivationState(): Promise<MoniMcpActivationState> {
  if (isMoniMcpEnabled()) {
    return {
      enabled: true,
      mode: 'PERMANENT_ENV',
      windowId: null,
      enabledAt: null,
      enabledUntil: null,
      enabledByLoginId: null,
      enabledByDisplayName: null,
      reason: 'MONI_MCP_ENABLED=true',
      preflightRunId: null,
      adminToolCatalogHash: null,
      freelancerToolCatalogHash: null,
    }
  }

  const supabase = createMoniServiceRoleClient()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('moni_mcp_acceptance_windows')
    .select('id,enabled_at,enabled_by_login_id,enabled_by_display_name,reason,enabled_until,revoked_at,preflight_run_id,admin_tool_catalog_hash,freelancer_tool_catalog_hash')
    .is('revoked_at', null)
    .gt('enabled_until', now)
    .order('enabled_until', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[MONI_MCP_ACTIVATION_READ_ERROR]', { message: error.message })
    return disabledState()
  }
  if (!data) return disabledState()

  return {
    enabled: true,
    mode: 'ACCEPTANCE_WINDOW',
    windowId: data.id,
    enabledAt: data.enabled_at,
    enabledUntil: data.enabled_until,
    enabledByLoginId: data.enabled_by_login_id,
    enabledByDisplayName: data.enabled_by_display_name,
    reason: data.reason,
    preflightRunId: data.preflight_run_id,
    adminToolCatalogHash: data.admin_tool_catalog_hash,
    freelancerToolCatalogHash: data.freelancer_tool_catalog_hash,
  }
}

export async function isMoniMcpRuntimeEnabled() {
  return (await getMoniMcpActivationState()).enabled
}

export async function isMoniMcpCredentialCreatedAtAllowed(createdAt: string) {
  const created = Date.parse(String(createdAt || ''))
  if (!Number.isFinite(created)) return false

  const state = await getMoniMcpActivationState()
  if (!state.enabled) return false

  if (state.mode === 'ACCEPTANCE_WINDOW') {
    const start = Date.parse(String(state.enabledAt || ''))
    const end = Date.parse(String(state.enabledUntil || ''))
    return Number.isFinite(start) && Number.isFinite(end) && created >= start && created <= end
  }

  // Permanent mode must never resurrect credentials created inside a historical
  // acceptance window. Acceptance credentials are test-only by design.
  const supabase = createMoniServiceRoleClient()
  const createdIso = new Date(created).toISOString()
  const { data, error } = await supabase
    .from('moni_mcp_acceptance_windows')
    .select('id')
    .lte('enabled_at', createdIso)
    .gte('enabled_until', createdIso)
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[MONI_MCP_CREDENTIAL_WINDOW_CHECK_ERROR]', { message: error.message })
    return false
  }
  return !data
}

export async function openMoniMcpAcceptanceWindow(input: {
  loginId: string
  displayName: string
  reason: string
  durationMinutes?: number
  preflightRunId: string
  adminToolCatalogHash: string
  freelancerToolCatalogHash: string
}) {
  if (isMoniMcpEnabled()) return getMoniMcpActivationState()

  const durationMinutes = Math.max(5, Math.min(30, Math.trunc(Number(input.durationMinutes || 15))))
  const reason = String(input.reason || '').trim().slice(0, 500)
  if (reason.length < 3) throw new Error('수용검사 사유를 3자 이상 입력해야 합니다.')
  if (!input.preflightRunId || !input.adminToolCatalogHash || !input.freelancerToolCatalogHash) {
    throw new Error('수용검사 창에는 검증된 Preflight와 도구 해시가 필요합니다.')
  }

  const supabase = createMoniServiceRoleClient()
  const now = new Date()
  const nowIso = now.toISOString()
  const enabledUntil = new Date(now.getTime() + durationMinutes * 60_000).toISOString()

  const { error: closeError } = await supabase
    .from('moni_mcp_acceptance_windows')
    .update({
      revoked_at: nowIso,
      revoked_by_login_id: input.loginId,
    })
    .is('revoked_at', null)
    .gt('enabled_until', nowIso)
  if (closeError) throw new Error(closeError.message)

  // Authorization codes are single-use and short lived, but a new acceptance
  // window must not inherit an unfinished code from an older window.
  const { error: codeCleanupError } = await supabase
    .from('moni_mcp_oauth_codes')
    .delete()
    .is('used_at', null)
  if (codeCleanupError) throw new Error(codeCleanupError.message)

  const { data, error } = await supabase
    .from('moni_mcp_acceptance_windows')
    .insert({
      enabled_by_login_id: input.loginId,
      enabled_by_display_name: input.displayName,
      reason,
      enabled_until: enabledUntil,
      preflight_run_id: input.preflightRunId,
      admin_tool_catalog_hash: input.adminToolCatalogHash,
      freelancer_tool_catalog_hash: input.freelancerToolCatalogHash,
    })
    .select('id,enabled_at,enabled_by_login_id,enabled_by_display_name,reason,enabled_until,preflight_run_id,admin_tool_catalog_hash,freelancer_tool_catalog_hash')
    .single()
  if (error) throw new Error(error.message)

  return {
    enabled: true,
    mode: 'ACCEPTANCE_WINDOW' as const,
    windowId: data.id,
    enabledAt: data.enabled_at,
    enabledUntil: data.enabled_until,
    enabledByLoginId: data.enabled_by_login_id,
    enabledByDisplayName: data.enabled_by_display_name,
    reason: data.reason,
    preflightRunId: data.preflight_run_id,
    adminToolCatalogHash: data.admin_tool_catalog_hash,
    freelancerToolCatalogHash: data.freelancer_tool_catalog_hash,
  }
}

export async function closeMoniMcpAcceptanceWindow(input: { loginId: string }) {
  const supabase = createMoniServiceRoleClient()
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('moni_mcp_acceptance_windows')
    .update({
      revoked_at: now,
      revoked_by_login_id: input.loginId,
    })
    .is('revoked_at', null)
    .gt('enabled_until', now)
  if (error) throw new Error(error.message)

  const { error: codeCleanupError } = await supabase
    .from('moni_mcp_oauth_codes')
    .delete()
    .is('used_at', null)
  if (codeCleanupError) throw new Error(codeCleanupError.message)

  return getMoniMcpActivationState()
}
