// Local database tests: real migrations + RLS + functions in PGlite. No credentials required.
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  asUser,
  asUserCommit,
  createTestDatabase,
  createUser,
  expectDenied,
} from './helpers/pglite-db';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
let db;
let alice; // owner of workspace A
let bob; // owner of workspace B
let carol; // member (not admin) of workspace A

async function rows(promise) {
  return (await promise).rows;
}

beforeAll(async () => {
  db = await createTestDatabase();
  alice = await createUser(db, {
    email: 'alice@a.example',
    fullName: 'Alice',
    workspaceName: 'Workspace A',
  });
  bob = await createUser(db, {
    email: 'bob@b.example',
    fullName: 'Bob',
    workspaceName: 'Workspace B',
  });
  carol = await createUser(db, { email: 'carol@a.example', fullName: 'Carol' });
  await asUserCommit(db, alice.id, (tx) =>
    tx.query('select public.add_workspace_member($1, $2, $3)', [
      alice.workspaceId,
      'carol@a.example',
      'member',
    ]),
  );
  // Seed a lead in each workspace (as owners).
  for (const user of [alice, bob]) {
    await asUserCommit(db, user.id, (tx) =>
      tx.query(
        'insert into public.leads (workspace_id, name, email, created_by) values ($1, $2, $3, $4)',
        [
          user.workspaceId,
          `${user === alice ? 'A' : 'B'} Lead`,
          `lead@${user === alice ? 'a' : 'b'}.example`,
          user.id,
        ],
      ),
    );
  }
}, 60_000);

describe('signup bootstrap', () => {
  it('creates a profile, a workspace, owner membership and default integrations', async () => {
    const profile = await rows(
      db.query('select email, full_name, default_workspace_id from public.profiles where id = $1', [
        alice.id,
      ]),
    );
    expect(profile[0]).toMatchObject({
      email: 'alice@a.example',
      full_name: 'Alice',
      default_workspace_id: alice.workspaceId,
    });
    const ws = await rows(
      db.query('select name from public.workspaces where id = $1', [alice.workspaceId]),
    );
    expect(ws[0].name).toBe('Workspace A');
    const member = await rows(
      db.query(
        'select role from public.workspace_members where user_id = $1 and workspace_id = $2',
        [alice.id, alice.workspaceId],
      ),
    );
    expect(member[0].role).toBe('owner');
    const integrations = await rows(
      db.query(
        'select provider, enabled from public.integrations where workspace_id = $1 order by provider',
        [alice.workspaceId],
      ),
    );
    expect(integrations.map((i) => i.provider)).toEqual([
      'ai_provider',
      'demo_crm',
      'demo_email',
      'webhooks',
    ]);
  });
});

describe('RLS: cross-workspace isolation', () => {
  it('users only see their own workspace rows', async () => {
    const leads = await asUser(db, alice.id, (tx) =>
      rows(tx.query('select name from public.leads')),
    );
    expect(leads.map((l) => l.name)).toEqual(['A Lead']);
    const workspaces = await asUser(db, bob.id, (tx) =>
      rows(tx.query('select name from public.workspaces')),
    );
    expect(workspaces.map((w) => w.name)).toEqual(['Workspace B']);
    const integrations = await asUser(db, bob.id, (tx) =>
      rows(tx.query('select workspace_id from public.integrations')),
    );
    expect(new Set(integrations.map((i) => i.workspace_id))).toEqual(new Set([bob.workspaceId]));
  });

  it('cannot insert into another workspace', async () => {
    const error = await expectDenied(
      asUser(db, bob.id, (tx) =>
        tx.query('insert into public.leads (workspace_id, name, email) values ($1, $2, $3)', [
          alice.workspaceId,
          'Intruder',
          'x@evil.example',
        ]),
      ),
    );
    expect(error.message).toMatch(/row-level security/);
  });

  it('cannot update or delete another workspace’s rows (0 rows affected)', async () => {
    const updated = await asUser(db, bob.id, (tx) =>
      tx.query(`update public.leads set name = 'pwned' where workspace_id = $1`, [
        alice.workspaceId,
      ]),
    );
    expect(updated.affectedRows).toBe(0);
    const deleted = await asUser(db, bob.id, (tx) =>
      tx.query('delete from public.leads where workspace_id = $1', [alice.workspaceId]),
    );
    expect(deleted.affectedRows).toBe(0);
  });

  it('cannot move a row to another workspace', async () => {
    const error = await expectDenied(
      asUser(db, alice.id, (tx) =>
        tx.query('update public.leads set workspace_id = $1 where workspace_id = $2', [
          bob.workspaceId,
          alice.workspaceId,
        ]),
      ),
    );
    expect(error.message).toMatch(/workspace_id cannot be changed|row-level security/);
  });

  it('anonymous requests cannot read any table', async () => {
    const error = await expectDenied(
      asUser(db, null, (tx) => tx.query('select * from public.leads'), { role: 'anon' }),
    );
    expect(error.message).toMatch(/permission denied/);
  });

  it('notifications are visible only to their recipient', async () => {
    await asUserCommit(db, alice.id, (tx) =>
      tx.query(
        'insert into public.notifications (workspace_id, user_id, title) values ($1, $2, $3)',
        [alice.workspaceId, alice.id, 'For Alice'],
      ),
    );
    const carolSees = await asUser(db, carol.id, (tx) =>
      rows(tx.query('select title from public.notifications')),
    );
    expect(carolSees).toEqual([]);
    const error = await expectDenied(
      asUser(db, bob.id, (tx) =>
        tx.query(
          'insert into public.notifications (workspace_id, user_id, title) values ($1, $2, $3)',
          [alice.workspaceId, alice.id, 'Spam'],
        ),
      ),
    );
    expect(error.message).toMatch(/row-level security/);
  });
});

describe('RLS: roles within a workspace', () => {
  it('members can read and edit leads but cannot create workflows or edit integrations', async () => {
    const leads = await asUser(db, carol.id, (tx) =>
      rows(tx.query('select name from public.leads')),
    );
    expect(leads.map((l) => l.name)).toEqual(['A Lead']);
    const error = await expectDenied(
      asUser(db, carol.id, (tx) =>
        tx.query('insert into public.workflows (workspace_id, name) values ($1, $2)', [
          alice.workspaceId,
          'Nope',
        ]),
      ),
    );
    expect(error.message).toMatch(/row-level security/);
    const integration = await asUser(db, carol.id, (tx) =>
      tx.query(`update public.integrations set enabled = false where workspace_id = $1`, [
        alice.workspaceId,
      ]),
    );
    expect(integration.affectedRows).toBe(0);
  });

  it('members cannot see audit logs or webhook endpoints; admins can', async () => {
    await asUserCommit(db, alice.id, (tx) =>
      tx.query(
        `insert into public.audit_logs (workspace_id, actor_id, action, entity_type) values ($1, $2, 'test.action', 'test')`,
        [alice.workspaceId, alice.id],
      ),
    );
    expect(
      await asUser(db, carol.id, (tx) => rows(tx.query('select * from public.audit_logs'))),
    ).toEqual([]);
    expect(
      (await asUser(db, alice.id, (tx) => rows(tx.query('select * from public.audit_logs'))))
        .length,
    ).toBeGreaterThan(0);
  });

  it('enforces membership management rules', async () => {
    const memberAdds = await expectDenied(
      asUser(db, carol.id, (tx) =>
        tx.query('select public.add_workspace_member($1, $2, $3)', [
          alice.workspaceId,
          'bob@b.example',
          'member',
        ]),
      ),
    );
    expect(memberAdds.message).toMatch(/Only owners and admins/);
    const unknown = await expectDenied(
      asUser(db, alice.id, (tx) =>
        tx.query('select public.add_workspace_member($1, $2, $3)', [
          alice.workspaceId,
          'nobody@x.example',
          'member',
        ]),
      ),
    );
    expect(unknown.message).toMatch(/register first/);
    const ownerRemoval = await asUser(db, carol.id, (tx) =>
      tx.query(`delete from public.workspace_members where role = 'owner'`),
    );
    expect(ownerRemoval.affectedRows).toBe(0);
  });

  it('users can only change allowed profile columns', async () => {
    const error = await expectDenied(
      asUser(db, alice.id, (tx) =>
        tx.query(`update public.profiles set email = 'x@y.example' where id = $1`, [alice.id]),
      ),
    );
    expect(error.message).toMatch(/permission denied/);
    const ok = await asUser(db, alice.id, (tx) =>
      tx.query(`update public.profiles set full_name = 'Alice B' where id = $1`, [alice.id]),
    );
    expect(ok.affectedRows).toBe(1);
  });
});

describe('workflows, versions and executions', () => {
  const definition = {
    version: 1,
    trigger: { type: 'lead.created', config: {} },
    steps: [
      {
        id: 'log',
        type: 'execution.log',
        config: { message: 'hi', level: 'info' },
        onError: 'stop',
      },
    ],
  };
  let workflowId;
  let versionId;

  beforeAll(async () => {
    workflowId = await asUserCommit(db, alice.id, async (tx) => {
      const { rows: r } = await tx.query(
        `insert into public.workflows (workspace_id, name, status, created_by) values ($1, 'Qualify', 'active', $2) returning id`,
        [alice.workspaceId, alice.id],
      );
      return r[0].id;
    });
    versionId = await asUserCommit(db, alice.id, async (tx) => {
      const { rows: r } = await tx.query('select (public.create_workflow_version($1, $2)).id', [
        workflowId,
        JSON.stringify(definition),
      ]);
      return r[0].id;
    });
  });

  it('versions increment and update the workflow pointer and trigger', async () => {
    const second = await asUser(db, alice.id, (tx) =>
      rows(
        tx.query(
          'select (v).version_number from (select public.create_workflow_version($1, $2) as v) s',
          [workflowId, JSON.stringify(definition)],
        ),
      ),
    );
    expect(second[0].version_number).toBe(2);
    const wf = await rows(
      db.query('select current_version_id, trigger_type from public.workflows where id = $1', [
        workflowId,
      ]),
    );
    expect(wf[0]).toMatchObject({ current_version_id: versionId, trigger_type: 'lead.created' });
  });

  it('members and other workspaces cannot create versions', async () => {
    const member = await expectDenied(
      asUser(db, carol.id, (tx) =>
        tx.query('select public.create_workflow_version($1, $2)', [
          workflowId,
          JSON.stringify(definition),
        ]),
      ),
    );
    expect(member.message).toMatch(/not found or you do not have permission/);
    await expectDenied(
      asUser(db, bob.id, (tx) =>
        tx.query('select public.create_workflow_version($1, $2)', [
          workflowId,
          JSON.stringify(definition),
        ]),
      ),
    );
  });

  it('rejects malformed definitions at the database level', async () => {
    const error = await expectDenied(
      asUser(db, alice.id, (tx) =>
        tx.query('select public.create_workflow_version($1, $2)', [
          workflowId,
          '{"steps": "nope"}',
        ]),
      ),
    );
    expect(error.message).toMatch(/workflow_definition_shape/);
  });

  it('creating a lead enqueues a job for active lead.created workflows, but not for workflow-created leads', async () => {
    await asUserCommit(db, carol.id, (tx) =>
      tx.query('insert into public.leads (workspace_id, name, email) values ($1, $2, $3)', [
        alice.workspaceId,
        'Trigger Me',
        'trigger@a.example',
      ]),
    );
    const jobs = await rows(
      db.query(
        `select trigger_type, idempotency_key from public.workflow_jobs where workflow_id = $1`,
        [workflowId],
      ),
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].trigger_type).toBe('lead.created');

    await asUserCommit(db, alice.id, (tx) =>
      tx.query(
        'insert into public.leads (workspace_id, name, email, created_by_execution_id) values ($1, $2, $3, gen_random_uuid())',
        [alice.workspaceId, 'From workflow', 'loop@a.example'],
      ),
    );
    const after = await rows(
      db.query('select count(*)::int as n from public.workflow_jobs where workflow_id = $1', [
        workflowId,
      ]),
    );
    expect(after[0].n).toBe(1);
  });

  it('jobs are claimed only within the caller’s workspace and never twice', async () => {
    const bobClaims = await asUser(db, bob.id, (tx) =>
      rows(
        tx.query('select id from public.claim_workflow_jobs($1, 5, $2)', [
          alice.workspaceId,
          'bob',
        ]),
      ),
    );
    expect(bobClaims).toEqual([]);
    const first = await asUserCommit(db, carol.id, (tx) =>
      rows(
        tx.query('select id, attempts from public.claim_workflow_jobs($1, 5, $2)', [
          alice.workspaceId,
          'w1',
        ]),
      ),
    );
    expect(first).toHaveLength(1);
    expect(first[0].attempts).toBe(1);
    const second = await asUser(db, carol.id, (tx) =>
      rows(
        tx.query('select id from public.claim_workflow_jobs($1, 5, $2)', [alice.workspaceId, 'w2']),
      ),
    );
    expect(second).toEqual([]);
  });

  it('executions are unique per idempotency key and immutable once finished', async () => {
    const execId = await asUserCommit(db, carol.id, async (tx) => {
      const { rows: r } = await tx.query(
        `insert into public.workflow_executions (workspace_id, workflow_id, workflow_version_id, trigger_type, idempotency_key, created_by)
         values ($1, $2, $3, 'manual', 'req-12345678', $4) returning id`,
        [alice.workspaceId, workflowId, versionId, carol.id],
      );
      return r[0].id;
    });
    const dupe = await expectDenied(
      asUser(db, carol.id, (tx) =>
        tx.query(
          `insert into public.workflow_executions (workspace_id, workflow_id, workflow_version_id, trigger_type, idempotency_key) values ($1, $2, $3, 'manual', 'req-12345678')`,
          [alice.workspaceId, workflowId, versionId],
        ),
      ),
    );
    expect(dupe.message).toMatch(/workflow_executions_idempotency_key/);

    await asUserCommit(db, carol.id, (tx) =>
      tx.query(`update public.workflow_executions set status = 'succeeded' where id = $1`, [
        execId,
      ]),
    );
    const tamper = await asUser(db, carol.id, (tx) =>
      tx.query(`update public.workflow_executions set status = 'failed' where id = $1`, [execId]),
    );
    expect(tamper.affectedRows).toBe(0);
    const stepError = await expectDenied(
      asUser(db, carol.id, (tx) =>
        tx.query(
          `insert into public.workflow_execution_steps (execution_id, workspace_id, step_id, step_type, step_path, position) values ($1, $2, 'x', 'execution.log', 'x', 0)`,
          [execId, alice.workspaceId],
        ),
      ),
    );
    expect(stepError.message).toMatch(/row-level security/);
  });

  it('records a side effect as completed only once per idempotency key', async () => {
    const execId = await asUserCommit(db, carol.id, async (tx) => {
      const { rows: r } = await tx.query(
        `insert into public.workflow_executions (workspace_id, workflow_id, workflow_version_id, trigger_type, status) values ($1, $2, $3, 'manual', 'running') returning id`,
        [alice.workspaceId, workflowId, versionId],
      );
      return r[0].id;
    });
    const insertStep = (tx) =>
      tx.query(
        `insert into public.workflow_execution_steps (execution_id, workspace_id, step_id, step_type, step_path, position, status, idempotency_key)
         values ($1, $2, 'notify', 'notification.create', 'notify', 0, 'succeeded', 'root-1:notify')`,
        [execId, alice.workspaceId],
      );
    await asUserCommit(db, carol.id, insertStep);
    const error = await expectDenied(asUser(db, carol.id, insertStep));
    expect(error.message).toMatch(/workflow_execution_steps_side_effect_key/);
  });
});

describe('webhook ingestion', () => {
  const secret = 'whsec_test_secret_value';
  const publicId = 'wh_ABCDEFGHIJKLMNOPQRSTuv12';
  let workflowId;

  beforeAll(async () => {
    workflowId = await asUserCommit(db, bob.id, async (tx) => {
      const { rows: r } = await tx.query(
        `insert into public.workflows (workspace_id, name, status) values ($1, 'Hook', 'active') returning id`,
        [bob.workspaceId],
      );
      const id = r[0].id;
      await tx.query('select public.create_workflow_version($1, $2)', [
        id,
        JSON.stringify({
          version: 1,
          trigger: { type: 'webhook', config: { requiredFields: ['email'] } },
          steps: [{ id: 'log', type: 'execution.log', config: { message: 'x' } }],
        }),
      ]);
      await tx.query(
        `insert into public.webhook_endpoints (workspace_id, workflow_id, public_id, secret_hash, secret_hint) values ($1, $2, $3, $4, '…alue')`,
        [bob.workspaceId, id, publicId, sha256(secret)],
      );
      return id;
    });
  });

  const ingest = (hash, payload, key = null) =>
    asUserCommit(
      db,
      null,
      (tx) =>
        rows(
          tx.query('select public.ingest_webhook($1, $2, $3, $4) as r', [
            publicId,
            hash,
            JSON.stringify(payload),
            key,
          ]),
        ),
      'anon',
    ).then((r) => r[0].r);

  it('rejects wrong secrets without revealing anything', async () => {
    expect(await ingest(sha256('wrong'), { email: 'a@b.example' })).toEqual({
      status: 'unauthorized',
    });
    const unknown = await asUserCommit(
      db,
      null,
      (tx) =>
        rows(
          tx.query('select public.ingest_webhook($1, $2, $3, null) as r', [
            'wh_doesnotexist000000000',
            sha256(secret),
            '{}',
          ]),
        ),
      'anon',
    );
    expect(unknown[0].r).toEqual({ status: 'unauthorized' });
  });

  it('validates required fields from the trigger config', async () => {
    const result = await ingest(sha256(secret), { name: 'No email' });
    expect(result).toMatchObject({
      status: 'invalid_payload',
      message: 'Missing required field: email',
    });
  });

  it('accepts once per idempotency key and queues a job', async () => {
    const first = await ingest(sha256(secret), { email: 'a@b.example' }, 'form-1');
    expect(first.status).toBe('accepted');
    const second = await ingest(sha256(secret), { email: 'a@b.example' }, 'form-1');
    expect(second).toMatchObject({ status: 'duplicate', job_id: first.job_id });
    const jobs = await rows(
      db.query('select count(*)::int as n from public.workflow_jobs where workflow_id = $1', [
        workflowId,
      ]),
    );
    expect(jobs[0].n).toBe(1);
  });

  it('rate limits bursts', async () => {
    let last;
    for (let i = 0; i < 31; i += 1)
      last = await ingest(sha256(secret), { email: `r${i}@b.example` }, `burst-${i}`);
    expect(last).toMatchObject({ status: 'rate_limited', retry_after: 60 });
  });

  it('anon cannot read the endpoint table directly', async () => {
    await expectDenied(
      asUser(db, null, (tx) => tx.query('select secret_hash from public.webhook_endpoints'), {
        role: 'anon',
      }),
    );
  });
});

describe('demo data and metrics', () => {
  it('only owners/admins can load demo data, and it is flagged and removable', async () => {
    const denied = await expectDenied(
      asUser(db, carol.id, (tx) =>
        tx.query('select public.seed_demo_data($1)', [alice.workspaceId]),
      ),
    );
    expect(denied.message).toMatch(/Only workspace owners and admins/);
    await expectDenied(
      asUser(db, bob.id, (tx) => tx.query('select public.seed_demo_data($1)', [alice.workspaceId])),
    );

    const loaded = await asUserCommit(db, alice.id, (tx) =>
      rows(tx.query('select public.seed_demo_data($1) as r', [alice.workspaceId])),
    );
    expect(loaded[0].r).toMatchObject({ status: 'loaded', leads: 13, executions: 28 });
    const again = await asUser(db, alice.id, (tx) =>
      rows(tx.query('select public.seed_demo_data($1) as r', [alice.workspaceId])),
    );
    expect(again[0].r.status).toBe('already_loaded');

    // Demo leads must not enqueue jobs for the active lead.created workflow.
    const demoJobs = await rows(
      db.query(
        `select count(*)::int as n from public.workflow_jobs j join public.leads l on l.id = j.lead_id where l.is_demo`,
      ),
    );
    expect(demoJobs[0].n).toBe(0);
  });

  it('computes workspace-scoped metrics and can exclude demo data', async () => {
    const withDemo = await asUser(db, alice.id, (tx) =>
      rows(tx.query('select public.get_dashboard_metrics($1, 14, true) as m', [alice.workspaceId])),
    );
    const m = withDemo[0].m;
    expect(m.executions.total).toBeGreaterThanOrEqual(28);
    expect(m.executions.failed).toBeGreaterThan(0);
    expect(m.volume).toHaveLength(14);
    expect(m.failing_actions.length).toBeGreaterThan(0);
    expect(m.has_demo_data).toBe(true);

    const withoutDemo = await asUser(db, alice.id, (tx) =>
      rows(
        tx.query('select public.get_dashboard_metrics($1, 14, false) as m', [alice.workspaceId]),
      ),
    );
    expect(withoutDemo[0].m.executions.total).toBeLessThan(m.executions.total);

    const crossWorkspace = await asUser(db, bob.id, (tx) =>
      rows(tx.query('select public.get_dashboard_metrics($1, 14, true) as m', [alice.workspaceId])),
    );
    expect(crossWorkspace[0].m.executions.total).toBe(0);
    expect(crossWorkspace[0].m.leads.total).toBe(0);
  });

  it('clears only demo data', async () => {
    const cleared = await asUserCommit(db, alice.id, (tx) =>
      rows(tx.query('select public.clear_demo_data($1) as r', [alice.workspaceId])),
    );
    expect(cleared[0].r).toMatchObject({ status: 'cleared', workflows: 3, leads: 13 });
    const remaining = await rows(
      db.query('select name from public.leads where workspace_id = $1 and is_demo', [
        alice.workspaceId,
      ]),
    );
    expect(remaining).toEqual([]);
    const real = await rows(
      db.query(
        `select count(*)::int as n from public.leads where workspace_id = $1 and not is_demo`,
        [alice.workspaceId],
      ),
    );
    expect(real[0].n).toBeGreaterThan(0);
  });
});

describe('built-in templates', () => {
  it('are installed and readable by any signed-in user', async () => {
    const templates = await asUser(db, bob.id, (tx) =>
      rows(tx.query('select slug from public.workflow_templates where is_system order by slug')),
    );
    expect(templates.map((t) => t.slug)).toEqual([
      'daily-pipeline-check',
      'lead-data-cleanup',
      'lead-qualification',
      'qualified-follow-up',
      'webhook-lead-intake',
    ]);
  });
});
