import Link from 'next/link';
import {
  AlertOctagon,
  CheckCircle2,
  CircleDashed,
  CornerDownRight,
  Loader2,
  SkipForward,
  XCircle,
} from 'lucide-react';
import { requireSession } from '@/features/auth/session';
import { getExecutionDetail } from '@/features/executions/queries';
import {
  CancelExecutionButton,
  RetryExecutionButton,
} from '@/components/executions/execution-controls';
import { Badge, DemoBadge, SimulatedBadge, StatusBadge } from '@/components/ui/badge';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  DefinitionList,
  PageHeader,
} from '@/components/ui/layout';
import { actionLabel, ACTION_CATALOG } from '@/lib/workflow-engine/catalog';
import { LIMITS, TRIGGERS } from '@/lib/workflow-engine/constants';
import { can } from '@/lib/security/permissions';
import { cn, formatDateTime, formatDuration } from '@/lib/utils/format';

export const metadata = { title: 'Execution' };

const STEP_ICONS = {
  succeeded: <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />,
  failed: <XCircle className="h-5 w-5 text-red-600" aria-hidden="true" />,
  skipped: <SkipForward className="h-5 w-5 text-gray-400" aria-hidden="true" />,
  running: <Loader2 className="h-5 w-5 animate-spin text-blue-600" aria-hidden="true" />,
  pending: <CircleDashed className="h-5 w-5 text-gray-400" aria-hidden="true" />,
};

function Json({ value }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-md bg-gray-50 p-3 text-xs leading-relaxed text-ink">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function StepRow({ step }) {
  const depth = step.step_path.split('.').filter((s) => s === 'then' || s === 'else').length;
  const branch = depth ? step.step_path.split('.').at(-2) : null;
  const meta = ACTION_CATALOG[step.step_type];
  const ai = step.output?.ai;
  const replayed = Boolean(step.replayed_from_step_id);

  return (
    <li
      className={cn('relative flex gap-3 py-4', depth && 'pl-6')}
      style={depth ? { paddingLeft: depth * 24 } : undefined}
    >
      <div className="mt-0.5 shrink-0">{STEP_ICONS[step.status]}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {branch && (
            <CornerDownRight
              className="h-3.5 w-3.5 text-ink-subtle"
              aria-label={`${branch} branch`}
            />
          )}
          <p className="text-sm font-medium">{actionLabel(step.step_type)}</p>
          <code className="text-xs text-ink-subtle">{step.step_id}</code>
          {branch && <Badge>{branch}</Badge>}
          {meta?.simulated && <SimulatedBadge />}
          {ai && <Badge tone={ai.simulated ? 'violet' : 'indigo'}>{ai.label}</Badge>}
          {replayed && (
            <Badge tone="blue" title="Already completed in a previous attempt; not repeated">
              Replayed (idempotent)
            </Badge>
          )}
          <span className="ml-auto text-xs text-ink-subtle tabular-nums">
            {formatDuration(step.duration_ms)}
            {step.attempts > 1 ? ` · ${step.attempts} attempts` : ''}
          </span>
        </div>
        {step.status === 'failed' && (
          <p className="mt-1.5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            <span className="font-mono text-xs">{step.error_code}</span> · {step.error_message}
          </p>
        )}
        {step.status === 'skipped' && step.output?.reason && (
          <p className="mt-1 text-xs text-ink-subtle">{step.output.reason}</p>
        )}
        {step.status !== 'skipped' || replayed ? (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-xs text-brand-700">Input &amp; output</summary>
            <div className="mt-2 grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-ink-subtle">Input (redacted)</p>
                <Json value={step.input} />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-ink-subtle">Output</p>
                <Json value={step.output} />
              </div>
            </div>
          </details>
        ) : null}
      </div>
    </li>
  );
}

export default async function ExecutionDetailPage({ params }) {
  const { id } = await params;
  const session = await requireSession();
  const { execution, steps, attempts } = await getExecutionDetail(session, id);
  const latestAttempt = attempts.at(-1);
  const canRetry =
    execution.status === 'failed' &&
    can(session.role, 'execution.retry') &&
    attempts.length < LIMITS.MAX_EXECUTION_ATTEMPTS &&
    latestAttempt?.id === execution.id;
  const failedStep = steps.find(
    (s) => s.step_id === execution.error_step_id && s.status === 'failed',
  );

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/dashboard/executions" className="hover:underline">
            Executions
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {execution.workflows?.name ?? 'Execution'} <StatusBadge status={execution.status} />
            {execution.is_demo && <DemoBadge />}
          </span>
        }
        description={`Execution ${execution.id}`}
        actions={
          <>
            {canRetry && <RetryExecutionButton executionId={execution.id} />}
            {['pending', 'running'].includes(execution.status) &&
              can(session.role, 'execution.cancel') && (
                <CancelExecutionButton executionId={execution.id} />
              )}
          </>
        }
      />

      {execution.status === 'failed' && (
        <Alert tone="error" title="This execution failed" className="mb-6">
          <p>{execution.error_message}</p>
          {failedStep && (
            <p className="mt-1 text-xs">
              Failed step: {actionLabel(failedStep.step_type)} ({failedStep.step_id}) · code{' '}
              {execution.error_code}
            </p>
          )}
          {execution.error_code === 'INTEGRATION_DISABLED' && (
            <p className="mt-1">
              <Link href="/dashboard/integrations" className="font-medium underline">
                Open Integrations
              </Link>
              , enable it, then retry.
            </p>
          )}
          {!canRetry && execution.status === 'failed' && latestAttempt?.id !== execution.id && (
            <p className="mt-1">
              A newer attempt exists:{' '}
              <Link
                href={`/dashboard/executions/${latestAttempt.id}`}
                className="font-medium underline"
              >
                attempt {latestAttempt.attempt}
              </Link>
              .
            </p>
          )}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Steps"
            description="In execution order. Branch steps are indented; steps in branches that weren't taken are shown as skipped."
          />
          {steps.length === 0 ? (
            <CardBody>
              <p className="text-sm text-ink-subtle">
                No steps were recorded. The definition may have failed validation before running.
              </p>
            </CardBody>
          ) : (
            <ol className="divide-y divide-line px-5">
              {steps.map((step) => (
                <StepRow key={step.id} step={step} />
              ))}
            </ol>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Summary" />
            <CardBody>
              <DefinitionList
                items={[
                  {
                    label: 'Workflow',
                    value: (
                      <Link
                        href={`/dashboard/workflows/${execution.workflow_id}`}
                        className="text-brand-700 hover:underline"
                      >
                        {execution.workflows?.name}
                      </Link>
                    ),
                  },
                  { label: 'Version', value: `v${execution.workflow_versions?.version_number}` },
                  {
                    label: 'Trigger',
                    value: TRIGGERS[execution.trigger_type]?.label ?? execution.trigger_type,
                  },
                  {
                    label: 'Lead',
                    value: execution.leads ? (
                      <Link
                        href={`/dashboard/leads/${execution.leads.id}`}
                        className="text-brand-700 hover:underline"
                      >
                        {execution.leads.name}
                      </Link>
                    ) : (
                      '—'
                    ),
                  },
                  {
                    label: 'Started',
                    value: formatDateTime(execution.started_at ?? execution.created_at),
                  },
                  { label: 'Finished', value: formatDateTime(execution.finished_at) },
                  { label: 'Duration', value: formatDuration(execution.duration_ms) },
                  {
                    label: 'Run by',
                    value:
                      execution.profiles?.full_name ??
                      (execution.created_by ? 'Member' : 'System (queue)'),
                  },
                  {
                    label: 'Attempt',
                    value: `${execution.attempt} of max ${LIMITS.MAX_EXECUTION_ATTEMPTS}`,
                  },
                  {
                    label: 'Steps',
                    value: `${steps.filter((s) => s.status === 'succeeded').length} succeeded · ${steps.filter((s) => s.status === 'failed').length} failed · ${steps.filter((s) => s.status === 'skipped').length} skipped`,
                  },
                ]}
              />
            </CardBody>
          </Card>

          {attempts.length > 1 && (
            <Card>
              <CardHeader
                title="Attempts"
                description="Retries share an idempotency root, so completed side effects aren't repeated."
              />
              <ul className="divide-y divide-line">
                {attempts.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/dashboard/executions/${a.id}`}
                      className={cn(
                        'flex items-center justify-between px-5 py-2.5 text-sm hover:bg-gray-50',
                        a.id === execution.id && 'bg-brand-50/50',
                      )}
                    >
                      <span>Attempt {a.attempt}</span>
                      <StatusBadge status={a.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Trigger payload"
              description="Stored with sensitive keys redacted."
            />
            <CardBody>
              <Json value={execution.trigger_payload} />
            </CardBody>
          </Card>

          {execution.error_code === 'INTERRUPTED' && (
            <Alert tone="warning" title="Interrupted">
              <AlertOctagon className="mr-1 inline h-4 w-4" aria-hidden="true" />
              The server stopped before this run finished (for example a serverless timeout). Retry
              it to continue safely.
            </Alert>
          )}
        </div>
      </div>
    </>
  );
}
