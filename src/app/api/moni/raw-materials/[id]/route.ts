import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const RAW_MATERIAL_INGREDIENT_TYPES = ['원재료', '반제품', '제품/반제품', '기타'] as const
const PRODUCT_CATEGORY_SEMIFINISHED = '반제품'

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
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

function boolValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const lowered = value.toLowerCase()
    if (lowered === 'true' || lowered === '1' || lowered === 'y') return true
    if (lowered === 'false' || lowered === '0' || lowered === 'n') return false
  }
  return null
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function isMissingColumnError(message: string, columnName: string): boolean {
  const text = message.toLowerCase()
  const column = columnName.toLowerCase()
  return text.includes(column) && (text.includes('does not exist') || text.includes('schema cache') || text.includes('column'))
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

type MappingRow = {
  id: string
  raw_material_name: string | null
  business_id: string | null
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = String(params.id ?? '').trim()
    if (!id) {
      return NextResponse.json({ ok: false, error: '원재료 id가 필요합니다.' }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    }

    const isActive = boolValue(body.is_active)
    const ingredientTypeRaw = text(body.ingredient_type)
    const ingredientType =
      ingredientTypeRaw && RAW_MATERIAL_INGREDIENT_TYPES.includes(ingredientTypeRaw as (typeof RAW_MATERIAL_INGREDIENT_TYPES)[number])
        ? ingredientTypeRaw
        : ingredientTypeRaw === null
          ? null
          : '__INVALID__'
    if (ingredientType === '__INVALID__') {
      return NextResponse.json({ ok: false, error: '재료유형은 원재료/반제품/제품/반제품/기타만 허용됩니다.' }, { status: 400 })
    }
    const hasLinkedProductField = Object.prototype.hasOwnProperty.call(body, 'linked_product_id')
    const linkedProductIdInput = hasLinkedProductField ? text(body.linked_product_id) : undefined
    const payload: Record<string, unknown> = {
      item_name: text(body.item_name),
      ingredient_type: ingredientType,
      food_type: text(body.food_type),
      country_of_origin: text(body.country_of_origin),
      spec: text(body.spec),
      storage_type: text(body.storage_type),
      shelf_life_days: numberValue(body.shelf_life_days),
      supplier: text(body.supplier),
      supplier_contact: text(body.supplier_contact),
      supplier_address: text(body.supplier_address),
      supplier_biz_number: text(body.supplier_biz_number),
      ...(isActive === null ? {} : { is_active: isActive }),
    }

    const supabase = createMoniServiceRoleClient()

    let beforeRowResult = await supabase
      .from('raw_materials')
      .select('id, item_name, business_id, ingredient_type, linked_product_id')
      .eq('id', id)
      .maybeSingle()
    if (beforeRowResult.error && isMissingColumnError(beforeRowResult.error.message, 'linked_product_id')) {
      beforeRowResult = await supabase
        .from('raw_materials')
        .select('id, item_name, business_id, ingredient_type')
        .eq('id', id)
        .maybeSingle()
    }
    const { data: beforeRow, error: beforeError } = beforeRowResult
    if (beforeError) throw new Error(beforeError.message || '?먯옱猷?議고쉶 ?ㅽ뙣')
    if (!beforeRow) {
      return NextResponse.json({ ok: false, error: '?먯옱猷뚮? 李얠쓣 ???놁뒿?덈떎.' }, { status: 404 })
    }

    const effectiveIngredientType = ingredientType ?? text(beforeRow.ingredient_type) ?? '원재료'
    let linkedProductId: string | null | undefined
    if (effectiveIngredientType === PRODUCT_CATEGORY_SEMIFINISHED) {
      if (linkedProductIdInput === undefined) {
        linkedProductId = text(beforeRow.linked_product_id)
      } else {
        linkedProductId = linkedProductIdInput
      }
      if (linkedProductId) {
        await validateLinkedSemifinishedProductId(supabase, linkedProductId)
      }
    } else {
      linkedProductId = null
    }
    if (linkedProductId !== undefined) {
      payload.linked_product_id = linkedProductId
    }

    const oldName = text(beforeRow.item_name) ?? ''
    const businessId = text(beforeRow.business_id)

    let updateResult = await supabase.from('raw_materials').update(payload).eq('id', id).select('*').maybeSingle()
    if (updateResult.error && isMissingColumnError(updateResult.error.message, 'linked_product_id')) {
      const fallbackPayload: Record<string, unknown> = { ...payload }
      delete fallbackPayload.linked_product_id
      updateResult = await supabase.from('raw_materials').update(fallbackPayload).eq('id', id).select('*').maybeSingle()
    }
    const { data, error } = updateResult
    if (error) throw new Error(error.message || '?먯옱猷??섏젙 ?ㅽ뙣')
    if (!data) {
      return NextResponse.json({ ok: false, error: '?먯옱猷뚮? 李얠쓣 ???놁뒿?덈떎.' }, { status: 404 })
    }

    const newName = text(data.item_name) ?? ''
    const oldKey = normalizeName(oldName)
    const newKey = normalizeName(newName)
    const shouldSyncMapping = oldKey.length > 0 && newKey.length > 0 && oldKey !== newKey

    if (shouldSyncMapping) {
      const { error: refMappingError } = await supabase
        .from('raw_material_mapping')
        .update({ raw_material_name: newName })
        .eq('raw_material_ref_id', id)
      if (refMappingError && !isMissingColumnError(refMappingError.message, 'raw_material_ref_id')) {
        throw new Error(refMappingError.message || '?癒?삺???怨뚭퍙筌?揶쏄퉮????쎈솭')
      }

      const candidates: MappingRow[] = []
      if (businessId) {
        const [sameBusinessResult, nullBusinessResult] = await Promise.all([
          supabase
            .from('raw_material_mapping')
            .select('id, raw_material_name, business_id')
            .eq('business_id', businessId),
          supabase
            .from('raw_material_mapping')
            .select('id, raw_material_name, business_id')
            .is('business_id', null),
        ])
        if (sameBusinessResult.error) throw new Error(sameBusinessResult.error.message || '?먯옱猷??곌껐 議고쉶 ?ㅽ뙣')
        if (nullBusinessResult.error) throw new Error(nullBusinessResult.error.message || '?먯옱猷??곌껐 議고쉶 ?ㅽ뙣')
        candidates.push(...((sameBusinessResult.data ?? []) as MappingRow[]), ...((nullBusinessResult.data ?? []) as MappingRow[]))
      } else {
        const { data: nullBusinessRows, error: nullBusinessError } = await supabase
          .from('raw_material_mapping')
          .select('id, raw_material_name, business_id')
          .is('business_id', null)
        if (nullBusinessError) throw new Error(nullBusinessError.message || '?먯옱猷??곌껐 議고쉶 ?ㅽ뙣')
        candidates.push(...((nullBusinessRows ?? []) as MappingRow[]))
      }

      const mappingIds = Array.from(
        new Set(
          candidates
            .filter((row) => normalizeName(row.raw_material_name ?? '') === oldKey)
            .map((row) => String(row.id))
            .filter(Boolean),
        ),
      )

      if (mappingIds.length > 0) {
        const { error: mappingError } = await supabase
          .from('raw_material_mapping')
          .update({ raw_material_name: newName })
          .in('id', mappingIds)
        if (mappingError) throw new Error(mappingError.message || '?먯옱猷??곌껐紐?媛깆떊 ?ㅽ뙣')
      }
    }

    return NextResponse.json({ ok: true, material: data }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '?먯옱猷??섏젙 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

