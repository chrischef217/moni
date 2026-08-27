'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

type AdjustmentType = 'RETURN' | 'CREDIT'
type Item = {
  id: string
  product_name: string
  specification?: string | null
  sales_variant_name?: string | null
  quantity: number
  unit: string
  unit_price: number
  supply_amount: number
  quantity_kg?: number | null
  returnable_quantity?: number
  returned_quantity?: number
}
type Order = {
  id: string
  statement_number: string
  sale_date: string
  client_id?: string | null
  client_name: string
  source_type?: string | null
  source_reference?: string | null
  currency?: string | null
  total_amount: number
  supply_amount: number
  vat_amount: number
  note?: string | null
  status: string
  items: Item[]
}
type Payload = { ok: boolean; error?: string; originals: Order[]; adjustments: Order[] }
type ReturnQtyMap = Record<string, string>

const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50'
const secondaryButton = 'rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:border-slate-500 hover:text-white disabled:opacity-40'
const primaryButton = 'rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40'
const redButton = 'rounded-lg border border-red-400/50 bg-red-500/10 px-3 py-2 text-xs font-black text-red-300 hover:bg-red-500/20 disabled:opacity-40'

function todayKst() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()) }
function monthNow() { return todayKst().slice(0, 7) }
function money(value: unknown) { return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(Number(value ?? 0)))}원` }
function qty(value: unknown) { return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(Number(value ?? 0)) }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-sm text-slate-300"><span className="mb-1.5 block">{label}</span>{children}</label> }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/75 p-4"><div className="max-h-[94vh] w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-700 bg-[#0f1b2d] text-slate-100 shadow-2xl"><div className="flex items-center justify-between border-b border-slate-700 px-6 py-4"><div><div className="text-xs font-black uppercase tracking-[0.12em] text-emerald-300">MONI SALES</div><h2 className="mt-1 text-xl font-black">{title}</h2></div><button type="button" onClick={onClose} className={secondaryButton}>닫기</button></div><div className="max-h-[calc(94vh-82px)] overflow-y-auto p-6">{children}</div></div></div> }

export default function SalesReturnCreditModule() {
  const [month, setMonth] = useState(monthNow())
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState(false)
  const [type, setType] = useState<AdjustmentType>('RETURN')
  const [originalOrderId, setOriginalOrderId] = useState('')
  const [saleDate, setSaleDate] = useState(todayKst())
  const [reason, setReason] = useState('')
  const [returnQty, setReturnQty] = useState<ReturnQtyMap>({})
  const [creditAmount, setCreditAmount] = useState('')
  const [cancelId, setCancelId] = useState('')
  const [cancelReason, setCancelReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/moni/sales-return-credit?month=${encodeURIComponent(month)}&_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json() as Payload
      if (!response.ok || !payload.ok) throw new Error(payload.error || '반품/매출차감 데이터를 불러오지 못했습니다.')
      setData(payload)
    } catch (e) {
      setError(e instanceof Error ? e.message : '반품/매출차감 데이터를 불러오지 못했습니다.')
    } finally { setLoading(false) }
  }, [month])

  useEffect(() => { void load() }, [load])

  const originals = data?.originals ?? []
  const adjustments = data?.adjustments ?? []
  const originalById = useMemo(() => new Map(originals.map((row) => [row.id, row])), [originals])
  const selected = originalOrderId ? originalById.get(originalOrderId) : undefined
  const adjustmentByOriginal = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of adjustments) {
      if (row.status !== 'confirmed') continue
      const key = String(row.source_reference || '')
      if (!key) continue
      map.set(key, (map.get(key) ?? 0) + Math.abs(Number(row.total_amount || 0)))
    }
    return map
  }, [adjustments])
  const remainingValue = selected ? Math.max(0, Math.abs(Number(selected.total_amount || 0)) - (adjustmentByOriginal.get(selected.id) ?? 0)) : 0
  const confirmedAdjustments = adjustments.filter((row) => row.status === 'confirmed')
  const monthAdjustmentTotal = confirmedAdjustments.reduce((sum, row) => sum + Math.abs(Number(row.total_amount || 0)), 0)

  function openNew() {
    setType('RETURN')
    setOriginalOrderId(originals[0]?.id || '')
    setSaleDate(todayKst())
    setReason('')
    setReturnQty({})
    setCreditAmount('')
    setError('')
    setNotice('')
    setModal(true)
  }

  function changeOriginal(id: string) {
    setOriginalOrderId(id)
    setReturnQty({})
    setCreditAmount('')
  }

  async function save() {
    if (!selected) { setError('원거래를 선택해 주세요.'); return }
    if (!reason.trim()) { setError('반품/차감 사유를 입력해 주세요.'); return }
    const returnItems = selected.items
      .map((item) => ({ original_order_item_id: item.id, quantity: Number(returnQty[item.id] || 0) }))
      .filter((item) => item.quantity > 0)
    if (type === 'RETURN' && !returnItems.length) { setError('반품할 품목과 수량을 입력해 주세요.'); return }
    if (type === 'CREDIT' && !(Number(creditAmount) > 0)) { setError('차감 금액을 입력해 주세요.'); return }

    setSaving(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/moni/sales-return-credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_adjustment',
          data: {
            adjustment_type: type,
            original_order_id: selected.id,
            sale_date: saleDate,
            reason,
            items: returnItems,
            credit_amount: Number(creditAmount || 0),
          },
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || '반품/매출차감 저장에 실패했습니다.')
      const statement = String(result.adjustment?.statement_number || '')
      setModal(false)
      setNotice(`${type === 'RETURN' ? '제품 반품' : '매출 차감'} 전표 ${statement}를 생성했습니다.`)
      await load()
      window.setTimeout(() => window.location.reload(), 350)
    } catch (e) {
      setError(e instanceof Error ? e.message : '반품/매출차감 저장에 실패했습니다.')
    } finally { setSaving(false) }
  }

  async function cancelAdjustment() {
    if (!cancelId) return
    if (!cancelReason.trim()) { setError('취소 사유를 입력해 주세요.'); return }
    setSaving(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/moni/sales-return-credit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel_adjustment', id: cancelId, data: { reason: cancelReason } }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || '전표 취소에 실패했습니다.')
      setCancelId(''); setCancelReason('')
      setNotice('반품/매출차감 전표를 취소했습니다. 원기록은 이력으로 보존됩니다.')
      await load()
      window.setTimeout(() => window.location.reload(), 350)
    } catch (e) {
      setError(e instanceof Error ? e.message : '전표 취소에 실패했습니다.')
    } finally { setSaving(false) }
  }

  return <section className="bg-[#071426] px-4 pt-6 text-slate-100 md:px-8"><div className="mx-auto max-w-[1600px] space-y-4">
    <div className="rounded-3xl border border-slate-700 bg-[#0b1b30] p-6 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-sm font-black text-emerald-300">MONI SALES ADJUSTMENT</p><h2 className="mt-1 text-2xl font-black">반품 · 매출차감</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">일반 판매는 그대로 보존하고 원거래에 연결된 마이너스 거래명세표를 발행합니다. 제품 반품은 완제품 재고를 복구하고, 금액 차감은 재고를 건드리지 않습니다.</p></div>
        <div className="flex flex-wrap items-end gap-2"><Field label="조회 월"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass} /></Field><button type="button" onClick={openNew} className={primaryButton}>+ 반품/매출차감</button></div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4"><div className="text-xs font-black text-slate-500">이번 달 전표</div><div className="mt-2 text-xl font-black">{confirmedAdjustments.length}건</div></div><div className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-4"><div className="text-xs font-black text-red-300/70">매출 차감 합계</div><div className="mt-2 text-xl font-black text-red-200">-{money(monthAdjustmentTotal)}</div></div><div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] p-4"><div className="text-xs font-black text-emerald-300/70">처리 원칙</div><div className="mt-2 text-sm font-bold text-emerald-100">원거래 보존 · 별도 마이너스 전표</div></div></div>
    </div>

    {error && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
    {notice && <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div>}

    {adjustments.length > 0 && <div className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-900/55"><div className="border-b border-slate-700 px-5 py-4"><h3 className="font-black">반품/차감 전표 이력</h3></div><div className="overflow-x-auto"><table className="min-w-[980px] w-full text-sm"><thead className="bg-slate-800 text-slate-400"><tr>{['구분','처리일','거래명세표','원거래','거래처','차감금액','관리'].map((label) => <th key={label} className="px-4 py-3 text-left">{label}</th>)}</tr></thead><tbody>{adjustments.map((row) => { const kind = String(row.source_type).toUpperCase(); return <tr key={row.id} className={`border-t border-slate-800 ${row.status === 'cancelled' ? 'opacity-45' : ''}`}><td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-black ${kind === 'RETURN' ? 'border-amber-400/40 bg-amber-500/10 text-amber-200' : 'border-violet-400/40 bg-violet-500/10 text-violet-200'}`}>{kind === 'RETURN' ? '제품 반품' : '매출 차감'}</span></td><td className="px-4 py-3">{row.sale_date}</td><td className="px-4 py-3 font-bold">{row.statement_number}</td><td className="px-4 py-3">{originalById.get(String(row.source_reference || ''))?.statement_number || '-'}</td><td className="px-4 py-3">{row.client_name}</td><td className="px-4 py-3 font-black text-red-200">{money(row.total_amount)}</td><td className="px-4 py-3 whitespace-nowrap"><button type="button" onClick={() => window.open(`/api/moni/sales-statement-pdf?order_id=${encodeURIComponent(row.id)}`, '_blank')} className="mr-3 underline">출력</button>{row.status !== 'cancelled' && <button type="button" onClick={() => { setCancelId(row.id); setCancelReason('') }} className={redButton}>취소</button>}</td></tr>})}</tbody></table></div></div>}
  </div>

  {modal && <Modal title="반품/매출차감 전표 작성" onClose={() => setModal(false)}>
    <div className="grid gap-3 md:grid-cols-2"><button type="button" onClick={() => setType('RETURN')} className={`rounded-2xl border p-5 text-left ${type === 'RETURN' ? 'border-amber-400 bg-amber-500/10' : 'border-slate-700 bg-slate-900/50'}`}><div className="font-black text-amber-200">제품 반품</div><div className="mt-2 text-sm leading-6 text-slate-400">반품 수량만큼 매출·미수금을 차감하고 완제품 재고를 다시 증가시킵니다.</div></button><button type="button" onClick={() => setType('CREDIT')} className={`rounded-2xl border p-5 text-left ${type === 'CREDIT' ? 'border-violet-400 bg-violet-500/10' : 'border-slate-700 bg-slate-900/50'}`}><div className="font-black text-violet-200">금액만 매출차감</div><div className="mt-2 text-sm leading-6 text-slate-400">제품이 돌아오지 않는 보상·가격조정입니다. 매출·미수금만 차감하고 재고는 그대로 둡니다.</div></button></div>
    <div className="mt-5 grid gap-4 md:grid-cols-3"><Field label="원거래"><select value={originalOrderId} onChange={(e) => changeOriginal(e.target.value)} className={inputClass}><option value="">원거래 선택</option>{originals.map((row) => <option key={row.id} value={row.id}>{row.sale_date} · {row.client_name} · {row.statement_number} · {money(row.total_amount)}</option>)}</select></Field><Field label="처리일"><input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} className={inputClass} /></Field><Field label="남은 처리 가능 금액"><input value={money(remainingValue)} readOnly className={`${inputClass} font-black text-emerald-200`} /></Field></div>
    <div className="mt-4"><Field label="사유"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 제품 불량 반품 / 단가 조정 / 품질 보상" className={inputClass} /></Field></div>

    {selected && type === 'RETURN' && <div className="mt-6 overflow-hidden rounded-2xl border border-slate-700"><div className="bg-slate-800 px-4 py-3"><b>반품 품목</b><div className="mt-1 text-xs text-slate-400">마이너스 기호를 직접 입력하지 마세요. 실제 반품 수량을 양수로 입력하면 MONI가 마이너스 전표로 변환합니다.</div></div><div className="overflow-x-auto"><table className="min-w-[850px] w-full text-sm"><thead className="bg-slate-900 text-slate-500"><tr><th className="px-3 py-3 text-left">품목</th><th className="px-3 py-3 text-left">원판매</th><th className="px-3 py-3 text-left">기반품</th><th className="px-3 py-3 text-left">반품 가능</th><th className="px-3 py-3 text-left">이번 반품</th><th className="px-3 py-3 text-left">예상 차감액</th></tr></thead><tbody>{selected.items.map((item) => { const entered = Number(returnQty[item.id] || 0); return <tr key={item.id} className="border-t border-slate-800"><td className="px-3 py-3 font-bold">{item.product_name}<div className="text-xs font-normal text-slate-500">{item.sales_variant_name || item.specification || '-'}</div></td><td className="px-3 py-3">{qty(Math.abs(item.quantity))} {item.unit}</td><td className="px-3 py-3">{qty(item.returned_quantity || 0)} {item.unit}</td><td className="px-3 py-3 font-bold text-emerald-200">{qty(item.returnable_quantity || 0)} {item.unit}</td><td className="px-3 py-3"><input type="number" min="0" max={item.returnable_quantity || 0} step="0.001" value={returnQty[item.id] || ''} onChange={(e) => setReturnQty((current) => ({ ...current, [item.id]: e.target.value }))} className={`${inputClass} w-32`} /></td><td className="px-3 py-3 font-black text-red-200">{entered > 0 ? `-${money(entered * Number(item.unit_price || 0))}` : '-'}</td></tr>})}</tbody></table></div></div>}

    {selected && type === 'CREDIT' && <div className="mt-6 rounded-2xl border border-violet-500/30 bg-violet-500/[0.06] p-5"><Field label="차감 금액"><input type="number" min="0" max={remainingValue} value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} placeholder="차감할 금액" className={inputClass} /></Field><div className="mt-3 text-sm text-slate-400">제품 재고에는 영향을 주지 않으며 거래명세표에는 `매출 차감` 항목이 마이너스 금액으로 기록됩니다.</div></div>}

    <div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" onClick={() => setModal(false)} className={secondaryButton}>취소</button><button type="button" disabled={saving || !selected} onClick={() => void save()} className={primaryButton}>{saving ? '처리 중...' : type === 'RETURN' ? '반품 전표 생성' : '매출차감 전표 생성'}</button></div>
  </Modal>}

  {cancelId && <Modal title="반품/차감 전표 취소" onClose={() => { setCancelId(''); setCancelReason('') }}><p className="mb-5 text-sm leading-6 text-slate-300">원전표는 삭제하지 않고 취소 상태로 보존합니다. 반품 전표를 취소하면 완제품 재고 복구와 미수 차감 효과도 자동으로 사라집니다.</p><Field label="취소 사유"><input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className={inputClass} /></Field><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => { setCancelId(''); setCancelReason('') }} className={secondaryButton}>닫기</button><button type="button" disabled={saving} onClick={() => void cancelAdjustment()} className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-black text-white hover:bg-red-500 disabled:opacity-40">전표 취소</button></div></Modal>}
  </section>
}
