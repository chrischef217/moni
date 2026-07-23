'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

type SalesUnit = 'kg' | 'ea' | 'box'
type Product = { id: string; product_name: string; product_code?: string | null; product_spec?: string | null; weight_g?: number | null }
type Variant = {
  id: string
  product_id: string
  variant_name: string
  sales_unit: SalesUnit
  unit_weight_g?: number | null
  box_units?: number | null
  default_unit_price: number
  moq_quantity: number
  is_default: boolean
  active: boolean
  sort_order: number
  note?: string | null
}
type Client = { id: string; company_name: string; status: 'active' | 'inactive'; assigned_person_ids: string[] }
type Person = { id: string; name: string; status: string }
type AgentRate = { person_id: string; settlement_rate_per_kg: number }
type Term = { id: string; client_id: string; variant_id: string; active: boolean; unit_price: number; moq_quantity: number; note?: string | null; agent_rates: AgentRate[] }
type Payload = { ok: boolean; error?: string; products: Product[]; variants: Variant[]; clients: Client[]; people: Person[]; client_variant_terms: Term[] }

type VariantForm = { product_id: string; variant_name: string; sales_unit: SalesUnit; unit_weight_g: string; box_units: string; default_unit_price: string; moq_quantity: string; is_default: boolean; active: boolean; note: string }
type TermForm = { client_id: string; variant_id: string; unit_price: string; moq_quantity: string; active: boolean; note: string; agent_rates: Record<string,string> }

const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500'
const secondaryButton = 'rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:border-slate-500 hover:text-white disabled:opacity-40'
const primaryButton = 'rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-500 disabled:opacity-40'

function money(value: unknown) { return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(Number(value ?? 0)))}원` }
function qty(value: unknown) { return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(Number(value ?? 0)) }
function unitLabel(unit: SalesUnit) { return unit === 'box' ? 'BOX' : unit === 'ea' ? 'EA' : 'kg' }
function variantSpec(row: Variant) {
  if (row.sales_unit === 'kg') return 'kg 단위 판매'
  if (row.sales_unit === 'ea') return `${qty(row.unit_weight_g)}g / EA`
  return `${qty(row.unit_weight_g)}g × ${qty(row.box_units)}EA / BOX`
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-sm text-slate-300"><span className="mb-1.5 block">{label}</span>{children}</label> }
function Modal({ title, onClose, children, maxWidth='max-w-3xl' }: { title: string; onClose: () => void; children: ReactNode; maxWidth?: string }) { return <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/75 p-4"><div className={`max-h-[94vh] w-full ${maxWidth} overflow-hidden rounded-3xl border border-slate-700 bg-[#0f1b2d] shadow-2xl`}><div className="flex items-center justify-between border-b border-slate-700 px-6 py-4"><h2 className="text-xl font-black">{title}</h2><button type="button" onClick={onClose} className={secondaryButton}>닫기</button></div><div className="max-h-[calc(94vh-78px)] overflow-y-auto p-6">{children}</div></div></div> }
function Summary({ label, value, note, tone='default' }: { label:string; value:string; note?:string; tone?:'default'|'warning'|'success' }) { const cls=tone==='warning'?'border-amber-500/30 bg-amber-500/[0.06] text-amber-100':tone==='success'?'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-100':'border-slate-700 bg-slate-900/60 text-white'; return <div className={`rounded-2xl border p-5 ${cls}`}><div className="text-xs font-black uppercase tracking-[0.12em] opacity-60">{label}</div><div className="mt-2 text-2xl font-black">{value}</div>{note&&<div className="mt-1 text-xs opacity-60">{note}</div>}</div> }

function emptyVariant(productId=''): VariantForm { return { product_id:productId, variant_name:'', sales_unit:'kg', unit_weight_g:'', box_units:'', default_unit_price:'0', moq_quantity:'0', is_default:false, active:true, note:'' } }

export default function SalesVariantPricingModule() {
  const [data,setData]=useState<Payload|null>(null)
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [search,setSearch]=useState('')
  const [variantModal,setVariantModal]=useState(false)
  const [variantId,setVariantId]=useState('')
  const [variantForm,setVariantForm]=useState<VariantForm>(emptyVariant())
  const [selectedClientId,setSelectedClientId]=useState('')
  const [termModal,setTermModal]=useState(false)
  const [termForm,setTermForm]=useState<TermForm>({ client_id:'', variant_id:'', unit_price:'0', moq_quantity:'0', active:true, note:'', agent_rates:{} })

  const load=useCallback(async()=>{ setLoading(true); setError(''); try { const response=await fetch(`/api/moni/sales-pricing-v4?_=${Date.now()}`,{cache:'no-store'}); const payload=await response.json() as Payload; if(!response.ok||!payload.ok) throw new Error(payload.error||'판매규격 데이터를 불러오지 못했습니다.'); setData(payload); setSelectedClientId((current)=>current||payload.clients.find((row)=>row.status==='active')?.id||'') } catch(e){ setError(e instanceof Error?e.message:'판매규격 데이터를 불러오지 못했습니다.') } finally { setLoading(false) } },[])
  useEffect(()=>{ void load() },[load])

  const products=data?.products??[]
  const variants=data?.variants??[]
  const clients=data?.clients??[]
  const people=data?.people??[]
  const terms=data?.client_variant_terms??[]
  const productById=useMemo(()=>new Map(products.map((row)=>[row.id,row])),[products])
  const personById=useMemo(()=>new Map(people.map((row)=>[row.id,row])),[people])
  const termByKey=useMemo(()=>new Map(terms.map((row)=>[`${row.client_id}:${row.variant_id}`,row])),[terms])
  const selectedClient=clients.find((row)=>row.id===selectedClientId)
  const query=search.trim().toLowerCase()
  const visibleProducts=products.filter((product)=>!query||`${product.product_name} ${product.product_code??''}`.toLowerCase().includes(query)||variants.some((variant)=>variant.product_id===product.id&&variant.variant_name.toLowerCase().includes(query)))
  const multiVariantCount=products.filter((product)=>variants.filter((variant)=>variant.product_id===product.id).length>1).length
  const missingPrice=variants.filter((variant)=>variant.active&&Number(variant.default_unit_price)<=0).length

  async function post(action:string,bodyData:Record<string,unknown>,id=''){ const response=await fetch('/api/moni/sales-pricing-v4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id:id||undefined,data:bodyData})}); const result=await response.json(); if(!response.ok||!result.ok) throw new Error(result.error||'저장에 실패했습니다.'); return result }

  function openVariant(productId:string,row?:Variant){ setVariantId(row?.id??''); setVariantForm(row?{ product_id:row.product_id,variant_name:row.variant_name,sales_unit:row.sales_unit,unit_weight_g:String(row.unit_weight_g??''),box_units:String(row.box_units??''),default_unit_price:String(row.default_unit_price??0),moq_quantity:String(row.moq_quantity??0),is_default:row.is_default,active:row.active,note:row.note??''}:emptyVariant(productId)); setVariantModal(true) }
  async function saveVariant(){ setSaving(true);setError('');setNotice('');try{await post('save_variant',{...variantForm,unit_weight_g:Number(variantForm.unit_weight_g||0),box_units:Number(variantForm.box_units||0),default_unit_price:Number(variantForm.default_unit_price||0),moq_quantity:Number(variantForm.moq_quantity||0)},variantId);setVariantModal(false);setNotice(variantId?'판매규격을 수정했습니다.':'판매규격을 추가했습니다.');await load()}catch(e){setError(e instanceof Error?e.message:'판매규격 저장에 실패했습니다.')}finally{setSaving(false)}}

  function openTerm(variant:Variant){ if(!selectedClientId){setError('거래처를 먼저 선택해 주세요.');return} const existing=termByKey.get(`${selectedClientId}:${variant.id}`); const rates:Record<string,string>={}; for(const row of existing?.agent_rates??[]) rates[row.person_id]=String(row.settlement_rate_per_kg??0); setTermForm({client_id:selectedClientId,variant_id:variant.id,unit_price:String(existing?.unit_price??variant.default_unit_price??0),moq_quantity:String(existing?.moq_quantity??variant.moq_quantity??0),active:existing?.active!==false,note:existing?.note??'',agent_rates:rates}); setTermModal(true) }
  async function saveTerm(){ setSaving(true);setError('');setNotice('');try{await post('save_client_variant_term',{...termForm,unit_price:Number(termForm.unit_price||0),moq_quantity:Number(termForm.moq_quantity||0),agent_rates:Object.entries(termForm.agent_rates).map(([person_id,settlement_rate_per_kg])=>({person_id,settlement_rate_per_kg:Number(settlement_rate_per_kg||0)}))});setTermModal(false);setNotice('거래처별 규격 단가와 영업 정산단가를 저장했습니다.');await load()}catch(e){setError(e instanceof Error?e.message:'거래처 단가 저장에 실패했습니다.')}finally{setSaving(false)}}

  if(loading) return <main className="min-h-screen bg-[#071426] px-5 py-8 text-slate-100"><div className="mx-auto max-w-[1600px] rounded-3xl border border-slate-700 bg-[#0b1b30] p-16 text-center text-slate-400">판매규격·단가 데이터를 불러오는 중입니다.</div></main>

  return <main className="min-h-screen bg-[#071426] px-4 py-6 text-slate-100 md:px-8"><div className="mx-auto max-w-[1600px] space-y-5">
    <header className="rounded-3xl border border-slate-700 bg-[#0b1b30] p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-black text-emerald-300">MONI SALES PRICING V4</p><h1 className="mt-1 text-3xl font-black">판매규격·단가</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">생산 제품은 하나로 유지하고, 판매할 때 필요한 1kg·5kg·EA·BOX 같은 여러 규격과 거래처별 가격을 별도로 관리합니다.</p></div><button type="button" onClick={()=>void load()} className={secondaryButton}>새로고침</button></div></header>
    {error&&<div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}{notice&&<div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Summary label="판매 대상 제품" value={`${products.length}개`} /><Summary label="판매규격" value={`${variants.length}개`} note="제품 하나에 여러 규격 가능" tone="success"/><Summary label="다중규격 제품" value={`${multiVariantCount}개`} /><Summary label="기본단가 미설정" value={`${missingPrice}개`} tone={missingPrice?'warning':'success'} /></div>

    <section className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-900/55"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 p-5"><div><h2 className="text-xl font-black">제품별 판매규격</h2><p className="mt-1 text-sm text-slate-400">기존 1제품 1규격 설정은 `기본 규격`으로 보존했습니다. 필요한 제품에 규격을 추가하면 됩니다.</p></div><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="제품·규격 검색" className="w-full max-w-[300px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></div>
      <div className="divide-y divide-slate-800">{visibleProducts.map((product)=>{const rows=variants.filter((variant)=>variant.product_id===product.id);return <div key={product.id} className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="text-lg font-black">{product.product_name}</h3>{product.product_code&&<span className="text-xs text-slate-500">{product.product_code}</span>}</div><div className="mt-1 text-xs text-slate-500">{product.product_spec||'제품 규격 정보 없음'} · 판매규격 {rows.length}개</div></div><button type="button" onClick={()=>openVariant(product.id)} className={primaryButton}>+ 규격 추가</button></div><div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{rows.map((row)=><button key={row.id} type="button" onClick={()=>openVariant(product.id,row)} className={`rounded-2xl border p-4 text-left transition hover:border-slate-500 ${row.active?'border-slate-700 bg-slate-950/35':'border-slate-800 bg-slate-950/20 opacity-50'}`}><div className="flex items-start justify-between gap-3"><div><div className="font-black text-white">{row.variant_name} {row.is_default&&<span className="ml-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">기본</span>}</div><div className="mt-1 text-xs text-slate-500">{variantSpec(row)}</div></div><span className={row.active?'text-xs text-emerald-300':'text-xs text-slate-500'}>{row.active?'사용':'중지'}</span></div><div className="mt-4 grid grid-cols-2 gap-2 text-sm"><div><span className="text-slate-500">기본단가</span><div className="font-black text-emerald-200">{money(row.default_unit_price)} / {unitLabel(row.sales_unit)}</div></div><div><span className="text-slate-500">MOQ</span><div className="font-bold">{qty(row.moq_quantity)} {unitLabel(row.sales_unit)}</div></div></div></button>)}{!rows.length&&<div className="rounded-2xl border border-dashed border-slate-700 p-5 text-sm text-slate-500">판매규격이 없습니다.</div>}</div></div>})}</div>
    </section>

    <section className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-900/55"><div className="border-b border-slate-700 p-5"><h2 className="text-xl font-black">거래처별 판매단가</h2><p className="mt-1 text-sm text-slate-400">기본단가와 다른 납품단가가 있는 경우에만 거래처별로 덮어씁니다. 영업 프리랜서 원/kg 정산단가도 같은 화면에서 설정합니다.</p><div className="mt-4 max-w-[460px]"><Field label="거래처"><select value={selectedClientId} onChange={(e)=>setSelectedClientId(e.target.value)} className={inputClass}><option value="">거래처 선택</option>{clients.filter((row)=>row.status==='active').map((row)=><option key={row.id} value={row.id}>{row.company_name}</option>)}</select></Field></div></div>
      {!clients.length?<div className="p-12 text-center text-slate-500">등록된 거래처가 없습니다. 먼저 `거래처 관리`에서 거래처를 등록하면 거래처별 단가를 설정할 수 있습니다.</div>:!selectedClientId?<div className="p-12 text-center text-slate-500">거래처를 선택해 주세요.</div>:<div className="overflow-x-auto"><table className="min-w-[1100px] w-full text-sm"><thead className="bg-slate-800 text-slate-400"><tr>{['제품','판매규격','기본단가','거래처단가','MOQ','영업 정산단가','상태','관리'].map((label)=><th key={label} className="px-4 py-3 text-left">{label}</th>)}</tr></thead><tbody>{variants.filter((row)=>row.active).map((variant)=>{const product=productById.get(variant.product_id);const term=termByKey.get(`${selectedClientId}:${variant.id}`);return <tr key={variant.id} className="border-t border-slate-800"><td className="px-4 py-3 font-bold">{product?.product_name||'제품'}</td><td className="px-4 py-3"><b>{variant.variant_name}</b><div className="text-xs text-slate-500">{variantSpec(variant)}</div></td><td className="px-4 py-3">{money(variant.default_unit_price)} / {unitLabel(variant.sales_unit)}</td><td className="px-4 py-3 font-black text-emerald-300">{term?`${money(term.unit_price)} / ${unitLabel(variant.sales_unit)}`:'기본단가 사용'}</td><td className="px-4 py-3">{qty(term?.moq_quantity??variant.moq_quantity)} {unitLabel(variant.sales_unit)}</td><td className="px-4 py-3">{term?.agent_rates.length?term.agent_rates.map((rate)=><div key={rate.person_id}>{personById.get(rate.person_id)?.name||'담당자'} · <b>{money(rate.settlement_rate_per_kg)}/kg</b></div>):<span className="text-slate-500">없음</span>}</td><td className="px-4 py-3">{term?(term.active?<span className="text-emerald-300">사용</span>:<span className="text-slate-500">중지</span>):<span className="text-blue-300">기본</span>}</td><td className="px-4 py-3"><button type="button" onClick={()=>openTerm(variant)} className={secondaryButton}>{term?'수정':'거래처 가격 설정'}</button></td></tr>})}</tbody></table></div>}
      {selectedClient&&<div className="border-t border-slate-800 px-5 py-3 text-xs text-slate-500">{selectedClient.company_name} 연결 영업 프리랜서 {selectedClient.assigned_person_ids.length}명 · 연결된 사람만 정산단가를 지정할 수 있습니다.</div>}
    </section>
  </div>

  {variantModal&&<Modal title={variantId?'판매규격 수정':'판매규격 추가'} onClose={()=>setVariantModal(false)}><div className="grid gap-4 md:grid-cols-2"><Field label="제품"><select value={variantForm.product_id} disabled={Boolean(variantId)} onChange={(e)=>setVariantForm((current)=>({...current,product_id:e.target.value}))} className={inputClass}><option value="">제품 선택</option>{products.map((row)=><option key={row.id} value={row.id}>{row.product_name}</option>)}</select></Field><Field label="판매규격명"><input value={variantForm.variant_name} onChange={(e)=>setVariantForm((current)=>({...current,variant_name:e.target.value}))} placeholder="예: 1kg 파우치 / 5kg 벌크 / 10EA BOX" className={inputClass}/></Field><Field label="판매단위"><select value={variantForm.sales_unit} onChange={(e)=>setVariantForm((current)=>({...current,sales_unit:e.target.value as SalesUnit}))} className={inputClass}><option value="kg">kg</option><option value="ea">EA</option><option value="box">BOX</option></select></Field>{variantForm.sales_unit!=='kg'&&<Field label="개별 중량(g)"><input type="number" min="0" value={variantForm.unit_weight_g} onChange={(e)=>setVariantForm((current)=>({...current,unit_weight_g:e.target.value}))} className={inputClass}/></Field>}{variantForm.sales_unit==='box'&&<Field label="BOX 입수량(EA)"><input type="number" min="0" value={variantForm.box_units} onChange={(e)=>setVariantForm((current)=>({...current,box_units:e.target.value}))} className={inputClass}/></Field>}<Field label={`기본 판매단가(원/${unitLabel(variantForm.sales_unit)})`}><input type="number" min="0" value={variantForm.default_unit_price} onChange={(e)=>setVariantForm((current)=>({...current,default_unit_price:e.target.value}))} className={inputClass}/></Field><Field label={`MOQ(${unitLabel(variantForm.sales_unit)})`}><input type="number" min="0" value={variantForm.moq_quantity} onChange={(e)=>setVariantForm((current)=>({...current,moq_quantity:e.target.value}))} className={inputClass}/></Field><Field label="비고"><input value={variantForm.note} onChange={(e)=>setVariantForm((current)=>({...current,note:e.target.value}))} className={inputClass}/></Field></div><div className="mt-5 flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={variantForm.is_default} onChange={(e)=>setVariantForm((current)=>({...current,is_default:e.target.checked}))}/> 제품 기본규격</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={variantForm.active} onChange={(e)=>setVariantForm((current)=>({...current,active:e.target.checked}))}/> 판매 사용</label></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={()=>setVariantModal(false)} className={secondaryButton}>취소</button><button type="button" disabled={saving} onClick={()=>void saveVariant()} className={primaryButton}>저장</button></div></Modal>}

  {termModal&&<Modal title="거래처별 판매조건" onClose={()=>setTermModal(false)} maxWidth="max-w-4xl">{(()=>{const variant=variants.find((row)=>row.id===termForm.variant_id);const product=variant?productById.get(variant.product_id):undefined;const assigned=selectedClient?.assigned_person_ids??[];return <><div className="rounded-2xl border border-slate-700 bg-slate-950/40 p-4"><b>{product?.product_name} · {variant?.variant_name}</b><div className="mt-1 text-sm text-slate-500">기본 {money(variant?.default_unit_price)} / {variant?unitLabel(variant.sales_unit):''}</div></div><div className="mt-5 grid gap-4 md:grid-cols-2"><Field label="거래처 판매단가"><input type="number" min="0" value={termForm.unit_price} onChange={(e)=>setTermForm((current)=>({...current,unit_price:e.target.value}))} className={inputClass}/></Field><Field label="거래처 MOQ"><input type="number" min="0" value={termForm.moq_quantity} onChange={(e)=>setTermForm((current)=>({...current,moq_quantity:e.target.value}))} className={inputClass}/></Field><Field label="비고"><input value={termForm.note} onChange={(e)=>setTermForm((current)=>({...current,note:e.target.value}))} className={inputClass}/></Field><label className="mt-7 flex items-center gap-2 text-sm"><input type="checkbox" checked={termForm.active} onChange={(e)=>setTermForm((current)=>({...current,active:e.target.checked}))}/> 이 거래처에 판매 사용</label></div><div className="mt-6 border-t border-slate-700 pt-5"><h3 className="font-black">영업 프리랜서 정산단가</h3><p className="mt-1 text-xs text-slate-500">거래처 관리에서 연결된 영업 프리랜서만 표시합니다. 단위는 원/kg입니다.</p><div className="mt-3 grid gap-3 md:grid-cols-2">{assigned.map((id)=><Field key={id} label={`${personById.get(id)?.name||'담당자'} (원/kg)`}><input type="number" min="0" value={termForm.agent_rates[id]??''} onChange={(e)=>setTermForm((current)=>({...current,agent_rates:{...current.agent_rates,[id]:e.target.value}}))} className={inputClass}/></Field>)}{!assigned.length&&<div className="text-sm text-amber-300">연결된 영업 프리랜서가 없습니다.</div>}</div></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={()=>setTermModal(false)} className={secondaryButton}>취소</button><button type="button" disabled={saving} onClick={()=>void saveTerm()} className={primaryButton}>저장</button></div></>})()}</Modal>}
  </main>
}
