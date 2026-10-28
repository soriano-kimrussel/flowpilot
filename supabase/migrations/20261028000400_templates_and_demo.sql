-- FlowPilot AI: built-in workflow templates + explicit demo-data loader.
-- Templates are product content (not user data) and are installed by this migration.
-- Demo data is NEVER inserted automatically: an owner/admin must call seed_demo_data()
-- (Settings -> Demo data, or `select public.seed_demo_data('<workspace-id>')` in the SQL editor).

create or replace function private.template_definition(p_slug text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_slug
  when 'lead-qualification' then $json$
  {
    "version": 1,
    "trigger": { "type": "lead.created", "config": {} },
    "steps": [
      { "id": "validate", "type": "lead.validate", "name": "Validate lead and detect duplicates",
        "config": { "failOnInvalid": true, "checkDuplicates": true } },
      { "id": "classify", "type": "lead.classify", "name": "Classify lead", "config": { "persist": true } },
      { "id": "score", "type": "lead.score", "name": "Score lead", "config": { "persist": true } },
      { "id": "summarize", "type": "lead.summarize", "name": "Summarize lead", "config": { "persist": true } },
      { "id": "draft", "type": "ai.draft_reply", "name": "Draft personalized follow-up",
        "config": { "tone": "friendly", "senderName": "The FlowPilot team" } },
      { "id": "route", "type": "condition.evaluate", "name": "Is this a hot lead?",
        "config": { "match": "all", "conditions": [ { "field": "steps.score.score", "operator": "gte", "value": 70 } ] },
        "then": [
          { "id": "assign-senior", "type": "lead.update", "name": "Route to senior account executive",
            "config": { "status": "qualified", "assignee": "Senior AE team", "priority": "high" } },
          { "id": "notify-team", "type": "notification.create", "name": "Notify admins",
            "config": { "title": "Hot lead: {{lead.name}}", "message": "{{lead.company}} scored {{steps.score.score}}/100.",
                        "severity": "success", "audience": "admins" } }
        ],
        "else": [
          { "id": "assign-nurture", "type": "lead.update", "name": "Route to nurture queue",
            "config": { "status": "contacted", "assignee": "Nurture queue", "priority": "normal" } }
        ] },
      { "id": "crm-sync", "type": "crm.demo_sync", "name": "Sync to CRM (simulated)",
        "config": { "object": "contact" }, "onError": "continue" },
      { "id": "send-email", "type": "email.demo_send", "name": "Send follow-up (simulated)",
        "config": { "draftStepId": "draft" } },
      { "id": "log", "type": "execution.log", "name": "Log outcome",
        "config": { "message": "Processed {{lead.email}} with score {{steps.score.score}}", "level": "info" } }
    ]
  }
  $json$::jsonb
  when 'webhook-lead-intake' then $json$
  {
    "version": 1,
    "trigger": { "type": "webhook", "config": { "requiredFields": ["name", "email"] } },
    "steps": [
      { "id": "validate", "type": "lead.validate", "name": "Validate submission",
        "config": { "failOnInvalid": true, "checkDuplicates": true } },
      { "id": "create", "type": "lead.create", "name": "Create lead",
        "config": { "source": "webhook", "onDuplicate": "reuse" } },
      { "id": "classify", "type": "lead.classify", "name": "Classify lead", "config": { "persist": true } },
      { "id": "score", "type": "lead.score", "name": "Score lead", "config": { "persist": true } },
      { "id": "draft", "type": "ai.draft_reply", "name": "Draft reply",
        "config": { "tone": "friendly", "senderName": "Sales team" } },
      { "id": "notify", "type": "notification.create", "name": "Notify admins",
        "config": { "title": "New webhook lead: {{lead.name}}",
                    "message": "Score {{steps.score.score}}/100, segment {{steps.classify.segment}}.",
                    "severity": "info", "audience": "admins" } }
    ]
  }
  $json$::jsonb
  when 'qualified-follow-up' then $json$
  {
    "version": 1,
    "trigger": { "type": "lead.status_changed", "config": { "toStatus": "qualified" } },
    "steps": [
      { "id": "summarize", "type": "lead.summarize", "name": "Summarize lead", "config": { "persist": true } },
      { "id": "draft", "type": "ai.draft_reply", "name": "Draft proposal follow-up",
        "config": { "tone": "formal", "senderName": "Account team" } },
      { "id": "send", "type": "email.demo_send", "name": "Send email (simulated)", "config": { "draftStepId": "draft" } },
      { "id": "notify", "type": "notification.create", "name": "Notify workspace",
        "config": { "title": "{{lead.name}} is qualified", "message": "A follow-up draft was prepared and sent to the demo outbox.",
                    "severity": "info", "audience": "all" } }
    ]
  }
  $json$::jsonb
  when 'daily-pipeline-check' then $json$
  {
    "version": 1,
    "trigger": { "type": "schedule", "config": { "interval": "daily" } },
    "steps": [
      { "id": "log", "type": "execution.log", "name": "Record run",
        "config": { "message": "Daily pipeline check ran ({{trigger.payload.scheduled_for}})", "level": "info" } },
      { "id": "notify", "type": "notification.create", "name": "Send digest notification",
        "config": { "title": "Daily pipeline check", "message": "Review new and unassigned leads in FlowPilot.",
                    "severity": "info", "audience": "admins" } }
    ]
  }
  $json$::jsonb
  when 'lead-data-cleanup' then $json$
  {
    "version": 1,
    "trigger": { "type": "manual", "config": {} },
    "steps": [
      { "id": "normalize", "type": "data.transform", "name": "Normalize fields",
        "config": { "operations": [
          { "op": "trim", "target": "vars.company", "from": "lead.company" },
          { "op": "lowercase", "target": "vars.email", "from": "lead.email" },
          { "op": "template", "target": "vars.greeting", "value": "Hi {{lead.name}}" }
        ] } },
      { "id": "has-company", "type": "condition.evaluate", "name": "Company present?",
        "config": { "match": "all", "conditions": [ { "field": "vars.company", "operator": "exists" } ] },
        "then": [ { "id": "classify", "type": "lead.classify", "name": "Classify", "config": { "persist": true } } ],
        "else": [ { "id": "flag", "type": "lead.update", "name": "Flag for review",
                    "config": { "priority": "low", "assignee": "Data quality review" } } ] },
      { "id": "log", "type": "execution.log", "name": "Log result",
        "config": { "message": "Normalized {{vars.email}}", "level": "info" } }
    ]
  }
  $json$::jsonb
  end;
$$;

insert into public.workflow_templates (slug, name, description, category, definition, is_system)
values
  ('lead-qualification', 'Lead qualification pipeline',
   'Validate, de-duplicate, classify, score and summarize every new lead, draft a follow-up, then route hot leads to senior reps.',
   'sales', private.template_definition('lead-qualification'), true),
  ('webhook-lead-intake', 'Webhook lead intake',
   'Accept leads from any website form through an authenticated webhook, create the lead and score it.',
   'intake', private.template_definition('webhook-lead-intake'), true),
  ('qualified-follow-up', 'Qualified lead follow-up',
   'When a lead becomes qualified, summarize it and send a formal follow-up through the simulated outbox.',
   'sales', private.template_definition('qualified-follow-up'), true),
  ('daily-pipeline-check', 'Daily pipeline check',
   'Scheduled daily run that records a log entry and reminds admins to review the pipeline.',
   'operations', private.template_definition('daily-pipeline-check'), true),
  ('lead-data-cleanup', 'Lead data cleanup',
   'Normalize lead fields with safe transforms and flag records with missing company data.',
   'data', private.template_definition('lead-data-cleanup'), true)
on conflict (slug) where is_system do update
  set name = excluded.name, description = excluded.description,
      category = excluded.category, definition = excluded.definition;

-- ---------------------------------------------------------------------------
-- Demo data loader (SECURITY INVOKER: RLS applies to authenticated callers)
-- ---------------------------------------------------------------------------
create or replace function public.seed_demo_data(p_workspace_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_notify_user uuid;
  v_wf uuid;
  v_wf_version uuid;
  v_wf2 uuid;
  v_wf3 uuid;
  v_ver uuid;
  v_leads uuid[];
  v_scores int[];
  v_lead uuid;
  v_score int;
  v_exec uuid;
  v_started timestamptz;
  v_cursor timestamptz;
  v_status text;
  v_fail_step text;
  v_steps text[];
  v_step text;
  v_pos int;
  v_dur int;
  v_total int;
  v_step_status text;
  v_count int := 0;
  i int;
begin
  if v_uid is not null and not private.has_workspace_role(p_workspace_id, array['owner', 'admin']) then
    raise exception 'Only workspace owners and admins can load demo data' using errcode = '42501';
  end if;
  if exists (select 1 from public.leads where workspace_id = p_workspace_id and is_demo) then
    return jsonb_build_object('status', 'already_loaded');
  end if;

  -- Demo inserts must not enqueue real workflow jobs.
  perform set_config('flowpilot.skip_triggers', 'on', true);

  -- Leads ------------------------------------------------------------------
  with inserted as (
    insert into public.leads (workspace_id, name, email, company, job_title, company_size, budget, source,
                              message, status, score, score_details, classification, priority, assignee,
                              ai_summary, is_demo, created_by, created_at, last_activity_at)
    select p_workspace_id, d.name, d.email, d.company, d.title, d.size, d.budget, d.source, d.message,
           d.status, d.score,
           jsonb_build_object('demo', true, 'explanation', 'Seeded demo value. Run a workflow to compute a real rule-based score.'),
           d.classification, d.priority, d.assignee,
           'Seeded demo summary for ' || d.name || ' (' || coalesce(d.company, 'no company') || ').',
           true, v_uid,
           now() - make_interval(days => d.days_ago, hours => d.days_ago * 3 % 11),
           now() - make_interval(days => greatest(d.days_ago - 1, 0))
    from (values
      ('Maya Chen', 'maya.chen@northwind.example', 'Northwind Logistics', 'VP of Operations', 420, 45000, 'referral',
       'We need a demo next week. Looking to automate intake for our 12 regional depots, budget approved.',
       'qualified', 91, 'enterprise', 'high', 'Senior AE team', 1),
      ('Daniel Okafor', 'daniel@brightpath.example', 'BrightPath Clinics', 'Operations Manager', 85, 12000, 'website',
       'Can you share pricing for a team of 20? We want to stop copying form submissions into spreadsheets.',
       'contacted', 72, 'mid_market', 'high', 'Senior AE team', 2),
      ('Sofia Rossi', 'sofia.rossi@gmail.com', null, null, null, null, 'webinar',
       'Interesting webinar, just exploring options for my side project.',
       'new', 18, 'individual', 'low', null, 3),
      ('Liam Novak', 'liam@quarry.example', 'Quarry Studio', 'Founder', 12, 3000, 'website',
       'Small agency, interested in a quote for lead routing automation.',
       'contacted', 58, 'small_business', 'normal', 'Nurture queue', 4),
      ('Aisha Rahman', 'aisha.rahman@helio.example', 'Helio Energy', 'Director of Sales', 260, 30000, 'event',
       'Met your team at the expo. Urgent: we need to replace our current CRM workflow by Q3.',
       'proposal', 88, 'enterprise', 'urgent', 'Senior AE team', 5),
      ('Tom Becker', 'tom.becker@outlook.com', null, 'Student', null, null, 'website',
       'Doing research for a university assignment about automation tools.',
       'lost', 9, 'individual', 'low', null, 6),
      ('Grace Kim', 'grace@lumen.example', 'Lumen Analytics', 'Head of Growth', 64, 8000, 'referral',
       'Referred by Maya at Northwind. Want to book a demo for our growth team.',
       'qualified', 79, 'mid_market', 'high', 'Senior AE team', 7),
      ('Ravi Patel', 'ravi@tandem.example', 'Tandem Foods', 'IT Manager', 140, 5000, 'cold_outreach',
       'Replying to your email. Maybe later this year.',
       'contacted', 44, 'mid_market', 'normal', 'Nurture queue', 8),
      ('Elena Petrova', 'elena@orbit.example', 'Orbit Retail', 'COO', 900, 60000, 'website',
       'Looking to purchase an automation platform for 3 business units. Need security review documents.',
       'won', 95, 'enterprise', 'high', 'Senior AE team', 9),
      ('Marcus Hill', 'marcus.hill@yahoo.com', null, null, null, null, 'social',
       'hi',
       'new', 12, 'individual', 'low', null, 10),
      ('Nora Lindqvist', 'nora@fjord.example', 'Fjord Design', 'Partner', 8, 1500, 'website',
       'Would a partnership with our design agency make sense? We resell tools to clients.',
       'new', 41, 'small_business', 'normal', null, 11),
      ('Kenji Watanabe', 'kenji@kaizen.example', 'Kaizen Manufacturing', 'Plant Director', 1200, 80000, 'event',
       'Need a quote ASAP for automating supplier onboarding across two plants.',
       'qualified', 93, 'enterprise', 'urgent', 'Senior AE team', 12),
      ('Chloe Martin', 'chloe@pixelpine.example', 'PixelPine', 'Marketing Lead', 25, 2500, 'webinar',
       'Can FlowPilot route leads from our webinar platform? Pricing info please.',
       'contacted', 55, 'small_business', 'normal', 'Nurture queue', 13)
    ) as d(name, email, company, title, size, budget, source, message, status, score, classification, priority,
           assignee, days_ago)
    on conflict (workspace_id, email_normalized) do nothing
    returning id, score, created_at, name
  )
  select array_agg(id order by created_at), array_agg(score order by created_at)
  into v_leads, v_scores
  from inserted;

  if v_leads is null then
    return jsonb_build_object('status', 'skipped', 'reason', 'Demo lead emails already exist in this workspace');
  end if;

  insert into public.lead_activities (workspace_id, lead_id, type, description, metadata, actor_id, created_at)
  select l.workspace_id, l.id, 'created', 'Lead created (demo data, source: ' || l.source || ')',
         '{"demo": true}'::jsonb, v_uid, l.created_at
  from public.leads l where l.id = any (v_leads);

  -- Workflows ----------------------------------------------------------------
  insert into public.workflows (workspace_id, name, description, status, trigger_type, is_demo, created_by, updated_by)
  values (p_workspace_id, 'Lead qualification pipeline (demo)',
          'Seeded example: validate, classify, score, draft and route new leads.',
          'active', 'lead.created', true, v_uid, v_uid)
  returning id into v_wf;
  insert into public.workflow_versions (workflow_id, workspace_id, version_number, definition, created_by)
  values (v_wf, p_workspace_id, 1, private.template_definition('lead-qualification'), v_uid)
  returning id into v_wf_version;
  update public.workflows set current_version_id = v_wf_version where id = v_wf;

  insert into public.workflows (workspace_id, name, description, status, trigger_type, is_demo, created_by, updated_by)
  values (p_workspace_id, 'Website form intake (demo)', 'Seeded example webhook workflow. Generate a secret to use it.',
          'inactive', 'webhook', true, v_uid, v_uid)
  returning id into v_wf2;
  insert into public.workflow_versions (workflow_id, workspace_id, version_number, definition, created_by)
  values (v_wf2, p_workspace_id, 1, private.template_definition('webhook-lead-intake'), v_uid)
  returning id into v_ver;
  update public.workflows set current_version_id = v_ver where id = v_wf2;

  insert into public.workflows (workspace_id, name, description, status, trigger_type, is_demo, created_by, updated_by)
  values (p_workspace_id, 'Qualified lead follow-up (demo)', 'Seeded example triggered by lead status changes.',
          'draft', 'lead.status_changed', true, v_uid, v_uid)
  returning id into v_wf3;
  insert into public.workflow_versions (workflow_id, workspace_id, version_number, definition, created_by)
  values (v_wf3, p_workspace_id, 1, private.template_definition('qualified-follow-up'), v_uid)
  returning id into v_ver;
  update public.workflows set current_version_id = v_ver where id = v_wf3;

  -- Execution history ----------------------------------------------------------
  for i in 0..27 loop
    v_lead := v_leads[(i % array_length(v_leads, 1)) + 1];
    v_score := v_scores[(i % array_length(v_scores, 1)) + 1];
    v_started := date_trunc('minute', now()) - make_interval(days => (i * 5) % 14, mins => (i * 37) % 600);
    v_fail_step := null;
    v_status := 'succeeded';

    v_steps := array['validate:lead.validate', 'classify:lead.classify', 'score:lead.score',
                     'summarize:lead.summarize', 'draft:ai.draft_reply', 'route:condition.evaluate'];
    if v_score >= 70 then
      v_steps := v_steps || array['assign-senior:lead.update', 'notify-team:notification.create'];
    else
      v_steps := v_steps || array['assign-nurture:lead.update'];
    end if;
    v_steps := v_steps || array['crm-sync:crm.demo_sync', 'send-email:email.demo_send', 'log:execution.log'];

    if i % 7 = 3 then
      v_status := 'failed';
      v_fail_step := 'validate';
    elsif i % 9 = 4 then
      v_fail_step := 'crm-sync'; -- onError=continue: step fails, execution still succeeds
    end if;

    insert into public.workflow_executions (workspace_id, workflow_id, workflow_version_id, status, trigger_type,
                                            trigger_payload, lead_id, idempotency_key, attempt, started_at,
                                            is_demo, created_by, created_at)
    values (p_workspace_id, v_wf, v_wf_version, 'running', 'lead.created',
            jsonb_build_object('lead_id', v_lead), v_lead, 'demo-seed-' || i, 1, v_started,
            true, v_uid, v_started)
    returning id into v_exec;

    v_cursor := v_started;
    v_pos := 0;
    v_total := 0;
    foreach v_step in array v_steps loop
      v_dur := 15 + ((i * 13 + v_pos * 29) % 140);
      v_step_status := case when split_part(v_step, ':', 1) = v_fail_step then 'failed' else 'succeeded' end;

      insert into public.workflow_execution_steps (execution_id, workspace_id, step_id, step_type, step_path, position,
                                                   status, input, output, error_message, error_code, attempts,
                                                   started_at, finished_at, duration_ms, created_at)
      values (
        v_exec, p_workspace_id, split_part(v_step, ':', 1), split_part(v_step, ':', 2),
        split_part(v_step, ':', 1), v_pos, v_step_status,
        jsonb_build_object('demo', true),
        case when v_step_status = 'succeeded' then
          case split_part(v_step, ':', 2)
            when 'lead.score' then jsonb_build_object('demo', true, 'score', v_score)
            when 'condition.evaluate' then jsonb_build_object('demo', true, 'result', v_score >= 70)
            else jsonb_build_object('demo', true, 'note', 'Seeded demo output')
          end
        end,
        case when v_step_status = 'failed' then
          case split_part(v_step, ':', 1)
            when 'validate' then 'Lead failed validation: message is too short to qualify (demo data)'
            else 'Demo CRM integration is disabled. Enable it under Integrations (demo data)'
          end
        end,
        case when v_step_status = 'failed' then
          case split_part(v_step, ':', 1) when 'validate' then 'VALIDATION_FAILED' else 'INTEGRATION_DISABLED' end
        end,
        1, v_cursor, v_cursor + make_interval(secs => v_dur / 1000.0), v_dur, v_cursor
      );

      v_cursor := v_cursor + make_interval(secs => v_dur / 1000.0);
      v_total := v_total + v_dur;
      v_pos := v_pos + 1;
      exit when v_status = 'failed' and split_part(v_step, ':', 1) = v_fail_step;
    end loop;

    update public.workflow_executions
    set status = v_status,
        finished_at = v_cursor,
        duration_ms = v_total,
        error_message = case when v_status = 'failed'
                             then 'Step "validate" failed: Lead failed validation: message is too short to qualify (demo data)' end,
        error_code = case when v_status = 'failed' then 'VALIDATION_FAILED' end,
        error_step_id = case when v_status = 'failed' then v_fail_step end
    where id = v_exec;

    v_count := v_count + 1;
  end loop;

  -- Notifications for the caller (or the owner when run from the SQL editor) -------
  v_notify_user := coalesce(v_uid, (
    select user_id from public.workspace_members
    where workspace_id = p_workspace_id and role = 'owner' limit 1
  ));
  if v_notify_user is not null then
    insert into public.notifications (workspace_id, user_id, title, body, severity, link, is_demo, created_at)
    values
      (p_workspace_id, v_notify_user, 'Demo data loaded',
       '13 leads, 3 workflows and 28 executions were added. Everything is labeled as demo data.',
       'info', '/dashboard', true, now()),
      (p_workspace_id, v_notify_user, 'Hot lead: Kenji Watanabe',
       'Kaizen Manufacturing scored 93/100 (demo data).', 'success', '/dashboard/leads', true, now() - interval '2 hours'),
      (p_workspace_id, v_notify_user, 'Workflow step failed',
       'Validation failed for a demo execution. Open Executions to inspect the error.', 'error',
       '/dashboard/executions?status=failed', true, now() - interval '1 day');
  end if;

  return jsonb_build_object('status', 'loaded', 'leads', array_length(v_leads, 1), 'executions', v_count);
end;
$$;

create or replace function public.clear_demo_data(p_workspace_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workflows int;
  v_leads int;
begin
  if auth.uid() is not null and not private.has_workspace_role(p_workspace_id, array['owner', 'admin']) then
    raise exception 'Only workspace owners and admins can remove demo data' using errcode = '42501';
  end if;

  delete from public.notifications where workspace_id = p_workspace_id and is_demo;
  delete from public.workflows where workspace_id = p_workspace_id and is_demo;
  get diagnostics v_workflows = row_count;
  delete from public.leads where workspace_id = p_workspace_id and is_demo;
  get diagnostics v_leads = row_count;

  return jsonb_build_object('status', 'cleared', 'workflows', v_workflows, 'leads', v_leads);
end;
$$;

revoke execute on function public.seed_demo_data(uuid) from public, anon;
revoke execute on function public.clear_demo_data(uuid) from public, anon;
grant execute on function public.seed_demo_data(uuid) to authenticated, service_role;
grant execute on function public.clear_demo_data(uuid) to authenticated, service_role;
revoke execute on function private.template_definition(text) from public, anon;
grant execute on function private.template_definition(text) to authenticated, service_role;
