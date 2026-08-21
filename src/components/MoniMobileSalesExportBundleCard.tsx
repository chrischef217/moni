'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type SearchOption = { id: string; label: string; sub?: string; meta?: any }
type Card = {
  stage: 'draft' | 'confirmation' | 'completed' | 'failed'
  domain: 'sales_export_bundle'
  operation: 'CREATE'
  source_user_message_id: string
  fields?: Record<string, any>
  missing_fields?: string[]
  unresolved_items?: any[]
  extracted_context?: Record<string, any>
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
const norm = (value: unknown) => txt(value).normalize('NFKC').toLowerCase().replace(/\s+/g, '')

function SearchSelect({ value, options, placeholder, onSelect, disabled }: { value: string; options: SearchOption[]; placeholder: string; onSelect: (option: SearchOption) => void; disabled?: boolean }) {
  const selected = options.find((row) => row.id === value)
  const [query, setQuery] = useState(selected?.label || '')
  const [open, setOpen] = useState(false)
  useEffect(() => setQuery(selected?.label || ''), [selected?.label])
  const rows = useMemo(() => {
    const q = norm(query)
    return options.filter((row) => !q || norm(row.label).includes(q) || norm(row.sub).includes(q) || norm(row.id).includes(q)).slice(0, 80)
  }, [options, query])
  return <div className="moni-export-search">
    <input value={query} disabled={disabled} placeholder={placeholder} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true) }} />
    {open && !disabled ? <div className="moni-export-options">
      <div className="count">{query ? `검색 결과 ${rows.length}개` : `전체 ${options.length}개`}</div>
      {rows.map((row) => <button key={row.id} type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => { onSelect(row); setQuery(row.label); setOpen(false) }}><b>{row.label}</b>{row.sub ? <small>{row.sub}</small> : null}</button>)}
      {!rows.length ? <div className="empty">검색 결과가 없습니다.</div> : null}
    </div> : null}
  </div>
}

function inferredCartons(row: any, setting: any) {
  const explicit = Math.trunc(num(row.cartons))
  if (explicit > 0) return explicit
  const quantity = num(row.source_quantity)
  const unit = txt(row.source_unit).toUpperCase()
  if (quantity <= 0) return ''
  if ((unit === 'CTN' || unit === 'BOX') && Number.isInteger(quantity)) return String(quantity)
  if (unit === 'EA' && num(setting?.units_per_carton) > 0) {
    const ratio = quantity / num(setting.units_per_carton)
    if (Math.abs(ratio - Math.round(ratio)) < 0.000001 && ratio >= 1) return String(Math.round(ratio))
  }
  if (unit === 'KG' && num(setting?.net_weight_kg) > 0) {
    const ratio = quantity / num(setting.net_weight_kg)
    if (Math.abs(ratio - Math.round(ratio)) < 0.000001 && ratio >= 1) return String(Math.round(ratio))
  }
  return ''
}

export default function MoniMobileSalesExportBundleCard() {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [fields, setFields] = useState<Record<string, any>>({})
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const activeSourceRef = useRef('')
  const suppressedSourceRef = useRef('')
  const loadedDraftSourceRef = useRef('')
  const fetchingRef = useRef(false)
  const threadId = () => txt(window.localStorage.getItem(THREAD_KEY))

  const refresh = useCallback(async () => {
    const id = threadId()
    if (!id || fetchingRef.current) return
    if (card?.stage === 'draft' && loadedDraftSourceRef.current === card.source_user_message_id) return
    fetchingRef.current = true
    setLoading(true)
    try {
      const response = await fetch(`/api/moni/mobile-sales-export-bundle?thread_id=${encodeURIComponent(id)}&_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok || !payload.ok) return
      const next = (payload.card || null) as Card | null
      if (!next || next.domain !== 'sales_export_bundle') { activeSourceRef.current = ''; setCard(null); return }
      if (next.source_user_message_id && suppressedSourceRef.current === next.source_user_message_id) return
      if (next.source_user_message_id && suppressedSourceRef.current && suppressedSourceRef.current !== next.source_user_message_id) suppressedSourceRef.current = ''
      activeSourceRef.current = next.source_user_message_id
      setCard(next)
      if (next.stage === 'draft' && loadedDraftSourceRef.current !== next.source_user_message_id) {
        loadedDraftSourceRef.current = next.source_user_message_id
        setFields(next.fields || {})
        setError('')
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '대화 내용을 문서 입력값으로 정리하지 못했습니다.')
    } finally {
      fetchingRef.current = false
      setLoading(false)
    }
  }, [card?.stage, card?.source_user_message_id])

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return
    const scroller = root.querySelector<HTMLElement>('header + div')
    if (!scroller) return
    const node = document.createElement('div')
    node.dataset.moniSalesExportBundleHost = 'true'
    node.className = 'moni-sales-export-bundle-host'
    scroller.appendChild(node)
    setHost(node)
    const hideForNewTurn = () => {
      suppressedSourceRef.current = activeSourceRef.current
      loadedDraftSourceRef.current = ''
      setCard(null)
      setError('')
    }
    window.addEventListener('moni:user-turn-start', hideForNewTurn)
    const timer = window.setInterval(() => void refresh(), 1300)
    void refresh()
    return () => { window.removeEventListener('moni:user-turn-start', hideForNewTurn); window.clearInterval(timer); node.remove() }
  }, [refresh])

  if (!host) return null
  if (!card && !loading) return null

  const destinations: SearchOption[] = (card?.options?.destinations || []).map((row: any) => ({ id: txt(row.id), label: txt(row.label), sub: txt(row.sub), meta: row }))
  const exportProducts: SearchOption[] = (card?.options?.export_products || []).map((row: any) => ({ id: txt(row.id), label: txt(row.label), sub: txt(row.sub), meta: row.meta }))
  const items = Array.isArray(fields.items) ? fields.items : []
  const missingNow: string[] = []
  if (!txt(fields.consignee_id)) missingNow.push('수출처(Consignee)')
  items.forEach((row: any, index: number) => {
    if (!txt(row.export_product_setting_id)) missingNow.push(`${index + 1}번째 품목 공식 수출품목`)
    if (num(row.cartons) < 1) missingNow.push(`${index + 1}번째 품목 CTN 수량`)
  })
  if (!items.length) missingNow.push('수출 품목')

  function updateField(key: string, value: any) { setFields((current) => ({ ...current, [key]: value })) }
  function updateItem(index: number, patch: Record<string, any>) {
    setFields((current) => ({ ...current, items: (Array.isArray(current.items) ? current.items : []).map((row: any, rowIndex: number) => rowIndex === index ? { ...row, ...patch } : row) }))
  }
  function chooseProduct(index: number, option: SearchOption) {
    const setting = option.meta || {}
    const current = items[index] || {}
    updateItem(index, {
      export_product_setting_id: option.id,
      cartons: inferredCartons(current, setting),
      unit_price: setting.default_unit_price ?? '',
      price_overridden: false,
      price_override_reason: '',
    })
  }

  async function prepare() {
    const id = threadId()
    if (!id || !card || missingNow.length) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/moni/mobile-sales-export-bundle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'prepare', thread_id: id, source_user_message_id: card.source_user_message_id, fields }) })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '수출 문서 미리보기를 만들지 못했습니다.')
      setCard({ ...card, stage: 'confirmation', confirmation_id: payload.confirmation.confirmation_id, preview_text: payload.confirmation.preview_text, warnings: payload.confirmation.warnings || [] })
    } catch (reason) { setError(reason instanceof Error ? reason.message : '수출 문서 미리보기를 만들지 못했습니다.') }
    finally { setBusy(false) }
  }

  async function execute() {
    const id = threadId()
    if (!id || !card?.confirmation_id) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/moni/mobile-sales-export-bundle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'execute', thread_id: id, source_user_message_id: card.source_user_message_id, confirmation_id: card.confirmation_id }) })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '문서 생성에 실패했습니다.')
      setCard({ ...card, stage: 'completed', result: payload.result, busy: false })
    } catch (reason) { setError(reason instanceof Error ? reason.message : '문서 생성에 실패했습니다.') }
    finally { setBusy(false) }
  }

  const result = card?.result?.result || card?.result || {}
  const exportDocument = result?.document || {}

  return createPortal(<>
    <style>{`
      .moni-sales-export-bundle-host{padding:8px 14px 18px;box-sizing:border-box;width:100%;max-width:100%}
      .moni-export-card{box-sizing:border-box;width:100%;max-width:720px;margin:0 auto;border:1px solid #cce4df;border-radius:24px;background:#fff;padding:18px;box-shadow:0 12px 34px rgba(33,83,76,.08);color:#173b52}
      .moni-export-kicker{font-size:11px;font-weight:900;letter-spacing:.05em;color:#14856f}.moni-export-card h3{margin:5px 0 8px;font-size:20px}.moni-export-help{font-size:12px;line-height:1.6;color:#69818a;background:#f3f8f7;border-radius:14px;padding:11px 12px}
      .moni-export-missing{margin:12px 0;border:1px solid #f2cf85;background:#fff9e8;border-radius:14px;padding:11px 12px;color:#8a5a00;font-size:12px;line-height:1.55}.moni-export-missing b{display:block;margin-bottom:4px}
      .moni-export-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin-top:12px}.moni-export-field{min-width:0}.moni-export-field.wide{grid-column:1/-1}.moni-export-field>span{display:block;margin:0 0 5px;font-size:11px;font-weight:800;color:#526f78}.moni-export-field input{box-sizing:border-box;width:100%;min-width:0;border:1px solid #d6e4e1;border-radius:12px;padding:11px 12px;font-size:13px;color:#173b52;background:#fff;outline:none}.moni-export-field input:focus{border-color:#2da88f;box-shadow:0 0 0 2px rgba(45,168,143,.1)}
      .moni-export-search{position:relative;min-width:0}.moni-export-search>input{box-sizing:border-box;width:100%;min-width:0;border:1px solid #d6e4e1;border-radius:12px;padding:11px 12px;font-size:13px}.moni-export-options{position:absolute;z-index:1900;left:0;right:0;top:calc(100% + 5px);max-height:260px;overflow:auto;border:1px solid #cbded9;border-radius:13px;background:#fff;padding:5px;box-shadow:0 14px 32px rgba(23,59,82,.18)}.moni-export-options .count,.moni-export-options .empty{padding:7px 9px;font-size:10px;color:#789099}.moni-export-options button{display:block;width:100%;border:0;border-radius:9px;background:#fff;padding:9px;text-align:left;color:#173b52}.moni-export-options button:active{background:#edf8f5}.moni-export-options button small{display:block;margin-top:3px;color:#789099;font-size:10px;line-height:1.4}
      .moni-export-item{margin-top:10px;border:1px solid #dce9e6;border-radius:16px;padding:12px;background:#fbfefd}.moni-export-source{margin-bottom:9px;font-size:12px;line-height:1.5;color:#48646d}.moni-export-source b{color:#173b52}.moni-export-actions{display:flex;gap:8px;margin-top:14px}.moni-export-primary{width:100%;border:0;border-radius:13px;background:#17977f;color:#fff;padding:13px;font-weight:900;font-size:13px}.moni-export-primary:disabled{opacity:.38}.moni-export-error{margin-top:10px;border:1px solid #f0b7b0;background:#fff2f0;border-radius:12px;padding:10px 11px;color:#b42318;font-size:12px;font-weight:800;line-height:1.5}.moni-export-preview{white-space:pre-wrap;margin-top:12px;border:1px solid #d9e8e4;background:#f7fbfa;border-radius:14px;padding:12px;font-size:12px;line-height:1.65}.moni-export-links{display:grid;gap:8px;margin-top:12px}.moni-export-links a{display:block;text-decoration:none;border:1px solid #b9dcd4;border-radius:12px;padding:11px 12px;color:#14745f;font-size:12px;font-weight:900;background:#f4fbf9}
      @media(max-width:520px){.moni-export-grid{grid-template-columns:minmax(0,1fr)}.moni-export-field.wide{grid-column:auto}.moni-export-card{padding:15px;border-radius:20px}}
    `}</style>
    <section className="moni-export-card">
      <div className="moni-export-kicker">MONI 대화 자동입력 · 수출 문서 번들</div>
      <h3>거래명세표 + Invoice + Packing List</h3>
      {loading && !card ? <div className="moni-export-help">앞 대화에서 이미 입력한 품목·수량·수출정보를 읽어 공식 마스터와 매칭하고 있습니다. 빈 폼을 다시 만들지 않습니다.</div> : null}
      {card?.stage === 'draft' ? <>
        <div className="moni-export-help">앞 대화에서 확인 가능한 값은 자동으로 채웠습니다. <b>이미 말한 값은 다시 입력할 필요가 없습니다.</b> 정확히 매칭되지 않거나 포장단위가 부족한 항목만 아래에서 확인하세요.</div>
        {missingNow.length ? <div className="moni-export-missing"><b>추가 확인이 필요한 값</b>{missingNow.map((row) => <div key={row}>• {row}</div>)}</div> : <div className="moni-export-missing" style={{ borderColor: '#b8dfd2', background: '#f0fbf7', color: '#17745f' }}><b>대화값 자동입력 완료</b>필수값이 모두 채워졌습니다. 아래 내용을 확인한 뒤 미리보기를 만들면 됩니다.</div>}
        <div className="moni-export-grid">
          <label className="moni-export-field"><span>문서일</span><input type="date" value={txt(fields.document_date)} onChange={(event) => updateField('document_date', event.target.value)} /></label>
          <div className="moni-export-field"><span>수출처(Consignee)</span><SearchSelect value={txt(fields.consignee_id)} options={destinations} placeholder="수출처 검색" onSelect={(option) => updateField('consignee_id', option.id)} /></div>
        </div>
        <div style={{ marginTop: 14, fontSize: 12, fontWeight: 900 }}>수출 품목</div>
        {items.map((row: any, index: number) => <div className="moni-export-item" key={`${index}:${txt(row.source_query)}`}>
          <div className="moni-export-source"><b>{index + 1}. 대화에서 추출:</b> {txt(row.source_query) || '품목명 미확인'}{row.source_specification ? ` · ${txt(row.source_specification)}` : ''}{row.source_quantity ? ` · ${txt(row.source_quantity)} ${txt(row.source_unit)}` : ''}</div>
          <div className="moni-export-grid">
            <div className="moni-export-field"><span>공식 수출품목</span><SearchSelect value={txt(row.export_product_setting_id)} options={exportProducts} placeholder="공식 제품 검색" onSelect={(option) => chooseProduct(index, option)} /></div>
            <label className="moni-export-field"><span>수량(CTN)</span><input inputMode="numeric" type="number" min="1" value={txt(row.cartons)} onChange={(event) => updateItem(index, { cartons: event.target.value })} /></label>
          </div>
        </div>)}
        <details style={{ marginTop: 12 }}><summary style={{ fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>추가 수출조건 보기/수정</summary><div className="moni-export-grid">
          <label className="moni-export-field"><span>Incoterm</span><input value={txt(fields.incoterm)} onChange={(event) => updateField('incoterm', event.target.value)} /></label>
          <label className="moni-export-field"><span>Final Destination</span><input value={txt(fields.final_destination)} onChange={(event) => updateField('final_destination', event.target.value)} /></label>
          <label className="moni-export-field"><span>Port of Loading</span><input value={txt(fields.port_of_loading)} onChange={(event) => updateField('port_of_loading', event.target.value)} /></label>
          <label className="moni-export-field"><span>Vessel / Flight</span><input value={txt(fields.vessel_flight)} onChange={(event) => updateField('vessel_flight', event.target.value)} /></label>
        </div></details>
        {error ? <div className="moni-export-error">{error}</div> : null}
        <div className="moni-export-actions"><button className="moni-export-primary" type="button" disabled={busy || missingNow.length > 0} onClick={() => void prepare()}>{busy ? '확인 중...' : missingNow.length ? `부족한 값 ${missingNow.length}개 확인 필요` : '자동 입력 내용 확인'}</button></div>
      </> : null}
      {card?.stage === 'confirmation' ? <>
        <div className="moni-export-help">실제 저장 전 최종 미리보기입니다. 이 단계에서는 아직 DB나 문서를 생성하지 않았습니다.</div>
        <div className="moni-export-preview">{card.preview_text}</div>
        {(card.warnings || []).map((row) => <div key={row} className="moni-export-missing">{row}</div>)}
        {error ? <div className="moni-export-error">{error}</div> : null}
        <button className="moni-export-primary" style={{ marginTop: 12 }} type="button" disabled={busy} onClick={() => void execute()}>{busy ? '생성 중...' : '최종 승인 · 3종 문서 생성'}</button>
      </> : null}
      {card?.stage === 'completed' ? <>
        <div className="moni-export-help"><b>처리 완료.</b> 같은 수출 document를 기준으로 Invoice·Packing List를 생성하고 판매관리와 동기화해 거래명세표까지 만들었습니다.</div>
        <div className="moni-export-preview">Invoice: {txt(exportDocument.invoice_no) || '-'}\nPacking List: {txt(exportDocument.packing_list_no) || '-'}\n거래명세번호: {txt(result.statement_number) || '-'}</div>
        <div className="moni-export-links">
          {result.statement_url ? <a href={result.statement_url} target="_blank" rel="noreferrer">거래명세표 보기</a> : null}
          {result.invoice_url ? <a href={result.invoice_url} target="_blank" rel="noreferrer">Commercial Invoice 보기</a> : null}
          {result.packing_list_url ? <a href={result.packing_list_url} target="_blank" rel="noreferrer">Packing List 보기</a> : null}
          {result.export_bundle_url ? <a href={result.export_bundle_url} target="_blank" rel="noreferrer">Invoice + Packing List 함께 보기</a> : null}
        </div>
      </> : null}
      {card?.stage === 'failed' ? <div className="moni-export-error">{card.error || '문서 생성에 실패했습니다.'}</div> : null}
    </section>
  </>, host)
}
