-- Complete MONI self-knowledge coverage for every current primary sidebar route.
-- Idempotent SSOT companion to the production migration already applied by GPT(PMO).

insert into public.moni_capability_registry (
  business_id, feature_id, feature_name, category, aliases, keywords, pc_path,
  mobile_support, mobile_path, action_hint, description, caveats, permissions, status, source_reference
) values
('20220523011','SALES_STATEMENT_MANAGEMENT','거래명세표 관리','SALES',array['거래명세표','거래 명세표','명세표 관리'],array['거래명세표','명세표','판매','조회','관리'],array['판매관리','거래명세표'],'PC_ONLY','{}','기존 거래명세표 조회·관리','판매 거래명세표 목록과 기존 거래를 확인·관리합니다.','{}',array['admin'],'ACTIVE','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','EXPORT_DOCUMENT_MANAGEMENT','수출서류 관리','EXPORT',array['수출 서류 관리','수출문서 관리','수출서류'],array['수출서류','수출문서','인보이스','패킹리스트','관리'],array['수출관리','수출서류 관리'],'PC_ONLY','{}','수출서류 관리 화면 열기','생성된 수출서류와 관련 문서를 관리하는 공식 메뉴입니다.','{}',array['admin'],'ACTIVE','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','DOCUMENT_OFFICIAL_MANAGEMENT','대외 공문 관리','DOCUMENT',array['공문 관리','대외공문','공문'],array['문서','공문','대외','관리'],array['문서관리','대외 공문 관리'],'PC_ONLY','{}','대외 공문 관리 화면 열기','대외 공문을 등록·조회·관리합니다.','{}',array['admin'],'ACTIVE','src/components/DocumentManagementMenuController.tsx'),
('20220523011','DOCUMENT_QUOTE_MANAGEMENT','견적서 관리','DOCUMENT',array['견적 관리','견적서','quote'],array['문서','견적','견적서','관리'],array['문서관리','견적서 관리'],'PC_ONLY','{}','견적서 관리 화면 열기','견적서를 등록·조회·관리합니다.','{}',array['admin'],'ACTIVE','src/components/DocumentManagementMenuController.tsx'),
('20220523011','ADMIN_COMPANY_SETTINGS','관리자 회사설정','ADMIN',array['관리자','회사 설정','관리자 설정'],array['관리자','회사','설정'],array['관리자','회사 설정'],'PC_ONLY','{}','관리자 버튼 → 회사 설정 화면 열기','관리자 영역의 회사 설정 화면입니다.','{}',array['admin'],'ACTIVE','src/components/SidebarAdminMenuController.tsx')
on conflict (business_id, feature_id) do update set
  feature_name=excluded.feature_name,
  category=excluded.category,
  aliases=excluded.aliases,
  keywords=excluded.keywords,
  pc_path=excluded.pc_path,
  mobile_support=excluded.mobile_support,
  mobile_path=excluded.mobile_path,
  action_hint=excluded.action_hint,
  description=excluded.description,
  caveats=excluded.caveats,
  permissions=excluded.permissions,
  status=excluded.status,
  source_reference=excluded.source_reference,
  updated_at=now();

create table if not exists public.moni_capability_required_routes (
  business_id text not null default '20220523011',
  area text not null,
  menu_label text not null,
  expected_feature_id text not null,
  source_reference text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, area, menu_label)
);

insert into public.moni_capability_required_routes (business_id,area,menu_label,expected_feature_id,source_reference) values
('20220523011','관리자','회사 설정','ADMIN_COMPANY_SETTINGS','src/components/SidebarAdminMenuController.tsx'),
('20220523011','매입관리','매입·입고 관리','PURCHASE_RECEIPT_MANAGEMENT','src/components/PurchaseManagementMenuController.tsx'),
('20220523011','매입관리','매입처 관리','PURCHASE_SUPPLIER_MANAGEMENT','src/components/PurchaseManagementMenuController.tsx'),
('20220523011','매입관리','지급·미지급금','PURCHASE_PAYABLES','src/components/PurchaseManagementMenuController.tsx'),
('20220523011','문서관리','견적서 관리','DOCUMENT_QUOTE_MANAGEMENT','src/components/DocumentManagementMenuController.tsx'),
('20220523011','문서관리','대외 공문 관리','DOCUMENT_OFFICIAL_MANAGEMENT','src/components/DocumentManagementMenuController.tsx'),
('20220523011','생산관리','규정준수','COMPLIANCE_MONITOR','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','생산관리','부재료 관리','PACKAGING_MATERIAL_MANAGEMENT','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','생산관리','생산 대시보드','PRODUCTION_OVERVIEW','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','생산관리','생산일보','PRODUCTION_DAILY_REPORT','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','생산관리','원료 수불부','RAW_MATERIAL_LEDGER','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','생산관리','원재료 관리','RAW_MATERIAL_MANAGEMENT','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','생산관리','월간 생산계획','PRODUCTION_PLAN','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','생산관리','위생점검','SANITATION_CHECK','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','생산관리','작업지시서','PRODUCTION_WORK_ORDER','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','생산관리','제품 관리','PRODUCT_MANAGEMENT','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','생산관리','품질관리','QUALITY_MANAGEMENT','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','수출관리','수출서류 관리','EXPORT_DOCUMENT_MANAGEMENT','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','수출관리','수출처 관리','EXPORT_DESTINATION_MANAGEMENT','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','수출관리','수출품목 설정','EXPORT_ITEM_SETTINGS','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','영업관리','고객사 및 담당자','SALES_CONTACTS','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','영업관리','영업 목표매출','SALES_TARGETS','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','영업관리','영업기회 파이프라인','SALES_PIPELINE','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','영업관리','영업활동·상담기록','SALES_ACTIVITIES','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','인사관리','계약·정산조건','HR_CONTRACT_CONDITIONS','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','인사관리','정규직 직원관리','HR_REGULAR_EMPLOYEES','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','인사관리','프리랜서 인력관리','HR_FREELANCERS','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','인사관리','필수서류 관리','HR_REQUIRED_DOCUMENTS','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','재고관리','완제품 재고관리','FINISHED_GOODS_INVENTORY','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','재무감사','감사 기록','AUDIT_RECORDS','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','재무감사','재무감사','FINANCIAL_AUDIT','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','통합 대시보드','MONI Intelligence','MONI_INTELLIGENCE','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','통합 대시보드','경영 Control Tower','CONTROL_TOWER','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','판매관리','거래명세표','SALES_STATEMENT_MANAGEMENT','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','판매관리','거래처 관리','SALES_CLIENT_MANAGEMENT','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','판매관리','세금계산서','SALES_TAX_INVOICES','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','판매관리','수금·미수금','SALES_RECEIVABLES','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','판매관리','영업 정산서','SALES_COMMISSION_SETTLEMENT','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','판매관리','판매 등록','SALES_PRODUCT_ENTRY','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','판매관리','판매 통계','SALES_STATISTICS','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','판매관리','판매규격·단가','SALES_VARIANT_PRICING','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','회계·세무관리','생산 근무보정','PRODUCTION_WORKLOG_ADJUSTMENT','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','회계·세무관리','월별 프리랜서 정산','ACCOUNTING_FREELANCER_SETTLEMENT','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','회계·세무관리','정산서 출력','SETTLEMENT_PRINT','src/components/GlobalMoniSidebarController.tsx'),
('20220523011','회계·세무관리','현금흐름·세무','FINANCIAL_CONTROL_TAX','src/components/GlobalMoniSidebarController.tsx')
on conflict (business_id,area,menu_label) do update set
  expected_feature_id=excluded.expected_feature_id,
  source_reference=excluded.source_reference,
  active=true,
  updated_at=now();

create or replace function public.run_moni_capability_coverage_audit(p_business_id text default '20220523011')
returns table(area text, menu_label text, expected_feature_id text, feature_name text, pc_path text[], covered boolean)
language sql
stable
set search_path=public
as $$
select rr.area, rr.menu_label, rr.expected_feature_id, cr.feature_name, cr.pc_path,
       (cr.feature_id is not null and cr.status='ACTIVE') as covered
from public.moni_capability_required_routes rr
left join public.moni_capability_registry cr
  on cr.business_id=rr.business_id and cr.feature_id=rr.expected_feature_id
where rr.business_id=p_business_id and rr.active=true
order by rr.area, rr.menu_label;
$$;

insert into public.moni_capability_regression_cases (business_id,question,expected_feature_id,note) values
('20220523011','거래명세표 어디서 봐','SALES_STATEMENT_MANAGEMENT','공식 판매관리 메뉴'),
('20220523011','수출서류 어디서 관리해','EXPORT_DOCUMENT_MANAGEMENT','공식 수출관리 메뉴'),
('20220523011','공문 어디서 관리해','DOCUMENT_OFFICIAL_MANAGEMENT','문서관리 동적 메뉴'),
('20220523011','견적서 어디서 관리해','DOCUMENT_QUOTE_MANAGEMENT','문서관리 동적 메뉴'),
('20220523011','회사 설정 어디야','ADMIN_COMPANY_SETTINGS','관리자 회사 설정'),
('20220523011','원재료 단가 어디서 바꿔','RAW_MATERIAL_PRICE_EDIT','대표 결정형 how-to'),
('20220523011','제품 판매 단가 바꾸는 메뉴','SALES_VARIANT_PRICING','판매 단가 구분'),
('20220523011','매입 입고 어디서 등록해','PURCHASE_RECEIPT_MANAGEMENT','매입 화면 경로')
on conflict (business_id,question) do update set
  expected_feature_id=excluded.expected_feature_id,
  note=excluded.note,
  active=true,
  updated_at=now();
