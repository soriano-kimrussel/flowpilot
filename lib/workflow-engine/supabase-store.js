// PostgreSQL persistence for the executor. Works with a user-scoped client (RLS enforced) or the
// admin client (cron/webhooks); every query is additionally filtered by workspace_id.

export function createSupabaseStore(supabase, workspaceId) {
  return {
    async createExecution(row) {
      const { data, error } = await supabase
        .from('workflow_executions')
        .insert({ ...row, workspace_id: workspaceId })
        .select('*')
        .single();
      if (!error) return { execution: data, existing: false };
      if (error.code === '23505' && row.idempotency_key) {
        const { data: existing, error: lookupError } = await supabase
          .from('workflow_executions')
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('idempotency_key', row.idempotency_key)
          .single();
        if (lookupError)
          throw new Error(`Could not load existing execution: ${lookupError.message}`);
        return { execution: existing, existing: true };
      }
      throw new Error(`Could not create execution: ${error.message}`);
    },

    async transitionExecution(id, from, to, patch = {}) {
      const { data, error } = await supabase
        .from('workflow_executions')
        .update({ ...patch, status: to })
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .eq('status', from)
        .select('id');
      if (error) throw new Error(`Could not update execution: ${error.message}`);
      return data.length === 1;
    },

    async isExecutionCancelled(id) {
      const { data, error } = await supabase
        .from('workflow_executions')
        .select('status')
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .single();
      if (error) throw new Error(`Could not read execution status: ${error.message}`);
      return data.status === 'cancelled';
    },

    async insertStep(row) {
      const { data, error } = await supabase
        .from('workflow_execution_steps')
        .insert({ ...row, workspace_id: workspaceId })
        .select('id')
        .single();
      if (error) throw new Error(`Could not record step "${row.step_id}": ${error.message}`);
      return data;
    },

    async transitionStep(id, from, to, patch = {}) {
      const { data, error } = await supabase
        .from('workflow_execution_steps')
        .update({ ...patch, status: to })
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .eq('status', from)
        .select('id');
      if (error) throw new Error(`Could not update step: ${error.message}`);
      return data.length === 1;
    },

    async findSucceededSideEffect(idempotencyKey) {
      const { data, error } = await supabase
        .from('workflow_execution_steps')
        .select('id, execution_id, output')
        .eq('workspace_id', workspaceId)
        .eq('idempotency_key', idempotencyKey)
        .eq('status', 'succeeded')
        .is('replayed_from_step_id', null)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Could not check idempotency: ${error.message}`);
      return data;
    },
  };
}
