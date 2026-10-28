# FlowPilot AI

AI-assisted business workflow automation for small teams: **lead intake → validation → duplicate detection → classification → explainable scoring → follow-up drafting → routing → logging → analytics**. Built as a portfolio project that runs entirely on free tiers (**$0 budget**: no paid APIs, no credit card).

- **Stack:** Next.js 16 (App Router, JavaScript), React 19, Tailwind CSS 4, Supabase (PostgreSQL, Auth, RLS), Zod, React Hook Form, Recharts, Lucide, Vitest, Playwright.
- **AI:** deterministic rule-based provider by default (labeled “Rule-based (simulated AI)”). Optional local Ollama or a self-configured OpenAI-compatible API, with validated output and labeled fallbacks.
- **Engine:** versioned JSON workflow definitions, explicit action registry, conditional branches, persisted step logs, bounded retries, idempotent side effects, database-backed job queue.
- **Security:** RLS on every tenant table, roles (owner/admin/member), webhook secrets stored as hashes, rate limits, redacted logs, CSV-injection-safe export, audit log.

| Doc                                                            | Contents                                                               |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                   | Components, execution model, triggers, sync vs. async work             |
| [docs/DATABASE.md](docs/DATABASE.md)                           | Schema, functions, RLS policy matrix                                   |
| [docs/SECURITY.md](docs/SECURITY.md)                           | Threat model and controls                                              |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)                       | Supabase + GitHub + Vercel step by step, health check, troubleshooting |
| [docs/FREE_TIER_LIMITATIONS.md](docs/FREE_TIER_LIMITATIONS.md) | Free-tier assumptions and what they mean                               |
| [docs/TESTING.md](docs/TESTING.md)                             | Test suites, how to run them, latest recorded results                  |

---

## Quick start (local)

Prerequisites: **Node.js ≥ 20.9** (tested with 24), npm, Git, and a free [Supabase](https://supabase.com) account. Docker is **not** required.

### 1. Install

Windows PowerShell:

```powershell
git clone https://github.com/<you>/flowpilot-ai.git
cd flowpilot-ai
npm install
Copy-Item .env.example .env.local
```

macOS / Linux:

```bash
git clone https://github.com/<you>/flowpilot-ai.git
cd flowpilot-ai
npm install
cp .env.example .env.local
```

### 2. Create the Supabase project and schema

1. In the Supabase dashboard create a **new project** (Free plan). Pick a strong database password and store it in your password manager.
2. Open **SQL Editor** and run each file in [`supabase/migrations/`](supabase/migrations) **in filename order** (paste the contents, click _Run_):
   1. `20261028000100_schema.sql`
   2. `20261028000200_rls.sql`
   3. `20261028000300_functions.sql`
   4. `20261028000400_templates_and_demo.sql`

   Alternatively, use the Supabase CLI (no global install needed):

   ```bash
   npx supabase login
   npx supabase init            # creates supabase/config.toml; keep the existing migrations folder
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push         # applies supabase/migrations
   ```

3. **Project Settings → API Keys**: copy the **Project URL** and the **publishable key** (`sb_publishable_…`).
4. **Authentication → URL Configuration**: set _Site URL_ to `http://localhost:3000` and add `http://localhost:3000/**` to _Redirect URLs_.

### 3. Configure environment

Edit `.env.local` (never commit it):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
AI_PROVIDER=demo
```

Optional, server-only: `SUPABASE_SECRET_KEY` (enables immediate background processing of webhook jobs and the cron endpoint) and `CRON_SECRET`. See [.env.example](.env.example).

```bash
npm run check-env      # validates config without printing secret values
```

### 4. Run

```bash
npm run dev            # http://localhost:3000
```

Register an account (confirm the email if _Confirm email_ is enabled in Supabase Auth), then go to **Settings → Demo data → Load demo data** to explore with sample leads, workflows and execution history.

Production build locally:

```bash
npm run build
npm start
```

---

## Using the demo scenario

1. **Templates** → _Lead qualification pipeline_ → _Use template_ → **Activate**.
2. **Leads** → _New lead_ (try _Extract from text_ with a pasted email). Creating the lead triggers the workflow immediately.
3. Open the lead: see the score explanation, classification, summary, the drafted follow-up and the simulated email in the activity log.
4. **Executions** → open the run to inspect every step’s input, output, timing and branch.
5. **Integrations** → disable _Demo CRM_, run again: the CRM step fails (with `onError: continue`), showing error handling. Disable _Demo email outbox_ to make a run fail, re-enable it, then **Retry**: completed side effects are replayed, not repeated.
6. Webhooks: create a workflow from _Webhook lead intake_, activate it, generate the secret in the editor and use the provided `curl` command.

## Scripts

| Command                           | What it does                                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server                                                        |
| `npm run lint` / `format`         | ESLint (flat config) / Prettier                                                                                  |
| `npm test`                        | Unit tests (engine, actions, AI, security, routes)                                                               |
| `npm run test:db`                 | Real migrations + RLS + SQL functions in in-process Postgres (PGlite), no credentials                            |
| `npm run test:integration`        | `test:db` plus hosted-Supabase API tests (skipped unless `TEST_SUPABASE_*` is set)                               |
| `npm run test:e2e`                | Playwright (public pages always; core flow needs a Supabase test project)                                        |
| `npm run check-env`               | Validate environment configuration                                                                               |
| `npm run db:seed`                 | Explicit demo setup: create a demo user + demo data (needs `SUPABASE_SECRET_KEY`, `DEMO_EMAIL`, `DEMO_PASSWORD`) |

## Project structure

```
app/                     routes: (public), (auth), (protected)/dashboard/*, api/*, auth/*
components/              ui/ layout/ dashboard/ workflows/ executions/ leads/ forms/ settings/ …
features/                server-side data access + server actions per domain
lib/
  ai/                    provider interface, demo (rules), ollama, api adapters
  workflow-engine/       definition schema, registry, actions/, executor, queue, idempotency
  security/              redaction, csv, webhook auth, permissions
  supabase/              browser/server/admin/anon clients + proxy session refresh
supabase/migrations/     version-controlled SQL (schema, RLS, functions, templates)
tests/                   unit/ integration/ e2e/
docs/                    architecture, database, security, deployment, free tier, testing
proxy.js                 Next 16 request proxy (session refresh + coarse route guard)
```

## Honest scope notes

- “AI” is rule-based unless you configure a model yourself, and the UI says so everywhere.
- CRM and email actions are **simulations**: they write to the lead activity log and never call external services.
- Scheduled workflows run at most daily via Vercel Hobby cron (plus on demand from the dashboard). See [free-tier limitations](docs/FREE_TIER_LIMITATIONS.md).
- The workflow builder is a structured step editor (no drag-and-drop canvas).

## License

MIT. Use it as a learning reference.
