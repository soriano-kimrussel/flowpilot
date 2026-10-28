# Security

## Trust boundaries

| Boundary           | Control                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Browser → app      | Server-side Zod validation on every action and route; client validation is UX only                               |
| App → database     | User-scoped Supabase client; RLS on every table; explicit `workspace_id` filters as defense in depth             |
| Internet → webhook | Opaque endpoint ID + per-endpoint secret (hash compared in SQL), size/shape validation, rate limits, idempotency |
| App → AI provider  | Opt-in only, minimized + redacted data, timeouts, output schema validation, never executed                       |
| Cron → app         | `Authorization: Bearer $CRON_SECRET`, constant-time compare                                                      |

## Controls implemented

- **Authentication & sessions:** Supabase Auth (passwords hashed by Supabase, never stored by FlowPilot). `@supabase/ssr` httpOnly cookies refreshed in `proxy.js`; identity always from verified JWT claims (`getClaims()`), never from request bodies. Password reset never reveals whether an email exists. Redirect targets are restricted to same-origin paths (`safeRedirectPath`).
- **Authorization:** RLS for all tenant tables (see [DATABASE.md](DATABASE.md)); role checks in `lib/security/permissions.js` for clear errors; column-level grants for profile/workspace/notification updates; triggers forbid moving rows between workspaces; finished executions are immutable.
- **Secrets:** `.env.local` is git-ignored. Only `NEXT_PUBLIC_SUPABASE_URL` / publishable key reach the browser. `SUPABASE_SECRET_KEY` is optional, imported only in `lib/supabase/admin.js` (`server-only`), and used solely for queue processing from cron/webhooks with explicit workspace filters. `npm run check-env` flags secrets placed in `NEXT_PUBLIC_*` variables.
- **Webhooks:** secrets `whsec_…` (256-bit) shown once and stored as SHA-256; public IDs are random (`wh_…`) and unrelated to workflow IDs; unknown endpoint and wrong secret return the same 401; JSON object ≤ 32 KB, depth ≤ 5, ≤ 100 keys, no `__proto__`; required fields from the trigger config; 30/min and 1,000/day per endpoint; dedupe by `Idempotency-Key` or payload hash; responses never include internal IDs.
- **Execution safety:** explicit action registry; no `eval`/`new Function`/dynamic import (lint-enforced); placeholder paths restricted to safe roots, own properties only; step/time/payload limits; output schema validation.
- **Rate limiting (free alternative):** no Redis. Webhooks are limited inside `ingest_webhook()` with a per-endpoint row lock; manual runs and retries are limited to 20/min per user by counting recent executions. Limitation: counts are per database, which is enough for a single-region demo.
- **Logging & redaction:** step inputs/outputs pass through `lib/security/redact.js` (keys like password/secret/token/authorization/cookie/api key → `[REDACTED]`, bearer/`sb_secret_` values redacted, size caps). Simulated email recipients are masked. Server logs record error codes, not payloads or credentials.
- **CSV export:** workspace-scoped, ≤ 5,000 rows, cells starting with `= + - @ \t \r` prefixed with `'`, RFC 4180 quoting, `Cache-Control: no-store`, audit-logged.
- **User-provided text:** rendered as React text (auto-escaped); no `dangerouslySetInnerHTML`. Notification links must start with `/dashboard`.
- **HTTP headers:** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`; `X-Powered-By` disabled.
- **Audit log:** workflow create/version/activate/delete, webhook secret generate/revoke, member changes, integration toggles, demo data, exports, password changes.

## Known limitations

- Admins can learn whether an email has a FlowPilot account when adding members (needed to add existing users without an email service).
- Members can create execution records in their own workspace (they are allowed to run workflows); they cannot alter them after completion.
- The default Supabase email service is heavily rate limited and intended for testing; configure free SMTP (or disable confirmations for a private demo) if needed.
- No CAPTCHA on signup; Supabase Auth has built-in rate limits.
