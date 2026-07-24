'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AllowanceSessionUser } from '@/types/allowance'

type SalesPayload = { ok:boolean; error?:string; summary:{order_count:number;total_amount:number} }
type ProductionAlert = { id:string; severity:'danger'|'warning'|'info'|'success'; title:string; detail:string; metric?:string }
type ProductionPayload = { ok:boolean; error?:string; kpis:{ production:{planned_due_g:number;actual_g:number;attainment_rate:number;month_total_planned_g:number;overdue_work_orders:number}; loss:{loss_g:number;loss_rate:number;known_loss_cost_won:number;incomplete_price_records:number}; risk:{upcoming_work_orders:number;risk_work_orders:number;shortage_materials:number;known_purchase_cost_won:number;unpriced_shortage_materials:number;recipe_issue_count:number} }; pricing:{known_input_cost_won:number;unpriced_used_material_count:number}; alerts:ProductionAlert[] }
type ReceivableOrder = { id:string;statement_number:string;sale_date:string;due_date?:string|null;client_name:string;total_amount:number;received_amount:number;outstanding_amount:number;collection_state:'paid'|'no_due_date'|'overdue'|'due_today'|'due_soon'|'scheduled';collection_label:string;d_day:number|null;unverified_partial:boolean }
type ReceivablesPayload = { ok:boolean;error?:string;orders:ReceivableOrder[];summary:{outstanding_amount:number;overdue_amount:number;overdue_count:number;due_soon_amount:number;due_soon_count:number;no_due_date_count:number;received_this_month:number;open_order_count:number} }
type TargetsPayload = { ok:boolean;error?:string;company:{target:{id:string;target_amount:number;note?:string|null}|null;actual_sales_amount:number;gap_amount:number|null;attainment_rate:number|null;open_pipeline_amount:number;open_pipeline_count:number;no_close_date_pipeline_count:number} }
type FinancePayload = { ok:boolean;error?:string;summary:{actual_inflow:number;actual_outflow:number;actual_net_movement:number;planned_30d_inflow:number;planned_30d_outflow:number;planned_30d_net:number;registered_account_balance:number|null;active_account_count:number;accounts_without_balance:number;stale_balance_accounts:number;paid_settlement_without_date_count:number};tax:{output_vat:number;registered_input_vat:number;registered_vat_difference:number;freelancer_withholding_reference:number;basis:string} }
type State = { sales:SalesPayload|null;production:ProductionPayload|null;receivables:ReceivablesPayload|null;targets:TargetsPayload|null;finance:FinancePayload|null }
type Tone = 'neutral'|'success'|'warning'|'danger'|'violet'|'blue'

const salesHref='/business-management?tab=sales-management&view=sales'
const receivablesHref='/business-management?tab=sales-management&view=receivables'
const targetHref='/business-management?tab=sales&view=targets'
const pipelineHref='/business-management?tab=sales&view=pipeline'
const financeHref='/business-management?tab=accounting&view=financial-control'

function kstMonth(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7)}
function kstTodayLabel(){return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'short'}).format(new Date())}
function won(value:unknown){const n=Number(value??0);return `${new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0}).format(Math.round(Number.isFinite(n)?n:0))}원`}
function percent(value:unknown,digits=1){const n=Number(value??0);return `${(Number.isFinite(n)?n:0).toFixed(digits)}%`}
function kg(valueG:unknown){const n=Number(valueG??0)/1000;return `${new Intl.NumberFormat('ko-KR',{maximumFractionDigits:n>=100?0:1}).format(Number.isFinite(n)?n:0)}kg`}
function clamp(value:unknown){const n=Number(value??0);return Math.max(0,Math.min(100,Number.isFinite(n)?n:0))}

function MetricCard({label,value,note,tone='neutral',onClick}:{label:string;value:string;note:string;tone?:Tone;onClick?:()=>void}){
  return <button type="button" onClick={onClick} disabled={!onClick} className={`ct-metric ct-tone-${tone} ${onClick?'ct-clickable':''}`}>
    <span className="ct-metric-label">{label}</span>
    <strong className="ct-metric-value">{value}</strong>
    <span className="ct-metric-note">{note}</span>
  </button>
}

function CompactStat({label,value,tone='neutral',onClick}:{label:string;value:string;tone?:Tone;onClick?:()=>void}){
  return <button type="button" onClick={onClick} disabled={!onClick} className={`ct-compact-stat ct-tone-${tone} ${onClick?'ct-clickable':''}`}>
    <span>{label}</span><strong>{value}</strong>
  </button>
}

function PanelTitle({eyebrow,title,action}:{eyebrow:string;title:string;action?:React.ReactNode}){
  return <div className="ct-panel-title"><div><span>{eyebrow}</span><h2>{title}</h2></div>{action}</div>
}

function AlertRow({tone,title,detail,metric,onClick}:{tone:Tone;title:string;detail:string;metric?:string;onClick?:()=>void}){
  return <button type="button" onClick={onClick} className={`ct-alert-row ct-tone-${tone}`}>
    <span className="ct-alert-dot"/><span className="ct-alert-copy"><b>{title}</b><small>{detail}</small></span>{metric&&<strong>{metric}</strong>}
  </button>
}

function collectionTone(row:ReceivableOrder):Tone{
  if(row.collection_state==='overdue')return'danger'
  if(row.collection_state==='due_today'||row.collection_state==='due_soon')return'warning'
  if(row.collection_state==='no_due_date')return'neutral'
  return'blue'
}

export default function MainControlTowerDashboard({session}:{session:AllowanceSessionUser}){
  const [state,setState]=useState<State>({sales:null,production:null,receivables:null,targets:null,finance:null})
  const [loading,setLoading]=useState(true)
  const [refreshing,setRefreshing]=useState(false)
  const [error,setError]=useState('')
  const [updatedAt,setUpdatedAt]=useState<Date|null>(null)

  const load=useCallback(async(manual=false)=>{
    if(manual)setRefreshing(true)
    setError('')
    try{
      const month=kstMonth()
      const [salesResponse,productionResponse,receivableResponse,targetResponse,financeResponse]=await Promise.all([
        fetch(`/api/moni/sales-operations?month=${encodeURIComponent(month)}&_=${Date.now()}`,{cache:'no-store'}),
        fetch(`/api/moni/production-dashboard?_=${Date.now()}`,{cache:'no-store'}),
        fetch(`/api/moni/receivables?_=${Date.now()}`,{cache:'no-store'}),
        fetch(`/api/moni/sales-targets?month=${encodeURIComponent(month)}&_=${Date.now()}`,{cache:'no-store'}),
        fetch(`/api/moni/financial-control?month=${encodeURIComponent(month)}&_=${Date.now()}`,{cache:'no-store'}),
      ])
      const [sales,production,receivables,targets,finance]=await Promise.all([
        salesResponse.json() as Promise<SalesPayload>,productionResponse.json() as Promise<ProductionPayload>,receivableResponse.json() as Promise<ReceivablesPayload>,targetResponse.json() as Promise<TargetsPayload>,financeResponse.json() as Promise<FinancePayload>,
      ])
      const messages:string[]=[]
      if(!salesResponse.ok||!sales.ok)messages.push(sales.error||'판매 데이터 오류')
      if(!productionResponse.ok||!production.ok)messages.push(production.error||'생산 데이터 오류')
      if(!receivableResponse.ok||!receivables.ok)messages.push(receivables.error||'수금 데이터 오류')
      if(!targetResponse.ok||!targets.ok)messages.push(targets.error||'목표 데이터 오류')
      if(!financeResponse.ok||!finance.ok)messages.push(finance.error||'재무 데이터 오류')
      setState({sales:salesResponse.ok&&sales.ok?sales:null,production:productionResponse.ok&&production.ok?production:null,receivables:receivableResponse.ok&&receivables.ok?receivables:null,targets:targetResponse.ok&&targets.ok?targets:null,finance:financeResponse.ok&&finance.ok?finance:null})
      setError(messages.join(' / '))
      setUpdatedAt(new Date())
    }catch(e){setError(e instanceof Error?e.message:'통합 대시보드 데이터를 불러오지 못했습니다.')}
    finally{setLoading(false);setRefreshing(false)}
  },[])

  useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),60_000);return()=>window.clearInterval(timer)},[load])

  const sales=state.sales?.summary
  const production=state.production
  const ar=state.receivables?.summary
  const target=state.targets?.company
  const finance=state.finance?.summary
  const tax=state.finance?.tax
  const collectionRows=useMemo(()=>(state.receivables?.orders??[]).filter((row)=>row.outstanding_amount>0).sort((a,b)=>{const priority=(row:ReceivableOrder)=>row.collection_state==='overdue'?0:row.collection_state==='due_today'?1:row.collection_state==='due_soon'?2:row.collection_state==='no_due_date'?3:4;return priority(a)-priority(b)||String(a.due_date??'9999-12-31').localeCompare(String(b.due_date??'9999-12-31'))}),[state.receivables])
  const urgentProductionAlerts=(production?.alerts??[]).filter((row)=>row.severity==='danger'||row.severity==='warning').slice(0,2)
  const goto=(href:string)=>{window.location.href=href}
  const openLegacy=(targetName:string,label:string)=>{window.sessionStorage.setItem('moni-pending-nav',JSON.stringify({category:'production',target:targetName,label,parentTarget:'생산관리'}));window.location.href='/?legacy=1'}
  const logout=async()=>{await fetch('/api/allowance/auth/logout',{method:'POST'}).catch(()=>null);window.location.href='/'}

  if(loading)return <main data-moni-control-tower className="ct-root"><div className="ct-loading">MONI 경영 데이터를 불러오는 중입니다.</div></main>

  const attainment=Number(target?.attainment_rate??0)
  const productionAttainment=Number(production?.kpis.production.attainment_rate??0)

  return <main data-moni-control-tower className="ct-root">
    <div className="ct-shell">
      <header className="ct-hero">
        <div className="ct-hero-copy">
          <div className="ct-kicker"><span className="ct-live-dot"/>MONI CONTROL TOWER <em>60초 자동 갱신</em></div>
          <h1>돈의 흐름을 보고, 다음 행동을 결정합니다.</h1>
          <p>목표 · 판매 · 수금 · 현금 · 생산 데이터를 한 화면에서 연결합니다. 등록되지 않은 숫자는 추정하지 않습니다.</p>
        </div>
        <div className="ct-hero-tools">
          <div className="ct-user-meta"><b>{kstTodayLabel()}</b><span>{session.displayName} · {updatedAt?updatedAt.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):'-'}</span></div>
          <button type="button" className="ct-tool-btn" onClick={()=>void load(true)} disabled={refreshing}>{refreshing?'갱신 중':'새로고침'}</button>
          <button type="button" className="ct-tool-btn ct-tool-btn-muted" onClick={()=>void logout()}>로그아웃</button>
        </div>
        <div className="ct-flow-line" aria-label="경영 흐름"><span>목표</span><i>→</i><span>매출</span><i>→</i><span>수금</span><i>→</i><span>현금</span><i>→</i><span>생산</span></div>
      </header>

      {error&&<div className="ct-error">일부 데이터 연결 오류: {error}</div>}

      <section className="ct-top-strip">
        <CompactStat label="이번 달 매출" value={won(sales?.total_amount)} tone="success" onClick={()=>goto(salesHref)}/>
        <CompactStat label="현재 받을 돈" value={won(ar?.outstanding_amount)} tone={(ar?.overdue_count??0)>0?'danger':'warning'} onClick={()=>goto(receivablesHref)}/>
        <CompactStat label="순현금증감" value={won(finance?.actual_net_movement)} tone={(finance?.actual_net_movement??0)>=0?'success':'danger'} onClick={()=>goto(financeHref)}/>
        <CompactStat label="생산 달성률" value={percent(productionAttainment)} tone={productionAttainment>=95?'blue':'warning'} onClick={()=>openLegacy('생산 개요','생산 대시보드')}/>
      </section>

      <section className="ct-grid-main">
        <article className="ct-panel ct-panel-wide">
          <PanelTitle eyebrow="SALES PERFORMANCE" title="목표 매출 진행" action={<button className="ct-text-link" onClick={()=>goto(targetHref)}>목표 관리</button>}/>
          <div className="ct-sales-focus">
            <div className="ct-sales-number"><span>이번 달 실적</span><strong>{won(sales?.total_amount)}</strong><small>{sales?.order_count??0}건 확정 판매</small></div>
            <div className="ct-sales-number"><span>월 목표</span><strong>{target?.target?won(target.target.target_amount):'설정 필요'}</strong><small>{target?.target?`부족 ${won(target.gap_amount)}`:'영업 목표매출에서 설정'}</small></div>
          </div>
          <div className="ct-progress-block"><div className="ct-progress-meta"><span>목표 달성률</span><b>{target?.target?percent(attainment):'-'}</b></div><div className="ct-progress-track"><span style={{width:`${clamp(attainment)}%`}}/></div></div>
          <div className="ct-mini-grid">
            <div><span>오픈 파이프라인</span><b>{target?.open_pipeline_count??0}건</b></div>
            <div><span>종료일 미설정</span><b>{target?.no_close_date_pipeline_count??0}건</b></div>
            <div><span>실제 수금</span><b>{won(ar?.received_this_month)}</b></div>
          </div>
        </article>

        <article className="ct-panel">
          <PanelTitle eyebrow="CASH CONTROL" title="현금 · 수금" action={<button className="ct-text-link" onClick={()=>goto(financeHref)}>재무 열기</button>}/>
          <div className="ct-health-list">
            <div><span>실제 입금</span><b className="ct-positive">{won(finance?.actual_inflow)}</b></div>
            <div><span>실제 지출</span><b>{won(finance?.actual_outflow)}</b></div>
            <div><span>30일 예정 순증감</span><b className={(finance?.planned_30d_net??0)<0?'ct-negative':''}>{won(finance?.planned_30d_net)}</b></div>
            <div><span>등록 계좌잔액</span><b>{finance?.registered_account_balance===null||finance?.registered_account_balance===undefined?'미등록':won(finance.registered_account_balance)}</b></div>
          </div>
        </article>

        <article className="ct-panel">
          <PanelTitle eyebrow="PRODUCTION HEALTH" title="생산 상태" action={<button className="ct-text-link" onClick={()=>openLegacy('생산 개요','생산 대시보드')}>생산 보기</button>}/>
          <div className="ct-production-score"><strong>{percent(productionAttainment)}</strong><span>계획 대비 생산 달성</span></div>
          <div className="ct-progress-track ct-progress-blue"><span style={{width:`${clamp(productionAttainment)}%`}}/></div>
          <div className="ct-health-list ct-health-list-tight">
            <div><span>14일 부족 원재료</span><b className={(production?.kpis.risk.shortage_materials??0)>0?'ct-negative':''}>{production?.kpis.risk.shortage_materials??0}종</b></div>
            <div><span>위험 작업지시</span><b>{production?.kpis.risk.risk_work_orders??0}건</b></div>
            <div><span>생산 로스율</span><b>{percent(production?.kpis.loss.loss_rate,2)}</b></div>
          </div>
        </article>
      </section>

      <section className="ct-grid-secondary">
        <article className="ct-panel ct-collection-panel">
          <PanelTitle eyebrow="COLLECTION FOCUS" title="받아야 할 돈" action={<button className="ct-text-link" onClick={()=>goto(receivablesHref)}>수금관리</button>}/>
          <div className="ct-table-wrap"><table className="ct-table"><thead><tr><th>상태</th><th>예정일</th><th>거래처</th><th>명세표</th><th className="ct-num">매출</th><th className="ct-num">입금</th><th className="ct-num">미수금</th></tr></thead><tbody>{collectionRows.slice(0,6).map((row)=><tr key={row.id}><td><span className={`ct-status ct-tone-${collectionTone(row)}`}>{row.collection_label}</span></td><td>{row.due_date||'미설정'}</td><td><b>{row.client_name}</b></td><td className="ct-link-cell">{row.statement_number}</td><td className="ct-num">{won(row.total_amount)}</td><td className="ct-num ct-positive">{won(row.received_amount)}</td><td className="ct-num ct-warning-text">{won(row.outstanding_amount)}</td></tr>)}{!collectionRows.length&&<tr><td colSpan={7} className="ct-empty">현재 받을 돈으로 등록된 판매가 없습니다.</td></tr>}</tbody></table></div>
        </article>

        <div className="ct-side-stack">
          <article className="ct-panel">
            <PanelTitle eyebrow="ACTION QUEUE" title="오늘 먼저 볼 것"/>
            <div className="ct-alert-list">
              {(ar?.overdue_count??0)>0&&<AlertRow tone="danger" title={`연체 미수금 ${ar?.overdue_count}건`} detail="입금예정일이 지난 금액부터 확인하세요." metric={won(ar?.overdue_amount)} onClick={()=>goto(receivablesHref)}/>} 
              {(finance?.planned_30d_net??0)<0&&<AlertRow tone="danger" title="30일 예정자금 순유출" detail="예정 유입보다 예정 유출이 큽니다." metric={won(Math.abs(finance?.planned_30d_net??0))} onClick={()=>goto(financeHref)}/>} 
              {(ar?.due_soon_count??0)>0&&<AlertRow tone="warning" title={`3일 내 수금예정 ${ar?.due_soon_count}건`} detail="D-3부터 D-Day까지의 예정 수금입니다." metric={won(ar?.due_soon_amount)} onClick={()=>goto(receivablesHref)}/>} 
              {target?.target&&(target.gap_amount??0)>0&&<AlertRow tone="blue" title="월 목표 부족액" detail={`이번 달 파이프라인 ${target.open_pipeline_count}건`} metric={won(target.gap_amount)} onClick={()=>goto(targetHref)}/>} 
              {urgentProductionAlerts.map((alert)=><AlertRow key={alert.id} tone={alert.severity==='danger'?'danger':'warning'} title={alert.title} detail={alert.detail} metric={alert.metric} onClick={()=>openLegacy('생산 개요','생산 대시보드')}/>) }
              {(ar?.overdue_count??0)===0&&(ar?.due_soon_count??0)===0&&(finance?.planned_30d_net??0)>=0&&!(target?.target&&(target.gap_amount??0)>0)&&urgentProductionAlerts.length===0&&<div className="ct-empty-card">현재 우선 경고가 없습니다.</div>}
            </div>
          </article>

          <article className="ct-panel">
            <PanelTitle eyebrow="REFERENCE" title="등록·신고 참고"/>
            <div className="ct-reference-grid">
              <div><span>VAT 등록자료 차액</span><b>{won(tax?.registered_vat_difference)}</b></div>
              <div><span>프리랜서 원천징수</span><b>{won(tax?.freelancer_withholding_reference)}</b></div>
              <div><span>원재료 구매 참고</span><b>{won(production?.kpis.risk.known_purchase_cost_won)}</b></div>
              <div><span>확인단가 로스 영향</span><b>{won(production?.kpis.loss.known_loss_cost_won)}</b></div>
            </div>
            <p className="ct-disclaimer">세무값은 현재 등록자료 기준 참고값이며 신고 확정값으로 표시하지 않습니다.</p>
          </article>
        </div>
      </section>

      <section className="ct-bottom-strip">
        <MetricCard label="월 목표매출" value={target?.target?won(target.target.target_amount):'설정 필요'} note={target?.target?`달성률 ${percent(attainment)}`:'목표를 등록하면 자동 연결됩니다.'} tone={target?.target?'blue':'violet'} onClick={()=>goto(targetHref)}/>
        <MetricCard label="이번 달 실제 매출" value={won(sales?.total_amount)} note={`확정 판매 ${sales?.order_count??0}건`} tone="success" onClick={()=>goto(salesHref)}/>
        <MetricCard label="현재 받을 돈" value={won(ar?.outstanding_amount)} note={`미수 ${ar?.open_order_count??0}건 · 연체 ${ar?.overdue_count??0}건`} tone={(ar?.overdue_count??0)>0?'danger':'warning'} onClick={()=>goto(receivablesHref)}/>
        <MetricCard label="생산 로스" value={percent(production?.kpis.loss.loss_rate,2)} note={`로스 ${kg(production?.kpis.loss.loss_g)}`} tone={(production?.kpis.loss.loss_rate??0)>=2?'danger':'neutral'} onClick={()=>openLegacy('생산 개요','생산 대시보드')}/>
      </section>

      <footer className="ct-footer"><span>Snapshot 잔액 · 실제 등록 데이터 기준</span><button type="button" onClick={()=>goto(pipelineHref)}>영업 데이터 보완 →</button></footer>
    </div>
  </main>
}
