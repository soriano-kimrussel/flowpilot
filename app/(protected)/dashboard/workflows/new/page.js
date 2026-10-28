import Link from 'next/link';
import { requireSession } from '@/features/auth/session';
import { listTemplates } from '@/features/workflows/queries';
import { CreateWorkflowForm } from '@/components/workflows/create-workflow-form';
import { PageHeader } from '@/components/ui/layout';

export const metadata = { title: 'New workflow' };

export default async function NewWorkflowPage({ searchParams }) {
  const session = await requireSession({ permission: 'workflow.edit' });
  const { template } = await searchParams;
  const templates = await listTemplates(session);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        breadcrumb={
          <Link href="/dashboard/workflows" className="hover:underline">
            Workflows
          </Link>
        }
        title="New workflow"
        description="New workflows start as drafts. Activate them when you're ready for automatic triggers."
      />
      <CreateWorkflowForm
        templates={templates}
        defaultTemplateId={typeof template === 'string' ? template : undefined}
      />
    </div>
  );
}
