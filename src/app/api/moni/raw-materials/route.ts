import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const RAW_MATERIAL_INGREDIENT_TYPES = ['원재료', '반제품', '제품/반제품', '기타'] as const
const PRODUCT_CATEGORY_SEMIFINISHED = '반제품'

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function makeRawMaterialId() {
  return `ITEM-${Date.now()}`
}

function normalizeBusinessId(value: unknown): string {
  const raw = text(value)
  return raw || '20220523011'
}

function isScopedBusinessId(value: unknown, businessId: string): boolean {
  const raw = text(value)
  return raw === businessId || raw === 'default' || raw === ''
}

function businessPriority(value: unknown, businessId: string): number {
  const raw = text(value)
  if (raw === businessId) return 0
  if (raw === 'default') return 1
  if (raw === '') return 2
  return 3
}

function isMissingColumnError(message: string, columnName: string): boolean {
  const lower = String(message).toLowerCase()
  const target = String(columnName).toLowerCase()
  return lower.includes(target) && (lower.includes('does not exist') || lower.includes('schema cache') || lower.includes('column'))
}

async function validateLinkedSemifinishedProductId(
  supabase: ReturnType<typeof createMoniServiceRoleClient>,
  linkedProductId: string,
) {
  const { data, error } = await supabase
    .from('products')
    .select('id, product_type')
    .eq('id', linkedProductId)
    .maybeSingle()
  if (error) throw new Error(error.message || '연결 반제품 검증에 실패했습니다.')
  if (!data) throw new Error('선택한 연결 반제품을 찾을 수 없습니다.')
  if (text(data.product_type) !== PRODUCT_CATEGORY_SEMIFINISHED) {
    throw new Error('연결 반제품은 제품구분이 반제품인 제품만 선택할 수 있습니다.')
  }
}

export async function GET(request: NextRequest) {
  try {
    const includeInactive = ['1', 'true', 'all'].includes(
      String(request.nextUrl.searchParams.get('include_inactive') ?? '').toLowerCase(),
    )
    const status = String(request.nextUrl.searchParams.get('status') ?? '').toLowerCase()
    const inactiveOnly = status === 'inactive'
    const businessId = normalizeBusinessId(request.nextUrl.searchParams.get('business_id'))

    const supabase = createMoniServiceRoleClient()
    const [materialsResult, transactionsResult] = await Promise.all([
      supabase.from('raw_materials').select('*').order('item_name', { ascending: true }),
      supabase
        .from('raw_material_transactions')
        .select('raw_material_id, raw_material_name, food_type_name, packing_unit, created_at')
        .order('created_at', { ascending: false })
        .limit(1000),
    ])

    if (materialsResult.error) throw new Error(materialsResult.error.message || '?먯옱猷?議고쉶 ?ㅽ뙣')

    const latestMeta = new Map<string, { food_type_name: string | null; packing_unit: string | null }>()
    if (!transactionsResult.error) {
      for (const row of (transactionsResult.data ?? []) as Array<{
        raw_material_id?: string | null
        raw_material_name?: string | null
        food_type_name?: string | null
        packing_unit?: string | null
      }>) {
        const key = row.raw_material_id || row.raw_material_name
        if (key && !latestMeta.has(key)) {
          latestMeta.set(key, {
            food_type_name: row.food_type_name ?? null,
            packing_unit: row.packing_unit ?? null,
          })
        }
      }
    }

    const scopedRows = ((materialsResult.data ?? []) as Array<Record<string, unknown>>).filter((item) =>
      isScopedBusinessId(item.business_id, businessId),
    )
    const scopedByName = new Map<string, Record<string, unknown>>()
    for (const item of scopedRows) {
      const nameKey = text(item.item_name).toLowerCase()
      if (!nameKey) continue
      const current = scopedByName.get(nameKey)
      if (!current || businessPriority(item.business_id, businessId) < businessPriority(current.business_id, businessId)) {
        scopedByName.set(nameKey, item)
      }
    }

    const dedupedRows = Array.from(scopedByName.values())
    const linkedProductIds = Array.from(
      new Set(dedupedRows.map((item) => String(item.linked_product_id ?? '').trim()).filter(Boolean)),
    )
    const linkedProductNameById = new Map<string, string>()
    if (linkedProductIds.length > 0) {
      const { data: linkedProducts, error: linkedProductsError } = await supabase
        .from('products')
        .select('id, product_name')
        .in('id', linkedProductIds)
      if (!linkedProductsError) {
        for (const product of linkedProducts ?? []) {
          const id = String(product.id ?? '').trim()
          const name = String(product.product_name ?? '').trim()
          if (id && name) linkedProductNameById.set(id, name)
        }
      }
    }

    const allMaterials: Array<Record<string, unknown> & { is_active?: boolean }> = (
      dedupedRows
    ).map((item) => {
      const id = String(item.id ?? '')
      const name = String(item.item_name ?? '')
      const meta = latestMeta.get(id) ?? latestMeta.get(name)
      return {
        ...item,
        food_type_name: meta?.food_type_name ?? null,
        packing_unit: meta?.packing_unit ?? null,
        linked_product_name: linkedProductNameById.get(String(item.linked_product_id ?? '').trim()) ?? null,
      }
    })

    const activeMaterials = allMaterials.filter((item) => item.is_active !== false)
    const inactiveMaterials = allMaterials.filter((item) => item.is_active === false)

    const materials = inactiveOnly ? inactiveMaterials : includeInactive ? allMaterials : activeMaterials

    return NextResponse.json(
      {
        ok: true,
        materials,
        summary: {
          total: allMaterials.length,
          active: activeMaterials.length,
          inactive: inactiveMaterials.length,
        },
      },
      { status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '?먯옱猷?議고쉶 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const itemName = text(body?.item_name)
    const packingWeightG = numberValue(body?.packing_weight_g)
    const ingredientType = text(body?.ingredient_type) || '원재료'
    const linkedProductIdInput = text(body?.linked_product_id) || null
    const businessId = normalizeBusinessId(body?.business_id)

    if (!itemName) {
      return NextResponse.json({ ok: false, error: '원재료명을 입력해 주세요.' }, { status: 400 })
    }

    if (!RAW_MATERIAL_INGREDIENT_TYPES.includes(ingredientType as (typeof RAW_MATERIAL_INGREDIENT_TYPES)[number])) {
      return NextResponse.json({ ok: false, error: '재료유형은 원재료/반제품/제품/반제품/기타만 허용됩니다.' }, { status: 400 })
    }

    const supabase = createMoniServiceRoleClient()
    const linkedProductId = ingredientType === PRODUCT_CATEGORY_SEMIFINISHED ? linkedProductIdInput : null
    if (ingredientType === PRODUCT_CATEGORY_SEMIFINISHED && linkedProductId) {
      await validateLinkedSemifinishedProductId(supabase, linkedProductId)
    }
    const existingRowsResultWithLinked = await supabase
      .from('raw_materials')
      .select('id, item_name, packing_weight_g, current_stock_g, is_active, business_id, linked_product_id')
      .eq('item_name', itemName)
      .or(`business_id.eq.${businessId},business_id.eq.default,business_id.is.null`)
    type ExistingRawMaterialRow = {
      id: string
      item_name: string
      packing_weight_g: number | null
      current_stock_g: number | null
      is_active: boolean | null
      business_id: string | null
      linked_product_id?: string | null
    }
    let existingRows: ExistingRawMaterialRow[] = []
    let existingRowsError = existingRowsResultWithLinked.error
    if (existingRowsResultWithLinked.error && isMissingColumnError(existingRowsResultWithLinked.error.message, 'linked_product_id')) {
      const fallbackExistingRowsResult = await supabase
        .from('raw_materials')
        .select('id, item_name, packing_weight_g, current_stock_g, is_active, business_id')
        .eq('item_name', itemName)
        .or(`business_id.eq.${businessId},business_id.eq.default,business_id.is.null`)
      existingRowsError = fallbackExistingRowsResult.error
      existingRows = (fallbackExistingRowsResult.data ?? []) as ExistingRawMaterialRow[]
    } else {
      existingRows = (existingRowsResultWithLinked.data ?? []) as ExistingRawMaterialRow[]
    }
    if (existingRowsError) throw new Error(existingRowsError.message || '?먯옱猷?議고쉶 ?ㅽ뙣')

    const scopedExistingRows = [...existingRows].sort(
      (a, b) => businessPriority(a.business_id, businessId) - businessPriority(b.business_id, businessId),
    )
    const existingActive = scopedExistingRows.find((row) => row.is_active !== false)
    if (existingActive) {
      return NextResponse.json(
        {
          ok: true,
          status: 'existing_active',
          material: {
            id: existingActive.id,
            item_name: existingActive.item_name,
            packing_weight_g: existingActive.packing_weight_g,
            current_stock_g: existingActive.current_stock_g,
            is_active: existingActive.is_active,
            business_id: existingActive.business_id,
            linked_product_id: existingActive.linked_product_id ?? null,
          },
        },
        { status: 200 },
      )
    }

    const existingInactive = scopedExistingRows.find((row) => row.is_active === false)
    if (existingInactive) {
      return NextResponse.json(
        {
          ok: false,
          status: 'existing_inactive',
          error: '?숈씪???대쫫??鍮꾪솢???먯옱猷뚭? ?덉뒿?덈떎. ?먯옱猷?愿由ъ뿉???쒖꽦?????ъ슜?섏꽭??',
        },
        { status: 409 },
      )
    }

    const id = makeRawMaterialId()
    const payload = {
      id,
      item_name: itemName,
      item_code: id,
      ingredient_type: ingredientType,
      linked_product_id: linkedProductId,
      packing_weight_g: packingWeightG,
      current_stock_g: 0,
      is_active: true,
      business_id: businessId,
    }

    let insertResult = await supabase
      .from('raw_materials')
      .insert(payload)
      .select('id, item_name, packing_weight_g, current_stock_g, is_active, business_id, linked_product_id')
      .single()
    if (insertResult.error && isMissingColumnError(insertResult.error.message, 'linked_product_id')) {
      const fallbackPayload: Record<string, unknown> = { ...payload }
      delete fallbackPayload.linked_product_id
      insertResult = await supabase
        .from('raw_materials')
        .insert(fallbackPayload)
        .select('id, item_name, packing_weight_g, current_stock_g, is_active, business_id')
        .single()
    }
    const { data, error } = insertResult
    if (error) throw new Error(error.message || '?먯옱猷??깅줉 ?ㅽ뙣')

    return NextResponse.json({ ok: true, status: 'created', material: data }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '?먯옱猷??깅줉 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

