import { NextRequest, NextResponse } from 'next/server'
import { isMoniMcpRuntimeEnabled } from '@/lib/moni/mcp/activation'
import {
  MONI_MCP_PROTOCOL_VERSION,
  MONI_MCP_VERSION,
  protectedResourceMetadataUrl,
} from '@/lib/moni/mcp/config'
import { authenticateMcpBearer, type MoniMcpIdentity } from '@/lib/moni/mcp/oauth'
import { verifyCurrentMcpIdentity } from '@/lib/moni/mcp/session'
import { callMcpTool, listMcpToolsForRole } from '@/lib/moni/mcp/tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
  'MCP-Protocol-Version': MONI_MCP_PROTOCOL_VERSION,
}

type JsonRpcId = string | number | null
type JsonRpcRequest = {
  jsonrpc?: unknown
  id?: JsonRpcId
  method?: unknown
  params?: unknown
}

type JsonRpcResponse = {
  jsonrpc: '2.0'
  id: JsonRpcId
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

function jsonRpcResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result }
}

function jsonRpcError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } }
}

function unauthorized() {
  return NextResponse.json({
    error: 'unauthorized',
    error_description: 'MONI MCP OAuth 로그인이 필요합니다.',
  }, {
    status: 401,
    headers: {
      ...NO_STORE_HEADERS,
      'WWW-Authenticate': `Bearer resource_metadata="${protectedResourceMetadataUrl()}", scope="moni:read"`,
    },
  })
}

function disabled() {
  return NextResponse.json({
    error: 'service_unavailable',
    error_description: 'MONI ChatGPT 연결은 비활성 상태입니다. 승인된 수용검사 창 또는 영구 운영 플래그가 필요합니다.',
  }, {
    status: 503,
    headers: NO_STORE_HEADERS,
  })
}

function isNotification(request: JsonRpcRequest) {
  return request.id === undefined || request.id === null
}

async function strictBearerIdentity(authorization: string | null): Promise<MoniMcpIdentity | null> {
  const tokenIdentity = await authenticateMcpBearer(authorization)
  if (!tokenIdentity) return null
  const current = await verifyCurrentMcpIdentity({
    loginId: tokenIdentity.loginId,
    role: tokenIdentity.role,
  })
  if (!current) return null
  return {
    ...tokenIdentity,
    loginId: current.loginId,
    displayName: current.displayName,
    role: current.role,
  }
}

async function handleRpcRequest(request: JsonRpcRequest, identity: MoniMcpIdentity): Promise<JsonRpcResponse | null> {
  const id = request.id ?? null
  if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    return jsonRpcError(id, -32600, 'Invalid Request')
  }

  if (request.method === 'notifications/initialized') return null
  if (request.method === 'ping') return jsonRpcResult(id, {})

  if (request.method === 'initialize') {
    return jsonRpcResult(id, {
      protocolVersion: MONI_MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: { listChanged: false },
      },
      serverInfo: {
        name: 'moni-readonly',
        title: 'MONI 두배 공장 읽기 전용 도구',
        version: MONI_MCP_VERSION,
      },
      instructions: 'MONI의 실제 생산·재고·제품·판매·수금·매입 데이터를 조회하는 읽기 전용 서버입니다. 도구 결과의 기간, 단위, result_meta와 경고를 근거로 답변하고 데이터를 수정했다고 말하지 마세요.',
    })
  }

  if (request.method === 'tools/list') {
    return jsonRpcResult(id, {
      tools: listMcpToolsForRole(identity.role),
    })
  }

  if (request.method === 'tools/call') {
    const params = request.params && typeof request.params === 'object' && !Array.isArray(request.params)
      ? request.params as Record<string, unknown>
      : {}
    try {
      const output = await callMcpTool({
        identity,
        toolName: params.name,
        arguments: params.arguments,
      })
      const structuredContent = output && typeof output === 'object' && !Array.isArray(output)
        ? output as Record<string, unknown>
        : { result: output }
      return jsonRpcResult(id, {
        content: [{
          type: 'text',
          text: 'MONI 읽기 전용 조회를 완료했습니다. structuredContent의 실제 데이터, 기간, 단위, result_meta와 경고만 근거로 답변하세요.',
        }],
        structuredContent,
        isError: false,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MONI MCP 도구 실행에 실패했습니다.'
      return jsonRpcResult(id, {
        content: [{ type: 'text', text: message }],
        structuredContent: { error: message },
        isError: true,
      })
    }
  }

  return isNotification(request) ? null : jsonRpcError(id, -32601, 'Method not found')
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...NO_STORE_HEADERS,
      Allow: 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Origin': 'https://chatgpt.com',
    },
  })
}

export async function GET(request: NextRequest) {
  if (!(await isMoniMcpRuntimeEnabled())) return disabled()
  const identity = await strictBearerIdentity(request.headers.get('authorization'))
  if (!identity) return unauthorized()
  return NextResponse.json({
    ok: true,
    server: 'moni-readonly',
    protocol_version: MONI_MCP_PROTOCOL_VERSION,
    role: identity.role,
    tools: listMcpToolsForRole(identity.role).map((tool) => tool.name),
  }, {
    status: 200,
    headers: NO_STORE_HEADERS,
  })
}

export async function POST(request: NextRequest) {
  if (!(await isMoniMcpRuntimeEnabled())) return disabled()
  const identity = await strictBearerIdentity(request.headers.get('authorization'))
  if (!identity) return unauthorized()

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(jsonRpcError(null, -32700, 'Parse error'), {
      status: 400,
      headers: NO_STORE_HEADERS,
    })
  }

  const requests = Array.isArray(payload) ? payload : [payload]
  if (!requests.length) {
    return NextResponse.json(jsonRpcError(null, -32600, 'Invalid Request'), {
      status: 400,
      headers: NO_STORE_HEADERS,
    })
  }

  const responses: JsonRpcResponse[] = []
  for (const item of requests) {
    const current = item && typeof item === 'object' && !Array.isArray(item)
      ? item as JsonRpcRequest
      : { jsonrpc: undefined, id: null, method: undefined }
    const response = await handleRpcRequest(current, identity)
    if (response) responses.push(response)
  }

  if (!responses.length) {
    return new NextResponse(null, { status: 202, headers: NO_STORE_HEADERS })
  }

  return NextResponse.json(Array.isArray(payload) ? responses : responses[0], {
    status: 200,
    headers: NO_STORE_HEADERS,
  })
}
