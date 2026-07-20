import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TRANSACTION_PAGE_SIZE = 1000
const MAX_TRANSACTION_PAGES = 100

type TxRow = Record<string, unknown>

type MaterialMasterRow = {
  id?: string | number | null
  item_code?: string | number | null
  item_name?: string | null
  country_of_origin?: string | null
}

type MaterialDisplayMeta = {
  id: string
  itemCode: string
  name: string
  displayName: string
}

type NormalizedLedgerRow = {
  sourceIndex: number
  stableKey: string
  id: string
  materialId: string
  itemCode: string
  materialName: string
  materialKey: string
  txDate: string
  txTypeCode: 'INBOUND' | 'OUTBOUND'
  txType: '입고' | '소모'
  quantityRawG: number
  counterparty: string
  note: string
  auditNote: string
  searchText: string
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function normalizeTypeCode(value: string): 'INBOUND' | 'OUTBOUND' {
  const raw = value.trim().toUpperCase()
  if (raw === 'INBOUND' || raw.includes('입고')) return 'INBOUND'
  if (raw === 'OUTBOUND' || raw.includes('소모') || raw.includes('출고')) return 'OUTBOUND'
  return 'OUTBOUND'
}

function normalizeTypeLabel(typeCode: 'INBOUND' | 'OUTBOUND'): '입고' | '소모' {
  return typeCode === 'INBOUND' ? '입고' : '소모'
}

function normalizeLookup(value: unknown): string {
  return text(value).toLowerCase().replace(/\s+/g, ' ')
}

function parseLedgerMetadata(note: string): Record<string, string> {
  const metadata: Record<string, string> = {}
  for (const segment of note.split(';')) {
    const separatorIndex = segment.indexOf('=')
    if (separatorIndex <= 0) continue
    const key = segment.slice(0, separatorIndex).trim()
    const value = segment.slice(separatorIndex + 1).trim()
    if (key && value) metadata[key] = value
  }
  return metadata
}

function resolveDate(row: TxRow): string {
  return text(row.txn_date) || text(row.transaction_date) || text(row.created_at) || ''
}

function resolveTransactionMaterialRef(row: TxRow): string {
  return text(row.item_code) || text(row.raw_material_id)
}

function resolveQuantityG(row: TxRow): number {
  return Math.max(0, numberValue(row.total_weight_g ?? row.quantity_g ?? row.quantity ?? 0))
}

function buildMaterialDisplayMap(rows: MaterialMasterRow[]): Map<string, MaterialDisplayMeta> {
  const materials = rows
    .map((material) => {
      const id = text(material.id)
      const itemCode = text(material.item_code)
      const name = text(material.item_name) || id || itemCode
      return {
        id,
        itemCode,
        name,
        origin: text(material.country_of_origin),
      }
    })
    .filter((material) => material.id && material.name)

  const baseNameCounts = new Map<string, number>()
  for (const material of materials) {
    const key = normalizeLookup(material.name)
    baseNameCounts.set(key, (baseNameCounts.get(key) ?? 0) + 1)
  }

  const provisional = materials.map((material) => {
    const duplicateBaseName = (baseNameCounts.get(normalizeLookup(material.name)) ?? 0) > 1
    const displayName = duplicateBaseName && material.origin ? `${material.name} (${material.origin})` : material.name
    return { ...material, displayName }
  })

  const displayNameCounts = new Map<string, number>()
  for (const material of provisional) {
    const key = normalizeLookup(material.displayName)
    displayNameCounts.set(key, (displayNameCounts.get(key) ?? 0) + 1)
  }

  const result = new Map<string, MaterialDisplayMeta>()
  for (const material of provisional) {
    const duplicateDisplayName = (displayNameCounts.get(normalizeLookup(material.displayName)) ?? 0) > 1
    const meta: MaterialDisplayMeta = {
      id: material.id,
      itemCode: material.itemCode,
      name: material.name,
      displayName: duplicateDisplayName ? `${material.displayName} [${material.id}]` : material.displayName,
    }
    result.set(material.id, meta)
    if (material.itemCode) result.set(material.itemCode, meta)
  }

  return result
}

function sumAccurately(values: number[]): number {
  let sum = 0
  let compensation = 0

  for (const value of values) {
    const adjusted = value - compensation
    const next = sum + adjusted
    compensation = next - sum - adjusted
    sum = next
  }

  return sum
}

function allocateBalancedIntegerGrams(rows: NormalizedLedgerRow[]): Map<number, number> {
  const grouped = new Map<string, NormalizedLedgerRow[]>()

  for (const row of rows) {
    const groupKey = `${row.materialKey}|${row.txTypeCode}`
    const group = grouped.get(groupKey) ?? []
    group.push(row)
    grouped.set(groupKey, group)
  }

  const result = new Map<number, number>()

  for (const group of Array.from(grouped.values())) {
    const entries = group.map((row) => {
      const safeQuantity = Number.isFinite(row.quantityRawG) && row.quantityRawG > 0 ? row.quantityRawG : 0
      const floorG = Math.floor(safeQuantity)
      return {
        row,
        floorG,
        remainder: safeQuantity - floorG,
      }
    })

    const exactTotal = sumAccurately(entries.map((entry) => entry.row.quantityRawG))
    const roundedTotal = Math.round(exactTotal)
    const floorTotal = entries.reduce((sum, entry) => sum + entry.floorG, 0)
    const distributable = Math.max(0, Math.min(entries.length, roundedTotal - floorTotal))

    const ranked = [...entries].sort((a, b) => {
      const remainderDiff = b.remainder - a.remainder
      if (Math.abs(remainderDiff) > Number.EPSILON) return remainderDiff
      return a.row.stableKey.localeCompare(b.row.stableKey)
    })

    const incremented = new Set(ranked.slice(0, distributable).map((entry) => entry.row.sourceIndex))
    for (const entry of entries) {
      result.set(entry.row.sourceIndex, entry.floorG + (incremented.has(entry.row.sourceIndex) ? 1 : 0))
    }
  }

  return result
}

function parsePositiveIntegerGram(quantityValue: unknown, unitValue: unknown): number | null {
  const quantity = nullableNumber(quantityValue)
  if (quantity === null || quantity <= 0) return null

  const unit = text(unitValue).toLowerCase() === 'kg' ? 'kg' : 'g'
  const rawGram = unit === 'kg' ? quantity * 1000 : quantity
  const roundedGram = Math.round(rawGram)
  if (!Number.isFinite(rawGram) || roundedGram <= 0 || Math.abs(rawGram - roundedGram) > 1e-9) return null
  return roundedGram
}

function isInbound(txType: string) {
  return normalizeTypeCode(txType) === 'INBOUND'
}

export async function GET(request: NextRequest) {
  try {
    const materialId = text(request.nextUrl.searchParams.get('material_id'))
    const materialName = text(request.nextUrl.searchParams.get('material_name'))
    const from = text(request.nextUrl.searchParams.get('from'))
    const to = text(request.nextUrl.searchParams.get('to'))

    const supabase = createMoniServiceRoleClient()
    const transactionRows: TxRow[] = []
    let pageCount = 0

    for (let offset = 0; pageCount < MAX_TRANSACTION_PAGES; offset += TRANSACTION_PAGE_SIZE) {
      let pageQuery = supabase
        .from('raw_material_transactions')
        .select('*')
        .order('txn_date', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + TRANSACTION_PAGE_SIZE - 1)

      if (from) pageQuery = pageQuery.gte('txn_date', from)
      if (to) pageQuery = pageQuery.lte('txn_date', to)

      const { data, error } = await pageQuery
      if (error) throw new Error(error.message || '원재료 거래내역 조회에 실패했습니다.')

      const pageRows = (data ?? []) as TxRow[]
      transactionRows.push(...pageRows)
      pageCount += 1

      if (pageRows.length < TRANSACTION_PAGE_SIZE) break
      if (pageCount === MAX_TRANSACTION_PAGES) {
        throw new Error(`원재료 거래내역이 ${MAX_TRANSACTION_PAGES * TRANSACTION_PAGE_SIZE}건을 초과해 전체 조회를 완료하지 못했습니다.`)
      }
    }

    const materialResult = await supabase
      .from('raw_materials')
      .select('id, item_code, item_name, country_of_origin')
    if (materialResult.error) throw new Error(materialResult.error.message || '원재료 마스터 조회에 실패했습니다.')

    const materialByRef = buildMaterialDisplayMap((materialResult.data ?? []) as MaterialMasterRow[])
    const normalizedKeyword = normalizeLookup(materialName)

    const normalizedRows = transactionRows.map((row, sourceIndex): NormalizedLedgerRow => {
      const transactionMaterialRef = resolveTransactionMaterialRef(row)
      const materialMeta = materialByRef.get(transactionMaterialRef)
      const canonicalMaterialId = materialMeta?.id || transactionMaterialRef
      const transactionLabel = text(row.raw_material_name) || text(row.item_name)
      const materialLabel = materialMeta?.displayName || transactionLabel || '원재료명 확인 필요'
      const materialKey = canonicalMaterialId || `name:${normalizeLookup(materialLabel)}`
      const quantityRawG = resolveQuantityG(row)
      const txTypeCode = normalizeTypeCode(text(row.txn_type) || text(row.transaction_type))
      const txType = normalizeTypeLabel(txTypeCode)
      const rawNote = text(row.note)
      const ledgerMetadata = parseLedgerMetadata(rawNote)
      const outboundProductName = ledgerMetadata.product_name || text(row.product_name)
      const outboundLot = ledgerMetadata.lot_number || text(row.lot_number)
      const counterparty =
        txTypeCode === 'INBOUND'
          ? text(row.supplier) || '입고'
          : [outboundProductName || '생산소모', outboundLot ? `LOT ${outboundLot}` : ''].filter(Boolean).join(' · ')
      const note = txTypeCode === 'INBOUND' && !ledgerMetadata.marker ? rawNote : ''
      const itemCode = text(row.item_code) || materialMeta?.itemCode || canonicalMaterialId
      const txDate = resolveDate(row)
      const stableKey = [txDate, text(row.created_at), text(row.id), String(sourceIndex)].join('|')
      const searchText = normalizeLookup(
        [materialMeta?.name, materialLabel, transactionLabel, canonicalMaterialId, itemCode].filter(Boolean).join(' '),
      )

      return {
        sourceIndex,
        stableKey,
        id: text(row.id),
        materialId: canonicalMaterialId,
        itemCode,
        materialName: materialLabel,
        materialKey,
        txDate,
        txTypeCode,
        txType,
        quantityRawG,
        counterparty,
        note,
        auditNote: rawNote,
        searchText,
      }
    })

    const allocatedQuantityByIndex = allocateBalancedIntegerGrams(normalizedRows)
    const runningBalanceByMaterial = new Map<string, number>()

    const allRows = normalizedRows.map((row) => {
      const quantityG = allocatedQuantityByIndex.get(row.sourceIndex) ?? 0
      const inboundG = row.txTypeCode === 'INBOUND' ? quantityG : 0
      const outboundG = row.txTypeCode === 'OUTBOUND' ? quantityG : 0
      const previousBalance = runningBalanceByMaterial.get(row.materialKey) ?? 0
      const nextBalance = previousBalance + inboundG - outboundG
      runningBalanceByMaterial.set(row.materialKey, nextBalance)

      return {
        id: row.id,
        material_id: row.materialId,
        item_code: row.itemCode,
        material_name: row.materialName,
        tx_date: row.txDate,
        tx_type: row.txType,
        tx_type_code: row.txTypeCode,
        counterparty: row.counterparty,
        inbound_g: inboundG,
        outbound_g: outboundG,
        balance_g: nextBalance,
        note: row.note,
        audit_note: row.auditNote,
        search_text: row.searchText,
      }
    })

    const rows = allRows
      .filter((row) => {
        if (materialId && row.material_id !== materialId && row.item_code !== materialId) return false
        if (normalizedKeyword && !row.search_text.includes(normalizedKeyword)) return false
        return true
      })
      .map(({ search_text: _searchText, ...row }) => row)

    return NextResponse.json(
      {
        ok: true,
        material_id: materialId || null,
        material_name: materialName || null,
        balance_mode: 'item_code_full_dataset_cumulative_balanced_integer_display',
        rounding_mode: 'largest_remainder_per_material_and_direction',
        pagination_mode: 'all_rows_range_pagination',
        source_row_count: transactionRows.length,
        page_count: pageCount,
        rows,
      },
      { status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '원재료 거래내역 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })

    const rawMaterialId = text(body.raw_material_id)
    if (!rawMaterialId) return NextResponse.json({ ok: false, error: '원재료를 선택해 주세요.' }, { status: 400 })

    const quantityG = parsePositiveIntegerGram(body.quantity, body.unit)
    if (quantityG === null) {
      return NextResponse.json({ ok: false, error: '입고수량은 g 기준 정수로 입력해 주세요.' }, { status: 400 })
    }

    const txDate = text(body.tx_date) || new Date().toISOString().slice(0, 10)
    const counterparty = text(body.counterparty)
    const note = text(body.note)
    const unitPrice = nullableNumber(body.unit_price)

    const supabase = createMoniServiceRoleClient()
    const materialResult = await supabase
      .from('raw_materials')
      .select('id, item_name, current_stock_g, business_id')
      .eq('id', rawMaterialId)
      .maybeSingle()
    if (materialResult.error) throw new Error(materialResult.error.message || '원재료 조회에 실패했습니다.')
    if (!materialResult.data) return NextResponse.json({ ok: false, error: '선택한 원재료를 찾을 수 없습니다.' }, { status: 404 })

    const material = materialResult.data as {
      id: string
      item_name?: string | null
      current_stock_g?: number | string | null
      business_id?: string | null
    }

    const currentStockG = numberValue(material.current_stock_g)
    const nextStockG = currentStockG + quantityG
    const businessId = text(body.business_id) || text(material.business_id) || 'default'
    const rawMaterialName = text(body.raw_material_name) || text(material.item_name) || rawMaterialId

    const updateResult = await supabase.from('raw_materials').update({ current_stock_g: nextStockG }).eq('id', rawMaterialId)
    if (updateResult.error) throw new Error(updateResult.error.message || '원재료 재고 갱신에 실패했습니다.')

    const txPayload: Record<string, unknown> = {
      id: `RMT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      item_code: rawMaterialId,
      raw_material_name: rawMaterialName,
      item_name: rawMaterialName,
      txn_type: 'INBOUND',
      transaction_type: 'INBOUND',
      quantity_g: quantityG,
      total_weight_g: quantityG,
      txn_date: txDate,
      transaction_date: txDate,
      supplier: counterparty || null,
      unit_price: unitPrice,
      note: note || null,
      business_id: businessId,
    }
    const txResult = await supabase.from('raw_material_transactions').insert(txPayload)
    if (txResult.error) {
      await supabase.from('raw_materials').update({ current_stock_g: currentStockG }).eq('id', rawMaterialId)
      throw new Error(txResult.error.message || '원재료 입고 기록 저장에 실패했습니다.')
    }

    return NextResponse.json(
      {
        ok: true,
        material: {
          id: rawMaterialId,
          item_name: rawMaterialName,
          current_stock_g: Math.round(nextStockG),
        },
      },
      { status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '원재료 입고 등록 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })

    const id = text(body.id)
    if (!id) return NextResponse.json({ ok: false, error: '거래 ID가 필요합니다.' }, { status: 400 })

    const nextQuantityG = parsePositiveIntegerGram(body.quantity, body.unit)
    if (nextQuantityG === null) {
      return NextResponse.json({ ok: false, error: '입고수량은 g 기준 정수로 입력해 주세요.' }, { status: 400 })
    }

    const txDate = text(body.tx_date) || new Date().toISOString().slice(0, 10)
    const counterparty = text(body.counterparty)
    const note = text(body.note)
    const unitPrice = nullableNumber(body.unit_price)

    const supabase = createMoniServiceRoleClient()
    const txResult = await supabase.from('raw_material_transactions').select('*').eq('id', id).maybeSingle()
    if (txResult.error) throw new Error(txResult.error.message || '거래내역 조회에 실패했습니다.')
    if (!txResult.data) return NextResponse.json({ ok: false, error: '내역을 찾을 수 없습니다.' }, { status: 404 })

    const txRow = txResult.data as TxRow
    if (!isInbound(text(txRow.txn_type) || text(txRow.transaction_type))) {
      return NextResponse.json({ ok: false, error: '생산확정으로 생성된 소모 내역은 수정할 수 없습니다.' }, { status: 409 })
    }

    const rawMaterialId = resolveTransactionMaterialRef(txRow)
    if (!rawMaterialId) return NextResponse.json({ ok: false, error: '원재료 연결 정보가 없습니다.' }, { status: 422 })

    const oldQuantityG = resolveQuantityG(txRow)
    const materialResult = await supabase
      .from('raw_materials')
      .select('id, item_name, current_stock_g')
      .eq('id', rawMaterialId)
      .maybeSingle()
    if (materialResult.error) throw new Error(materialResult.error.message || '원재료 조회에 실패했습니다.')
    if (!materialResult.data) return NextResponse.json({ ok: false, error: '연결된 원재료를 찾을 수 없습니다.' }, { status: 404 })

    const material = materialResult.data as {
      id: string
      item_name?: string | null
      current_stock_g?: number | string | null
    }
    const currentStockG = numberValue(material.current_stock_g)
    const nextStockG = currentStockG - oldQuantityG + nextQuantityG
    if (nextStockG < 0) return NextResponse.json({ ok: false, error: '수정 후 현재재고가 0보다 작아집니다.' }, { status: 409 })

    const updateStock = await supabase.from('raw_materials').update({ current_stock_g: nextStockG }).eq('id', rawMaterialId)
    if (updateStock.error) throw new Error(updateStock.error.message || '원재료 재고 갱신에 실패했습니다.')

    const updateTx = await supabase
      .from('raw_material_transactions')
      .update({
        item_code: rawMaterialId,
        item_name: text(material.item_name) || rawMaterialId,
        raw_material_name: text(material.item_name) || rawMaterialId,
        quantity_g: nextQuantityG,
        total_weight_g: nextQuantityG,
        txn_date: txDate,
        transaction_date: txDate,
        supplier: counterparty || null,
        unit_price: unitPrice,
        note: note || null,
      })
      .eq('id', id)
    if (updateTx.error) {
      await supabase.from('raw_materials').update({ current_stock_g: currentStockG }).eq('id', rawMaterialId)
      throw new Error(updateTx.error.message || '원재료 거래내역 수정에 실패했습니다.')
    }

    return NextResponse.json(
      {
        ok: true,
        material: {
          id: material.id,
          item_name: text(material.item_name) || rawMaterialId,
          current_stock_g: Math.round(nextStockG),
        },
      },
      { status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '원재료 거래내역 수정 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = text(request.nextUrl.searchParams.get('id'))
    if (!id) return NextResponse.json({ ok: false, error: '거래 ID가 필요합니다.' }, { status: 400 })

    const supabase = createMoniServiceRoleClient()
    const txResult = await supabase.from('raw_material_transactions').select('*').eq('id', id).maybeSingle()
    if (txResult.error) throw new Error(txResult.error.message || '거래내역 조회에 실패했습니다.')
    if (!txResult.data) return NextResponse.json({ ok: false, error: '내역을 찾을 수 없습니다.' }, { status: 404 })

    const txRow = txResult.data as TxRow
    if (!isInbound(text(txRow.txn_type) || text(txRow.transaction_type))) {
      return NextResponse.json({ ok: false, error: '생산확정으로 생성된 소모 내역은 삭제할 수 없습니다.' }, { status: 409 })
    }

    const rawMaterialId = resolveTransactionMaterialRef(txRow)
    if (!rawMaterialId) return NextResponse.json({ ok: false, error: '원재료 연결 정보가 없습니다.' }, { status: 422 })

    const qtyG = resolveQuantityG(txRow)
    const materialResult = await supabase
      .from('raw_materials')
      .select('id, item_name, current_stock_g')
      .eq('id', rawMaterialId)
      .maybeSingle()
    if (materialResult.error) throw new Error(materialResult.error.message || '원재료 조회에 실패했습니다.')
    if (!materialResult.data) return NextResponse.json({ ok: false, error: '연결된 원재료를 찾을 수 없습니다.' }, { status: 404 })

    const material = materialResult.data as {
      id: string
      item_name?: string | null
      current_stock_g?: number | string | null
    }
    const currentStockG = numberValue(material.current_stock_g)
    const nextStockG = currentStockG - qtyG
    if (nextStockG < 0) return NextResponse.json({ ok: false, error: '현재재고가 부족해 삭제할 수 없습니다.' }, { status: 409 })

    const updateStock = await supabase.from('raw_materials').update({ current_stock_g: nextStockG }).eq('id', rawMaterialId)
    if (updateStock.error) throw new Error(updateStock.error.message || '원재료 재고 갱신에 실패했습니다.')

    const deleteTx = await supabase.from('raw_material_transactions').delete().eq('id', id)
    if (deleteTx.error) {
      await supabase.from('raw_materials').update({ current_stock_g: currentStockG }).eq('id', rawMaterialId)
      throw new Error(deleteTx.error.message || '원재료 거래내역 삭제에 실패했습니다.')
    }

    return NextResponse.json(
      {
        ok: true,
        material: {
          id: material.id,
          item_name: text(material.item_name) || rawMaterialId,
          current_stock_g: Math.round(nextStockG),
        },
      },
      { status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '원재료 거래내역 삭제 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
