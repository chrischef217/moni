import { NextRequest, NextResponse } from 'next/server'
import { getChatGptActionIdentity, hasValidChatGptActionKey } from '@/lib/moni/chatgpt-actions'
import { callMcpTool, listMcpToolsForRole } from '@/lib/moni/mcp/tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ACTION_TOOLS = new Set([
  'get_business_clock',
  'get_company_context',
  'search_production_records',
  'search_production_plans',
  'get_raw_material_inventory',
  'search_raw_material_transactions',
  'search_sales_and_receivables',
  'search_purchases_and_payables',
  'search_products_and_recipes',
])

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

function unauthorized() {
  return NextResponse.json({ ok: false, error: 'invalid_action_key' }, {
    status: 401,
    headers: { ...NO_STORE, 'WWW-Authenticate': 'Bearer realm="MONI ChatGPT Actions"' },
  })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...NO_STORE,
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Origin': 'https://chatgpt.com',
    },
  })
}

export async function POST(request: NextRequest, { params }: { params: { tool: string } }) {
  if (!hasValidChatGptActionKey(request.headers.get('authorization'))) return unauthorized()

  const identity = await getChatGptActionIdentity()
  if (!identity) return unauthorized()

  const toolName = String(params.tool || '').trim()
  if (!ACTION_TOOLS.has(toolName)) {
    return NextResponse.json({ ok: false, error: 'unsupported_read_only_tool' }, { status: 404, headers: NO_STORE })
  }
  const allowed = new Set(listMcpToolsForRole(identity.role).map((tool) => tool.name))
  if (!allowed.has(toolName as any)) {
    return NextResponse.json({ ok: false, error: 'tool_not_allowed_for_current_role' }, { status: 403, headers: NO_STORE })
  }

  const args = await request.json().catch(() => ({}))
  try {
    const result = await callMcpTool({ identity, toolName, arguments: args })
    return NextResponse.json({
      ok: true,
      integration: 'CHATGPT_CUSTOM_GPT_ACTIONS',
      intelligence_runtime: 'CHATGPT_PRODUCT',
      moni_server_model_inference: false,
      tool: toolName,
      result,
    }, { status: 200, headers: NO_STORE })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MONI 읽기 전용 조회에 실패했습니다.'
    return NextResponse.json({ ok: false, tool: toolName, error: message }, { status: 400, headers: NO_STORE })
  }
}
