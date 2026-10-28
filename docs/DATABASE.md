# Database

PostgreSQL on Supabase. Migrations live in `supabase/migrations/` and are applied in filename order:

| File                           | Contents                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `…0100_schema.sql`             | Tables, constraints, indexes, `updated_at` triggers                                              |
| `…0200_rls.sql`                | `private` helper functions, workspace-immutability triggers, RLS policies, column grants         |
| `…0300_functions.sql`          | Signup bootstrap, membership RPCs, versioning, webhook ingest, job queue, lead triggers, metrics |
| `…0400_templates_and_demo.sql` | Built-in templates, `seed_demo_data` / `clear_demo_data`                                         |

## Tables

| Table                      | Purpose                                                    | Key constraints                                                               |
| -------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `profiles`                 | 1:1 with `auth.users`                                      | unique lower(email)                                                           |
| `workspaces`               | Tenants                                                    | unique slug                                                                   |
| `workspace_members`        | Membership + role (`owner/admin/member`)                   | unique (workspace_id, user_id)                                                |
| `workflows`                | Workflow metadata, status, trigger, schedule               | FK current_version_id                                                         |
| `workflow_versions`        | Immutable JSONB definitions                                | unique (workflow_id, version_number), shape CHECK, ≤ 64 KB                    |
| `webhook_endpoints`        | Opaque public ID + SHA-256 secret hash per workflow        | unique workflow_id, unique public_id                                          |
| `webhook_requests`         | Rate limiting + dedupe log                                 | unique (endpoint_id, idempotency_key)                                         |
| `leads`                    | CRM records                                                | unique (workspace_id, email_normalized) (generated column)                    |
| `lead_activities`          | Append-only history (incl. simulated emails/CRM syncs)     |                                                                               |
| `workflow_executions`      | Runs: status, timing, errors, attempt chain                | unique (workspace_id, idempotency_key)                                        |
| `workflow_execution_steps` | Per-step status, redacted input/output                     | partial unique (workspace_id, idempotency_key) where succeeded & not replayed |
| `workflow_jobs`            | Async queue                                                | unique (workspace_id, idempotency_key)                                        |
| `workflow_templates`       | Built-in (`workspace_id null`) and workspace templates     | system ⇔ no workspace                                                         |
| `integrations`             | Per-workspace integration toggles (non-secret config only) | unique (workspace_id, provider)                                               |
| `notifications`            | In-app notifications per user                              | unique (user_id, idempotency_key)                                             |
| `audit_logs`               | Append-only audit trail                                    |                                                                               |

All tenant tables carry `workspace_id` with `on delete cascade` from `workspaces`; user references use `on delete set null` so history survives account deletion. Every table has `created_at` / `updated_at` (trigger-maintained). A trigger prevents changing `workspace_id` on any tenant row.

## Functions

| Function                                        | Security                     | Why it is a function                                                                                               |
| ----------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `private.handle_new_user()` (trigger)           | definer                      | Atomic profile + workspace + owner + integrations at signup                                                        |
| `create_workspace(name)`                        | definer                      | Creator must become owner of a workspace they can’t yet see                                                        |
| `add_workspace_member`, `update_member_role`    | definer                      | Encodes role rules (only owners manage admins, owner immutable)                                                    |
| `create_workflow_version(id, def)`              | invoker                      | Row lock + sequential version numbers + pointer update in one transaction                                          |
| `ingest_webhook(public_id, hash, payload, key)` | definer, granted to anon     | Lets an unauthenticated caller enqueue a job **only** after proving the secret, without exposing any table to anon |
| `claim_workflow_jobs(ws, limit, worker)`        | invoker                      | `FOR UPDATE SKIP LOCKED` safe claiming                                                                             |
| `enqueue_due_scheduled_workflows(ws)`           | definer (membership checked) | Members may trigger schedules without workflow write access                                                        |
| `private.enqueue_lead_jobs()` (trigger)         | definer                      | Jobs are created in the same transaction as the lead write                                                         |
| `get_dashboard_metrics(ws, days, demo)`         | invoker                      | One round trip, RLS-scoped                                                                                         |
| `seed_demo_data(ws)`, `clear_demo_data(ws)`     | invoker (role checked)       | Explicit, additive demo data, flagged `is_demo`                                                                    |

Helper predicates `private.is_workspace_member`, `private.has_workspace_role`, `private.shares_workspace_with` are `SECURITY DEFINER` (avoids recursive RLS on `workspace_members`) and live in the `private` schema, which is not exposed through the API.

## RLS policy matrix

✓ = allowed (within the user’s own workspaces only). Anonymous users have **no** table privileges.

| Table                        | Read                   | Insert                                        | Update                                                  | Delete                                |
| ---------------------------- | ---------------------- | --------------------------------------------- | ------------------------------------------------------- | ------------------------------------- |
| profiles                     | self + teammates       | trigger only                                  | self (`full_name`, `default_workspace_id` columns only) | —                                     |
| workspaces                   | members                | via RPC                                       | owner/admin (`name` only)                               | owner                                 |
| workspace_members            | members                | via RPC                                       | via RPC                                                 | admins remove non-owners; users leave |
| workflows, workflow_versions | members                | owner/admin                                   | owner/admin (versions immutable)                        | owner/admin                           |
| webhook_endpoints / requests | owner/admin            | owner/admin / via RPC                         | owner/admin                                             | owner/admin                           |
| leads                        | members                | members                                       | members                                                 | owner/admin                           |
| lead_activities              | members                | members (as self)                             | — (append-only)                                         | cascade                               |
| workflow_executions, steps   | members                | members (as self)                             | members, **only while pending/running**                 | cascade                               |
| workflow_jobs                | members                | members                                       | members while queued/processing                         | owner/admin                           |
| workflow_templates           | system + own workspace | owner/admin (non-system)                      | owner/admin                                             | owner/admin                           |
| integrations                 | members                | owner/admin                                   | owner/admin                                             | —                                     |
| notifications                | recipient only         | members, recipients must be workspace members | recipient (`read_at` only)                              | recipient                             |
| audit_logs                   | owner/admin            | members (as self)                             | —                                                       | —                                     |

These rules are verified by `tests/integration/db-local.test.js` (PGlite, local) and `tests/integration/supabase-hosted.test.js` (real API, optional).

## Applying changes

Add a new timestamped file in `supabase/migrations/`, never edit an applied one. Apply with the SQL editor (paste the new file) or `npx supabase db push`. Run `npm run test:db` first; it applies every migration from scratch.
