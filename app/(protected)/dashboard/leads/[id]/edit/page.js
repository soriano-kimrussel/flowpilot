import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/features/auth/session';
import { LeadForm } from '@/components/leads/lead-form';
import { PageHeader } from '@/components/ui/layout';

export const metadata = { title: 'Edit lead' };

export default async function EditLeadPage({ params }) {
  const { id } = await params;
  const session = await requireSession({ permission: 'lead.edit' });
  const { data: lead } = await session.supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', session.workspaceId)
    .maybeSingle();
  if (!lead) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        breadcrumb={
          <>
            <Link href="/dashboard/leads" className="hover:underline">
              Leads
            </Link>{' '}
            /{' '}
            <Link href={`/dashboard/leads/${lead.id}`} className="hover:underline">
              {lead.name}
            </Link>
          </>
        }
        title="Edit lead"
      />
      <LeadForm lead={lead} />
    </div>
  );
}
