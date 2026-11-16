# Supabase setup

`skills-lock.json` records the installed agent skills and their source hashes. Both referenced skills are installed under `.agents/skills/`. These files provide instructions; they do not authenticate an agent or connect the application.

## Application API client

The application is Express with EJS and PostgreSQL, rather than Next.js. `src/config/supabase.js` provides `createSupabaseClient()` using the installed JavaScript SDK. It accepts `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, with the existing `NEXT_PUBLIC_` names as fallbacks. Run `npm.cmd run supabase:check` to verify the configured API endpoint and publishable key without changing data.

Clients do not persist auth sessions. Supply a Supabase user access token to `createSupabaseClient({ accessToken })` for requests governed by that user's RLS policies. Existing Fitnexis JWTs are not Supabase tokens. Existing routes continue to use their PostgreSQL queries and Fitnexis authentication. The installed SSR package is available but is not needed for this client.

## Agent connection

For an optional agent connection, configure the hosted Supabase MCP endpoint in your local `.codex/config.toml`, scoped to your project. From this trusted project directory, run `codex mcp login supabase` in your terminal, complete browser authorization, then reload the agent session. Confirm the connection with `codex mcp list` and ask the agent to list tables. Do not embed API keys or personal access tokens in the configuration. This connection is separate from the application configuration.

## Profile-photo storage

Profile photos use a private Supabase Storage bucket. Set `SUPABASE_SECRET_KEY` to the server secret key; the publishable client is deliberately unable to access these objects. `SUPABASE_STORAGE_BUCKET` defaults to `fitnexis-profile-photos`.

Run `npm.cmd run supabase:storage:setup` to create/configure the private bucket with a 2 MB maximum and JPEG, PNG and WebP MIME restrictions. No public read/upload policies are added. The app uses its existing Fitnexis session and gym permissions before server-side storage operations; it does not treat Fitnexis JWTs as Supabase user tokens. The secret key must never reach browser code.

Uploads are held in bounded memory instead of written to the host disk. Files receive random names under `<gym-id>/<user-id>/`. The app checks MIME types and image signatures; SVG and unsupported files are rejected. The database stores a durable `supabase://<bucket>/<object>` reference, not an expiring URL. An authenticated app photo route checks the member/gym and issues a 60-second signed URL. Members can view their own photo; staff with `members.read` can view photos in their gym. Replacing a photo deletes the old stored object after saving the database record. A database failure triggers cleanup of the new upload; failed cleanup is logged without credentials and may leave an orphan for later maintenance.

Run `npm.cmd run supabase:storage:check` to upload a temporary image, verify signed access, confirm publishable-key reads are blocked, and delete the test image. This check does not change any member records.

For existing records referencing `/uploads/profile-pics/`, preview with `npm.cmd run supabase:storage:migrate`, then apply with `npm.cmd run supabase:storage:migrate -- --apply`. Only referenced files in the configured database are migrated. The script uploads each supported image and conditionally changes its record only if the old reference is still current. Original local files are retained. Missing/unsupported files are counted as failures. Local/AWS database records are not automatically copied into Supabase, and unreferenced local files are not uploaded.

No persistent host disk is needed for new profile uploads. Include the Supabase server environment values in the production host. Email delivery configuration is documented in [AUTHENTICATION.md](AUTHENTICATION.md).

## Connect the application's PostgreSQL backend

Set `SUPABASE_DATABASE_URL` in your local `.env` using the PostgreSQL connection string from your project's **Connect** panel. For this persistent Express server, use the direct connection when IPv6 is available, or the session pooler on port 5432 when IPv4 is needed. Replace the password placeholder locally; URL-encode any special characters in the password.

```dotenv
SUPABASE_DATABASE_URL=postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@POOLER_HOST:5432/postgres
```

This setting takes precedence in both development and production, for the app and Knex. Without it, development uses `DB_*` and production uses `PROD_DATABASE_URL` (falling back to `DATABASE_URL`). TLS certificate and hostname verification are enforced for the Supabase connection. If a private certificate authority is required, download the database CA certificate from Supabase and append a URL-encoded `sslrootcert` file path to the connection URL. Do not disable certificate verification.

Run `npm.cmd run supabase:db:check` to perform a read-only `SELECT 1` and check for core application tables. The check never falls back to the local/AWS database. The API check (`supabase:check`) verifies a different connection and does not establish SQL readiness.

The downloaded public CA is `prod-ca-2021.crt` in the project root. The local connection URL references it with `sslrootcert=prod-ca-2021.crt`; include this certificate when deploying and start commands from the project root.

A publishable API key cannot replace a PostgreSQL password. `npm.cmd run supabase:db:setup` initializes a fresh, empty public schema only. It refuses existing tables/views, applies the existing Knex migrations, enables RLS on all created tables (including migration metadata), and revokes access from `PUBLIC`, `anon` and `authenticated` on the tables, sequences and application trigger functions. Trigger functions also receive a fixed empty search path. Initialization and access restrictions commit together in a single transaction. This bootstrap command is not an update command for an existing database.

The Express backend uses its trusted PostgreSQL role, which bypasses RLS; tenant and role checks continue to run in the existing application services. No Data API row policies are added because Fitnexis uses its own authentication and SQL backend. Fitnexis JWTs cannot be used as Supabase `auth.uid()` ownership identities. Supabase secret/service keys remain privileged. Users and other records from local PostgreSQL/AWS are not copied.

For future schema updates, review and apply migrations with equivalent RLS and privilege restrictions for newly created objects. Do not assume running ordinary Knex migrations alone protects new public tables. Review backups and migration history before changing an existing database.

Copy `.env.example` to `.env` for local setup. `.env` is excluded from version control; supply production secrets through the hosting dashboard. Credentials committed in earlier Git history must still be rotated if they have been shared or pushed; removing the tracked file does not remove earlier versions from history.

References: [Supabase PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [node-postgres TLS](https://node-postgres.com/features/ssl), [Supabase JavaScript client](https://supabase.com/docs/reference/javascript/initializing), [Supabase MCP](https://supabase.com/docs/guides/ai-tools/mcp), [Codex MCP configuration](https://developers.openai.com/codex/mcp/).
