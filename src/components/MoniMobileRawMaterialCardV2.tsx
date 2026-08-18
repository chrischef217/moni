'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Operation = 'CREATE' | 'UPDATE' | 'DELETE'
type Candidate = {
  id: string
  material_id: string
  material_name: string
  tx_date: string
  quantity_g: number
  quantity_packs?: number | null
  packing_weight_g?: number | null
  unit_price?: number | null
  supplier?: string | null
  note?: string | null
  protected?: boolean
  protected_reason?: string | null
}
type DraftCard = {
  stage: 'draft'
  operation: Operation
  source_user_message_id: string
  fields: Record<string, unknown>
  candidates: Candidate[]
  evidence_note?: string
}
type ActionCard = DraftCard | {
  stage: 'confirmation' | 'completed' | 'failed'
  operation: Operation
  source_user_message_id: string
  confirmation_id?: string
  preview_text?: string
  warnings?: string[]
  result?: Record<string, unknown>
  error?: string
}
type Supplier = { name: string; source: string; count: number; last_date?: string | null }
type Material = {
  id: string
  item_code?: string | null
  name: string
  is_stock_managed: boolean
  current_stock_g: number
  packing_weight_g?: number | null
  packing_weight_source?: string | null
  unit_price?: number | null
  unit_price_source?: string | null
  box_quantity?: number | null
  suppliers: Supplier[]
  default_supplier?: string
  spec?: string | null
  storage_type?: string | null
  country_of_origin?: string | null
  food_type?: string | null
  shelf_life_days?: number | null
}

const THREAD_KEY = 'moni-global-agent-thread-v11'
const text = (value: unknown) => String(value ?? '').trim()
const numberText = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed !== 0 ? String(parsed) : ''
}
const normalize = (value: unknown) => text(value).normalize('NFKC').toLowerCase().replace(/\s+/g, '')
const formatG = (value: unknown) => {
  const grams = Number(value || 0)
  return Math.abs(grams) >= 1000
    ? `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(grams / 1000)}kg`
    : `${new Intl.NumberFormat('ko-KR').format(grams)}g`
}
const formatWon = (value: unknown) => `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(Number(value || 0))}원`


function cardHasFocus(selector: string) {
  const host = document.querySelector<HTMLElement>(selector)
  const active = document.activeElement
  return Boolean(host && active instanceof HTMLElement && host.contains(active))
}

function title(operation: Operation) {
  return operation === 'CREATE' ? '원재료 입고 입력' : operation === 'UPDATE' ? '원재료 입고 수정' : '원재료 입고 삭제'
}
function actionLabel(operation: Operation) {
  return operation === 'CREATE' ? '입고 확정' : operation === 'UPDATE' ? '수정 확정' : '삭제 확정'
}
function initialFields(card: DraftCard) {
  const source = card.fields || {}
  return {
    raw_material_id: text(source.raw_material_id), raw_material_name: text(source.raw_material_name),
    tx_date: text(source.tx_date), quantity_g: numberText(source.quantity_g), quantity_packs: numberText(source.quantity_packs),
    packing_weight_g: numberText(source.packing_weight_g), supplier: text(source.supplier), unit_price: numberText(source.unit_price), note: text(source.note),
  }
}

export default function MoniMobileRawMaterialCardV2() {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [card, setCard] = useState<ActionCard | null>(null)
  const [catalog, setCatalog] = useState<Material[]>([])
  const [fields, setFields] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedTransactionId, setSelectedTransactionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sourceRef = useRef('')
  const activeCardSourceRef = useRef('')
  const suppressedCardSourceRef = useRef('')

  const threadId = () => text(window.localStorage.getItem(THREAD_KEY))

  const loadCatalog = useCallback(async () => {
    try {
      const response = await fetch(`/api/moni/mobile-material-catalog?_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json()
      if (response.ok && payload.ok && Array.isArray(payload.materials)) setCatalog(payload.materials)
    } catch { /* core chat remains available */ }
  }, [])

  const refresh = useCallback(async () => {
    const id = threadId()
    if (!id) return
    try {
      const response = await fetch(`/api/moni/mobile-actions?thread_id=${encodeURIComponent(id)}&_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok || !payload.ok) return
      const next = (payload.card || null) as ActionCard | null
      if (cardHasFocus('[data-moni-raw-material-v2-host="true"]')) return
      const nextSource = next?.source_user_message_id || ''
      if (nextSource && suppressedCardSourceRef.current === nextSource) return
      if (nextSource && suppressedCardSourceRef.current && suppressedCardSourceRef.current !== nextSource) suppressedCardSourceRef.current = ''
      activeCardSourceRef.current = nextSource
      setCard(next)
      if (next?.stage === 'draft') {
        const key = `${next.source_user_message_id}:${next.operation}`
        if (sourceRef.current !== key) {
          sourceRef.current = key
          const initial = initialFields(next)
          setFields(initial)
          setSearch(initial.raw_material_name)
          setSelectedTransactionId('')
          setError('')
        }
      }
    } catch { /* no-op */ }
  }, [])

  useEffect(() => { void loadCatalog() }, [loadCatalog])
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return
    const cardHost = document.createElement('div')
    cardHost.className = 'moni-crud-host'
    cardHost.dataset.moniRawMaterialV2Host = 'true'
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
    const interval = window.setInterval(() => void refresh(), 900)
    void refresh()
    return () => { window.removeEventListener('moni:user-turn-start', hideCardForNewTurn); observer.disconnect(); window.clearInterval(interval); cardHost.remove() }
  }, [refresh])

  const draft = card?.stage === 'draft' ? card : null
  const selectedMaterial = useMemo(() => catalog.find((item) => item.id === fields.raw_material_id) || null, [catalog, fields.raw_material_id])
  const filtered = useMemo(() => {
    const q = normalize(search)
    return catalog.filter((item) => !q || normalize(item.name).includes(q) || normalize(item.item_code).includes(q) || normalize(item.id).includes(q))
  }, [catalog, search])

  function updateField(key: string, value: string) { setFields((current) => ({ ...current, [key]: value })) }
  function recalc(next: Record<string, string>) {
    const packs = Number(next.quantity_packs || 0)
    const packing = Number(next.packing_weight_g || 0)
    if (packs > 0 && packing > 0) next.quantity_g = String(Math.round(packs * packing))
    return next
  }
  function chooseMaterial(material: Material) {
    if (!material.is_stock_managed) {
      setError(`${material.name}은(는) 전체 원재료 마스터에는 존재하지만 현재 재고관리 미설정 상태라 입고 실행은 차단됩니다. PC 원재료 마스터에서 재고관리 여부를 먼저 확인해 주세요.`)
      return
    }
    setSearch(material.name)
    setSearchOpen(false)
    setError('')
    setFields((current) => recalc({
      ...current,
      raw_material_id: material.id,
      raw_material_name: material.name,
      supplier: material.default_supplier || '',
      packing_weight_g: material.packing_weight_g ? String(material.packing_weight_g) : '',
      unit_price: material.unit_price ? String(material.unit_price) : '',
    }))
  }
  function searchChanged(value: string) {
    setSearch(value)
    setSearchOpen(true)
    const exact = catalog.find((item) => normalize(item.name) === normalize(value) || normalize(item.item_code) === normalize(value))
    if (exact?.is_stock_managed) chooseMaterial(exact)
    else if (!exact) setFields((current) => ({ ...current, raw_material_id: '', raw_material_name: value }))
  }
  function chooseCandidate(candidate: Candidate) {
    if (candidate.protected) return
    setSelectedTransactionId(candidate.id)
    if (draft?.operation === 'UPDATE') {
      setFields({
        raw_material_id: candidate.material_id, raw_material_name: candidate.material_name, tx_date: text(candidate.tx_date),
        quantity_g: numberText(candidate.quantity_g), quantity_packs: numberText(candidate.quantity_packs), packing_weight_g: numberText(candidate.packing_weight_g),
        supplier: text(candidate.supplier), unit_price: numberText(candidate.unit_price), note: text(candidate.note),
      })
      setSearch(candidate.material_name)
    }
    setError('')
  }

  async function prepare() {
    if (!draft || busy) return
    if ((draft.operation === 'UPDATE' || draft.operation === 'DELETE') && !selectedTransactionId) { setError('수정·삭제할 입고 기록을 먼저 선택해 주세요.'); return }
    if (draft.operation !== 'DELETE' && !fields.raw_material_id) { setError('원재료를 전체 목록에서 선택해 주세요.'); return }
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/moni/mobile-actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'prepare', thread_id: threadId(), source_user_message_id: draft.source_user_message_id, operation: draft.operation, transaction_id: selectedTransactionId || undefined, fields }) })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '입력 내용을 확인하지 못했습니다.')
      setCard({ stage: 'confirmation', operation: draft.operation, source_user_message_id: draft.source_user_message_id, confirmation_id: payload.confirmation.id, preview_text: payload.confirmation.preview_text, warnings: payload.confirmation.warnings || [] })
    } catch (value) { setError(value instanceof Error ? value.message : '입력 내용을 확인하지 못했습니다.') } finally { setBusy(false) }
  }
  async function execute() {
    if (!card || card.stage !== 'confirmation' || !card.confirmation_id || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/moni/mobile-actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'execute', thread_id: threadId(), confirmation_id: card.confirmation_id }) })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '업무를 실행하지 못했습니다.')
      setCard({ stage: 'completed', operation: card.operation, source_user_message_id: card.source_user_message_id, confirmation_id: card.confirmation_id, preview_text: card.preview_text, result: payload.result || {} })
    } catch (value) { setError(value instanceof Error ? value.message : '업무를 실행하지 못했습니다.') } finally { setBusy(false) }
  }

  if (!host || !card) return null
  return createPortal(<section className={`moni-crud-card moni-crud-${card.operation.toLowerCase()} moni-crud-stage-${card.stage}`} aria-label={title(card.operation)}>
    <div className="moni-crud-head"><div><span className="moni-crud-kicker">MONI 업무 카드 · 모바일</span><h2>{title(card.operation)}</h2></div><span className="moni-crud-badge">{card.stage === 'draft' ? '입력' : card.stage === 'confirmation' ? '확인 대기' : card.stage === 'completed' ? '완료' : '확인 필요'}</span></div>
    {card.stage === 'draft' ? <>
      <p className="moni-crud-note">{card.evidence_note || '대화를 길게 주고받지 않고 필요한 값을 한 번에 입력한 뒤 확인합니다.'}</p>
      {(card.operation === 'UPDATE' || card.operation === 'DELETE') && <div className="moni-crud-section"><span className="moni-crud-label">{card.operation === 'DELETE' ? '삭제할 입고 기록' : '수정할 입고 기록'}<b>필수</b></span><div className="moni-crud-candidates">{card.candidates?.length ? card.candidates.map((candidate) => <button key={candidate.id} type="button" disabled={candidate.protected || busy} onClick={() => chooseCandidate(candidate)} className={`moni-crud-candidate ${selectedTransactionId === candidate.id ? 'is-selected' : ''} ${candidate.protected ? 'is-protected' : ''}`}><span className="moni-crud-radio"/><span className="moni-crud-candidate-main"><b>{candidate.tx_date} · {candidate.material_name}</b><small>{formatG(candidate.quantity_g)} · {candidate.supplier || '매입처 미입력'}</small>{candidate.protected && <em>{candidate.protected_reason}</em>}</span></button>) : <div className="moni-crud-empty">조건에 맞는 최근 입고 기록이 없습니다.</div>}</div></div>}
      {(card.operation === 'CREATE' || (card.operation === 'UPDATE' && selectedTransactionId)) && <div className="moni-crud-grid">
        <label className="moni-crud-field moni-crud-span-2"><span className="moni-crud-label">원재료<b>필수</b></span>{card.operation === 'CREATE' ? <div className="moni-v2-search"><input type="search" value={search} onFocus={() => setSearchOpen(true)} onChange={(e) => searchChanged(e.target.value)} placeholder="원재료명 또는 코드를 입력해서 전체 목록 검색" disabled={busy}/><small>활성 원재료 {catalog.length}개 전체 · 입고 가능 {catalog.filter((item) => item.is_stock_managed).length}개</small>{searchOpen && <div className="moni-v2-options"><div className="moni-v2-summary">{search ? `검색 결과 ${filtered.length}개` : `전체 ${catalog.length}개`}</div>{filtered.map((material) => <button key={material.id} type="button" disabled={busy} onClick={() => chooseMaterial(material)} className={!material.is_stock_managed ? 'is-unmanaged' : ''}><span><b>{material.name}</b><small>{material.item_code || material.id}</small></span><em>{material.is_stock_managed ? (material.packing_weight_g ? formatG(material.packing_weight_g) : '입고 가능') : '재고관리 미설정'}</em></button>)}</div>}</div> : <input value={fields.raw_material_name || ''} readOnly/>}</label>
        {selectedMaterial && <div className="moni-v2-reference moni-crud-span-2"><b>선택 원재료 연결 정보</b><div>{[
          `현재재고 ${formatG(selectedMaterial.current_stock_g)}`,
          selectedMaterial.default_supplier ? `주 매입처 ${selectedMaterial.default_supplier}` : '주 매입처 미등록',
          selectedMaterial.packing_weight_g ? `포장기준 ${formatG(selectedMaterial.packing_weight_g)}` : '포장기준 미등록',
          selectedMaterial.unit_price ? `기준단가 ${formatWon(selectedMaterial.unit_price)}` : '기준단가 미등록',
          selectedMaterial.box_quantity ? `박스수량 ${selectedMaterial.box_quantity}` : '', selectedMaterial.spec ? `규격 ${selectedMaterial.spec}` : '',
          selectedMaterial.storage_type ? `보관 ${selectedMaterial.storage_type}` : '', selectedMaterial.food_type ? `식품유형 ${selectedMaterial.food_type}` : '',
          selectedMaterial.country_of_origin ? `원산지 ${selectedMaterial.country_of_origin}` : '', selectedMaterial.shelf_life_days ? `보관기준 ${selectedMaterial.shelf_life_days}일` : '',
        ].filter(Boolean).map((value) => <span key={String(value)}>{value}</span>)}</div><small>연결정보는 참고값입니다. 아래 이번 입고의 매입처·포장중량·단가는 자유롭게 수정할 수 있습니다.</small></div>}
        <label className="moni-crud-field"><span className="moni-crud-label">입고일<b>필수</b></span><input type="date" value={fields.tx_date || ''} onChange={(e) => updateField('tx_date', e.target.value)} disabled={busy}/></label>
        <label className="moni-crud-field"><span className="moni-crud-label">매입처</span><input list="moni-v2-suppliers" value={fields.supplier || ''} onChange={(e) => updateField('supplier', e.target.value)} placeholder="연결 매입처에서 선택 또는 직접 수정" disabled={busy}/><datalist id="moni-v2-suppliers">{selectedMaterial?.suppliers?.map((supplier) => <option key={supplier.name} value={supplier.name}>{supplier.source}</option>)}</datalist></label>
        <label className="moni-crud-field"><span className="moni-crud-label">포장 개수</span><input inputMode="numeric" value={fields.quantity_packs || ''} onChange={(e) => setFields((current) => recalc({ ...current, quantity_packs: e.target.value }))} disabled={busy}/></label>
        <label className="moni-crud-field"><span className="moni-crud-label">포장당 중량(g)</span><input inputMode="numeric" value={fields.packing_weight_g || ''} onChange={(e) => setFields((current) => recalc({ ...current, packing_weight_g: e.target.value }))} disabled={busy}/></label>
        <label className="moni-crud-field"><span className="moni-crud-label">총 입고량(g)<b>필수</b></span><input inputMode="numeric" value={fields.quantity_g || ''} onChange={(e) => updateField('quantity_g', e.target.value)} disabled={busy}/></label>
        <label className="moni-crud-field"><span className="moni-crud-label">단가</span><input inputMode="decimal" value={fields.unit_price || ''} onChange={(e) => updateField('unit_price', e.target.value)} disabled={busy}/></label>
        <label className="moni-crud-field moni-crud-span-2"><span className="moni-crud-label">비고</span><input value={fields.note || ''} onChange={(e) => updateField('note', e.target.value)} disabled={busy}/></label>
      </div>}
      {error && <div className="moni-crud-error">{error}</div>}
      <button type="button" className="moni-crud-primary" disabled={busy || (card.operation !== 'CREATE' && !selectedTransactionId)} onClick={() => void prepare()}>{busy ? '확인 중…' : card.operation === 'DELETE' ? '삭제 내용 확인' : card.operation === 'UPDATE' ? '변경 내용 확인' : '입력 내용 확인'}</button>
    </> : card.stage === 'confirmation' ? <><div className="moni-crud-preview"><b>실행 전 미리보기</b><p>{card.preview_text}</p>{card.warnings?.map((warning) => <small key={warning}>{warning}</small>)}</div>{error && <div className="moni-crud-error">{error}</div>}<button type="button" className={`moni-crud-primary ${card.operation === 'DELETE' ? 'is-danger' : ''}`} disabled={busy} onClick={() => void execute()}>{busy ? '실행 중…' : actionLabel(card.operation)}</button></> : card.stage === 'completed' ? <div className="moni-crud-complete"><b>처리 완료</b><p>{card.preview_text || '요청한 업무를 실행하고 결과를 확인했습니다.'}</p></div> : <div className="moni-crud-error">{card.error || error || '업무를 실행하지 못했습니다.'}</div>}
    <style jsx global>{`
      .moni-v2-search{position:relative}.moni-v2-search>input{width:100%}.moni-v2-search>small{display:block;margin:5px 2px 0;color:#7a929b;font-size:10px;font-weight:800}.moni-v2-options{position:absolute;left:0;right:0;top:50px;z-index:90;max-height:330px;overflow:auto;border:1px solid #cfe3df;border-radius:14px;background:#fff;padding:6px;box-shadow:0 16px 36px rgba(23,59,82,.18)}.moni-v2-summary{padding:7px 8px;color:#75909a;font-size:10px;font-weight:900}.moni-v2-options button{display:flex;width:100%;align-items:center;justify-content:space-between;gap:8px;border:0;border-radius:10px;background:transparent;padding:10px 8px;text-align:left;color:#234653}.moni-v2-options button:active{background:#eef8f5}.moni-v2-options button>span{display:grid;gap:2px;min-width:0}.moni-v2-options button b{font-size:12px}.moni-v2-options button small{color:#80959d;font-size:9px}.moni-v2-options button em{flex:0 0 auto;border-radius:999px;background:#eef8f5;padding:4px 6px;color:#247866;font-size:9px;font-style:normal;font-weight:900}.moni-v2-options button.is-unmanaged{opacity:.55}.moni-v2-options button.is-unmanaged em{background:#f1f3f4;color:#788589}.moni-v2-reference{margin-top:3px;border:1px solid #d9e9e5;border-radius:14px;background:#f7fbfa;padding:11px}.moni-v2-reference>b{display:block;color:#367466;font-size:11px}.moni-v2-reference>div{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}.moni-v2-reference span{border:1px solid #e0ece9;border-radius:999px;background:white;padding:4px 7px;color:#55727d;font-size:9px;font-weight:750}.moni-v2-reference>small{display:block;margin-top:7px;color:#81959c;font-size:9px;line-height:1.45}
    `}</style>
  </section>, host)
}
