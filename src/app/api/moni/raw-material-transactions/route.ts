import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type TxRow = Record<string, unknown>

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeType(value: string): '입고' | '소모' {
  const raw = value.toUpperCase()
  if (raw.includes('INBOUND') || raw.includes('입고')) return '입고'
  return '소모'
}

function resolveDate(row: TxRow): string {
  return text(row.txn_date) || text(row.created_at) || ''
}

export async function GET(request: NextRequest) {
  try {
    const materialName = text(request.nextUrl.searchParams.get('material_name'))
    const from = text(request.nextUrl.searchParams.get('from'))
    const to = text(request.nextUrl.searchParams.get('to'))

    if (!materialName) {
      return NextResponse.json({ ok: false, error: 'material_name 파라미터가 필요합니다.' }, { status: 400 })
    }

    const supabase = createMoniServiceRoleClient()
    let query = supabase
      .from('raw_material_transactions')
      .select('*')
      .or(`raw_material_name.ilike.%${materialName}%,item_name.ilike.%${materialName}%`)
      .order('txn_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (from) query = query.gte('txn_date', from)
    if (to) query = query.lte('txn_date', to)

    const { data, error } = await query
    if (error) throw new Error(error.message || '원재료 거래내역 조회에 실패했습니다.')

    let runningBalance = 0
    const rows = ((data ?? []) as TxRow[]).map((row) => {
      const qtyG = numberValue(row.quantity_g ?? row.quantity ?? 0)
      const txType = normalizeType(text(row.txn_type))
      const inboundG = txType === '입고' ? qtyG : 0
      const outboundG = txType === '소모' ? qtyG : 0
      runningBalance += inboundG - outboundG
      const note = text(row.note)
      const useTarget =
        txType === '입고'
          ? text(row.supplier) || '입고'
          : note.includes('production_record_id=') || note.includes('lot_number=')
            ? note
            : '생산소모'

      return {
        id: text(row.id),
        tx_date: resolveDate(row),
        tx_type: txType,
        counterparty: useTarget,
        inbound_g: inboundG,
        outbound_g: outboundG,
        balance_g: numberValue(row.total_quantity_g) || runningBalance,
        note,
      }
    })

    return NextResponse.json(
      {
        ok: true,
        material_name: materialName,
        balance_mode: 'period_cumulative',
        rows,
      },
      { status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '원재료 거래내역 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
