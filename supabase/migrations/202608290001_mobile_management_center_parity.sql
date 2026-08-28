update public.moni_capability_registry
set mobile_support = 'ASK_MONI',
    mobile_path = array['모바일 MONI','관리센터','거래명세표 전체 이력'],
    action_hint = '기간·상태·거래처/명세표번호로 검색 후 개별 거래명세표 열기',
    source_reference = 'src/components/MoniMobileManagementCenter.tsx',
    updated_at = now()
where business_id = '20220523011' and feature_id = 'SALES_STATEMENT_MANAGEMENT';

update public.moni_capability_registry
set mobile_support = 'ASK_MONI',
    mobile_path = array['모바일 MONI','관리센터','수출서류 전체 이력'],
    action_hint = '기간·상태·수출처/문서번호 검색, Invoice·Packing List·연결 거래명세표 열기, 출고확정·취소·삭제를 확인 후 실행',
    source_reference = 'src/components/MoniMobileManagementCenter.tsx',
    updated_at = now()
where business_id = '20220523011' and feature_id = 'EXPORT_DOCUMENT_MANAGEMENT';

update public.moni_capability_registry
set mobile_support = 'ASK_MONI',
    mobile_path = array['모바일 MONI','관리센터','대외공문 조회·출력'],
    action_hint = '기간·상태·수신처/제목/공문번호로 검색 후 A4 공문 열기·인쇄·PDF 저장',
    source_reference = 'src/app/api/moni/official-documents/[id]/print/route.ts',
    updated_at = now()
where business_id = '20220523011' and feature_id = 'DOCUMENT_OFFICIAL_MANAGEMENT';

update public.moni_capability_registry
set mobile_support = 'ASK_MONI',
    mobile_path = array['모바일 MONI','관리센터','현금흐름·세무 종합관리'],
    action_hint = '월별 실제·예정 현금흐름, 계좌잔액, VAT·원천징수 참고값, 프리랜서 지급상태를 한 화면에서 조회·처리',
    source_reference = 'src/app/api/moni/mobile-management-center/route.ts',
    updated_at = now()
where business_id = '20220523011' and feature_id = 'FINANCIAL_CONTROL_TAX';
