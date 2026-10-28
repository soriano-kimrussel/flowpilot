import 'server-only';
import { notFound } from 'next/navigation';
import { unwrap } from '@/features/actions-util';
import { createServices } from '@/lib/workflow-engine/services';

export const LEADS_PAGE_SIZE = 20;

/** Malformed ids in URLs should 404 instead of raising Postgres `invalid uuid` errors. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keeps only characters that are safe inside a PostgREST `or` filter value. */
export function sanitizeSearch(q) {
  return String(q ?? '')
    .replace(/[^\p{L}\p{N}\s@.'-]/gu, ' ')
    .trim()
    .slice(0, 100);
}

export function applyLeadFilters(query, filters) {
  let q = query;
  const search = sanitizeSearch(filters.q);
  if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.source) q = q.eq('source', filters.source);
  if (filters.minScore !== undefined) q = q.gte('score', filters.minScore);
  q = filters.archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
  return q;
}

const SORTS = {
  created_desc: ['created_at', { ascending: false }],
  created_asc: ['created_at', { ascending: true }],
  score_desc: ['score', { ascending: false, nullsFirst: false }],
  activity_desc: ['last_activity_at', { ascending: false }],
};

export async function listLeads(session, filters) {
  const from = (filters.page - 1) * LEADS_PAGE_SIZE;
  let query = session.supabase
    .from('leads')
    .select(
      'id, name, email, company, source, status, score, classification, assignee, last_activity_at, created_at, is_demo, archived_at',
      {
        count: 'exact',
      },
    )
    .eq('workspace_id', session.workspaceId);
  query = applyLeadFilters(query, filters);
  const [column, options] = SORTS[filters.sort] ?? SORTS.created_desc;
  const { data, count, error } = await query
    .order(column, options)
    .order('id')
    .range(from, from + LEADS_PAGE_SIZE - 1);
  // PostgREST answers 416 (PGRST103) when the page starts past the last row; show an empty page.
  if (error?.code === 'PGRST103') {
    const countQuery = session.supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', session.workspaceId);
    const { count: total } = await applyLeadFilters(countQuery, filters);
    return { leads: [], total: total ?? 0 };
  }
  unwrap({ data, error }, 'Could not load leads');
  return { leads: data, total: count ?? 0 };
}

export async function getLeadDetail(session, id) {
  const { supabase, workspaceId } = session;
  if (!UUID_RE.test(String(id))) notFound();
  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  unwrap({ data: lead, error });
  if (!lead) notFound();

  const [activities, executions, draftSteps] = await Promise.all([
    supabase
      .from('lead_activities')
      .select('id, type, description, metadata, created_at, execution_id, profiles(full_name)')
      .eq('workspace_id', workspaceId)
      .eq('lead_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('workflow_executions')
      .select('id, status, trigger_type, created_at, duration_ms, error_message, workflows(name)')
      .eq('workspace_id', workspaceId)
      .eq('lead_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('workflow_execution_steps')
      .select('id, output, created_at, execution_id, workflow_executions!inner(lead_id)')
      .eq('workspace_id', workspaceId)
      .eq('step_type', 'ai.draft_reply')
      .eq('status', 'succeeded')
      .eq('workflow_executions.lead_id', id)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const services = createServices({ supabase, workspaceId, actorId: session.user.id });
  const duplicates = await services.leads.findPotentialDuplicates(lead).catch(() => []);

  return {
    lead,
    activities: unwrap(activities),
    executions: unwrap(executions),
    latestDraft: unwrap(draftSteps)[0] ?? null,
    duplicates,
  };
}

export async function listRunnableWorkflows(session) {
  const { data, error } = await session.supabase
    .from('workflows')
    .select('id, name, status, trigger_type')
    .eq('workspace_id', session.workspaceId)
    .neq('status', 'archived')
    .not('current_version_id', 'is', null)
    .order('name');
  return unwrap({ data, error });
}
