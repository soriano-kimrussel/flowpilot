import Link from 'next/link';
import { requireSession } from '@/features/auth/session';
import { getWorkflowForEditor } from '@/features/workflows/queries';
import { WorkflowEditor } from '@/components/workflows/workflow-editor';
import { StatusBadge } from '@/components/ui/badge';
import { Card, CardHeader, PageHeader } from '@/components/ui/layout';
import { can } from '@/lib/security/permissions';
import { getSiteUrl } from '@/lib/env';
import { formatDuration, formatRelative, humanize } from '@/lib/utils/format';

export const metadata = { title: 'Workflow' };

export default async function WorkflowPage({ params }) {
  const { id } = await params;
  const session = await requireSession();
  const [{ workflow, version, versions, executions, endpoint }, { data: leads }] =
    await Promise.all([
      getWorkflowForEditor(session, id),
      session.supabase
        .from('leads')
        .select('id, name, email')
        .eq('workspace_id', session.workspaceId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/dashboard/workflows" className="hover:underline">
            Workflows
          </Link>
        }
        title={workflow.name}
        description={`Last updated ${formatRelative(workflow.updated_at)}${workflow.profiles?.full_name ? ` by ${workflow.profiles.full_name}` : ''}${workflow.next_run_at ? ` · next scheduled run ${formatRelative(workflow.next_run_at)}` : ''}`}
      />
      <WorkflowEditor
        key={version?.id ?? 'none'}
        workflow={workflow}
        version={version}
        canEdit={can(session.role, 'workflow.edit')}
        canManageWebhooks={can(session.role, 'webhook.manage')}
        endpoint={endpoint}
        leads={leads ?? []}
        siteUrl={getSiteUrl()}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Recent executions"
            actions={
              <Link
                href={`/dashboard/executions?workflow=${workflow.id}`}
                className="text-sm text-brand-700 hover:underline"
              >
                View all
              </Link>
            }
          />
          {executions.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-subtle">This workflow hasn&apos;t run yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {executions.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/dashboard/executions/${e.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-gray-50"
                  >
                    <span className="text-sm">
                      {humanize(e.trigger_type)} · v{e.workflow_versions?.version_number}
                      {e.attempt > 1 ? ` · attempt ${e.attempt}` : ''}
                      <span className="block text-xs text-ink-subtle">
                        {formatRelative(e.created_at)} · {formatDuration(e.duration_ms)}
                      </span>
                    </span>
                    <StatusBadge status={e.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader
            title="Version history"
            description="Versions are immutable; executions always reference the version they ran."
          />
          <ul className="divide-y divide-line">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span>
                  Version {v.version_number}
                  {v.id === workflow.current_version_id && (
                    <span className="ml-2 text-xs font-medium text-brand-700">current</span>
                  )}
                </span>
                <span className="text-xs text-ink-subtle">
                  {formatRelative(v.created_at)}
                  {v.profiles?.full_name ? ` · ${v.profiles.full_name}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
