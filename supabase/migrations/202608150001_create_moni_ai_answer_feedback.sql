create table if not exists public.moni_ai_answer_feedback (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  thread_id uuid not null references public.moni_ai_threads(id) on delete cascade,
  assistant_message_id uuid not null references public.moni_ai_messages(id) on delete cascade,
  actor_login_id text not null,
  rating text not null check (rating in ('UP', 'DOWN')),
  source text not null default 'MOBILE' check (source in ('MOBILE', 'PC', 'SYSTEM')),
  learning_status text not null default 'CANDIDATE' check (learning_status in ('CANDIDATE', 'PMO_VERIFIED', 'REJECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, assistant_message_id, actor_login_id)
);

create index if not exists idx_moni_ai_answer_feedback_thread
  on public.moni_ai_answer_feedback (business_id, thread_id, created_at desc);

create index if not exists idx_moni_ai_answer_feedback_learning
  on public.moni_ai_answer_feedback (business_id, learning_status, rating, created_at desc);

alter table public.moni_ai_answer_feedback enable row level security;

revoke all on table public.moni_ai_answer_feedback from anon, authenticated;
grant all on table public.moni_ai_answer_feedback to service_role;

comment on table public.moni_ai_answer_feedback is
  'Explicit user quality labels for MONI assistant answers. Feedback is learning evidence only; it does not directly alter model weights or active PMO rules.';
