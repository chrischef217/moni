import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

export async function GET(request: NextRequest) {
  try {
    const includeInactive = ['1', 'true', 'all'].includes(
      String(request.nextUrl.searchParams.get('include_inactive') ?? '').toLowerCase(),
    )
    const status = String(request.nextUrl.searchParams.get('status') ?? '').toLowerCase()
    const inactiveOnly = status === 'inactive'

    const supabase = createMoniServiceRoleClient()
    const [materialsResult, transactionsResult] = await Promise.all([
      supabase.from('raw_materials').select('*').order('item_name', { ascending: true }),
      supabase
        .from('raw_material_transactions')
        .select('raw_material_id, raw_material_name, food_type_name, packing_unit, created_at')
        .order('created_at', { ascending: false })
        .limit(1000),
    ])

    if (materialsResult.error) throw new Error(materialsResult.error.message || '원재료 조회 실패')

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

    const allMaterials: Array<Record<string, unknown> & { is_active?: boolean }> = (
      (materialsResult.data ?? []) as Array<Record<string, unknown>>
    ).map((item) => {
      const id = String(item.id ?? '')
      const name = String(item.item_name ?? '')
      const meta = latestMeta.get(id) ?? latestMeta.get(name)
      return {
        ...item,
        food_type_name: meta?.food_type_name ?? null,
        packing_unit: meta?.packing_unit ?? null,
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
    const message = error instanceof Error ? error.message : '원재료 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const itemName = text(body?.item_name)
    const packingWeightG = numberValue(body?.packing_weight_g)

    if (!itemName) {
      return NextResponse.json({ ok: false, error: '원재료명을 입력해 주세요.' }, { status: 400 })
    }

    const supabase = createMoniServiceRoleClient()
    const { data: existingRows, error: findError } = await supabase
      .from('raw_materials')
      .select('id, item_name, packing_weight_g, current_stock_g, is_active')
      .eq('item_name', itemName)
    if (findError) throw new Error(findError.message || '원재료 조회 실패')

    const existingActive = (existingRows ?? []).find((row) => row.is_active !== false)
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
          },
        },
        { status: 200 },
      )
    }

    const existingInactive = (existingRows ?? []).find((row) => row.is_active === false)
    if (existingInactive) {
      return NextResponse.json(
        {
          ok: false,
          status: 'existing_inactive',
          error: '동일한 이름의 비활성 원재료가 있습니다. 원재료 관리에서 활성화 후 사용하세요.',
        },
        { status: 409 },
      )
    }

    const id = makeRawMaterialId()
    const payload = {
      id,
      item_name: itemName,
      item_code: id,
      packing_weight_g: packingWeightG,
      current_stock_g: 0,
      is_active: true,
      business_id: text(body?.business_id) || 'default',
    }

    const { data, error } = await supabase
      .from('raw_materials')
      .insert(payload)
      .select('id, item_name, packing_weight_g, current_stock_g')
      .single()
    if (error) throw new Error(error.message || '원재료 등록 실패')

    return NextResponse.json({ ok: true, status: 'created', material: data }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '원재료 등록 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
