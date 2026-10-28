import Link from 'next/link';
import { requireSession } from '@/features/auth/session';
import { LeadForm } from '@/components/leads/lead-form';
import { PageHeader } from '@/components/ui/layout';

export const metadata = { title: 'New lead' };

export default async function NewLeadPage() {
  await requireSession({ permission: 'lead.edit' });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        breadcrumb={
          <Link href="/dashboard/leads" className="hover:underline">
            Leads
          </Link>
        }
        title="New lead"
        description="Creating a lead triggers any active “New lead created” workflows."
      />
      <LeadForm />
    </div>
  );
}
