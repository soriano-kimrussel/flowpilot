-- FlowPilot AI: core schema
-- All tenant-owned tables carry workspace_id. Access control lives in the RLS migration.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Identity & tenancy
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text check (char_length(full_name) <= 120),
  default_workspace_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email));

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_default_workspace_fk
  foreign key (default_workspace_id) references public.workspaces (id) on delete set null;

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- ---------------------------------------------------------------------------
-- Workflows
-- ---------------------------------------------------------------------------
create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 1000),
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  trigger_type text not null default 'manual'
    check (trigger_type in ('manual', 'lead.created', 'lead.status_changed', 'webhook', 'schedule')),
  current_version_id uuid,
  schedule_interval text check (schedule_interval in ('hourly', 'daily')),
  next_run_at timestamptz,
  is_demo boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workflows_workspace_idx on public.workflows (workspace_id, status);
create index workflows_trigger_idx on public.workflows (workspace_id, trigger_type) where status = 'active';
create index workflows_schedule_idx on public.workflows (next_run_at)
  where status = 'active' and trigger_type = 'schedule';

create table public.workflow_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  definition jsonb not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_id, version_number),
  -- Full validation happens in the application (Zod); the database enforces the basic shape.
  constraint workflow_definition_shape check (
    jsonb_typeof(definition) = 'object'
    and (definition ->> 'version') is not null
    and jsonb_typeof(definition -> 'trigger') = 'object'
    and jsonb_typeof(definition -> 'steps') = 'array'
    and jsonb_array_length(definition -> 'steps') <= 50
    and pg_column_size(definition) < 65536
  )
);
create index workflow_versions_workflow_idx on public.workflow_versions (workflow_id, version_number desc);

alter table public.workflows
  add constraint workflows_current_version_fk
  foreign key (current_version_id) references public.workflow_versions (id) on delete set null;

-- Webhook endpoints are separate so the secret hash is never exposed through the workflows table.
create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  workflow_id uuid not null unique references public.workflows (id) on delete cascade,
  public_id text not null unique check (public_id ~ '^wh_[A-Za-z0-9]{20,64}$'),
  secret_hash text not null check (char_length(secret_hash) = 64),
  secret_hint text not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.webhook_requests (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.webhook_endpoints (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) <= 200),
  job_id uuid,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (endpoint_id, idempotency_key)
);
create index webhook_requests_rate_idx on public.webhook_requests (endpoint_id, received_at desc);

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  email_normalized text generated always as (lower(btrim(email))) stored,
  company text check (char_length(company) <= 120),
  job_title text check (char_length(job_title) <= 120),
  phone text check (char_length(phone) <= 40),
  company_size integer check (company_size >= 0 and company_size <= 10000000),
  budget integer check (budget >= 0 and budget <= 1000000000),
  source text not null default 'manual' check (char_length(source) <= 40),
  message text check (char_length(message) <= 5000),
  notes text check (char_length(notes) <= 5000),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')),
  score integer check (score between 0 and 100),
  score_details jsonb,
  classification text check (char_length(classification) <= 60),
  classification_details jsonb,
  ai_summary text check (char_length(ai_summary) <= 4000),
  assignee text check (char_length(assignee) <= 120),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  last_activity_at timestamptz not null default now(),
  archived_at timestamptz,
  is_demo boolean not null default false,
  -- Loop guard: set when an execution performed the write; triggers skip such writes.
  created_by_execution_id uuid,
  last_changed_by_execution_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Prevents duplicate lead submissions for the same email within a workspace.
  constraint leads_workspace_email_key unique (workspace_id, email_normalized)
);
create index leads_workspace_status_idx on public.leads (workspace_id, status) where archived_at is null;
create index leads_workspace_created_idx on public.leads (workspace_id, created_at desc);
create index leads_workspace_score_idx on public.leads (workspace_id, score desc nulls last);

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  type text not null check (char_length(type) <= 40),
  description text not null check (char_length(description) <= 2000),
  metadata jsonb not null default '{}'::jsonb,
  execution_id uuid,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lead_activities_lead_idx on public.lead_activities (lead_id, created_at desc);
create index lead_activities_workspace_idx on public.lead_activities (workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Executions, steps, jobs
-- ---------------------------------------------------------------------------
create table public.workflow_executions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  -- NO ACTION (checked at statement end) so deleting a workflow cascades cleanly.
  workflow_version_id uuid not null references public.workflow_versions (id),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  trigger_type text not null,
  trigger_payload jsonb not null default '{}'::jsonb,
  lead_id uuid references public.leads (id) on delete set null,
  idempotency_key text check (char_length(idempotency_key) <= 200),
  root_execution_id uuid references public.workflow_executions (id) on delete cascade,
  retry_of_id uuid references public.workflow_executions (id) on delete set null,
  attempt integer not null default 1 check (attempt between 1 and 10),
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer check (duration_ms >= 0),
  error_message text check (char_length(error_message) <= 2000),
  error_code text check (char_length(error_code) <= 60),
  error_step_id text,
  is_demo boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_executions_idempotency_key unique (workspace_id, idempotency_key)
);
create index workflow_executions_workspace_idx on public.workflow_executions (workspace_id, created_at desc);
create index workflow_executions_workflow_idx on public.workflow_executions (workflow_id, created_at desc);
create index workflow_executions_status_idx on public.workflow_executions (workspace_id, status);
create index workflow_executions_lead_idx on public.workflow_executions (lead_id);
create index workflow_executions_root_idx on public.workflow_executions (root_execution_id);

alter table public.lead_activities
  add constraint lead_activities_execution_fk
  foreign key (execution_id) references public.workflow_executions (id) on delete set null;

create table public.workflow_execution_steps (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.workflow_executions (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  step_id text not null check (char_length(step_id) <= 64),
  step_type text not null check (char_length(step_type) <= 64),
  step_path text not null check (char_length(step_path) <= 300),
  position integer not null check (position >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  input jsonb,
  output jsonb,
  error_message text check (char_length(error_message) <= 2000),
  error_code text check (char_length(error_code) <= 60),
  attempts integer not null default 0 check (attempts between 0 and 10),
  idempotency_key text check (char_length(idempotency_key) <= 300),
  replayed_from_step_id uuid references public.workflow_execution_steps (id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer check (duration_ms >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workflow_execution_steps_execution_idx
  on public.workflow_execution_steps (execution_id, position);
create index workflow_execution_steps_failed_idx
  on public.workflow_execution_steps (workspace_id, step_type) where status = 'failed';
-- A side effect can only be recorded as completed once per idempotency key.
create unique index workflow_execution_steps_side_effect_key
  on public.workflow_execution_steps (workspace_id, idempotency_key)
  where status = 'succeeded' and idempotency_key is not null and replayed_from_step_id is null;

create table public.workflow_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  trigger_type text not null,
  payload jsonb not null default '{}'::jsonb,
  lead_id uuid references public.leads (id) on delete set null,
  idempotency_key text not null check (char_length(idempotency_key) <= 200),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 5),
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text check (char_length(last_error) <= 2000),
  execution_id uuid references public.workflow_executions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_jobs_idempotency_key unique (workspace_id, idempotency_key)
);
create index workflow_jobs_claim_idx on public.workflow_jobs (status, run_after) where status in ('queued', 'processing');
create index workflow_jobs_workspace_idx on public.workflow_jobs (workspace_id, created_at desc);

alter table public.webhook_requests
  add constraint webhook_requests_job_fk
  foreign key (job_id) references public.workflow_jobs (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Templates, integrations, notifications, audit
-- ---------------------------------------------------------------------------
create table public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade, -- null = built-in template
  slug text check (slug ~ '^[a-z0-9-]{2,64}$'),
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 1000),
  category text not null default 'general' check (char_length(category) <= 40),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  is_system boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_templates_system_scope check (is_system = (workspace_id is null))
);
create unique index workflow_templates_system_slug on public.workflow_templates (slug) where is_system;
create index workflow_templates_workspace_idx on public.workflow_templates (workspace_id);

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null check (provider in ('demo_crm', 'demo_email', 'webhooks', 'ai_provider')),
  enabled boolean not null default false,
  -- Non-secret settings only. Real credentials belong in server environment variables.
  config jsonb not null default '{}'::jsonb check (pg_column_size(config) < 8192),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  body text check (char_length(body) <= 2000),
  severity text not null default 'info' check (severity in ('info', 'success', 'warning', 'error')),
  link text check (link ~ '^/dashboard'),
  execution_id uuid references public.workflow_executions (id) on delete set null,
  idempotency_key text check (char_length(idempotency_key) <= 300),
  is_demo boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index notifications_user_idx on public.notifications (user_id, workspace_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id, workspace_id) where read_at is null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (char_length(action) <= 80),
  entity_type text not null check (char_length(entity_type) <= 40),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb check (pg_column_size(metadata) < 8192),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index audit_logs_workspace_idx on public.audit_logs (workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'workspaces', 'workspace_members', 'workflows', 'workflow_versions',
    'webhook_endpoints', 'webhook_requests', 'leads', 'lead_activities', 'workflow_executions',
    'workflow_execution_steps', 'workflow_jobs', 'workflow_templates', 'integrations',
    'notifications', 'audit_logs'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;
