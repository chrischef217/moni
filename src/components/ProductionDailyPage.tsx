'use client'

import { useEffect, useMemo, useState } from 'react'

type SemiProductStage = {
  key: string
  product_id: string
  product_name: string
  parent_product_id: string
  parent_product_name: string
  depth: number
  ratio_from_parent: number
  required_g: number
  path: string[]
}

type DailyRecord = {
  id: string
  lot_number: string
  work_date: string
  product_id: string | null
  product_name: string
  planned_quantity_g: number
  actual_quantity_g: number
  defect_quantity_g: number
  sample_quantity_g: number
  status: string | null
  semi_products: SemiProductStage[]
  semi_product_issues: string[]
}

type ProductOption = { id: string; product_name: string }

type DailyPayload = {
  ok?: boolean
  error?: string
  records?: DailyRecord[]
  products?: ProductOption[]
}

function todayKst(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function firstDayOfMonth(dateValue: string): string {
  return `${dateValue.slice(0, 7)}-01`
}

function formatNumber(value: unknown, digits = 0): string {
  const parsed = Number(value ?? 0)
  if (!Number.isFinite(parsed)) return '-'
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(parsed)
}

function formatGram(value: unknown): string {
  return `${formatNumber(Math.round(Number(value ?? 0)))}g`
}

function normalizeStatus(value: unknown): string {
  const raw = String(value ?? '').trim().toLowerCase()
  if (['confirmed', '확정'].includes(raw)) return '확정'
  if (['completed', '완료'].includes(raw)) return '생산완료'
  return String(value ?? '-')
}

export default function ProductionDailyPage() {
  const today = useMemo(() => todayKst(), [])
  const [from, setFrom] = useState(firstDayOfMonth(today))
  const [to, setTo] = useState(today)
  const [productId, setProductId] = useState('')
  const [records, setRecords] = useState<DailyRecord[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'warning'; text: string } | null>(null)

  async function loadRecords() {
    setLoading(true)
    setMessage(null)
    try {
      const params = new URLSearchParams({ from, to })
      if (productId) params.set('product', productId)
      const response = await fetch(`/api/moni/production-daily?${params.toString()}`, { cache: 'no-store' })
      const payload = (await response.json().catch(() => null)) as DailyPayload | null
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || '생산일보를 불러오지 못했습니다.')
      setRecords(payload.records ?? [])
      setProducts(payload.products ?? [])
      setSelectedIds((current) => current.filter((id) => (payload.records ?? []).some((record) => record.id === id)))
    } catch (error) {
      setRecords([])
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : '생산일보 조회에 실패했습니다.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRecords()
    // 최초 진입 시 현재 월을 자동 조회합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const allSelected = records.length > 0 && records.every((record) => selectedIds.includes(record.id))
  const totalPlanned = records.reduce((sum, record) => sum + Number(record.planned_quantity_g ?? 0), 0)
  const totalActual = records.reduce((sum, record) => sum + Number(record.actual_quantity_g ?? 0), 0)
  const semiCount = records.reduce((sum, record) => sum + record.semi_products.length, 0)
  const issueCount = records.reduce((sum, record) => sum + record.semi_product_issues.length, 0)

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? records.map((record) => record.id) : [])
  }

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((current) => checked ? Array.from(new Set([...current, id])) : current.filter((item) => item !== id))
  }

  function openWorkOrder(record: DailyRecord) {
    window.open(`/api/moni/production-records/${record.id}/pdf`, '_blank', 'noopener,noreferrer')
  }

  async function revertCompletion(record: DailyRecord) {
    const confirmed = window.confirm(
      `${record.lot_number}\n\n생산일보에서 되돌리면 작업지시 단계로 복귀합니다. 확정된 기록은 원재료 차감도 함께 복원됩니다. 계속할까요?`,
    )
    if (!confirmed) return

    setBusyId(record.id)
    setMessage(null)
    try {
      const response = await fetch('/api/moni/production-records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revert_completion', record_id: record.id }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(payload?.error || '생산일보 되돌리기에 실패했습니다.')
      setMessage({ tone: 'success', text: `${record.lot_number}을 작업지시 단계로 되돌렸습니다.` })
      await loadRecords()
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : '생산일보 되돌리기에 실패했습니다.' })
    } finally {
      setBusyId(null)
    }
  }

  function printSelected() {
    const selected = records.filter((record) => selectedIds.includes(record.id))
    if (selected.length === 0) {
      setMessage({ tone: 'warning', text: '인쇄할 생산일보를 선택해 주세요.' })
      return
    }

    if (selected.length > 100) {
      setMessage({ tone: 'warning', text: '한 번에 최대 100건까지 인쇄할 수 있습니다.' })
      return
    }

    const params = new URLSearchParams({ ids: selected.map((record) => record.id).join(',') })
    window.location.assign(`/api/moni/production-daily/print?${params.toString()}`)
  }

  const messageClass = message?.tone === 'success'
    ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-200'
    : message?.tone === 'warning'
      ? 'border-amber-700/60 bg-amber-950/40 text-amber-200'
      : 'border-red-800/60 bg-red-950/40 text-red-200'

  return (
    <main className="min-h-screen bg-[#07101f] px-5 py-6 text-white lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">생산일보</h1>
            <p className="mt-1 text-sm text-slate-400">완제품 생산기록 아래에 연결 반제품 제조내역을 동일 LOT 기준으로 자동 표시합니다.</p>
          </div>
          <button
            type="button"
            onClick={printSelected}
            className="rounded-xl border border-emerald-500 bg-emerald-500/10 px-5 py-2.5 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20"
          >
            선택 생산일보 인쇄 / PDF
          </button>
        </div>

        {message ? <div className={`rounded-xl border px-4 py-3 text-sm ${messageClass}`}>{message.text}</div> : null}

        <section className="rounded-2xl border border-slate-700 bg-[#0c192c] p-4">
          <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-5">
            <label className="text-sm text-slate-300">
              <span className="mb-1 block">시작일</span>
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-[#091426] px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-slate-300">
              <span className="mb-1 block">종료일</span>
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-[#091426] px-3 py-2 text-white" />
            </label>
            <label className="text-sm text-slate-300 md:col-span-2 xl:col-span-2">
              <span className="mb-1 block">제품</span>
              <select value={productId} onChange={(event) => setProductId(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-[#091426] px-3 py-2 text-white">
                <option value="">전체 제품</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.product_name}</option>)}
              </select>
            </label>
            <div className="flex items-end">
              <button type="button" onClick={() => void loadRecords()} disabled={loading} className="h-[42px] w-full rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60">
                {loading ? '조회 중...' : '조회'}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-slate-700 bg-[#0c192c] p-4"><p className="text-xs text-slate-400">생산기록</p><p className="mt-1 text-xl font-bold">{formatNumber(records.length)}건</p></div>
          <div className="rounded-2xl border border-slate-700 bg-[#0c192c] p-4"><p className="text-xs text-slate-400">계획량 합계</p><p className="mt-1 text-xl font-bold text-blue-300">{formatGram(totalPlanned)}</p></div>
          <div className="rounded-2xl border border-slate-700 bg-[#0c192c] p-4"><p className="text-xs text-slate-400">완료량 합계</p><p className="mt-1 text-xl font-bold text-emerald-300">{formatGram(totalActual)}</p></div>
          <div className="rounded-2xl border border-slate-700 bg-[#0c192c] p-4"><p className="text-xs text-slate-400">연결 반제품 내역</p><p className="mt-1 text-xl font-bold text-cyan-300">{formatNumber(semiCount)}건</p></div>
          <div className={`rounded-2xl border p-4 ${issueCount > 0 ? 'border-red-700 bg-red-950/30' : 'border-slate-700 bg-[#0c192c]'}`}><p className="text-xs text-slate-400">연결 확인 필요</p><p className={`mt-1 text-xl font-bold ${issueCount > 0 ? 'text-red-300' : 'text-emerald-300'}`}>{formatNumber(issueCount)}건</p></div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0c192c]">
          {loading ? (
            <div className="p-10 text-center text-slate-400">생산일보를 불러오는 중입니다.</div>
          ) : records.length === 0 ? (
            <div className="p-10 text-center text-slate-400">조회 기간에 완료된 생산일보가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] table-fixed text-left text-sm">
                <colgroup>
                  <col style={{ width: '3%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '23%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '15%' }} />
                </colgroup>
                <thead className="bg-slate-800/90 text-slate-300">
                  <tr>
                    <th className="px-2 py-3 text-center"><input type="checkbox" checked={allSelected} onChange={(event) => toggleAll(event.target.checked)} /></th>
                    <th className="whitespace-nowrap px-2 py-3">생산일자</th>
                    <th className="whitespace-nowrap px-2 py-3">LOT</th>
                    <th className="px-3 py-3">제품 / 연결 반제품</th>
                    <th className="whitespace-nowrap px-2 py-3 text-right">계획·필요량(g)</th>
                    <th className="whitespace-nowrap px-2 py-3 text-right">완료(g)</th>
                    <th className="whitespace-nowrap px-2 py-3 text-right">불량(g)</th>
                    <th className="whitespace-nowrap px-2 py-3 text-right">샘플(g)</th>
                    <th className="whitespace-nowrap px-2 py-3">상태</th>
                    <th className="whitespace-nowrap px-2 py-3">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <>
                      <tr key={record.id} className="border-t border-slate-800 bg-[#0d1b30]">
                        <td className="px-2 py-3 text-center"><input type="checkbox" checked={selectedIds.includes(record.id)} onChange={(event) => toggleOne(record.id, event.target.checked)} /></td>
                        <td className="whitespace-nowrap px-2 py-3 text-slate-300">{record.work_date}</td>
                        <td className="whitespace-nowrap px-2 py-3 font-mono text-slate-200">{record.lot_number}</td>
                        <td className="break-words px-3 py-3 font-semibold text-white">{record.product_name}</td>
                        <td className="whitespace-nowrap px-2 py-3 text-right text-blue-300">{formatNumber(record.planned_quantity_g)}</td>
                        <td className="whitespace-nowrap px-2 py-3 text-right text-emerald-300">{formatNumber(record.actual_quantity_g)}</td>
                        <td className="whitespace-nowrap px-2 py-3 text-right text-amber-300">{formatNumber(record.defect_quantity_g)}</td>
                        <td className="whitespace-nowrap px-2 py-3 text-right text-cyan-300">{formatNumber(record.sample_quantity_g)}</td>
                        <td className="whitespace-nowrap px-2 py-3"><span className="rounded-lg border border-emerald-700/60 bg-emerald-950/40 px-2 py-1 text-xs text-emerald-200">{normalizeStatus(record.status)}</span></td>
                        <td className="px-2 py-3">
                          <div className="flex flex-nowrap items-center gap-1.5">
                            <button type="button" onClick={() => openWorkOrder(record)} className="whitespace-nowrap rounded-lg border border-slate-600 px-2 py-1.5 text-[11px] font-medium hover:border-emerald-500">작업지시서</button>
                            <button type="button" disabled={busyId === record.id} onClick={() => void revertCompletion(record)} className="whitespace-nowrap rounded-lg border border-red-800 px-2 py-1.5 text-[11px] font-medium text-red-200 hover:border-red-600 disabled:opacity-50">되돌리기</button>
                          </div>
                        </td>
                      </tr>
                      {record.semi_products.map((stage) => (
                        <tr key={`${record.id}-${stage.key}`} className="border-t border-slate-800/70 bg-[#091626] text-slate-300">
                          <td className="px-2 py-2"></td>
                          <td className="whitespace-nowrap px-2 py-2 text-xs">↳ {stage.depth}단계</td>
                          <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">동일 LOT</td>
                          <td className="break-words px-3 py-2"><div className="font-semibold text-cyan-200">[연결 반제품] {stage.product_name}</div><div className="mt-1 text-xs text-slate-500">{stage.path.join(' → ')}</div></td>
                          <td className="whitespace-nowrap px-2 py-2 text-right font-semibold text-cyan-200">{formatNumber(stage.required_g)}</td>
                          <td className="px-2 py-2 text-right">-</td>
                          <td className="px-2 py-2 text-right">-</td>
                          <td className="px-2 py-2 text-right">-</td>
                          <td className="px-2 py-2"><span className="inline-block rounded-lg border border-cyan-800/70 bg-cyan-950/30 px-2 py-1 text-[11px] text-cyan-200">동일 LOT 내 제조</span></td>
                          <td className="break-words px-2 py-2 text-[11px] leading-4 text-slate-500">상위: {stage.parent_product_name}</td>
                        </tr>
                      ))}
                      {record.semi_product_issues.length > 0 ? (
                        <tr key={`${record.id}-issues`} className="border-t border-red-900/50 bg-red-950/20"><td></td><td colSpan={9} className="px-3 py-2 text-sm text-red-300"><strong>반제품 연결 확인 필요:</strong> {record.semi_product_issues.join(', ')}</td></tr>
                      ) : null}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
