-- Hardening found in review: column-level lead updates, function privileges, FK indexes.

-- ---------------------------------------------------------------------------
-- Leads: members must not flip is_demo (clear_demo_data would then delete real leads) or
-- rewrite who/what created a lead. last_changed_by_execution_id stays writable because the
-- workflow engine runs with the member's session and sets it as a loop guard.
-- ---------------------------------------------------------------------------
revoke update on public.leads from authenticated;
grant update (
  name, email, company, job_title, phone, company_size, budget, source, message, notes,
  status, score, score_details, classification, classification_details, ai_summary,
  assignee, priority, last_activity_at, archived_at, last_changed_by_execution_id,
  updated_by, updated_at
) on public.leads to authenticated;

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER helper that inserts into any workspace: callable only by other definer
-- functions (handle_new_user, create_workspace), never directly.
-- ---------------------------------------------------------------------------
revoke all on function private.create_default_integrations(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Indexes on foreign keys used by RLS, cascades and NO ACTION checks.
-- ---------------------------------------------------------------------------
create index if not exists workflow_executions_version_idx
  on public.workflow_executions (workflow_version_id);
create index if not exists workflow_executions_retry_of_idx
  on public.workflow_executions (retry_of_id);
create index if not exists workflow_jobs_workflow_idx on public.workflow_jobs (workflow_id);
create index if not exists workflow_versions_workspace_idx on public.workflow_versions (workspace_id);
create index if not exists webhook_endpoints_workspace_idx on public.webhook_endpoints (workspace_id);
create index if not exists notifications_workspace_idx on public.notifications (workspace_id);
create index if not exists lead_activities_execution_idx on public.lead_activities (execution_id);
