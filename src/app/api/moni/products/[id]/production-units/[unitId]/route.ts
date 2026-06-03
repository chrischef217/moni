import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function isMissingUnitsTableError(message: string) {
  const lower = message.toLowerCase()
  return (
    (lower.includes('product_production_units') && lower.includes('does not exist')) ||
    lower.includes('relation "product_production_units" does not exist') ||
    (lower.includes('product_production_units') && lower.includes('schema cache'))
  )
}

function normalizeUnitRow(row: Record<string, unknown>) {
  return {
    id: text(row.id),
    product_id: text(row.product_id),
    unit_name: text(row.unit_name),
    unit_weight_g: numberValue(row.unit_weight_g),
    is_default: typeof row.is_default === 'boolean' ? row.is_default : false,
    sort_order: numberValue(row.sort_order) ?? 0,
    business_id: text(row.business_id) || null,
    created_at: text(row.created_at) || null,
    updated_at: text(row.updated_at) || null,
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; unitId: string } },
) {
  try {
    const productId = text(params.id)
    const unitId = text(params.unitId)
    if (!productId || !unitId) {
      return NextResponse.json({ ok: false, error: '제품 id와 unitId가 필요합니다.' }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    }

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    const unitName = text(body.unit_name)
    if (unitName) payload.unit_name = unitName

    if (Object.prototype.hasOwnProperty.call(body, 'unit_weight_g')) {
      const unitWeightG = numberValue(body.unit_weight_g)
      if (unitWeightG === null || unitWeightG <= 0) {
        return NextResponse.json({ ok: false, error: 'unit_weight_g는 0보다 커야 합니다.' }, { status: 400 })
      }
      payload.unit_weight_g = unitWeightG
    }

    if (Object.prototype.hasOwnProperty.call(body, 'sort_order')) {
      payload.sort_order = numberValue(body.sort_order) ?? 0
    }

    const isDefault = typeof body.is_default === 'boolean' ? body.is_default : null
    if (isDefault !== null) payload.is_default = isDefault

    const supabase = createMoniServiceRoleClient()

    if (isDefault === true) {
      const clearDefaultResult = await supabase
        .from('product_production_units')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('product_id', productId)
        .neq('id', unitId)

      if (clearDefaultResult.error && !isMissingUnitsTableError(clearDefaultResult.error.message || '')) {
        throw new Error(clearDefaultResult.error.message || '기본 생산단위 초기화에 실패했습니다.')
      }
    }

    const { data, error } = await supabase
      .from('product_production_units')
      .update(payload)
      .eq('id', unitId)
      .eq('product_id', productId)
      .select('*')
      .maybeSingle()

    if (error) {
      const message = error.message || ''
      if (isMissingUnitsTableError(message)) {
        return NextResponse.json(
          { ok: false, error: 'product_production_units 테이블이 아직 준비되지 않았습니다.' },
          { status: 503 },
        )
      }
      throw new Error(message || '생산단위 수정에 실패했습니다.')
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: '수정할 생산단위를 찾을 수 없습니다.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, unit: normalizeUnitRow((data ?? {}) as Record<string, unknown>) }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '생산단위 수정 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; unitId: string } },
) {
  try {
    const productId = text(params.id)
    const unitId = text(params.unitId)
    if (!productId || !unitId) {
      return NextResponse.json({ ok: false, error: '제품 id와 unitId가 필요합니다.' }, { status: 400 })
    }

    const supabase = createMoniServiceRoleClient()
    const { error } = await supabase
      .from('product_production_units')
      .delete()
      .eq('id', unitId)
      .eq('product_id', productId)

    if (error) {
      const message = error.message || ''
      if (isMissingUnitsTableError(message)) {
        return NextResponse.json(
          { ok: false, error: 'product_production_units 테이블이 아직 준비되지 않았습니다.' },
          { status: 503 },
        )
      }
      throw new Error(message || '생산단위 삭제에 실패했습니다.')
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '생산단위 삭제 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
