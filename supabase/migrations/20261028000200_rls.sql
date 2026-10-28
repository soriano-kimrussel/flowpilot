-- FlowPilot AI: Row Level Security
-- Principle: every tenant-owned row is visible only to members of its workspace; writes are
-- further restricted by role. Helper functions live in a schema that is NOT exposed via the API.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- SECURITY DEFINER avoids recursive RLS evaluation on workspace_members.
create or replace function private.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.has_workspace_role(p_workspace_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;

create or replace function private.shares_workspace_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
  );
$$;

revoke all on function private.is_workspace_member(uuid) from public, anon;
revoke all on function private.has_workspace_role(uuid, text[]) from public, anon;
revoke all on function private.shares_workspace_with(uuid) from public, anon;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.has_workspace_role(uuid, text[]) to authenticated;
grant execute on function private.shares_workspace_with(uuid) to authenticated;

-- Tenant rows must never move between workspaces.
create or replace function private.prevent_workspace_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'workspace_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'workspace_members', 'workflows', 'workflow_versions', 'webhook_endpoints', 'leads',
    'lead_activities', 'workflow_executions', 'workflow_execution_steps', 'workflow_jobs',
    'workflow_templates', 'integrations', 'notifications', 'audit_logs'
  ] loop
    execute format(
      'create trigger prevent_workspace_change before update on public.%I for each row execute function private.prevent_workspace_change()',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workflows enable row level security;
alter table public.workflow_versions enable row level security;
alter table public.webhook_endpoints enable row level security;
alter table public.webhook_requests enable row level security;
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;
alter table public.workflow_executions enable row level security;
alter table public.workflow_execution_steps enable row level security;
alter table public.workflow_jobs enable row level security;
alter table public.workflow_templates enable row level security;
alter table public.integrations enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

-- Anonymous visitors have no direct table access at all.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy "profiles: read self and teammates" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_workspace_with(id));

create policy "profiles: update self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Users may only change their display name and default workspace.
revoke update on public.profiles from authenticated;
grant update (full_name, default_workspace_id) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- workspaces & membership
-- ---------------------------------------------------------------------------
create policy "workspaces: members read" on public.workspaces
  for select to authenticated
  using (private.is_workspace_member(id));

create policy "workspaces: owners/admins update" on public.workspaces
  for update to authenticated
  using (private.has_workspace_role(id, array['owner', 'admin']))
  with check (private.has_workspace_role(id, array['owner', 'admin']));

create policy "workspaces: owners delete" on public.workspaces
  for delete to authenticated
  using (private.has_workspace_role(id, array['owner']));

revoke update on public.workspaces from authenticated;
grant update (name) on public.workspaces to authenticated;

create policy "members: read own workspaces" on public.workspace_members
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

-- Membership inserts and role changes go through SECURITY DEFINER functions that enforce rules.
create policy "members: admins remove non-owners, users leave" on public.workspace_members
  for delete to authenticated
  using (
    role <> 'owner'
    and (
      user_id = (select auth.uid())
      or private.has_workspace_role(workspace_id, array['owner', 'admin'])
    )
  );

-- ---------------------------------------------------------------------------
-- workflows & versions
-- ---------------------------------------------------------------------------
create policy "workflows: members read" on public.workflows
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy "workflows: admins insert" on public.workflows
  for insert to authenticated
  with check (
    private.has_workspace_role(workspace_id, array['owner', 'admin'])
    and (created_by is null or created_by = (select auth.uid()))
  );

create policy "workflows: admins update" on public.workflows
  for update to authenticated
  using (private.has_workspace_role(workspace_id, array['owner', 'admin']))
  with check (private.has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "workflows: admins delete" on public.workflows
  for delete to authenticated
  using (private.has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "workflow_versions: members read" on public.workflow_versions
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy "workflow_versions: admins insert" on public.workflow_versions
  for insert to authenticated
  with check (
    private.has_workspace_role(workspace_id, array['owner', 'admin'])
    and exists (
      select 1 from public.workflows w
      where w.id = workflow_id and w.workspace_id = workflow_versions.workspace_id
    )
  );
-- Versions are immutable: no update/delete policies.

-- ---------------------------------------------------------------------------
-- webhook endpoints (admins only; members never see secret hashes)
-- ---------------------------------------------------------------------------
create policy "webhook_endpoints: admins read" on public.webhook_endpoints
  for select to authenticated
  using (private.has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "webhook_endpoints: admins insert" on public.webhook_endpoints
  for insert to authenticated
  with check (
    private.has_workspace_role(workspace_id, array['owner', 'admin'])
    and exists (
      select 1 from public.workflows w
      where w.id = workflow_id and w.workspace_id = webhook_endpoints.workspace_id
    )
  );

create policy "webhook_endpoints: admins update" on public.webhook_endpoints
  for update to authenticated
  using (private.has_workspace_role(workspace_id, array['owner', 'admin']))
  with check (private.has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "webhook_endpoints: admins delete" on public.webhook_endpoints
  for delete to authenticated
  using (private.has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "webhook_requests: admins read" on public.webhook_requests
  for select to authenticated
  using (private.has_workspace_role(workspace_id, array['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- leads & activities
-- ---------------------------------------------------------------------------
create policy "leads: members read" on public.leads
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy "leads: members insert" on public.leads
  for insert to authenticated
  with check (
    private.is_workspace_member(workspace_id)
    and (created_by is null or created_by = (select auth.uid()))
  );

create policy "leads: members update" on public.leads
  for update to authenticated
  using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));

create policy "leads: admins delete" on public.leads
  for delete to authenticated
  using (private.has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "lead_activities: members read" on public.lead_activities
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy "lead_activities: members insert" on public.lead_activities
  for insert to authenticated
  with check (
    private.is_workspace_member(workspace_id)
    and (actor_id is null or actor_id = (select auth.uid()))
    and exists (
      select 1 from public.leads l
      where l.id = lead_id and l.workspace_id = lead_activities.workspace_id
    )
  );
-- Activity history is append-only.

-- ---------------------------------------------------------------------------
-- executions, steps, jobs
-- Members may run workflows, so they can create execution records. Once an execution or step
-- reaches a terminal state it becomes immutable (update policies only match non-terminal rows).
-- ---------------------------------------------------------------------------
create policy "executions: members read" on public.workflow_executions
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy "executions: members insert" on public.workflow_executions
  for insert to authenticated
  with check (
    private.is_workspace_member(workspace_id)
    and (created_by is null or created_by = (select auth.uid()))
    and exists (
      select 1 from public.workflows w
      where w.id = workflow_id and w.workspace_id = workflow_executions.workspace_id
    )
    and exists (
      select 1 from public.workflow_versions v
      where v.id = workflow_version_id and v.workflow_id = workflow_executions.workflow_id
    )
  );

create policy "executions: members update non-terminal" on public.workflow_executions
  for update to authenticated
  using (private.is_workspace_member(workspace_id) and status in ('pending', 'running'))
  with check (private.is_workspace_member(workspace_id));

create policy "steps: members read" on public.workflow_execution_steps
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy "steps: members insert" on public.workflow_execution_steps
  for insert to authenticated
  with check (
    private.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.workflow_executions e
      where e.id = execution_id
        and e.workspace_id = workflow_execution_steps.workspace_id
        and e.status in ('pending', 'running')
    )
  );

create policy "steps: members update non-terminal" on public.workflow_execution_steps
  for update to authenticated
  using (private.is_workspace_member(workspace_id) and status in ('pending', 'running'))
  with check (private.is_workspace_member(workspace_id));

create policy "jobs: members read" on public.workflow_jobs
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy "jobs: members insert" on public.workflow_jobs
  for insert to authenticated
  with check (
    private.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.workflows w
      where w.id = workflow_id and w.workspace_id = workflow_jobs.workspace_id
    )
  );

create policy "jobs: members update active" on public.workflow_jobs
  for update to authenticated
  using (private.is_workspace_member(workspace_id) and status in ('queued', 'processing'))
  with check (private.is_workspace_member(workspace_id));

create policy "jobs: admins cancel/delete" on public.workflow_jobs
  for delete to authenticated
  using (private.has_workspace_role(workspace_id, array['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- templates
-- ---------------------------------------------------------------------------
create policy "templates: read system and own workspace" on public.workflow_templates
  for select to authenticated
  using (is_system or private.is_workspace_member(workspace_id));

create policy "templates: admins insert" on public.workflow_templates
  for insert to authenticated
  with check (
    not is_system
    and workspace_id is not null
    and private.has_workspace_role(workspace_id, array['owner', 'admin'])
  );

create policy "templates: admins update" on public.workflow_templates
  for update to authenticated
  using (not is_system and private.has_workspace_role(workspace_id, array['owner', 'admin']))
  with check (not is_system and private.has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "templates: admins delete" on public.workflow_templates
  for delete to authenticated
  using (not is_system and private.has_workspace_role(workspace_id, array['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- integrations
-- ---------------------------------------------------------------------------
create policy "integrations: members read" on public.integrations
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy "integrations: admins insert" on public.integrations
  for insert to authenticated
  with check (private.has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "integrations: admins update" on public.integrations
  for update to authenticated
  using (private.has_workspace_role(workspace_id, array['owner', 'admin']))
  with check (private.has_workspace_role(workspace_id, array['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- notifications (each user sees only their own)
-- ---------------------------------------------------------------------------
create policy "notifications: read own" on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()) and private.is_workspace_member(workspace_id));

create policy "notifications: members notify teammates" on public.notifications
  for insert to authenticated
  with check (
    private.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.workspace_members m
      where m.workspace_id = notifications.workspace_id and m.user_id = notifications.user_id
    )
  );

create policy "notifications: update own" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "notifications: delete own" on public.notifications
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- audit logs (append-only, admins read)
-- ---------------------------------------------------------------------------
create policy "audit: admins read" on public.audit_logs
  for select to authenticated
  using (private.has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "audit: members append as themselves" on public.audit_logs
  for insert to authenticated
  with check (
    private.is_workspace_member(workspace_id)
    and actor_id = (select auth.uid())
  );
