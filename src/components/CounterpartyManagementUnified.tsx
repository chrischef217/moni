'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

type Kind = 'purchase' | 'sales'
type Party = Record<string, any>
type Person = { id: string; name: string; status: string }
type LedgerRow = { id:string; date:string; kind:'purchase'|'payment'|'sale'|'receipt'; item:string; quantity:string; unit_price:number|null; amount:number; balance:number; reference:string; amount_verified:boolean }
type LedgerPayload = { ok:boolean; error?:string; party?:Party; rows:LedgerRow[]; current_balance:number; page:number; page_size:number; pages:number; total:number }

const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500'
const secondaryButton = 'rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:border-slate-500 hover:text-white disabled:opacity-40'
const primaryButton = 'rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-500 disabled:opacity-40'
const ledgerButton = 'rounded-lg border border-blue-400/40 bg-blue-500/10 px-3 py-2 text-xs font-black text-blue-200 hover:bg-blue-500/20'

function money(value: unknown) { return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits:0 }).format(Math.round(Number(value ?? 0)))}원` }
function norm(value: unknown) { return String(value ?? '').trim().toLocaleLowerCase('ko-KR') }
function label(value: unknown) {
  return ({
    ACTIVE:'거래 중', INACTIVE:'거래중지', active:'거래 중', inactive:'거래중지',
    RAW_MATERIAL:'원재료', PACKAGING:'부재료', BOTH:'원재료·부재료', OTHER:'기타',
    BANK_TRANSFER:'계좌이체', CARD:'카드', CASH:'현금',
    IMMEDIATE:'즉시 지급', DAYS:'매입일 + N일', NEXT_MONTH_DAY:'익월 지정일', MONTH_END:'익월 말일', DIRECT:'건별 지정',
  } as Record<string,string>)[String(value ?? '')] || String(value ?? '-')
}
function emptySupplier() { return { company_name:'', business_registration_number:'', representative_name:'', contact_name:'', phone:'', email:'', address:'', supply_type:'BOTH', default_due_type:'DAYS', default_due_days:30, default_due_day:15, default_payment_method:'BANK_TRANSFER', default_payment_account:'', default_card_name:'', default_installment_months:1, tax_invoice_required:true, tax_type:'TAXABLE', currency:'KRW', status:'ACTIVE', notes:'' } }
function emptyClient() { return { company_name:'', business_registration_number:'', representative_name:'', contact_name:'', phone:'', email:'', address:'', payment_terms:'', status:'active', note:'', assigned_person_ids:[] as string[] } }

function Field({ label: title, children, wide=false }: { label:string; children:ReactNode; wide?:boolean }) {
  return <label className={wide ? 'md:col-span-2' : ''}><span className="mb-1.5 block text-xs font-black text-slate-400">{title}</span>{children}</label>
}
function Modal({ title, onClose, children, wide=false }: { title:string; onClose:()=>void; children:ReactNode; wide?:boolean }) {
  return <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/75 p-4"><div className={`max-h-[94vh] w-full ${wide?'max-w-7xl':'max-w-4xl'} overflow-hidden rounded-3xl border border-slate-700 bg-[#0f1b2d] shadow-2xl`}><div className="flex items-center justify-between border-b border-slate-700 px-6 py-4"><h2 className="text-xl font-black text-white">{title}</h2><button type="button" onClick={onClose} className={secondaryButton}>닫기</button></div><div className="max-h-[calc(94vh-78px)] overflow-y-auto p-6">{children}</div></div></div>
}
function Summary({ label:title, value, tone='blue' }: { label:string; value:string; tone?:'blue'|'green'|'amber' }) {
  const cls = tone==='green'?'border-emerald-500/30 bg-emerald-500/10 text-emerald-100':tone==='amber'?'border-amber-500/30 bg-amber-500/10 text-amber-100':'border-blue-500/30 bg-blue-500/10 text-blue-100'
  return <div className={`rounded-2xl border p-5 ${cls}`}><div className="text-sm opacity-75">{title}</div><div className="mt-2 text-2xl font-black">{value}</div></div>
}

export default function CounterpartyManagementUnified({ kind }: { kind:Kind }) {
  const isPurchase = kind === 'purchase'
  const [parties,setParties] = useState<Party[]>([])
  const [people,setPeople] = useState<Person[]>([])
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [search,setSearch] = useState('')
  const [editParty,setEditParty] = useState<Party|null>(null)
  const [draft,setDraft] = useState<Party>(() => isPurchase ? emptySupplier() : emptyClient())
  const [ledgerParty,setLedgerParty] = useState<Party|null>(null)
  const [ledger,setLedger] = useState<LedgerPayload|null>(null)
  const [ledgerSearch,setLedgerSearch] = useState('')
  const [ledgerPage,setLedgerPage] = useState(1)
  const [ledgerLoading,setLedgerLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      if (isPurchase) {
        const response = await fetch(`/api/moni/purchases?_=${Date.now()}`, { cache:'no-store' })
        const payload = await response.json()
        if (!response.ok || !payload.ok) throw new Error(payload.error || '매입처를 불러오지 못했습니다.')
        setParties(payload.suppliers || [])
      } else {
        const response = await fetch(`/api/moni/sales-operations?month=${new Date().toISOString().slice(0,7)}&_=${Date.now()}`, { cache:'no-store' })
        const payload = await response.json()
        if (!response.ok || !payload.ok) throw new Error(payload.error || '매출처를 불러오지 못했습니다.')
        setParties(payload.clients || [])
        setPeople((payload.people || []).filter((row:Person) => row.status === 'active'))
      }
    } catch (e) { setError(e instanceof Error ? e.message : '업체 정보를 불러오지 못했습니다.') }
    finally { setLoading(false) }
  }, [isPurchase])
  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const q = norm(search)
    if (!q) return parties
    return parties.filter((row) => norm([row.company_name,row.business_registration_number,row.representative_name,row.contact_name,row.phone,row.email].join(' ')).includes(q))
  }, [parties,search])

  function openEdit(row?:Party) {
    setEditParty(row || {})
    if (isPurchase) setDraft({ ...emptySupplier(), ...(row || {}), business_registration_number:row?.business_registration_number || '', representative_name:row?.representative_name || '', contact_name:row?.contact_name || '', phone:row?.phone || '', email:row?.email || '', address:row?.address || '', default_payment_account:row?.default_payment_account || '', default_card_name:row?.default_card_name || '', notes:row?.notes || '' })
    else setDraft({ ...emptyClient(), ...(row || {}), business_registration_number:row?.business_registration_number || '', representative_name:row?.representative_name || '', contact_name:row?.contact_name || '', phone:row?.phone || '', email:row?.email || '', address:row?.address || '', payment_terms:row?.payment_terms || '', note:row?.note || '', assigned_person_ids:row?.assigned_person_ids || [] })
    setError('')
  }

  async function save() {
    if (!String(draft.company_name || '').trim()) { setError(`${isPurchase?'매입처':'매출처'}명을 입력해 주세요.`); return }
    setSaving(true); setError(''); setNotice('')
    try {
      if (isPurchase) {
        const response = await fetch('/api/moni/purchases', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:editParty?.id?'update_supplier':'create_supplier', id:editParty?.id || undefined, ...draft }) })
        const payload = await response.json(); if (!response.ok || !payload.ok) throw new Error(payload.error || '매입처 저장에 실패했습니다.')
      } else {
        const response = await fetch('/api/moni/sales-operations', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'save_client', id:editParty?.id || undefined, data:draft }) })
        const payload = await response.json(); if (!response.ok || !payload.ok) throw new Error(payload.error || '매출처 저장에 실패했습니다.')
      }
      setEditParty(null); setNotice(`${isPurchase?'매입처':'매출처'} 정보를 저장했습니다.`); await load()
    } catch (e) { setError(e instanceof Error ? e.message : '업체 저장에 실패했습니다.') }
    finally { setSaving(false) }
  }

  const loadLedger = useCallback(async (party:Party, page:number, q:string) => {
    setLedgerLoading(true); setError('')
    try {
      const params = new URLSearchParams({ kind, party_id:String(party.id), page:String(page), page_size:'20', q })
      const response = await fetch(`/api/moni/counterparty-ledger?${params.toString()}&_=${Date.now()}`, { cache:'no-store' })
      const payload = await response.json() as LedgerPayload
      if (!response.ok || !payload.ok) throw new Error(payload.error || '거래내역을 불러오지 못했습니다.')
      setLedger(payload)
    } catch (e) { setError(e instanceof Error ? e.message : '거래내역을 불러오지 못했습니다.') }
    finally { setLedgerLoading(false) }
  }, [kind])

  function openLedger(row:Party) { setLedgerParty(row); setLedgerSearch(''); setLedgerPage(1); setLedger(null); void loadLedger(row,1,'') }
  useEffect(() => { if (ledgerParty) void loadLedger(ledgerParty,ledgerPage,ledgerSearch) }, [ledgerPage])

  const activeCount = parties.filter((row) => String(row.status).toUpperCase() === 'ACTIVE').length + parties.filter((row) => row.status === 'active').length
  const missingContact = parties.filter((row) => !row.phone && !row.email).length
  const title = isPurchase ? '매입처 관리' : '매출처 관리'

  return <main className="min-h-screen bg-[#071426] px-4 py-6 text-slate-100 md:px-8"><div className="mx-auto max-w-[1600px] space-y-5">
    <header className="rounded-3xl border border-slate-700 bg-[#0b1b30] p-6 shadow-xl"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold text-blue-300">MONI COUNTERPARTY MANAGEMENT</p><h1 className="mt-1 text-3xl font-black">{title}</h1><p className="mt-2 text-sm text-slate-400">업체 정보 수정과 실제 {isPurchase?'매입·지급':'매출·입금'} 원장을 한 화면에서 관리합니다.</p></div><button type="button" onClick={() => void load()} className={secondaryButton}>새로고침</button></div></header>
    {error && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">{error}</div>}{notice && <div className="rounded-2xl border border-green-500/40 bg-green-500/10 p-4 text-green-200">{notice}</div>}
    <div className="grid gap-3 md:grid-cols-3"><Summary label={`전체 ${isPurchase?'매입처':'매출처'}`} value={`${parties.length}곳`} /><Summary label="거래 중" value={`${activeCount}곳`} tone="green" /><Summary label="연락처 미등록" value={`${missingContact}곳`} tone="amber" /></div>
    <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/60"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 p-5"><div><h2 className="text-xl font-black">{title}</h2><p className="mt-1 text-sm text-slate-400">업체명을 클릭하거나 관리의 {isPurchase?'매입내역':'매출내역'} 버튼을 누르면 거래원장을 확인할 수 있습니다.</p></div><div className="flex gap-2"><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder={`${isPurchase?'매입처':'매출처'} 검색`} className="min-w-[260px] rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500"/><button type="button" onClick={()=>openEdit()} className={primaryButton}>+ {isPurchase?'매입처':'매출처'} 등록</button></div></div>
      {loading ? <div className="p-16 text-center text-slate-400">업체 정보를 불러오는 중입니다.</div> : <div className="overflow-x-auto"><table className="min-w-[1100px] w-full text-sm"><thead className="bg-slate-800 text-slate-300"><tr>{['상태',isPurchase?'매입처':'매출처','사업자번호','대표자·담당자',isPurchase?'지급조건':'결제조건','연락처','관리'].map((h)=><th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr></thead><tbody>{filtered.map((row)=><tr key={row.id} className="border-t border-slate-800"><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-xs font-black ${(String(row.status).toUpperCase()==='ACTIVE'||row.status==='active')?'bg-green-500/15 text-green-300':'bg-slate-700 text-slate-400'}`}>{label(row.status)}</span></td><td className="px-4 py-3"><button type="button" onClick={()=>openLedger(row)} className="font-black text-white underline decoration-blue-400/60 underline-offset-4 hover:text-blue-200">{row.company_name}</button></td><td className="px-4 py-3">{row.business_registration_number || '-'}</td><td className="px-4 py-3">{row.representative_name || '-'}<div className="text-xs text-slate-500">{row.contact_name || '-'}</div></td><td className="px-4 py-3">{isPurchase ? <>{label(row.default_due_type)}{row.default_due_type==='DAYS'?` +${row.default_due_days??0}일`:''}</> : (row.payment_terms || '-')}</td><td className="px-4 py-3">{row.phone || row.email || '-'}</td><td className="whitespace-nowrap px-4 py-3"><button type="button" onClick={()=>openLedger(row)} className={`${ledgerButton} mr-2`}>{isPurchase?'매입내역':'매출내역'}</button><button type="button" onClick={()=>openEdit(row)} className={secondaryButton}>수정</button></td></tr>)}{!filtered.length&&<tr><td colSpan={7} className="p-12 text-center text-slate-500">검색 결과가 없습니다.</td></tr>}</tbody></table></div>}
    </section>
  </div>

  {editParty!==null && <Modal title={`${isPurchase?'매입처':'매출처'} ${editParty.id?'수정':'등록'}`} onClose={()=>setEditParty(null)}><div className="grid gap-4 md:grid-cols-2">
    <Field label={`${isPurchase?'매입처':'매출처'}명 *`}><input className={inputClass} value={draft.company_name||''} onChange={(e)=>setDraft({...draft,company_name:e.target.value})}/></Field><Field label="사업자등록번호"><input className={inputClass} value={draft.business_registration_number||''} onChange={(e)=>setDraft({...draft,business_registration_number:e.target.value})}/></Field><Field label="대표자"><input className={inputClass} value={draft.representative_name||''} onChange={(e)=>setDraft({...draft,representative_name:e.target.value})}/></Field><Field label="담당자"><input className={inputClass} value={draft.contact_name||''} onChange={(e)=>setDraft({...draft,contact_name:e.target.value})}/></Field><Field label="전화번호"><input className={inputClass} value={draft.phone||''} onChange={(e)=>setDraft({...draft,phone:e.target.value})}/></Field><Field label="이메일"><input className={inputClass} value={draft.email||''} onChange={(e)=>setDraft({...draft,email:e.target.value})}/></Field><Field label="주소" wide><input className={inputClass} value={draft.address||''} onChange={(e)=>setDraft({...draft,address:e.target.value})}/></Field>
    {isPurchase ? <><Field label="공급 구분"><select className={inputClass} value={draft.supply_type} onChange={(e)=>setDraft({...draft,supply_type:e.target.value})}><option value="RAW_MATERIAL">원재료</option><option value="PACKAGING">부재료</option><option value="BOTH">원재료·부재료</option><option value="OTHER">기타</option></select></Field><Field label="지급조건"><select className={inputClass} value={draft.default_due_type} onChange={(e)=>setDraft({...draft,default_due_type:e.target.value})}><option value="IMMEDIATE">즉시 지급</option><option value="DAYS">매입일 + N일</option><option value="NEXT_MONTH_DAY">익월 지정일</option><option value="MONTH_END">익월 말일</option><option value="DIRECT">건별 지정</option></select></Field><Field label="지급 유예일"><input type="number" className={inputClass} value={draft.default_due_days??0} onChange={(e)=>setDraft({...draft,default_due_days:Number(e.target.value)})}/></Field><Field label="기본 결제수단"><select className={inputClass} value={draft.default_payment_method} onChange={(e)=>setDraft({...draft,default_payment_method:e.target.value})}><option value="BANK_TRANSFER">계좌이체</option><option value="CARD">카드</option><option value="CASH">현금</option><option value="OTHER">기타</option></select></Field><Field label="상태"><select className={inputClass} value={draft.status} onChange={(e)=>setDraft({...draft,status:e.target.value})}><option value="ACTIVE">거래 중</option><option value="INACTIVE">거래중지</option></select></Field><Field label="비고"><input className={inputClass} value={draft.notes||''} onChange={(e)=>setDraft({...draft,notes:e.target.value})}/></Field></> : <><Field label="결제조건"><input className={inputClass} value={draft.payment_terms||''} onChange={(e)=>setDraft({...draft,payment_terms:e.target.value})}/></Field><Field label="상태"><select className={inputClass} value={draft.status} onChange={(e)=>setDraft({...draft,status:e.target.value})}><option value="active">거래 중</option><option value="inactive">거래중지</option></select></Field><div className="md:col-span-2"><span className="mb-2 block text-xs font-black text-slate-400">담당 영업 프리랜서</span><div className="grid gap-2 md:grid-cols-2">{people.map((person)=>{const checked=(draft.assigned_person_ids||[]).includes(person.id);return <label key={person.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${checked?'border-blue-500 bg-blue-500/10':'border-slate-700'}`}><input type="checkbox" checked={checked} onChange={(e)=>setDraft({...draft,assigned_person_ids:e.target.checked?[...(draft.assigned_person_ids||[]),person.id]:(draft.assigned_person_ids||[]).filter((id:string)=>id!==person.id)})}/><b>{person.name}</b></label>})}</div></div><Field label="비고" wide><textarea rows={3} className={inputClass} value={draft.note||''} onChange={(e)=>setDraft({...draft,note:e.target.value})}/></Field></>}
  </div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={()=>setEditParty(null)} className={secondaryButton}>취소</button><button type="button" disabled={saving} onClick={()=>void save()} className={primaryButton}>{saving?'저장 중...':'저장'}</button></div></Modal>}

  {ledgerParty && <Modal title={`${ledgerParty.company_name} · ${isPurchase?'매입내역':'매출내역'}`} onClose={()=>{setLedgerParty(null);setLedger(null)}} wide><div className="mb-5 grid gap-3 md:grid-cols-[1fr_auto] md:items-center"><div><div className="text-sm text-slate-400">현재 원장 잔액</div><div className={`mt-1 text-3xl font-black ${(ledger?.current_balance??0)>0?'text-amber-300':'text-emerald-300'}`}>{money(ledger?.current_balance||0)}</div><div className="mt-1 text-xs text-slate-500">{isPurchase?'매입 - 지급':'매출 - 입금'} 누적 기준</div></div><div className="flex gap-2"><input value={ledgerSearch} onChange={(e)=>setLedgerSearch(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter'){setLedgerPage(1);void loadLedger(ledgerParty,1,ledgerSearch)}}} placeholder="날짜·항목·번호 검색" className="min-w-[300px] rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500"/><button type="button" className={secondaryButton} onClick={()=>{setLedgerPage(1);void loadLedger(ledgerParty,1,ledgerSearch)}}>검색</button></div></div>
    {ledgerLoading ? <div className="p-16 text-center text-slate-400">거래원장을 불러오는 중입니다.</div> : <div className="overflow-x-auto rounded-2xl border border-slate-700"><table className="min-w-[1050px] w-full text-sm"><thead className="bg-slate-800 text-slate-300"><tr>{['날짜','구분','항목','수량','단가','합계','잔액','번호·참조'].map((h)=><th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr></thead><tbody>{(ledger?.rows||[]).map((row)=><tr key={row.id} className="border-t border-slate-800"><td className="whitespace-nowrap px-4 py-3">{row.date}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-black ${row.amount>=0?'bg-blue-500/15 text-blue-200':'bg-emerald-500/15 text-emerald-200'}`}>{row.kind==='purchase'?'매입':row.kind==='payment'?'지급':row.kind==='sale'?'매출':'입금'}</span></td><td className="max-w-[300px] px-4 py-3 font-bold text-white">{row.item}</td><td className="whitespace-nowrap px-4 py-3">{row.quantity||'-'}</td><td className="whitespace-nowrap px-4 py-3">{row.unit_price===null?'-':money(row.unit_price)}</td><td className={`whitespace-nowrap px-4 py-3 font-bold ${row.amount<0?'text-emerald-300':''}`}>{!row.amount_verified?'금액 미확정':money(row.amount)}</td><td className="whitespace-nowrap px-4 py-3 font-black text-amber-200">{money(row.balance)}</td><td className="px-4 py-3 text-xs text-slate-400">{row.reference||'-'}</td></tr>)}{!(ledger?.rows||[]).length&&<tr><td colSpan={8} className="p-12 text-center text-slate-500">거래내역이 없습니다.</td></tr>}</tbody></table></div>}
    {(ledger?.pages||1)>1&&<div className="mt-5 flex flex-wrap justify-center gap-2">{Array.from({length:ledger?.pages||1},(_,i)=>i+1).map((page)=><button key={page} type="button" onClick={()=>setLedgerPage(page)} className={`min-w-10 rounded-lg px-3 py-2 text-sm font-black ${page===ledgerPage?'bg-blue-600 text-white':'border border-slate-700 text-slate-300'}`}>{page}</button>)}</div>}
    <div className="mt-3 text-right text-xs text-slate-500">총 {ledger?.total||0}개 항목 · 페이지 {ledger?.page||1}/{ledger?.pages||1}</div>
  </Modal>}
  </main>
}
