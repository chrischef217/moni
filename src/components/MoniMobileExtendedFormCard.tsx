'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Opt = { value: string; label: string; sub?: string }
type FieldSchema = { key: string; label: string; type: string; value?: any; required?: boolean; options?: Opt[]; step?: string }
type Candidate = { id: string; label: string; values: Record<string, any> }
type Card = {
  stage: 'draft' | 'confirmation' | 'completed' | 'failed'
  domain: string
  operation: string
  title?: string
  source_user_message_id: string
  schema?: FieldSchema[]
  candidates?: Candidate[]
  defaults?: Record<string, any>
  warnings?: string[]
  confirmation_id?: string
  preview_text?: string
  result?: Record<string, any>
  error?: string
  busy?: boolean
}

const THREAD_KEY = 'moni-global-agent-thread-v11'
const txt = (value: unknown) => String(value ?? '').trim()
const norm = (value: unknown) => txt(value).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, '')

function prepareButtonLabel(operation: string) {
  if (operation === 'UPDATE') return '변경 내용 확인'
  if (operation === 'DELETE') return '삭제 내용 확인'
  if (operation === 'DEACTIVATE') return '비활성화 내용 확인'
  if (operation === 'ADJUST') return '조정 내용 확인'
  if (operation === 'REVERSE') return '취소 내용 확인'
  if (operation === 'RECEIVE') return '수금 내용 확인'
  if (operation === 'SET_DUE' || operation === 'SET_RULE' || operation === 'SET_TARGET' || operation === 'CLEAR_TARGET') return '설정 내용 확인'
  return '입력 내용 확인'
}


function cardHasFocus(selector: string) {
  const host = document.querySelector<HTMLElement>(selector)
  const active = document.activeElement
  return Boolean(host && active instanceof HTMLElement && host.contains(active))
}

function pickSchemaValues(schema: FieldSchema[], values: Record<string, any> | undefined) {
  const allowed = new Set(schema.map((item) => item.key))
  return Object.fromEntries(Object.entries(values || {}).filter(([key]) => allowed.has(key)))
}

function SearchSelect({ value, options, disabled, onChange }: { value: string; options: Opt[]; disabled?: boolean; onChange: (value: string) => void }) {
  const selected = options.find((row) => row.value === value)
  const [query, setQuery] = useState(selected?.label || '')
  const [open, setOpen] = useState(false)
  useEffect(() => setQuery(selected?.label || ''), [selected?.label])
  const rows = useMemo(() => {
    const q = norm(query)
    return options.filter((row) => !q || norm(row.label).includes(q) || norm(row.sub).includes(q) || norm(row.value).includes(q)).slice(0, 80)
  }, [options, query])
  return <div className="moni-pc-search">
    <input disabled={disabled} value={query} placeholder="입력해서 검색" onFocus={() => setOpen(true)} onChange={(e) => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange('') }}/>
    {open && !disabled && <div className="moni-pc-search-menu"><div className="moni-pc-search-count">{query ? `검색 ${rows.length}개` : `전체 ${options.length}개`}</div>{rows.map((row) => <button key={`${row.value}:${row.label}`} type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => { onChange(row.value); setQuery(row.label); setOpen(false) }}><b>{row.label}</b>{row.sub ? <small>{row.sub}</small> : null}</button>)}</div>}
  </div>
}

export default function MoniMobileExtendedFormCard() {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [fields, setFields] = useState<Record<string, any>>({})
  const [targetId, setTargetId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sourceRef = useRef('')
  const activeCardSourceRef = useRef('')
  const suppressedCardSourceRef = useRef('')

  const threadId = () => txt(window.localStorage.getItem(THREAD_KEY))
  const refresh = useCallback(async () => {
    const id = threadId()
    if (!id) return
    try {
      const response = await fetch(`/api/moni/mobile-extended-actions?thread_id=${encodeURIComponent(id)}&_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok || !payload.ok) return
      const next = (payload.card || null) as Card | null
      if (cardHasFocus('[data-moni-pc-form-card-host="true"]')) return
      const nextSource = next?.source_user_message_id || ''
      if (nextSource && suppressedCardSourceRef.current === nextSource) return
      if (nextSource && suppressedCardSourceRef.current && suppressedCardSourceRef.current !== nextSource) suppressedCardSourceRef.current = ''
      activeCardSourceRef.current = nextSource
      setCard(next)
      if (next?.stage === 'draft') {
        const key = `${next.source_user_message_id}:${next.domain}:${next.operation}`
        if (sourceRef.current !== key) {
          sourceRef.current = key
          const schema = next.schema || []
          const initial = Object.fromEntries(schema.map((item) => [item.key, item.value ?? '']))
          setFields({ ...initial, ...pickSchemaValues(schema, next.defaults) })
          setTargetId('')
          setError('')
        }
      }
    } catch { /* chat itself remains available */ }
  }, [])

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return
    const scroller = root.querySelector<HTMLElement>('header + div')
    if (!scroller) return
    const node = document.createElement('div')
    node.dataset.moniPcFormCardHost = 'true'
    node.className = 'moni-pc-form-host'
    scroller.appendChild(node)
    setHost(node)
    const hideCardForNewTurn = () => {
      suppressedCardSourceRef.current = activeCardSourceRef.current
      setCard(null)
      setError('')
    }
    window.addEventListener('moni:user-turn-start', hideCardForNewTurn)
    const timer = window.setInterval(() => void refresh(), 900)
    void refresh()
    return () => { window.removeEventListener('moni:user-turn-start', hideCardForNewTurn); window.clearInterval(timer); node.remove() }
  }, [refresh])

  function setField(key: string, value: any) { setFields((current) => ({ ...current, [key]: value })) }
  function chooseCandidate(row: Candidate) {
    if (!card) return
    setTargetId(row.id)
    setFields((current) => ({ ...current, ...pickSchemaValues(card.schema || [], row.values) }))
    setError('')
  }

  function needsTarget() {
    return card ? ['UPDATE', 'DELETE', 'DEACTIVATE'].includes(card.operation) : false
  }

  function validate() {
    if (!card) return '입력 카드를 확인할 수 없습니다.'
    if (needsTarget() && !targetId) return '수정할 기존 기록을 먼저 선택해 주세요.'
    for (const item of card.schema || []) {
      if (!item.required) continue
      const value = fields[item.key]
      if (item.type === 'checkbox') continue
      if (value === undefined || value === null || txt(value) === '') return `${item.label} 값을 입력해 주세요.`
    }
    return ''
  }

  async function prepare() {
    if (!card || card.stage !== 'draft' || busy) return
    const validation = validate()
    if (validation) { setError(validation); return }
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/moni/mobile-extended-actions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command:'prepare',thread_id:threadId(),source_user_message_id:card.source_user_message_id,domain:card.domain,operation:card.operation,target_id:targetId || undefined,fields }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '입력 내용을 확인하지 못했습니다.')
      const confirmation = payload.confirmation
      setCard({ ...card,stage:'confirmation',confirmation_id:confirmation.id || confirmation.confirmation_id,preview_text:confirmation.preview_text,warnings:confirmation.warnings || [] })
    } catch (value) { setError(value instanceof Error ? value.message : '입력 내용을 확인하지 못했습니다.') } finally { setBusy(false) }
  }

  async function execute() {
    if (!card || card.stage !== 'confirmation' || !card.confirmation_id || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/moni/mobile-extended-actions', {
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command:'execute',thread_id:threadId(),confirmation_id:card.confirmation_id}),
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '업무를 실행하지 못했습니다.')
      setCard({ ...card,stage:'completed',result:payload.result || {} })
    } catch (value) { setError(value instanceof Error ? value.message : '업무를 실행하지 못했습니다.') } finally { setBusy(false) }
  }

  function CandidateList() {
    if (!card || !needsTarget()) return null
    const rows = card.candidates || []
    return <div className="moni-pc-section"><span className="moni-pc-label">기존 기록 선택 <b>필수</b></span><div className="moni-pc-candidates">{rows.length ? rows.map((row) => <button key={row.id} type="button" className={targetId===row.id?'selected':''} onClick={() => chooseCandidate(row)}><span className="radio"/><span><b>{row.label}</b><small>{row.id}</small></span></button>) : <div className="empty">선택할 기존 기록이 없습니다.</div>}</div></div>
  }

  function renderInputField(item: FieldSchema) {
    const value = fields[item.key]
    if (item.type === 'select') return <SearchSelect value={txt(value)} options={item.options || []} disabled={busy} onChange={(next) => setField(item.key,next)}/>
    if (item.type === 'checkbox') return <button type="button" disabled={busy} className={`moni-pc-toggle ${Boolean(value)?'on':''}`} onClick={() => setField(item.key,!Boolean(value))}><span/>{Boolean(value)?'예':'아니오'}</button>
    if (item.type === 'textarea') return <textarea disabled={busy} rows={3} value={txt(value)} onChange={(e) => setField(item.key,e.target.value)}/>
    return <input disabled={busy} type={item.type==='number'?'number':item.type==='date'?'date':item.type==='month'?'month':'text'} step={item.step} value={value ?? ''} onChange={(e) => setField(item.key,e.target.value)}/>
  }

  if (!host || !card) return null
  return createPortal(<>
    <section className="moni-pc-card">
      <div className="moni-pc-head"><div><span>PC 업무폼 연동</span><h3>{card.title || '업무 입력'}</h3></div><em>{card.operation}</em></div>
      {card.stage === 'draft' && <>
        <p className="moni-pc-help">PC 화면과 같은 저장 기준입니다. 필요한 값을 확인·수정한 뒤 미리보기를 만드세요.</p>
        <CandidateList/>
        <div className="moni-pc-grid">{(card.schema || []).map((item) => <label key={item.key} className={item.type==='textarea'?'wide':''}><span className="moni-pc-label">{item.label}{item.required?<b>필수</b>:null}</span>{renderInputField(item)}</label>)}</div>
        {(card.warnings || []).map((warning) => <div key={warning} className="moni-pc-warning">{warning}</div>)}
        {error ? <div className="moni-pc-error">{error}</div> : null}
        <button type="button" disabled={busy} className="moni-pc-primary" onClick={() => void prepare()}>{busy?'확인 중…':prepareButtonLabel(card.operation)}</button>
      </>}
      {card.stage === 'confirmation' && <>
        <div className="moni-pc-confirm"><b>실행 전 최종 확인</b><p>{card.preview_text}</p>{(card.warnings || []).map((warning)=><small key={warning}>⚠ {warning}</small>)}</div>
        {error ? <div className="moni-pc-error">{error}</div> : null}
        <button type="button" disabled={busy || card.busy} className="moni-pc-primary danger" onClick={() => void execute()}>{busy || card.busy ? '실행 중…' : '확정 실행'}</button>
      </>}
      {card.stage === 'completed' && <div className="moni-pc-done"><b>처리 완료</b><p>PC 업무 API 저장과 실행 검증이 완료되었습니다.</p></div>}
      {card.stage === 'failed' && <div className="moni-pc-error"><b>처리 실패</b><p>{card.error || '실행하지 못했습니다.'}</p></div>}
    </section>
    <style jsx global>{`
      .moni-pc-form-host{margin:12px 0 18px}.moni-pc-card{margin:0 auto;width:min(100%,720px);border:1px solid #cfe3df;border-radius:22px;background:#fff;padding:16px;box-shadow:0 10px 28px rgba(23,59,82,.08);color:#173b52}.moni-pc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}.moni-pc-head span{font-size:11px;font-weight:900;color:#17856f}.moni-pc-head h3{margin:2px 0 0;font-size:17px;font-weight:900}.moni-pc-head em{font-style:normal;font-size:10px;font-weight:900;border-radius:999px;background:#edf7f5;padding:5px 8px;color:#247064}.moni-pc-help{font-size:12px;line-height:1.6;color:#647780;margin:0 0 12px}.moni-pc-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.moni-pc-grid label{min-width:0}.moni-pc-grid .wide{grid-column:1/-1}.moni-pc-label{display:flex;align-items:center;gap:5px;margin-bottom:5px;font-size:11px;font-weight:900;color:#566b75}.moni-pc-label b{font-size:9px;color:#dc4c4c}.moni-pc-grid input,.moni-pc-grid textarea,.moni-pc-grid select,.moni-pc-search>input{width:100%;border:1px solid #cbdedb;border-radius:12px;background:#fbfefd;padding:10px 11px;font-size:13px;color:#173b52;outline:none}.moni-pc-grid input:focus,.moni-pc-grid textarea:focus,.moni-pc-search>input:focus{border-color:#56a99a;box-shadow:0 0 0 3px rgba(86,169,154,.1)}.moni-pc-search{position:relative}.moni-pc-search-menu{position:absolute;z-index:1200;left:0;right:0;top:calc(100% + 4px);max-height:240px;overflow:auto;border:1px solid #cbdedb;border-radius:12px;background:white;box-shadow:0 12px 30px rgba(23,59,82,.16)}.moni-pc-search-count{padding:7px 10px;font-size:10px;color:#78909a;border-bottom:1px solid #e5efed}.moni-pc-search-menu button{display:block;width:100%;padding:9px 10px;border:0;border-bottom:1px solid #eef4f3;background:white;text-align:left;color:#173b52}.moni-pc-search-menu button b,.moni-pc-search-menu button small{display:block}.moni-pc-search-menu button small{margin-top:2px;color:#7b8e96;font-size:10px}.moni-pc-toggle{display:flex;width:100%;align-items:center;gap:8px;border:1px solid #cbdedb;border-radius:12px;background:#f8fbfa;padding:9px 10px;color:#60747d}.moni-pc-toggle span{width:30px;height:18px;border-radius:999px;background:#cbd5d1;position:relative}.moni-pc-toggle span:after{content:'';position:absolute;width:14px;height:14px;border-radius:50%;background:#fff;left:2px;top:2px;transition:.15s}.moni-pc-toggle.on span{background:#22a58d}.moni-pc-toggle.on span:after{left:14px}.moni-pc-section{margin:10px 0}.moni-pc-candidates{max-height:190px;overflow:auto;border:1px solid #d7e5e2;border-radius:12px}.moni-pc-candidates button{display:flex;width:100%;gap:9px;align-items:center;border:0;border-bottom:1px solid #edf3f2;background:#fff;padding:9px 10px;text-align:left;color:#173b52}.moni-pc-candidates button.selected{background:#eefaf7}.moni-pc-candidates .radio{width:14px;height:14px;flex:0 0 auto;border:2px solid #9ab9b2;border-radius:50%}.moni-pc-candidates button.selected .radio{border:4px solid #1d9c83}.moni-pc-candidates button b,.moni-pc-candidates button small{display:block}.moni-pc-candidates button small{margin-top:2px;font-size:9px;color:#8ca0a8}.moni-pc-candidates .empty{padding:14px;color:#84979e;font-size:12px}.moni-pc-primary{margin-top:14px;width:100%;border:0;border-radius:13px;background:#188c77;padding:12px;font-weight:900;color:#fff}.moni-pc-primary.danger{background:#d84b4b}.moni-pc-primary:disabled{opacity:.45}.moni-pc-warning,.moni-pc-error,.moni-pc-confirm,.moni-pc-done{margin-top:12px;border-radius:12px;padding:11px 12px;font-size:12px;line-height:1.6}.moni-pc-warning{background:#fff8e5;color:#8c6610}.moni-pc-error{background:#fff0f0;color:#b63838}.moni-pc-confirm{background:#f1f7ff;color:#315b82}.moni-pc-confirm b,.moni-pc-done b{display:block;margin-bottom:4px}.moni-pc-confirm p,.moni-pc-done p{margin:0}.moni-pc-confirm small{display:block;margin-top:5px}.moni-pc-done{background:#eaf9f4;color:#19745f}@media(max-width:520px){.moni-pc-grid{grid-template-columns:1fr}.moni-pc-grid .wide{grid-column:auto}}@media(prefers-reduced-motion:reduce){.moni-pc-toggle span:after{transition:none}}
    `}</style>
  </>,host)
}
