# TK777 — Free-play arcade demo

TK777 is a free-play website using virtual coins with no cash value. It runs on a Cloudflare Worker with static assets and a Cloudflare D1 database.

## Project layout
- User website: `/`
- Admin panel: `/admin` (also available at `/admin.html`)
- Worker API: `worker.js`
- Static website files: `public/`
- Database schema for a new database: `schema.sql`

## Important data-safety notes
- The live project uses the existing D1 database configured in `wrangler.toml`.
- Do not replace the live D1 database ID with an ID from an old ZIP or another environment.
- Do not run `migrations/0002_reset_old_demo_balances.sql`. It resets existing user balances and deletes bonus transaction records.
- Do not run migrations against the live database unless the exact migration has first been reviewed and confirmed as necessary.
- `schema.sql` is an initial schema for a new database. Do not use it as a reset script for a live database.
- Updating files in GitHub does not itself deploy the Worker or modify D1 records.

## Cloudflare configuration
The default deployment configuration is `wrangler.toml`. It contains:
- Worker name: `tk777`
- Entry point: `worker.js`
- Static assets directory: `./public`, bound as `ASSETS`
- D1 binding: `DB`, database name: `tk777-db`

`wrangler-worker.toml` is a matching alternate config file for an explicitly selected Wrangler config. Keep both config files pointed at the same live Worker and D1 database.

## Secrets
Set the administrator credentials as Cloudflare Worker secrets. Never commit credentials to GitHub:
```sh
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put ADMIN_PASSWORD
```

## Deploy (only when intentionally ready)
From the project root:
```sh
npx wrangler deploy
```
To explicitly use the alternate config:
```sh
npx wrangler deploy --config wrangler-worker.toml
```

Do not deploy until the updated files have been reviewed and the live site has been tested. Deployment is separate from committing files to GitHub.

## Safety and testing
- Use only free-play virtual coins; they have no cash value and cannot be redeemed.
- Test registration, login, admin access, game loading, balance display, and history with test accounts before public changes.
- Treat uploaded HTML games as untrusted content and review their source before adding them.
