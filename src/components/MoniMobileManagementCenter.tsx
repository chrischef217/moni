'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Option = { value: string; label: string }
type Filter = { key: string; label: string; type: 'date' | 'month' | 'text' | 'select'; value?: string; options?: Option[] }
type Card = { stage: 'draft'; domain: string; operation: 'READ'; title: string; source_user_message_id: string; filters?: Filter[]; warnings?: string[] }
type Link = { label: string; href: string }
type RowAction = { action: 'SHIP' | 'CANCEL' | 'DELETE'; label: string; tone?: string }
type HistoryRow = { id: string; title: string; subtitle?: string; meta?: string; badges?: string[]; links?: Link[]; actions?: RowAction[] }
type HistoryResult = { title: string; page: number; page_size: number; total: number; rows: HistoryRow[] }
type TaxCard = { label: string; value: string; tone?: string }
type TaxAccount = { id: string; name: string; type: string; balance: number | null; balance_date: string | null; stale_days: number | null; active: boolean }
type TaxSettlement = { id: string; person_name: string; source_type: string; settlement_month: string; gross_amount: number; withholding_amount: number; net_amount: number; status: string; due_date?: string | null; paid_date?: string | null }
type TimelineRow = { source?: string; type?: string; date?: string; amount?: number; label?: string; reference_no?: string }
type TaxResult = { title: string; month: string; basis: string; summary_cards: TaxCard[]; accounts: TaxAccount[]; settlements: TaxSettlement[]; actual_rows: TimelineRow[]; forecast_rows: TimelineRow[] }
type Result = HistoryResult | TaxResult
type PendingFinance = { settlement: TaxSettlement; action: 'set_settlement_due_date' | 'mark_settlement_paid' | 'reverse_settlement_payment'; value: string }
type PendingExport = { row: HistoryRow; action: RowAction }
type Confirmation = { id: string; preview_text?: string; warnings?: string[] }

const THREAD_KEY = 'moni-global-agent-thread-v11'
const txt = (value: unknown) => String(value ?? '').trim()
const won = (value: unknown) => `${Math.round(Number(value ?? 0)).toLocaleString('ko-KR')}원`
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
const isTax = (result: Result | null): result is TaxResult => Boolean(result && 'summary_cards' in result)

async function fetchResult(card: Card, filters: Record<string,string>, threadId: string) {
  const response = await fetch('/api/moni/mobile-management-center', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ command:'query', thread_id:threadId, source_user_message_id:card.source_user_message_id, domain:card.domain, filters }),
  })
  const payload = await response.json()
  if (!response.ok || !payload.ok) throw new Error(payload.error || '관리 데이터를 조회하지 못했습니다.')
  return (payload.result || null) as Result | null
}

export default function MoniMobileManagementCenter() {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [filters, setFilters] = useState<Record<string,string>>({})
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pendingFinance, setPendingFinance] = useState<PendingFinance | null>(null)
  const [financeConfirmation, setFinanceConfirmation] = useState<Confirmation | null>(null)
  const [pendingExport, setPendingExport] = useState<PendingExport | null>(null)
  const [exportConfirmation, setExportConfirmation] = useState<Confirmation | null>(null)
  const sourceRef = useRef('')
  const activeSourceRef = useRef('')
  const suppressedSourceRef = useRef('')
  const autoQueriedRef = useRef('')
  const threadId = () => txt(window.localStorage.getItem(THREAD_KEY))

  const query = useCallback(async (nextFilters?: Record<string,string>) => {
    if (!card || busy) return
    setBusy(true); setError('')
    try { setResult(await fetchResult(card, nextFilters || filters, threadId())) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '관리 데이터를 조회하지 못했습니다.') }
    finally { setBusy(false) }
  }, [card, filters, busy])

  const refresh = useCallback(async () => {
    const id = threadId(); if (!id) return
    try {
      const response = await fetch(`/api/moni/mobile-management-center?thread_id=${encodeURIComponent(id)}&_=${Date.now()}`, { cache:'no-store' })
      const payload = await response.json(); if (!response.ok || !payload.ok) return
      const next = (payload.card || null) as Card | null
      const nextSource = next?.source_user_message_id || ''
      if (nextSource && suppressedSourceRef.current === nextSource) return
      if (nextSource && suppressedSourceRef.current && suppressedSourceRef.current !== nextSource) suppressedSourceRef.current = ''
      const currentHost = document.querySelector<HTMLElement>('[data-moni-management-center-host="true"]')
      if (document.activeElement && currentHost?.contains(document.activeElement)) return
      activeSourceRef.current = nextSource; setCard(next)
      if (!next) { setResult(null); return }
      const key = `${next.source_user_message_id}:${next.domain}`
      if (sourceRef.current !== key) {
        sourceRef.current = key
        const initial = Object.fromEntries((next.filters || []).map((item) => [item.key, item.value || ''])) as Record<string,string>; initial.page = '1'
        setFilters(initial); setResult(null); setError(''); setPendingFinance(null); setFinanceConfirmation(null); setPendingExport(null); setExportConfirmation(null)
        if (autoQueriedRef.current !== key) {
          autoQueriedRef.current = key
          window.setTimeout(() => void fetchResult(next, initial, id).then(setResult).catch((reason) => setError(reason instanceof Error ? reason.message : '관리 데이터를 조회하지 못했습니다.')), 40)
        }
      }
    } catch { /* management center never blocks chat */ }
  }, [])

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]'); if (!root) return
    const scroller = root.querySelector<HTMLElement>('header + div'); if (!scroller) return
    const node = document.createElement('div'); node.dataset.moniManagementCenterHost = 'true'; node.className = 'moni-management-center-host'; scroller.appendChild(node); setHost(node)
    const hide = () => { suppressedSourceRef.current = activeSourceRef.current; setCard(null); setResult(null); setError(''); setPendingFinance(null); setFinanceConfirmation(null); setPendingExport(null); setExportConfirmation(null) }
    window.addEventListener('moni:user-turn-start', hide)
    const timer = window.setInterval(() => void refresh(), 950); void refresh()
    return () => { window.removeEventListener('moni:user-turn-start', hide); window.clearInterval(timer); node.remove() }
  }, [refresh])

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]'); if (!root) return
    if (card) root.dataset.moniManagementActive = 'true'; else delete root.dataset.moniManagementActive
    return () => { delete root.dataset.moniManagementActive }
  }, [card])

  function changeFilter(key: string, value: string) { setFilters((current) => ({ ...current, [key]:value, page:'1' })) }
  function page(delta: number) { const updated={...filters,page:String(Math.max(1,Number(filters.page||1)+delta))};setFilters(updated);void query(updated) }

  function startFinance(settlement: TaxSettlement, action: PendingFinance['action']) {
    const value = action === 'reverse_settlement_payment' ? '' : action === 'set_settlement_due_date' ? (settlement.due_date || today()) : today()
    setPendingFinance({ settlement, action, value }); setFinanceConfirmation(null); setError('')
  }
  async function prepareFinance() {
    if (!card || !pendingFinance || busy) return; setBusy(true); setError('')
    try {
      const data = pendingFinance.action === 'set_settlement_due_date' ? { due_date:pendingFinance.value } : pendingFinance.action === 'mark_settlement_paid' ? { paid_date:pendingFinance.value } : { reason:pendingFinance.value }
      const response=await fetch('/api/moni/mobile-management-center',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command:'prepare_finance',thread_id:threadId(),source_user_message_id:card.source_user_message_id,domain:card.domain,finance_action:pendingFinance.action,target_id:pendingFinance.settlement.id,data})})
      const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||'실행 내용을 확인하지 못했습니다.');setFinanceConfirmation(payload.confirmation)
    } catch(reason){setError(reason instanceof Error?reason.message:'실행 내용을 확인하지 못했습니다.')} finally{setBusy(false)}
  }
  async function executeFinance() {
    if (!card || !financeConfirmation?.id || busy) return; setBusy(true); setError('')
    try {
      const response=await fetch('/api/moni/mobile-management-center',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command:'execute_finance',thread_id:threadId(),confirmation_id:financeConfirmation.id})})
      const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||'실행하지 못했습니다.');setPendingFinance(null);setFinanceConfirmation(null);setResult(await fetchResult(card,filters,threadId()))
    } catch(reason){setError(reason instanceof Error?reason.message:'실행하지 못했습니다.')} finally{setBusy(false)}
  }

  function startExport(row: HistoryRow, action: RowAction) { setPendingExport({row,action});setExportConfirmation(null);setError('') }
  async function prepareExport() {
    if(!card||!pendingExport||busy)return;setBusy(true);setError('')
    try{const response=await fetch('/api/moni/mobile-management-center',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command:'prepare_export',thread_id:threadId(),source_user_message_id:card.source_user_message_id,domain:card.domain,target_id:pendingExport.row.id,export_action:pendingExport.action.action})});const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||'수출서류 처리 내용을 확인하지 못했습니다.');setExportConfirmation(payload.confirmation)}catch(reason){setError(reason instanceof Error?reason.message:'수출서류 처리 내용을 확인하지 못했습니다.')}finally{setBusy(false)}
  }
  async function executeExport() {
    if(!card||!exportConfirmation?.id||busy)return;setBusy(true);setError('')
    try{const response=await fetch('/api/moni/mobile-management-center',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command:'execute_export',thread_id:threadId(),confirmation_id:exportConfirmation.id})});const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||'수출서류를 처리하지 못했습니다.');setPendingExport(null);setExportConfirmation(null);setResult(await fetchResult(card,filters,threadId()))}catch(reason){setError(reason instanceof Error?reason.message:'수출서류를 처리하지 못했습니다.')}finally{setBusy(false)}
  }

  const history = useMemo(() => result && !isTax(result) ? result as HistoryResult : null, [result])
  const totalPages = history ? Math.max(1, Math.ceil(history.total / history.page_size)) : 1
  if (!host || !card) return null

  return createPortal(<>
    <section className="moni-mgmt-card">
      <div className="moni-mgmt-head"><div><span>MONI MOBILE 관리센터</span><h3>{card.title}</h3></div><em>조회·관리</em></div>
      {(card.warnings || []).map((warning) => <div className="moni-mgmt-warning" key={warning}>{warning}</div>)}
      <div className="moni-mgmt-filters">{(card.filters || []).map((item) => <label key={item.key}><span>{item.label}</span>{item.type === 'select' ? <select disabled={busy} value={filters[item.key] || ''} onChange={(event) => changeFilter(item.key,event.target.value)}>{(item.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input disabled={busy} type={item.type === 'month' ? 'month' : item.type === 'date' ? 'date' : 'text'} value={filters[item.key] || ''} onChange={(event) => changeFilter(item.key,event.target.value)} />}</label>)}</div>
      <button type="button" disabled={busy} className="moni-mgmt-primary" onClick={() => void query({ ...filters, page:'1' })}>{busy ? '처리 중…' : '조건으로 다시 조회'}</button>
      {error ? <div className="moni-mgmt-error">{error}</div> : null}

      {history ? <div className="moni-mgmt-results">
        <div className="moni-mgmt-summary"><b>총 {history.total.toLocaleString('ko-KR')}건</b><span>{history.page} / {totalPages} 페이지</span></div>
        {history.rows.length ? history.rows.map((row) => <article key={row.id} className="moni-mgmt-row"><div className="moni-mgmt-rowtop"><div><b>{row.title}</b><p>{row.subtitle}</p></div><div className="moni-mgmt-badges">{(row.badges || []).map((badge) => <span key={badge}>{badge}</span>)}</div></div>{row.meta ? <p className="moni-mgmt-meta">{row.meta}</p> : null}{(row.links || []).length ? <div className="moni-mgmt-links">{(row.links || []).map((link) => <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>)}</div> : null}{(row.actions || []).length ? <div className="moni-mgmt-row-actions">{(row.actions || []).map((action) => <button type="button" key={action.action} className={action.tone === 'danger' ? 'danger' : ''} onClick={() => startExport(row,action)}>{action.label}</button>)}</div> : null}</article>) : <div className="moni-mgmt-empty">조건에 맞는 기록이 없습니다.</div>}
        {totalPages > 1 ? <div className="moni-mgmt-paging"><button type="button" disabled={busy || history.page <= 1} onClick={() => page(-1)}>이전</button><span>{history.page} / {totalPages}</span><button type="button" disabled={busy || history.page >= totalPages} onClick={() => page(1)}>다음</button></div> : null}
      </div> : null}

      {result && isTax(result) ? <div className="moni-tax-wrap">
        <div className="moni-tax-summary">{result.summary_cards.map((item) => <div key={item.label} className={`moni-tax-kpi ${item.tone || ''}`}><span>{item.label}</span><b>{item.value}</b></div>)}</div><p className="moni-tax-basis">{result.basis}</p>
        <section className="moni-tax-section"><h4>계좌·현금함 잔액</h4>{result.accounts.filter((row) => row.active).length ? result.accounts.filter((row) => row.active).map((row) => <div className="moni-tax-line" key={row.id}><div><b>{row.name}</b><small>{row.balance_date ? `기준 ${row.balance_date}${Number(row.stale_days || 0)>7?' · 갱신 필요':''}` : '잔액 미등록'}</small></div><strong>{row.balance === null ? '-' : won(row.balance)}</strong></div>) : <div className="moni-mgmt-empty">등록된 계좌 잔액이 없습니다.</div>}</section>
        <section className="moni-tax-section"><h4>프리랜서 정산·지급</h4>{result.settlements.length ? result.settlements.map((row) => <div className="moni-tax-settlement" key={row.id}><div className="top"><div><b>{row.person_name}</b><small>{row.source_type} · {row.settlement_month}</small></div><span>{row.status}</span></div><div className="money"><span>총액 {won(row.gross_amount)}</span><span>원천징수 {won(row.withholding_amount)}</span><strong>실지급 {won(row.net_amount)}</strong></div><div className="dates">예정 {row.due_date || '-'} · 지급 {row.paid_date || '-'}</div><div className="actions"><button type="button" onClick={() => startFinance(row,'set_settlement_due_date')}>지급예정일</button>{row.status === 'confirmed' ? <button type="button" onClick={() => startFinance(row,'mark_settlement_paid')}>지급완료</button> : null}{row.status === 'paid' ? <button type="button" className="danger" onClick={() => startFinance(row,'reverse_settlement_payment')}>지급취소</button> : null}</div></div>) : <div className="moni-mgmt-empty">이 달의 정산건이 없습니다.</div>}</section>
        <section className="moni-tax-section"><h4>이번 달 실제 입출금</h4>{result.actual_rows.length ? result.actual_rows.map((row,index) => <div className="moni-tax-line" key={`${row.date}:${index}`}><div><b>{row.label || '입출금'}</b><small>{row.date || '-'}{row.reference_no ? ` · ${row.reference_no}` : ''}</small></div><strong className={row.type === 'outflow' ? 'negative' : 'positive'}>{row.type === 'outflow' ? '-' : '+'}{won(row.amount)}</strong></div>) : <div className="moni-mgmt-empty">실제 입출금 기록이 없습니다.</div>}</section>
        <section className="moni-tax-section"><h4>앞으로 30일 예정</h4>{result.forecast_rows.length ? result.forecast_rows.map((row,index) => <div className="moni-tax-line" key={`${row.date}:${index}`}><div><b>{row.label || '예정'}</b><small>{row.date || '-'}</small></div><strong className={row.type === 'outflow' ? 'negative' : 'positive'}>{row.type === 'outflow' ? '-' : '+'}{won(row.amount)}</strong></div>) : <div className="moni-mgmt-empty">30일 내 예정 입출금이 없습니다.</div>}</section>
      </div> : null}

      {pendingFinance ? <div className="moni-finance-modal"><div className="box"><b>{pendingFinance.action === 'set_settlement_due_date' ? '지급예정일 변경' : pendingFinance.action === 'mark_settlement_paid' ? '지급완료 처리' : '지급완료 취소'}</b><p>{pendingFinance.settlement.person_name} · 실지급 {won(pendingFinance.settlement.net_amount)}</p>{financeConfirmation ? <div className="confirm"><strong>실행 전 최종 확인</strong><p>{financeConfirmation.preview_text}</p>{(financeConfirmation.warnings || []).map((warning) => <small key={warning}>⚠ {warning}</small>)}</div> : pendingFinance.action === 'reverse_settlement_payment' ? <textarea rows={3} placeholder="지급취소 사유" value={pendingFinance.value} onChange={(event) => setPendingFinance({ ...pendingFinance, value:event.target.value })}/> : <input type="date" value={pendingFinance.value} onChange={(event) => setPendingFinance({ ...pendingFinance, value:event.target.value })}/>}<div className="buttons"><button type="button" className="secondary" onClick={() => { setPendingFinance(null); setFinanceConfirmation(null) }}>닫기</button>{financeConfirmation ? <button type="button" className="danger" disabled={busy} onClick={() => void executeFinance()}>{busy?'실행 중…':'확정 실행'}</button> : <button type="button" disabled={busy || !pendingFinance.value.trim()} onClick={() => void prepareFinance()}>{busy?'확인 중…':'실행 내용 확인'}</button>}</div></div></div> : null}
      {pendingExport ? <div className="moni-finance-modal"><div className="box"><b>수출서류 {pendingExport.action.label}</b><p>{pendingExport.row.title} · {pendingExport.row.subtitle}</p>{exportConfirmation ? <div className="confirm"><strong>실행 전 최종 확인</strong><p>{exportConfirmation.preview_text}</p>{(exportConfirmation.warnings || []).map((warning) => <small key={warning}>⚠ {warning}</small>)}</div> : <div className="moni-export-action-note">현재 서류 상태를 공식 수출관리 데이터에 반영합니다. 실행 내용을 먼저 확인해 주세요.</div>}<div className="buttons"><button type="button" className="secondary" onClick={() => { setPendingExport(null); setExportConfirmation(null) }}>닫기</button>{exportConfirmation ? <button type="button" className="danger" disabled={busy} onClick={() => void executeExport()}>{busy?'실행 중…':'확정 실행'}</button> : <button type="button" disabled={busy} onClick={() => void prepareExport()}>{busy?'확인 중…':'실행 내용 확인'}</button>}</div></div></div> : null}
    </section>
    <style jsx global>{`
      [data-moni-mobile-chat][data-moni-management-active="true"] .moni-v4-host,[data-moni-mobile-chat][data-moni-management-active="true"] .moni-crud-host,[data-moni-mobile-chat][data-moni-management-active="true"] .moni-pc-form-host{display:none!important}.moni-management-center-host{margin:12px 0 20px}.moni-mgmt-card{margin:0 auto;width:min(100%,760px);border:1px solid #c9e2dd;border-radius:22px;background:#fff;padding:15px;box-shadow:0 10px 30px rgba(23,59,82,.08);color:#173b52}.moni-mgmt-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:12px}.moni-mgmt-head span{font-size:10px;font-weight:900;letter-spacing:.08em;color:#168570}.moni-mgmt-head h3{font-size:17px;margin:3px 0 0;font-weight:900}.moni-mgmt-head em{font-style:normal;font-size:10px;font-weight:900;border-radius:999px;background:#edf8f5;padding:5px 8px;color:#247064}.moni-mgmt-warning,.moni-mgmt-error{border-radius:12px;padding:9px 10px;font-size:11px;line-height:1.5;margin:8px 0}.moni-mgmt-warning{background:#fff8e7;color:#806119}.moni-mgmt-error{background:#fff0f0;color:#a23b3b}.moni-mgmt-filters{display:grid;grid-template-columns:1fr 1fr;gap:9px}.moni-mgmt-filters label>span{display:block;margin-bottom:4px;font-size:10px;font-weight:900;color:#607781}.moni-mgmt-filters input,.moni-mgmt-filters select,.moni-finance-modal input,.moni-finance-modal textarea{width:100%;border:1px solid #cbdedb;border-radius:11px;background:#fbfefd;padding:10px;font-size:13px;color:#173b52;outline:none}.moni-mgmt-primary{width:100%;margin-top:10px;border:0;border-radius:12px;background:#177d6b;color:#fff;padding:11px;font-size:13px;font-weight:900}.moni-mgmt-primary:disabled{opacity:.5}.moni-mgmt-results,.moni-tax-wrap{margin-top:14px}.moni-mgmt-summary{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#607781;margin-bottom:8px}.moni-mgmt-summary b{font-size:13px;color:#173b52}.moni-mgmt-row{border:1px solid #dbe9e6;border-radius:15px;padding:12px;margin-bottom:8px;background:#fcfffe}.moni-mgmt-rowtop{display:flex;justify-content:space-between;gap:8px}.moni-mgmt-rowtop b{font-size:14px}.moni-mgmt-rowtop p,.moni-mgmt-meta{margin:3px 0 0;font-size:11px;color:#657a84;line-height:1.45}.moni-mgmt-badges{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}.moni-mgmt-badges span{height:22px;padding:4px 7px;border-radius:999px;background:#eef7f5;color:#247064;font-size:9px;font-weight:900}.moni-mgmt-links,.moni-mgmt-row-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.moni-mgmt-links a,.moni-mgmt-row-actions button{border:1px solid #bddbd5;border-radius:10px;padding:7px 9px;color:#176c5e;text-decoration:none;font-size:11px;font-weight:900;background:#fff}.moni-mgmt-row-actions button.danger{color:#a83b3b;border-color:#e2bcbc}.moni-mgmt-empty{padding:18px 12px;border-radius:12px;background:#f6f9fa;text-align:center;color:#7b8c94;font-size:11px}.moni-mgmt-paging{display:flex;justify-content:center;align-items:center;gap:10px;margin-top:11px}.moni-mgmt-paging button{border:1px solid #cbdedb;background:#fff;border-radius:10px;padding:7px 12px;font-size:11px;font-weight:800}.moni-tax-summary{display:grid;grid-template-columns:1fr 1fr;gap:8px}.moni-tax-kpi{border:1px solid #dce8e6;border-radius:13px;padding:10px;background:#fbfefd}.moni-tax-kpi span{display:block;font-size:9px;font-weight:900;color:#71858d}.moni-tax-kpi b{display:block;margin-top:4px;font-size:15px}.moni-tax-kpi.positive b,.positive{color:#147a64}.moni-tax-kpi.negative b,.negative{color:#bc4c4c}.moni-tax-basis{font-size:10px;line-height:1.5;color:#7c8d95;margin:8px 2px 14px}.moni-tax-section{border-top:1px solid #e3ecea;padding-top:13px;margin-top:13px}.moni-tax-section h4{margin:0 0 8px;font-size:13px;font-weight:900}.moni-tax-line{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 2px;border-bottom:1px solid #eff3f2}.moni-tax-line b{font-size:12px}.moni-tax-line small{display:block;margin-top:2px;font-size:9px;color:#7c8d95}.moni-tax-line strong{font-size:12px;white-space:nowrap}.moni-tax-settlement{border:1px solid #dbe9e6;border-radius:14px;padding:11px;margin:7px 0}.moni-tax-settlement .top{display:flex;justify-content:space-between}.moni-tax-settlement .top b{font-size:12px}.moni-tax-settlement .top small{display:block;font-size:9px;color:#7d8d95;margin-top:2px}.moni-tax-settlement .top>span{font-size:9px;font-weight:900;background:#eef7f5;border-radius:999px;padding:4px 7px}.moni-tax-settlement .money{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px;font-size:10px;color:#677b84}.moni-tax-settlement .money strong{color:#173b52}.moni-tax-settlement .dates{margin-top:5px;font-size:9px;color:#7d8d95}.moni-tax-settlement .actions{display:flex;gap:6px;margin-top:9px}.moni-tax-settlement .actions button{border:1px solid #c7ddd9;border-radius:9px;background:#fff;padding:6px 8px;font-size:10px;font-weight:900;color:#176c5e}.moni-tax-settlement .actions button.danger{color:#a83b3b;border-color:#e2bcbc}.moni-finance-modal{position:fixed;inset:0;z-index:1800;display:flex;align-items:flex-end;justify-content:center;background:rgba(9,20,31,.52);padding:12px}.moni-finance-modal .box{width:min(100%,560px);border-radius:22px 22px 16px 16px;background:#fff;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.24)}.moni-finance-modal .box>b{font-size:16px}.moni-finance-modal .box>p{font-size:11px;color:#657a84;margin:5px 0 12px}.moni-finance-modal .confirm,.moni-export-action-note{border-radius:12px;background:#fff8e7;padding:11px;margin-bottom:10px;font-size:11px;line-height:1.55}.moni-finance-modal .confirm strong{font-size:12px}.moni-finance-modal .confirm p{font-size:11px;line-height:1.5}.moni-finance-modal .confirm small{display:block;font-size:9px;color:#806119}.moni-finance-modal .buttons{display:flex;gap:8px;margin-top:10px}.moni-finance-modal .buttons button{flex:1;border:0;border-radius:11px;background:#177d6b;color:#fff;padding:10px;font-size:12px;font-weight:900}.moni-finance-modal .buttons .secondary{background:#edf2f3;color:#526b76}.moni-finance-modal .buttons .danger{background:#b63e3e}@media(max-width:520px){.moni-mgmt-card{border-radius:18px;padding:13px}.moni-mgmt-filters{grid-template-columns:1fr}.moni-tax-summary{grid-template-columns:1fr 1fr}}
    `}</style>
  </>, host)
}
