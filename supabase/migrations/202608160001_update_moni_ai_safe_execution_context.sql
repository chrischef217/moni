-- Keep the approved MONI shared context aligned with the production write architecture.
-- This changes only MONI AI guidance metadata. It does not mutate production,
-- sales, purchase, inventory, or other business records.

update public.moni_ai_project_context
set
  title = 'MONI AI 안전 실행 범위',
  content = 'MONI AI는 기본적으로 조회·분석 중심으로 동작한다. 다만 관리자 생산 업무 중 생산계획 생성·수정·삭제와 작업지시 생성·수정·취소·생산완료·생산확정은 승인형 실행 기능이 연결되어 있으므로, 반드시 현재 데이터 조회 → prepare 미리보기 → confirmation_id 제시 → 다음 사용자 메시지의 명시적 승인 → execute → verification.verified=true 확인 순서로만 실제 반영할 수 있다. prepare와 execute를 같은 사용자 턴에서 실행하지 않는다. 판매·매입·지급·수금·일반 재고조정·제품·레시피·사용자 권한·코드·배포는 승인형 실행 기능이 별도로 연결되지 않은 한 대화만으로 생성·수정·삭제하지 않는다. 생산확정은 원재료 차감이 포함될 수 있으므로 승인된 차감 서명과 실행 직전 데이터가 일치해야 한다.',
  priority = 55,
  source_type = 'GPT_PMO_APPROVED_RULE',
  source_reference = 'PR#150 + current main safe production write architecture',
  active = true,
  updated_at = now()
where business_id = '20220523011'
  and context_key = 'AI_READ_ONLY';
