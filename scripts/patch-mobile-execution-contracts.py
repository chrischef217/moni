from pathlib import Path

route = Path('src/app/api/moni/mobile-extended-actions/route.ts')
text = route.read_text(encoding='utf-8')

replacements = [
    (
        "const [products, units, recipes, raw, packaging, clients, people, opportunities, orders, receipts, variants, terms, sanitation, adjustments] = await Promise.all([",
        "const [products, units, recipes, raw, packaging, clients, people, opportunities, activities, workLogs, orders, receipts, variants, terms, sanitation, adjustments] = await Promise.all([",
        'catalog declaration',
    ),
    (
        """    db.from('sales_opportunities').select('*').eq('business_id', BUSINESS_ID).order('created_at', { ascending: false }).limit(150),
    db.from('sales_orders').select('id,statement_number,sale_date,client_id,status,total_amount,due_date,payment_status').eq('business_id', BUSINESS_ID).order('sale_date', { ascending: false }).limit(150),
""",
        """    db.from('sales_opportunities').select('*').eq('business_id', BUSINESS_ID).order('created_at', { ascending: false }).limit(150),
    db.from('sales_activities').select('*').eq('business_id', BUSINESS_ID).order('activity_date', { ascending: false }).limit(150),
    db.from('freelancer_work_logs').select('*').eq('business_id', BUSINESS_ID).order('work_date', { ascending: false }).limit(150),
    db.from('sales_orders').select('id,statement_number,sale_date,client_id,status,total_amount,due_date,payment_status').eq('business_id', BUSINESS_ID).order('sale_date', { ascending: false }).limit(150),
""",
        'catalog queries',
    ),
    (
        "const all = [products, units, recipes, raw, packaging, clients, people, opportunities, orders, receipts, variants, terms, sanitation, adjustments]",
        "const all = [products, units, recipes, raw, packaging, clients, people, opportunities, activities, workLogs, orders, receipts, variants, terms, sanitation, adjustments]",
        'catalog all',
    ),
    (
        """    clients: clients.data ?? [], people: people.data ?? [], opportunities: opportunities.data ?? [], orders: orders.data ?? [], receipts: receipts.data ?? [],
    variants: variants.data ?? [], terms: terms.data ?? [], sanitation: sanitation.data ?? [], adjustments: adjustments.data ?? [],
""",
        """    clients: clients.data ?? [], people: people.data ?? [], opportunities: opportunities.data ?? [], activities: activities.data ?? [], workLogs: workLogs.data ?? [], orders: orders.data ?? [], receipts: receipts.data ?? [],
    variants: variants.data ?? [], terms: terms.data ?? [], sanitation: sanitation.data ?? [], adjustments: adjustments.data ?? [],
""",
        'catalog return',
    ),
    (
        """  if (intent.domain === 'business_activity') {
    return { ...base,title:'영업활동·상담기록',schema:[field('client_id','고객사','select',matchedClient?.id || '',{options:[option('','미지정'),...clientOptions]}),field('opportunity_id','영업기회','select','',{options:[option('','미지정'),...c.opportunities.map((row:any)=>option(row.id,row.title,row.stage))]}),field('activity_date','활동일','date',today(),{required:true}),field('activity_type','활동유형','text','상담'),field('summary','활동내용','textarea','',{required:true}),field('next_action','다음 행동','text',''),field('next_action_date','다음 행동일','date',''),field('assigned_person_id','담당 영업','select',matchedPerson?.id || '',{options:[option('','미지정'),...personOptions]})],candidates:[] }
  }

  return { ...base,title:'생산 프리랜서 작업시간',schema:[field('person_id','생산 프리랜서','select',matchedPerson?.id || '',{required:true,options:people.filter((row:any)=>row.person_type==='production_freelancer').map((row:any)=>option(row.id,row.name))}),field('work_date','작업일','date',today(),{required:true}),field('hours','작업시간','number','0',{required:true,step:'0.25'}),field('pay_amount_override','지급액 수동보정','number',''),field('source_type','출처','text','manual'),field('note','메모','textarea','')],candidates:[] }
""",
        """  if (intent.domain === 'business_activity') {
    return { ...base,title:'영업활동·상담기록',schema:[field('client_id','고객사','select',matchedClient?.id || '',{options:[option('','미지정'),...clientOptions]}),field('opportunity_id','영업기회','select','',{options:[option('','미지정'),...c.opportunities.map((row:any)=>option(row.id,row.title,row.stage))]}),field('activity_date','활동일','date',today(),{required:true}),field('activity_type','활동유형','text','상담'),field('summary','활동내용','textarea','',{required:true}),field('next_action','다음 행동','text',''),field('next_action_date','다음 행동일','date',''),field('assigned_person_id','담당 영업','select',matchedPerson?.id || '',{options:[option('','미지정'),...personOptions]})],candidates:c.activities.map((row:any)=>candidate(row.id,`${row.activity_date} · ${row.summary || row.activity_type || row.id}`,row)) }
  }

  if (intent.domain === 'business_work_log') {
    return { ...base,title:'생산 프리랜서 작업시간',schema:[field('person_id','생산 프리랜서','select',matchedPerson?.person_type==='production_freelancer' ? matchedPerson.id : '',{required:true,options:people.filter((row:any)=>row.person_type==='production_freelancer').map((row:any)=>option(row.id,row.name))}),field('work_date','작업일','date',today(),{required:true}),field('hours','작업시간','number','0',{required:true,step:'0.25'}),field('pay_amount_override','지급액 수동보정','number',''),field('source_type','출처','text','manual'),field('note','메모','textarea','')],candidates:c.workLogs.map((row:any)=>candidate(row.id,`${row.work_date} · ${people.find((person:any)=>person.id===row.person_id)?.name || row.person_id} · ${num(row.hours)}시간`,row)) }
  }

  throw new Error('지원하지 않는 모바일 PC 입력 도메인입니다.')
""",
        'activity/worklog draft',
    ),
    (
        "business_opportunity:'sales_opportunities', business_activity:'sales_activities', business_work_log:'production_freelancer_work_logs',",
        "business_opportunity:'sales_opportunities', business_activity:'sales_activities', business_work_log:'freelancer_work_logs',",
        'worklog before table',
    ),
    (
        """  if (domain==='business_person') {
    const entity='people'; const data={...fields,...(operation==='DEACTIVATE'?{status:'inactive'}:{})}
    if (operation==='CREATE') return pcApi(request,'/api/moni/business-management','POST',{entity,data})
    if (operation==='DELETE') return pcApi(request,`/api/moni/business-management?entity=${entity}&id=${encodeURIComponent(targetId)}`,'DELETE')
    return pcApi(request,'/api/moni/business-management','PATCH',{entity,id:targetId,data})
  }
""",
        """  if (domain==='business_person') {
    const entity='people'; const deactivate=operation==='DELETE'||operation==='DEACTIVATE'; const data={...fields,...(deactivate?{status:'inactive'}:{})}
    if (operation==='CREATE') return pcApi(request,'/api/moni/business-management','POST',{entity,data})
    return pcApi(request,'/api/moni/business-management','PATCH',{entity,id:targetId,data})
  }
""",
        'people execution',
    ),
    (
        """  if (domain==='business_activity') {
    const entity='activities'
    if (operation==='CREATE') return pcApi(request,'/api/moni/business-management','POST',{entity,data:fields})
    if (operation==='DELETE') return pcApi(request,`/api/moni/business-management?entity=${entity}&id=${encodeURIComponent(targetId)}`,'DELETE')
    return pcApi(request,'/api/moni/business-management','PATCH',{entity,id:targetId,data:fields})
  }
  return pcApi(request,'/api/moni/business-management','POST',{entity:'work_logs',data:fields})
}
""",
        """  if (domain==='business_activity') {
    const entity='activities'
    if (operation==='CREATE') return pcApi(request,'/api/moni/business-management','POST',{entity,data:fields})
    if (operation==='DELETE') return pcApi(request,`/api/moni/business-management?entity=${entity}&id=${encodeURIComponent(targetId)}`,'DELETE')
    return pcApi(request,'/api/moni/business-management','PATCH',{entity,id:targetId,data:fields})
  }
  if (domain==='business_work_log') {
    const entity='work_logs'
    if (operation==='CREATE') return pcApi(request,'/api/moni/business-management','POST',{entity,data:fields})
    if (operation==='DELETE') return pcApi(request,`/api/moni/business-management?entity=${entity}&id=${encodeURIComponent(targetId)}`,'DELETE')
    return pcApi(request,'/api/moni/business-management','PATCH',{entity,id:targetId,data:fields})
  }
  throw new Error('지원하지 않는 모바일 PC 입력 도메인입니다.')
}
""",
        'worklog execution',
    ),
]

for old, new, label in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label} pattern count={count}')
    text = text.replace(old, new)
route.write_text(text, encoding='utf-8')

intents = Path('src/lib/moni/mobile-extended-intents.ts')
text = intents.read_text(encoding='utf-8')
old = """  if (has(value, /(?:작업시간|근무시간|작업일지|근무일지)/) && has(value, /(?:프리랜서|생산|인력|근무|작업)/) && writeCue) {
    const op = mutation(value)
    return op ? { domain: 'business_work_log', operation: op } : null
  }
"""
new = """  if (has(value, /(?:작업시간|근무시간|작업일지|근무일지)/) && writeCue) {
    if (has(value, /(?:직원)/) || (has(value, /(?:영업)/) && has(value, /(?:프리랜서)/) && !has(value, /(?:생산)/))) return null
    const op = mutation(value)
    return op ? { domain: 'business_work_log', operation: op } : null
  }
"""
if text.count(old) != 1:
    raise SystemExit(f'worklog intent pattern count={text.count(old)}')
intents.write_text(text.replace(old, new), encoding='utf-8')

matrix = Path('tests/moni-agent-mobile-intent-matrix.test.mjs')
text = matrix.read_text(encoding='utf-8')
old = "['직원 근무시간 수정해줘', { domain: 'business_work_log', operation: 'UPDATE' }]"
new = "['생산 프리랜서 근무시간 수정해줘', { domain: 'business_work_log', operation: 'UPDATE' }]"
if text.count(old) != 1:
    raise SystemExit(f'matrix worklog case count={text.count(old)}')
matrix.write_text(text.replace(old, new), encoding='utf-8')
