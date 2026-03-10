# 14 - Lessons Learned

Hard-won debugging insights from building the Ergovia platform. Organized by category so you can find what you need fast.

---

## n8n Workflow Gotchas

### Expression mode requires `=` prefix for API-deployed workflows

**Problem:** Deploying workflows via the n8n API, all `{{ }}` expressions render as literal text instead of evaluating. The AI system prompt shows `{{ $now.toISO() }}` instead of the actual date.

**Fix:** Prefix every string parameter containing `{{ }}` with `=`:
```json
// WRONG
"systemMessage": "Today is {{ $now.toISO() }}"

// CORRECT
"systemMessage": "=Today is {{ $now.toISO() }}"
```

**Applies to:** `systemMessage`, `text`, `prompt`, `description`, `query`, and any other parameter with expressions. The n8n UI handles this automatically -- you only need the prefix when deploying via API.

**Prevention:** The `n8n.js` deployment service should auto-add `=` prefixes. If adding new workflow JSON files, verify expression parameters are prefixed before deploying.

---

### `$1`/`$2` SQL parameters conflict with Expression mode

**Problem:** Adding the `=` prefix to SQL queries that use `$1`/`$2` PostgreSQL parameter placeholders causes n8n to interpret `$1` as an n8n variable. Queries break silently or return wrong data.

**Fix:** NEVER add `=` prefix to parameterized SQL queries. The rule is:
- `=` prefix for `{{ }}` expressions ONLY
- No prefix for `$1`/`$2` parameterized queries
- NEVER mix `{{ }}` expressions and `$1`/`$2` in the same parameter

**Prevention:** When reviewing workflow JSON, check every string that starts with `=`. If it contains `$1` or `$2`, remove the `=` prefix.

---

### Chat memory persists bad conversations

**Problem:** The AI gives wrong, stale, or contradictory answers. You fix the system prompt but the AI still acts broken.

**Fix:** LangChain chat memory is stored in the `n8n_chat_histories` PostgreSQL table. Session key = `sender_id`. Old wrong conversations persist and influence all future responses. Clear them:
```sql
DELETE FROM n8n_chat_histories WHERE session_id = 'SENDER_PHONE_OR_CHAT_ID';
```

**Prevention:** Clear chat history as the first debugging step whenever AI behavior seems wrong. Consider adding a periodic cleanup job for stale sessions.

---

### Luxon `$now` chains break in systemMessage

**Problem:** Complex chained Luxon expressions like `$now.plus({days:1}).toFormat('yyyy-MM-dd')` do not resolve in `systemMessage` even with the `=` prefix. The AI sees the raw expression text.

**Fix:** Compute dates in a **Code node** (JavaScript), then reference the output with a simple expression:
```
{{ $('DateCalc').item.json.tomorrow }}
```

**Prevention:** Never put complex Luxon chains directly in systemMessage or other text fields. Always use a preceding Code node for date math.

---

### Deployment order matters

**Problem:** Workflows fail because they reference other workflows (via Execute Workflow nodes) that don't exist yet. WF1 tries to call WF2, but WF2 hasn't been created.

**Fix:** Deploy in strict dependency order:
1. `SUB_Universal_Messenger` (no dependencies) -- deploy FIRST, wait 3s
2. `WF3` through `WF8` (depend on SUB) -- 2s delay between each
3. `WF2` (depends on SUB, WF3, WF4)
4. `WF1` (depends on ALL) -- deploy LAST

**Prevention:** The `n8n.js` orchestrator enforces this order. If deploying manually, follow the list above. Never deploy WF1 first.

---

### Webhook URLs require HTTPS

**Problem:** Workflows with webhook triggers won't activate. n8n silently refuses to publish them.

**Fix:** Set the `WEBHOOK_URL` environment variable to an `https://` URL in the n8n Docker container configuration.

**Prevention:** Ensure Caddy (or another reverse proxy with SSL) is configured before deploying any webhook-based workflow.

---

### Credential placeholder IDs

**Problem:** After deploying, workflows fail with credential errors. The JSON templates use placeholder IDs that don't match real n8n credentials.

**Fix:** The deployment service replaces these placeholders with real credential IDs:
- `postgres-cred` (type: postgres)
- `openai-cred` (type: openAiApi)
- `telegram-cred` (type: telegramApi)
- `whatsapp-cred` (type: whatsAppBusinessCloudApi)
- `twilio-cred` (type: twilioApi)

After recreating any credential, ALL 9 workflows need their credential IDs updated.

**Prevention:** Always deploy through the orchestrator (`n8n.js`), which handles credential injection automatically. If manually editing workflows in the n8n UI, verify credential bindings after any credential recreation.

---

## Server & Infrastructure

### ARM64 architecture

**Problem:** Downloaded a binary or Docker image, but it crashes or won't start. Error messages mention "exec format error."

**Fix:** Hetzner servers use ARM64 (aarch64). Always download `arm64`/`aarch64` binaries, NOT `amd64`/`x86_64`.

**Prevention:** Before downloading any binary, check architecture with `uname -m` (should show `aarch64`).

---

### Caddy for automatic SSL

**Problem:** Need HTTPS for n8n webhooks and the control panel, but manual certificate management is painful.

**Fix:** Caddy handles automatic SSL via Let's Encrypt HTTP-01 challenge. Add the domain to the Caddyfile, restart Caddy, and certificates are issued automatically.

**Prevention:** For new subdomains (new clients), just add an entry to the Caddyfile. Caddy auto-renews certificates. Ensure ports 80 and 443 are open.

---

### PostgreSQL SSL configuration

**Problem:** Connection fails with SSL errors. The `POSTGRES_SSL=allow` setting tries SSL on a server that doesn't support it, and the fallback behavior is inconsistent.

**Fix:** Set `POSTGRES_SSL=disable` when the PostgreSQL server doesn't support SSL (e.g., local Docker container). The code should treat `disable` as "no SSL."

**Prevention:** In the connection setup code, explicitly check for `disable` and skip SSL entirely rather than relying on the `pg` module's fallback behavior.

---

### PM2 working directory

**Problem:** Express app can't find its files after deployment. Routes return 404 or the app crashes on startup.

**Fix:** Point PM2 to the correct subfolder. If the repo has a nested structure (monorepo), the `cwd` in PM2's ecosystem config must point to the actual app directory (e.g., `/opt/ergovia-lite`).

**Prevention:** After cloning, verify `pm2 start` is run from the correct directory. Check `pm2 show ergovia-lite` to confirm the working directory.

---

### Docker network for container communication

**Problem:** n8n container can't connect to PostgreSQL container. Connection refused or host not found.

**Fix:** Both containers must be on the same Docker network (`ergovia-net`). Reference PostgreSQL by container name (`ergovia-db`), not `localhost`.

**Prevention:** In `docker-compose.yml`, define a shared network and assign both services to it. Use container names as hostnames in connection strings.

---

### nginx vs Caddy confusion

**Problem:** Requests go to the wrong service, or SSL doesn't work for one domain.

**Fix:** nginx handles the main app (`ergovia-ai.com` -> Express on port 3000). Caddy handles the n8n subdomain (`n8n.ergovia-ai.com` -> n8n on port 5678). Don't confuse them.

**Prevention:** Document which reverse proxy handles which domain. If adding a new subdomain, decide upfront whether nginx or Caddy will manage it.

---

### 502 Bad Gateway

**Problem:** The site returns 502 errors.

**Fix:** This almost always means the Express app crashed. Check `pm2 logs ergovia-lite` for the error. Common causes: missing npm module, syntax error, uncaught exception.

**Prevention:** Run `npm install` after every `git pull`. Consider adding a process-level error handler to prevent crashes from unhandled promise rejections.

---

## Database

### No `clients` table

**Problem:** Code references a `clients` table that doesn't exist. Queries fail.

**Fix:** The schema uses `owners` + `customers` instead. `owners` stores property manager info (string IDs like `owner-1`). `customers` stores client accounts (UUID IDs).

**Prevention:** Always check the actual schema (`schema-postgresql.sql`) before writing queries. The table naming evolved during development.

---

### Missing columns on `bookings` table

**Problem:** INSERT into `bookings` fails because `channel_type` or `payment_status` columns don't exist.

**Fix:** Run the migration that adds these columns, or add them manually:
```sql
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS channel_type VARCHAR(50);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pending';
```

**Prevention:** Always use `IF NOT EXISTS` in ALTER TABLE statements. Keep a migrations folder and run all migrations after schema creation.

---

### `owners` table auto-creation

**Problem:** Fresh database has no `owners` table. The V2 dashboard crashes when trying to load owner info.

**Fix:** The `ensureTables()` function in `db.js` / `v2-data.js` should create the `owners` table if it doesn't exist.

**Prevention:** Add all required tables to `ensureTables()`. Run it on every server startup.

---

### UUID vs string IDs

**Problem:** Joining `customers` and `owners` fails because one uses UUID and the other uses string IDs.

**Fix:** `customers.id` is a UUID (e.g., `d0fdeb97-cd11-4ec0-95e9-3043e4ed6e53`). `owners.owner_id` is a string (e.g., `owner-1`). They are separate entities -- don't try to join them directly.

**Prevention:** Document the ID format for each table. When writing new queries, check the column type first.

---

### Idempotent inserts

**Problem:** Running seed data or migrations twice creates duplicate rows, causing unique constraint violations or unexpected behavior.

**Fix:** Always use `ON CONFLICT ... DO UPDATE` (upsert) for inserts that might run more than once:
```sql
INSERT INTO owners (owner_id, owner_name)
VALUES ('owner-1', 'Gabriel')
ON CONFLICT (owner_id) DO UPDATE SET owner_name = EXCLUDED.owner_name;
```

**Prevention:** Make every INSERT idempotent by default. Seed scripts and migrations should be safe to run multiple times.

---

## Frontend & Express

### Clean URLs with express.static

**Problem:** Users have to type `/v2/dashboard.html` instead of `/v2/dashboard`. Looks unprofessional.

**Fix:** Configure Express static serving with the `extensions` option:
```js
express.static('public', { extensions: ['html'] })
```
Now `/v2/dashboard` automatically serves `dashboard.html`.

**Prevention:** Set this option once in `server.js`. Update all internal links to omit `.html`.

---

### Auth middleware blocking public paths

**Problem:** After adding authentication, the landing page, login page, and CSS/JS assets return 401 or redirect to login.

**Fix:** Auth middleware must explicitly allow public paths: landing page, login/signup pages, and all static assets (CSS, JS, images, fonts).

**Prevention:** Maintain a whitelist array of public path patterns. Test unauthenticated access to every public page after adding auth middleware.

---

### Static file serving after folder rename

**Problem:** Renamed a folder (e.g., `v2` to `airb`) but pages still 404.

**Fix:** Remove any explicit alias routes in `server.js` that reference the old folder name. `express.static` will serve from the new folder automatically.

**Prevention:** When renaming folders, search the entire codebase for the old name. Check `server.js` routes, HTML links, and JS fetch URLs.

---

### Login redirect targets

**Problem:** After login, users get redirected to a page that no longer exists (old path).

**Fix:** Update ALL redirect targets in the auth flow when renaming paths. Check: login form action, post-login redirect, session expiry redirect, and any hardcoded URLs in JavaScript.

**Prevention:** Define redirect paths as constants in one place. Never hardcode paths in multiple files.

---

## Git & Deployment

### GitHub Secret Scanning blocks pushes

**Problem:** `git push` is rejected because GitHub detected credentials (API keys, passwords) in the commit history.

**Fix:** Remove the secrets from the current code, but the commit history still contains them. You may need to use `git filter-branch` or BFG Repo Cleaner to scrub history, then force push. Rotate any exposed credentials immediately.

**Prevention:** Add `.env`, `*.key`, `credentials.json`, and similar files to `.gitignore` before the first commit. Never commit secrets.

---

### GitHub requires Personal Access Tokens

**Problem:** `git push` fails with "Support for password authentication was removed."

**Fix:** Generate a Personal Access Token at GitHub Settings -> Developer settings -> Personal access tokens. Use it instead of your password.

**Prevention:** Set up token-based auth or SSH keys when first configuring git. Store the token in a credential manager.

---

### Dual remote repositories

**Problem:** Pushed changes to `ERGOVIA-2` but the server didn't get them. Or pushed to `ergovia-lite` but the local dev repo is out of sync.

**Fix:** Always push to BOTH remotes:
- `ERGOVIA-2` = full monorepo (local dev, docs, scripts)
- `ergovia-lite` = server deployment repo (only the `ergovia-lite/` subfolder)

The Hetzner server pulls from `ergovia-lite` only.

**Prevention:** Set up a deployment script that copies changed files from `ERGOVIA-2/ergovia-lite/` to the `ergovia-lite` repo, commits, and pushes. Or use `deploy-to-server.bat`.

---

## Product & UX Decisions

### 6-stage conversation flow

**Problem:** AI dumps all property info at once. Guests feel overwhelmed and leave without booking.

**Fix:** Structured 6-stage sales funnel: greeting -> get name -> get dates -> show options -> reveal price -> close deal. Price is NOT revealed until stages 1-4 are complete. If the guest asks for price early, the AI redirects to collecting dates first.

**Prevention:** Define the conversation flow in the system prompt with explicit stage instructions. Test by messaging the bot as a new guest and verifying the AI follows the stages in order.

---

### Typing delays make AI feel human

**Problem:** AI responds instantly, which feels robotic and uncanny. Guests suspect they're talking to a bot.

**Fix:** Added a Human Typing Delay node to SUB Universal Messenger. Delay formula: `min(1500 + (messageLength * 40), 6000)` ms, with +/- 25% random variance. Short messages: ~1.5-2s. Long messages: ~5-6s. Cap at 6s.

**Prevention:** Always route outgoing messages through the SUB workflow, which applies the delay automatically.

---

### AI needs full property context

**Problem:** AI gives generic, robotic answers like "I'll check on that for you" instead of actual property details.

**Fix:** Expanded the AI's context from 6 fields to 18+ fields: address, location description, bedrooms, bathrooms, max guests, base price, weekend price, cleaning fee, min/max stay, check-in/out times, amenities, house rules, photos, notes.

**Prevention:** When adding new property fields to the database, also add them to the WF1 AI Gateway query and system prompt. Sparse context = robotic answers.

---

### Per-client servers, not multi-tenant

**Problem:** Multi-tenant architecture adds complexity (data isolation, noisy neighbors, shared resource contention) that isn't justified at early scale.

**Fix:** Each client gets their own Hetzner server with own n8n + PostgreSQL + subdomain. Cost: ~5-20/month per client. Simpler, more reliable, easier to debug.

**Prevention:** Revisit multi-tenancy only when managing 50+ individual servers becomes painful.

---

## OpenAI / AI

### OpenAI API key is provided by Ergovia

**Problem:** Confusion about who provides the OpenAI key. Clients should NOT need to create OpenAI accounts.

**Fix:** Ergovia provides the key from its API Bank. One key per client, managed centrally. The `api_usage_budget` table tracks per-client monthly spending.

**Prevention:** Document this clearly in onboarding materials. The control panel should never ask clients for an OpenAI key.

---

### Quota exhaustion blocks ALL AI conversations

**Problem:** AI stops responding to all guests. Telegram messages go unanswered. No error visible in the control panel.

**Fix:** Check OpenAI usage at `platform.openai.com`. Add credits or upgrade the plan. Monitor the `api_usage_budget` table -- WF6 checks budget each morning.

**Prevention:** Set up billing alerts on the OpenAI account. The WF6 morning budget check should notify the admin when usage is high. Consider adding a budget warning to the control panel dashboard.

---

### Chat memory accumulates and degrades quality

**Problem:** After many conversations, the AI's responses become inconsistent or it "remembers" wrong information from previous guests.

**Fix:** Periodically clear the `n8n_chat_histories` table for completed conversations:
```sql
DELETE FROM n8n_chat_histories
WHERE created_at < NOW() - INTERVAL '30 days';
```

**Prevention:** Add a cleanup step to WF6 Daily Automations that prunes old chat history. Keep only the last 30 days of conversations.

---

*Last updated: 2026-03-10*
