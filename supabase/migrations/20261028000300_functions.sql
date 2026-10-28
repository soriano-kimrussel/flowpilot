-- FlowPilot AI: database functions
-- Functions exist only where they add a security or consistency guarantee:
--  * signup bootstrap (atomic profile + workspace + owner membership)
--  * workflow versioning (row lock + sequential version numbers)
--  * webhook ingestion (secret check, rate limit, idempotency without exposing tables to anon)
--  * job claiming (FOR UPDATE SKIP LOCKED)
--  * lead event triggers (enqueue jobs in the same transaction as the lead write)
--  * membership management (role rules)
--  * dashboard metrics (aggregates in one round trip)

-- ---------------------------------------------------------------------------
-- Signup bootstrap
-- ---------------------------------------------------------------------------
create or replace function private.create_default_integrations(p_workspace_id uuid, p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.integrations (workspace_id, provider, enabled, config, created_by, updated_by)
  values
    (p_workspace_id, 'demo_crm', true, '{"label": "Demo CRM (simulated)"}'::jsonb, p_user_id, p_user_id),
    (p_workspace_id, 'demo_email', true, '{"label": "Demo email outbox (simulated)"}'::jsonb, p_user_id, p_user_id),
    (p_workspace_id, 'webhooks', true, '{}'::jsonb, p_user_id, p_user_id),
    (p_workspace_id, 'ai_provider', true, '{}'::jsonb, p_user_id, p_user_id)
  on conflict (workspace_id, provider) do nothing;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_full_name text;
  v_workspace_name text;
begin
  v_full_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  v_workspace_name := coalesce(
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'workspace_name', '')), ''),
    coalesce(v_full_name, split_part(coalesce(new.email, 'my'), '@', 1)) || '''s workspace'
  );

  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), left(v_full_name, 120));

  insert into public.workspaces (name, slug, created_by)
  values (
    left(v_workspace_name, 80),
    'ws-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
    new.id
  )
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, new.id, 'owner');

  update public.profiles set default_workspace_id = v_workspace_id where id = new.id;

  perform private.create_default_integrations(v_workspace_id, new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.handle_user_email_change();

-- Additional workspaces (the caller becomes owner).
create or replace function public.create_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_workspace_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'Workspace name must be 1-80 characters' using errcode = '22023';
  end if;
  if (select count(*) from public.workspace_members where user_id = v_uid and role = 'owner') >= 5 then
    raise exception 'You can own at most 5 workspaces on the demo plan' using errcode = '54000';
  end if;

  insert into public.workspaces (name, slug, created_by)
  values (btrim(p_name), 'ws-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16), v_uid)
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, v_uid, 'owner');

  perform private.create_default_integrations(v_workspace_id, v_uid);

  insert into public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id)
  values (v_workspace_id, v_uid, 'workspace.created', 'workspace', v_workspace_id);

  return v_workspace_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Membership management
-- ---------------------------------------------------------------------------
create or replace function public.add_workspace_member(p_workspace_id uuid, p_email text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_member_id uuid;
begin
  if not private.has_workspace_role(p_workspace_id, array['owner', 'admin']) then
    raise exception 'Only owners and admins can add members' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'Role must be admin or member' using errcode = '22023';
  end if;
  if p_role = 'admin' and not private.has_workspace_role(p_workspace_id, array['owner']) then
    raise exception 'Only owners can add admins' using errcode = '42501';
  end if;

  select id into v_target from public.profiles where lower(email) = lower(btrim(p_email));
  if v_target is null then
    raise exception 'No FlowPilot account uses that email. Ask the person to register first.'
      using errcode = 'P0002';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (p_workspace_id, v_target, p_role)
  on conflict (workspace_id, user_id) do nothing
  returning id into v_member_id;

  if v_member_id is null then
    raise exception 'That user is already a member of this workspace' using errcode = '23505';
  end if;

  insert into public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_workspace_id, v_uid, 'member.added', 'workspace_member', v_member_id,
          jsonb_build_object('role', p_role));

  return v_member_id;
end;
$$;

create or replace function public.update_member_role(p_member_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.workspace_members;
begin
  select * into v_member from public.workspace_members where id = p_member_id;
  if v_member.id is null
     or not private.has_workspace_role(v_member.workspace_id, array['owner', 'admin']) then
    raise exception 'Member not found or not allowed' using errcode = '42501';
  end if;
  if v_member.role = 'owner' then
    raise exception 'The owner role cannot be changed' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'Role must be admin or member' using errcode = '22023';
  end if;
  if (p_role = 'admin' or v_member.role = 'admin')
     and not private.has_workspace_role(v_member.workspace_id, array['owner']) then
    raise exception 'Only owners can grant or revoke admin' using errcode = '42501';
  end if;

  update public.workspace_members set role = p_role where id = p_member_id;

  insert into public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_member.workspace_id, auth.uid(), 'member.role_changed', 'workspace_member', p_member_id,
          jsonb_build_object('from', v_member.role, 'to', p_role));
end;
$$;

-- ---------------------------------------------------------------------------
-- Workflow versioning (SECURITY INVOKER: RLS still applies)
-- ---------------------------------------------------------------------------
create or replace function public.create_workflow_version(p_workflow_id uuid, p_definition jsonb)
returns public.workflow_versions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workflow public.workflows;
  v_next integer;
  v_version public.workflow_versions;
  v_trigger text;
  v_interval text;
begin
  -- Row lock serializes concurrent saves; RLS hides rows the caller cannot update.
  select * into v_workflow from public.workflows where id = p_workflow_id for update;
  if v_workflow.id is null then
    raise exception 'Workflow not found or you do not have permission to edit it' using errcode = 'P0002';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next
  from public.workflow_versions where workflow_id = p_workflow_id;

  insert into public.workflow_versions (workflow_id, workspace_id, version_number, definition, created_by)
  values (p_workflow_id, v_workflow.workspace_id, v_next, p_definition, auth.uid())
  returning * into v_version;

  v_trigger := p_definition -> 'trigger' ->> 'type';
  v_interval := case when v_trigger = 'schedule'
                     then coalesce(p_definition -> 'trigger' -> 'config' ->> 'interval', 'daily') end;

  update public.workflows
  set current_version_id = v_version.id,
      trigger_type = v_trigger,
      schedule_interval = v_interval,
      next_run_at = case
        when v_trigger <> 'schedule' then null
        when v_workflow.schedule_interval is not distinct from v_interval and v_workflow.next_run_at is not null
          then v_workflow.next_run_at
        when v_interval = 'hourly' then date_trunc('hour', now()) + interval '1 hour'
        else date_trunc('day', now()) + interval '1 day'
      end,
      updated_by = coalesce(auth.uid(), updated_by)
  where id = p_workflow_id;

  return v_version;
end;
$$;

-- ---------------------------------------------------------------------------
-- Webhook ingestion
-- Called by the Next.js route with the publishable key (anon role). The route hashes the
-- presented secret with SHA-256; only hashes are compared and stored.
-- ---------------------------------------------------------------------------
create or replace function public.ingest_webhook(
  p_public_id text,
  p_secret_hash text,
  p_payload jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_endpoint public.webhook_endpoints;
  v_workflow public.workflows;
  v_definition jsonb;
  v_missing text;
  v_minute_count integer;
  v_day_count integer;
  v_key text;
  v_request_id uuid;
  v_job_id uuid;
begin
  if p_public_id is null or p_secret_hash is null or char_length(p_secret_hash) <> 64 then
    return jsonb_build_object('status', 'unauthorized');
  end if;

  -- Lock the endpoint row so rate-limit counting is serialized per endpoint.
  select * into v_endpoint from public.webhook_endpoints
  where public_id = p_public_id and revoked_at is null
  for update;

  if v_endpoint.id is null or v_endpoint.secret_hash <> lower(p_secret_hash) then
    return jsonb_build_object('status', 'unauthorized');
  end if;

  select * into v_workflow from public.workflows where id = v_endpoint.workflow_id;
  if v_workflow.status <> 'active' or v_workflow.trigger_type <> 'webhook'
     or v_workflow.current_version_id is null then
    return jsonb_build_object('status', 'inactive');
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or pg_column_size(p_payload) > 32768 then
    return jsonb_build_object('status', 'invalid_payload', 'message', 'Payload must be a JSON object under 32 KB');
  end if;

  select definition into v_definition from public.workflow_versions where id = v_workflow.current_version_id;
  select f into v_missing
  from jsonb_array_elements_text(coalesce(v_definition -> 'trigger' -> 'config' -> 'requiredFields', '[]'::jsonb)) as f
  where not (p_payload ? f) or nullif(btrim(p_payload ->> f), '') is null
  limit 1;
  if v_missing is not null then
    return jsonb_build_object('status', 'invalid_payload', 'message', 'Missing required field: ' || left(v_missing, 64));
  end if;

  select count(*) filter (where received_at > now() - interval '1 minute'),
         count(*)
  into v_minute_count, v_day_count
  from public.webhook_requests
  where endpoint_id = v_endpoint.id and received_at > now() - interval '1 day';

  if v_minute_count >= 30 or v_day_count >= 1000 then
    return jsonb_build_object('status', 'rate_limited', 'retry_after', case when v_minute_count >= 30 then 60 else 3600 end);
  end if;

  v_key := coalesce(
    nullif(btrim(left(p_idempotency_key, 200)), ''),
    'payload-' || encode(extensions.digest(p_payload::text, 'sha256'), 'hex')
  );

  insert into public.webhook_requests (endpoint_id, workspace_id, idempotency_key)
  values (v_endpoint.id, v_endpoint.workspace_id, v_key)
  on conflict (endpoint_id, idempotency_key) do nothing
  returning id into v_request_id;

  if v_request_id is null then
    select job_id into v_job_id from public.webhook_requests
    where endpoint_id = v_endpoint.id and idempotency_key = v_key;
    return jsonb_build_object('status', 'duplicate', 'job_id', v_job_id);
  end if;

  insert into public.workflow_jobs (workspace_id, workflow_id, trigger_type, payload, idempotency_key)
  values (
    v_endpoint.workspace_id, v_workflow.id, 'webhook', p_payload,
    'webhook:' || v_endpoint.id || ':' || encode(extensions.digest(v_key, 'sha256'), 'hex')
  )
  on conflict (workspace_id, idempotency_key) do nothing
  returning id into v_job_id;

  update public.webhook_requests set job_id = v_job_id where id = v_request_id;
  update public.webhook_endpoints set last_used_at = now() where id = v_endpoint.id;

  return jsonb_build_object('status', 'accepted', 'job_id', v_job_id, 'workspace_id', v_endpoint.workspace_id);
end;
$$;

revoke all on function public.ingest_webhook(text, text, jsonb, text) from public;
grant execute on function public.ingest_webhook(text, text, jsonb, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Job queue
-- ---------------------------------------------------------------------------
create or replace function public.claim_workflow_jobs(
  p_workspace_id uuid,
  p_limit integer default 5,
  p_worker text default 'worker'
)
returns setof public.workflow_jobs
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is not null and p_workspace_id is null then
    raise exception 'workspace id is required' using errcode = '22023';
  end if;

  -- Jobs that exhausted their attempts (including ones abandoned mid-processing) are failed.
  update public.workflow_jobs
  set status = 'failed',
      locked_at = null,
      last_error = coalesce(last_error, 'Job exceeded its maximum number of attempts')
  where (p_workspace_id is null or workspace_id = p_workspace_id)
    and attempts >= max_attempts
    and (status = 'queued' or (status = 'processing' and locked_at < now() - interval '5 minutes'));

  return query
  update public.workflow_jobs j
  set status = 'processing',
      locked_at = now(),
      locked_by = left(p_worker, 100),
      attempts = j.attempts + 1
  where j.id in (
    select q.id from public.workflow_jobs q
    where (p_workspace_id is null or q.workspace_id = p_workspace_id)
      and q.attempts < q.max_attempts
      and (
        (q.status = 'queued' and q.run_after <= now())
        or (q.status = 'processing' and q.locked_at < now() - interval '5 minutes')
      )
    order by q.run_after
    limit least(greatest(coalesce(p_limit, 5), 1), 20)
    for update skip locked
  )
  returning j.*;
end;
$$;

create or replace function public.enqueue_due_scheduled_workflows(p_workspace_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_rows integer;
  r record;
begin
  if auth.uid() is not null then
    if p_workspace_id is null or not private.is_workspace_member(p_workspace_id) then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
  end if;

  for r in
    select w.id, w.workspace_id, w.next_run_at, w.schedule_interval
    from public.workflows w
    where w.status = 'active' and w.trigger_type = 'schedule' and w.current_version_id is not null
      and w.next_run_at <= now()
      and (p_workspace_id is null or w.workspace_id = p_workspace_id)
    for update skip locked
  loop
    insert into public.workflow_jobs (workspace_id, workflow_id, trigger_type, payload, idempotency_key)
    values (
      r.workspace_id, r.id, 'schedule',
      jsonb_build_object('scheduled_for', r.next_run_at),
      'schedule:' || r.id || ':' || extract(epoch from r.next_run_at)::bigint
    )
    on conflict (workspace_id, idempotency_key) do nothing;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;

    update public.workflows
    set next_run_at = case when r.schedule_interval = 'hourly'
                           then date_trunc('hour', now()) + interval '1 hour'
                           else date_trunc('day', now()) + interval '1 day' end
    where id = r.id;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lead event triggers -> workflow jobs
-- Writes performed by a workflow execution set created_by_execution_id /
-- last_changed_by_execution_id and do NOT enqueue further jobs (prevents loops).
-- ---------------------------------------------------------------------------
create or replace function private.enqueue_lead_jobs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('flowpilot.skip_triggers', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.created_by_execution_id is not null then
      return new;
    end if;
    insert into public.workflow_jobs (workspace_id, workflow_id, trigger_type, payload, lead_id, idempotency_key)
    select new.workspace_id, w.id, 'lead.created', jsonb_build_object('lead_id', new.id), new.id,
           'lead.created:' || new.id || ':' || w.id
    from public.workflows w
    where w.workspace_id = new.workspace_id and w.status = 'active'
      and w.trigger_type = 'lead.created' and w.current_version_id is not null
    on conflict (workspace_id, idempotency_key) do nothing;
  elsif tg_op = 'UPDATE' then
    if new.status is not distinct from old.status or new.last_changed_by_execution_id is not null then
      return new;
    end if;
    insert into public.workflow_jobs (workspace_id, workflow_id, trigger_type, payload, lead_id, idempotency_key)
    select new.workspace_id, w.id, 'lead.status_changed',
           jsonb_build_object('lead_id', new.id, 'from_status', old.status, 'to_status', new.status),
           new.id,
           'lead.status:' || new.id || ':' || w.id || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint
    from public.workflows w
    join public.workflow_versions v on v.id = w.current_version_id
    where w.workspace_id = new.workspace_id and w.status = 'active'
      and w.trigger_type = 'lead.status_changed'
      and coalesce(v.definition -> 'trigger' -> 'config' ->> 'toStatus', '') in ('', new.status)
    on conflict (workspace_id, idempotency_key) do nothing;
  end if;

  return new;
end;
$$;

create trigger enqueue_lead_jobs
  after insert or update of status on public.leads
  for each row execute function private.enqueue_lead_jobs();

-- ---------------------------------------------------------------------------
-- Dashboard metrics (SECURITY INVOKER: RLS limits rows to the caller's workspaces)
-- ---------------------------------------------------------------------------
create or replace function public.get_dashboard_metrics(
  p_workspace_id uuid,
  p_days integer default 14,
  p_include_demo boolean default true
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select least(greatest(coalesce(p_days, 14), 1), 90) as days,
           date_trunc('day', now()) - make_interval(days => least(greatest(coalesce(p_days, 14), 1), 90) - 1) as since
  ),
  execs as (
    select e.* from public.workflow_executions e, bounds b
    where e.workspace_id = p_workspace_id and e.created_at >= b.since
      and (p_include_demo or not e.is_demo)
  )
  select jsonb_build_object(
    'period_days', (select days from bounds),
    'workflows', (
      select jsonb_build_object('total', count(*), 'active', count(*) filter (where status = 'active'))
      from public.workflows
      where workspace_id = p_workspace_id and status <> 'archived' and (p_include_demo or not is_demo)
    ),
    'executions', (
      select jsonb_build_object(
        'total', count(*),
        'succeeded', count(*) filter (where status = 'succeeded'),
        'failed', count(*) filter (where status = 'failed'),
        'in_progress', count(*) filter (where status in ('pending', 'running')),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'avg_duration_ms', coalesce(round(avg(duration_ms) filter (where status = 'succeeded')), 0)
      )
      from execs
    ),
    'leads', (
      select jsonb_build_object(
        'total', count(*) filter (where archived_at is null),
        'created_in_period', count(*) filter (where created_at >= (select since from bounds)),
        'avg_score', coalesce(round(avg(score) filter (where archived_at is null)), 0)
      )
      from public.leads
      where workspace_id = p_workspace_id and (p_include_demo or not is_demo)
    ),
    'leads_by_status', (
      select coalesce(jsonb_object_agg(status, c), '{}'::jsonb)
      from (
        select status, count(*) as c from public.leads
        where workspace_id = p_workspace_id and archived_at is null and (p_include_demo or not is_demo)
        group by status
      ) s
    ),
    'volume', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', to_char(d.day, 'YYYY-MM-DD'),
        'succeeded', coalesce(x.succeeded, 0),
        'failed', coalesce(x.failed, 0),
        'other', coalesce(x.other, 0)
      ) order by d.day), '[]'::jsonb)
      from bounds b
      cross join lateral generate_series(b.since, date_trunc('day', now()), interval '1 day') as d(day)
      left join lateral (
        select count(*) filter (where status = 'succeeded') as succeeded,
               count(*) filter (where status = 'failed') as failed,
               count(*) filter (where status not in ('succeeded', 'failed')) as other
        from execs e
        where e.created_at >= d.day and e.created_at < d.day + interval '1 day'
      ) x on true
    ),
    'failing_actions', (
      select coalesce(jsonb_agg(jsonb_build_object('step_type', step_type, 'failures', c) order by c desc), '[]'::jsonb)
      from (
        select s.step_type, count(*) as c
        from public.workflow_execution_steps s
        join execs e on e.id = s.execution_id
        where s.workspace_id = p_workspace_id and s.status = 'failed'
        group by s.step_type
        order by c desc
        limit 5
      ) f
    ),
    'has_demo_data', exists (select 1 from public.leads where workspace_id = p_workspace_id and is_demo)
  );
$$;

-- Lock down function execution: authenticated only (ingest_webhook is granted above).
revoke execute on function public.create_workspace(text) from public, anon;
revoke execute on function public.add_workspace_member(uuid, text, text) from public, anon;
revoke execute on function public.update_member_role(uuid, text) from public, anon;
revoke execute on function public.create_workflow_version(uuid, jsonb) from public, anon;
revoke execute on function public.claim_workflow_jobs(uuid, integer, text) from public, anon;
revoke execute on function public.enqueue_due_scheduled_workflows(uuid) from public, anon;
revoke execute on function public.get_dashboard_metrics(uuid, integer, boolean) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.add_workspace_member(uuid, text, text) to authenticated;
grant execute on function public.update_member_role(uuid, text) to authenticated;
grant execute on function public.create_workflow_version(uuid, jsonb) to authenticated, service_role;
grant execute on function public.claim_workflow_jobs(uuid, integer, text) to authenticated, service_role;
grant execute on function public.enqueue_due_scheduled_workflows(uuid) to authenticated, service_role;
grant execute on function public.get_dashboard_metrics(uuid, integer, boolean) to authenticated;
