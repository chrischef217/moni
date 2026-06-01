import { NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type OverviewRow = {
  happenedAt: Date
  dateLabel: string
  productName: string
  quantity: number
  status: string
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function kstDateKey(date: Date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(date)
}

function toStatusBucket(statusRaw: string): 'completed' | 'inProgress' | 'scheduled' {
  const status = statusRaw.toLowerCase()
  if (status === 'completed' || status === 'confirmed' || status === '완료') return 'completed'
  if (status === 'in_progress' || status === 'inprogress' || status === '진행중') return 'inProgress'
  return 'scheduled'
}

function isCancelledStatus(statusRaw: string) {
  const status = statusRaw.toLowerCase()
  return status === 'cancelled' || status === 'canceled' || status === '취소'
}

function formatStatus(statusRaw: string) {
  const bucket = toStatusBucket(statusRaw)
  if (bucket === 'completed') return '완료'
  if (bucket === 'inProgress') return '진행중'
  return '예정'
}

function parseProductionRecordRow(row: Record<string, unknown>): OverviewRow {
  const workDate = toText(row.work_date)
  const createdAt = toText(row.created_at)
  const dateSource = workDate || createdAt || new Date().toISOString()
  const happenedAt = new Date(dateSource)

  return {
    happenedAt,
    dateLabel: kstDateKey(happenedAt),
    productName: toText(row.product_name) || toText(row.product_id) || '제품명 없음',
    quantity: toNumber(row.actual_quantity_g),
    status: toText(row.status) || '완료',
  }
}

function parseLegacyProductionRow(row: Record<string, unknown>): OverviewRow {
  const workDate = toText(row.work_date)
  const createdAt = toText(row.created_at)
  const dateSource = workDate || createdAt || new Date().toISOString()
  const happenedAt = new Date(dateSource)

  return {
    happenedAt,
    dateLabel: kstDateKey(happenedAt),
    productName: toText(row.product_name) || toText(row.product_code) || '제품명 없음',
    quantity: toNumber(row.quantity_ok_g),
    status: toText(row.status) || 'completed',
  }
}

function parseLegacyBatchRow(row: Record<string, unknown>): OverviewRow {
  const startedAt = toText(row.started_at)
  const createdAt = toText(row.created_at)
  const dateSource = startedAt || createdAt || new Date().toISOString()
  const happenedAt = new Date(dateSource)

  return {
    happenedAt,
    dateLabel: kstDateKey(happenedAt),
    productName: toText(row.product_name) || toText(row.batch_code) || '제품명 없음',
    quantity: toNumber(row.actual_quantity_kg),
    status: toText(row.status) || 'draft',
  }
}

export async function GET() {
  try {
    const supabase = createMoniServiceRoleClient()

    let sourceTable: 'production_records' | 'productions' | 'production_batches' = 'production_records'
    let rows: OverviewRow[] = []

    const recordsQuery = await supabase
      .from('production_records')
      .select('*')
      .order('work_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200)

    if (!recordsQuery.error) {
      rows = ((recordsQuery.data as Record<string, unknown>[] | null) ?? []).map(parseProductionRecordRow)
    } else {
      const productionQuery = await supabase
        .from('productions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)

      if (!productionQuery.error) {
        sourceTable = 'productions'
        rows = ((productionQuery.data as Record<string, unknown>[] | null) ?? []).map(parseLegacyProductionRow)
      } else {
        const batchQuery = await supabase
          .from('production_batches')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200)

        if (batchQuery.error) {
          throw new Error(
            batchQuery.error.message ||
              productionQuery.error.message ||
              recordsQuery.error.message ||
              '생산 데이터를 불러올 수 없습니다.',
          )
        }

        sourceTable = 'production_batches'
        rows = ((batchQuery.data as Record<string, unknown>[] | null) ?? []).map(parseLegacyBatchRow)
      }
    }

    const activeRows = rows.filter((row) => !isCancelledStatus(row.status))
    const todayKey = kstDateKey(new Date())
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)

    const todayRows = activeRows.filter((row) => row.dateLabel === todayKey)
    const todayProducts = Array.from(new Set(todayRows.map((row) => row.productName)))

    const todaySummary = todayRows.reduce(
      (acc, row) => {
        acc.totalQuantity += row.quantity
        acc.statusCounts[toStatusBucket(row.status)] += 1
        return acc
      },
      {
        totalQuantity: 0,
        statusCounts: {
          completed: 0,
          inProgress: 0,
          scheduled: 0,
        },
      },
    )

    const recentRows = activeRows
      .filter((row) => row.happenedAt >= sevenDaysAgo)
      .sort((a, b) => b.happenedAt.getTime() - a.happenedAt.getTime())
      .map((row) => ({
        date: row.dateLabel,
        productName: row.productName,
        quantity: row.quantity,
        status: formatStatus(row.status),
      }))

    return NextResponse.json(
      {
        ok: true,
        sourceTable,
        today: {
          products: todayProducts,
          totalQuantity: todaySummary.totalQuantity,
          statusCounts: todaySummary.statusCounts,
        },
        recentRows,
      },
      { status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '생산 개요 데이터를 불러오는 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
