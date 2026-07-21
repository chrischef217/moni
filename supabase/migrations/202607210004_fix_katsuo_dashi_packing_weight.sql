-- 원재료 상세편집의 숫자 규격과 월간 생산계획 발주 계산용 포장중량이
-- 서로 달랐던 가쓰오다시 1건을 사용자 확인값 10,000g으로 동기화합니다.
update public.raw_materials
   set packing_weight_g = 10000,
       spec = '10000'
 where id = 'ITEM-IMP-260604-115'
   and item_name = '가쓰오다시'
   and spec = '10000'
   and packing_weight_g = 1000;
