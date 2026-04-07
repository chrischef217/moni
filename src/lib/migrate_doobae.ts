/**
 * DOOBAE 시스템 → Supabase 데이터 이전 로직
 * /api/migrate 에서 한 번 실행
 * INSERT ... ON CONFLICT DO NOTHING 으로 중복 방지
 */
import { supabase } from './supabase'
import { DOOBAE_DATA } from './doobae_data'

export interface MigrateResult {
  products: number
  raw_materials: number
  productions: number
  packaging_materials: number
  errors: string[]
}

export async function migrateDoobaeData(): Promise<MigrateResult> {
  const result: MigrateResult = {
    products: 0,
    raw_materials: 0,
    productions: 0,
    packaging_materials: 0,
    errors: [],
  }

  // ── 1. 제품 이전 ──────────────────────────────────────────
  try {
    const rows = DOOBAE_DATA.products.map((p) => ({
      id: p.id,
      product_name: p.product_name,
      product_code: p.product_code,
      product_type: p.product_type,
      weight_g: p.weight_g,
      storage_method: p.storage_method,
      shelf_life: p.shelf_life,
      report_number: p.report_number ?? '',
      is_active: p.is_active,
      business_id: 'default',
    }))

    const { error } = await supabase
      .from('products')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: true })

    if (error) {
      result.errors.push(`products: ${error.message}`)
    } else {
      result.products = rows.length
    }
  } catch (e) {
    result.errors.push(`products 예외: ${String(e)}`)
  }

  // ── 2. 원료 이전 ──────────────────────────────────────────
  try {
    const rows = DOOBAE_DATA.raw_materials.map((m) => ({
      id: m.id,
      item_name: m.item_name,
      item_code: m.item_code,
      supplier: m.supplier ?? '',
      unit_price_per_kg: m.unit_price_per_kg ?? 0,
      current_stock_g: m.current_stock_g ?? 0,
      is_active: m.is_active,
      business_id: 'default',
    }))

    const { error } = await supabase
      .from('raw_materials')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: true })

    if (error) {
      result.errors.push(`raw_materials: ${error.message}`)
    } else {
      result.raw_materials = rows.length
    }
  } catch (e) {
    result.errors.push(`raw_materials 예외: ${String(e)}`)
  }

  // ── 3. 생산 실적 이전 ─────────────────────────────────────
  try {
    const rows = DOOBAE_DATA.productions.map((p) => ({
      id: p.id,
      work_date: p.work_date,
      product_code: p.product_code,
      product_name: p.product_name,
      requested_quantity_g: p.requested_quantity_g ?? 0,
      quantity_ok_g: p.quantity_ok_g ?? 0,
      quantity_ng_g: p.quantity_ng_g ?? 0,
      sample_quantity_g: 0,
      start_time: p.start_time ?? '',
      end_time: p.end_time ?? '',
      note: p.note ?? '',
      status: p.status ?? 'completed',
      business_id: 'default',
    }))

    const { error } = await supabase
      .from('productions')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: true })

    if (error) {
      result.errors.push(`productions: ${error.message}`)
    } else {
      result.productions = rows.length
    }
  } catch (e) {
    result.errors.push(`productions 예외: ${String(e)}`)
  }

  // ── 4. 포장재 이전 ────────────────────────────────────────
  try {
    const rows = DOOBAE_DATA.packaging_materials.map((m) => ({
      id: m.id,
      material_name: m.material_name,
      material_code: m.material_code,
      spec: m.spec ?? '',
      material_type: m.material_type ?? '',
      supplier: m.supplier ?? '',
      unit_price: m.unit_price ?? 0,
      current_stock: m.current_stock ?? 0,
      is_active: m.is_active,
      business_id: 'default',
    }))

    const { error } = await supabase
      .from('packaging_materials')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: true })

    if (error) {
      result.errors.push(`packaging_materials: ${error.message}`)
    } else {
      result.packaging_materials = rows.length
    }
  } catch (e) {
    result.errors.push(`packaging_materials 예외: ${String(e)}`)
  }

  return result
}
