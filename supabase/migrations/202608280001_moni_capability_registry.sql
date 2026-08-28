-- MONI self-knowledge capability registry.
-- Runtime database was migrated first during PMO recovery; this file preserves the schema/seed in GitHub SSOT.

create table if not exists public.moni_capability_registry (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  feature_id text not null,
  feature_name text not null,
  category text not null default 'SYSTEM',
  aliases text[] not null default '{}',
  keywords text[] not null default '{}',
  pc_path text[] not null default '{}',
  mobile_support text not null default 'NOT_VERIFIED' check (mobile_support in ('SUPPORTED','ASK_MONI','PC_ONLY','NOT_VERIFIED')),
  mobile_path text[] not null default '{}',
  action_hint text not null default '',
  description text not null default '',
  caveats text[] not null default '{}',
  permissions text[] not null default array['admin']::text[],
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DEPRECATED','DISABLED')),
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, feature_id)
);

alter table public.moni_capability_registry enable row level security;

create or replace function public.sync_moni_capability_to_project_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id text;
  v_feature_id text;
  v_context_key text;
  v_content text;
begin
  if tg_op = 'DELETE' then
    delete from public.moni_ai_project_context
      where business_id = old.business_id
        and context_key = 'capability:' || old.feature_id;
    return old;
  end if;

  if tg_op = 'UPDATE' and (old.business_id, old.feature_id) is distinct from (new.business_id, new.feature_id) then
    delete from public.moni_ai_project_context
      where business_id = old.business_id
        and context_key = 'capability:' || old.feature_id;
  end if;

  v_business_id := new.business_id;
  v_feature_id := new.feature_id;
  v_context_key := 'capability:' || v_feature_id;
  v_content := concat_ws(E'\n',
    '기능ID: ' || new.feature_id,
    '기능명: ' || new.feature_name,
    '카테고리: ' || new.category,
    case when cardinality(new.aliases) > 0 then '사용자 표현/별칭: ' || array_to_string(new.aliases, ' | ') end,
    case when cardinality(new.keywords) > 0 then '검색 키워드: ' || array_to_string(new.keywords, ' | ') end,
    case when cardinality(new.pc_path) > 0 then 'PC 경로: ' || array_to_string(new.pc_path, ' → ') end,
    '모바일 지원: ' || new.mobile_support,
    case when cardinality(new.mobile_path) > 0 then '모바일 경로: ' || array_to_string(new.mobile_path, ' → ') end,
    case when new.action_hint <> '' then '실행/입력 위치: ' || new.action_hint end,
    case when new.description <> '' then '설명: ' || new.description end,
    case when cardinality(new.caveats) > 0 then '주의: ' || array_to_string(new.caveats, ' | ') end,
    '권한: ' || array_to_string(new.permissions, ', '),
    case when new.source_reference is not null then '근거: ' || new.source_reference end
  );

  delete from public.moni_ai_project_context
    where business_id = v_business_id and context_key = v_context_key;

  if new.status = 'ACTIVE' then
    insert into public.moni_ai_project_context (
      business_id, context_key, title, content, priority, source_type, source_reference, active, updated_at
    ) values (
      v_business_id,
      v_context_key,
      '[MONI 기능] ' || new.feature_name,
      v_content,
      20,
      'MONI_CAPABILITY_REGISTRY',
      coalesce(new.source_reference, new.feature_id),
      true,
      now()
    );
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sync_moni_capability_context on public.moni_capability_registry;
create trigger trg_sync_moni_capability_context
before insert or update or delete on public.moni_capability_registry
for each row execute function public.sync_moni_capability_to_project_context();

insert into public.moni_capability_registry
(business_id,feature_id,feature_name,category,aliases,keywords,pc_path,mobile_support,mobile_path,action_hint,description,caveats,permissions,source_reference)
values
('20220523011','RAW_MATERIAL_PRICE_EDIT','원재료 기준단가 변경','PRODUCTION',array['원재료 단가 어디서 바꿔','원료 가격 수정','매입 원료 단가 변경','재료 단가 수정','원재료 가격 변경'],array['원재료','원료','단가','가격','포장단가'],array['생산관리','원재료 관리','해당 원재료','원재료 상세편집'],'PC_ONLY','{}','입력 포장단가(원) 수정 후 저장','원재료 마스터의 기준 포장단가를 변경한다.',array['과거 특정 매입·입고 전표의 단가 수정과는 다른 기능','포장중량(g)과 포장단가를 함께 확인한다.'],array['admin'],'src/components/RawMaterialUnitPriceController.tsx'),
('20220523011','RAW_MATERIAL_MANAGEMENT','원재료 관리','PRODUCTION',array['원재료 어디서 관리해','원료 등록','원재료 수정'],array['원재료','원료','마스터','등록','수정'],array['생산관리','원재료 관리'],'PC_ONLY','{}','원재료 행 클릭 → 원재료 상세편집','원재료 마스터의 등록·수정·활성 상태를 관리한다.','{}',array['admin'],'src/components/AdminDashboard.tsx'),
('20220523011','RAW_MATERIAL_LEDGER','원료수불부 조회','PRODUCTION',array['원료수불부 어디야','원재료 입출고 내역','원료 사용량 확인'],array['원료수불부','원재료','입고','출고','사용량'],array['생산관리','원료수불부'],'ASK_MONI',array['모바일 MONI','원재료 수불/사용량 질문'],'기간별 원재료 입고·소모 내역 조회','원재료 수불 내역과 잔량을 확인한다.','{}',array['admin','freelancer'],'src/components/AdminDashboard.tsx'),
('20220523011','PRODUCT_MANAGEMENT','제품관리','PRODUCTION',array['제품 어디서 등록해','제품 마스터 수정','제품 규격 수정'],array['제품','제품관리','마스터','규격'],array['생산관리','제품관리'],'PC_ONLY','{}','제품 행 → 상세/수정','제품 마스터와 생산 관련 기본정보를 관리한다.','{}',array['admin'],'src/components/AdminDashboard.tsx'),
('20220523011','RECIPE_MATERIAL_MAPPING','레시피 원재료 연결','PRODUCTION',array['레시피 원재료 연결 어디서','배합 원재료 매핑','원료 매핑'],array['레시피','원재료','매핑','연결','배합'],array['생산관리','레시피 원재료 연결'],'PC_ONLY','{}','제품별 레시피 원재료 매핑 수정','레시피 항목과 실제 원재료 마스터를 연결한다.','{}',array['admin'],'src/components/AdminDashboard.tsx'),
('20220523011','PRODUCTION_PLAN','월간 생산계획 관리','PRODUCTION',array['예정 생산 어디서 등록해','생산계획 어디서','월간 생산계획'],array['생산계획','예정생산','월간계획'],array['생산관리','월간 생산계획'],'ASK_MONI',array['모바일 MONI','생산계획 조회/요청'],'월간 계획 등록·수정 또는 MONI 승인형 작업 사용','월간 예상 생산계획을 관리한다.',array['작업지시와 월간 생산계획은 서로 다른 업무 단계다.'],array['admin'],'src/app/monthly-production-plan'),
('20220523011','PRODUCTION_WORK_ORDER','작업지시 관리','PRODUCTION',array['작업지시 어디서','생산 작업지시 등록','LOT 작업지시'],array['작업지시','LOT','생산'],array['생산관리','작업 지시'],'ASK_MONI',array['모바일 MONI','작업지시 조회/승인형 요청'],'작업지시 생성·수정·취소·완료','실제 생산 작업지시를 관리한다.','{}',array['admin'],'src/components/AdminDashboard.tsx'),
('20220523011','FINISHED_GOODS_INVENTORY','완제품 재고 조회','INVENTORY',array['완제품 재고 어디서 봐','제품 재고 확인','현재 재고'],array['완제품','재고','제품재고'],array['재고관리','완제품 재고'],'ASK_MONI',array['모바일 MONI','완제품 재고 질문'],'완제품별 현재 재고 조회','생산·판매·조정 이력을 반영한 완제품 재고를 확인한다.','{}',array['admin','freelancer'],'src/app/finished-goods-inventory'),
('20220523011','SALES_PRODUCT_ENTRY','제품 판매등록','SALES',array['판매 등록 어디서','거래명세표 등록','제품 매출 입력','매출 등록'],array['판매','매출','거래명세표','판매등록'],array['판매관리','거래명세표','제품 판매등록'],'PC_ONLY','{}','거래처·판매일·제품/판매규격·수량·단가 입력 후 저장','제품 판매 전표와 거래명세표를 등록한다.','{}',array['admin'],'src/components/SalesOrderV4Module.tsx'),
('20220523011','SALES_ACCESSORY_CHARGE','판매 기타비용 추가','SALES',array['택배비 어떻게 넣어','배송비 추가','운임 거래명세표에 넣기','포장비 추가'],array['택배비','배송비','운임','포장비','팔레트비','기타비용'],array['판매관리','거래명세표','제품 판매등록'],'PC_ONLY','{}','+ 기타비용 추가','택배비·운임·포장비 등을 같은 거래명세표 금액에 합산한다.',array['재고·kg·MOQ·영업수당에는 반영하지 않는다.'],array['admin'],'src/components/SalesAccessoryChargeEnhancer.tsx'),
('20220523011','SALES_RETURN_CREDIT','반품·매출차감','SALES',array['반품 어디서 잡아','마이너스 매출','매출 차감','반품 전표'],array['반품','마이너스매출','매출차감','차감전표'],array['판매관리','거래명세표','반품 · 매출차감'],'PC_ONLY','{}','원거래 선택 → 제품 반품 또는 금액 차감','원거래를 보존한 채 별도 마이너스 전표를 생성한다.',array['제품 반품만 완제품 재고를 복구한다.','금액 차감은 재고를 변경하지 않는다.'],array['admin'],'src/components/SalesReturnCreditModule.tsx'),
('20220523011','SALES_RECEIVABLES','수금·미수금 관리','SALES',array['미수 어디서 봐','수금 등록 어디서','미수금 확인'],array['수금','미수','미수금','입금'],array['판매관리','수금·미수금'],'ASK_MONI',array['모바일 MONI','미수/수금 질문'],'거래별 미수 확인 및 수금 등록','판매대금의 입금과 미수잔액을 관리한다.','{}',array['admin'],'src/components/SalesReceivablesModule.tsx'),
('20220523011','SALES_VARIANT_PRICING','판매규격·단가 관리','SALES',array['판매 단가 어디서 바꿔','제품 판매규격 수정','BOX EA 단위 추가','판매가격 변경'],array['판매규격','판매단가','판매가격','BOX','EA','kg'],array['판매관리','제품 규격·단가'],'PC_ONLY','{}','제품별 판매규격/단위/기본단가/MOQ 수정','판매 시 사용하는 BOX·EA·kg 규격과 기본단가를 관리한다.','{}',array['admin'],'src/components/SalesVariantPricingModule.tsx'),
('20220523011','PURCHASE_SUPPLIER_MANAGEMENT','매입처 관리','PURCHASE',array['매입처 어디서 관리해','공급업체 등록','매입 거래처 수정'],array['매입처','공급업체','거래처'],array['매입관리','매입처 관리'],'PC_ONLY','{}','매입처 등록·수정 및 지급조건 관리','매입처 마스터와 기본 지급조건을 관리한다.','{}',array['admin'],'src/components/PurchaseManagementRouter.tsx'),
('20220523011','PURCHASE_RECEIPT_MANAGEMENT','매입·입고 관리','PURCHASE',array['매입 입고 어디서 등록해','원재료 입고 등록','매입 등록'],array['매입','입고','원재료입고','부재료입고'],array['매입관리','매입·입고 관리'],'PC_ONLY','{}','매입/입고 전표 등록 및 수정','원재료·부재료 등의 매입 발생과 실제 입고를 연결해 관리한다.','{}',array['admin'],'src/components/PurchaseManagementRouter.tsx'),
('20220523011','PURCHASE_PAYABLES','지급·미지급금 관리','PURCHASE',array['미지급금 어디서 봐','매입 지급 등록','외상매입 확인'],array['지급','미지급','미지급금','매입대금'],array['매입관리','지급·미지급금'],'ASK_MONI',array['모바일 MONI','매입/미지급 질문'],'매입별 지급예정·실제지급·미지급잔액 관리','매입처에 지급할 금액과 지급 이력을 관리한다.','{}',array['admin'],'src/components/PurchaseManagementRouter.tsx'),
('20220523011','EXPORT_DOCUMENT_GENERATION','수출 Invoice·Packing List 생성','EXPORT',array['수출 인보이스 만들기','패킹리스트 생성','수출 서류 생성'],array['수출','Invoice','인보이스','Packing List','패킹리스트'],array['판매관리','수출관리','수출 서류'],'ASK_MONI',array['모바일 MONI','수출서류 생성 요청'],'수출처·품목·CTN·수출조건 확인 후 문서 생성','Commercial Invoice와 Packing List를 생성하고 판매 거래명세표와 연결할 수 있다.','{}',array['admin'],'src/app/sales-management/export/documents'),
('20220523011','EXPORT_DOCUMENT_REDOWNLOAD','기존 수출문서 재다운로드','EXPORT',array['수출 서류 다시 다운로드','최근 인보이스 링크','패킹리스트 다시 줘','거래명세표 다운로드 링크'],array['재다운로드','다운로드','Invoice','Packing List','거래명세표'],array['판매관리','수출관리','수출 서류'],'ASK_MONI',array['모바일 MONI','기존 수출문서 다운로드 요청'],'기존 생성 문서는 재생성하지 않고 다운로드','기존 생성된 거래명세표·Invoice·Packing List를 다시 받을 때 사용한다.','{}',array['admin'],'src/lib/moni/documents/export-document-resolver.ts')
on conflict (business_id, feature_id) do update set
  feature_name=excluded.feature_name, category=excluded.category, aliases=excluded.aliases, keywords=excluded.keywords,
  pc_path=excluded.pc_path, mobile_support=excluded.mobile_support, mobile_path=excluded.mobile_path,
  action_hint=excluded.action_hint, description=excluded.description, caveats=excluded.caveats,
  permissions=excluded.permissions, status='ACTIVE', source_reference=excluded.source_reference, updated_at=now();

create or replace function public.search_moni_capabilities(
  p_business_id text,
  p_query text,
  p_limit integer default 5
)
returns table (
  feature_id text, feature_name text, category text, aliases text[], keywords text[], pc_path text[],
  mobile_support text, mobile_path text[], action_hint text, description text, caveats text[], permissions text[],
  source_reference text, match_score integer
)
language sql
stable
security invoker
set search_path = public
as $$
with params as (
  select lower(regexp_replace(trim(coalesce(p_query,'')), '[\s._\-·×()/]+', '', 'g')) as qnorm,
         regexp_split_to_array(lower(trim(coalesce(p_query,''))), '\s+') as tokens,
         greatest(1, least(coalesce(p_limit,5), 10)) as row_limit
), scored as (
  select c.*,
    (case when lower(regexp_replace(c.feature_name, '[\s._\-·×()/]+', '', 'g')) = p.qnorm then 140 else 0 end
     + case when exists (select 1 from unnest(c.aliases) a where lower(regexp_replace(a, '[\s._\-·×()/]+', '', 'g')) = p.qnorm) then 135 else 0 end
     + case when p.qnorm <> '' and (lower(regexp_replace(c.feature_name, '[\s._\-·×()/]+', '', 'g')) like '%' || p.qnorm || '%' or p.qnorm like '%' || lower(regexp_replace(c.feature_name, '[\s._\-·×()/]+', '', 'g')) || '%') then 75 else 0 end
     + case when p.qnorm <> '' and exists (select 1 from unnest(c.aliases) a where lower(regexp_replace(a, '[\s._\-·×()/]+', '', 'g')) like '%' || p.qnorm || '%' or p.qnorm like '%' || lower(regexp_replace(a, '[\s._\-·×()/]+', '', 'g')) || '%') then 70 else 0 end
     + coalesce((select count(*)::int * 24 from unnest(p.tokens) t where length(t) >= 2 and exists (select 1 from unnest(c.keywords) k where lower(k) = t or lower(k) like '%' || t || '%' or t like '%' || lower(k) || '%')),0)
     + coalesce((select count(*)::int * 20 from unnest(p.tokens) t where length(t) >= 2 and (lower(c.feature_name) like '%' || t || '%' or exists (select 1 from unnest(c.aliases) a where lower(a) like '%' || t || '%'))),0)
     + coalesce((select count(*)::int * 8 from unnest(p.tokens) t where length(t) >= 2 and exists (select 1 from unnest(c.pc_path) x where lower(x) like '%' || t || '%')),0)
     + coalesce((select count(*)::int * 8 from unnest(p.tokens) t where length(t) >= 2 and exists (select 1 from unnest(c.mobile_path) x where lower(x) like '%' || t || '%')),0)
     + coalesce((select count(*)::int * 6 from unnest(p.tokens) t where length(t) >= 2 and lower(c.action_hint) like '%' || t || '%'),0)
     + coalesce((select count(*)::int * 4 from unnest(p.tokens) t where length(t) >= 2 and lower(c.description) like '%' || t || '%'),0)
     + case when p.qnorm <> '' and lower(regexp_replace(c.action_hint, '[\s._\-·×()/]+', '', 'g')) like '%' || p.qnorm || '%' then 25 else 0 end)::int as score
  from public.moni_capability_registry c cross join params p
  where c.business_id=p_business_id and c.status='ACTIVE'
)
select s.feature_id,s.feature_name,s.category,s.aliases,s.keywords,s.pc_path,s.mobile_support,s.mobile_path,
       s.action_hint,s.description,s.caveats,s.permissions,s.source_reference,s.score as match_score
from scored s cross join params p
where s.score > 0
order by s.score desc,s.feature_name asc
limit (select row_limit from params);
$$;
revoke all on function public.search_moni_capabilities(text,text,integer) from public;
grant execute on function public.search_moni_capabilities(text,text,integer) to service_role;

create table if not exists public.moni_capability_regression_cases (
  id bigint generated always as identity primary key,
  business_id text not null default '20220523011',
  question text not null,
  expected_feature_id text not null,
  note text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, question)
);
alter table public.moni_capability_regression_cases enable row level security;

insert into public.moni_capability_regression_cases (business_id,question,expected_feature_id,note)
values
('20220523011','원재료 단가 어디서 바꿔','RAW_MATERIAL_PRICE_EDIT','원재료 기준단가 사용법'),
('20220523011','택배비 거래명세표에 어떻게 넣어','SALES_ACCESSORY_CHARGE','판매 부대비용 사용법'),
('20220523011','반품 어디서 잡아','SALES_RETURN_CREDIT','반품·매출차감 사용법'),
('20220523011','매입 입고 어디서 등록해','PURCHASE_RECEIPT_MANAGEMENT','매입·입고 사용법'),
('20220523011','제품 판매 단가 바꾸는 메뉴','SALES_VARIANT_PRICING','판매규격·기본단가 사용법'),
('20220523011','최근 인보이스 다시 다운로드','EXPORT_DOCUMENT_REDOWNLOAD','기존 수출문서 재다운로드')
on conflict (business_id,question) do update set expected_feature_id=excluded.expected_feature_id,note=excluded.note,active=true,updated_at=now();

create or replace function public.run_moni_capability_regression(p_business_id text default '20220523011')
returns table (question text,expected_feature_id text,actual_feature_id text,actual_feature_name text,match_score integer,passed boolean)
language sql
stable
security invoker
set search_path=public
as $$
select c.question,c.expected_feature_id,r.feature_id,r.feature_name,r.match_score,(r.feature_id=c.expected_feature_id)
from public.moni_capability_regression_cases c
left join lateral public.search_moni_capabilities(c.business_id,c.question,1) r on true
where c.business_id=p_business_id and c.active=true
order by c.id;
$$;
revoke all on function public.run_moni_capability_regression(text) from public;
grant execute on function public.run_moni_capability_regression(text) to service_role;
