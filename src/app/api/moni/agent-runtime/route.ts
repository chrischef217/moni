import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function chatGptOnlyResponse() {
  return NextResponse.json({
    ok: false,
    chatgpt_only: true,
    integration: 'CHATGPT_CUSTOM_GPT_ACTIONS',
    intelligence_runtime: 'CHATGPT_PRODUCT',
    moni_server_model_inference: false,
    error: 'MONI 서버 AI 모델 호출은 비활성화되었습니다. ChatGPT의 MONI GPT를 사용하세요.',
  }, {
    status: 410,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}

export async function GET() {
  return chatGptOnlyResponse()
}

export async function POST() {
  return chatGptOnlyResponse()
}
