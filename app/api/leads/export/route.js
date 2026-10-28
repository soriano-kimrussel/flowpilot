import { NextResponse } from 'next/server';
import { getSession } from '@/features/auth/session';
import { logAudit } from '@/features/audit/log';
import { applyLeadFilters } from '@/features/leads/queries';
import { can } from '@/lib/security/permissions';
import { toCsv } from '@/lib/security/csv';
import { leadFilterSchema } from '@/lib/validation/lead';

const MAX_ROWS = 5000;
const COLUMNS = [
  { key: 'name', header: 'Name' },
  { key: 'email', header: 'Email' },
  { key: 'company', header: 'Company' },
  { key: 'job_title', header: 'Job title' },
  { key: 'source', header: 'Source' },
  { key: 'status', header: 'Status' },
  { key: 'score', header: 'Score' },
  { key: 'classification', header: 'Segment' },
  { key: 'assignee', header: 'Assignee' },
  { key: 'priority', header: 'Priority' },
  { key: 'created_at', header: 'Created at' },
  { key: 'last_activity_at', header: 'Last activity' },
];

export async function GET(request) {
  const session = await getSession();
  if (!session?.workspaceId)
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!can(session.role, 'lead.export'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const filters = leadFilterSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  let query = session.supabase
    .from('leads')
    .select(COLUMNS.map((c) => c.key).join(', '))
    .eq('workspace_id', session.workspaceId);
  query = applyLeadFilters(query, filters);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(MAX_ROWS);
  if (error) return NextResponse.json({ error: 'Could not export leads' }, { status: 500 });

  await logAudit(session.supabase, {
    workspaceId: session.workspaceId,
    actorId: session.user.id,
    action: 'lead.exported',
    entityType: 'lead',
    metadata: { rows: data.length },
  });

  const filename = `flowpilot-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(`﻿${toCsv(data, COLUMNS)}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
