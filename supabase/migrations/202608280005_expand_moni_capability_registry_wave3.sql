insert into public.moni_capability_registry
(business_id,feature_id,feature_name,category,aliases,keywords,pc_path,mobile_support,mobile_path,action_hint,description,caveats,permissions,source_reference)
values
('20220523011','CONTROL_TOWER','경영 Control Tower','DASHBOARD',array['경영 대시보드 어디야','컨트롤타워','메인 대시보드'],array['경영','대시보드','Control Tower','컨트롤타워'],array['통합 대시보드','경영 Control Tower'],'PC_ONLY','{}','경영 Control Tower 화면 열기','MONI의 통합 경영 현황 기본 화면이다.','{}',array['admin'],'src/components/GlobalMoniSidebarController.tsx'),
('20220523011','MONI_INTELLIGENCE','MONI Intelligence','DASHBOARD',array['인텔리전스 어디야','MONI Intelligence 어디서 봐','지능 분석 화면'],array['Intelligence','인텔리전스','분석'],array['통합 대시보드','MONI Intelligence'],'PC_ONLY','{}','MONI Intelligence 화면 열기','MONI Intelligence 전용 화면이다.','{}',array['admin'],'src/components/GlobalMoniSidebarController.tsx'),
('20220523011','ACCOUNTING_FREELANCER_SETTLEMENT','월별 프리랜서 정산','ACCOUNTING',array['프리랜서 월 정산 어디서','월별 프리랜서 정산','프리랜서 정산 메뉴'],array['프리랜서','월별정산','정산'],array['회계·세무관리','월별 프리랜서 정산'],'PC_ONLY','{}','월별 프리랜서 정산 화면 열기','프리랜서 월별 정산 업무 화면이다.','{}',array['admin'],'src/components/GlobalMoniSidebarController.tsx'),
('20220523011','FINANCIAL_CONTROL_TAX','현금흐름·세무','ACCOUNTING',array['현금흐름 어디서 봐','세무 화면 어디야','현금흐름 세무'],array['현금흐름','세무','재무'],array['회계·세무관리','현금흐름·세무'],'PC_ONLY','{}','현금흐름·세무 화면 열기','현금흐름과 세무 관련 관리 화면이다.','{}',array['admin'],'src/components/GlobalMoniSidebarController.tsx'),
('20220523011','PRODUCTION_WORKLOG_ADJUSTMENT','생산 근무보정','ACCOUNTING',array['생산 근무보정 어디서','생산 프리랜서 근무 수정','근무보정'],array['생산근무','근무보정','프리랜서'],array['회계·세무관리','생산 근무보정'],'PC_ONLY','{}','생산 근무보정 화면 열기','생산 관련 근무 기록 보정 화면이다.','{}',array['admin'],'src/components/GlobalMoniSidebarController.tsx'),
('20220523011','SETTLEMENT_PRINT','정산서 출력','ACCOUNTING',array['정산서 어디서 출력해','정산서 출력 메뉴','정산서 인쇄'],array['정산서','출력','인쇄'],array['회계·세무관리','정산서 출력'],'PC_ONLY','{}','정산서 출력 화면 열기','정산서 출력 업무 화면이다.','{}',array['admin'],'src/components/GlobalMoniSidebarController.tsx'),
('20220523011','EXPORT_DESTINATION_MANAGEMENT','수출처 관리','EXPORT',array['수출처 어디서 관리해','수출 거래처 등록','수출처 등록'],array['수출처','수출거래처','Consignee'],array['수출관리','수출처 관리'],'PC_ONLY','{}','수출처 관리 화면 열기','수출 거래처/수출처 마스터를 관리한다.','{}',array['admin'],'src/components/GlobalMoniSidebarController.tsx'),
('20220523011','EXPORT_ITEM_SETTINGS','수출품목 설정','EXPORT',array['수출품목 어디서 설정해','수출 제품 등록','수출품목 관리'],array['수출품목','수출제품','품목설정'],array['수출관리','수출품목 설정'],'PC_ONLY','{}','수출품목 설정 화면 열기','수출 문서에 사용하는 수출품목 설정 화면이다.','{}',array['admin'],'src/components/GlobalMoniSidebarController.tsx'),
('20220523011','SALES_CONTACTS','고객사 및 담당자','SALES_CRM',array['고객사 담당자 어디서 관리해','영업 고객사','담당자 관리'],array['고객사','담당자','영업고객'],array['영업관리','고객사 및 담당자'],'PC_ONLY','{}','고객사 및 담당자 화면 열기','영업관리의 고객사·담당자 관리 화면이다.','{}',array['admin'],'src/components/GlobalMoniSidebarController.tsx'),
('20220523011','SALES_TARGETS','영업 목표매출','SALES_CRM',array['영업 목표 어디서 등록해','목표매출 어디서 봐','영업 목표매출'],array['영업목표','목표매출','목표'],array['영업관리','영업 목표매출'],'PC_ONLY','{}','영업 목표매출 화면 열기','영업 목표매출을 관리하는 화면이다.','{}',array['admin'],'src/components/GlobalMoniSidebarController.tsx'),
('20220523011','SALES_PIPELINE','영업기회 파이프라인','SALES_CRM',array['영업 파이프라인 어디야','영업기회 관리','파이프라인'],array['영업기회','파이프라인','pipeline'],array['영업관리','영업기회 파이프라인'],'PC_ONLY','{}','영업기회 파이프라인 화면 열기','영업기회 파이프라인 관리 화면이다.','{}',array['admin'],'src/components/GlobalMoniSidebarController.tsx'),
('20220523011','SALES_ACTIVITIES','영업활동·상담기록','SALES_CRM',array['영업 상담 기록 어디서','영업활동 기록','상담기록'],array['영업활동','상담기록','상담'],array['영업관리','영업활동·상담기록'],'PC_ONLY','{}','영업활동·상담기록 화면 열기','영업활동과 상담기록을 관리하는 화면이다.','{}',array['admin'],'src/components/GlobalMoniSidebarController.tsx'),
('20220523011','HR_REGULAR_EMPLOYEES','정규직 직원관리','HR',array['정규직 직원 어디서 관리해','직원관리 메뉴','정규직 관리'],array['정규직','직원관리','직원'],array['인사관리','정규직 직원관리'],'PC_ONLY','{}','정규직 직원관리 화면 열기','정규직 직원 관리 화면이다.','{}',array['admin'],'src/components/GlobalMoniSidebarController.tsx'),
('20220523011','HR_FREELANCERS','프리랜서 인력관리','HR',array['프리랜서 인력 어디서 관리해','프리랜서 관리','인력관리'],array['프리랜서','인력관리'],array['인사관리','프리랜서 인력관리'],'PC_ONLY','{}','프리랜서 인력관리 화면 열기','프리랜서 인력 관리 화면이다.','{}',array['admin'],'src/components/GlobalMoniSidebarController.tsx'),
('20220523011','HR_CONTRACT_CONDITIONS','계약·정산조건','HR',array['계약 조건 어디서 봐','정산조건 수정','계약 정산조건'],array['계약','정산조건','계약조건'],array['인사관리','계약·정산조건'],'PC_ONLY','{}','계약·정산조건 화면 열기','인사 관련 계약 및 정산조건 관리 화면이다.','{}',array['admin'],'src/components/GlobalMoniSidebarController.tsx'),
('20220523011','HR_REQUIRED_DOCUMENTS','필수서류 관리','HR',array['직원 필수서류 어디서','인사 서류 관리','필수서류'],array['필수서류','인사서류','서류'],array['인사관리','필수서류 관리'],'PC_ONLY','{}','필수서류 관리 화면 열기','인사 관련 필수서류 관리 화면이다.','{}',array['admin'],'src/components/GlobalMoniSidebarController.tsx'),
('20220523011','FINANCIAL_AUDIT','재무감사','AUDIT',array['재무감사 어디서 해','재무 감사 메뉴','감사 화면'],array['재무감사','감사'],array['재무감사','재무감사'],'PC_ONLY','{}','재무감사 화면 열기','재무감사 업무 화면이다.','{}',array['admin'],'src/components/GlobalMoniSidebarController.tsx'),
('20220523011','AUDIT_RECORDS','감사 기록','AUDIT',array['감사 기록 어디서 봐','감사 이력','감사기록'],array['감사기록','감사이력','audit'],array['재무감사','감사 기록'],'PC_ONLY','{}','감사 기록 화면 열기','저장된 감사 기록을 확인하는 화면이다.','{}',array['admin'],'src/components/GlobalMoniSidebarController.tsx')
on conflict (business_id,feature_id) do update set
feature_name=excluded.feature_name,category=excluded.category,aliases=excluded.aliases,keywords=excluded.keywords,pc_path=excluded.pc_path,
mobile_support=excluded.mobile_support,mobile_path=excluded.mobile_path,action_hint=excluded.action_hint,description=excluded.description,
caveats=excluded.caveats,permissions=excluded.permissions,status='ACTIVE',source_reference=excluded.source_reference,updated_at=now();

insert into public.moni_capability_regression_cases (business_id,question,expected_feature_id,note)
values
('20220523011','컨트롤타워 어디서 봐','CONTROL_TOWER','통합 대시보드 경로'),
('20220523011','MONI Intelligence 어디서 봐','MONI_INTELLIGENCE','Intelligence 경로'),
('20220523011','프리랜서 월 정산 어디서','ACCOUNTING_FREELANCER_SETTLEMENT','회계 정산 경로'),
('20220523011','현금흐름 어디서 봐','FINANCIAL_CONTROL_TAX','현금흐름·세무 경로'),
('20220523011','생산 근무보정 어디서','PRODUCTION_WORKLOG_ADJUSTMENT','근무보정 경로'),
('20220523011','정산서 어디서 출력해','SETTLEMENT_PRINT','정산서 출력 경로'),
('20220523011','수출처 어디서 관리해','EXPORT_DESTINATION_MANAGEMENT','수출처 경로'),
('20220523011','수출품목 어디서 설정해','EXPORT_ITEM_SETTINGS','수출품목 경로'),
('20220523011','고객사 담당자 어디서 관리해','SALES_CONTACTS','영업 고객사 경로'),
('20220523011','영업 목표 어디서 등록해','SALES_TARGETS','목표매출 경로'),
('20220523011','영업 파이프라인 어디야','SALES_PIPELINE','파이프라인 경로'),
('20220523011','영업 상담 기록 어디서','SALES_ACTIVITIES','상담기록 경로'),
('20220523011','정규직 직원 어디서 관리해','HR_REGULAR_EMPLOYEES','정규직 경로'),
('20220523011','프리랜서 인력 어디서 관리해','HR_FREELANCERS','프리랜서 인력 경로'),
('20220523011','계약 조건 어디서 봐','HR_CONTRACT_CONDITIONS','계약·정산조건 경로'),
('20220523011','직원 필수서류 어디서','HR_REQUIRED_DOCUMENTS','필수서류 경로'),
('20220523011','재무감사 어디서 해','FINANCIAL_AUDIT','재무감사 경로'),
('20220523011','감사 기록 어디서 봐','AUDIT_RECORDS','감사 기록 경로')
on conflict (business_id,question) do update set expected_feature_id=excluded.expected_feature_id,note=excluded.note,active=true,updated_at=now();
