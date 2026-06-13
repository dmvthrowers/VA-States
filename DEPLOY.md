# Deploying VSYC-26 Registration to Cloudflare

The app runs entirely on Cloudflare's free tier: **Workers** (Next.js via the
OpenNext adapter), **D1** (database), and **R2** (music file storage).
Email stays on Resend.

## One-time setup

1. **Install deps and log in**

   ```sh
   npm install
   npx wrangler login
   ```

2. **Create the D1 database**

   ```sh
   npx wrangler d1 create vsyc26
   ```

   Copy the printed `database_id` into `wrangler.jsonc`, then apply the schema:

   ```sh
   npm run db:migrate:remote
   ```

3. **Create the R2 bucket**

   ```sh
   npx wrangler r2 bucket create vsyc26-music
   ```

4. **Set secrets** (non-secret config lives in `wrangler.jsonc` `vars`)

   ```sh
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put JUDGE_PIN
   ```

5. **Deploy**

   ```sh
   npm run deploy
   ```

6. **Custom domain** — in the Cloudflare dashboard, Workers & Pages →
   vsyc26-registration → Settings → Domains & Routes, add
   `register.dmvthrowers.club`.

## Migrating data from the old Supabase project

If the Supabase deployment already has registrations:

```sh
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
node scripts/export-supabase-to-d1.mjs

npx wrangler d1 execute vsyc26 --remote --file=d1-import.sql
```

Music files: download the `vsyc26-music` bucket from Supabase Storage, then
upload each file to R2:

```sh
npx wrangler r2 object put vsyc26-music/<FILENAME> --file=<LOCAL_PATH>
```

The legacy Postgres schema is kept for reference in `supabase/migrations/`.

## Local development

```sh
cp .dev.vars.example .dev.vars   # fill in dev secrets
npm run db:migrate:local         # creates the local D1 (miniflare SQLite)
npm run dev                      # next dev with emulated D1/R2 bindings
```

`npm run preview` builds the actual Worker bundle and serves it with
`wrangler dev` — closest thing to production.

## CI

`.github/workflows/ci.yml` runs `npm run lint` and `npm run build`
(plain `next build`, no Cloudflare credentials needed). Deploys are manual
via `npm run deploy`.
