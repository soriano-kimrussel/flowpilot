# Deployment: Supabase Free + Vercel Hobby

Deploying the frontend does **not** create the database schema. Do the Supabase steps first.

## 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com) (Free plan, any region close to your Vercel region).
2. Apply migrations in order (SQL Editor → paste → Run), or with the CLI:
   ```bash
   npx supabase login
   npx supabase init        # once; keeps supabase/migrations
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
3. Verify: _Table Editor_ shows `workflows`, `leads`, …; `select slug from workflow_templates;` returns 5 rows.
4. **Authentication → Providers → Email**: enabled. For a private demo you may disable _Confirm email_ to avoid the free email rate limit.
5. **Authentication → URL Configuration** (after you know your Vercel URL):
   - Site URL: `https://<project>.vercel.app`
   - Redirect URLs: `https://<project>.vercel.app/**` and `http://localhost:3000/**`
6. Optional: to make confirmation links work across devices, edit the _Confirm signup_ email template link to
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard`
   (the default link also works via `/auth/callback` in the same browser).
7. **Project Settings → API Keys**: note the Project URL, the **publishable** key, and (optionally) a **secret** key.

## 2. GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/flowpilot-ai.git
git push -u origin main
```

Before pushing, confirm no secrets are staged: `git status` must not list `.env.local`.

## 3. Vercel

1. [vercel.com](https://vercel.com) → _Add New → Project_ → import the GitHub repo (Hobby plan, framework auto-detected as Next.js).
2. Environment variables (Production and Preview):

   | Name                                   | Value                          | Required                                      |
   | -------------------------------------- | ------------------------------ | --------------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`             | `https://<ref>.supabase.co`    | yes                                           |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…`             | yes                                           |
   | `NEXT_PUBLIC_SITE_URL`                 | `https://<project>.vercel.app` | recommended                                   |
   | `AI_PROVIDER`                          | `demo`                         | no (default)                                  |
   | `SUPABASE_SECRET_KEY`                  | `sb_secret_…`                  | optional: immediate webhook processing + cron |
   | `CRON_SECRET`                          | random 32+ byte hex            | optional: required for the cron endpoint      |

   Never prefix the secret key with `NEXT_PUBLIC_`. Vercel masks values in build logs; do not `echo` them in custom build commands.

3. Deploy. The daily cron in `vercel.json` is registered automatically; Vercel sends `Authorization: Bearer $CRON_SECRET`.
4. Update the Supabase Site URL / Redirect URLs (step 1.5) with the final domain.

## 4. Demo data (optional, explicit)

- In the app: Settings → Demo data → _Load demo data_, or
- `DEMO_EMAIL=… DEMO_PASSWORD=… npm run db:seed` locally against the project (needs `SUPABASE_SECRET_KEY` in `.env.local`), or
- SQL editor: `select public.seed_demo_data('<workspace-id>');`

## 5. Manual health check

1. `GET https://<project>.vercel.app/api/health` → `{"status":"ok","supabase":"reachable",…}`.
2. Register → confirm email (if enabled) → you land on `/dashboard` with an empty-state message.
3. Templates → _Lead qualification pipeline_ → Use template → Activate.
4. Leads → New lead → the toast reports a workflow run; open the lead and see score, summary and simulated email.
5. Executions → open the run; refresh the page; results persist.
6. Integrations → disable _Demo email outbox_; run the workflow from the lead page → execution fails with `INTEGRATION_DISABLED`; re-enable → _Retry_ → succeeds, and earlier side effects show _Replayed (idempotent)_.
7. Register a second account in another browser; confirm it cannot see the first account’s leads (e.g. open a copied `/dashboard/leads/<id>` URL → 404).
8. Webhook (optional): create a workflow from _Webhook lead intake_, activate, generate a secret, run the `curl` command → `202 accepted`; a wrong secret → `401`.
9. Log out → `/dashboard` redirects to `/login`.

## Redeploying

Push to `main` → Vercel builds and deploys automatically. For schema changes, add a new migration and apply it to Supabase **before** (or together with) the deploy that needs it. Changing `NEXT_PUBLIC_*` variables requires a redeploy because they are inlined at build time.

## Troubleshooting

| Symptom                                                                 | Fix                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard says “Connect a Supabase project”                             | `NEXT_PUBLIC_SUPABASE_URL` / publishable key missing at build time → set in Vercel and redeploy                                                                                                                                                                                             |
| `relation "public.workflows" does not exist` / RPC not found            | Migrations not applied (or applied out of order)                                                                                                                                                                                                                                            |
| Registration succeeds but no email arrives                              | Free email rate limit; wait, check spam, disable _Confirm email_, or configure SMTP                                                                                                                                                                                                         |
| Confirmation link → `/login?error=link`                                 | Site URL / Redirect URLs not set for this domain, or link opened in a different browser (use the token-hash template)                                                                                                                                                                       |
| `/api/health` → `unreachable`                                           | Free project paused → _Restore project_ in Supabase                                                                                                                                                                                                                                         |
| Webhook returns 202 but nothing runs                                    | No `SUPABASE_SECRET_KEY`: click _Process queue now_ on Executions, or set the key                                                                                                                                                                                                           |
| Cron returns 401 / 503                                                  | Set `CRON_SECRET` / `SUPABASE_SECRET_KEY` in Vercel                                                                                                                                                                                                                                         |
| Windows local build: `EBUSY: resource busy or locked, rename …\.next\…` | Another process (often antivirus real-time scanning or a search indexer) holds files in `.next`. Re-run `npm run build`, or exclude the project folder from real-time scanning. Turbopack’s build disk cache is disabled in `next.config.mjs` for this reason. Vercel (Linux) is unaffected |
| Windows: Turbopack build keeps failing with `EBUSY` | Run `npm run build:webpack` (webpack's output writes were not affected), then `npm start` |
| `Failed to open database … CURRENT.next` during build                   | Same root cause as above (Turbopack cache); delete `.next` and rebuild                                                                                                                                                                                                                      |
| Workflow run fails `LEAD_REQUIRED`                                      | Run it for a lead, use a lead trigger, or add _Create lead_ first                                                                                                                                                                                                                           |
