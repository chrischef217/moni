'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Domain = 'sales_order' | 'sales_statement'
type Operation = 'CREATE' | 'SHOW'
type SearchOption = { id: string; label: string; sub?: string; meta?: any }
type Card = {
  stage: 'draft' | 'confirmation' | 'completed' | 'failed'
  domain: Domain
  operation: Operation
  source_user_message_id: string
  fields?: Record<string, any>
  options?: Record<string, any[]>
  confirmation_id?: string
  preview_text?: string
  warnings?: string[]
  result?: Record<string, any>
  error?: string
  busy?: boolean
}

const THREAD_KEY = 'moni-global-agent-thread-v11'
const txt = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}
const won = (value: unknown) => `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(num(value))}원`
const norm = (value: unknown) => txt(value).normalize('NFKC').toLowerCase().replace(/\s+/g, '')

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return ''
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

function suggestedDueDate(saleDate: string, client: Record<string, any> | undefined) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate) || !client) return ''
  if (txt(client.payment_due_type) === 'days_after_sale') return addDays(saleDate, Math.max(0, Math.min(365, Math.round(num(client.payment_due_days)))))
  if (txt(client.payment_due_type) === 'next_month_day') {
    const source = new Date(`${saleDate}T00:00:00Z`)
    const nextMonthIndex = source.getUTCMonth() + 1
    const year = source.getUTCFullYear() + Math.floor(nextMonthIndex / 12)
    const month = nextMonthIndex % 12
    const requested = Math.max(1, Math.min(31, Math.round(num(client.payment_due_day) || 1)))
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    return new Date(Date.UTC(year, month, Math.min(requested, lastDay))).toISOString().slice(0, 10)
  }
  return ''
}

function taxLabel(value: unknown) {
  return txt(value).toUpperCase() === 'EXEMPT' ? '면세' : '과세'
}

function dueRuleLabel(client: Record<string, any>) {
  const type = txt(client.payment_due_type)
  if (type === 'days_after_sale') return `판매일 + ${Math.round(num(client.payment_due_days))}일`
  if (type === 'next_month_day') return `익월 ${Math.round(num(client.payment_due_day) || 1)}일`
  return txt(client.payment_terms)
}

function SearchSelect({ value, options, placeholder, onSelect, disabled }: { value: string; options: SearchOption[]; placeholder: string; onSelect: (option: SearchOption) => void; disabled?: boolean }) {
  const selected = options.find((row) => row.id === value)
  const [query, setQuery] = useState(selected?.label || '')
  const [open, setOpen] = useState(false)
  useEffect(() => setQuery(selected?.label || ''), [selected?.label])
  const rows = useMemo(() => {
    const q = norm(query)
    return options.filter((row) => !q || norm(row.label).includes(q) || norm(row.sub).includes(q) || norm(row.id).includes(q)).slice(0, 100)
  }, [options, query])
  return <div className="moni-sales-search">
    <input type="search" value={query} disabled={disabled} placeholder={placeholder} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true) }} />
    {open && !disabled ? <div className="moni-sales-options">
      <div className="moni-sales-options-count">{query ? `검색 결과 ${rows.length}개` : `전체 ${options.length}개`}</div>
      {rows.map((row) => <button key={row.id} type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => { onSelect(row); setQuery(row.label); setOpen(false) }}><span><b>{row.label}</b>{row.sub ? <small>{row.sub}</small> : null}</span></button>)}
    </div> : null}
  </div>
}

function Field({ label, required, wide, children }: { label: string; required?: boolean; wide?: boolean; children: React.ReactNode }) {
  return <label className={`moni-sales-field ${wide ? 'wide' : ''}`}><span>{label}{required ? <b>필수</b> : null}</span>{children}</label>
}

export default function MoniMobileSalesStatementCard() {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [fields, setFields] = useState<Record<string, any>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dueDateTouched, setDueDateTouched] = useState(false)
  const sourceRef = useRef('')
  const activeSourceRef = useRef('')
  const suppressedSourceRef = useRef('')
  const threadId = () => txt(window.localStorage.getItem(THREAD_KEY))

  const refresh = useCallback(async () => {
    const id = threadId()
    if (!id) return
    try {
      const response = await fetch(`/api/moni/mobile-business-actions-v2?thread_id=${encodeURIComponent(id)}&_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok || !payload.ok) return
      const next = (payload.card || null) as Card | null
      const relevant = next && ((next.domain === 'sales_order' && next.operation === 'CREATE') || next.domain === 'sales_statement')
      if (!relevant) { activeSourceRef.current = ''; setCard(null); return }
      const active = document.activeElement
      const cardHost = document.querySelector<HTMLElement>('[data-moni-sales-statement-card-host="true"]')
      if (cardHost && active instanceof HTMLElement && cardHost.contains(active)) return
      if (next.source_user_message_id && suppressedSourceRef.current === next.source_user_message_id) return
      if (next.source_user_message_id && suppressedSourceRef.current && suppressedSourceRef.current !== next.source_user_message_id) suppressedSourceRef.current = ''
      activeSourceRef.current = next.source_user_message_id
      setCard(next)
      if (next.stage === 'draft') {
        const key = `${next.source_user_message_id}:${next.domain}:${next.operation}`
        if (sourceRef.current !== key) {
          sourceRef.current = key
          setFields(next.fields || {})
          setDueDateTouched(false)
          setError('')
        }
      }
    } catch { /* core mobile chat remains available */ }
  }, [])

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return
    const scroller = root.querySelector<HTMLElement>('header + div')
    if (!scroller) return
    const node = document.createElement('div')
    node.dataset.moniSalesStatementCardHost = 'true'
    node.className = 'moni-sales-statement-host'
    scroller.appendChild(node)
    setHost(node)
    const hideForNewTurn = () => {
      suppressedSourceRef.current = activeSourceRef.current
      setCard(null)
      setError('')
    }
    window.addEventListener('moni:user-turn-start', hideForNewTurn)
    const timer = window.setInterval(() => void refresh(), 900)
    void refresh()
    return () => { window.removeEventListener('moni:user-turn-start', hideForNewTurn); window.clearInterval(timer); node.remove(); document.body.removeAttribute('data-moni-sales-card-active') }
  }, [refresh])

  useEffect(() => {
    if (card) document.body.setAttribute('data-moni-sales-card-active', 'true')
    else document.body.removeAttribute('data-moni-sales-card-active')
    return () => document.body.removeAttribute('data-moni-sales-card-active')
  }, [card])

  const options = card?.options || {}
  const clients = options.clients || []
  const variants = options.variants || []
  const terms = options.terms || []
  const clientOptions: SearchOption[] = clients.map((row: any) => {
    const parts = [taxLabel(row.tax_type), dueRuleLabel(row), row.sales_order_count ? `기존 매출 ${row.sales_order_count}건` : '', row.sales_term_count ? '판매단가 설정됨' : '', row.also_supplier ? '매입처에도 등록' : ''].filter(Boolean)
    return { id: txt(row.id), label: txt(row.company_name), sub: parts.join(' · '), meta: row }
  })
  const variantOptions: SearchOption[] = variants.map((row: any) => ({ id: txt(row.id), label: `${txt(row.product_name)} · ${txt(row.variant_name)}`, sub: `${txt(row.sales_unit).toUpperCase()} · 기본 ${won(row.default_unit_price)} · MOQ ${num(row.moq_quantity)}`, meta: row }))
  const selectedClient = clients.find((row: any) => txt(row.id) === txt(fields.client_id))
  const items = Array.isArray(fields.items) ? fields.items : []

  function setField(key: string, value: any) { setFields((current) => ({ ...current, [key]: value })) }
  function salesPrice(variantId: string, clientId: string) {
    const variant = variants.find((row: any) => txt(row.id) === variantId)
    const term = terms.find((row: any) => txt(row.variant_id) === variantId && txt(row.client_id) === clientId && row.active !== false)
    return { price: num(term?.unit_price ?? variant?.default_unit_price), moq: num(term?.moq_quantity ?? variant?.moq_quantity), source: term ? '거래처 예외단가' : '기본단가', unit: txt(variant?.sales_unit) }
  }
  function updateItem(index: number, patch: Record<string, any>) {
    setFields((current) => ({ ...current, items: (Array.isArray(current.items) ? current.items : []).map((row: any, rowIndex: number) => rowIndex === index ? { ...row, ...patch } : row) }))
  }
  function chooseClient(option: SearchOption) {
    const client = option.meta || {}
    const vatRate = txt(client.tax_type).toUpperCase() === 'EXEMPT' ? '0' : '10'
    const due = suggestedDueDate(txt(fields.sale_date), client)
    setFields((current) => ({
      ...current,
      client_id: option.id,
      vat_rate: vatRate,
      due_date: dueDateTouched ? current.due_date : due,
      items: (current.items || []).map((row: any) => {
        const pricing = salesPrice(txt(row.sales_variant_id), option.id)
        return { ...row, unit_price: pricing.price ? String(pricing.price) : row.unit_price }
      }),
    }))
  }
  function changeSaleDate(value: string) {
    setFields((current) => ({ ...current, sale_date: value, due_date: dueDateTouched ? current.due_date : suggestedDueDate(value, selectedClient) }))
  }

  const totals = useMemo(() => {
    const supply = items.reduce((sum: number, row: any) => sum + num(row.quantity) * num(row.unit_price), 0)
    const vat = supply * Math.max(0, Math.min(100, num(fields.vat_rate))) / 100
    return { supply, vat, total: supply + vat }
  }, [items, fields.vat_rate])

  async function prepare() {
    if (!card || card.stage !== 'draft' || busy) return
    if (!txt(fields.client_id)) { setError('매출 거래처를 선택해 주세요.'); return }
    if (!items.length || items.some((row: any) => !txt(row.sales_variant_id) || num(row.quantity) <= 0)) { setError('판매 품목과 수량을 확인해 주세요.'); return }
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/moni/mobile-business-actions-v2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'prepare', thread_id: threadId(), source_user_message_id: card.source_user_message_id, domain: card.domain, operation: card.operation, fields }) })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '입력 내용을 확인하지 못했습니다.')
      const confirmation = payload.confirmation
      setCard({ ...card, stage: 'confirmation', confirmation_id: confirmation.id || confirmation.confirmation_id, preview_text: confirmation.preview_text, warnings: confirmation.warnings || [] })
    } catch (value) { setError(value instanceof Error ? value.message : '입력 내용을 확인하지 못했습니다.') } finally { setBusy(false) }
  }

  async function execute() {
    if (!card || card.stage !== 'confirmation' || !card.confirmation_id || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/moni/mobile-business-actions-v2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'execute', thread_id: threadId(), confirmation_id: card.confirmation_id }) })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '업무를 실행하지 못했습니다.')
      setCard({ ...card, stage: 'completed', result: payload.result || {} })
    } catch (value) { setError(value instanceof Error ? value.message : '업무를 실행하지 못했습니다.') } finally { setBusy(false) }
  }

  if (!host || !card) return null
  const resultBody = (card.result?.result || {}) as Record<string, any>
  const order = resultBody.order || null
  const resultClient = resultBody.client || null
  const statementUrl = txt(resultBody.statement_url) || (order?.id ? `/api/moni/sales-statement-pdf?order_id=${encodeURIComponent(order.id)}&mode=inline` : '')
  const downloadUrl = order?.id ? `/api/moni/sales-statement-pdf?order_id=${encodeURIComponent(order.id)}` : ''
  const completedReceived = num(resultBody.received_amount)
  const completedOutstanding = resultBody.outstanding_amount === undefined ? Math.max(0, num(order?.total_amount) - completedReceived) : num(resultBody.outstanding_amount)

  return createPortal(<>
    <section className={`moni-sales-card stage-${card.stage}`}>
      <div className="moni-sales-head"><div><span>MONI 판매관리 · 모바일</span><h2>{card.domain === 'sales_statement' ? (card.operation === 'SHOW' ? '거래명세표 보기' : '거래명세표 작성') : '제품 판매등록'}</h2></div><em>{card.stage === 'draft' ? '입력' : card.stage === 'confirmation' ? '최종 확인' : card.stage === 'completed' ? '완료' : '확인 필요'}</em></div>

      {card.stage === 'draft' ? <>
        <p className="moni-sales-help">{card.domain === 'sales_statement' ? '판매 거래를 등록한 뒤 같은 거래건으로 거래명세표를 생성합니다. 아래 금액·세금·입금예정일까지 확인한 뒤 실행하세요.' : '매출만 등록합니다. 거래명세표 작성이 필요한 경우에는 “거래명세표 작성”으로 요청하세요.'}</p>
        <div className="moni-sales-grid">
          <Field label="거래일" required><input type="date" value={txt(fields.sale_date)} disabled={busy} onChange={(event) => changeSaleDate(event.target.value)} /></Field>
          <Field label="매출 거래처" required><SearchSelect value={txt(fields.client_id)} options={clientOptions} placeholder="매출 거래처 검색" disabled={busy} onSelect={chooseClient} /></Field>
          <Field label="거래 상태"><select value={txt(fields.status) || 'confirmed'} disabled={busy} onChange={(event) => setField('status', event.target.value)}><option value="confirmed">확정</option><option value="draft">임시</option></select></Field>
          <Field label="부가세율(%)"><input inputMode="decimal" value={txt(fields.vat_rate)} disabled={busy} onChange={(event) => setField('vat_rate', event.target.value)} /></Field>
          <Field label="입금예정일" wide><input type="date" value={txt(fields.due_date)} disabled={busy} onChange={(event) => { setDueDateTouched(true); setField('due_date', event.target.value) }} /></Field>
          {selectedClient ? <div className="moni-sales-client-note wide"><b>{txt(selectedClient.company_name)}</b><span>{taxLabel(selectedClient.tax_type)} · {dueRuleLabel(selectedClient) || '수금조건 미설정'}{selectedClient.also_supplier ? ' · 매입처에도 등록된 업체' : ''}</span></div> : null}

          <div className="moni-sales-items wide">
            <div className="moni-sales-items-head"><b>판매 품목</b><button type="button" disabled={busy} onClick={() => setFields((current) => ({ ...current, items: [...(current.items || []), { sales_variant_id: '', quantity: '', unit_price: '' }] }))}>+ 품목 추가</button></div>
            {items.map((item: any, index: number) => {
              const pricing = salesPrice(txt(item.sales_variant_id), txt(fields.client_id))
              const lineAmount = num(item.quantity) * num(item.unit_price)
              return <div className="moni-sales-item" key={index}>
                <SearchSelect value={txt(item.sales_variant_id)} options={variantOptions} placeholder="제품·판매규격 검색" disabled={busy} onSelect={(option) => { const p = salesPrice(option.id, txt(fields.client_id)); updateItem(index, { sales_variant_id: option.id, unit_price: p.price ? String(p.price) : '' }) }} />
                <label><span>수량</span><input inputMode="decimal" value={txt(item.quantity)} disabled={busy} onChange={(event) => updateItem(index, { quantity: event.target.value })} /></label>
                <label><span>단가</span><input inputMode="decimal" value={txt(item.unit_price)} disabled={busy} onChange={(event) => updateItem(index, { unit_price: event.target.value })} /></label>
                <div className="moni-sales-line-total"><span>{item.sales_variant_id ? `${pricing.source} · MOQ ${pricing.moq} · ${pricing.unit.toUpperCase()}` : '판매규격을 선택하세요.'}</span><b>{num(item.quantity) > 0 && num(item.unit_price) > 0 ? `${item.quantity} × ${won(item.unit_price)} = ${won(lineAmount)}` : '금액 계산 대기'}</b></div>
                {items.length > 1 ? <button type="button" className="remove" disabled={busy} onClick={() => setFields((current) => ({ ...current, items: current.items.filter((_: any, rowIndex: number) => rowIndex !== index) }))}>품목 삭제</button> : null}
              </div>
            })}
          </div>

          <div className="moni-sales-total wide"><div><span>공급가액</span><b>{won(totals.supply)}</b></div><div><span>부가세 ({num(fields.vat_rate)}%)</span><b>{won(totals.vat)}</b></div><div className="grand"><span>최종 합계 (VAT 포함)</span><b>{won(totals.total)}</b></div><div><span>등록 직후 입금 / 미수</span><b>0원 / {won(totals.total)}</b></div><div><span>입금예정일</span><b>{txt(fields.due_date) || '미설정'}</b></div></div>
          <Field label="비고" wide><input value={txt(fields.note)} disabled={busy} onChange={(event) => setField('note', event.target.value)} /></Field>
        </div>
        {error ? <div className="moni-sales-error">{error}</div> : null}
        <button type="button" className="moni-sales-primary" disabled={busy} onClick={() => void prepare()}>{busy ? '확인 중…' : '입력 내용 확인'}</button>
      </> : null}

      {card.stage === 'confirmation' ? <>
        <div className="moni-sales-confirm"><span>실행 전 최종 확인</span><pre>{card.preview_text}</pre></div>
        {(card.warnings || []).map((warning) => <div key={warning} className="moni-sales-warning">⚠ {warning}</div>)}
        <p className="moni-sales-safety">공급가액·부가세·VAT 포함 최종 합계·미수·입금예정일을 확인하세요. 아직 실제 판매 데이터는 변경되지 않았습니다.</p>
        {error ? <div className="moni-sales-error">{error}</div> : null}
        <button type="button" className="moni-sales-primary" disabled={busy || card.busy} onClick={() => void execute()}>{busy || card.busy ? '실행 중…' : card.domain === 'sales_statement' ? '판매 등록 및 거래명세표 생성 확정' : '매출 등록 확정'}</button>
      </> : null}

      {card.stage === 'completed' ? <div className="moni-sales-complete">
        <div className="moni-sales-complete-title"><span>✓</span><div><b>{card.domain === 'sales_statement' ? '거래명세표 준비 완료' : '매출 등록 완료'}</b><p>{order?.statement_number ? `${order.statement_number} · ${txt(resultClient?.company_name) || txt(order?.client_name) || '거래처'}` : '요청한 판매 데이터를 확인했습니다.'}</p></div></div>
        {order ? <div className="moni-sales-result-grid"><div><span>거래일</span><b>{txt(order.sale_date)}</b></div><div><span>상태</span><b>{txt(order.status) === 'confirmed' ? '확정' : txt(order.status)}</b></div><div><span>공급가액</span><b>{won(order.supply_amount)}</b></div><div><span>부가세</span><b>{won(order.vat_amount)}</b></div><div className="wide"><span>최종 합계 (VAT 포함)</span><b>{won(order.total_amount)}</b></div><div><span>입금</span><b>{won(completedReceived)}</b></div><div><span>미수</span><b>{won(completedOutstanding)}</b></div><div className="wide"><span>입금예정일</span><b>{txt(order.due_date) || '미설정'}</b></div></div> : null}
        {statementUrl ? <div className="moni-sales-document-actions"><a href={statementUrl} target="_blank" rel="noreferrer">거래명세표 보기</a>{downloadUrl ? <a href={downloadUrl}>PDF 저장</a> : null}</div> : null}
      </div> : null}

      {card.stage === 'failed' ? <div className="moni-sales-error"><b>처리하지 못했습니다.</b><p>{card.error || '거래명세표 또는 판매 데이터를 확인할 수 없습니다.'}</p></div> : null}
    </section>
    <style jsx global>{`
      body[data-moni-sales-card-active="true"] [data-moni-business-card-host="true"]{display:none!important}
      .moni-sales-statement-host{display:block;min-width:0;max-width:100%;margin:12px 0 18px}.moni-sales-card{box-sizing:border-box;width:min(100%,720px);max-width:100%;min-width:0;margin:0 auto;border:1px solid #cfe3df;border-radius:22px;background:#fff;padding:16px;box-shadow:0 12px 34px rgba(23,59,82,.10);color:#173b52;text-align:left}.moni-sales-card *{box-sizing:border-box}.moni-sales-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}.moni-sales-head>div{min-width:0}.moni-sales-head span{font-size:10px;font-weight:900;color:#16836e}.moni-sales-head h2{margin:2px 0 0;font-size:17px;font-weight:950;letter-spacing:-.025em}.moni-sales-head em{flex:0 0 auto;font-style:normal;font-size:10px;font-weight:900;border-radius:999px;background:#edf8f5;padding:5px 8px;color:#247064}.moni-sales-help{margin:0 0 13px;border-radius:13px;background:#f4faf8;padding:10px;color:#607980;font-size:11px;font-weight:650;line-height:1.55}.moni-sales-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;min-width:0}.moni-sales-grid>.wide{grid-column:1/-1}.moni-sales-field{display:block;min-width:0;max-width:100%}.moni-sales-field>span,.moni-sales-item label>span{display:flex;align-items:center;gap:5px;margin-bottom:5px;color:#506a74;font-size:11px;font-weight:900}.moni-sales-field>span b{border-radius:999px;background:#e9f7f3;padding:2px 5px;color:#187966;font-size:8px}.moni-sales-field input,.moni-sales-field select,.moni-sales-search>input,.moni-sales-item label input{display:block;width:100%;max-width:100%;min-width:0;height:42px;border:1px solid #d5e3e0;border-radius:12px;background:#fbfdfd;padding:0 10px;color:#173b52;font-size:12px;font-weight:700;outline:none}.moni-sales-field input:focus,.moni-sales-field select:focus,.moni-sales-search>input:focus,.moni-sales-item label input:focus{border-color:#4aaf99;box-shadow:0 0 0 3px rgba(74,175,153,.10)}.moni-sales-search{position:relative;min-width:0;max-width:100%}.moni-sales-options{position:absolute;left:0;right:0;top:45px;z-index:1500;max-height:300px;overflow:auto;border:1px solid #cfe3df;border-radius:14px;background:#fff;padding:6px;box-shadow:0 16px 36px rgba(23,59,82,.18)}.moni-sales-options-count{padding:6px 8px;color:#75909a;font-size:9px;font-weight:900}.moni-sales-options button{display:flex;width:100%;min-width:0;border:0;border-radius:10px;background:transparent;padding:9px 8px;text-align:left;color:#234653}.moni-sales-options button:active{background:#eef8f5}.moni-sales-options button span{display:grid;gap:2px;min-width:0}.moni-sales-options button b{font-size:11px;overflow-wrap:anywhere}.moni-sales-options button small{color:#80959d;font-size:9px;line-height:1.35}.moni-sales-client-note{display:grid;gap:3px;border:1px solid #d8e8e4;border-radius:12px;background:#f8fbfa;padding:9px 10px;min-width:0}.moni-sales-client-note b{font-size:11px}.moni-sales-client-note span{font-size:9.5px;color:#6c858e}.moni-sales-items{display:grid;gap:8px;min-width:0;max-width:100%}.moni-sales-items-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.moni-sales-items-head b{font-size:11px}.moni-sales-items-head button{border:1px solid #cfe3df;border-radius:10px;background:#f3faf8;padding:6px 8px;color:#267766;font-size:10px;font-weight:900}.moni-sales-item{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.62fr);gap:8px;min-width:0;max-width:100%;border:1px solid #e0ebe8;border-radius:14px;padding:9px;background:#fcfefd}.moni-sales-item>.moni-sales-search{grid-column:1/-1}.moni-sales-item label{display:block;min-width:0;max-width:100%}.moni-sales-line-total{grid-column:1/-1;display:flex;align-items:flex-start;justify-content:space-between;gap:8px;min-width:0;border-radius:10px;background:#f4f9f8;padding:8px}.moni-sales-line-total span{min-width:0;color:#758b93;font-size:9px;line-height:1.4}.moni-sales-line-total b{flex:0 0 auto;color:#245e54;font-size:10.5px}.moni-sales-item .remove{grid-column:1/-1;justify-self:end;border:0;border-radius:8px;background:#fff1ef;padding:6px 8px;color:#b3473e;font-size:9px;font-weight:800}.moni-sales-total{display:grid;gap:6px;border:1px solid #cfe3df;border-radius:14px;background:#f6fbfa;padding:10px;min-width:0}.moni-sales-total>div{display:flex;justify-content:space-between;gap:10px;font-size:10.5px}.moni-sales-total>div span{color:#667e87}.moni-sales-total>div b{color:#244d58}.moni-sales-total .grand{margin-top:3px;padding-top:7px;border-top:1px solid #dce9e6;font-size:12px}.moni-sales-total .grand b{color:#15745f;font-size:13px}.moni-sales-primary{display:block;width:100%;min-height:46px;margin-top:14px;border:0;border-radius:13px;background:#188d77;color:white;font-size:12px;font-weight:900}.moni-sales-primary:disabled{opacity:.45}.moni-sales-error,.moni-sales-warning{margin-top:9px;border:1px solid #f1ccc5;border-radius:13px;background:#fff4f2;padding:9px 10px;color:#a84b41;font-size:10.5px;font-weight:750;line-height:1.5}.moni-sales-warning{border-color:#efdfb4;background:#fff9e9;color:#93691c}.moni-sales-confirm{display:grid;gap:6px;border:1px solid #cfe5df;border-radius:15px;background:#f3faf8;padding:12px;min-width:0}.moni-sales-confirm>span{color:#528076;font-size:10px;font-weight:900}.moni-sales-confirm pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit;color:#173b52;font-size:11px;font-weight:750;line-height:1.75}.moni-sales-safety{margin:9px 0 0;color:#758b93;font-size:10px;line-height:1.55}.moni-sales-complete{display:grid;gap:12px}.moni-sales-complete-title{display:flex;align-items:flex-start;gap:10px;border:1px solid #bfe5d9;border-radius:15px;background:#edfaf5;padding:12px;color:#236c5b}.moni-sales-complete-title>span{display:flex;width:24px;height:24px;flex:0 0 auto;align-items:center;justify-content:center;border-radius:999px;background:#2c9a7f;color:white;font-weight:900}.moni-sales-complete-title b{font-size:12px}.moni-sales-complete-title p{margin:3px 0 0;font-size:10px}.moni-sales-result-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:7px}.moni-sales-result-grid>div{display:grid;gap:2px;min-width:0;border-radius:10px;background:#f7faf9;padding:8px}.moni-sales-result-grid>.wide{grid-column:1/-1}.moni-sales-result-grid span{color:#708890;font-size:9px}.moni-sales-result-grid b{font-size:11px;overflow-wrap:anywhere}.moni-sales-document-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.moni-sales-document-actions a{display:flex;min-height:44px;align-items:center;justify-content:center;border-radius:12px;background:#188d77;color:white;text-decoration:none;font-size:11px;font-weight:900}.moni-sales-document-actions a+ a{border:1px solid #bcdad3;background:white;color:#267766}@media(max-width:430px){.moni-sales-card{padding:14px}.moni-sales-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.moni-sales-item{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.moni-sales-line-total{display:grid}.moni-sales-line-total b{white-space:normal}}@media(max-width:340px){.moni-sales-grid{grid-template-columns:minmax(0,1fr)}.moni-sales-grid>.wide{grid-column:1}.moni-sales-result-grid{grid-template-columns:1fr}.moni-sales-result-grid>.wide{grid-column:1}.moni-sales-document-actions{grid-template-columns:1fr}}
    `}</style>
  </>, host)
}
