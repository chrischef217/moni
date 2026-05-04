import { NextRequest, NextResponse } from 'next/server'
import { normalizeAllowanceState } from '@/lib/allowance/state'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { readAllowanceState, writeAllowanceState } from '@/lib/allowance/store'
import type { AllowanceState } from '@/types/allowance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin(request: NextRequest) {
  const user = await getSessionFromRequest(request)
  if (!user || user.role !== 'admin') {
    return null
  }
  return user
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin(request)
    if (!user) {
      return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    }

    const state = await readAllowanceState()
    return NextResponse.json({ ok: true, state }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAdmin(request)
    if (!user) {
      return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    }

    const body = (await request.json().catch(() => null)) as { state?: Partial<AllowanceState> } | null
    if (!body?.state || typeof body.state !== 'object') {
      return NextResponse.json({ ok: false, error: '저장할 데이터가 없습니다.' }, { status: 400 })
    }

    const normalized = normalizeAllowanceState(body.state)
    const state = await writeAllowanceState(normalized)

    return NextResponse.json({ ok: true, state }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '데이터 저장 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
