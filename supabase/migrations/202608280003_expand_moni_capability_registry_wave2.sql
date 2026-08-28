insert into public.moni_capability_registry
(business_id,feature_id,feature_name,category,aliases,keywords,pc_path,mobile_support,mobile_path,action_hint,description,caveats,permissions,source_reference)
values
('20220523011','PRODUCTION_OVERVIEW','생산 개요','PRODUCTION',array['생산 개요 어디야','생산 현황 화면','생산 대시보드'],array['생산개요','생산현황','생산대시보드'],array['생산관리','생산 개요'],'PC_ONLY','{}','생산 개요 화면에서 현재 생산 관련 현황 확인','생산 관련 주요 현황을 확인하는 기본 화면이다.','{}',array['admin'],'src/components/AdminDashboard.tsx'),
('20220523011','PRODUCTION_DAILY_REPORT','생산일보','PRODUCTION',array['생산일보 어디서 봐','생산일보 작성','생산일보 조회'],array['생산일보','일보','일일생산'],array['생산관리','생산일보'],'PC_ONLY','{}','생산일보 화면 열기','일별 생산일보를 조회·관리하는 화면이다.','{}',array['admin'],'src/app/production-daily'),
('20220523011','PACKAGING_MATERIAL_MANAGEMENT','부재료 관리','PRODUCTION',array['부재료 어디서 관리해','포장재 관리','부자재 관리'],array['부재료','부자재','포장재'],array['생산관리','부재료 관리'],'PC_ONLY','{}','부재료 관리 화면에서 등록·수정','부재료/포장 관련 마스터를 관리한다.','{}',array['admin'],'src/components/AdminDashboard.tsx'),
('20220523011','SANITATION_CHECK','위생점검','PRODUCTION',array['위생점검 어디서 해','위생 점검표','위생 기록'],array['위생점검','위생','점검'],array['생산관리','위생점검'],'PC_ONLY','{}','위생점검 화면 열기','공장 위생점검 기록을 관리한다.','{}',array['admin'],'src/components/AdminDashboard.tsx'),
('20220523011','QUALITY_MANAGEMENT','품질 관리','PRODUCTION',array['품질 관리 어디야','품질 확인','품질관리 메뉴'],array['품질','품질관리'],array['생산관리','품질 관리'],'PC_ONLY','{}','품질 관리 화면 열기','생산 관련 품질 관리 화면이다.','{}',array['admin'],'src/components/AdminDashboard.tsx'),
('20220523011','COMPLIANCE_MONITOR','규정준수 모니터','PRODUCTION',array['규정준수 어디서 봐','규정 모니터','컴플라이언스'],array['규정준수','규정','컴플라이언스'],array['생산관리','규정준수 모니터'],'PC_ONLY','{}','규정준수 모니터 화면 열기','규정 준수 관련 상태를 확인하는 화면이다.','{}',array['admin'],'src/components/AdminDashboard.tsx'),
('20220523011','SALES_CLIENT_MANAGEMENT','매출처 관리','SALES',array['매출처 어디서 관리해','판매 거래처 등록','고객사 수정'],array['매출처','판매처','고객사','거래처'],array['판매관리','매출처 관리'],'PC_ONLY','{}','매출처 등록·수정','판매 거래처 마스터를 관리한다.','{}',array['admin'],'src/components/SalesManagementMenuController.tsx'),
('20220523011','SALES_TAX_INVOICES','세금계산서','SALES',array['세금계산서 어디서 봐','세금계산서 메뉴','세금계산서 관리'],array['세금계산서','부가세'],array['판매관리','세금계산서'],'PC_ONLY','{}','세금계산서 화면 열기','판매관리의 세금계산서 화면이다.','{}',array['admin'],'src/components/SalesManagementMenuController.tsx'),
('20220523011','SALES_COMMISSION_SETTLEMENT','영업 수당 정산','SALES',array['영업 수당 어디서 정산해','영업 수당 정산 메뉴','영업 정산서'],array['영업수당','수당','정산','영업정산'],array['판매관리','영업 수당 정산'],'PC_ONLY','{}','영업 수당 정산 화면 열기','영업 관련 수당 정산을 관리한다.','{}',array['admin'],'src/components/SalesManagementMenuController.tsx'),
('20220523011','SALES_STATISTICS','판매통계','SALES',array['판매통계 어디서 봐','매출 통계 메뉴','판매 통계'],array['판매통계','매출통계','통계'],array['통계','판매통계'],'PC_ONLY','{}','판매통계 화면 열기','판매 관련 통계 화면이다.','{}',array['admin'],'src/components/SalesManagementMenuController.tsx')
on conflict (business_id,feature_id) do update set
feature_name=excluded.feature_name,category=excluded.category,aliases=excluded.aliases,keywords=excluded.keywords,pc_path=excluded.pc_path,
mobile_support=excluded.mobile_support,mobile_path=excluded.mobile_path,action_hint=excluded.action_hint,description=excluded.description,
caveats=excluded.caveats,permissions=excluded.permissions,status='ACTIVE',source_reference=excluded.source_reference,updated_at=now();

insert into public.moni_capability_regression_cases (business_id,question,expected_feature_id,note)
values
('20220523011','생산일보 어디서 봐','PRODUCTION_DAILY_REPORT','생산일보 경로'),
('20220523011','부재료 어디서 관리해','PACKAGING_MATERIAL_MANAGEMENT','부재료 경로'),
('20220523011','위생점검 어디서 해','SANITATION_CHECK','위생점검 경로'),
('20220523011','품질 관리 메뉴 어디야','QUALITY_MANAGEMENT','품질관리 경로'),
('20220523011','규정준수 어디서 봐','COMPLIANCE_MONITOR','규정준수 경로'),
('20220523011','매출처 어디서 관리해','SALES_CLIENT_MANAGEMENT','매출처 경로'),
('20220523011','세금계산서 어디서 봐','SALES_TAX_INVOICES','세금계산서 경로'),
('20220523011','영업 수당 어디서 정산해','SALES_COMMISSION_SETTLEMENT','영업 수당 경로'),
('20220523011','판매통계 어디서 봐','SALES_STATISTICS','판매통계 경로')
on conflict (business_id,question) do update set expected_feature_id=excluded.expected_feature_id,note=excluded.note,active=true,updated_at=now();
