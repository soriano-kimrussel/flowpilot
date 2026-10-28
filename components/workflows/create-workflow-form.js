'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, Card, CardBody } from '@/components/ui/layout';
import { createWorkflowAction } from '@/features/workflows/actions';
import { createWorkflowSchema } from '@/lib/validation/workflow';
import { TRIGGERS } from '@/lib/workflow-engine/constants';

export function CreateWorkflowForm({ templates, defaultTemplateId }) {
  const defaultTemplate = templates.find((t) => t.id === defaultTemplateId);
  const form = useForm({
    resolver: zodResolver(createWorkflowSchema),
    defaultValues: {
      name: defaultTemplate?.name ?? '',
      description: defaultTemplate?.description ?? '',
      triggerType: defaultTemplate?.definition?.trigger?.type ?? 'manual',
      templateId: defaultTemplateId ?? '',
    },
  });
  const [error, setError] = useState(null);
  const templateId = useWatch({ control: form.control, name: 'templateId' });
  const err = (n) => form.formState.errors[n]?.message;

  async function onSubmit(values) {
    setError(null);
    const res = await createWorkflowAction(values);
    // On success the action redirects to the editor.
    if (res && !res.ok) {
      Object.entries(res.fieldErrors ?? {}).forEach(([k, message]) =>
        form.setError(k, { message }),
      );
      setError(res.error ?? null);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <Card>
        <CardBody className="space-y-5">
          {error && <Alert tone="error">{error}</Alert>}
          <Field
            id="templateId"
            label="Start from"
            help="Templates include a complete, editable set of steps."
          >
            {(aria) => (
              <Select
                {...aria}
                {...form.register('templateId', {
                  onChange: (e) => {
                    const t = templates.find((x) => x.id === e.target.value);
                    if (t) {
                      form.setValue('name', t.name);
                      form.setValue('description', t.description ?? '');
                      form.setValue('triggerType', t.definition.trigger.type);
                    }
                  },
                })}
              >
                <option value="">Blank workflow</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.is_system ? t.name : `${t.name} (workspace)`}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="name" label="Name" error={err('name')}>
            {(aria) => <Input {...aria} {...form.register('name')} />}
          </Field>
          <Field id="description" label="Description" optional error={err('description')}>
            {(aria) => <Textarea {...aria} rows={2} {...form.register('description')} />}
          </Field>
          <Field
            id="triggerType"
            label="Trigger"
            help={templateId ? 'Set by the template; change it in the editor.' : undefined}
          >
            {(aria) => (
              <Select {...aria} disabled={Boolean(templateId)} {...form.register('triggerType')}>
                {Object.entries(TRIGGERS).map(([type, t]) => (
                  <option key={type} value={type}>
                    {t.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </CardBody>
        <div className="flex justify-end border-t border-line bg-gray-50/60 px-5 py-3">
          <Button type="submit" loading={form.formState.isSubmitting}>
            Create &amp; open editor
          </Button>
        </div>
      </Card>
    </form>
  );
}
