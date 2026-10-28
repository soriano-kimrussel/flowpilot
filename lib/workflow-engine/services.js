// Database-backed services used by actions. Each method is scoped to one workspace.
import { canonicalEmail, escapeLike, findDuplicateMatches } from '@/lib/leads/duplicates';

const LEAD_COLUMNS =
  'id, workspace_id, name, email, company, job_title, phone, company_size, budget, source, message, notes, status, score, classification, assignee, priority, ai_summary';

export function createServices({ supabase, workspaceId, actorId = null, ai }) {
  const leads = {
    async getById(id) {
      const { data, error } = await supabase
        .from('leads')
        .select(LEAD_COLUMNS)
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .single();
      if (error) throw new Error(`Lead not found: ${error.message}`);
      return data;
    },

    async findPotentialDuplicates(candidate) {
      const email = String(candidate.email ?? '')
        .trim()
        .toLowerCase();
      const domain = canonicalEmail(email).split('@')[1];
      // Parameterized filters only (no hand-built PostgREST filter strings).
      const domains =
        domain === 'gmail.com' ? ['gmail.com', 'googlemail.com'] : domain ? [domain] : [];
      const byEmail = [];
      for (const d of domains) {
        const { data, error } = await supabase
          .from('leads')
          .select('id, name, email, company')
          .eq('workspace_id', workspaceId)
          .ilike('email_normalized', `%@${escapeLike(d)}`)
          .limit(200);
        if (error) throw new Error(`Duplicate check failed: ${error.message}`);
        byEmail.push(...data);
      }

      let byName = [];
      if (candidate.name && candidate.company) {
        const result = await supabase
          .from('leads')
          .select('id, name, email, company')
          .eq('workspace_id', workspaceId)
          .ilike('name', escapeLike(String(candidate.name).trim()))
          .limit(20);
        if (result.error) throw new Error(`Duplicate check failed: ${result.error.message}`);
        byName = result.data;
      }

      const unique = new Map([...byEmail, ...byName].map((r) => [r.id, r]));
      return findDuplicateMatches(candidate, [...unique.values()]);
    },

    async create(fields, { executionId }) {
      const { data, error } = await supabase
        .from('leads')
        .insert({
          ...fields,
          workspace_id: workspaceId,
          created_by: actorId,
          updated_by: actorId,
          created_by_execution_id: executionId,
          last_changed_by_execution_id: executionId,
        })
        .select(LEAD_COLUMNS)
        .single();

      if (error?.code === '23505') {
        const { data: existing, error: lookupError } = await supabase
          .from('leads')
          .select(LEAD_COLUMNS)
          .eq('workspace_id', workspaceId)
          .eq('email_normalized', String(fields.email).trim().toLowerCase())
          .single();
        if (lookupError) throw new Error(`Could not load existing lead: ${lookupError.message}`);
        return { lead: existing, created: false };
      }
      if (error) throw new Error(`Could not create lead: ${error.message}`);

      await leads.addActivity(data.id, {
        type: 'created',
        description: `Lead created by workflow (source: ${fields.source ?? 'workflow'})`,
        executionId,
      });
      return { lead: data, created: true };
    },

    async update(id, patch, { executionId }) {
      const { data, error } = await supabase
        .from('leads')
        .update({
          ...patch,
          updated_by: actorId,
          last_changed_by_execution_id: executionId,
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .select(LEAD_COLUMNS)
        .single();
      if (error) throw new Error(`Could not update lead: ${error.message}`);
      return data;
    },

    async addActivity(leadId, { type, description, metadata = {}, executionId = null }) {
      const { error } = await supabase.from('lead_activities').insert({
        workspace_id: workspaceId,
        lead_id: leadId,
        type,
        description: String(description).slice(0, 2000),
        metadata,
        execution_id: executionId,
        actor_id: actorId,
      });
      if (error) throw new Error(`Could not record lead activity: ${error.message}`);
    },
  };

  const notifications = {
    async create({ audience, title, body, severity = 'info', link, executionId, idempotencyKey }) {
      let query = supabase
        .from('workspace_members')
        .select('user_id, role')
        .eq('workspace_id', workspaceId);
      if (audience === 'admins') query = query.in('role', ['owner', 'admin']);
      const { data: members, error } = await query;
      if (error) throw new Error(`Could not load notification recipients: ${error.message}`);

      let recipients = members.map((m) => m.user_id);
      if (audience === 'actor') {
        recipients = actorId
          ? [actorId]
          : members.filter((m) => ['owner', 'admin'].includes(m.role)).map((m) => m.user_id);
      }
      if (!recipients.length) return { recipients: 0 };

      const rows = recipients.map((userId) => ({
        workspace_id: workspaceId,
        user_id: userId,
        title: String(title).slice(0, 160),
        body: body ? String(body).slice(0, 2000) : null,
        severity,
        link: link?.startsWith('/dashboard') ? link : null,
        execution_id: executionId ?? null,
        idempotency_key: idempotencyKey ? `${idempotencyKey}:${userId}`.slice(0, 300) : null,
      }));
      const { error: insertError } = await supabase
        .from('notifications')
        .upsert(rows, { onConflict: 'user_id,idempotency_key', ignoreDuplicates: true });
      if (insertError) throw new Error(`Could not create notification: ${insertError.message}`);
      return { recipients: rows.length };
    },
  };

  const integrations = {
    async isEnabled(provider) {
      const { data, error } = await supabase
        .from('integrations')
        .select('enabled')
        .eq('workspace_id', workspaceId)
        .eq('provider', provider)
        .maybeSingle();
      if (error) throw new Error(`Could not read integration settings: ${error.message}`);
      return Boolean(data?.enabled);
    },
  };

  return { ai, leads, notifications, integrations, actorId };
}
