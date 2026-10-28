'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Lightbulb, Save, Trash2 } from 'lucide-react';
import { Badge, DemoBadge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, Card, CardBody, CardHeader } from '@/components/ui/layout';
import { useToast } from '@/components/ui/toast';
import {
  deleteWorkflowAction,
  duplicateWorkflowAction,
  saveAsTemplateAction,
  saveWorkflowAction,
  setWorkflowStatusAction,
  suggestStepsAction,
} from '@/features/workflows/actions';
import { ACTION_CATALOG, PLACEHOLDER_HELP } from '@/lib/workflow-engine/catalog';
import { LEAD_STATUSES, TRIGGERS } from '@/lib/workflow-engine/constants';
import { countSteps, validateDefinition, walkSteps } from '@/lib/workflow-engine/definition';
import { humanize } from '@/lib/utils/format';
import { stableStringify } from '@/lib/utils/stable-json';
import { COMMON_PATHS } from './step-fields';
import { AddStepMenu, makeStep, StepList } from './step-list';
import { RunWorkflowButton } from './run-dialog';
import { WebhookPanel } from './webhook-panel';

function TriggerConfig({ trigger, onChange, readOnly }) {
  const config = trigger.config ?? {};
  if (trigger.type === 'lead.status_changed') {
    return (
      <Field id="trigger-status" label="Only when the new status is" optional>
        {(aria) => (
          <Select
            {...aria}
            disabled={readOnly}
            value={config.toStatus ?? ''}
            onChange={(e) =>
              onChange({ ...trigger, config: e.target.value ? { toStatus: e.target.value } : {} })
            }
          >
            <option value="">Any status</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
        )}
      </Field>
    );
  }
  if (trigger.type === 'webhook') {
    return (
      <Field
        id="trigger-required"
        label="Required payload fields"
        help="Comma-separated. Requests missing any of these are rejected with 400."
      >
        {(aria) => (
          <Input
            {...aria}
            disabled={readOnly}
            defaultValue={(config.requiredFields ?? []).join(', ')}
            onBlur={(e) =>
              onChange({
                ...trigger,
                config: {
                  requiredFields: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                },
              })
            }
          />
        )}
      </Field>
    );
  }
  if (trigger.type === 'schedule') {
    return (
      <Field
        id="trigger-interval"
        label="Interval"
        help="Due runs are enqueued by the daily cron (Vercel Hobby) or when someone processes the queue."
      >
        {(aria) => (
          <Select
            {...aria}
            disabled={readOnly}
            value={config.interval ?? 'daily'}
            onChange={(e) => onChange({ ...trigger, config: { interval: e.target.value } })}
          >
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
          </Select>
        )}
      </Field>
    );
  }
  return null;
}

function Suggestions({ onAdd, readOnly }) {
  const toast = useToast();
  const [goal, setGoal] = useState('');
  const [result, setResult] = useState(null);
  const [pending, startTransition] = useTransition();
  return (
    <Card>
      <CardHeader
        title="Suggest steps"
        description="Describe the goal; rules map it to known actions."
      />
      <CardBody className="space-y-3">
        <div className="flex gap-2">
          <label htmlFor="suggest-goal" className="sr-only">
            Goal
          </label>
          <Input
            id="suggest-goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. qualify leads and notify the team"
          />
          <Button
            variant="secondary"
            loading={pending}
            disabled={goal.trim().length < 3}
            onClick={() =>
              startTransition(async () => {
                const res = await suggestStepsAction(goal);
                if (!res.ok) return toast.error('No suggestions', res.error);
                setResult(res);
              })
            }
          >
            <Lightbulb className="h-4 w-4" aria-hidden="true" /> Suggest
          </Button>
        </div>
        {result && (
          <div className="space-y-2">
            <Badge tone="violet">{result.meta.label}</Badge>
            <ul className="space-y-1.5">
              {result.steps.map((type) => (
                <li key={type} className="flex items-center justify-between gap-2 text-sm">
                  <span>{ACTION_CATALOG[type]?.label ?? type}</span>
                  {!readOnly && (
                    <Button size="sm" variant="ghost" onClick={() => onAdd(type)}>
                      Add
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <ul className="list-disc pl-4 text-xs text-ink-subtle">
              {result.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function WorkflowEditor({
  workflow,
  version,
  canEdit,
  canManageWebhooks,
  endpoint,
  leads,
  siteUrl,
}) {
  const router = useRouter();
  const toast = useToast();
  const initial = useMemo(
    () => ({
      name: workflow.name,
      description: workflow.description ?? '',
      definition: version?.definition,
    }),
    [workflow, version],
  );
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [definition, setDefinition] = useState(initial.definition);
  const [serverIssues, setServerIssues] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [pending, startTransition] = useTransition();
  const readOnly = !canEdit;

  const dirty =
    name !== initial.name ||
    description !== initial.description ||
    stableStringify(definition) !== stableStringify(initial.definition);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const validation = useMemo(() => validateDefinition(definition), [definition]);
  const issues = useMemo(
    () => serverIssues ?? (validation.success ? [] : validation.issues),
    [serverIssues, validation],
  );

  const ctx = useMemo(() => {
    const allIds = new Set();
    const draftStepIds = [];
    const paths = [...COMMON_PATHS];
    walkSteps(definition.steps ?? [], (s) => {
      allIds.add(s.id);
      if (s.type === 'ai.draft_reply') draftStepIds.push(s.id);
      if (s.type === 'lead.score') paths.push(`steps.${s.id}.score`);
      if (s.type === 'lead.classify') paths.push(`steps.${s.id}.segment`, `steps.${s.id}.intent`);
      if (s.type === 'lead.validate')
        paths.push(`steps.${s.id}.valid`, `steps.${s.id}.duplicate.isDuplicate`);
      if (s.type === 'data.transform')
        (s.config?.operations ?? []).forEach((op) => op.target && paths.push(op.target));
    });
    return { allIds, draftStepIds, paths, issues, readOnly };
  }, [definition, issues, readOnly]);

  const setSteps = (steps) => {
    setServerIssues(null);
    setDefinition((d) => ({ ...d, steps }));
  };
  const addStep = (type) => setSteps([...(definition.steps ?? []), makeStep(type, ctx.allIds)]);

  function save() {
    startTransition(async () => {
      const res = await saveWorkflowAction(workflow.id, { name, description, definition });
      if (!res.ok) {
        setServerIssues(res.issues ?? null);
        toast.error('Not saved', res.error ?? Object.values(res.fieldErrors ?? {})[0]);
        return;
      }
      if (validation.success) setDefinition(validation.data); // includes server-applied defaults
      toast.success(
        res.newVersion ? `Saved as version ${res.versionNumber}` : 'Saved',
        res.newVersion ? 'Earlier executions keep their original version.' : undefined,
      );
      router.refresh();
    });
  }

  function setStatus(status) {
    startTransition(async () => {
      const res = await setWorkflowStatusAction(workflow.id, status);
      if (!res.ok) return toast.error('Status not changed', res.error);
      toast.success(
        `Workflow ${status === 'active' ? 'activated' : status === 'inactive' ? 'deactivated' : status}`,
        res.warning,
      );
      setConfirm(null);
      router.refresh();
    });
  }

  if (!definition) {
    return (
      <Alert tone="error">
        This workflow has no saved version. Duplicate a template to start again.
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={workflow.status} />
          {workflow.is_demo && <DemoBadge />}
          <span className="text-sm text-ink-subtle">
            Version {version?.version_number ?? '—'} · {countSteps(definition)} steps
          </span>
          {dirty && <Badge tone="amber">Unsaved changes</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          <RunWorkflowButton
            workflowId={workflow.id}
            leads={leads}
            dirty={dirty}
            triggerType={definition.trigger.type}
            disabled={workflow.status === 'archived'}
          />
          {canEdit && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => startTransition(() => duplicateWorkflowAction(workflow.id))}
                disabled={pending}
              >
                <Copy className="h-4 w-4" aria-hidden="true" /> Duplicate
              </Button>
              {workflow.status === 'active' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setStatus('inactive')}
                  loading={pending}
                >
                  Deactivate
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirm('activate')}
                  disabled={dirty || pending}
                >
                  Activate
                </Button>
              )}
              <Button
                size="sm"
                onClick={save}
                loading={pending}
                disabled={!dirty || !validation.success}
              >
                <Save className="h-4 w-4" aria-hidden="true" /> Save version
              </Button>
            </>
          )}
        </div>
      </div>

      {readOnly && (
        <Alert tone="info">
          You can view and run this workflow. Only owners and admins can edit it.
        </Alert>
      )}
      {issues.length > 0 && (
        <Alert tone="error" title={`${issues.length} problem(s) to fix before saving`}>
          <ul className="list-disc pl-5">
            {issues.slice(0, 8).map((issue, i) => (
              <li key={i}>
                <code className="text-xs">{issue.path || 'workflow'}</code>: {issue.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Details" />
            <CardBody className="grid gap-4">
              <Field id="wf-name" label="Name">
                {(aria) => (
                  <Input
                    {...aria}
                    value={name}
                    maxLength={120}
                    disabled={readOnly}
                    onChange={(e) => setName(e.target.value)}
                  />
                )}
              </Field>
              <Field id="wf-description" label="Description" optional>
                {(aria) => (
                  <Textarea
                    {...aria}
                    rows={2}
                    value={description}
                    maxLength={1000}
                    disabled={readOnly}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                )}
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Trigger"
              description={TRIGGERS[definition.trigger.type]?.description}
            />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field id="trigger-type" label="When should this run?">
                {(aria) => (
                  <Select
                    {...aria}
                    disabled={readOnly}
                    value={definition.trigger.type}
                    onChange={(e) => {
                      const type = e.target.value;
                      setServerIssues(null);
                      setDefinition((d) => ({
                        ...d,
                        trigger: {
                          type,
                          config:
                            type === 'schedule'
                              ? { interval: 'daily' }
                              : type === 'webhook'
                                ? { requiredFields: ['email'] }
                                : {},
                        },
                      }));
                    }}
                  >
                    {Object.entries(TRIGGERS).map(([type, t]) => (
                      <option key={type} value={type}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <TriggerConfig
                key={definition.trigger.type}
                trigger={definition.trigger}
                readOnly={readOnly}
                onChange={(trigger) => {
                  setServerIssues(null);
                  setDefinition((d) => ({ ...d, trigger }));
                }}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Steps"
              description="Run top to bottom. Conditions branch into “then” / “else”."
              actions={!readOnly && <AddStepMenu onAdd={addStep} />}
            />
            <CardBody>
              <StepList steps={definition.steps ?? []} onChange={setSteps} ctx={ctx} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          {definition.trigger.type === 'webhook' && canManageWebhooks && (
            <Card>
              <CardHeader
                title="Webhook endpoint"
                description="Authenticated with a per-endpoint secret."
              />
              <CardBody>
                <WebhookPanel
                  workflowId={workflow.id}
                  endpoint={endpoint}
                  siteUrl={siteUrl}
                  status={workflow.status}
                />
              </CardBody>
            </Card>
          )}
          <Suggestions onAdd={addStep} readOnly={readOnly} />
          <Card>
            <CardHeader title="Placeholders" />
            <CardBody>
              <ul className="space-y-1 text-xs text-ink-muted">
                {PLACEHOLDER_HELP.map((h) => (
                  <li key={h}>
                    <code>{'{{'}</code>
                    {h}
                    <code>{'}}'}</code>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-subtle">
                Placeholders are plain lookups. Nothing in a workflow is executed as code.
              </p>
            </CardBody>
          </Card>
          {canEdit && (
            <Card>
              <CardHeader title="More actions" />
              <CardBody className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await saveAsTemplateAction(workflow.id);
                      if (res.ok) toast.success('Saved as workspace template');
                      else toast.error('Could not save template', res.error);
                    })
                  }
                >
                  Save as template
                </Button>
                {workflow.status !== 'archived' ? (
                  <Button variant="secondary" size="sm" onClick={() => setConfirm('archive')}>
                    Archive
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => setStatus('inactive')}>
                    Restore
                  </Button>
                )}
                <Button variant="danger" size="sm" onClick={() => setConfirm('delete')}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
                </Button>
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'activate'}
        onClose={() => setConfirm(null)}
        tone="primary"
        loading={pending}
        title="Activate workflow?"
        description={`Version ${version?.version_number} will run automatically for “${TRIGGERS[definition.trigger.type]?.label}” events.`}
        confirmLabel="Activate"
        onConfirm={() => setStatus('active')}
      />
      <ConfirmDialog
        open={confirm === 'archive'}
        onClose={() => setConfirm(null)}
        tone="primary"
        loading={pending}
        title="Archive workflow?"
        description="Archived workflows stop running and are hidden from the list. Execution history is kept."
        confirmLabel="Archive"
        onConfirm={() => setStatus('archived')}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        loading={pending}
        title="Delete workflow permanently?"
        description="This deletes the workflow, all versions and its entire execution history. Consider archiving instead."
        confirmLabel="Delete forever"
        onConfirm={() =>
          startTransition(async () => {
            const res = await deleteWorkflowAction(workflow.id);
            if (res && !res.ok) toast.error('Not deleted', res.error);
          })
        }
      />
    </div>
  );
}
