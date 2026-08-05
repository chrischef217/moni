import { NextResponse } from 'next/server'
import {
  MONI_MCP_SCOPES,
  moniMcpResource,
  moniPublicBaseUrl,
} from '@/lib/moni/mcp/config'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    resource: moniMcpResource(),
    authorization_servers: [moniPublicBaseUrl()],
    scopes_supported: MONI_MCP_SCOPES,
    bearer_methods_supported: ['header'],
    resource_documentation: `${moniPublicBaseUrl()}/mcp/docs`,
  }, {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  })
}
