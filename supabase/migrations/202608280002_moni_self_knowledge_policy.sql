insert into public.moni_ai_project_context
(business_id,context_key,title,content,priority,source_type,source_reference,active,updated_at)
values (
  '20220523011',
  'MONI_SELF_KNOWLEDGE_POLICY',
  'MONI 자기 기능·사용법 조회 원칙',
  '사용자가 MONI 자체의 메뉴 위치, 사용법, 입력 위치, 버튼, 등록·수정·변경 방법을 물으면 모델 기억이나 일반 상식으로 추측하지 않는다. 반드시 get_company_context를 먼저 호출하고, query에는 사용자의 문장 전체가 아니라 핵심 기능명/업무명(예: 원재료 단가, 판매규격 단가, 택배비, 반품, 매입 입고)을 넣어 MONI_CAPABILITY_REGISTRY 근거를 조회한다. 검색 결과의 PC 경로·모바일 지원 상태·실행/입력 위치·주의사항을 그대로 우선한다. 확인된 기능이 없으면 임의 경로를 만들지 말고 현재 기능 레지스트리에 검증된 안내가 없다고 답한다. 회사의 실제 업무 데이터 값 조회는 기존 업무 데이터 도구를 사용하며 기능 레지스트리로 수치를 답하지 않는다.',
  65,
  'GPT_PMO_APPROVED_RULE',
  'docs/MONI_CAPABILITY_PROTOCOL.md',
  true,
  now()
)
on conflict (business_id,context_key) do update set
  title=excluded.title,
  content=excluded.content,
  priority=excluded.priority,
  source_type=excluded.source_type,
  source_reference=excluded.source_reference,
  active=true,
  updated_at=now();
