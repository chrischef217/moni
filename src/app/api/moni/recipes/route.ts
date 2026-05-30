import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

async function fetchProductAndMaterialOptions() {
  const supabase = createMoniServiceRoleClient()
  const [productsResult, rawMaterialsResult] = await Promise.all([
    supabase.from('products').select('*').order('product_name', { ascending: true }),
    supabase
      .from('raw_materials')
      .select('*')
      .order('item_name', { ascending: true }),
  ])

  if (productsResult.error) throw new Error(productsResult.error.message || '제품 목록 조회 실패')
  if (rawMaterialsResult.error) throw new Error(rawMaterialsResult.error.message || '원료 목록 조회 실패')

  return {
    products: productsResult.data ?? [],
    rawMaterials: rawMaterialsResult.data ?? [],
  }
}

export async function GET(request: NextRequest) {
  try {
    const productId = request.nextUrl.searchParams.get('product_id')?.trim() ?? ''
    const supabase = createMoniServiceRoleClient()
    const options = await fetchProductAndMaterialOptions()

    let query = supabase
      .from('recipes')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (productId) query = query.eq('product_id', productId)

    const { data, error } = await query
    if (error) throw new Error(error.message || '레시피 조회 실패')

    const recipes = data ?? []
    const foodTypeIds = Array.from(new Set(recipes.map((item) => String(item.food_type_id)).filter(Boolean)))
    let mappings: unknown[] = []

    if (foodTypeIds.length > 0) {
      const mappingResult = await supabase
        .from('raw_material_mapping')
        .select('*')
        .in('food_type_id', foodTypeIds)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })
      if (mappingResult.error) throw new Error(mappingResult.error.message || '실제원료 매핑 조회 실패')
      mappings = mappingResult.data ?? []
    }

    return NextResponse.json({ ok: true, recipes, mappings, ...options }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '레시피 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const productId = toText(body?.product_id)
    const productName = toText(body?.product_name)
    const foodTypeId = toText(body?.food_type_id)
    const foodTypeName = toText(body?.food_type_name)
    const ingredientType = toText(body?.ingredient_type) || '원재료'
    const ratioPercent = toNumber(body?.ratio_percent)

    if (!productId || !productName || !foodTypeId || !foodTypeName || ratioPercent === null) {
      return NextResponse.json({ ok: false, error: '제품, 식품유형, 배합비율을 입력해 주세요.' }, { status: 400 })
    }

    const supabase = createMoniServiceRoleClient()
    const payload = {
      product_id: productId,
      product_name: productName,
      food_type_id: foodTypeId,
      food_type_name: foodTypeName,
      ingredient_type: ingredientType,
      semi_product_id: toText(body?.semi_product_id) || null,
      ratio_percent: ratioPercent,
      sort_order: toNumber(body?.sort_order) ?? 0,
      is_active: typeof body?.is_active === 'boolean' ? body.is_active : true,
      business_id: toText(body?.business_id) || 'default',
    }

    const { data, error } = await supabase.from('recipes').insert(payload).select('*').single()
    if (error) throw new Error(error.message || '레시피 저장 실패')

    return NextResponse.json({ ok: true, recipe: data }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '레시피 저장 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')?.trim() ?? ''
    if (!id) {
      return NextResponse.json({ ok: false, error: '삭제할 레시피 id가 필요합니다.' }, { status: 400 })
    }

    const supabase = createMoniServiceRoleClient()
    const { error } = await supabase.from('recipes').delete().eq('id', id)
    if (error) throw new Error(error.message || '레시피 삭제 실패')

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '레시피 삭제 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
