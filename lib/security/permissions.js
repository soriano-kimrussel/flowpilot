// Role permissions (application layer). The same rules are enforced in PostgreSQL by RLS;
// this module exists so the UI and API can fail fast with clear messages.

export const ROLES = ['owner', 'admin', 'member'];

const ALL = ['owner', 'admin', 'member'];
const ADMINS = ['owner', 'admin'];

export const PERMISSIONS = Object.freeze({
  'workspace.view': ALL,
  'workspace.rename': ADMINS,
  'workspace.delete': ['owner'],
  'member.manage': ADMINS,
  'lead.view': ALL,
  'lead.edit': ALL,
  'lead.delete': ADMINS,
  'lead.export': ALL,
  'workflow.view': ALL,
  'workflow.edit': ADMINS,
  'workflow.run': ALL,
  'execution.retry': ALL,
  'execution.cancel': ADMINS,
  'queue.process': ALL,
  'template.manage': ADMINS,
  'integration.edit': ADMINS,
  'webhook.manage': ADMINS,
  'audit.view': ADMINS,
  'demo.manage': ADMINS,
});

export function can(role, permission) {
  return Boolean(role && PERMISSIONS[permission]?.includes(role));
}

export const ROLE_DESCRIPTIONS = {
  owner: 'Full control, including deleting the workspace and managing admins.',
  admin: 'Manage workflows, integrations, webhooks, templates and members.',
  member: 'View everything in the workspace, manage leads and run workflows.',
};
