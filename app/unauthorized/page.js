import { ShieldAlert } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';

export const metadata = { title: 'Access denied' };

const REASONS = {
  role: 'Your role in this workspace does not allow access to this page. Ask a workspace owner or admin for access.',
  'no-workspace':
    'Your account is not a member of any workspace. Ask an owner to add you, or create a new account.',
  default: 'You do not have permission to view this page.',
};

export default async function UnauthorizedPage({ searchParams }) {
  const { reason } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <ShieldAlert className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="mt-2 text-sm text-ink-muted">{REASONS[reason] ?? REASONS.default}</p>
        <div className="mt-6 flex justify-center gap-3">
          <ButtonLink href="/dashboard">Go to dashboard</ButtonLink>
          <ButtonLink href="/" variant="secondary">
            Home
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
