update public.moni_capability_registry
set aliases = array[
  '판매 단가 어디서 바꿔',
  '제품 판매규격 수정',
  'BOX EA 단위 추가',
  '판매가격 변경',
  '판매규격 단가',
  '제품 판매 단가'
], updated_at=now()
where business_id='20220523011' and feature_id='SALES_VARIANT_PRICING';

update public.moni_ai_project_context
set content=replace(content,'판매규격 단가,','판매단가,'),updated_at=now()
where business_id='20220523011' and context_key='MONI_SELF_KNOWLEDGE_POLICY';

insert into public.moni_capability_regression_cases(business_id,question,expected_feature_id,note)
values ('20220523011','판매규격 단가 어디서 바꿔','SALES_VARIANT_PRICING','판매규격·단가 자연어 변형')
on conflict (business_id,question) do update set
  expected_feature_id=excluded.expected_feature_id,
  note=excluded.note,
  active=true,
  updated_at=now();
