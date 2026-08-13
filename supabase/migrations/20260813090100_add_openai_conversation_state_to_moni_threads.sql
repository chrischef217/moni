alter table public.moni_ai_threads
  add column if not exists openai_conversation_id text,
  add column if not exists openai_conversation_updated_at timestamptz;

create unique index if not exists moni_ai_threads_openai_conversation_unique
  on public.moni_ai_threads(openai_conversation_id)
  where openai_conversation_id is not null;

create unique index if not exists moni_ai_agent_runs_one_running_per_thread
  on public.moni_ai_agent_runs(thread_id)
  where thread_id is not null and status = 'RUNNING';

comment on column public.moni_ai_threads.openai_conversation_id is
  'OpenAI Conversations API id for server-managed reasoning and multi-turn state.';
comment on column public.moni_ai_threads.openai_conversation_updated_at is
  'Last time the OpenAI conversation mapping was created or replaced.';
