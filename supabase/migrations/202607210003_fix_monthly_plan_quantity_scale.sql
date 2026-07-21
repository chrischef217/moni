-- 월간 생산계획 수량이 작업지시서의 g 값을 kg로 오인하여 1,000배 저장된 건을 복구합니다.
-- 동일 생산일자·동일 제품의 작업지시서 계획량과 정확히 1,000배 차이 나는 경우만 수정합니다.
with matched as (
  select distinct on (p.id)
         p.id as plan_id,
         r.planned_quantity_g as corrected_g
  from public.monthly_production_plans p
  join public.production_records r
    on r.work_date = p.plan_date
   and r.product_id = p.product_id
   and coalesce(r.status, '') not in ('cancelled', 'canceled')
  where r.planned_quantity_g > 0
    and p.planned_quantity_g = r.planned_quantity_g * 1000
  order by p.id, r.created_at desc nulls last, r.id desc
)
update public.monthly_production_plans p
   set planned_quantity_g = m.corrected_g,
       updated_at = now()
  from matched m
 where p.id = m.plan_id;

-- 2026-07-17 춘 짬뽕소스 예상 계획은 55kg 입력이 55,000,000g으로 저장된 동일 단위 오류입니다.
update public.monthly_production_plans
   set planned_quantity_g = 55000,
       updated_at = now()
 where plan_date = date '2026-07-17'
   and product_id = 'PROD-0124'
   and planned_quantity_g = 55000000
   and note = 'AI 예측에서 예상 계획으로 전환';