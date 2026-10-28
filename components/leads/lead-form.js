'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, Card, CardBody, CardHeader } from '@/components/ui/layout';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import {
  createLeadAction,
  extractLeadFieldsAction,
  updateLeadAction,
} from '@/features/leads/actions';
import { LEAD_SOURCES, leadFormSchema } from '@/lib/validation/lead';
import { LEAD_PRIORITIES, LEAD_STATUSES } from '@/lib/workflow-engine/constants';
import { humanize } from '@/lib/utils/format';

const EMPTY = {
  name: '',
  email: '',
  company: '',
  job_title: '',
  phone: '',
  company_size: '',
  budget: '',
  source: 'manual',
  status: 'new',
  priority: 'normal',
  assignee: '',
  message: '',
  notes: '',
};

function toFormValues(lead) {
  if (!lead) return EMPTY;
  return Object.fromEntries(Object.keys(EMPTY).map((k) => [k, lead[k] ?? EMPTY[k]]));
}

function ExtractPanel({ onExtract }) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(null);
  const toast = useToast();

  async function run() {
    setPending(true);
    const res = await extractLeadFieldsAction({ text });
    setPending(false);
    if (!res.ok) return toast.error('Could not extract fields', res.error);
    setResult(res);
    onExtract(res.fields);
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title="Extract from text"
        description="Paste an email, form dump or signature. Detected fields fill the form below for you to review."
      />
      <CardBody className="space-y-3">
        <Field id="extract-text" label="Lead text">
          {(aria) => (
            <Textarea
              {...aria}
              rows={4}
              value={text}
              maxLength={5000}
              onChange={(e) => setText(e.target.value)}
              placeholder="Hi, my name is Jordan Blake, Head of Operations at Acme Robotics. We're a team of 45 with a budget of $12k…"
            />
          )}
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={run}
            loading={pending}
            disabled={text.trim().length < 10}
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" /> Extract fields
          </Button>
          {result && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              Found{' '}
              {result.found.length ? result.found.map(humanize).join(', ') : 'no structured fields'}
              <Badge tone={result.meta.simulated ? 'violet' : 'indigo'}>{result.meta.label}</Badge>
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

export function LeadForm({ lead }) {
  const router = useRouter();
  const toast = useToast();
  const [formError, setFormError] = useState(null);
  const [duplicateId, setDuplicateId] = useState(null);
  const form = useForm({
    resolver: zodResolver(leadFormSchema),
    defaultValues: toFormValues(lead),
  });
  const { register, handleSubmit, formState, setError, setValue } = form;
  const err = (name) => formState.errors[name]?.message;

  function applyExtracted(fields) {
    Object.entries(fields).forEach(([key, value]) => {
      if (key in EMPTY && value !== undefined && value !== null)
        setValue(key, String(value), { shouldDirty: true });
    });
  }

  async function onSubmit(values) {
    setFormError(null);
    setDuplicateId(null);
    const result = lead ? await updateLeadAction(lead.id, values) : await createLeadAction(values);
    if (!result.ok) {
      Object.entries(result.fieldErrors ?? {}).forEach(([name, message]) =>
        setError(name, { message }),
      );
      setFormError(result.error ?? null);
      setDuplicateId(result.duplicateId ?? null);
      return;
    }
    toast.success(
      lead ? 'Lead updated' : 'Lead created',
      result.workflowsRun ? `${result.workflowsRun} triggered workflow(s) ran.` : undefined,
    );
    router.push(`/dashboard/leads/${lead?.id ?? result.id}`);
    router.refresh();
  }

  const text = (name, label, props = {}) => (
    <Field id={name} label={label} error={err(name)} optional={props.optional}>
      {(aria) => <Input {...aria} {...props.input} {...register(name)} />}
    </Field>
  );

  return (
    <>
      {!lead && <ExtractPanel onExtract={applyExtracted} />}
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Card>
          <CardBody className="space-y-6">
            {formError && <Alert tone="error">{formError}</Alert>}
            {duplicateId && (
              <Alert tone="warning" title="Duplicate detected">
                This email already belongs to a lead.{' '}
                <Link href={`/dashboard/leads/${duplicateId}`} className="font-medium underline">
                  Open the existing lead
                </Link>
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {text('name', 'Name', { input: { autoComplete: 'off' } })}
              {text('email', 'Email', { input: { type: 'email', autoComplete: 'off' } })}
              {text('company', 'Company', { optional: true })}
              {text('job_title', 'Job title', { optional: true })}
              {text('phone', 'Phone', { optional: true, input: { type: 'tel' } })}
              <Field id="source" label="Source" error={err('source')}>
                {(aria) => (
                  <Select {...aria} {...register('source')}>
                    {LEAD_SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {humanize(s)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {text('company_size', 'Company size (employees)', {
                optional: true,
                input: { inputMode: 'numeric' },
              })}
              {text('budget', 'Budget (USD)', { optional: true, input: { inputMode: 'numeric' } })}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="status" label="Status" error={err('status')}>
                {(aria) => (
                  <Select {...aria} {...register('status')}>
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {humanize(s)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field id="priority" label="Priority" error={err('priority')}>
                {(aria) => (
                  <Select {...aria} {...register('priority')}>
                    {LEAD_PRIORITIES.map((s) => (
                      <option key={s} value={s}>
                        {humanize(s)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {text('assignee', 'Assignee', { optional: true })}
            </div>
            <Field id="message" label="Inquiry message" error={err('message')} optional>
              {(aria) => <Textarea {...aria} rows={4} {...register('message')} />}
            </Field>
            <Field
              id="notes"
              label="Internal notes"
              error={err('notes')}
              optional
              help="Notes are never sent to external AI providers."
            >
              {(aria) => <Textarea {...aria} rows={3} {...register('notes')} />}
            </Field>
          </CardBody>
          <div className="flex justify-end gap-2 border-t border-line bg-gray-50/60 px-5 py-3">
            <Button variant="secondary" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" loading={formState.isSubmitting}>
              {lead ? 'Save changes' : 'Create lead'}
            </Button>
          </div>
        </Card>
      </form>
    </>
  );
}
