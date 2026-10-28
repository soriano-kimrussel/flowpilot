'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { deleteTemplateAction } from '@/features/workflows/actions';

export function DeleteTemplateButton({ templateId }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        loading={pending}
        title="Delete template?"
        description="Workflows created from this template are not affected."
        confirmLabel="Delete"
        onConfirm={() =>
          startTransition(async () => {
            const res = await deleteTemplateAction(templateId);
            if (!res.ok) return toast.error('Not deleted', res.error);
            setOpen(false);
            router.refresh();
          })
        }
      />
    </>
  );
}
