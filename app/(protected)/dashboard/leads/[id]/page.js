import Link from 'next/link';
import { Copy, Pencil } from 'lucide-react';
import { requireSession } from '@/features/auth/session';
import { getLeadDetail, listRunnableWorkflows } from '@/features/leads/queries';
import {
  AnalyzeLeadButton,
  ArchiveLeadButton,
  LeadStatusSelect,
  RunWorkflowForLead,
} from '@/components/leads/lead-actions';
import { Badge, DemoBadge, ScoreBadge, SimulatedBadge, StatusBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  DefinitionList,
  EmptyState,
  PageHeader,
} from '@/components/ui/layout';
import {
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelative,
  humanize,
} from '@/lib/utils/format';

export async function generateMetadata() {
  return { title: 'Lead' };
}

function AiLabel({ ai }) {
  if (!ai) return null;
  return <Badge tone={ai.simulated ? 'violet' : 'indigo'}>{ai.label}</Badge>;
}

export default async function LeadDetailPage({ params }) {
  const { id } = await params;
  const session = await requireSession();
  const [{ lead, activities, executions, latestDraft, duplicates }, workflows] = await Promise.all([
    getLeadDetail(session, id),
    listRunnableWorkflows(session),
  ]);
  const score = lead.score_details;
  const classification = lead.classification_details;
  const draft = latestDraft?.output;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/dashboard/leads" className="hover:underline">
            Leads
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {lead.name}
            {lead.is_demo && <DemoBadge />}
            {lead.archived_at && <Badge>Archived</Badge>}
          </span>
        }
        description={[lead.job_title, lead.company].filter(Boolean).join(' at ') || lead.email}
        actions={
          <>
            <LeadStatusSelect leadId={lead.id} status={lead.status} />
            <AnalyzeLeadButton leadId={lead.id} />
            <ArchiveLeadButton leadId={lead.id} archived={Boolean(lead.archived_at)} />
            <ButtonLink href={`/dashboard/leads/${lead.id}/edit`} variant="secondary" size="sm">
              <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
            </ButtonLink>
          </>
        }
      />

      {duplicates.length > 0 && (
        <Alert tone="warning" title="Possible duplicates" className="mb-6">
          <ul className="list-disc pl-5">
            {duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/dashboard/leads/${d.id}`} className="font-medium underline">
                  {d.name}
                </Link>{' '}
                ({d.reason})
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DefinitionList
                items={[
                  { label: 'Email', value: lead.email },
                  { label: 'Phone', value: lead.phone },
                  { label: 'Company', value: lead.company },
                  { label: 'Job title', value: lead.job_title },
                  {
                    label: 'Company size',
                    value: lead.company_size ? formatNumber(lead.company_size) : null,
                  },
                  { label: 'Budget', value: lead.budget ? `$${formatNumber(lead.budget)}` : null },
                  { label: 'Source', value: humanize(lead.source) },
                  { label: 'Status', value: <StatusBadge status={lead.status} /> },
                  { label: 'Priority', value: humanize(lead.priority) },
                  { label: 'Assignee', value: lead.assignee },
                  { label: 'Created', value: formatDateTime(lead.created_at) },
                  { label: 'Last activity', value: formatRelative(lead.last_activity_at) },
                ]}
              />
              {lead.message && (
                <div className="mt-5">
                  <p className="text-xs font-medium text-ink-subtle">Inquiry message</p>
                  <p className="mt-1 text-sm whitespace-pre-wrap text-ink">{lead.message}</p>
                </div>
              )}
              {lead.notes && (
                <div className="mt-5">
                  <p className="text-xs font-medium text-ink-subtle">Internal notes</p>
                  <p className="mt-1 text-sm whitespace-pre-wrap text-ink">{lead.notes}</p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Score explanation"
              description="Every point comes from a transparent rule."
              actions={
                <div className="flex items-center gap-2">
                  <AiLabel ai={score?.ai} />
                  <ScoreBadge score={lead.score} />
                </div>
              }
            />
            <CardBody>
              {!score ? (
                <EmptyState
                  title="Not scored yet"
                  description="Run a workflow with a Score lead step, or click Analyze."
                />
              ) : score.demo ? (
                <p className="text-sm text-ink-muted">{score.explanation}</p>
              ) : (
                <>
                  <p className="mb-4 text-sm text-ink">{score.explanation}</p>
                  <ul className="divide-y divide-line rounded-md border border-line">
                    {score.factors?.map((f) => (
                      <li
                        key={f.rule}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <span className="text-ink-muted">{f.reason}</span>
                        <span
                          className={`font-medium tabular-nums ${f.points > 0 ? 'text-emerald-700' : f.points < 0 ? 'text-red-700' : 'text-ink-subtle'}`}
                        >
                          {f.points > 0 ? `+${f.points}` : f.points}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-ink-subtle">
                    Rules {score.rulesVersion} · scored {formatRelative(score.scored_at)} · grade{' '}
                    {score.grade} ({score.label})
                  </p>
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="AI summary & classification"
              actions={<AiLabel ai={classification?.ai} />}
            />
            <CardBody className="space-y-4">
              {lead.ai_summary ? (
                <p className="text-sm text-ink">{lead.ai_summary}</p>
              ) : (
                <p className="text-sm text-ink-subtle">No summary yet.</p>
              )}
              {classification && !classification.demo && (
                <div className="flex flex-wrap gap-2">
                  <Badge tone="indigo">Segment: {humanize(classification.segment)}</Badge>
                  <Badge tone="blue">Category: {humanize(classification.category)}</Badge>
                  <Badge
                    tone={
                      classification.intent === 'high'
                        ? 'green'
                        : classification.intent === 'low'
                          ? 'gray'
                          : 'amber'
                    }
                  >
                    Intent: {classification.intent}
                  </Badge>
                  <Badge>Confidence {Math.round(classification.confidence * 100)}%</Badge>
                </div>
              )}
              {classification?.signals?.length > 0 && (
                <p className="text-xs text-ink-subtle">
                  Signals: {classification.signals.join(' · ')}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Latest follow-up draft"
              description="Drafts are never sent automatically. Simulated sends appear in the activity log."
              actions={<AiLabel ai={draft?.ai} />}
            />
            <CardBody>
              {draft?.subject ? (
                <div className="rounded-md border border-line bg-gray-50/60 p-4">
                  <p className="text-sm font-medium">Subject: {draft.subject}</p>
                  <pre className="mt-3 font-sans text-sm whitespace-pre-wrap text-ink">
                    {draft.body}
                  </pre>
                  <p className="mt-3 flex items-center gap-1 text-xs text-ink-subtle">
                    <Copy className="h-3 w-3" aria-hidden="true" /> Generated{' '}
                    {formatRelative(latestDraft.created_at)} ·{' '}
                    <Link
                      href={`/dashboard/executions/${latestDraft.execution_id}`}
                      className="underline"
                    >
                      view execution
                    </Link>
                  </p>
                </div>
              ) : (
                <p className="text-sm text-ink-subtle">
                  No draft yet. Run a workflow that includes a “Draft follow-up” step.
                </p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Run a workflow" description="Manual run for this lead." />
            <CardBody>
              <RunWorkflowForLead leadId={lead.id} workflows={workflows} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Workflow executions" />
            {executions.length === 0 ? (
              <CardBody>
                <p className="text-sm text-ink-subtle">No executions for this lead.</p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-line">
                {executions.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/dashboard/executions/${e.id}`}
                      className="block px-4 py-3 hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{e.workflows?.name}</span>
                        <StatusBadge status={e.status} />
                      </div>
                      <p className="text-xs text-ink-subtle">
                        {formatRelative(e.created_at)} · {formatDuration(e.duration_ms)}
                      </p>
                      {e.error_message && (
                        <p className="mt-1 line-clamp-2 text-xs text-red-700">{e.error_message}</p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Activity" />
            {activities.length === 0 ? (
              <CardBody>
                <p className="text-sm text-ink-subtle">No activity yet.</p>
              </CardBody>
            ) : (
              <ol className="space-y-4 px-4 py-4">
                {activities.map((a) => (
                  <li key={a.id} className="relative border-l-2 border-line pl-4">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
                      {a.description}
                      {a.metadata?.simulated && <SimulatedBadge />}
                    </p>
                    <p className="text-xs text-ink-subtle">
                      {formatRelative(a.created_at)}
                      {a.profiles?.full_name
                        ? ` · ${a.profiles.full_name}`
                        : a.execution_id
                          ? ' · workflow'
                          : ''}
                    </p>
                    {a.type === 'email_simulated' && a.metadata?.body && (
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer text-brand-700">
                          View simulated email
                        </summary>
                        <pre className="mt-1 rounded bg-gray-50 p-2 font-sans whitespace-pre-wrap text-ink-muted">
                          {a.metadata.body}
                        </pre>
                      </details>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
