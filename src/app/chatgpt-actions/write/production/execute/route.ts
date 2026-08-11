import { NextRequest, NextResponse } from 'next/server'
import { getChatGptActionIdentity, hasValidChatGptActionKey } from '@/lib/moni/chatgpt-actions'
import { executeProductionOperation } from '@/lib/moni/chatgpt-production-actions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

export async function POST(request: NextRequest) {
  if (!hasValidChatGptActionKey(request.headers.get('authorization'))) return unauthorized()
  const identity = await getChatGptActionIdentity()
  if (!identity) return unauthorized()

  try {
    const input = await request.json().catch(() => ({}))
    const result = await executeProductionOperation(input, identity)
    return NextResponse.json({
      ok: true,
      integration: 'CHATGPT_CUSTOM_GPT_ACTIONS',
      intelligence_runtime: 'CHATGPT_PRODUCT',
      moni_server_model_inference: false,
      tool: 'execute_production_operation',
      result,
    }, { status: 200, headers: NO_STORE })
  } catch (error) {
    const message = error instanceof Error ? error.message : '승인된 생산 업무 실행에 실패했습니다.'
    return NextResponse.json({ ok: false, tool: 'execute_production_operation', error: message }, { status: 400, headers: NO_STORE })
  }
}
