'use client'

import { useEffect } from 'react'

type Charge = { product_name:string; quantity:number; unit:string; unit_price:number; supply_amount?:number }
type OrderLite = { id:string; status:string; accessory_charges?:Charge[] }

const text=(value:unknown)=>String(value??'').replace(/\s+/g,' ').trim()
const normalize=(value:unknown)=>text(value).normalize('NFKC').toLowerCase().replace(/\s+/g,'')
const money=(value:number)=>`${Math.round(Number(value||0)).toLocaleString('ko-KR')}원`
const feeKeywords=['택배비','배송비','운임','포장비','팔레트비','퀵비','화물비','배송료','택배료']

function productModal(){
  const title=Array.from(document.querySelectorAll<HTMLElement>('h2')).find(node=>['제품 판매등록','제품 판매 수정'].includes(text(node.textContent)))
  return title?.closest<HTMLElement>('div.fixed')||null
}
function isFeeWord(value:string){const n=normalize(value);return feeKeywords.some(keyword=>n.includes(normalize(keyword)))}
function parseMoney(value:unknown){const parsed=Number(String(value??'').replace(/[^0-9.-]/g,''));return Number.isFinite(parsed)?parsed:0}
function visibleOrders(payload:any):OrderLite[]{return Array.isArray(payload?.orders)?payload.orders.filter((row:any)=>text(row?.status)!=='cancelled'):[]}

export default function SalesAccessoryChargeEnhancer(){
  useEffect(()=>{
    let stopped=false
    let observerFrame=0
    let latestOrders:OrderLite[]=[]
    let chargesByOrder:Record<string,Charge[]>={}
    let editingOrderId=''
    const originalFetch=window.fetch.bind(window)

    const collectCharges=()=>{
      const modal=productModal();if(!modal)return []
      return Array.from(modal.querySelectorAll<HTMLElement>('[data-moni-accessory-row]')).map(row=>({
        product_name:(row.querySelector<HTMLInputElement>('[data-charge-name]')?.value||'').trim(),
        quantity:Number(row.querySelector<HTMLInputElement>('[data-charge-quantity]')?.value||0),
        unit:(row.querySelector<HTMLInputElement>('[data-charge-unit]')?.value||'건').trim()||'건',
        unit_price:Number(row.querySelector<HTMLInputElement>('[data-charge-price]')?.value||0),
      })).filter(row=>row.product_name)
    }

    const wrappedFetch:typeof window.fetch=async(input,init)=>{
      let nextInit=init
      const url=typeof input==='string'?input:input instanceof URL?input.toString():input.url
      const method=String(init?.method||'GET').toUpperCase()
      if(url.includes('/api/moni/sales-orders-v4')&&method==='POST'&&typeof init?.body==='string'){
        try{
          const body=JSON.parse(init.body)
          if(body?.action==='save_order'){
            body.data={...(body.data||{}),extra_items:collectCharges()}
            nextInit={...init,body:JSON.stringify(body)}
          }
        }catch{}
      }
      const response=await originalFetch(input,nextInit)
      if(url.includes('/api/moni/sales-orders-v4')&&method==='GET'){
        void response.clone().json().then((payload:any)=>{
          latestOrders=visibleOrders(payload)
          chargesByOrder=payload?.accessory_charges_by_order||Object.fromEntries(latestOrders.filter(row=>row.accessory_charges?.length).map(row=>[row.id,row.accessory_charges||[]]))
          window.setTimeout(()=>{annotateRows();enhanceModal()},0)
        }).catch(()=>{})
      }
      return response
    }
    window.fetch=wrappedFetch

    function findSalesTable(){
      return Array.from(document.querySelectorAll<HTMLTableElement>('main table')).find(table=>{
        const labels=Array.from(table.querySelectorAll('thead th')).map(th=>text(th.textContent))
        return labels.includes('판매일')&&labels.includes('거래처')&&labels.includes('관리')
      })||null
    }
    function annotateRows(){
      const table=findSalesTable();if(!table)return
      const rows=Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr')).filter(row=>row.querySelectorAll('td').length>1&&row.style.display!=='none')
      rows.forEach((row,index)=>{const order=latestOrders[index];if(order)row.dataset.moniOrderId=order.id})
    }
    function productTable(modal:HTMLElement){
      return Array.from(modal.querySelectorAll<HTMLTableElement>('table')).find(table=>Array.from(table.querySelectorAll('th')).some(th=>text(th.textContent)==='제품 · 판매규격'))||null
    }
    function feeContainer(modal:HTMLElement){return modal.querySelector<HTMLElement>('[data-moni-accessory-container]')}
    function updateFeeSummary(modal:HTMLElement){
      const box=feeContainer(modal);if(!box)return
      const rows=Array.from(box.querySelectorAll<HTMLElement>('[data-moni-accessory-row]'))
      const feeSupply=rows.reduce((sum,row)=>sum+Number(row.querySelector<HTMLInputElement>('[data-charge-quantity]')?.value||0)*Number(row.querySelector<HTMLInputElement>('[data-charge-price]')?.value||0),0)
      const table=productTable(modal)
      const productSupply=table?Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr')).reduce((sum,row)=>{
        const cells=row.querySelectorAll<HTMLTableCellElement>('td');return cells.length>6?sum+parseMoney(cells[6].textContent):sum
      },0):0
      const vatLabel=Array.from(modal.querySelectorAll<HTMLElement>('span')).find(node=>text(node.textContent)==='부가세율(%)')
      const vatRate=Number(vatLabel?.parentElement?.querySelector<HTMLInputElement>('input')?.value||0)
      const finalSupply=productSupply+feeSupply
      const finalVat=finalSupply*Math.max(0,vatRate)/100
      const summary=box.querySelector<HTMLElement>('[data-moni-accessory-summary]')
      const nextSummary=`기타비용 ${money(feeSupply)} · 예상 최종 공급가액 ${money(finalSupply)} · 예상 합계 ${money(finalSupply+finalVat)}`
      if(summary&&summary.textContent!==nextSummary)summary.textContent=nextSummary
    }
    function addChargeRow(modal:HTMLElement,seed?:Partial<Charge>){
      const box=feeContainer(modal);const tbody=box?.querySelector<HTMLTableSectionElement>('tbody');if(!box||!tbody)return
      const tr=document.createElement('tr');tr.dataset.moniAccessoryRow='true';tr.className='border-t border-slate-200'
      const mkInput=(attr:string,value:string,placeholder:string,type='text')=>{const input=document.createElement('input');input.type=type;input.value=value;input.placeholder=placeholder;input.setAttribute(attr,'true');input.className='w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500';input.addEventListener('input',()=>updateFeeSummary(modal));return input}
      const name=mkInput('data-charge-name',String(seed?.product_name||'택배비'),'예: 택배비')
      const quantity=mkInput('data-charge-quantity',String(seed?.quantity??1),'1','number');quantity.min='0';quantity.step='0.001'
      const unit=mkInput('data-charge-unit',String(seed?.unit||'건'),'건')
      const price=mkInput('data-charge-price',String(seed?.unit_price??''),'금액','number');price.min='0'
      const amount=document.createElement('div');amount.className='font-black text-emerald-700';const refreshAmount=()=>{amount.textContent=money(Number(quantity.value||0)*Number(price.value||0));updateFeeSummary(modal)};quantity.addEventListener('input',refreshAmount);price.addEventListener('input',refreshAmount);refreshAmount()
      const remove=document.createElement('button');remove.type='button';remove.textContent='삭제';remove.className='text-sm font-bold text-red-500 underline';remove.onclick=()=>{tr.remove();updateFeeSummary(modal)}
      const cells=[name,quantity,unit,price,amount,remove].map(content=>{const td=document.createElement('td');td.className='px-3 py-3';td.append(content);return td});tr.append(...cells);tbody.appendChild(tr);updateFeeSummary(modal)
    }
    function enhanceModal(){
      const modal=productModal();if(!modal||modal.dataset.moniAccessoryEnhanced==='true')return
      const table=productTable(modal);if(!table)return
      const block=table.closest<HTMLElement>('.mt-6')||table.parentElement?.parentElement;if(!block)return
      const addProduct=Array.from(block.querySelectorAll<HTMLButtonElement>('button')).find(button=>text(button.textContent)==='+ 품목 추가')
      if(!addProduct)return
      modal.dataset.moniAccessoryEnhanced='true'
      const addFee=document.createElement('button');addFee.type='button';addFee.textContent='+ 기타비용 추가';addFee.className=addProduct.className;addFee.dataset.moniAccessoryAdd='true';addFee.onclick=()=>addChargeRow(modal)
      addProduct.insertAdjacentElement('afterend',addFee)

      const box=document.createElement('div');box.dataset.moniAccessoryContainer='true';box.className='mt-4 overflow-hidden rounded-2xl border border-slate-300 bg-white'
      box.innerHTML=`<div class="flex items-center justify-between bg-slate-100 px-4 py-3"><div><b class="text-slate-800">기타비용</b><div class="mt-1 text-xs text-slate-500">택배비·운임·포장비 등. 재고·kg·MOQ에는 반영하지 않고 이 거래명세표의 금액·VAT·미수금에만 합산됩니다.</div></div></div><div class="overflow-x-auto"><table class="min-w-[760px] w-full text-sm text-slate-700"><thead class="bg-slate-50 text-slate-500"><tr><th class="px-3 py-3 text-left">항목명</th><th class="px-3 py-3 text-left">수량</th><th class="px-3 py-3 text-left">단위</th><th class="px-3 py-3 text-left">단가</th><th class="px-3 py-3 text-left">공급가액</th><th class="px-3 py-3"></th></tr></thead><tbody></tbody></table></div><div data-moni-accessory-summary class="border-t border-slate-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800">기타비용 0원</div>`
      block.insertAdjacentElement('afterend',box)
      const existing=editingOrderId?chargesByOrder[editingOrderId]||[]:[]
      existing.forEach(charge=>addChargeRow(modal,charge))
      updateFeeSummary(modal)
    }
    function suggestFeeConversion(input:HTMLInputElement){
      if(!isFeeWord(input.value))return
      window.setTimeout(()=>{
        const wrap=input.closest<HTMLElement>('[data-moni-variant-search-wrap]');const results=wrap?.querySelector<HTMLElement>('[data-moni-variant-results]');if(!results||results.querySelector('[data-moni-convert-fee]'))return
        const button=document.createElement('button');button.type='button';button.dataset.moniConvertFee='true';button.textContent=`“${input.value.trim()}”를 기타비용으로 추가`;button.style.cssText='display:block;width:100%;margin-top:6px;border:1px solid #86b7a8;border-radius:8px;background:#ecfdf5;padding:10px;color:#176b55;font-size:13px;font-weight:800;text-align:left;cursor:pointer';button.onmousedown=e=>e.preventDefault();button.onclick=()=>{
          const modal=productModal();if(!modal)return;enhanceModal();addChargeRow(modal,{product_name:input.value.trim()||'택배비',quantity:1,unit:'건',unit_price:0});const row=input.closest('tr');const deleteButton=row?Array.from(row.querySelectorAll<HTMLButtonElement>('button')).find(b=>text(b.textContent)==='삭제'):null;deleteButton?.click()
        };results.appendChild(button);results.style.display='block'
      },0)
    }
    const clickCapture=(event:MouseEvent)=>{
      const target=event.target instanceof Element?event.target.closest<HTMLButtonElement>('button'):null;if(!target)return
      const label=text(target.textContent)
      if(label==='+ 제품 판매등록'){editingOrderId='';window.setTimeout(enhanceModal,0);return}
      const row=target.closest<HTMLTableRowElement>('tr')
      if(label==='수정'&&row?.dataset.moniOrderId){editingOrderId=row.dataset.moniOrderId;window.setTimeout(enhanceModal,0);return}
      if(label==='출력'&&row?.dataset.moniOrderId&&(chargesByOrder[row.dataset.moniOrderId]?.length||0)>0){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();window.open(`/sales-management/orders/${encodeURIComponent(row.dataset.moniOrderId)}/statement?auto=1`,'_blank')}
    }
    const inputCapture=(event:Event)=>{const input=event.target instanceof HTMLInputElement?event.target:null;if(input?.matches('[data-moni-variant-search]'))suggestFeeConversion(input)}
    document.addEventListener('click',clickCapture,true)
    document.addEventListener('input',inputCapture,true)

    // Only react to structural DOM changes. The previous observer also watched
    // character-data and recalculated the summary from its own callback. Updating
    // summary text then generated another mutation, which could create a feedback
    // loop and freeze the Chrome renderer on the sales screen.
    const observer=new MutationObserver(()=>{
      if(stopped||observerFrame)return
      observerFrame=window.requestAnimationFrame(()=>{
        observerFrame=0
        if(stopped)return
        annotateRows()
        enhanceModal()
      })
    })
    observer.observe(document.body,{childList:true,subtree:true})
    annotateRows();enhanceModal()
    return()=>{
      stopped=true
      observer.disconnect()
      if(observerFrame)window.cancelAnimationFrame(observerFrame)
      document.removeEventListener('click',clickCapture,true)
      document.removeEventListener('input',inputCapture,true)
      if(window.fetch===wrappedFetch)window.fetch=originalFetch
    }
  },[])
  return null
}
