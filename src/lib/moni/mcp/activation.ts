import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { isMoniMcpEnabled } from '@/lib/moni/mcp/config'

export type MoniMcpActivationState = {
  enabled: boolean
  mode: 'PERMANENT_ENV' | 'ACCEPTANCE_WINDOW' | 'DISABLED'
  enabledUntil: string | null
  enabledByLoginId: string | null
  enabledByDisplayName: string | null
  reason: string | null
}

function disabledState(): MoniMcpActivationState {
  return {
    enabled: false,
    mode: 'DISABLED',
    enabledUntil: null,
    enabledByLoginId: null,
    enabledByDisplayName: null,
    reason: null,
  }
}

export async function getMoniMcpActivationState(): Promise<MoniMcpActivationState> {
  if (isMoniMcpEnabled()) {
    return {
      enabled: true,
      mode: 'PERMANENT_ENV',
      enabledUntil: null,
      enabledByLoginId: null,
      enabledByDisplayName: null,
      reason: 'MONI_MCP_ENABLED=true',
    }
  }

  const supabase = createMoniServiceRoleClient()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('moni_mcp_acceptance_windows')
    .select('id,enabled_by_login_id,enabled_by_display_name,reason,enabled_until,revoked_at')
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
    enabledUntil: data.enabled_until,
    enabledByLoginId: data.enabled_by_login_id,
    enabledByDisplayName: data.enabled_by_display_name,
    reason: data.reason,
  }
}

export async function isMoniMcpRuntimeEnabled() {
  return (await getMoniMcpActivationState()).enabled
}

export async function openMoniMcpAcceptanceWindow(input: {
  loginId: string
  displayName: string
  reason: string
  durationMinutes?: number
}) {
  if (isMoniMcpEnabled()) return getMoniMcpActivationState()

  const durationMinutes = Math.max(5, Math.min(30, Math.trunc(Number(input.durationMinutes || 15))))
  const reason = String(input.reason || '').trim().slice(0, 500)
  if (reason.length < 3) throw new Error('수용검사 사유를 3자 이상 입력해야 합니다.')

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

  const { data, error } = await supabase
    .from('moni_mcp_acceptance_windows')
    .insert({
      enabled_by_login_id: input.loginId,
      enabled_by_display_name: input.displayName,
      reason,
      enabled_until: enabledUntil,
    })
    .select('id,enabled_by_login_id,enabled_by_display_name,reason,enabled_until')
    .single()
  if (error) throw new Error(error.message)

  return {
    enabled: true,
    mode: 'ACCEPTANCE_WINDOW' as const,
    enabledUntil: data.enabled_until,
    enabledByLoginId: data.enabled_by_login_id,
    enabledByDisplayName: data.enabled_by_display_name,
    reason: data.reason,
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
  return getMoniMcpActivationState()
}
