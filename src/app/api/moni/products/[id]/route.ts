import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PRODUCT_CATEGORY_OPTIONS = ['완제품', '반제품'] as const
const FOOD_TYPE_OPTIONS = ['소스', '복합조미식품', '기타가공품'] as const

function text(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const trimmed = String(value).trim()
  return trimmed.length > 0 ? trimmed : null
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function boolValue(value: unknown, fallback = true): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const lowered = value.toLowerCase()
    if (lowered === 'true' || lowered === '1' || lowered === 'y') return true
    if (lowered === 'false' || lowered === '0' || lowered === 'n') return false
  }
  return fallback
}

function normalizeProductCategory(value: unknown): (typeof PRODUCT_CATEGORY_OPTIONS)[number] | null {
  const candidate = text(value)
  if (!candidate) return null
  return PRODUCT_CATEGORY_OPTIONS.includes(candidate as (typeof PRODUCT_CATEGORY_OPTIONS)[number])
    ? (candidate as (typeof PRODUCT_CATEGORY_OPTIONS)[number])
    : null
}

function normalizeFoodTypeName(value: unknown): (typeof FOOD_TYPE_OPTIONS)[number] | null {
  const candidate = text(value)
  if (!candidate) return null
  return FOOD_TYPE_OPTIONS.includes(candidate as (typeof FOOD_TYPE_OPTIONS)[number])
    ? (candidate as (typeof FOOD_TYPE_OPTIONS)[number])
    : null
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = String(params.id ?? '').trim()
    if (!id) {
      return NextResponse.json({ ok: false, error: '제품 id가 필요합니다.' }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    }

    const payload: Record<string, unknown> = {
      product_name: text(body.product_name),
      product_code: text(body.product_code),
      report_number: text(body.report_number),
      product_spec: text(body.product_spec),
      weight_g: numberValue(body.weight_g),
      storage_method: text(body.storage_method),
      storage_type: text(body.storage_type),
      shelf_life: text(body.shelf_life),
      shelf_life_days: numberValue(body.shelf_life_days),
      shelf_life_standard: text(body.shelf_life_standard),
      packaging_material: text(body.packaging_material),
      lot_rule: text(body.lot_rule),
      allergens: text(body.allergens),
    }

    const rawProductType = text(body.product_type)
    if (rawProductType !== null) {
      const normalizedCategory = normalizeProductCategory(rawProductType)
      if (!normalizedCategory) {
        return NextResponse.json({ ok: false, error: '제품구분은 완제품/반제품만 허용됩니다.' }, { status: 400 })
      }
      payload.product_type = normalizedCategory
    }

    const rawFoodTypeName = text(body.food_type_name)
    if (rawFoodTypeName === null) {
      if (body.food_type_name === null || body.food_type_name === '') {
        payload.food_type_name = null
      }
    } else {
      const normalizedFoodType = normalizeFoodTypeName(rawFoodTypeName)
      if (!normalizedFoodType) {
        return NextResponse.json(
          { ok: false, error: '식품유형은 소스/복합조미식품/기타가공품 중 하나여야 합니다.' },
          { status: 400 },
        )
      }
      payload.food_type_name = normalizedFoodType
    }

    if (typeof body.is_active === 'boolean' || typeof body.is_active === 'string') {
      payload.is_active = boolValue(body.is_active, true)
    }

    const supabase = createMoniServiceRoleClient()
    const { data, error } = await supabase.from('products').update(payload).eq('id', id).select('*').maybeSingle()
    if (error) throw new Error(error.message || '제품 수정에 실패했습니다.')
    if (!data) {
      return NextResponse.json({ ok: false, error: '제품을 찾을 수 없습니다.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, product: data }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '제품 수정 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
