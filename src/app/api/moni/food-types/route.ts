import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function GET() {
  try {
    const supabase = createMoniServiceRoleClient()
    const { data, error } = await supabase
      .from('food_type_master')
      .select('*')
      .order('type_name', { ascending: true })

    if (error) throw new Error(error.message || '식품유형 조회 실패')

    return NextResponse.json({ ok: true, foodTypes: data ?? [] }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '식품유형 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const typeName = toText(body?.type_name)
    if (!typeName) {
      return NextResponse.json({ ok: false, error: '식품유형명을 입력해 주세요.' }, { status: 400 })
    }

    const supabase = createMoniServiceRoleClient()
    const payload = {
      type_name: typeName,
      category: toText(body?.category) || null,
      unit: toText(body?.unit) || 'g',
      business_id: toText(body?.business_id) || 'default',
    }

    const { data, error } = await supabase.from('food_type_master').insert(payload).select('*').single()
    if (error) throw new Error(error.message || '식품유형 저장 실패')

    return NextResponse.json({ ok: true, foodType: data }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '식품유형 저장 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
