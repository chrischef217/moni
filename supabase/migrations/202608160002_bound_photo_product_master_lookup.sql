-- GPT(PMO)-approved rule from the 2026-08-16 mobile photo incident.
-- This changes MONI AI guidance metadata only. It does not modify products,
-- production, sales, purchase, inventory, or any other business record.

update public.moni_ai_project_context
set
  content = case
    when content ilike '%사진에서 제품명을 식별한 뒤 사용자가 그 제품이 우리 제품인지 확인해 달라고 하면%'
      then content
    else content || ' 사진에서 제품명을 식별한 뒤 사용자가 그 제품이 우리 제품인지 확인해 달라고 하면, 사진에서 읽은 제품명 또는 라벨명을 공식 제품 마스터에 정확히 한 번 조회한다. 정확 조회가 0건이면 해당 정확한 이름의 제품은 현재 공식 제품 마스터에 등록되지 않은 것으로 답하고 종료한다. 사용자가 유사 제품·같은 카테고리 비교를 명시적으로 요청하지 않은 한 손 세정제→액상비누→핸드솝처럼 동의어·카테고리 검색을 연속 반복하지 않는다.'
  end,
  source_reference = 'GPT(PMO) live incident 2026-08-16: photo product presence max-turn loop',
  updated_at = now()
where business_id = '20220523011'
  and context_key = 'FACTUALITY';
