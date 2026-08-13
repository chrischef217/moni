import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function response() {
  return NextResponse.json({
    ok: false,
    chatgpt_only: true,
    intelligence_runtime: 'CHATGPT_PRODUCT',
    moni_server_model_inference: false,
    error: '서버 AI 모델 평가는 비활성화되었습니다.',
  }, { status: 410, headers: { 'Cache-Control': 'no-store, max-age=0' } })
}

export async function GET() { return response() }
export async function POST() { return response() }
