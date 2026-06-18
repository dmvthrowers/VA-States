# VA-States

Registration app for the Virginia State Yo-Yo Contest (VSYC-26) —
September 19, 2026 · Dulles Town Center · Sterling, VA.

Next.js 15 running on **Cloudflare Workers** (via OpenNext) with **D1**
(database) and **R2** (music storage). Email via Resend.

- `DEPLOY.md` — Cloudflare setup, deploy, and Supabase→D1 data migration
- `migrations/d1/` — database schema (`npm run db:migrate:local|remote`)
- `supabase/migrations/` — legacy Postgres schema, kept for reference

```sh
npm install
cp .dev.vars.example .dev.vars   # local secrets
npm run db:migrate:local
npm run dev                      # next dev with emulated D1/R2
npm run preview                  # real Worker bundle under wrangler dev
npm run deploy                   # build + deploy to Cloudflare
```
