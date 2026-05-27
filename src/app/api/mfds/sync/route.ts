import { NextRequest, NextResponse } from 'next/server'
import { getMfdsConfigPreview, syncMfdsData } from '@/lib/mfds_api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function runSync() {
  const config = getMfdsConfigPreview()
  const result = await syncMfdsData()
  return { config, result }
}

export async function GET() {
  try {
    const payload = await runSync()
    return NextResponse.json({ ok: payload.result.ok, ...payload }, { status: payload.result.ok ? 200 : 502 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MFDS 동기화 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(_request: NextRequest) {
  try {
    const payload = await runSync()
    return NextResponse.json({ ok: payload.result.ok, ...payload }, { status: payload.result.ok ? 200 : 502 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MFDS 동기화 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

