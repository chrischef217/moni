import { NextResponse } from 'next/server'
import { MONI_MCP_SCOPES, moniPublicBaseUrl } from '@/lib/moni/mcp/config'

export const dynamic = 'force-dynamic'

export async function GET() {
  const baseUrl = moniPublicBaseUrl()
  return NextResponse.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    revocation_endpoint: `${baseUrl}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: MONI_MCP_SCOPES,
    client_id_metadata_document_supported: false,
  }, {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  })
}
