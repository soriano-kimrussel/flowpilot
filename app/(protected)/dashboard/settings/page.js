import { requireSession } from '@/features/auth/session';
import {
  AddMemberForm,
  CreateWorkspaceForm,
  DeleteWorkspace,
  DemoDataControls,
  MemberRow,
  PasswordForm,
  ProfileForm,
  WorkspaceNameForm,
} from '@/components/settings/settings-forms';
import { Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from '@/components/ui/layout';
import { can, ROLE_DESCRIPTIONS } from '@/lib/security/permissions';
import { formatDateTime, humanize } from '@/lib/utils/format';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const session = await requireSession();
  const { supabase, workspaceId, role } = session;
  const isAdmin = can(role, 'member.manage');

  const [{ data: members }, { count: demoCount }, audit] = await Promise.all([
    supabase
      .from('workspace_members')
      .select('id, role, user_id, created_at, profiles(full_name, email)')
      .eq('workspace_id', workspaceId)
      .order('created_at'),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('is_demo', true),
    can(role, 'audit.view')
      ? supabase
          .from('audit_logs')
          .select('id, action, entity_type, created_at, metadata, profiles(full_name, email)')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(25)
      : Promise.resolve({ data: null }),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your profile, security and workspace configuration."
      />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Profile" description={session.user.email} />
          <CardBody>
            <ProfileForm fullName={session.profile?.full_name} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Security"
            description="Passwords are stored and hashed by Supabase Auth, never by FlowPilot."
          />
          <CardBody>
            <PasswordForm />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Workspace"
            description={`Your role: ${humanize(role)}. ${ROLE_DESCRIPTIONS[role]}`}
          />
          <CardBody className="space-y-6">
            <WorkspaceNameForm
              name={session.workspace?.name ?? ''}
              canEdit={can(role, 'workspace.rename')}
            />
            <CreateWorkspaceForm />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Members"
            description="Owners manage admins; admins manage members. Access is enforced by database policies."
          />
          {isAdmin && (
            <CardBody className="border-b border-line">
              <AddMemberForm isOwner={role === 'owner'} />
            </CardBody>
          )}
          <ul className="divide-y divide-line">
            {(members ?? []).map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                currentUserId={session.user.id}
                canManage={isAdmin}
                isOwner={role === 'owner'}
              />
            ))}
          </ul>
          <CardBody className="border-t border-line">
            <ul className="space-y-1 text-xs text-ink-subtle">
              {Object.entries(ROLE_DESCRIPTIONS).map(([r, d]) => (
                <li key={r}>
                  <span className="font-medium text-ink-muted capitalize">{r}:</span> {d}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        {can(role, 'demo.manage') && (
          <Card id="demo">
            <CardHeader
              title="Demo data"
              description="Adds 13 sample leads, 3 workflows and 28 executions so you can explore. Every record is flagged as demo data and can be removed in one click."
            />
            <CardBody>
              <DemoDataControls hasDemoData={(demoCount ?? 0) > 0} />
            </CardBody>
          </Card>
        )}

        {audit.data && (
          <Card>
            <CardHeader
              title="Audit log"
              description="Most recent important operations in this workspace (owners and admins only)."
            />
            {audit.data.length === 0 ? (
              <CardBody>
                <p className="text-sm text-ink-subtle">No audit entries yet.</p>
              </CardBody>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Action</Th>
                    <Th className="hidden sm:table-cell">Actor</Th>
                    <Th>When</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {audit.data.map((a) => (
                    <tr key={a.id}>
                      <Td>
                        <code className="text-xs">{a.action}</code>
                      </Td>
                      <Td className="hidden text-ink-muted sm:table-cell">
                        {a.profiles?.full_name || a.profiles?.email || 'System'}
                      </Td>
                      <Td className="text-ink-subtle">{formatDateTime(a.created_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        )}

        {can(role, 'workspace.delete') && (
          <Card className="border-red-200">
            <CardHeader
              title="Danger zone"
              description="Deleting a workspace removes all of its data."
            />
            <CardBody>
              <DeleteWorkspace name={session.workspace?.name} />
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
