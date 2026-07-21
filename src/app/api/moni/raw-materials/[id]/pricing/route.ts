import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function priceValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(String(value).replaceAll(',', '').trim())
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = String(params.id ?? '').trim()
    if (!id) {
      return NextResponse.json({ ok: false, error: '원재료 ID가 필요합니다.' }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as { unit_price_per_kg?: unknown } | null
    if (!body || !Object.prototype.hasOwnProperty.call(body, 'unit_price_per_kg')) {
      return NextResponse.json({ ok: false, error: '포장단가 값이 필요합니다.' }, { status: 400 })
    }

    const unitPrice = priceValue(body.unit_price_per_kg)
    if (typeof unitPrice === 'number' && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
      return NextResponse.json({ ok: false, error: '포장단가는 0 이상의 숫자로 입력해 주세요.' }, { status: 400 })
    }

    const result = await createMoniServiceRoleClient()
      .from('raw_materials')
      .update({ unit_price_per_kg: unitPrice })
      .eq('id', id)
      .select('id, item_name, packing_weight_g, unit_price_per_kg')
      .maybeSingle()

    if (result.error) throw new Error(result.error.message || '포장단가 저장에 실패했습니다.')
    if (!result.data) {
      return NextResponse.json({ ok: false, error: '원재료를 찾을 수 없습니다.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, material: result.data }, { status: 200 })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : '포장단가 저장 중 오류가 발생했습니다.' },
      { status: 500 },
    )
  }
}
