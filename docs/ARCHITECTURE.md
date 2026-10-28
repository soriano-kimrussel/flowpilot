# Architecture

## Overview

```
Browser ──► Next.js (Vercel)  ──────────────►  Supabase
            ├─ proxy.js: session refresh        ├─ Auth (email/password, JWT)
            ├─ Server Components (reads, RLS)   ├─ PostgreSQL + RLS
            ├─ Server Actions (writes, Zod)     ├─ SQL functions (versioning, queue,
            ├─ Route handlers /api/*            │   webhook ingest, metrics, seeding)
            └─ Workflow engine (lib/…)          └─ triggers (signup, lead events)
```

All reads and writes made on behalf of a user go through a Supabase client bound to that user’s session cookie, so **PostgreSQL RLS is the final authority**. Application checks (`lib/security/permissions.js`) exist for clear error messages, not as the only line of defense.

## Layers

| Layer           | Location              | Responsibility                                                                        |
| --------------- | --------------------- | ------------------------------------------------------------------------------------- |
| UI              | `app/`, `components/` | Pages, forms (React Hook Form + Zod), tables, charts                                  |
| Domain services | `features/*`          | Queries and server actions per domain; validation; audit logging                      |
| Engine          | `lib/workflow-engine` | Definition schema, registry, actions, executor, queue (pure JS, persistence injected) |
| AI              | `lib/ai`              | Provider interface + demo/ollama/api implementations                                  |
| Security        | `lib/security`        | Redaction, CSV safety, webhook credentials, permissions                               |
| Data            | `supabase/migrations` | Schema, RLS, functions, templates                                                     |

Dependency direction: `app → components/features → lib`. `lib` never imports from `features` or `app`, and the engine core (`executor.js`, actions) has no Next.js or Supabase imports; persistence comes in through `store` and `services` objects, which is why it is unit-tested with in-memory fakes.

## Authentication

- Supabase Auth email/password; PKCE callback at `/auth/callback`, token-hash confirmation at `/auth/confirm`.
- `proxy.js` (the Next 16 replacement for `middleware.js`) refreshes the session cookie with `@supabase/ssr` and calls `auth.getClaims()` (JWT verification), redirecting unauthenticated users away from `/dashboard`.
- `features/auth/session.js#getSession` derives the user ID from verified claims (never from request input), loads memberships and resolves the active workspace (validated httpOnly cookie → default workspace → first membership).
- Signup creates profile + workspace + owner membership atomically in a database trigger.

## Workflow definition (v1)

```json
{
  "version": 1,
  "trigger": { "type": "lead.created", "config": {} },
  "steps": [
    {
      "id": "score",
      "type": "lead.score",
      "name": "Score lead",
      "config": { "persist": true },
      "onError": "stop"
    },
    {
      "id": "route",
      "type": "condition.evaluate",
      "config": {
        "match": "all",
        "conditions": [{ "field": "steps.score.score", "operator": "gte", "value": 70 }]
      },
      "then": [{ "id": "hot", "type": "lead.update", "config": { "status": "qualified" } }],
      "else": [{ "id": "cold", "type": "lead.update", "config": { "priority": "low" } }]
    }
  ]
}
```

Validated by `lib/workflow-engine/definition.js` (strict Zod schema + semantic checks): known trigger/action types only, per-action config schemas, unique step IDs across branches, max 50 steps / 25 per list / depth 3, branches only on conditions, placeholders restricted to `lead.* | trigger.* | steps.* | vars.* | workflow.* | execution.*`, and draft references must point at earlier steps. The database adds a shape check constraint. Saving creates a **new immutable version**; executions reference the exact version they ran.

Placeholders (`{{lead.name}}`) are resolved by a safe own-property path lookup. **No `eval`, `new Function`, dynamic imports, SQL or shell** are ever derived from definitions (ESLint enforces `no-eval`, `no-new-func`).

## Actions

Registered explicitly in `lib/workflow-engine/registry.js`. Each action has a config schema, output schema, `sideEffect`/`retryable` flags and a `run()` function:

| Action                | Side effect | Notes                                                                                                                   |
| --------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| `lead.validate`       | no          | Required fields, email format, disposable domains, duplicate detection (exact, +tag/Gmail-dot equivalent, name+company) |
| `lead.create`         | yes         | From trigger payload (alias-mapped, validated); unique email per workspace makes it idempotent                          |
| `lead.update`         | yes         | status / assignee / priority / append note; templated text                                                              |
| `lead.score`          | no*         | Explainable rules; persists score + factor breakdown (*idempotent write)                                                |
| `lead.classify`       | no*         | Segment, category, intent, confidence, signals                                                                          |
| `lead.summarize`      | no*         | Summary + key points + next step                                                                                        |
| `ai.draft_reply`      | no          | Personalized draft; never sends                                                                                         |
| `condition.evaluate`  | no          | all/any; 13 operators; branch trace                                                                                     |
| `data.transform`      | no          | set/copy/lowercase/uppercase/trim/template/default/number → `vars.*`                                                    |
| `notification.create` | yes         | In-app notifications, unique key per recipient                                                                          |
| `crm.demo_sync`       | yes         | **Simulated**; activity log only; fails if integration disabled                                                         |
| `email.demo_send`     | yes         | **Simulated** outbox; masked recipient in logs                                                                          |
| `execution.log`       | no          | Templated log message                                                                                                   |

Output is validated against the output schema; invalid output fails the step (`INVALID_OUTPUT`), so a misbehaving provider cannot inject unexpected data.

## Execution engine

`executeWorkflow()` (`lib/workflow-engine/executor.js`):

1. Validate the definition; invalid → execution `failed` (`INVALID_DEFINITION`) without running steps.
2. `pending → running` (guarded transitions; DB update uses `where status = <from>` for optimistic concurrency).
3. Run steps depth-first in order. Each step is persisted as a row (`running` → `succeeded|failed|skipped`) with redacted input/output, attempts, timings.
4. Conditions run the taken branch; the untaken branch is recorded as `skipped` with a reason.
5. Limits: 25 s per execution, 10 s per step, 50 steps (also enforced at runtime).
6. Retries: retryable actions re-attempt only _transient_ errors (timeouts, provider rate limits), at most 3 attempts with short backoff inside the time budget.
7. `onError: continue` records the failure and moves on; otherwise the execution fails with step ID, code and an actionable message, and the actor gets an in-app failure notification.
8. Cancellation is checked before each step.

### Idempotency

- **Request level:** `Idempotency-Key` header → `workflow_executions (workspace_id, idempotency_key)` unique. The UI sends a fresh key per click; retries use `retry:<executionId>` (double clicks can’t create two retries); queued jobs use `job:<jobId>`.
- **Side-effect level:** side-effect steps get `<rootExecutionId>:<stepPath>`. Retries share the root ID, so a step that already succeeded is **replayed from its stored output** (status `skipped`, `replayed_from_step_id` set) instead of being executed again. A partial unique index guarantees a side effect is recorded as succeeded only once.

## Triggers

| Trigger             | How it fires                                                                                                                                                             | Sync/async                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Manual              | `POST /api/workflows/:id/run` from the editor or a lead page (drafts allowed as test runs)                                                                               | Synchronous, bounded                       |
| New lead created    | DB trigger enqueues a job for each active `lead.created` workflow; the creating request immediately processes up to 3 jobs                                               | Async queue, processed in the same request |
| Lead status changed | DB trigger on status change (optional `toStatus` filter in SQL)                                                                                                          | Same as above                              |
| Incoming webhook    | `POST /api/webhooks/:publicId` → `ingest_webhook()` validates + queues → processed via `after()` when `SUPABASE_SECRET_KEY` is set, otherwise from the dashboard or cron | Async                                      |
| Schedule            | `next_run_at` per workflow; `enqueue_due_scheduled_workflows()` called by the daily cron and by “Process queue now”                                                      | Async, best effort                         |

Loop prevention: writes performed by executions set `created_by_execution_id` / `last_changed_by_execution_id`, and the lead triggers ignore those writes, so workflows never re-trigger themselves.

### Job queue

`workflow_jobs` with `claim_workflow_jobs()` (`FOR UPDATE SKIP LOCKED`, max attempts, stale-lock reclaim after 5 min). Processing runs in short bursts (≤ 20 s) inside normal requests; there is **no long-running worker**. Executions stuck in `pending/running` for more than 10 minutes (e.g. a killed function) are marked `failed` with `INTERRUPTED` and can be retried safely.

## AI providers

`getAIProvider(env)` returns an object with `classifyLead`, `scoreLead`, `summarizeLead`, `draftReply`, `extractLeadFields`, `suggestSteps`, each returning `{ result, meta }` where `meta = { provider, model, simulated, label, fallback?, fallbackReason? }`.

- `demo` (default): deterministic rules/templates, no network.
- `ollama`: local development only.
- `api`: OpenAI-compatible `/chat/completions`, only when explicitly configured.

Real providers receive minimized data (first name, company, title, size, budget, source, message with emails and phones redacted), must return JSON that passes a Zod schema, and are bounded by timeout and size. Any failure (timeout, 429, 5xx, malformed output) falls back to rules and is labeled as a fallback. Scoring and step suggestions always stay rule-based.

## Analytics

`get_dashboard_metrics(workspace, days, include_demo)` computes all dashboard aggregates in one SQL round trip under RLS; `features/analytics/metrics.js` turns them into display values (e.g. success rate = succeeded / (succeeded + failed), undefined when nothing finished). Demo rows carry `is_demo` and can be excluded.
