create table if not exists public.production_completion_metadata (
  id uuid primary key default gen_random_uuid(),
  production_record_id text not null unique,
  writer_name text not null,
  reviewer_name text not null,
  actual_input_unit text,
  actual_input_value numeric,
  defect_input_unit text,
  defect_input_value numeric,
  sample_entries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_completion_metadata_actual_unit_check
    check (actual_input_unit is null or actual_input_unit in ('ea', 'kg', 'g')),
  constraint production_completion_metadata_defect_unit_check
    check (defect_input_unit is null or defect_input_unit in ('kg', 'g'))
);

create index if not exists idx_production_completion_metadata_record
  on public.production_completion_metadata (production_record_id);

comment on table public.production_completion_metadata is
  '생산 완료 입력 시 작업지시서에 출력할 작성자, 확인자, 원입력 단위 및 샘플별 내역';

alter table public.production_completion_metadata disable row level security;
