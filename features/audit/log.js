import 'server-only';

/** Appends an audit entry. Never throws: auditing must not break the user's action. */
export async function logAudit(
  supabase,
  { workspaceId, actorId, action, entityType, entityId = null, metadata = {} },
) {
  const { error } = await supabase.from('audit_logs').insert({
    workspace_id: workspaceId,
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
  if (error) console.error(`[audit] failed to record ${action}: ${error.code ?? 'error'}`);
}
