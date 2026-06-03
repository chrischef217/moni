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

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const productId = text(params.id)
    if (!productId) {
      return NextResponse.json({ ok: false, error: '제품 id가 필요합니다.' }, { status: 400 })
    }

    const supabase = createMoniServiceRoleClient()
    const { data, error } = await supabase
      .from('product_production_units')
      .select('*')
      .eq('product_id', productId)
      .order('is_default', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      const message = error.message || ''
      if (isMissingUnitsTableError(message)) {
        return NextResponse.json(
          { ok: true, units: [], warning: 'product_production_units table is not ready' },
          { status: 200 },
        )
      }
      throw new Error(message || '생산단위 목록 조회에 실패했습니다.')
    }

    const units = ((data ?? []) as Array<Record<string, unknown>>).map(normalizeUnitRow)
    return NextResponse.json({ ok: true, units }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '생산단위 목록 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const productId = text(params.id)
    if (!productId) {
      return NextResponse.json({ ok: false, error: '제품 id가 필요합니다.' }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    }

    const unitName = text(body.unit_name)
    const unitWeightG = numberValue(body.unit_weight_g)
    const isDefault = typeof body.is_default === 'boolean' ? body.is_default : false
    const sortOrder = numberValue(body.sort_order) ?? 0
    const businessId = text(body.business_id) || '20220523011'

    if (!unitName) {
      return NextResponse.json({ ok: false, error: 'unit_name을 입력해 주세요.' }, { status: 400 })
    }
    if (unitWeightG === null || unitWeightG <= 0) {
      return NextResponse.json({ ok: false, error: 'unit_weight_g는 0보다 커야 합니다.' }, { status: 400 })
    }

    const supabase = createMoniServiceRoleClient()

    if (isDefault) {
      const clearDefaultResult = await supabase
        .from('product_production_units')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('product_id', productId)

      if (clearDefaultResult.error && !isMissingUnitsTableError(clearDefaultResult.error.message || '')) {
        throw new Error(clearDefaultResult.error.message || '기본 생산단위 초기화에 실패했습니다.')
      }
    }

    const payload = {
      id: crypto.randomUUID(),
      product_id: productId,
      unit_name: unitName,
      unit_weight_g: unitWeightG,
      is_default: isDefault,
      sort_order: sortOrder,
      business_id: businessId,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase.from('product_production_units').insert(payload).select('*').single()
    if (error) {
      const message = error.message || ''
      if (isMissingUnitsTableError(message)) {
        return NextResponse.json(
          { ok: false, error: 'product_production_units 테이블이 아직 준비되지 않았습니다.' },
          { status: 503 },
        )
      }
      throw new Error(message || '생산단위 등록에 실패했습니다.')
    }

    return NextResponse.json({ ok: true, unit: normalizeUnitRow((data ?? {}) as Record<string, unknown>) }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '생산단위 등록 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
