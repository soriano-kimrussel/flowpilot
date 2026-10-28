'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert } from '@/components/ui/layout';
import { useToast } from '@/components/ui/toast';
import {
  addMemberAction,
  changePasswordAction,
  clearDemoDataAction,
  createWorkspaceAction,
  deleteWorkspaceAction,
  loadDemoDataAction,
  removeMemberAction,
  renameWorkspaceAction,
  updateMemberRoleAction,
  updateProfileAction,
} from '@/features/settings/actions';
import { resetPasswordSchema } from '@/lib/validation/auth';

function useActionForm(schema, defaultValues) {
  const form = useForm({ resolver: zodResolver(schema), defaultValues });
  const toast = useToast();
  const router = useRouter();
  const submit = (action, successMessage, { reset = false } = {}) =>
    form.handleSubmit(async (values) => {
      const res = await action(values);
      if (res && !res.ok) {
        Object.entries(res.fieldErrors ?? {}).forEach(([k, message]) =>
          form.setError(k, { message }),
        );
        if (res.error) toast.error('Not saved', res.error);
        return;
      }
      toast.success(successMessage);
      if (reset) form.reset();
      router.refresh();
    });
  return { form, submit };
}

export function ProfileForm({ fullName }) {
  const { form, submit } = useActionForm(
    z.object({ fullName: z.string().trim().min(1, 'Enter your name').max(120) }),
    { fullName: fullName ?? '' },
  );
  return (
    <form
      onSubmit={submit(updateProfileAction, 'Profile updated')}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      noValidate
    >
      <Field
        id="fullName"
        label="Display name"
        error={form.formState.errors.fullName?.message}
        className="flex-1"
      >
        {(aria) => <Input {...aria} {...form.register('fullName')} />}
      </Field>
      <Button type="submit" loading={form.formState.isSubmitting}>
        Save
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const { form, submit } = useActionForm(resetPasswordSchema, {
    password: '',
    confirmPassword: '',
  });
  return (
    <form
      onSubmit={submit(changePasswordAction, 'Password changed', { reset: true })}
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      noValidate
    >
      <Field id="password" label="New password" error={form.formState.errors.password?.message}>
        {(aria) => (
          <Input
            {...aria}
            type="password"
            autoComplete="new-password"
            {...form.register('password')}
          />
        )}
      </Field>
      <Field
        id="confirmPassword"
        label="Confirm"
        error={form.formState.errors.confirmPassword?.message}
      >
        {(aria) => (
          <Input
            {...aria}
            type="password"
            autoComplete="new-password"
            {...form.register('confirmPassword')}
          />
        )}
      </Field>
      <Button type="submit" loading={form.formState.isSubmitting}>
        Change password
      </Button>
    </form>
  );
}

const nameSchema = z.object({ name: z.string().trim().min(1, 'Enter a name').max(80) });

export function WorkspaceNameForm({ name, canEdit }) {
  const { form, submit } = useActionForm(nameSchema, { name });
  return (
    <form
      onSubmit={submit(renameWorkspaceAction, 'Workspace renamed')}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      noValidate
    >
      <Field
        id="ws-name"
        label="Workspace name"
        error={form.formState.errors.name?.message}
        className="flex-1"
      >
        {(aria) => <Input {...aria} disabled={!canEdit} {...form.register('name')} />}
      </Field>
      {canEdit && (
        <Button type="submit" loading={form.formState.isSubmitting}>
          Rename
        </Button>
      )}
    </form>
  );
}

export function CreateWorkspaceForm() {
  const { form, submit } = useActionForm(nameSchema, { name: '' });
  return (
    <form
      onSubmit={submit(createWorkspaceAction, 'Workspace created')}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      noValidate
    >
      <Field
        id="new-ws"
        label="New workspace"
        error={form.formState.errors.name?.message}
        className="flex-1"
        help="Use a second workspace to verify data isolation between tenants."
      >
        {(aria) => <Input {...aria} placeholder="Acme Sales" {...form.register('name')} />}
      </Field>
      <Button type="submit" variant="secondary" loading={form.formState.isSubmitting}>
        Create
      </Button>
    </form>
  );
}

export function AddMemberForm({ isOwner }) {
  const { form, submit } = useActionForm(
    z.object({
      email: z.string().trim().email('Enter a valid email'),
      role: z.enum(['admin', 'member']),
    }),
    { email: '', role: 'member' },
  );
  return (
    <form
      onSubmit={submit(addMemberAction, 'Member added', { reset: true })}
      className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
      noValidate
    >
      <Field
        id="member-email"
        label="Email of a registered user"
        error={form.formState.errors.email?.message}
      >
        {(aria) => <Input {...aria} type="email" {...form.register('email')} />}
      </Field>
      <Field id="member-role" label="Role">
        {(aria) => (
          <Select {...aria} {...form.register('role')}>
            <option value="member">Member</option>
            {isOwner && <option value="admin">Admin</option>}
          </Select>
        )}
      </Field>
      <Button type="submit" loading={form.formState.isSubmitting}>
        Add member
      </Button>
    </form>
  );
}

export function MemberRow({ member, currentUserId, canManage, isOwner }) {
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  const isSelf = member.user_id === currentUserId;
  const canChangeRole =
    canManage && member.role !== 'owner' && (isOwner || member.role !== 'admin');
  const canRemove =
    member.role !== 'owner' && (isSelf || (canManage && (isOwner || member.role !== 'admin')));

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {member.profiles?.full_name || member.profiles?.email}{' '}
          {isSelf && <span className="text-xs text-ink-subtle">(you)</span>}
        </p>
        <p className="text-xs text-ink-subtle">{member.profiles?.email}</p>
      </div>
      <div className="flex items-center gap-2">
        {canChangeRole ? (
          <>
            <label htmlFor={`role-${member.id}`} className="sr-only">
              Role
            </label>
            <Select
              key={member.role}
              id={`role-${member.id}`}
              defaultValue={member.role}
              disabled={pending}
              className="h-8 w-28"
              onChange={(e) =>
                startTransition(async () => {
                  const res = await updateMemberRoleAction(member.id, e.target.value);
                  if (!res.ok) toast.error('Role not changed', res.error);
                  else toast.success('Role updated');
                  router.refresh();
                })
              }
            >
              <option value="member">Member</option>
              {isOwner && <option value="admin">Admin</option>}
            </Select>
          </>
        ) : (
          <span className="text-sm text-ink-muted capitalize">{member.role}</span>
        )}
        {canRemove && (
          <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
            {isSelf ? 'Leave' : 'Remove'}
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        loading={pending}
        title={isSelf ? 'Leave this workspace?' : 'Remove member?'}
        description={
          isSelf
            ? 'You will lose access to all workspace data.'
            : 'They will immediately lose access to this workspace.'
        }
        confirmLabel={isSelf ? 'Leave' : 'Remove'}
        onConfirm={() =>
          startTransition(async () => {
            const res = await removeMemberAction(member.id);
            if (res && !res.ok) return toast.error('Not removed', res.error);
            setConfirm(false);
            router.refresh();
          })
        }
      />
    </li>
  );
}

export function DemoDataControls({ hasDemoData }) {
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        loading={pending && !confirm}
        disabled={hasDemoData || pending}
        onClick={() =>
          startTransition(async () => {
            const res = await loadDemoDataAction();
            if (!res.ok) return toast.error('Demo data not loaded', res.error);
            toast.success(
              res.result?.status === 'loaded' ? 'Demo data loaded' : 'Demo data already present',
              res.result?.leads
                ? `${res.result.leads} leads and ${res.result.executions} executions added.`
                : undefined,
            );
            router.refresh();
          })
        }
      >
        Load demo data
      </Button>
      <Button
        variant="secondary"
        disabled={!hasDemoData || pending}
        onClick={() => setConfirm(true)}
      >
        Remove demo data
      </Button>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        loading={pending}
        title="Remove all demo data?"
        description="Deletes demo leads, demo workflows (and their executions) and demo notifications. Your own records are not touched."
        confirmLabel="Remove demo data"
        onConfirm={() =>
          startTransition(async () => {
            const res = await clearDemoDataAction();
            if (!res.ok) return toast.error('Not removed', res.error);
            setConfirm(false);
            toast.success('Demo data removed');
            router.refresh();
          })
        }
      />
    </div>
  );
}

export function DeleteWorkspace({ name }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete workspace
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        loading={pending}
        title="Delete this workspace?"
        description="All leads, workflows, executions, notifications and settings in this workspace are permanently deleted."
        confirmLabel="Delete permanently"
        onConfirm={() =>
          startTransition(async () => {
            const res = await deleteWorkspaceAction(typed);
            if (res && !res.ok) toast.error('Not deleted', res.error);
          })
        }
      >
        <Alert tone="warning">This cannot be undone.</Alert>
        <Field id="confirm-ws" label={`Type “${name}” to confirm`} className="mt-3">
          {(aria) => <Input {...aria} value={typed} onChange={(e) => setTyped(e.target.value)} />}
        </Field>
      </ConfirmDialog>
    </>
  );
}
