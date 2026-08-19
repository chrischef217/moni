'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Opt = { id: string; label: string; sub?: string; meta?: any }
type Card = {
  stage: 'draft' | 'confirmation' | 'completed' | 'failed'
  domain: 'purchase'
  operation: 'CREATE'
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
const num = (value: unknown) => { const parsed = Number(String(value ?? '').replace(/,/g, '')); return Number.isFinite(parsed) ? parsed : 0 }
const won = (value: unknown) => `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(num(value))}원`
const norm = (value: unknown) => txt(value).normalize('NFKC').toLowerCase().replace(/\s+/g, '')
function paymentLabel(value: unknown) { const v = txt(value).toUpperCase(); return v === 'BANK_TRANSFER' ? '계좌이체' : v === 'CARD' ? '카드' : v === 'CASH' ? '현금' : '기타' }
function taxLabel(value: unknown) { const v = txt(value).toUpperCase(); return v === 'EXEMPT' ? '면세' : v === 'ZERO_RATE' ? '영세율' : '과세' }
function dueLabel(row: Record<string, any> | undefined) { if (!row) return ''; const type = txt(row.default_due_type).toUpperCase(); if (type === 'IMMEDIATE') return '즉시'; if (type === 'DAYS') return `매입일 + ${Math.round(num(row.default_due_days))}일`; if (type === 'NEXT_MONTH_DAY') return `익월 ${Math.round(num(row.default_due_day) || 1)}일`; if (type === 'MONTH_END') return '익월 말일'; return '직접 지정' }

function SearchSelect({ value, options, placeholder, onSelect, disabled }: { value: string; options: Opt[]; placeholder: string; onSelect: (row: Opt) => void; disabled?: boolean }) {
  const selected = options.find((row) => row.id === value)
  const [query, setQuery] = useState(selected?.label || '')
  const [open, setOpen] = useState(false)
  useEffect(() => setQuery(selected?.label || ''), [selected?.label])
  const rows = useMemo(() => { const q = norm(query); return options.filter((row) => !q || norm(row.label).includes(q) || norm(row.sub).includes(q) || norm(row.id).includes(q)).slice(0, 100) }, [options, query])
  return <div className="moni-purchase-v2-search">
    <input type="search" value={query} disabled={disabled} placeholder={placeholder} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true) }} />
    {open && !disabled ? <div className="moni-purchase-v2-options"><small>{query ? `검색 ${rows.length}개` : `전체 ${options.length}개`}</small>{rows.map((row) => <button key={row.id} type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => { onSelect(row); setQuery(row.label); setOpen(false) }}><b>{row.label}</b>{row.sub ? <span>{row.sub}</span> : null}</button>)}</div> : null}
  </div>
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`moni-purchase-v2-field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label>
}

export default function MoniMobilePurchaseCardV2() {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [fields, setFields] = useState<Record<string, any>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sourceRef = useRef('')
  const activeSourceRef = useRef('')
  const suppressedRef = useRef('')
  const threadId = () => txt(window.localStorage.getItem(THREAD_KEY))

  const refresh = useCallback(async () => {
    const id = threadId()
    if (!id) return
    try {
      const response = await fetch(`/api/moni/mobile-purchase-actions-v3?thread_id=${encodeURIComponent(id)}&_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok || !payload.ok) return
      const next = (payload.card || null) as Card | null
      if (!next) { setCard(null); return }
      const node = document.querySelector<HTMLElement>('[data-moni-purchase-v2-card-host="true"]')
      if (node && document.activeElement instanceof HTMLElement && node.contains(document.activeElement)) return
      const source = next.source_user_message_id || ''
      if (source && suppressedRef.current === source) return
      if (source && suppressedRef.current && suppressedRef.current !== source) suppressedRef.current = ''
      activeSourceRef.current = source
      setCard(next)
      if (next.stage === 'draft') {
        const key = `${source}:purchase:v3`
        if (sourceRef.current !== key) {
          sourceRef.current = key
          setFields(next.fields || {})
          setError('')
        }
      }
    } catch { /* core mobile chat remains available */ }
  }, [])

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    const scroller = root?.querySelector<HTMLElement>('header + div')
    if (!scroller) return
    const node = document.createElement('div')
    node.dataset.moniPurchaseV2CardHost = 'true'
    node.className = 'moni-purchase-v2-host'
    scroller.appendChild(node)
    setHost(node)
    const hide = () => { suppressedRef.current = activeSourceRef.current; setCard(null); setError('') }
    window.addEventListener('moni:user-turn-start', hide)
    const timer = window.setInterval(() => void refresh(), 900)
    void refresh()
    return () => { window.removeEventListener('moni:user-turn-start', hide); window.clearInterval(timer); node.remove(); document.body.removeAttribute('data-moni-purchase-card-active') }
  }, [refresh])

  useEffect(() => {
    if (card) document.body.setAttribute('data-moni-purchase-card-active', 'true')
    else document.body.removeAttribute('data-moni-purchase-card-active')
    return () => document.body.removeAttribute('data-moni-purchase-card-active')
  }, [card])

  const options = card?.options || {}
  const suppliers = options.suppliers || []
  const raw = options.raw_materials || []
  const packaging = options.packaging_materials || []
  const supplierOptions: Opt[] = suppliers.map((row: any) => ({
    id: txt(row.id), label: txt(row.company_name),
    sub: [taxLabel(row.tax_type), `기본 ${paymentLabel(row.default_payment_method)}`, dueLabel(row)].filter(Boolean).join(' · '), meta: row,
  }))
  const selectedSupplier = suppliers.find((row: any) => txt(row.id) === txt(fields.supplier_id))
  const materials = txt(fields.purchase_category) === 'PACKAGING' ? packaging : raw
  const materialOptions: Opt[] = materials.map((row: any) => ({
    id: txt(row.id), label: txt(row.item_name || row.material_name),
    sub: [txt(row.item_code || row.material_code), row.packing_weight_g ? `포장 ${new Intl.NumberFormat('ko-KR').format(num(row.packing_weight_g))}g` : '', row.unit_price_per_kg ? `마스터 ${won(row.unit_price_per_kg)}` : row.unit_price ? `마스터 ${won(row.unit_price)}` : ''].filter(Boolean).join(' · '), meta: row,
  }))
  const selectedMaterial = materials.find((row: any) => txt(row.id) === txt(fields.material_id))
  const defaultPayment = txt(selectedSupplier?.default_payment_method) || 'BANK_TRANSFER'
  const displayedPayment = txt(fields.planned_payment_method) || defaultPayment
  const defaultTaxInvoice = selectedSupplier?.tax_invoice_required ? 'NOT_RECEIVED' : 'NOT_REQUIRED'
  const displayedTaxInvoice = txt(fields.tax_invoice_status) || defaultTaxInvoice

  function setField(key: string, value: any) { setFields((current) => ({ ...current, [key]: value })) }

  async function prepare() {
    if (!card || card.stage !== 'draft' || busy) return
    if (!txt(fields.supplier_id)) { setError('매입처를 선택해 주세요.'); return }
    if (!txt(fields.material_id)) { setError('매입 품목을 선택해 주세요.'); return }
    if (num(fields.quantity) <= 0) { setError('매입수량은 0보다 커야 합니다.'); return }
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/moni/mobile-purchase-actions-v3', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'prepare', thread_id: threadId(), source_user_message_id: card.source_user_message_id, fields }) })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '매입 내용을 확인하지 못했습니다.')
      setCard({ ...card, stage: 'confirmation', confirmation_id: payload.confirmation.id, preview_text: payload.confirmation.preview_text, warnings: payload.confirmation.warnings || [] })
    } catch (value) { setError(value instanceof Error ? value.message : '매입 내용을 확인하지 못했습니다.') } finally { setBusy(false) }
  }

  async function execute() {
    if (!card || card.stage !== 'confirmation' || !card.confirmation_id || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/moni/mobile-purchase-actions-v3', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'execute', thread_id: threadId(), confirmation_id: card.confirmation_id }) })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '매입을 실행하지 못했습니다.')
      setCard({ ...card, stage: 'completed', result: payload.result || {} })
    } catch (value) { setError(value instanceof Error ? value.message : '매입을 실행하지 못했습니다.') } finally { setBusy(false) }
  }

  if (!host || !card) return null
  const snapshot = card.result || {}
  const expected = (snapshot.expected || {}) as Record<string, any>
  const result = (snapshot.result || {}) as Record<string, any>
  const purchase = (result.purchase || {}) as Record<string, any>

  return createPortal(<>
    <section className="moni-purchase-v2-card">
      <div className="moni-purchase-v2-head"><div><span>MONI 매입관리 · 모바일</span><h2>매입 등록</h2></div><em>{card.stage === 'draft' ? '입력' : card.stage === 'confirmation' ? '최종 확인' : card.stage === 'completed' ? '완료' : '확인 필요'}</em></div>
      {card.stage === 'draft' ? <>
        <p className="moni-purchase-v2-help">실제 저장 금액은 PC와 동일한 마스터 가격·매입처 세금조건으로 서버가 계산합니다. 단가를 임의 입력하지 않고 실행 전 권위값을 확인합니다.</p>
        <div className="moni-purchase-v2-grid">
          <Field label="매입처"><SearchSelect value={txt(fields.supplier_id)} options={supplierOptions} placeholder="매입처 검색" disabled={busy} onSelect={(option) => setFields((current) => ({ ...current, supplier_id: option.id, due_date: '', planned_payment_method: '', planned_payment_account: '', planned_card_name: '', planned_installment_months: '', tax_invoice_status: '' }))} /></Field>
          <Field label="구분"><select disabled={busy} value={txt(fields.purchase_category) || 'RAW_MATERIAL'} onChange={(event) => setFields((current) => ({ ...current, purchase_category: event.target.value, material_id: '', unit: event.target.value === 'PACKAGING' ? 'EA' : 'KG' }))}><option value="RAW_MATERIAL">원재료</option><option value="PACKAGING">부재료</option></select></Field>
          <Field label="매입일"><input type="date" disabled={busy} value={txt(fields.purchase_date)} onChange={(event) => setField('purchase_date', event.target.value)} /></Field>
          <Field label="입고일"><input type="date" disabled={busy} value={txt(fields.receipt_date)} onChange={(event) => setField('receipt_date', event.target.value)} /></Field>
          <Field label="품목" wide><SearchSelect value={txt(fields.material_id)} options={materialOptions} placeholder="매입 품목 검색" disabled={busy} onSelect={(option) => setField('material_id', option.id)} /></Field>
          {selectedMaterial ? <div className="moni-purchase-v2-reference wide"><b>{txt(selectedMaterial.item_name || selectedMaterial.material_name)}</b><span>현재 마스터 가격 {won(selectedMaterial.unit_price_per_kg ?? selectedMaterial.unit_price)}{selectedMaterial.packing_weight_g ? ` · 포장 ${new Intl.NumberFormat('ko-KR').format(num(selectedMaterial.packing_weight_g))}g` : ''}</span></div> : null}
          <Field label="수량"><input inputMode="decimal" disabled={busy} value={txt(fields.quantity)} onChange={(event) => setField('quantity', event.target.value)} /></Field>
          <Field label="단위"><select disabled={busy} value={txt(fields.unit) || 'KG'} onChange={(event) => setField('unit', event.target.value)}>{txt(fields.purchase_category) === 'PACKAGING' ? <option value="EA">EA</option> : <><option value="KG">KG</option><option value="G">G</option><option value="EA">EA</option></>}</select></Field>
          <Field label="지급예정일 (직접 지정 시)"><input type="date" disabled={busy} value={txt(fields.due_date)} onChange={(event) => setField('due_date', event.target.value)} /></Field>
          <Field label="예정 결제수단"><select disabled={busy} value={displayedPayment} onChange={(event) => setField('planned_payment_method', event.target.value)}><option value="BANK_TRANSFER">계좌이체</option><option value="CARD">카드</option><option value="CASH">현금</option><option value="OTHER">기타</option></select></Field>
          {displayedPayment === 'BANK_TRANSFER' ? <Field label="예정 계좌"><input disabled={busy} value={txt(fields.planned_payment_account)} placeholder={txt(selectedSupplier?.default_payment_account) || '매입처 기본계좌 사용'} onChange={(event) => setField('planned_payment_account', event.target.value)} /></Field> : null}
          {displayedPayment === 'CARD' ? <><Field label="예정 카드"><input disabled={busy} value={txt(fields.planned_card_name)} placeholder={txt(selectedSupplier?.default_card_name) || '매입처 기본카드 사용'} onChange={(event) => setField('planned_card_name', event.target.value)} /></Field><Field label="할부 개월"><input inputMode="numeric" disabled={busy} value={txt(fields.planned_installment_months)} placeholder={String(num(selectedSupplier?.default_installment_months) || 1)} onChange={(event) => setField('planned_installment_months', event.target.value)} /></Field></> : null}
          <Field label="세금계산서"><select disabled={busy} value={displayedTaxInvoice} onChange={(event) => setField('tax_invoice_status', event.target.value)}><option value="NOT_REQUIRED">불필요</option><option value="NOT_RECEIVED">미수취</option><option value="RECEIVED">수취</option><option value="MATCHED">금액일치</option><option value="MISMATCH">불일치</option></select></Field>
          <Field label="비고" wide><input disabled={busy} value={txt(fields.notes)} onChange={(event) => setField('notes', event.target.value)} /></Field>
        </div>
        {selectedSupplier ? <div className="moni-purchase-v2-reference"><b>{txt(selectedSupplier.company_name)}</b><span>{taxLabel(selectedSupplier.tax_type)} · 기본 결제 {paymentLabel(selectedSupplier.default_payment_method)} · 지급조건 {dueLabel(selectedSupplier)}</span></div> : null}
        {error ? <div className="moni-purchase-v2-error">{error}</div> : null}
        <button className="moni-purchase-v2-primary" type="button" disabled={busy} onClick={() => void prepare()}>{busy ? '계산 중…' : '입력 내용 확인'}</button>
      </> : null}

      {card.stage === 'confirmation' ? <>
        <div className="moni-purchase-v2-confirm"><span>서버 권위값 · 실행 전 최종 확인</span><pre>{card.preview_text}</pre></div>
        {(card.warnings || []).map((warning) => <div className="moni-purchase-v2-warning" key={warning}>⚠ {warning}</div>)}
        <p className="moni-purchase-v2-safety">확정 직전에 원본 입력으로 마스터 단가·세금·지급조건을 다시 계산합니다. 확인값이 달라지면 저장하지 않고 재확인을 요구합니다.</p>
        {error ? <div className="moni-purchase-v2-error">{error}</div> : null}
        <button className="moni-purchase-v2-primary" type="button" disabled={busy || card.busy} onClick={() => void execute()}>{busy || card.busy ? '실행 중…' : '매입 등록 최종 확정'}</button>
      </> : null}

      {card.stage === 'completed' ? <div className="moni-purchase-v2-complete">
        <div className="title"><span>✓</span><b>{snapshot.verified === false ? '매입 저장 완료 · 검증 확인 필요' : '매입 등록 완료'}</b></div>
        {snapshot.verification_warning ? <div className="moni-purchase-v2-warning">⚠ {txt(snapshot.verification_warning)}</div> : null}
        <p>{txt(purchase.purchase_no) || '매입번호 생성 완료'} · {txt(purchase.supplier_name_snapshot) || '매입처'} · {txt(purchase.item_name) || '품목'}</p>
        <div className="moni-purchase-v2-result"><span>적용 단가 <b>{won(purchase.unit_price ?? expected.unit_price)}</b></span><span>공급가액 <b>{won(purchase.supply_amount ?? expected.supply_amount)}</b></span><span>부가세 <b>{won(purchase.vat_amount ?? expected.vat_amount)}</b></span><span>최종 합계(VAT 포함) <b>{won(purchase.total_amount ?? expected.total_amount)}</b></span><span>지급 <b>0원</b></span><span>미지급 <b>{won(purchase.total_amount ?? expected.total_amount)}</b></span><span>지급예정일 <b>{txt(purchase.due_date ?? expected.due_date) || '미설정'}</b></span></div>
      </div> : null}

      {card.stage === 'failed' ? <div className="moni-purchase-v2-error">{card.error || '매입 업무를 처리하지 못했습니다.'}</div> : null}
    </section>
    <style jsx global>{`
      body[data-moni-purchase-card-active="true"] [data-moni-business-card-host="true"]{display:none!important}.moni-purchase-v2-host{display:block;min-width:0;max-width:100%;margin:12px 0 18px}.moni-purchase-v2-card{box-sizing:border-box;width:min(100%,720px);max-width:100%;min-width:0;margin:0 auto;border:1px solid #cfe3df;border-radius:22px;background:#fff;padding:16px;color:#173b52;box-shadow:0 12px 34px rgba(23,59,82,.1);text-align:left}.moni-purchase-v2-card *{box-sizing:border-box}.moni-purchase-v2-head{display:flex;justify-content:space-between;gap:10px}.moni-purchase-v2-head span{font-size:10px;font-weight:900;color:#17856f}.moni-purchase-v2-head h2{margin:2px 0 12px;font-size:17px}.moni-purchase-v2-head em{height:max-content;border-radius:999px;background:#edf8f5;padding:5px 8px;font-size:10px;font-style:normal;font-weight:900}.moni-purchase-v2-help{margin:0 0 12px;border-radius:12px;background:#f5faf9;padding:10px;color:#607980;font-size:11px;line-height:1.55}.moni-purchase-v2-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;min-width:0}.moni-purchase-v2-grid>.wide{grid-column:1/-1}.moni-purchase-v2-field{display:block;min-width:0;max-width:100%}.moni-purchase-v2-field>span{display:block;margin-bottom:5px;color:#556d76;font-size:11px;font-weight:900}.moni-purchase-v2-field input,.moni-purchase-v2-field select,.moni-purchase-v2-search>input{display:block;width:100%;max-width:100%;min-width:0;height:42px;border:1px solid #d5e3e0;border-radius:12px;background:#fbfdfd;padding:0 10px;color:#173b52;font-size:12px;font-weight:700}.moni-purchase-v2-search{position:relative;min-width:0}.moni-purchase-v2-options{position:absolute;z-index:1500;top:45px;left:0;right:0;max-height:280px;overflow:auto;border:1px solid #cfe3df;border-radius:13px;background:#fff;padding:6px;box-shadow:0 16px 36px rgba(23,59,82,.18)}.moni-purchase-v2-options>small{display:block;padding:5px 7px;color:#7a9098;font-size:9px}.moni-purchase-v2-options button{display:grid;width:100%;gap:2px;border:0;border-radius:9px;background:transparent;padding:8px;text-align:left;color:#264b56}.moni-purchase-v2-options button:active{background:#eef8f5}.moni-purchase-v2-options button b{font-size:11px}.moni-purchase-v2-options button span{color:#7d9299;font-size:9px}.moni-purchase-v2-reference{display:grid;gap:3px;margin-top:9px;min-width:0;border:1px solid #dbe9e6;border-radius:12px;background:#f8fbfa;padding:9px 10px}.moni-purchase-v2-reference b{font-size:11px}.moni-purchase-v2-reference span{color:#70868e;font-size:9.5px}.moni-purchase-v2-primary{width:100%;min-height:46px;margin-top:13px;border:0;border-radius:13px;background:#188d77;color:#fff;font-size:12px;font-weight:900}.moni-purchase-v2-confirm{display:grid;gap:6px;border:1px solid #cfe5df;border-radius:14px;background:#f3faf8;padding:12px}.moni-purchase-v2-confirm span{color:#528076;font-size:10px;font-weight:900}.moni-purchase-v2-confirm pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit;font-size:11px;font-weight:750;line-height:1.7}.moni-purchase-v2-warning,.moni-purchase-v2-error{margin-top:8px;border-radius:12px;padding:9px 10px;font-size:10.5px;font-weight:750}.moni-purchase-v2-warning{background:#fff9e9;color:#93691c}.moni-purchase-v2-error{background:#fff2ef;color:#a84b41}.moni-purchase-v2-safety{color:#738b93;font-size:10px;line-height:1.5}.moni-purchase-v2-complete{display:grid;gap:8px}.moni-purchase-v2-complete .title{display:flex;align-items:center;gap:8px;color:#26715f}.moni-purchase-v2-complete .title span{display:grid;width:24px;height:24px;place-items:center;border-radius:999px;background:#2c9a7f;color:#fff}.moni-purchase-v2-complete p{margin:0;font-size:10.5px}.moni-purchase-v2-result{display:grid;grid-template-columns:1fr 1fr;gap:6px}.moni-purchase-v2-result span{display:grid;gap:2px;border-radius:10px;background:#f7faf9;padding:8px;color:#718890;font-size:9px}.moni-purchase-v2-result b{color:#244d58;font-size:11px}@media(max-width:340px){.moni-purchase-v2-grid,.moni-purchase-v2-result{grid-template-columns:1fr}.moni-purchase-v2-grid>.wide{grid-column:1}}
    `}</style>
  </>, host)
}
