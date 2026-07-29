'use client'

import { useEffect, useState } from 'react'

type Purchase = { id:string; purchase_no:string; supplier_name_snapshot:string; item_name:string; due_date?:string|null; outstanding_amount:number; payment_state:string }
type Payload = { ok:boolean; error?:string; summary:{total_outstanding:number;overdue_amount:number;overdue_count:number;due_soon_amount:number;due_soon_count:number;no_due_date_count:number}; purchases:Purchase[] }
function won(value:unknown){const n=Number(value??0);return `${new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0}).format(Number.isFinite(n)?Math.round(n):0)}원`}
function label(value:string){return ({OVERDUE:'연체',DUE_TODAY:'오늘 지급',DUE_SOON:'7일 내 지급',NO_DUE_DATE:'예정일 미설정',SCHEDULED:'지급 예정',PARTIAL:'일부 지급'} as Record<string,string>)[value]||value}

export default function PurchaseDashboardSummary(){
  const [data,setData]=useState<Payload|null>(null)
  const [error,setError]=useState('')
  useEffect(()=>{let alive=true;const load=async()=>{try{const response=await fetch('/api/moni/purchases?scope=dashboard',{cache:'no-store'});const result=await response.json() as Payload;if(!response.ok||!result.ok)throw new Error(result.error||'미지급금 데이터를 불러오지 못했습니다.');if(alive)setData(result)}catch(reason){if(alive)setError(reason instanceof Error?reason.message:'미지급금 데이터를 불러오지 못했습니다.')}};void load();const timer=window.setInterval(()=>void load(),60_000);return()=>{alive=false;window.clearInterval(timer)}},[])
  if(error)return <section className="mx-auto mt-5 max-w-[1600px] rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-700">미지급금 연결 오류: {error}</section>
  if(!data)return null
  const rows=(data.purchases||[]).filter(row=>row.outstanding_amount>0).slice(0,5)
  return <section data-purchase-dashboard className="mx-auto mt-5 max-w-[1600px] rounded-[28px] border border-sky-100 bg-white/95 p-6 text-[#173b52] shadow-xl lg:p-8">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="text-xs font-black tracking-[0.16em] text-sky-700">PAYABLES CONTROL</div><h2 className="mt-1 text-2xl font-black">지급·미지급금</h2><p className="mt-2 text-sm text-[#627f91]">받을 돈과 동일한 중요도로 예정 지급과 연체 미지급금을 확인합니다.</p></div><button onClick={()=>{window.location.href='/business-management?tab=purchase&view=payables'}} className="rounded-xl bg-sky-700 px-5 py-3 text-sm font-black text-white">미지급금 관리</button></div>
    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Card label="총 미지급금" value={won(data.summary.total_outstanding)} tone="amber"/><Card label="연체 미지급금" value={won(data.summary.overdue_amount)} note={`${data.summary.overdue_count}건`} tone={data.summary.overdue_count>0?'rose':'green'}/><Card label="7일 내 지급예정" value={won(data.summary.due_soon_amount)} note={`${data.summary.due_soon_count}건`} tone="blue"/><Card label="지급일 미설정" value={`${data.summary.no_due_date_count}건`} tone={data.summary.no_due_date_count>0?'rose':'green'}/></div>
    {rows.length>0&&<div className="mt-6 overflow-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="text-xs font-black text-[#78909f]"><tr><th className="py-3">상태</th><th>지급예정일</th><th>매입처</th><th>품목</th><th>매입번호</th><th className="text-right">미지급금</th></tr></thead><tbody className="divide-y divide-sky-100">{rows.map(row=><tr key={row.id}><td className="py-3 font-black">{label(row.payment_state)}</td><td>{row.due_date||'미설정'}</td><td>{row.supplier_name_snapshot}</td><td>{row.item_name}</td><td>{row.purchase_no}</td><td className="text-right font-black text-amber-800">{won(row.outstanding_amount)}</td></tr>)}</tbody></table></div>}
  </section>
}

function Card({label,value,note,tone}:{label:string;value:string;note?:string;tone:string}){const tones:any={amber:'border-amber-200 bg-amber-50',rose:'border-rose-200 bg-rose-50',green:'border-emerald-200 bg-emerald-50',blue:'border-sky-200 bg-sky-50'};return <div className={`rounded-2xl border px-5 py-4 ${tones[tone]}`}><div className="text-xs font-black text-[#78909f]">{label}</div><div className="mt-1 text-2xl font-black">{value}</div>{note&&<div className="mt-2 text-xs text-[#627f91]">{note}</div>}</div>}
