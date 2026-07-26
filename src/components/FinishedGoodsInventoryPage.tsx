'use client'

import { useEffect, useMemo, useState } from 'react'

type InventoryRow = {
  product_id: string
  product_name: string
  product_code: string
  product_spec: string
  weight_g: number
  is_active: boolean
  inbound_g: number
  outbound_g: number
  stock_g: number
  production_count: number
  sales_count: number
  last_inbound_date: string | null
  last_outbound_date: string | null
  negative_stock: boolean
}

type Movement = {
  id: string
  product_id: string
  product_name: string
  date: string
  type: 'INBOUND' | 'OUTBOUND'
  quantity_g: number
  reference: string
  counterparty: string
  lot_number: string
  source_id: string
  balance_after_g: number
}

type Payload = {
  ok: boolean
  error?: string
  generated_at: string
  summary: {
    product_count: number
    stocked_product_count: number
    negative_product_count: number
    total_inbound_g: number
    total_outbound_g: number
    total_stock_g: number
    conversion_issue_count: number
  }
  inventory: InventoryRow[]
  movements: Movement[]
  conversion_issues: Array<Record<string, unknown>>
  policy: {
    inbound: string
    outbound: string
    cancellation: string
  }
}

function kg(value: number, digits = 1) {
  const amount = Number(value || 0) / 1000
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(amount)}kg`
}

function formatDate(value: string | null) {
  return value || '-'
}

export default function FinishedGoodsInventoryPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState<string>('')

  async function load(manual = false) {
    if (manual) setRefreshing(true)
    setError('')
    try {
      const response = await fetch(`/api/moni/finished-goods-inventory?_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json() as Payload
      if (!response.ok || !payload.ok) throw new Error(payload.error || '완제품 재고를 불러오지 못했습니다.')
      setData(payload)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '완제품 재고를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ko-KR')
    return (data?.inventory ?? []).filter((row) => {
      if (!showAll && row.stock_g === 0 && !row.negative_stock) return false
      if (!needle) return true
      return `${row.product_name} ${row.product_code} ${row.product_spec}`.toLocaleLowerCase('ko-KR').includes(needle)
    })
  }, [data, query, showAll])

  const selectedRow = useMemo(
    () => data?.inventory.find((row) => row.product_id === selectedProductId) ?? null,
    [data, selectedProductId],
  )
  const selectedMovements = useMemo(
    () => (data?.movements ?? []).filter((movement) => movement.product_id === selectedProductId),
    [data, selectedProductId],
  )

  if (loading) {
    return <main className="min-h-screen bg-transparent px-4 py-6 md:px-6"><div className="mx-auto max-w-[1500px] rounded-[26px] border border-[#d1e2ec] bg-white/95 p-16 text-center text-[#6f8796] shadow-[0_12px_34px_rgba(44,84,108,0.07)]">완제품 재고를 계산하는 중입니다.</div></main>
  }

  return <main data-finished-goods-inventory className="min-h-screen bg-transparent px-4 py-5 text-[#17384d] md:px-6">
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="rounded-[26px] border border-[#cfe1eb] bg-white/95 p-6 shadow-[0_14px_36px_rgba(43,84,109,0.08)] lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.17em] text-[#2b9b76]">FINISHED GOODS INVENTORY</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-[#17384d]">완제품 재고관리</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6b8392]">생산완료 제품은 자동 입고되고, 판매관리에서 확정된 판매는 자동 출고됩니다. 별도 중복 입력 없이 생산·판매 원본기록으로 현재고를 계산합니다.</p>
          </div>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="h-11 rounded-xl border border-[#b9d3df] bg-white px-5 text-sm font-black text-[#31556b] shadow-sm disabled:opacity-50">{refreshing ? '계산 중...' : '재고 새로고침'}</button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-[#c6e3d6] bg-[#f3fbf7] p-5"><span className="text-xs font-bold text-[#618372]">현재 완제품 재고</span><strong className={`mt-1 block text-3xl font-black ${Number(data?.summary.total_stock_g ?? 0) < 0 ? 'text-[#c4515b]' : 'text-[#16825d]'}`}>{kg(data?.summary.total_stock_g ?? 0)}</strong><small className="mt-1 block text-[#789087]">생산입고 − 판매출고</small></div>
          <div className="rounded-2xl border border-[#cce0ed] bg-[#f6fbfe] p-5"><span className="text-xs font-bold text-[#6d8797]">재고 보유 제품</span><strong className="mt-1 block text-3xl font-black text-[#1e719e]">{data?.summary.stocked_product_count ?? 0}개</strong><small className="mt-1 block text-[#7b91a0]">현재고 0kg 초과</small></div>
          <div className="rounded-2xl border border-[#d7e5ed] bg-white p-5"><span className="text-xs font-bold text-[#708796]">누적 생산 입고</span><strong className="mt-1 block text-3xl font-black text-[#17384d]">{kg(data?.summary.total_inbound_g ?? 0)}</strong><small className="mt-1 block text-[#8295a1]">완료·확정 생산기록 기준</small></div>
          <div className={`rounded-2xl border p-5 ${(data?.summary.negative_product_count ?? 0) > 0 || (data?.summary.conversion_issue_count ?? 0) > 0 ? 'border-[#efc0c4] bg-[#fff7f7]' : 'border-[#d7e5ed] bg-white'}`}><span className="text-xs font-bold text-[#708796]">확인 필요</span><strong className={`mt-1 block text-3xl font-black ${(data?.summary.negative_product_count ?? 0) > 0 || (data?.summary.conversion_issue_count ?? 0) > 0 ? 'text-[#c4515b]' : 'text-[#16825d]'}`}>{(data?.summary.negative_product_count ?? 0) + (data?.summary.conversion_issue_count ?? 0)}건</strong><small className="mt-1 block text-[#8295a1]">마이너스 재고·단위 변환 오류</small></div>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-[#efb9bf] bg-[#fff6f7] p-4 text-sm font-semibold text-[#a94752]">{error}</div>}

      {(data?.summary.conversion_issue_count ?? 0) > 0 && <div className="rounded-2xl border border-[#edcf9f] bg-[#fffaf1] p-4 text-sm text-[#875e1d]"><b>판매 출고 단위 확인 필요:</b> {data?.summary.conversion_issue_count}건의 판매품목은 kg/g/개 단위로 변환할 수 없어 현재고에서 제외했습니다. 해당 판매등록의 단위를 확인해야 합니다.</div>}

      <section className="overflow-hidden rounded-[26px] border border-[#cfe1eb] bg-white/95 shadow-[0_12px_34px_rgba(43,84,109,0.07)]">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#deebf2] p-5 lg:px-6">
          <div><p className="text-xs font-black uppercase tracking-[0.15em] text-[#5d91ad]">STOCK LIST</p><h2 className="mt-1 text-2xl font-black tracking-[-0.025em]">제품별 현재고</h2></div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제품명 · 품목제조번호 · 규격 검색" className="h-11 w-[260px] rounded-xl border border-[#cfe0e9] bg-white px-4 text-sm outline-none focus:border-[#8fc0d6]" />
            <button type="button" onClick={() => setShowAll((value) => !value)} className={`h-11 rounded-xl border px-4 text-sm font-bold ${showAll ? 'border-[#86cdb2] bg-[#eefaf4] text-[#247a59]' : 'border-[#cfdfe8] bg-white text-[#5f7888]'}`}>{showAll ? '전체 제품 표시 중' : '재고 있는 제품만'}</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] border-collapse text-sm">
            <thead><tr className="bg-[#f1f7fb] text-left text-xs font-bold text-[#667f8f]"><th className="px-6 py-4">제품</th><th className="px-4 py-4">규격</th><th className="px-4 py-4 text-right">생산 입고</th><th className="px-4 py-4 text-right">판매 출고</th><th className="px-4 py-4 text-right">현재고</th><th className="px-4 py-4">최근 입고</th><th className="px-4 py-4">최근 출고</th><th className="px-6 py-4 text-center">이력</th></tr></thead>
            <tbody>
              {rows.map((row) => <tr key={row.product_id} className={`border-t border-[#e7eff4] ${row.negative_stock ? 'bg-[#fff7f7]' : 'bg-white hover:bg-[#f8fbfd]'}`}>
                <td className="px-6 py-4"><div className="font-black text-[#17384d]">{row.product_name}</div><div className="mt-0.5 text-xs text-[#8396a2]">{row.product_code || '품목제조번호 미등록'}</div></td>
                <td className="px-4 py-4 text-[#5f7989]">{row.product_spec || '-'}</td>
                <td className="px-4 py-4 text-right font-bold text-[#16825d]">+{kg(row.inbound_g)}</td>
                <td className="px-4 py-4 text-right font-bold text-[#a36b15]">-{kg(row.outbound_g)}</td>
                <td className={`px-4 py-4 text-right text-lg font-black ${row.negative_stock ? 'text-[#c4515b]' : row.stock_g > 0 ? 'text-[#176f99]' : 'text-[#81939e]'}`}>{kg(row.stock_g)}</td>
                <td className="px-4 py-4 text-[#657e8e]">{formatDate(row.last_inbound_date)}</td>
                <td className="px-4 py-4 text-[#657e8e]">{formatDate(row.last_outbound_date)}</td>
                <td className="px-6 py-4 text-center"><button type="button" onClick={() => setSelectedProductId(row.product_id)} className="rounded-lg border border-[#bfd5e1] bg-white px-3 py-2 text-xs font-black text-[#315d75]">수불 이력</button></td>
              </tr>)}
              {!rows.length && <tr><td colSpan={8} className="px-6 py-14 text-center text-[#8296a3]">조건에 맞는 완제품 재고가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="rounded-2xl border border-[#d2e3eb] bg-[#f8fbfd] px-5 py-4 text-xs leading-5 text-[#708795]"><b className="text-[#365669]">자동처리 기준</b> · {data?.policy.inbound} · {data?.policy.outbound} · {data?.policy.cancellation}</div>
    </div>

    {selectedRow && <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-[rgba(12,31,44,0.34)] p-4 backdrop-blur-[3px]" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedProductId('') }}>
      <div className="flex max-h-[86vh] w-full max-w-[1080px] flex-col overflow-hidden rounded-[26px] border border-[#cfe1eb] bg-white shadow-[0_28px_80px_rgba(22,52,72,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#dce9f0] px-6 py-5">
          <div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#2b9b76]">STOCK LEDGER</p><h2 className="mt-1 text-2xl font-black text-[#17384d]">{selectedRow.product_name} 재고 이력</h2><p className="mt-1 text-sm text-[#718896]">현재고 {kg(selectedRow.stock_g)} · 생산 {selectedRow.production_count}건 · 판매 {selectedRow.sales_count}건</p></div>
          <button type="button" onClick={() => setSelectedProductId('')} className="rounded-xl border border-[#d0e0e8] bg-white px-4 py-2.5 text-sm font-bold text-[#587283]">닫기</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[780px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-[#eef6fa]"><tr className="text-left text-xs font-bold text-[#657e8e]"><th className="px-6 py-4">일자</th><th className="px-4 py-4">구분</th><th className="px-4 py-4">근거</th><th className="px-4 py-4">LOT / 거래처</th><th className="px-4 py-4 text-right">입출고</th><th className="px-6 py-4 text-right">처리 후 잔량</th></tr></thead>
            <tbody>{selectedMovements.map((movement) => <tr key={movement.id} className="border-t border-[#e7eff4]"><td className="px-6 py-4">{movement.date}</td><td className="px-4 py-4"><span className={`rounded-lg px-2.5 py-1.5 text-xs font-black ${movement.type === 'INBOUND' ? 'bg-[#eaf8f2] text-[#16825d]' : 'bg-[#fff6e8] text-[#9e6818]'}`}>{movement.type === 'INBOUND' ? '생산 입고' : '판매 출고'}</span></td><td className="px-4 py-4 font-semibold text-[#31546a]">{movement.reference}</td><td className="px-4 py-4 text-[#718896]">{movement.type === 'INBOUND' ? movement.lot_number || '-' : movement.counterparty || '-'}</td><td className={`px-4 py-4 text-right font-black ${movement.type === 'INBOUND' ? 'text-[#16825d]' : 'text-[#a36b15]'}`}>{movement.type === 'INBOUND' ? '+' : '-'}{kg(movement.quantity_g)}</td><td className={`px-6 py-4 text-right font-black ${movement.balance_after_g < 0 ? 'text-[#c4515b]' : 'text-[#176f99]'}`}>{kg(movement.balance_after_g)}</td></tr>)}{!selectedMovements.length && <tr><td colSpan={6} className="px-6 py-12 text-center text-[#8296a3]">입출고 이력이 없습니다.</td></tr>}</tbody>
          </table>
        </div>
      </div>
    </div>}
  </main>
}
