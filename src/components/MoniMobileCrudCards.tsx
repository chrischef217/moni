'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Operation = 'CREATE' | 'UPDATE' | 'DELETE'
type MaterialOption = { id: string; name: string; item_code?: string | null; packing_weight_g?: number | null; current_stock_g?: number }
type SupplierSuggestion = { name: string; count: number; last_date?: string | null; source: string }
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
  source_assistant_message_id?: string | null
  inferred_from?: string
  fields: Record<string, any>
  material_options: MaterialOption[]
  supplier_suggestions: SupplierSuggestion[]
  candidates: Candidate[]
  evidence_note?: string
}
type ConfirmationCard = {
  stage: 'confirmation'
  operation: Operation
  source_user_message_id: string
  confirmation_id: string
  preview_text?: string
  warnings?: string[]
  expires_at?: string
}
type CompletedCard = {
  stage: 'completed'
  operation: Operation
  source_user_message_id: string
  confirmation_id?: string
  preview_text?: string
  result?: Record<string, any>
}
type FailedCard = {
  stage: 'failed'
  operation: Operation
  source_user_message_id: string
  confirmation_id?: string
  preview_text?: string
  error?: string
}
type ActionCard = DraftCard | ConfirmationCard | CompletedCard | FailedCard

const THREAD_KEY = 'moni-global-agent-thread-v11'
const text = (value: unknown) => String(value ?? '').trim()
const numberText = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed !== 0 ? String(parsed) : ''
}
const formatG = (value: unknown) => {
  const grams = Number(value || 0)
  if (Math.abs(grams) >= 1000) return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(grams / 1000)}kg`
  return `${new Intl.NumberFormat('ko-KR').format(grams)}g`
}

function operationTitle(operation: Operation) {
  if (operation === 'CREATE') return '원재료 입고 입력'
  if (operation === 'UPDATE') return '원재료 입고 수정'
  return '원재료 입고 삭제'
}

function operationVerb(operation: Operation) {
  if (operation === 'CREATE') return '입고 확정'
  if (operation === 'UPDATE') return '수정 확정'
  return '삭제 확정'
}

function initialFields(card: DraftCard) {
  const source = card.fields || {}
  return {
    raw_material_id: text(source.raw_material_id),
    raw_material_name: text(source.raw_material_name),
    tx_date: text(source.tx_date),
    quantity_g: numberText(source.quantity_g),
    quantity_packs: numberText(source.quantity_packs),
    packing_weight_g: numberText(source.packing_weight_g),
    supplier: text(source.supplier),
    unit_price: numberText(source.unit_price),
    note: text(source.note),
  }
}

function FieldLabel({ children, required = false }: { children: React.ReactNode; required?: boolean }) {
  return <span className="moni-crud-label">{children}{required ? <b>필수</b> : null}</span>
}

export default function MoniMobileCrudCards() {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [card, setCard] = useState<ActionCard | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [selectedTransactionId, setSelectedTransactionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const refreshTimer = useRef<number | null>(null)
  const lastSourceKey = useRef('')

  const threadId = () => text(window.localStorage.getItem(THREAD_KEY))

  const refreshCard = useCallback(async () => {
    const activeThread = threadId()
    if (!activeThread) return
    try {
      const response = await fetch(`/api/moni/mobile-actions?thread_id=${encodeURIComponent(activeThread)}&_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok || !payload.ok) return
      const next = (payload.card || null) as ActionCard | null
      setCard(next)
      if (next?.stage === 'draft') {
        const sourceKey = `${next.source_user_message_id}:${next.operation}`
        if (lastSourceKey.current !== sourceKey) {
          lastSourceKey.current = sourceKey
          setFields(initialFields(next))
          setSelectedTransactionId('')
          setError('')
        }
      }
    } catch {
      // The action card is supplemental; a temporary card refresh failure must not break chat.
    }
  }, [])

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return
    const cardHost = document.createElement('div')
    cardHost.dataset.moniCrudCardHost = 'true'
    cardHost.className = 'moni-crud-host'

    const place = () => {
      const scroller = root.querySelector<HTMLElement>('header + div')
      if (!scroller) return
      if (cardHost.parentElement !== scroller || scroller.lastElementChild !== cardHost) scroller.appendChild(cardHost)
      setHost((current) => current === cardHost ? current : cardHost)
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
      refreshTimer.current = window.setTimeout(() => {
        refreshTimer.current = null
        void refreshCard()
      }, 260)
    }

    place()
    const observer = new MutationObserver(place)
    observer.observe(root, { childList: true, subtree: true })
    const interval = window.setInterval(() => void refreshCard(), 1800)
    return () => {
      observer.disconnect()
      window.clearInterval(interval)
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
      cardHost.remove()
    }
  }, [refreshCard])

  const draft = card?.stage === 'draft' ? card : null
  const selectedCandidate = useMemo(
    () => draft?.candidates?.find((candidate) => candidate.id === selectedTransactionId) || null,
    [draft, selectedTransactionId],
  )

  const updateField = (key: string, value: string) => setFields((current) => ({ ...current, [key]: value }))

  const chooseCandidate = (candidate: Candidate) => {
    if (candidate.protected) return
    setSelectedTransactionId(candidate.id)
    if (draft?.operation === 'UPDATE') {
      setFields((current) => ({
        ...current,
        raw_material_id: candidate.material_id,
        raw_material_name: candidate.material_name,
        tx_date: text(candidate.tx_date),
        quantity_g: numberText(candidate.quantity_g),
        quantity_packs: numberText(candidate.quantity_packs),
        packing_weight_g: numberText(candidate.packing_weight_g),
        supplier: text(candidate.supplier),
        unit_price: numberText(candidate.unit_price),
        note: text(candidate.note),
      }))
    }
    setError('')
  }

  const chooseMaterial = (id: string) => {
    const option = draft?.material_options?.find((item) => item.id === id)
    setFields((current) => {
      const next = {
        ...current,
        raw_material_id: id,
        raw_material_name: option?.name || '',
        packing_weight_g: option?.packing_weight_g ? String(option.packing_weight_g) : current.packing_weight_g,
      }
      const packs = Number(next.quantity_packs || 0)
      const packing = Number(next.packing_weight_g || 0)
      if (packs > 0 && packing > 0 && !current.quantity_g) next.quantity_g = String(Math.round(packs * packing))
      return next
    })
  }

  const recalculateTotal = (key: 'quantity_packs' | 'packing_weight_g', value: string) => {
    setFields((current) => {
      const next = { ...current, [key]: value }
      const packs = Number(next.quantity_packs || 0)
      const packing = Number(next.packing_weight_g || 0)
      if (packs > 0 && packing > 0) next.quantity_g = String(Math.round(packs * packing))
      return next
    })
  }

  const prepare = async () => {
    if (!draft || busy) return
    if ((draft.operation === 'UPDATE' || draft.operation === 'DELETE') && !selectedTransactionId) {
      setError(`${draft.operation === 'DELETE' ? '삭제' : '수정'}할 입고 기록을 먼저 선택해 주세요.`)
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/moni/mobile-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'prepare',
          thread_id: threadId(),
          source_user_message_id: draft.source_user_message_id,
          operation: draft.operation,
          transaction_id: selectedTransactionId || undefined,
          fields,
        }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '입력 내용을 확인하지 못했습니다.')
      setCard({
        stage: 'confirmation',
        operation: draft.operation,
        source_user_message_id: draft.source_user_message_id,
        confirmation_id: payload.confirmation.id,
        preview_text: payload.confirmation.preview_text,
        warnings: payload.confirmation.warnings || [],
        expires_at: payload.confirmation.expires_at,
      })
    } catch (value) {
      setError(value instanceof Error ? value.message : '입력 내용을 확인하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const execute = async () => {
    if (!card || card.stage !== 'confirmation' || busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/moni/mobile-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'execute', thread_id: threadId(), confirmation_id: card.confirmation_id }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error || '업무를 실행하지 못했습니다.')
      setCard({
        stage: 'completed',
        operation: card.operation,
        source_user_message_id: card.source_user_message_id,
        confirmation_id: card.confirmation_id,
        preview_text: card.preview_text,
        result: payload.result || {},
      })
    } catch (value) {
      setError(value instanceof Error ? value.message : '업무를 실행하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  if (!host || !card) return null

  const content = (
    <section className={`moni-crud-card moni-crud-${card.operation.toLowerCase()} moni-crud-stage-${card.stage}`} aria-label={operationTitle(card.operation)}>
      <div className="moni-crud-head">
        <div>
          <span className="moni-crud-kicker">MONI 업무 카드</span>
          <h2>{operationTitle(card.operation)}</h2>
        </div>
        <span className="moni-crud-badge">{card.stage === 'draft' ? '입력' : card.stage === 'confirmation' ? '확인 대기' : card.stage === 'completed' ? '완료' : '확인 필요'}</span>
      </div>

      {card.stage === 'draft' ? (
        <>
          <p className="moni-crud-note">{card.evidence_note}</p>

          {(card.operation === 'UPDATE' || card.operation === 'DELETE') ? (
            <div className="moni-crud-section">
              <FieldLabel required>{card.operation === 'DELETE' ? '삭제할 입고 기록' : '수정할 입고 기록'}</FieldLabel>
              <div className="moni-crud-candidates">
                {card.candidates.length ? card.candidates.slice(0, 14).map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    disabled={candidate.protected || busy}
                    onClick={() => chooseCandidate(candidate)}
                    className={`moni-crud-candidate ${selectedTransactionId === candidate.id ? 'is-selected' : ''} ${candidate.protected ? 'is-protected' : ''}`}
                  >
                    <span className="moni-crud-radio" aria-hidden="true" />
                    <span className="moni-crud-candidate-main">
                      <b>{candidate.tx_date} · {candidate.material_name}</b>
                      <small>{formatG(candidate.quantity_g)} · {candidate.supplier || '매입처 미입력'}</small>
                      {candidate.protected ? <em>{candidate.protected_reason} · 여기서는 삭제/수정 불가</em> : null}
                    </span>
                  </button>
                )) : <div className="moni-crud-empty">조건에 맞는 최근 원재료 입고 기록을 찾지 못했습니다.</div>}
              </div>
            </div>
          ) : null}

          {card.operation === 'CREATE' || (card.operation === 'UPDATE' && selectedCandidate) ? (
            <div className="moni-crud-grid">
              <label className="moni-crud-field moni-crud-span-2">
                <FieldLabel required>원재료</FieldLabel>
                {card.operation === 'CREATE' ? (
                  <select value={fields.raw_material_id || ''} onChange={(event) => chooseMaterial(event.target.value)} disabled={busy}>
                    <option value="">원재료 선택</option>
                    {card.material_options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                ) : <input value={fields.raw_material_name || ''} readOnly />}
              </label>

              <label className="moni-crud-field">
                <FieldLabel required>입고일</FieldLabel>
                <input type="date" value={fields.tx_date || ''} onChange={(event) => updateField('tx_date', event.target.value)} disabled={busy} />
              </label>
              <label className="moni-crud-field">
                <FieldLabel>매입처</FieldLabel>
                <input list="moni-supplier-suggestions" value={fields.supplier || ''} onChange={(event) => updateField('supplier', event.target.value)} placeholder="주 매입처 자동 제안" disabled={busy} />
                <datalist id="moni-supplier-suggestions">
                  {card.supplier_suggestions.map((item) => <option key={item.name} value={item.name}>{item.source}</option>)}
                </datalist>
              </label>

              <label className="moni-crud-field">
                <FieldLabel>포장 개수</FieldLabel>
                <input inputMode="numeric" value={fields.quantity_packs || ''} onChange={(event) => recalculateTotal('quantity_packs', event.target.value)} placeholder="예: 10" disabled={busy} />
              </label>
              <label className="moni-crud-field">
                <FieldLabel>포장당 중량(g)</FieldLabel>
                <input inputMode="numeric" value={fields.packing_weight_g || ''} onChange={(event) => recalculateTotal('packing_weight_g', event.target.value)} placeholder="예: 20000" disabled={busy} />
              </label>

              <label className="moni-crud-field">
                <FieldLabel required>총 입고량(g)</FieldLabel>
                <input inputMode="numeric" value={fields.quantity_g || ''} onChange={(event) => updateField('quantity_g', event.target.value)} placeholder="자동 계산 또는 직접 입력" disabled={busy} />
              </label>
              <label className="moni-crud-field">
                <FieldLabel>단가</FieldLabel>
                <input inputMode="numeric" value={fields.unit_price || ''} onChange={(event) => updateField('unit_price', event.target.value)} placeholder="선택 입력" disabled={busy} />
              </label>

              <label className="moni-crud-field moni-crud-span-2">
                <FieldLabel>비고</FieldLabel>
                <input value={fields.note || ''} onChange={(event) => updateField('note', event.target.value)} placeholder="필요한 내용만 입력" disabled={busy} />
              </label>
            </div>
          ) : null}

          {card.operation === 'DELETE' && selectedCandidate ? (
            <div className="moni-crud-delete-summary">
              <b>선택됨</b>
              <span>{selectedCandidate.tx_date} · {selectedCandidate.material_name} · {formatG(selectedCandidate.quantity_g)} · {selectedCandidate.supplier || '매입처 미입력'}</span>
            </div>
          ) : null}

          <div className="moni-crud-actions">
            <button type="button" className={card.operation === 'DELETE' ? 'danger-soft' : 'primary'} onClick={() => void prepare()} disabled={busy || ((card.operation === 'UPDATE' || card.operation === 'DELETE') && !selectedTransactionId)}>
              {busy ? '확인 중…' : card.operation === 'DELETE' ? '삭제 내용 확인' : card.operation === 'UPDATE' ? '변경 내용 확인' : '입력 내용 확인'}
            </button>
          </div>
        </>
      ) : null}

      {card.stage === 'confirmation' ? (
        <>
          <div className="moni-crud-preview">
            <span>실행 전 최종 미리보기</span>
            <b>{card.preview_text}</b>
          </div>
          {card.warnings?.length ? <div className="moni-crud-warnings">{card.warnings.map((warning, index) => <p key={index}>• {warning}</p>)}</div> : null}
          <p className="moni-crud-safety">아직 실제 데이터는 바뀌지 않았습니다. 아래 확정 버튼을 눌러야 실행됩니다.</p>
          <div className="moni-crud-actions two">
            <button type="button" className="secondary" onClick={() => void refreshCard()} disabled={busy}>다시 확인</button>
            <button type="button" className={card.operation === 'DELETE' ? 'danger' : 'primary'} onClick={() => void execute()} disabled={busy}>{busy ? '실행 중…' : operationVerb(card.operation)}</button>
          </div>
        </>
      ) : null}

      {card.stage === 'completed' ? (
        <div className="moni-crud-complete">
          <span aria-hidden="true">✓</span>
          <div><b>{operationVerb(card.operation).replace(' 확정', '')} 완료</b><p>{card.preview_text || '실제 업무 데이터에 반영했습니다.'}</p></div>
        </div>
      ) : null}

      {card.stage === 'failed' ? (
        <div className="moni-crud-failed"><b>실행하지 못했습니다.</b><p>{card.error}</p></div>
      ) : null}

      {error ? <div className="moni-crud-error" role="alert">{error}</div> : null}
      <style jsx>{`
        .moni-crud-card{margin:12px 2px 4px;border:1px solid #cfe5df;border-radius:22px;background:rgba(255,255,255,.98);box-shadow:0 12px 34px rgba(23,59,82,.10);padding:16px;color:#173b52;text-align:left}
        .moni-crud-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.moni-crud-kicker{display:block;color:#1b8c78;font-size:10px;font-weight:900;letter-spacing:.08em}.moni-crud-head h2{margin:3px 0 0;font-size:16px;font-weight:950;letter-spacing:-.025em}.moni-crud-badge{shrink:0;border:1px solid #cce8e1;border-radius:999px;background:#eff9f6;padding:5px 8px;color:#247564;font-size:10px;font-weight:900}.moni-crud-delete .moni-crud-badge{border-color:#f5d1cd;background:#fff5f3;color:#bb4a40}
        .moni-crud-note{margin:0 0 13px;border-radius:13px;background:#f5faf8;padding:9px 10px;color:#607b86;font-size:11px;font-weight:650;line-height:1.55}.moni-crud-section{margin-bottom:13px}.moni-crud-label{display:flex;align-items:center;gap:6px;margin-bottom:6px;color:#486671;font-size:11px;font-weight:850}.moni-crud-label b{border-radius:999px;background:#e9f7f3;padding:2px 5px;color:#187966;font-size:8px}
        .moni-crud-candidates{display:grid;gap:7px;max-height:260px;overflow:auto}.moni-crud-candidate{display:flex;align-items:flex-start;gap:9px;width:100%;border:1px solid #dbe8e5;border-radius:14px;background:#fbfdfc;padding:10px;text-align:left;color:#244653}.moni-crud-candidate.is-selected{border-color:#42ab95;background:#eef9f6;box-shadow:0 0 0 2px rgba(66,171,149,.09)}.moni-crud-candidate.is-protected{opacity:.5}.moni-crud-radio{width:15px;height:15px;margin-top:1px;border:2px solid #a9bfba;border-radius:999px;background:white}.is-selected .moni-crud-radio{border:4px solid #2f9a83}.moni-crud-candidate-main{min-width:0;display:grid;gap:2px}.moni-crud-candidate-main b{font-size:11.5px;line-height:1.35}.moni-crud-candidate-main small{color:#6b838c;font-size:10.5px}.moni-crud-candidate-main em{color:#b55b4b;font-size:9.5px;font-style:normal;font-weight:800}.moni-crud-empty{border:1px dashed #d4e2df;border-radius:14px;padding:14px;color:#82969e;font-size:11px;text-align:center}
        .moni-crud-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.moni-crud-field{display:block;min-width:0}.moni-crud-span-2{grid-column:1/-1}.moni-crud-field input,.moni-crud-field select{width:100%;height:42px;border:1px solid #d5e3e0;border-radius:12px;background:#fbfdfd;padding:0 11px;color:#173b52;font-size:12px;font-weight:700;outline:none}.moni-crud-field input:focus,.moni-crud-field select:focus{border-color:#4aaf99;box-shadow:0 0 0 3px rgba(74,175,153,.10)}.moni-crud-field input[readonly]{background:#f2f6f5;color:#677e87}
        .moni-crud-delete-summary{display:grid;gap:3px;margin-top:12px;border:1px solid #f0d8d4;border-radius:13px;background:#fff8f6;padding:10px;color:#8e4a42;font-size:11px}.moni-crud-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.moni-crud-actions.two{display:grid;grid-template-columns:1fr 1.2fr}.moni-crud-actions button{min-height:44px;border:0;border-radius:13px;padding:0 16px;font-size:12px;font-weight:900}.moni-crud-actions .primary{background:#188d77;color:white;box-shadow:0 7px 18px rgba(24,141,119,.18)}.moni-crud-actions .secondary{border:1px solid #d3e1de;background:#f8fbfa;color:#58717a}.moni-crud-actions .danger{background:#c95145;color:white;box-shadow:0 7px 18px rgba(201,81,69,.16)}.moni-crud-actions .danger-soft{border:1px solid #efc9c4;background:#fff2ef;color:#b3473e}.moni-crud-actions button:disabled{opacity:.42;box-shadow:none}
        .moni-crud-preview{display:grid;gap:6px;border:1px solid #cfe5df;border-radius:15px;background:#f3faf8;padding:12px}.moni-crud-preview span{color:#528076;font-size:10px;font-weight:900}.moni-crud-preview b{font-size:12px;line-height:1.6}.moni-crud-warnings{margin-top:8px;border-radius:13px;background:#fff8e9;padding:8px 10px;color:#9b6a17;font-size:10.5px;font-weight:750;line-height:1.5}.moni-crud-warnings p{margin:2px 0}.moni-crud-safety{margin:9px 0 0;color:#778e96;font-size:10px;line-height:1.45}.moni-crud-complete{display:flex;gap:10px;align-items:flex-start;border:1px solid #bfe5d7;border-radius:15px;background:#eefaf5;padding:12px}.moni-crud-complete>span{display:flex;width:26px;height:26px;align-items:center;justify-content:center;border-radius:999px;background:#1d9a79;color:white;font-weight:900}.moni-crud-complete b{font-size:13px}.moni-crud-complete p{margin:3px 0 0;color:#55766e;font-size:10.5px;line-height:1.5}.moni-crud-failed,.moni-crud-error{margin-top:10px;border:1px solid #f0c8c3;border-radius:13px;background:#fff3f1;padding:10px;color:#a8443b;font-size:11px;line-height:1.5}.moni-crud-failed p{margin:3px 0 0}.moni-crud-error{font-weight:800}
        @media(max-width:380px){.moni-crud-grid{grid-template-columns:1fr}.moni-crud-span-2{grid-column:auto}.moni-crud-actions.two{grid-template-columns:1fr}}
      `}</style>
      <style jsx global>{`.moni-crud-host{width:100%;padding:0 14px 12px;box-sizing:border-box}`}</style>
    </section>
  )

  return createPortal(content, host)
}
