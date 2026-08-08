import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { moniMcpResource } from '@/lib/moni/mcp/config'
import { sha256 } from '@/lib/moni/mcp/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = {
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
}

export async function POST(request: NextRequest) {
  // Revocation remains available even while MCP execution is disabled.
  // This endpoint can only reduce access and must not reveal token existence.
  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({}, { status: 200, headers: NO_STORE })

  const token = String(form.get('token') || '').trim()
  const clientId = String(form.get('client_id') || '').trim()
  const resource = String(form.get('resource') || moniMcpResource()).trim()
  if (!token || !clientId || resource !== moniMcpResource()) {
    return NextResponse.json({}, { status: 200, headers: NO_STORE })
  }

  const tokenHash = sha256(token)
  const supabase = createMoniServiceRoleClient()
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('moni_mcp_oauth_tokens')
    .update({ revoked_at: now, updated_at: now })
    .eq('client_id', clientId)
    .is('revoked_at', null)
    .or(`access_token_hash.eq.${tokenHash},refresh_token_hash.eq.${tokenHash}`)

  if (error) {
    console.error('[MONI_MCP_REVOCATION_ERROR]', {
      message: error.message,
      client_id: clientId,
      occurred_at: now,
    })
  }

  // OAuth revocation must not reveal whether a token existed.
  return NextResponse.json({}, { status: 200, headers: NO_STORE })
}
