'use client'

import { useEffect } from 'react'

function exactText(element: Element | null) { return (element?.textContent || '').replace(/\s+/g,' ').trim() }
function normalizeSearch(value:string){return value.toLocaleLowerCase('ko-KR').replace(/\s+/g,' ').trim()}
function styleLightButton(button:HTMLButtonElement,tone:'neutral'|'blue'|'red'){
  Object.assign(button.style,{display:'inline-flex',alignItems:'center',justifyContent:'center',borderWidth:'1px',borderStyle:'solid',borderRadius:'10px',padding:'7px 12px',fontSize:'12px',fontWeight:'800',lineHeight:'1.2',textDecoration:'none',whiteSpace:'nowrap',opacity:button.disabled?'0.45':'1'})
  if(tone==='blue')Object.assign(button.style,{backgroundColor:'#eaf4ff',borderColor:'#8bbde8',color:'#135b8f'})
  else if(tone==='red')Object.assign(button.style,{backgroundColor:'#fff1f0',borderColor:'#efaaa5',color:'#b42318'})
  else Object.assign(button.style,{backgroundColor:'#fff',borderColor:'#b9cbd7',color:'#17384a'})
}
function ensureUnifiedStyles(){
  if(document.getElementById('moni-sales-unified-style'))return
  const style=document.createElement('style');style.id='moni-sales-unified-style';style.textContent=`@keyframes moni-unpaid-payment-pulse{0%,100%{background-color:#fff1f0;border-color:#e5484d;color:#b42318;box-shadow:0 0 0 0 rgba(229,72,77,.18);transform:scale(1)}50%{background-color:#ffd9d6;border-color:#c81e1e;color:#8a1111;box-shadow:0 0 0 5px rgba(229,72,77,.12);transform:scale(1.035)}}[data-moni-unpaid-payment='true']{display:inline-flex!important;align-items:center!important;justify-content:center!important;border:1px solid #e5484d!important;border-radius:10px!important;background:#fff1f0!important;color:#b42318!important;font-weight:900!important;animation:moni-unpaid-payment-pulse 1.05s ease-in-out infinite!important}[data-moni-variant-search-wrap]{position:relative;min-width:320px;max-width:100%}[data-moni-variant-search]{width:100%!important;min-width:0!important;box-sizing:border-box!important}[data-moni-variant-results]{position:absolute;z-index:1700;left:0;right:0;top:calc(100% + 5px);max-height:280px;overflow:auto;border:1px solid #b9cbd7;border-radius:12px;background:#fff;box-shadow:0 14px 35px rgba(15,35,50,.2);padding:5px;color:#17384a}[data-moni-variant-option]{display:block;width:100%;border:0;border-radius:8px;background:#fff;padding:9px 10px;text-align:left;font-size:13px;line-height:1.35;color:#17384a;cursor:pointer}[data-moni-variant-option]:hover,[data-moni-variant-option]:focus{background:#eaf4ff;outline:none}[data-moni-sales-field-invalid='true']{border-color:#dc2626!important;box-shadow:0 0 0 2px rgba(220,38,38,.12)!important}[data-moni-sales-form-error]{margin:0 0 16px;border:1px solid #efaaa5;border-radius:12px;background:#fff1f0;padding:11px 13px;color:#b42318;font-size:13px;font-weight:800;line-height:1.5}[data-moni-sales-field-note]{margin-top:5px;color:#b42318;font-size:11px;font-weight:800}@media(prefers-reduced-motion:reduce){[data-moni-unpaid-payment='true']{animation:none!important;box-shadow:0 0 0 3px rgba(229,72,77,.12)!important}}`;document.head.appendChild(style)
}
function stylePaymentStatus(button:HTMLButtonElement){if(exactText(button).startsWith('미입금'))button.dataset.moniUnpaidPayment='true';else{delete button.dataset.moniUnpaidPayment;button.style.animation=''}}
function productSaleModal(){const title=Array.from(document.querySelectorAll<HTMLElement>('h2')).find(n=>['제품 판매등록','제품 판매 수정'].includes(exactText(n)));return title?.closest<HTMLElement>('div.fixed')||null}
function modalBody(modal:HTMLElement){const header=modal.querySelector('h2')?.parentElement;return header?.nextElementSibling as HTMLElement|null}
function showModalError(modal:HTMLElement,message:string){const body=modalBody(modal);if(!body)return;let box=body.querySelector<HTMLElement>('[data-moni-sales-form-error]');if(!box){box=document.createElement('div');box.dataset.moniSalesFormError='true';body.prepend(box)}box.textContent=message;box.style.display='block'}
function clearModalError(modal:HTMLElement){const box=modal.querySelector<HTMLElement>('[data-moni-sales-form-error]');if(box){box.textContent='';box.style.display='none'}}
function clearInvalid(input:HTMLInputElement|HTMLSelectElement|null){if(!input)return;delete input.dataset.moniSalesFieldInvalid;const note=input.parentElement?.querySelector<HTMLElement>('[data-moni-sales-field-note]');if(note)note.remove()}
function markInvalid(input:HTMLInputElement|HTMLSelectElement|null,message:string){if(!input)return;input.dataset.moniSalesFieldInvalid='true';let note=input.parentElement?.querySelector<HTMLElement>('[data-moni-sales-field-note]');if(!note){note=document.createElement('div');note.dataset.moniSalesFieldNote='true';input.insertAdjacentElement('afterend',note)}note.textContent=message}
function setNativeSelectValue(select:HTMLSelectElement,value:string){const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')?.set;if(setter)setter.call(select,value);else select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}))}
function enhanceVariantSelect(select:HTMLSelectElement){
  if(!Array.from(select.options).some(option=>exactText(option)==='판매규격 선택'))return
  const existing=select.parentElement?.querySelector<HTMLElement>('[data-moni-variant-search-wrap]')
  if(existing){select.style.display='none';return}
  const wrap=document.createElement('div');wrap.dataset.moniVariantSearchWrap='true'
  const input=document.createElement('input');input.type='text';input.autocomplete='off';input.placeholder='제품명·규격 검색 (예: 애플)';input.dataset.moniVariantSearch='true';input.className=select.className
  const results=document.createElement('div');results.dataset.moniVariantResults='true';results.style.display='none';wrap.append(input,results);select.insertAdjacentElement('beforebegin',wrap);select.style.display='none'
  const options=()=>Array.from(select.options).filter(option=>Boolean(option.value))
  const selectedLabel=()=>options().find(option=>option.value===select.value)?.textContent?.trim()||''
  const matching=()=>{const query=normalizeSearch(input.value);const tokens=query.split(' ').filter(Boolean);return options().filter(option=>{const haystack=normalizeSearch(option.textContent||'');return !tokens.length||tokens.every(token=>haystack.includes(token))}).slice(0,20)}
  const close=()=>{results.style.display='none'}
  const choose=(option:HTMLOptionElement)=>{input.value=(option.textContent||'').trim();setNativeSelectValue(select,option.value);clearInvalid(select);close()}
  const render=()=>{const found=matching();results.replaceChildren();if(!found.length){const empty=document.createElement('div');empty.style.padding='10px';empty.style.fontSize='12px';empty.style.color='#6b7f8c';empty.textContent='검색 결과가 없습니다.';results.appendChild(empty)}else for(const option of found){const button=document.createElement('button');button.type='button';button.dataset.moniVariantOption='true';button.textContent=(option.textContent||'').trim();button.addEventListener('mousedown',event=>{event.preventDefault();choose(option)});results.appendChild(button)}results.style.display='block'}
  input.value=selectedLabel();input.addEventListener('focus',()=>{if(input.value===selectedLabel())input.select();render()});input.addEventListener('input',render);input.addEventListener('keydown',event=>{if(event.key==='Enter'){const first=matching()[0];if(first){event.preventDefault();choose(first)}}else if(event.key==='Escape')close()});input.addEventListener('blur',()=>window.setTimeout(close,120));select.addEventListener('change',()=>{input.value=selectedLabel()})
}
function validateProductModal(modal:HTMLElement){
  const table=Array.from(modal.querySelectorAll<HTMLTableElement>('table')).find(t=>Array.from(t.querySelectorAll('th')).some(th=>exactText(th)==='제품 · 판매규격'))
  const clientLabel=Array.from(modal.querySelectorAll<HTMLElement>('span')).find(node=>exactText(node)==='거래처');const clientSelect=clientLabel?.parentElement?.querySelector<HTMLSelectElement>('select')||null
  clearInvalid(clientSelect);if(!clientSelect?.value){markInvalid(clientSelect,'거래처를 선택해 주세요.');return{ok:false,message:'거래처를 선택해 주세요.',first:clientSelect as HTMLElement|null}}
  const rows=table?Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr')).filter(row=>row.querySelectorAll('td').length>1):[]
  if(!rows.length)return{ok:false,message:'판매 품목을 한 개 이상 추가해 주세요.',first:null as HTMLElement|null}
  for(let index=0;index<rows.length;index+=1){const cells=Array.from(rows[index].querySelectorAll<HTMLTableCellElement>('td'));const variant=cells[0]?.querySelector<HTMLSelectElement>('select')||null;const quantity=cells[1]?.querySelector<HTMLInputElement>('input[type="number"]')||null;const price=cells[3]?.querySelector<HTMLInputElement>('input[type="number"]')||null;clearInvalid(variant);clearInvalid(quantity);clearInvalid(price)
    if(!variant?.value){markInvalid(variant,'제품·판매규격을 검색해 선택해 주세요.');return{ok:false,message:`${index+1}번째 품목의 제품·판매규격을 검색해 선택해 주세요.`,first:(variant?.parentElement?.querySelector<HTMLInputElement>('[data-moni-variant-search]')||variant) as HTMLElement|null}}
    const q=Number(quantity?.value||0);if(!Number.isFinite(q)||q<=0){markInvalid(quantity,'수량은 0보다 커야 합니다.');return{ok:false,message:`${index+1}번째 품목의 수량을 확인해 주세요. 수량은 0보다 커야 합니다.`,first:quantity as HTMLElement|null}}
    const p=Number(price?.value||0);if(!Number.isFinite(p)||p<=0){markInvalid(price,'단가는 0보다 커야 합니다.');return{ok:false,message:`${index+1}번째 품목의 적용단가를 확인해 주세요. 단가는 0보다 커야 합니다.`,first:price as HTMLElement|null}}
    const moqText=exactText(cells[4]||null).replaceAll(',','');const moqMatch=moqText.match(/^-?\d+(?:\.\d+)?/);const moq=moqMatch?Number(moqMatch[0]):0;if(Number.isFinite(moq)&&moq>0&&q<moq){markInvalid(quantity,`최소주문수량 ${moqText}`);return{ok:false,message:`${index+1}번째 품목의 수량이 최소주문수량(${moqText})보다 작습니다.`,first:quantity as HTMLElement|null}}
  }
  return{ok:true,message:'',first:null as HTMLElement|null}
}
function mirrorServerError(main:HTMLElement,modal:HTMLElement){const globalError=Array.from(main.querySelectorAll<HTMLElement>('div')).find(node=>!modal.contains(node)&&node.className.includes('border-red-500')&&exactText(node));if(globalError)showModalError(modal,exactText(globalError))}

export default function SalesStatementsUnifiedEnhancer(){
  useEffect(()=>{
    let stopped=false
    ensureUnifiedStyles()

    const apply=()=>{
      if(stopped)return
      const root=document.querySelector<HTMLElement>('[data-business-management-shell]');if(!root)return
      const main=root.querySelector<HTMLElement>('main');if(!main)return
      const pageTitle=Array.from(main.querySelectorAll<HTMLElement>('h1')).find(n=>exactText(n)==='판매 등록');if(pageTitle)pageTitle.textContent='거래명세표'
      const headerDescription=Array.from(main.querySelectorAll<HTMLElement>('header p')).find(n=>exactText(n).startsWith('제품별 판매규격과 거래처 단가를 선택해 판매합니다.'));if(headerDescription)headerDescription.textContent='판매를 등록하고 생성된 거래명세표를 한 화면에서 조회·출력·관리합니다.'
      const sectionTitle=Array.from(main.querySelectorAll<HTMLElement>('section h2')).find(n=>exactText(n)==='판매 내역');if(sectionTitle)sectionTitle.textContent='명세표 출력 목록'
      const sectionDescription=sectionTitle?.parentElement?.querySelector<HTMLElement>('p');if(sectionDescription&&exactText(sectionDescription).startsWith('실제 입금이 한 번이라도 등록되면'))sectionDescription.textContent='판매등록 시 거래명세표가 바로 생성됩니다. 일반 판매건은 여기서 수정·삭제하고, 수출 판매건은 원본 수출서류에서 수정합니다.'
      const table=main.querySelector<HTMLTableElement>('section table')
      if(table){
        const headers=Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'));const statusIndex=headers.findIndex(c=>exactText(c)==='상태');const paymentIndex=headers.findIndex(c=>exactText(c)==='수금상태');if(statusIndex>=0)headers[statusIndex].style.display='none'
        const rows=Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'));let visibleDataRows=0
        for(const row of rows){const cells=Array.from(row.querySelectorAll<HTMLTableCellElement>('td'));if(!cells.length||cells.length===1)continue;if(statusIndex>=0&&cells[statusIndex]){const status=exactText(cells[statusIndex]);if(status.startsWith('취소')){row.style.display='none';continue}cells[statusIndex].style.display='none'}row.style.display='';visibleDataRows+=1;if(paymentIndex>=0&&cells[paymentIndex]){const paymentButton=cells[paymentIndex].querySelector<HTMLButtonElement>('button');if(paymentButton)stylePaymentStatus(paymentButton)}const managementCell=cells[cells.length-1];for(const button of Array.from(managementCell.querySelectorAll<HTMLButtonElement>('button'))){const label=exactText(button);if(label==='취소')button.textContent='삭제';if(label==='출력')styleLightButton(button,'neutral');if(label==='수출서류 수정')styleLightButton(button,'blue')}}
        let emptyRow=table.querySelector<HTMLTableRowElement>('tr[data-unified-empty-row]');if(visibleDataRows===0&&rows.some(r=>r.querySelectorAll('td').length>1)){if(!emptyRow){emptyRow=document.createElement('tr');emptyRow.dataset.unifiedEmptyRow='true';const cell=document.createElement('td');cell.colSpan=Math.max(1,headers.length-(statusIndex>=0?1:0));cell.className='px-5 py-14 text-center text-slate-500';cell.textContent='조회 월에 등록된 판매가 없습니다.';emptyRow.appendChild(cell);table.querySelector('tbody')?.appendChild(emptyRow)}emptyRow.style.display=''}else if(emptyRow)emptyRow.style.display='none'
      }
      const saleModal=productSaleModal();if(saleModal){for(const select of Array.from(saleModal.querySelectorAll<HTMLSelectElement>('select')))enhanceVariantSelect(select);mirrorServerError(main,saleModal)}
      const otherTitle=Array.from(document.querySelectorAll<HTMLElement>('h2')).find(n=>['기타 상품 판매','기타 상품 판매 수정'].includes(exactText(n)));const otherModal=otherTitle?.closest<HTMLElement>('div.fixed');if(otherModal)for(const b of Array.from(otherModal.querySelectorAll<HTMLButtonElement>('button')))if(exactText(b)==='삭제')styleLightButton(b,'red')
      const deleteTitle=Array.from(document.querySelectorAll<HTMLElement>('h2')).find(n=>exactText(n)==='판매 취소');if(deleteTitle){deleteTitle.textContent='거래명세표 삭제';const modal=deleteTitle.closest<HTMLElement>('div.fixed');if(modal){const p=Array.from(modal.querySelectorAll<HTMLElement>('p')).find(n=>exactText(n).startsWith('취소 전 판매내용은'));if(p)p.textContent='목록에서는 삭제되며 판매 취소 이력은 보존됩니다. 실제 입금이 있는 건은 삭제할 수 없습니다.';const reason=Array.from(modal.querySelectorAll<HTMLElement>('span')).find(n=>exactText(n)==='취소 사유');if(reason)reason.textContent='삭제 사유';const confirm=Array.from(modal.querySelectorAll<HTMLButtonElement>('button')).find(b=>exactText(b)==='판매 취소 확정');if(confirm)confirm.textContent='삭제'}}
    }

    const clickCapture=(event:MouseEvent)=>{
      const target=event.target instanceof Element?event.target.closest<HTMLButtonElement>('button'):null
      if(!target)return
      const modal=productSaleModal()
      if(modal&&modal.contains(target)&&exactText(target)==='저장'){const validation=validateProductModal(modal);if(!validation.ok){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();showModalError(modal,validation.message);validation.first?.focus();validation.first?.scrollIntoView({block:'center',behavior:'smooth'});return}clearModalError(modal)}
      if(exactText(target)!=='출력')return
      const row=target.closest<HTMLTableRowElement>('tr');if(!row)return
      const cells=Array.from(row.querySelectorAll<HTMLTableCellElement>('td'));if(cells.length<2)return
      if(exactText(cells[0]).includes('수출'))return
      const table=row.closest('table');const main=row.closest('main');if(!table||!main)return
      const dataRows=Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr')).filter(r=>r.querySelectorAll('td').length>1&&r.style.display!=='none')
      const index=dataRows.indexOf(row);if(index<0)return
      const month=main.querySelector<HTMLInputElement>('input[type="month"]')?.value||''
      if(!month)return
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation()
      const popup=window.open('about:blank','_blank')
      void fetch(`/api/moni/sales-orders-v4?month=${encodeURIComponent(month)}&_=${Date.now()}`,{cache:'no-store'}).then(r=>r.json()).then(payload=>{
        const orders=Array.isArray(payload?.orders)?payload.orders.filter((o:any)=>String(o.status)!=='cancelled'):[]
        const selected=orders[index]
        if(!selected?.id)throw new Error('판매건을 찾지 못했습니다.')
        const url=`/sales-management/orders/${encodeURIComponent(String(selected.id))}/statement?auto=1`
        if(popup)popup.location.href=url;else window.location.href=url
      }).catch(()=>{if(popup)popup.close();window.alert('거래명세표 출력 대상을 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요.')})
    }
    const inputCapture=(event:Event)=>{const input=event.target instanceof HTMLInputElement?event.target:null;if(!input)return;const modal=productSaleModal();if(!modal||!modal.contains(input)||input.type!=='number')return;const cell=input.closest('td');if(!cell)return;const row=cell.closest('tr');if(!row)return;const cells=Array.from(row.querySelectorAll('td'));const index=cells.indexOf(cell);if(index!==1&&index!==3)return;const value=Number(input.value||0);if(Number.isFinite(value)&&value>0)clearInvalid(input);else markInvalid(input,index===1?'수량은 0보다 커야 합니다.':'단가는 0보다 커야 합니다.')}

    apply();const observer=new MutationObserver(apply);observer.observe(document.body,{childList:true,subtree:true});const timer=window.setInterval(apply,400);document.addEventListener('click',clickCapture,true);document.addEventListener('input',inputCapture,true)
    return()=>{stopped=true;observer.disconnect();window.clearInterval(timer);document.removeEventListener('click',clickCapture,true);document.removeEventListener('input',inputCapture,true)}
  },[])
  return <span data-sales-statements-unified-enhancer hidden />
}
