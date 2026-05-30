import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function bool(value: unknown, fallback = true): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function todayDateValue() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createMoniServiceRoleClient()
    const from = request.nextUrl.searchParams.get('from')?.trim() ?? ''
    const to = request.nextUrl.searchParams.get('to')?.trim() ?? ''

    let query = supabase
      .from('sanitation_logs')
      .select('*')
      .order('check_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)

    if (from) query = query.gte('check_date', from)
    if (to) query = query.lte('check_date', to)

    const { data, error } = await query
    if (error) throw new Error(error.message || '위생점검 일지 조회 실패')

    return NextResponse.json({ ok: true, logs: data ?? [] }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '위생점검 일지 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    }

    const checkerName = text(body.checker_name)
    if (!checkerName) {
      return NextResponse.json({ ok: false, error: '점검자 이름을 입력해 주세요.' }, { status: 400 })
    }

    const payload = {
      check_date: text(body.check_date) || todayDateValue(),
      checker_name: checkerName,
      workplace_clean: bool(body.workplace_clean),
      workplace_note: text(body.workplace_note) || null,
      worker_hygiene: bool(body.worker_hygiene),
      worker_note: text(body.worker_note) || null,
      material_storage: bool(body.material_storage),
      material_note: text(body.material_note) || null,
      equipment_clean: bool(body.equipment_clean),
      equipment_note: text(body.equipment_note) || null,
      pest_control: bool(body.pest_control),
      pest_note: text(body.pest_note) || null,
      water_hygiene: bool(body.water_hygiene),
      water_note: text(body.water_note) || null,
      overall_result: text(body.overall_result) || '적합',
      action_taken: text(body.action_taken) || null,
      business_id: text(body.business_id) || 'default',
    }

    const supabase = createMoniServiceRoleClient()
    const { data, error } = await supabase.from('sanitation_logs').insert(payload).select('*').single()
    if (error) throw new Error(error.message || '위생점검 일지 저장 실패')

    return NextResponse.json({ ok: true, log: data }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '위생점검 일지 저장 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
