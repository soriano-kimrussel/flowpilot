# Free-tier assumptions and limitations

FlowPilot is designed to run at **$0**. Figures below were checked in October 2026 against the providers’ pricing/limits pages and summaries; providers change limits, so confirm on [supabase.com/pricing](https://supabase.com/pricing) and [vercel.com/docs/limits](https://vercel.com/docs/limits) before relying on them.

## Supabase Free

| Limit (approx.)                                                     | Impact on FlowPilot                                                                                                                                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2 active free projects                                              | Use one for the app; optionally a second as a **test** project for integration/E2E tests                                                                                                                     |
| 500 MB database                                                     | Thousands of leads and tens of thousands of executions fit. Step logs are size-capped (16 KB each)                                                                                                           |
| 50,000 monthly active users                                         | Far above demo needs                                                                                                                                                                                         |
| Project **paused after ~1 week of inactivity**                      | The app shows errors / `/api/health` reports `unreachable` until you click _Restore_ in the Supabase dashboard (data is kept). Visiting regularly or running the daily cron with a secret key reduces pauses |
| Built-in auth email service is rate limited (a few emails per hour) | Registration confirmations may be delayed. For demos: disable _Confirm email_, or configure a free SMTP provider                                                                                             |
| No point-in-time recovery / daily backups limited                   | Treat the demo database as disposable; migrations recreate the schema                                                                                                                                        |

Not used: Storage, Realtime, Edge Functions (the engine runs in Next.js route handlers so it shares code and tests; an Edge Function could call the cron endpoint, but it isn’t needed).

## Vercel Hobby

| Limit                                                                            | Impact                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Personal, **non-commercial** use only                                            | Fine for a portfolio demo                                                                                                                                                                                                                                                      |
| Cron jobs run **at most once per day** (timing within the hour)                  | `vercel.json` schedules `/api/cron/process-jobs` daily at 06:00 UTC. Hourly schedules are therefore enqueued at most daily unless a member clicks **Process queue now**. More frequent options: an external free pinger, or Supabase `pg_cron` + `pg_net` calling the cron URL |
| Function duration (300 s max on Hobby per Vercel docs; FlowPilot targets ≤ 60 s) | Executions are capped at 25 s, job bursts at 20 s, and route `maxDuration = 60`                                                                                                                                                                                                |
| Bandwidth / invocation quotas                                                    | Ample for a demo                                                                                                                                                                                                                                                               |

## What runs synchronously vs. asynchronously

| Work                              | Mode                                                                                    | Notes                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Manual run, retry                 | Synchronous in the API request                                                          | Bounded to 25 s; results persisted step by step                |
| New lead / status change triggers | Queued in the same DB transaction; processed immediately in the same request (≤ 3 jobs) | Extra jobs wait for the next burst                             |
| Webhooks                          | Queued; processed after the response via `after()` **if** `SUPABASE_SECRET_KEY` is set  | Otherwise processed by **Process queue now** or the daily cron |
| Scheduled workflows               | Enqueued daily by cron or on demand                                                     | Best effort, not a precise scheduler                           |

No component assumes a process stays alive: state lives in PostgreSQL, interrupted executions are detected (`INTERRUPTED` after 10 min) and can be retried, and stale job locks are reclaimed after 5 minutes.

## AI

No paid AI is used or called automatically. `AI_PROVIDER=demo` (default) runs deterministic rules. `ollama` works only on a developer machine. `api` is used only if you configure a free-tier OpenAI-compatible endpoint yourself; its quota errors fall back to labeled rule-based output.

## Not available at $0 (by design)

Real CRM/email/SMS delivery, custom domains (the `*.vercel.app` domain is used), Redis-based rate limiting, background workers. Each has a documented free alternative above.
