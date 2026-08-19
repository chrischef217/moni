'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Domain = 'packaging_inbound' | 'production_plan' | 'production_work' | 'sales_order' | 'purchase' | 'payment'
type Operation = 'CREATE' | 'UPDATE' | 'DELETE' | 'CANCEL' | 'COMPLETE' | 'CONFIRM'
type Card = {
  stage: 'draft' | 'confirmation' | 'completed' | 'failed'
  domain: Domain
  operation: Operation
  source_user_message_id: string
  fields?: Record<string, any>
  candidates?: any[]
  options?: Record<string, any[]>
  confirmation_id?: string
  preview_text?: string
  warnings?: string[]
  result?: Record<string, any>
  error?: string
}

type SearchOption = { id: string; label: string; sub?: string; disabled?: boolean; meta?: any }
const THREAD_KEY = 'moni-global-agent-thread-v11'
const text = (value: unknown) => String(value ?? '').trim()
const number = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }
const normalize = (value: unknown) => text(value).normalize('NFKC').toLowerCase().replace(/\s+/g, '')
const kg = (grams: unknown) => `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(number(grams) / 1000)}kg`
const won = (value: unknown) => `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(number(value))}원`


function cardHasFocus(selector: string) {
  const host = document.querySelector<HTMLElement>(selector)
  const active = document.activeElement
  return Boolean(host && active instanceof HTMLElement && host.contains(active))
}

function domainTitle(domain: Domain, operation: Operation) {
  if (domain === 'packaging_inbound') return operation === 'CREATE' ? '부재료 입고 입력' : operation === 'UPDATE' ? '부재료 입고 수정' : '부재료 입고 삭제'
  if (domain === 'production_plan') return operation === 'CREATE' ? '생산계획 입력' : operation === 'UPDATE' ? '생산계획 수정' : '생산계획 삭제'
  if (domain === 'production_work') return operation === 'CREATE' ? '생산 작업지시 입력' : operation === 'UPDATE' ? '생산 작업지시 수정' : operation === 'CANCEL' ? '생산 작업지시 취소' : operation === 'COMPLETE' ? '생산완료 입력' : '생산확정 및 원재료 차감'
  if (domain === 'sales_order') return operation === 'CREATE' ? '제품 판매등록' : operation === 'UPDATE' ? '제품 판매 수정' : '제품 판매 취소'
  if (domain === 'purchase') return operation === 'CREATE' ? '매입 등록' : '매입 취소'
  return '매입대금 지급'
}

function prepareButtonLabel(operation: Operation) {
  if (operation === 'UPDATE') return '변경 내용 확인'
  if (operation === 'DELETE') return '삭제 내용 확인'
  if (operation === 'CANCEL') return '취소 내용 확인'
  if (operation === 'COMPLETE') return '완료 내용 확인'
  if (operation === 'CONFIRM') return '확정 내용 확인'
  return '입력 내용 확인'
}

function SearchSelect({ value, options, placeholder, onSelect, disabled = false }: { value: string; options: SearchOption[]; placeholder: string; onSelect: (option: SearchOption) => void; disabled?: boolean }) {
  const selected = options.find((option) => option.id === value)
  const [query, setQuery] = useState(selected?.label || '')
  const [open, setOpen] = useState(false)
  useEffect(() => { setQuery(selected?.label || '') }, [selected?.label])
  const filtered = useMemo(() => {
    const q = normalize(query)
    return options.filter((option) => !q || normalize(option.label).includes(q) || normalize(option.sub).includes(q) || normalize(option.id).includes(q))
  }, [options, query])
  return <div className="moni-biz-search"><input type="search" value={query} disabled={disabled} placeholder={placeholder} onFocus={() => setOpen(true)} onChange={(e) => { setQuery(e.target.value); setOpen(true) }}/>{open && !disabled && <div className="moni-biz-options"><div className="moni-biz-options-count">{query ? `검색 결과 ${filtered.length}개` : `전체 ${options.length}개`}</div>{filtered.map((option) => <button key={option.id} type="button" disabled={option.disabled} className={option.disabled ? 'is-disabled' : ''} onPointerDown={(e) => e.preventDefault()} onClick={() => { onSelect(option); setQuery(option.label); setOpen(false) }}><span><b>{option.label}</b>{option.sub && <small>{option.sub}</small>}</span>{option.disabled && <em>사용 불가</em>}</button>)}</div>}</div>
}

function Field({ label, required = false, children, span = false }: { label: string; required?: boolean; children: React.ReactNode; span?: boolean }) {
  return <label className={`moni-crud-field ${span ? 'moni-crud-span-2' : ''}`}><span className="moni-crud-label">{label}{required && <b>필수</b>}</span>{children}</label>
}

export default function MoniMobileBusinessCards() {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [fields, setFields] = useState<Record<string, any>>({})
  const [targetId, setTargetId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sourceRef = useRef('')
  const activeCardSourceRef = useRef('')
  const suppressedCardSourceRef = useRef('')
  const threadId = () => text(window.localStorage.getItem(THREAD_KEY))

  const refresh = useCallback(async () => {
    const id = threadId()
    if (!id) return
    try {
      const response = await fetch(`/api/moni/mobile-business-actions?thread_id=${encodeURIComponent(id)}&_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok || !payload.ok) return
      const next = (payload.card || null) as Card | null
      if (cardHasFocus('[data-moni-business-card-host="true"]')) return
      const nextSource = next?.source_user_message_id || ''
      if (nextSource && suppressedCardSourceRef.current === nextSource) return
      if (nextSource && suppressedCardSourceRef.current && suppressedCardSourceRef.current !== nextSource) suppressedCardSourceRef.current = ''
      activeCardSourceRef.current = nextSource
      setCard(next)
      if (next?.stage === 'draft') {
        const key = `${next.source_user_message_id}:${next.domain}:${next.operation}`
        if (sourceRef.current !== key) {
          sourceRef.current = key
          setFields(next.fields || {})
          setTargetId('')
          setError('')
        }
      }
    } catch { /* core chat remains available */ }
  }, [])

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return
    const cardHost = document.createElement('div')
    cardHost.className = 'moni-crud-host'
    cardHost.dataset.moniBusinessCardHost = 'true'
    const place = () => {
      const scroller = root.querySelector<HTMLElement>('header + div')
      if (!scroller) return
      if (cardHost.parentElement !== scroller) scroller.appendChild(cardHost)
      setHost(cardHost)
    }
    place()
    const hideCardForNewTurn = () => {
      suppressedCardSourceRef.current = activeCardSourceRef.current
      setCard(null)
      setError('')
    }
    window.addEventListener('moni:user-turn-start', hideCardForNewTurn)
    const observer = new MutationObserver(place)
    observer.observe(root, { childList: true, subtree: true })
    const timer = window.setInterval(() => void refresh(), 900)
    void refresh()
    return () => { window.removeEventListener('moni:user-turn-start', hideCardForNewTurn); observer.disconnect(); window.clearInterval(timer); cardHost.remove() }
  }, [refresh])

  const options = card?.options || {}
  const products = (options.products || []).filter((row: any) => row.is_active !== false && text(row.product_type) !== '반제품')
  const productOptions: SearchOption[] = products.map((row: any) => ({ id: text(row.id), label: text(row.product_name), sub: text(row.product_code) }))
  const packagingOptions: SearchOption[] = (options.packaging_materials || []).map((row: any) => ({ id: text(row.material_code || row.id), label: text(row.material_name), sub: [text(row.material_code), text(row.spec), text(row.material_type)].filter(Boolean).join(' · '), meta: row }))
  const clientOptions: SearchOption[] = (options.clients || []).map((row: any) => ({ id: text(row.id), label: text(row.company_name), meta: row }))
  const variantOptions: SearchOption[] = (options.variants || []).map((row: any) => ({ id: text(row.id), label: `${text(row.product_name)} · ${text(row.variant_name)}`, sub: `${text(row.sales_unit).toUpperCase()} · 기본 ${won(row.default_unit_price)} · MOQ ${number(row.moq_quantity)}`, meta: row }))
  const supplierOptions: SearchOption[] = (options.suppliers || []).map((row: any) => ({ id: text(row.id), label: text(row.company_name), sub: [text(row.default_payment_method), text(row.tax_type)].filter(Boolean).join(' · '), meta: row }))
  const rawPurchaseOptions: SearchOption[] = (options.raw_materials || []).map((row: any) => ({ id: text(row.id), label: text(row.item_name), sub: [text(row.item_code), row.packing_weight_g ? kg(row.packing_weight_g) : '', row.is_stock_managed === false ? '재고관리 미설정' : ''].filter(Boolean).join(' · '), disabled: row.is_stock_managed === false, meta: row }))

  function setField(key: string, value: any) { setFields((current) => ({ ...current, [key]: value })) }
  function chooseCandidate(candidate: any) {
    setTargetId(text(candidate.id))
    if (!card) return
    if (card.domain === 'production_plan' && card.operation === 'UPDATE') setFields({ plan_date: text(candidate.plan_date), product_id: text(candidate.product_id), planned_quantity_kg: String(number(candidate.planned_quantity_g) / 1000), note: text(candidate.note) })
    if (card.domain === 'production_work') {
      if (card.operation === 'UPDATE') setFields({ record_id: candidate.id, work_date: text(candidate.work_date), product_id: text(candidate.product_id), planned_quantity_kg: String(number(candidate.planned_quantity_g) / 1000), lot_number: text(candidate.lot_number), worker_name: text(candidate.worker_name), note: text(candidate.note), reason: '' })
      else if (card.operation === 'COMPLETE') setFields({ record_id: candidate.id, actual_quantity_kg: '', defect_quantity_kg: '0', sample_quantity_kg: '0', worker_name: text(candidate.worker_name), inspection_result: text(candidate.inspection_result) || '적합', inspection_note: text(candidate.inspection_note), sanitation_check: candidate.sanitation_check !== false })
      else setFields((current) => ({ ...current, record_id: candidate.id }))
    }
    if (card.domain === 'packaging_inbound' && card.operation === 'UPDATE') setFields({ material_code: text(candidate.material_code), material_name: text(candidate.material_name), tx_date: text(candidate.txn_date), quantity: String(number(candidate.quantity)), counterparty: '', note: text(candidate.note) })
    if (card.domain === 'sales_order' && card.operation === 'UPDATE') setFields((current) => ({ ...current, sale_date: text(candidate.sale_date), client_id: text(candidate.client_id), status: text(candidate.status) || 'confirmed', vat_rate: String(number(candidate.vat_rate) || 10), note: text(candidate.note), items: Array.isArray(candidate.items) && candidate.items.length ? candidate.items.map((row: any) => ({ sales_variant_id: text(row.sales_variant_id), quantity: String(number(row.quantity)), unit_price: String(number(row.unit_price)) })) : current.items }))
    setError('')
  }

  function salesPrice(variantId: string, clientId: string) {
    const variant = (options.variants || []).find((row: any) => text(row.id) === variantId)
    const term = (options.terms || []).find((row: any) => text(row.variant_id) === variantId && text(row.client_id) === clientId && row.active !== false)
    return { price: number(term?.unit_price ?? variant?.default_unit_price), moq: number(term?.moq_quantity ?? variant?.moq_quantity), source: term ? '거래처 예외단가' : '기본단가' }
  }
  function updateSaleItem(index: number, patch: Record<string, any>) {
    setFields((current) => ({ ...current, items: (Array.isArray(current.items) ? current.items : []).map((row: any, rowIndex: number) => rowIndex === index ? { ...row, ...patch } : row) }))
  }

  async function prepare() {
    if (!card || card.stage !== 'draft' || busy) return
    const needsTarget = ['UPDATE', 'DELETE', 'CANCEL', 'COMPLETE', 'CONFIRM'].includes(card.operation)
    if (needsTarget && !targetId && !text(fields.record_id)) { setError('대상 기록을 먼저 선택해 주세요.'); return }
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/moni/mobile-business-actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'prepare', thread_id: threadId(), source_user_message_id: card.source_user_message_id, domain: card.domain, operation: card.operation, target_id: targetId || fields.record_id || undefined, fields }) })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '입력 내용을 확인하지 못했습니다.')
      const confirmation = payload.confirmation
      setCard({ ...card, stage: 'confirmation', confirmation_id: confirmation.confirmation_id || confirmation.id, preview_text: confirmation.preview_text, warnings: confirmation.warnings || [] })
    } catch (value) { setError(value instanceof Error ? value.message : '입력 내용을 확인하지 못했습니다.') } finally { setBusy(false) }
  }
  async function execute() {
    if (!card || card.stage !== 'confirmation' || !card.confirmation_id || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/moni/mobile-business-actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'execute', thread_id: threadId(), confirmation_id: card.confirmation_id }) })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '업무를 실행하지 못했습니다.')
      setCard({ ...card, stage: 'completed', result: payload.result || {} })
    } catch (value) { setError(value instanceof Error ? value.message : '업무를 실행하지 못했습니다.') } finally { setBusy(false) }
  }

  function CandidateList() {
    if (!card || !['UPDATE', 'DELETE', 'CANCEL', 'COMPLETE', 'CONFIRM'].includes(card.operation)) return null
    const candidates = card.candidates || []
    return <div className="moni-crud-section"><span className="moni-crud-label">대상 기록 선택<b>필수</b></span><div className="moni-crud-candidates">{candidates.length ? candidates.map((row: any) => {
      let main = text(row.material_name || row.product_name || row.purchase_no || row.statement_number || row.id)
      let sub = text(row.txn_date || row.plan_date || row.work_date || row.sale_date || row.purchase_date)
      if (card.domain === 'production_plan') sub += ` · ${kg(row.planned_quantity_g)}`
      if (card.domain === 'production_work') sub += ` · LOT ${text(row.lot_number)} · ${kg(row.planned_quantity_g)}`
      if (card.domain === 'packaging_inbound') sub += ` · ${number(row.quantity)}EA`
      if (card.domain === 'payment') sub += ` · 미지급 ${won(row.outstanding_amount)}`
      return <button key={row.id} type="button" onClick={() => chooseCandidate(row)} className={`moni-crud-candidate ${targetId === text(row.id) ? 'is-selected' : ''}`}><span className="moni-crud-radio"/><span className="moni-crud-candidate-main"><b>{main}</b><small>{sub}</small></span></button>
    }) : <div className="moni-crud-empty">조건에 맞는 업무 기록이 없습니다.</div>}</div></div>
  }

  function DraftFields() {
    if (!card || card.stage !== 'draft') return null
    if (card.operation === 'DELETE' || card.operation === 'CANCEL' || card.operation === 'CONFIRM') return null
    if (card.domain === 'packaging_inbound') {
      const selected = (options.packaging_materials || []).find((row: any) => text(row.material_code || row.id) === text(fields.material_code))
      return <div className="moni-crud-grid"><Field label="부재료" required span><SearchSelect value={text(fields.material_code)} options={packagingOptions} placeholder="부재료명·코드·규격을 입력해서 전체 목록 검색" onSelect={(option) => setFields((current) => ({ ...current, material_code: option.id, material_name: option.label, counterparty: text(option.meta?.supplier) || current.counterparty }))}/></Field>{selected && <div className="moni-biz-reference moni-crud-span-2"><b>선택 부재료 연결 정보</b><div><span>현재재고 {number(selected.current_stock)}EA</span>{selected.supplier && <span>주 매입처 {selected.supplier}</span>}{selected.unit_price && <span>기준단가 {won(selected.unit_price)}</span>}{selected.spec && <span>규격 {selected.spec}</span>}{selected.material_type && <span>유형 {selected.material_type}</span>}</div></div>}<Field label="입고일" required><input type="date" value={text(fields.tx_date)} onChange={(e) => setField('tx_date', e.target.value)}/></Field><Field label="입고수량(EA)" required><input inputMode="numeric" value={text(fields.quantity)} onChange={(e) => setField('quantity', e.target.value)}/></Field><Field label="매입처"><input value={text(fields.counterparty)} onChange={(e) => setField('counterparty', e.target.value)}/></Field><Field label="비고"><input value={text(fields.note)} onChange={(e) => setField('note', e.target.value)}/></Field></div>
    }
    if (card.domain === 'production_plan') return <div className="moni-crud-grid"><Field label="생산일" required><input type="date" value={text(fields.plan_date)} onChange={(e) => setField('plan_date', e.target.value)}/></Field><Field label="제품" required><SearchSelect value={text(fields.product_id)} options={productOptions} placeholder="제품명·코드 검색" onSelect={(option) => setField('product_id', option.id)}/></Field><Field label="계획생산량(kg)" required><input inputMode="decimal" value={text(fields.planned_quantity_kg)} onChange={(e) => setField('planned_quantity_kg', e.target.value)}/></Field><Field label="비고"><input value={text(fields.note)} onChange={(e) => setField('note', e.target.value)}/></Field></div>
    if (card.domain === 'production_work') {
      if (card.operation === 'COMPLETE') return <div className="moni-crud-grid"><Field label="실제 완료량(kg)" required><input inputMode="decimal" value={text(fields.actual_quantity_kg)} onChange={(e) => setField('actual_quantity_kg', e.target.value)}/></Field><Field label="불량량(kg)"><input inputMode="decimal" value={text(fields.defect_quantity_kg)} onChange={(e) => setField('defect_quantity_kg', e.target.value)}/></Field><Field label="샘플량(kg)"><input inputMode="decimal" value={text(fields.sample_quantity_kg)} onChange={(e) => setField('sample_quantity_kg', e.target.value)}/></Field><Field label="작업자"><input value={text(fields.worker_name)} onChange={(e) => setField('worker_name', e.target.value)}/></Field><Field label="검사결과"><input value={text(fields.inspection_result)} onChange={(e) => setField('inspection_result', e.target.value)}/></Field><Field label="검사 비고"><input value={text(fields.inspection_note)} onChange={(e) => setField('inspection_note', e.target.value)}/></Field><Field label="위생 확인"><select value={fields.sanitation_check === false ? 'false' : 'true'} onChange={(e) => setField('sanitation_check', e.target.value === 'true')}><option value="true">확인 완료</option><option value="false">미확인</option></select></Field></div>
      return <div className="moni-crud-grid"><Field label="작업일" required><input type="date" value={text(fields.work_date)} onChange={(e) => setField('work_date', e.target.value)}/></Field>{card.operation === 'CREATE' && <Field label="제품" required><SearchSelect value={text(fields.product_id)} options={productOptions} placeholder="제품명·코드 검색" onSelect={(option) => setField('product_id', option.id)}/></Field>}<Field label="계획생산량(kg)" required><input inputMode="decimal" value={text(fields.planned_quantity_kg)} onChange={(e) => setField('planned_quantity_kg', e.target.value)}/></Field><Field label="LOT"><input value={text(fields.lot_number)} onChange={(e) => setField('lot_number', e.target.value)} placeholder="비우면 자동 생성"/></Field><Field label="작업자"><input value={text(fields.worker_name)} onChange={(e) => setField('worker_name', e.target.value)}/></Field><Field label="비고"><input value={text(fields.note)} onChange={(e) => setField('note', e.target.value)}/></Field></div>
    }
    if (card.domain === 'sales_order') {
      const items = Array.isArray(fields.items) ? fields.items : []
      return <div className="moni-crud-grid"><Field label="판매일" required><input type="date" value={text(fields.sale_date)} onChange={(e) => setField('sale_date', e.target.value)}/></Field><Field label="거래처" required><SearchSelect value={text(fields.client_id)} options={clientOptions} placeholder="거래처명 검색" onSelect={(option) => { setField('client_id', option.id); setFields((current) => ({ ...current, client_id: option.id, items: (current.items || []).map((row: any) => { const pricing = salesPrice(text(row.sales_variant_id), option.id); return { ...row, unit_price: pricing.price ? String(pricing.price) : row.unit_price } }) })) }}/></Field><Field label="상태"><select value={text(fields.status) || 'confirmed'} onChange={(e) => setField('status', e.target.value)}><option value="confirmed">확정</option><option value="draft">임시</option></select></Field><Field label="부가세율(%)"><input inputMode="decimal" value={text(fields.vat_rate)} onChange={(e) => setField('vat_rate', e.target.value)}/></Field><div className="moni-biz-items moni-crud-span-2"><div className="moni-biz-items-head"><b>판매 품목</b><button type="button" onClick={() => setFields((current) => ({ ...current, items: [...(current.items || []), { sales_variant_id: '', quantity: '', unit_price: '' }] }))}>+ 품목 추가</button></div>{items.map((item: any, index: number) => { const pricing = salesPrice(text(item.sales_variant_id), text(fields.client_id)); return <div className="moni-biz-item" key={index}><SearchSelect value={text(item.sales_variant_id)} options={variantOptions} placeholder="제품·판매규격 검색" onSelect={(option) => { const p = salesPrice(option.id, text(fields.client_id)); updateSaleItem(index, { sales_variant_id: option.id, unit_price: p.price ? String(p.price) : '' }) }}/><input inputMode="decimal" value={text(item.quantity)} onChange={(e) => updateSaleItem(index, { quantity: e.target.value })} placeholder="수량"/><input inputMode="decimal" value={text(item.unit_price)} onChange={(e) => updateSaleItem(index, { unit_price: e.target.value })} placeholder="단가"/><small>{item.sales_variant_id ? `${pricing.source} · MOQ ${pricing.moq}` : '판매규격을 선택하세요.'}</small>{items.length > 1 && <button type="button" className="remove" onClick={() => setFields((current) => ({ ...current, items: current.items.filter((_: any, i: number) => i !== index) }))}>삭제</button>}</div>})}</div><Field label="비고" span><input value={text(fields.note)} onChange={(e) => setField('note', e.target.value)}/></Field></div>
    }
    if (card.domain === 'purchase') {
      const materialOptions = fields.purchase_category === 'PACKAGING' ? packagingOptions : rawPurchaseOptions
      const selected = materialOptions.find((option) => option.id === text(fields.material_id))
      return <div className="moni-crud-grid"><Field label="매입처" required><SearchSelect value={text(fields.supplier_id)} options={supplierOptions} placeholder="매입처명 검색" onSelect={(option) => setField('supplier_id', option.id)}/></Field><Field label="구분" required><select value={text(fields.purchase_category) || 'RAW_MATERIAL'} onChange={(e) => setFields((current) => ({ ...current, purchase_category: e.target.value, material_id: '', unit: e.target.value === 'PACKAGING' ? 'EA' : 'KG', unit_price: '' }))}><option value="RAW_MATERIAL">원재료</option><option value="PACKAGING">부재료</option></select></Field><Field label="매입일" required><input type="date" value={text(fields.purchase_date)} onChange={(e) => setField('purchase_date', e.target.value)}/></Field><Field label="입고일" required><input type="date" value={text(fields.receipt_date)} onChange={(e) => setField('receipt_date', e.target.value)}/></Field><Field label="품목" required span><SearchSelect value={text(fields.material_id)} options={materialOptions} placeholder="품목명·코드 검색" onSelect={(option) => setFields((current) => ({ ...current, material_id: option.id, unit_price: String(number(option.meta?.unit_price_per_kg ?? option.meta?.unit_price) || ''), material_name: option.label }))}/></Field>{selected && <div className="moni-biz-reference moni-crud-span-2"><b>선택 품목 연결 정보</b><div>{selected.meta?.supplier && <span>주 매입처 {selected.meta.supplier}</span>}{selected.meta?.packing_weight_g && <span>포장 {kg(selected.meta.packing_weight_g)}</span>}{selected.meta?.current_stock_g != null && <span>현재재고 {kg(selected.meta.current_stock_g)}</span>}{selected.meta?.current_stock != null && <span>현재재고 {number(selected.meta.current_stock)}EA</span>}</div></div>}<Field label="수량" required><input inputMode="decimal" value={text(fields.quantity)} onChange={(e) => setField('quantity', e.target.value)}/></Field><Field label="단위" required><select value={text(fields.unit)} onChange={(e) => setField('unit', e.target.value)}>{fields.purchase_category === 'PACKAGING' ? <option value="EA">EA</option> : <><option value="KG">KG</option><option value="G">G</option><option value="EA">EA</option></>}</select></Field><Field label="단가" required><input inputMode="decimal" value={text(fields.unit_price)} onChange={(e) => setField('unit_price', e.target.value)}/></Field><Field label="세금계산서"><select value={text(fields.tax_invoice_status) || 'NOT_REQUIRED'} onChange={(e) => setField('tax_invoice_status', e.target.value)}><option value="NOT_REQUIRED">불필요</option><option value="NOT_RECEIVED">미수취</option><option value="RECEIVED">수취</option></select></Field><Field label="비고" span><input value={text(fields.notes)} onChange={(e) => setField('notes', e.target.value)}/></Field></div>
    }
    if (card.domain === 'payment') return <div className="moni-crud-grid"><Field label="지급 대상" required span><SearchSelect value={text(fields.purchase_id)} options={(card.candidates || []).map((row: any) => ({ id: text(row.id), label: `${text(row.purchase_no)} · ${text(row.supplier_name_snapshot)}`, sub: `${text(row.purchase_date)} · 미지급 ${won(row.outstanding_amount)}`, meta: row }))} placeholder="매입번호·매입처 검색" onSelect={(option) => { setTargetId(option.id); setFields((current) => ({ ...current, purchase_id: option.id, amount: String(number(option.meta?.outstanding_amount)), purchase_no: option.meta?.purchase_no })) }}/></Field><Field label="지급일" required><input type="date" value={text(fields.payment_date)} onChange={(e) => setField('payment_date', e.target.value)}/></Field><Field label="지급금액" required><input inputMode="decimal" value={text(fields.amount)} onChange={(e) => setField('amount', e.target.value)}/></Field><Field label="결제수단"><select value={text(fields.payment_method) || 'BANK_TRANSFER'} onChange={(e) => setField('payment_method', e.target.value)}><option value="BANK_TRANSFER">계좌이체</option><option value="CARD">카드</option><option value="CASH">현금</option><option value="OTHER">기타</option></select></Field><Field label="계좌/카드"><input value={text(fields.payment_account || fields.card_name)} onChange={(e) => setField(fields.payment_method === 'CARD' ? 'card_name' : 'payment_account', e.target.value)}/></Field><Field label="참조"><input value={text(fields.reference)} onChange={(e) => setField('reference', e.target.value)}/></Field><Field label="비고"><input value={text(fields.notes)} onChange={(e) => setField('notes', e.target.value)}/></Field></div>
    return null
  }

  if (!host || !card) return <BaseStyles />
  return <><BaseStyles />{createPortal(<section className={`moni-crud-card moni-crud-stage-${card.stage}`} aria-label={domainTitle(card.domain, card.operation)}><div className="moni-crud-head"><div><span className="moni-crud-kicker">MONI 업무 카드 · 모바일</span><h2>{domainTitle(card.domain, card.operation)}</h2></div><span className="moni-crud-badge">{card.stage === 'draft' ? '입력' : card.stage === 'confirmation' ? '확인 대기' : card.stage === 'completed' ? '완료' : '확인 필요'}</span></div>{card.stage === 'draft' && <><p className="moni-crud-note">대화를 길게 주고받지 않고 필요한 값을 한 번에 입력·수정합니다. 연결된 마스터 정보는 자동 제안하며 현재 업무값은 직접 수정할 수 있습니다.</p><CandidateList/><DraftFields/>{error && <div className="moni-crud-error">{error}</div>}<div className="moni-crud-actions"><button type="button" className={card.operation === 'DELETE' || card.operation === 'CANCEL' ? 'danger-soft' : 'primary'} disabled={busy || (['UPDATE','DELETE','CANCEL','COMPLETE','CONFIRM'].includes(card.operation) && !targetId && !text(fields.record_id))} onClick={() => void prepare()}>{busy ? '확인 중…' : prepareButtonLabel(card.operation)}</button></div></>}{card.stage === 'confirmation' && <><div className="moni-crud-preview"><span>실행 전 최종 미리보기</span><b>{card.preview_text}</b></div>{card.warnings?.length ? <div className="moni-crud-warnings">{card.warnings.map((warning, index) => <p key={index}>• {warning}</p>)}</div> : null}<p className="moni-crud-safety">아직 실제 데이터는 바뀌지 않았습니다. 아래 확정 버튼을 눌러야 실행됩니다.</p>{error && <div className="moni-crud-error">{error}</div>}<div className="moni-crud-actions"><button type="button" className={card.operation === 'DELETE' || card.operation === 'CANCEL' ? 'danger' : 'primary'} disabled={busy} onClick={() => void execute()}>{busy ? '실행 중…' : '최종 확정 및 실행'}</button></div></>}{card.stage === 'completed' && <div className="moni-crud-complete"><span>✓</span><div><b>처리 완료</b><p>{card.preview_text || '요청한 업무를 실제 데이터에 반영하고 결과를 확인했습니다.'}</p></div></div>}{card.stage === 'failed' && <div className="moni-crud-error">{card.error || '업무를 실행하지 못했습니다.'}</div>}</section>, host)}</>
}

function BaseStyles() {
  return <style jsx global>{`
    .moni-crud-host{display:block;margin-top:12px}.moni-crud-card{margin:12px 2px 4px;border:1px solid #cfe5df;border-radius:22px;background:rgba(255,255,255,.98);box-shadow:0 12px 34px rgba(23,59,82,.10);padding:16px;color:#173b52;text-align:left}.moni-crud-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.moni-crud-kicker{display:block;color:#1b8c78;font-size:10px;font-weight:900;letter-spacing:.08em}.moni-crud-head h2{margin:3px 0 0;font-size:16px;font-weight:950;letter-spacing:-.025em}.moni-crud-badge{border:1px solid #cce8e1;border-radius:999px;background:#eff9f6;padding:5px 8px;color:#247564;font-size:10px;font-weight:900}.moni-crud-note{margin:0 0 13px;border-radius:13px;background:#f5faf8;padding:9px 10px;color:#607b86;font-size:11px;font-weight:650;line-height:1.55}.moni-crud-section{margin-bottom:13px}.moni-crud-label{display:flex;align-items:center;gap:6px;margin-bottom:6px;color:#486671;font-size:11px;font-weight:850}.moni-crud-label b{border-radius:999px;background:#e9f7f3;padding:2px 5px;color:#187966;font-size:8px}.moni-crud-candidates{display:grid;gap:7px;max-height:260px;overflow:auto}.moni-crud-candidate{display:flex;align-items:flex-start;gap:9px;width:100%;border:1px solid #dbe8e5;border-radius:14px;background:#fbfdfc;padding:10px;text-align:left;color:#244653}.moni-crud-candidate.is-selected{border-color:#42ab95;background:#eef9f6;box-shadow:0 0 0 2px rgba(66,171,149,.09)}.moni-crud-radio{width:15px;height:15px;margin-top:1px;border:2px solid #a9bfba;border-radius:999px;background:white}.is-selected .moni-crud-radio{border:4px solid #2f9a83}.moni-crud-candidate-main{min-width:0;display:grid;gap:2px}.moni-crud-candidate-main b{font-size:11.5px;line-height:1.35}.moni-crud-candidate-main small{color:#6b838c;font-size:10.5px}.moni-crud-empty{border:1px dashed #d4e2df;border-radius:14px;padding:14px;color:#82969e;font-size:11px;text-align:center}.moni-crud-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.moni-crud-field{display:block;min-width:0}.moni-crud-span-2{grid-column:1/-1}.moni-crud-field input,.moni-crud-field select,.moni-biz-search>input{width:100%;height:42px;border:1px solid #d5e3e0;border-radius:12px;background:#fbfdfd;padding:0 11px;color:#173b52;font-size:12px;font-weight:700;outline:none}.moni-crud-field input:focus,.moni-crud-field select:focus,.moni-biz-search>input:focus{border-color:#4aaf99;box-shadow:0 0 0 3px rgba(74,175,153,.10)}.moni-crud-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.moni-crud-actions button{min-height:44px;border:0;border-radius:13px;padding:0 16px;font-size:12px;font-weight:900}.moni-crud-actions .primary{background:#188d77;color:white}.moni-crud-actions .danger{background:#c95145;color:white}.moni-crud-actions .danger-soft{border:1px solid #efc9c4;background:#fff2ef;color:#b3473e}.moni-crud-actions button:disabled{opacity:.42}.moni-crud-preview{display:grid;gap:6px;border:1px solid #cfe5df;border-radius:15px;background:#f3faf8;padding:12px}.moni-crud-preview span{color:#528076;font-size:10px;font-weight:900}.moni-crud-preview b{font-size:12px;line-height:1.6}.moni-crud-warnings{margin-top:8px;border-radius:13px;background:#fff8e9;padding:8px 10px;color:#9b6a17;font-size:10.5px;font-weight:750;line-height:1.5}.moni-crud-warnings p{margin:0}.moni-crud-safety{margin:9px 0 0;color:#80959d;font-size:10px;line-height:1.5}.moni-crud-complete{display:flex;gap:10px;align-items:flex-start;border:1px solid #bfe5d9;border-radius:15px;background:#edfaf5;padding:12px;color:#236c5b}.moni-crud-complete>span{display:flex;width:24px;height:24px;align-items:center;justify-content:center;border-radius:999px;background:#2c9a7f;color:white;font-weight:900}.moni-crud-complete b{font-size:12px}.moni-crud-complete p{margin:3px 0 0;font-size:10.5px;line-height:1.5}.moni-crud-error{margin-top:9px;border:1px solid #f1ccc5;border-radius:13px;background:#fff4f2;padding:9px 10px;color:#a84b41;font-size:10.5px;font-weight:750;line-height:1.5}.moni-biz-search{position:relative}.moni-biz-options{position:absolute;left:0;right:0;top:45px;z-index:120;max-height:300px;overflow:auto;border:1px solid #cfe3df;border-radius:14px;background:#fff;padding:6px;box-shadow:0 16px 36px rgba(23,59,82,.18)}.moni-biz-options-count{padding:6px 8px;color:#75909a;font-size:9px;font-weight:900}.moni-biz-options button{display:flex;width:100%;justify-content:space-between;align-items:center;gap:8px;border:0;border-radius:10px;background:transparent;padding:9px 8px;text-align:left;color:#234653}.moni-biz-options button:active{background:#eef8f5}.moni-biz-options button>span{display:grid;gap:2px;min-width:0}.moni-biz-options button b{font-size:11px}.moni-biz-options button small{color:#80959d;font-size:9px}.moni-biz-options button em{font-size:8px;font-style:normal;color:#a85b51}.moni-biz-options button.is-disabled{opacity:.45}.moni-biz-reference{border:1px solid #d9e9e5;border-radius:13px;background:#f7fbfa;padding:10px}.moni-biz-reference>b{font-size:10px;color:#367466}.moni-biz-reference>div{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.moni-biz-reference span{border:1px solid #e0ece9;border-radius:999px;background:#fff;padding:4px 7px;color:#55727d;font-size:9px}.moni-biz-items{display:grid;gap:8px}.moni-biz-items-head{display:flex;align-items:center;justify-content:space-between}.moni-biz-items-head b{font-size:11px}.moni-biz-items-head button{border:1px solid #cfe3df;border-radius:10px;background:#f3faf8;padding:6px 8px;color:#267766;font-size:10px;font-weight:900}.moni-biz-item{display:grid;grid-template-columns:minmax(0,2fr) 1fr 1fr auto;gap:6px;align-items:start;border:1px solid #e0ebe8;border-radius:13px;padding:8px}.moni-biz-item>input{height:42px;border:1px solid #d5e3e0;border-radius:10px;padding:0 8px;font-size:11px}.moni-biz-item>small{grid-column:1/4;color:#789097;font-size:9px}.moni-biz-item .remove{border:0;background:#fff2ef;color:#b3473e;border-radius:8px;padding:5px;font-size:9px}@media(max-width:430px){.moni-crud-grid{grid-template-columns:1fr 1fr}.moni-biz-item{grid-template-columns:1fr 1fr}.moni-biz-item>.moni-biz-search{grid-column:1/-1}.moni-biz-item>small{grid-column:1/-1}}
  `}</style>
}
