import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function response() {
  return NextResponse.json({
    ok: false,
    chatgpt_only: true,
    integration: 'CHATGPT_CUSTOM_GPT_ACTIONS',
    moni_server_model_inference: false,
    error: 'MONI 자체 AI 모델 호출은 종료되었습니다. MONI는 ChatGPT 제품의 GPT Action으로만 사용합니다.',
  }, {
    status: 410,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}

export async function GET() {
  return response()
}

export async function POST() {
  return response()
}
