import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const RECONCILIATION_MARKER = 'MONI_STOCK_RECONCILIATION'

const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const positiveNumber = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return { session: null, response: NextResponse.json({ ok: false, error: '인증이 필요합니다.' }, { status: 401 }) }
  if (session.role !== 'admin') return { session: null, response: NextResponse.json({ ok: false, error: '관리자만 원재료 업무 정보를 조회할 수 있습니다.' }, { status: 403 }) }
  return { session, response: null }
}

function supplierNames(value: unknown) {
  return text(value, 600)
    .split(/[,/|]/)
    .map((name) => name.trim())
    .filter(Boolean)
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (auth.response || !auth.session) return auth.response!

  try {
    const supabase = createMoniServiceRoleClient()
    const { data: materials, error: materialError } = await supabase
      .from('raw_materials')
      .select('id,item_code,item_name,supplier,packing_weight_g,unit_price_per_kg,box_quantity,current_stock_g,is_active,is_stock_managed,country_of_origin,food_type,spec,storage_type,shelf_life_days')
      .eq('business_id', BUSINESS_ID)
      .eq('is_active', true)
      .order('item_name', { ascending: true })
      .limit(1000)
    if (materialError) throw new Error(`원재료 전체 목록 조회 실패: ${materialError.message}`)

    const rows = materials ?? []
    const ids = rows.map((row: any) => text(row.id, 180)).filter(Boolean)
    let recentTransactions: any[] = []
    if (ids.length) {
      const { data, error } = await supabase
        .from('raw_material_transactions')
        .select('item_code,supplier,packing_weight_g,quantity_packs,unit_price,txn_date,created_at,note')
        .eq('business_id', BUSINESS_ID)
        .eq('txn_type', 'INBOUND')
        .in('item_code', ids)
        .order('txn_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1000)
      if (error) throw new Error(`원재료 최근 입고정보 조회 실패: ${error.message}`)
      recentTransactions = (data ?? []).filter((row: any) => !text(row.note, 3000).toUpperCase().includes(RECONCILIATION_MARKER))
    }

    const historyByMaterial = new Map<string, any[]>()
    for (const row of recentTransactions) {
      const id = text(row.item_code, 180)
      if (!id) continue
      const list = historyByMaterial.get(id) || []
      list.push(row)
      historyByMaterial.set(id, list)
    }

    const catalog = rows.map((material: any) => {
      const history = historyByMaterial.get(text(material.id, 180)) || []
      const supplierMap = new Map<string, { name: string; source: string; count: number; last_date: string | null }>()

      for (const name of supplierNames(material.supplier)) {
        supplierMap.set(name, { name, source: '원재료 마스터', count: 0, last_date: null })
      }
      for (const row of history) {
        const name = text(row.supplier, 240)
        if (!name) continue
        const current = supplierMap.get(name) || { name, source: '최근 정상 입고 이력', count: 0, last_date: null }
        current.count += 1
        current.source = current.source === '원재료 마스터' ? '원재료 마스터 · 최근 정상 입고' : '최근 정상 입고 이력'
        if (!current.last_date) current.last_date = text(row.txn_date, 10) || null
        supplierMap.set(name, current)
      }

      const suppliers = [...supplierMap.values()]
        .sort((a, b) => Number(b.source.startsWith('원재료 마스터')) - Number(a.source.startsWith('원재료 마스터')) || b.count - a.count || String(b.last_date || '').localeCompare(String(a.last_date || '')))
        .slice(0, 12)

      const masterPackingWeight = positiveNumber(material.packing_weight_g)
      const recentPackingWeight = history.map((row) => positiveNumber(row.packing_weight_g)).find(Boolean) || null
      const masterUnitPrice = positiveNumber(material.unit_price_per_kg)
      const recentUnitPrice = history.map((row) => positiveNumber(row.unit_price)).find(Boolean) || null

      return {
        id: text(material.id, 180),
        item_code: text(material.item_code, 180) || null,
        name: text(material.item_name, 300),
        is_stock_managed: material.is_stock_managed === true,
        current_stock_g: Number(material.current_stock_g || 0),
        packing_weight_g: masterPackingWeight || recentPackingWeight,
        packing_weight_source: masterPackingWeight ? '원재료 마스터' : recentPackingWeight ? '최근 정상 입고 이력' : null,
        unit_price: masterUnitPrice || recentUnitPrice,
        unit_price_source: masterUnitPrice ? '원재료 마스터 기준 포장 1EA 가격' : recentUnitPrice ? '최근 정상 입고 이력' : null,
        box_quantity: positiveNumber(material.box_quantity),
        suppliers,
        default_supplier: suppliers[0]?.name || '',
        spec: text(material.spec, 300) || null,
        storage_type: text(material.storage_type, 120) || null,
        country_of_origin: text(material.country_of_origin, 120) || null,
        food_type: text(material.food_type, 200) || null,
        shelf_life_days: positiveNumber(material.shelf_life_days),
      }
    })

    return NextResponse.json({
      ok: true,
      count: catalog.length,
      stock_managed_count: catalog.filter((item) => item.is_stock_managed).length,
      materials: catalog,
      policy: {
        actual_inbound_excludes_reconciliation: true,
        reconciliation_marker: RECONCILIATION_MARKER,
        linked_defaults_are_editable_transaction_suggestions: true,
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '원재료 목록을 불러오지 못했습니다.' }, { status: 500 })
  }
}
