import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PRODUCT_TYPE_OPTIONS = ['소스', '복합조미식품', '기타가공품'] as const

function text(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  return String(value).trim()
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
  const lowered = text(value).toLowerCase()
  if (lowered === 'true' || lowered === '1' || lowered === 'y') return true
  if (lowered === 'false' || lowered === '0' || lowered === 'n') return false
  return fallback
}

function normalizeProductType(value: unknown): (typeof PRODUCT_TYPE_OPTIONS)[number] | null {
  const candidate = text(value)
  if (!candidate) return null
  return PRODUCT_TYPE_OPTIONS.includes(candidate as (typeof PRODUCT_TYPE_OPTIONS)[number])
    ? (candidate as (typeof PRODUCT_TYPE_OPTIONS)[number])
    : null
}

function createProductId() {
  const stamp = Date.now().toString().slice(-8)
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0')
  return `PROD-${stamp}${random}`
}

export async function GET(request: NextRequest) {
  try {
    const includeInactive = ['1', 'true', 'all'].includes(
      String(request.nextUrl.searchParams.get('include_inactive') ?? '').toLowerCase(),
    )

    const supabase = createMoniServiceRoleClient()
    const { data, error } = await supabase
      .from('products')
      .select(
        [
          'id',
          'product_name',
          'product_code',
          'report_number',
          'product_type',
          'storage_method',
          'storage_type',
          'shelf_life',
          'shelf_life_days',
          'shelf_life_standard',
          'product_spec',
          'weight_g',
          'packaging_material',
          'lot_rule',
          'allergens',
          'is_active',
          'business_id',
          'created_at',
        ].join(', '),
      )
      .order('product_name', { ascending: true })
      .limit(1000)
    if (error) throw new Error(error.message || '제품 목록 조회에 실패했습니다.')

    const allProducts = (data ?? []) as unknown as Array<Record<string, unknown>>
    const activeProducts = allProducts.filter((item) => item.is_active !== false)
    const inactiveProducts = allProducts.filter((item) => item.is_active === false)
    const products = includeInactive ? allProducts : activeProducts

    return NextResponse.json(
      {
        ok: true,
        products,
        summary: {
          total: allProducts.length,
          active: activeProducts.length,
          inactive: inactiveProducts.length,
        },
      },
      { status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '제품 목록 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    }

    const productName = text(body.product_name)
    if (!productName) {
      return NextResponse.json({ ok: false, error: '제품명을 입력해 주세요.' }, { status: 400 })
    }

    const normalizedProductType = normalizeProductType(body.product_type)
    if (!normalizedProductType) {
      return NextResponse.json({ ok: false, error: '식품유형은 소스/복합조미식품/기타가공품 중 하나여야 합니다.' }, { status: 400 })
    }

    const idFromBody = text(body.id)
    const payload = {
      id: idFromBody || createProductId(),
      product_name: productName,
      product_code: text(body.product_code) || null,
      report_number: text(body.report_number) || null,
      product_type: normalizedProductType,
      storage_method: text(body.storage_method) || null,
      storage_type: text(body.storage_type) || null,
      shelf_life: text(body.shelf_life) || null,
      shelf_life_days: numberValue(body.shelf_life_days),
      shelf_life_standard: text(body.shelf_life_standard) || null,
      product_spec: text(body.product_spec) || null,
      weight_g: numberValue(body.weight_g),
      packaging_material: text(body.packaging_material) || null,
      lot_rule: text(body.lot_rule) || null,
      allergens: text(body.allergens) || null,
      business_id: text(body.business_id) || '20220523011',
      is_active: boolValue(body.is_active, true),
    }

    const supabase = createMoniServiceRoleClient()
    const { data, error } = await supabase.from('products').insert(payload).select('*').single()
    if (error) throw new Error(error.message || '제품 등록에 실패했습니다.')

    return NextResponse.json({ ok: true, product: data }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '제품 등록 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
