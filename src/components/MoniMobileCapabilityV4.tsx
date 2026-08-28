'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Opt = { value: string; label: string; sub?: string }
type FieldSchema = { key: string; label: string; type: string; value?: unknown; required?: boolean; options?: Opt[]; step?: string }
type Candidate = { id: string; label: string; values?: Record<string, unknown> }
type ResultCard = { title?: string; lines?: string[]; links?: Array<{ label: string; href: string }> }
type Card = {
  stage: 'draft' | 'confirmation' | 'completed' | 'failed'
  domain: string
  operation: string
  title?: string
  source_user_message_id: string
  schema?: FieldSchema[]
  candidates?: Candidate[]
  defaults?: Record<string, unknown>
  warnings?: string[]
  confirmation_id?: string
  preview_text?: string
  result?: unknown
  error?: string
}

const THREAD_KEY = 'moni-global-agent-thread-v11'
const txt = (value: unknown) => String(value ?? '').trim()
const norm = (value: unknown) => txt(value).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, '')

function pickValues(schema: FieldSchema[], values?: Record<string, unknown>) {
  const keys = new Set(schema.map((item) => item.key))
  return Object.fromEntries(Object.entries(values || {}).filter(([key]) => keys.has(key)))
}

function SearchSelect({ value, options, disabled, onChange }: { value: string; options: Opt[]; disabled?: boolean; onChange: (value: string) => void }) {
  const selected = options.find((row) => row.value === value)
  const [query, setQuery] = useState(selected?.label || '')
  const [open, setOpen] = useState(false)
  useEffect(() => setQuery(selected?.label || ''), [selected?.label])
  const rows = useMemo(() => {
    const q = norm(query)
    return options.filter((row) => !q || norm(row.label).includes(q) || norm(row.sub).includes(q) || norm(row.value).includes(q)).slice(0, 100)
  }, [options, query])
  return <div className="moni-v4-search">
    <input disabled={disabled} value={query} placeholder="입력해서 검색" onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); if (!event.target.value) onChange('') }} />
    {open && !disabled ? <div className="moni-v4-options"><div className="count">{query ? `검색 ${rows.length}개` : `전체 ${options.length}개`}</div>{rows.map((row) => <button key={`${row.value}:${row.label}`} type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => { onChange(row.value); setQuery(row.label); setOpen(false) }}><b>{row.label}</b>{row.sub ? <small>{row.sub}</small> : null}</button>)}</div> : null}
  </div>
}

function normalizeResult(value: unknown): ResultCard {
  if (!value || typeof value !== 'object') return { title: '처리 완료', lines: ['업무 처리가 완료되었습니다.'] }
  const root = value as Record<string, any>
  const first = root.result && typeof root.result === 'object' ? root.result : root
  const nested = first.result && typeof first.result === 'object' ? first.result : first
  if (Array.isArray(nested.lines) || Array.isArray(nested.links)) return nested as ResultCard
  const labels: Record<string, string> = { quote_number:'견적번호', invoice_number:'세금계산서 번호', category_label:'감사 분류', record_id:'기록 ID', saved:'저장 건수', status:'상태' }
  const lines = Object.keys(labels).filter((key) => nested[key] !== undefined && nested[key] !== null).map((key) => `${labels[key]}: ${String(nested[key])}`)
  return { title: '처리 완료', lines: lines.length ? lines : ['업무 처리가 완료되었습니다.'] }
}

export default function MoniMobileCapabilityV4() {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [fields, setFields] = useState<Record<string, any>>({})
  const [targetId, setTargetId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sourceRef = useRef('')
  const activeSourceRef = useRef('')
  const suppressedSourceRef = useRef('')
  const threadId = () => txt(window.localStorage.getItem(THREAD_KEY))

  const refresh = useCallback(async () => {
    const id = threadId()
    if (!id) return
    try {
      const response = await fetch(`/api/moni/mobile-capability-v4?thread_id=${encodeURIComponent(id)}&_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok || !payload.ok) return
      const next = (payload.card || null) as Card | null
      const nextSource = next?.source_user_message_id || ''
      if (nextSource && suppressedSourceRef.current === nextSource) return
      if (nextSource && suppressedSourceRef.current && suppressedSourceRef.current !== nextSource) suppressedSourceRef.current = ''
      const currentHost = document.querySelector<HTMLElement>('[data-moni-capability-v4-host="true"]')
      if (document.activeElement && currentHost?.contains(document.activeElement)) return
      activeSourceRef.current = nextSource
      setCard(next)
      if (next?.stage === 'draft') {
        const key = `${next.source_user_message_id}:${next.domain}:${next.operation}`
        if (sourceRef.current !== key) {
          sourceRef.current = key
          const schema = next.schema || []
          const initial = Object.fromEntries(schema.map((item) => [item.key, item.value ?? '']))
          setFields({ ...initial, ...pickValues(schema, next.defaults) })
          setTargetId('')
          setError('')
        }
      }
    } catch {
      // V4 cards are supplemental and never block the core chat.
    }
  }, [])

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return
    const scroller = root.querySelector<HTMLElement>('header + div')
    if (!scroller) return
    const node = document.createElement('div')
    node.dataset.moniCapabilityV4Host = 'true'
    node.className = 'moni-v4-host'
    scroller.appendChild(node)
    setHost(node)
    const hideForNewTurn = () => { suppressedSourceRef.current = activeSourceRef.current; setCard(null); setError('') }
    window.addEventListener('moni:user-turn-start', hideForNewTurn)
    const timer = window.setInterval(() => void refresh(), 900)
    void refresh()
    return () => {
      window.removeEventListener('moni:user-turn-start', hideForNewTurn)
      window.clearInterval(timer)
      node.remove()
    }
  }, [refresh])

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return
    if (card) root.dataset.moniV4Active = 'true'
    else delete root.dataset.moniV4Active
    return () => { delete root.dataset.moniV4Active }
  }, [card])

  function setField(key: string, value: any) { setFields((current) => ({ ...current, [key]: value })) }
  function chooseCandidate(row: Candidate) {
    if (!card) return
    setTargetId(row.id)
    setFields((current) => ({ ...current, ...pickValues(card.schema || [], row.values) }))
    setError('')
  }
  function needsTarget() { return Boolean(card?.candidates?.length) && card?.operation !== 'CREATE' && card?.operation !== 'READ' }
  function validate() {
    if (!card) return '업무 카드를 확인할 수 없습니다.'
    if (needsTarget() && !targetId) return '처리할 기존 기록을 먼저 선택해 주세요.'
    for (const item of card.schema || []) {
      if (!item.required || item.type === 'checkbox') continue
      if (fields[item.key] === undefined || fields[item.key] === null || txt(fields[item.key]) === '') return `${item.label} 값을 입력해 주세요.`
    }
    return ''
  }

  async function act() {
    if (!card || busy) return
    const validation = validate()
    if (validation) { setError(validation); return }
    setBusy(true); setError('')
    try {
      if (card.operation === 'READ') {
        const response = await fetch('/api/moni/mobile-capability-v4', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ command:'read',thread_id:threadId(),source_user_message_id:card.source_user_message_id,domain:card.domain,operation:card.operation,fields }) })
        const payload = await response.json()
        if (!response.ok || !payload.ok) throw new Error(payload.error || '조회하지 못했습니다.')
        setCard({ ...card, stage:'completed', result:payload.result })
        return
      }
      const response = await fetch('/api/moni/mobile-capability-v4', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ command:'prepare',thread_id:threadId(),source_user_message_id:card.source_user_message_id,domain:card.domain,operation:card.operation,target_id:targetId || undefined,fields }) })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '입력 내용을 확인하지 못했습니다.')
      setCard({ ...card, stage:'confirmation', confirmation_id:payload.confirmation.id || payload.confirmation.confirmation_id, preview_text:payload.confirmation.preview_text, warnings:payload.confirmation.warnings || card.warnings || [] })
    } catch (reason) { setError(reason instanceof Error ? reason.message : '처리하지 못했습니다.') }
    finally { setBusy(false) }
  }

  async function execute() {
    if (!card?.confirmation_id || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/moni/mobile-capability-v4', { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command:'execute',thread_id:threadId(),confirmation_id:card.confirmation_id}) })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '실행하지 못했습니다.')
      setCard({ ...card, stage:'completed', result:payload.result })
    } catch (reason) { setError(reason instanceof Error ? reason.message : '실행하지 못했습니다.') }
    finally { setBusy(false) }
  }

  function renderField(item: FieldSchema) {
    const value = fields[item.key]
    if (item.type === 'select') return <SearchSelect value={txt(value)} options={item.options || []} disabled={busy} onChange={(next) => setField(item.key,next)} />
    if (item.type === 'checkbox') return <button type="button" disabled={busy} className={`moni-v4-toggle ${Boolean(value) ? 'on' : ''}`} onClick={() => setField(item.key,!Boolean(value))}><span />{Boolean(value) ? '예' : '아니오'}</button>
    if (item.type === 'textarea') return <textarea disabled={busy} rows={3} value={txt(value)} onChange={(event) => setField(item.key,event.target.value)} />
    return <input disabled={busy} type={item.type === 'number' ? 'number' : item.type === 'date' ? 'date' : item.type === 'month' ? 'month' : 'text'} step={item.step} value={value ?? ''} onChange={(event) => setField(item.key,event.target.value)} />
  }

  if (!host || !card) return null
  const completed = normalizeResult(card.result)
  return createPortal(<>
    <section className="moni-v4-card">
      <div className="moni-v4-head"><div><span>MONI MOBILE 업무</span><h3>{card.title || '업무 처리'}</h3></div><em>{card.operation === 'READ' ? '조회' : '실행'}</em></div>
      {card.stage === 'draft' ? <>
        {(card.warnings || []).map((warning) => <div key={warning} className="moni-v4-warning">{warning}</div>)}
        {(card.candidates || []).length ? <div className="moni-v4-section"><span className="moni-v4-label">대상 선택 {needsTarget() ? <b>필수</b> : null}</span><div className="moni-v4-candidates">{(card.candidates || []).map((row) => <button key={row.id} type="button" className={targetId === row.id ? 'selected' : ''} onClick={() => chooseCandidate(row)}><span className="radio"/><span><b>{row.label}</b></span></button>)}</div></div> : null}
        {(card.schema || []).length ? <div className="moni-v4-grid">{(card.schema || []).map((item) => <label key={item.key} className={item.type === 'textarea' ? 'wide' : ''}><span className="moni-v4-label">{item.label}{item.required ? <b>필수</b> : null}</span>{renderField(item)}</label>)}</div> : null}
        {error ? <div className="moni-v4-error">{error}</div> : null}
        <button type="button" disabled={busy} className="moni-v4-primary" onClick={() => void act()}>{busy ? '확인 중…' : card.operation === 'READ' ? '조회' : '실행 내용 확인'}</button>
      </> : null}
      {card.stage === 'confirmation' ? <>
        <div className="moni-v4-confirm"><b>실행 전 최종 확인</b><p>{card.preview_text || '입력 내용을 확인한 뒤 실행해 주세요.'}</p>{(card.warnings || []).map((warning) => <small key={warning}>⚠ {warning}</small>)}</div>
        {error ? <div className="moni-v4-error">{error}</div> : null}
        <button type="button" disabled={busy} className="moni-v4-primary danger" onClick={() => void execute()}>{busy ? '실행 중…' : '확정 실행'}</button>
      </> : null}
      {card.stage === 'completed' ? <div className="moni-v4-result"><b>{completed.title || '처리 완료'}</b>{(completed.lines || []).map((line,index) => <p key={`${index}:${line}`}>{line}</p>)}{(completed.links || []).length ? <div className="links">{(completed.links || []).map((link) => <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>)}</div> : null}</div> : null}
    </section>
    <style jsx global>{`
      [data-moni-mobile-chat][data-moni-v4-active="true"] .moni-crud-host,
      [data-moni-mobile-chat][data-moni-v4-active="true"] .moni-pc-form-host { display:none !important; }
      .moni-v4-host{margin:12px 0 18px}.moni-v4-card{margin:0 auto;width:min(100%,720px);border:1px solid #c9e4de;border-radius:22px;background:#fff;padding:16px;box-shadow:0 10px 28px rgba(23,59,82,.08);color:#173b52}.moni-v4-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}.moni-v4-head span{font-size:10px;font-weight:900;letter-spacing:.08em;color:#168570}.moni-v4-head h3{margin:3px 0 0;font-size:17px;font-weight:900}.moni-v4-head em{font-style:normal;font-size:10px;font-weight:900;border-radius:999px;background:#edf8f5;padding:5px 8px;color:#247064}.moni-v4-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.moni-v4-grid label{min-width:0}.moni-v4-grid .wide{grid-column:1/-1}.moni-v4-label{display:flex;align-items:center;gap:5px;margin-bottom:5px;font-size:11px;font-weight:900;color:#566b75}.moni-v4-label b{font-size:9px;color:#d94a4a}.moni-v4-grid input,.moni-v4-grid textarea,.moni-v4-search>input{width:100%;border:1px solid #cbdedb;border-radius:12px;background:#fbfefd;padding:10px 11px;font-size:13px;color:#173b52;outline:none}.moni-v4-grid input:focus,.moni-v4-grid textarea:focus,.moni-v4-search>input:focus{border-color:#56a99a;box-shadow:0 0 0 3px rgba(86,169,154,.1)}.moni-v4-search{position:relative}.moni-v4-options{position:absolute;z-index:1300;left:0;right:0;top:calc(100% + 4px);max-height:230px;overflow:auto;border:1px solid #cbdedb;border-radius:12px;background:white;box-shadow:0 16px 35px rgba(23,59,82,.15)}.moni-v4-options .count{padding:7px 10px;border-bottom:1px solid #edf2f1;font-size:10px;font-weight:800;color:#78909a}.moni-v4-options button{display:flex;width:100%;flex-direction:column;align-items:flex-start;border:0;border-bottom:1px solid #eef3f2;background:white;padding:9px 10px;text-align:left;color:#173b52}.moni-v4-options button b{font-size:12px}.moni-v4-options button small{margin-top:2px;font-size:10px;color:#7b919a}.moni-v4-toggle{display:flex;width:100%;align-items:center;gap:8px;border:1px solid #cbdedb;border-radius:12px;background:#f8fbfa;padding:9px 11px;font-size:12px;font-weight:800;color:#647780}.moni-v4-toggle span{height:17px;width:30px;border-radius:999px;background:#c8d5d7;position:relative}.moni-v4-toggle span:after{content:'';position:absolute;left:2px;top:2px;height:13px;width:13px;border-radius:50%;background:white;transition:.15s}.moni-v4-toggle.on{color:#187964}.moni-v4-toggle.on span{background:#37a88d}.moni-v4-toggle.on span:after{transform:translateX(13px)}.moni-v4-section{margin:10px 0}.moni-v4-candidates{max-height:220px;overflow:auto;display:grid;gap:6px}.moni-v4-candidates button{display:flex;align-items:center;gap:9px;width:100%;border:1px solid #d5e3e0;border-radius:12px;background:#fbfdfd;padding:9px 10px;text-align:left;color:#173b52}.moni-v4-candidates button.selected{border-color:#2f9e87;background:#eefaf6}.moni-v4-candidates .radio{height:15px;width:15px;flex:0 0 auto;border:2px solid #a9bdb8;border-radius:50%}.moni-v4-candidates button.selected .radio{border:4px solid #2f9e87}.moni-v4-candidates b{font-size:11px}.moni-v4-warning,.moni-v4-error,.moni-v4-confirm,.moni-v4-result{margin:9px 0;border-radius:13px;padding:11px 12px;font-size:11px;line-height:1.6}.moni-v4-warning{border:1px solid #ead8a6;background:#fffbef;color:#7e682c}.moni-v4-error{border:1px solid #efb8bd;background:#fff6f7;color:#a5444e}.moni-v4-confirm{border:1px solid #cbdedb;background:#f5faf9;color:#4f6872}.moni-v4-confirm b,.moni-v4-result>b{display:block;margin-bottom:5px;font-size:13px;color:#173b52}.moni-v4-confirm p{margin:0 0 4px}.moni-v4-confirm small{display:block}.moni-v4-result{border:1px solid #bee0d6;background:#f3fbf8}.moni-v4-result p{margin:3px 0;color:#526c77}.moni-v4-result .links{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.moni-v4-result a{display:inline-flex;min-height:36px;align-items:center;border:1px solid #b7ddd3;border-radius:10px;background:white;padding:7px 10px;color:#16806c;font-size:11px;font-weight:900;text-decoration:none}.moni-v4-primary{width:100%;margin-top:12px;border:0;border-radius:13px;background:#218d79;padding:12px;color:white;font-size:12px;font-weight:900;box-shadow:0 6px 15px rgba(33,141,121,.18)}.moni-v4-primary.danger{background:#b94d54}.moni-v4-primary:disabled{opacity:.55}@media(max-width:520px){.moni-v4-card{border-radius:18px;padding:13px}.moni-v4-grid{grid-template-columns:1fr}.moni-v4-grid .wide{grid-column:auto}}
    `}</style>
  </>, host)
}
