# HowdyBiz verification — 2026-10-01

**Result: source published and frontend deployed on GitHub Pages. Dedicated Supabase backend is deployed and connected. Google provider credentials and owner sign-in verification remain outstanding.**

## Executed successfully

| Check | Evidence |
|---|---|
| Automated domain, email and database tests | `npm test`: **24 passed, 0 failed** |
| Actual PostgreSQL execution | Full schema applied in isolated PGlite PostgreSQL, using auth schema/role fixtures |
| Ownership and RLS | Unauthenticated/other-user reads return no private records; direct writes and privileged RPCs are denied |
| Demo routing | Server policy overrides injected To/CC/BCC/mode fields; To is the verified owner and subject is `TEST` |
| Gmail verification | Missing/unverified identity blocks preview; no fallback to business contact |
| Send tickets | Reuse, expiry, duplicate content and Do Not Contact block actual database claims |
| Mode safety | Pending previews are invalidated; active/unknown sends block mode changes |
| Unknown outcomes | Demo clearing is blocked until explicit manual Gmail verification resolves the ticket |
| Discovery persistence | Actual SQL deduplicates and preserves notes, stage and quotes; stale-mode writes are rejected |
| CSV safety | Formula prefixes escaped; transient Google details and provider-only phone numbers excluded |
| Website checks | Timeout/403/429 remain uncertain; repeated HTTP errors are distinguished from a successful response |
| Build | Static frontend built under `/howdybiz/`, with relative assets and Pages workflow |
| Browser UI checks | **15 checks passed**, using headless Chromium against the compiled site and standalone HTML |
| Responsive layout | No document overflow at **390px** or **768px**; desktop verified at **1536px** |
| Frontend errors | No uncaught JavaScript errors during completed UI checks |
| Portable review | `HowdyBiz-Preview.html` opens directly with labeled fictional samples |

Browser checks covered: default toggle ON, six complete-contact sample results, separate enrichment queue, opportunity filtering, preserved form input through theme changes, demo notes/stage persistence after reload, versioned quotes, manual payments, draft-only behavior and unconfigured send blocking, sample deduplication preserving CRM, blocked unconfigured Live activation, responsive layouts, demo clearing, standalone preview initialization and JavaScript-error monitoring.

Screenshots in the source package:

- `test-results/desktop.png`
- `test-results/mobile.png`
- `test-results/detail.png`

The sample payments and businesses shown in screenshots are fictional, created during UI checks. They are not production results.

## Published-site verification

- Repository: https://github.com/1nfected92/howdybiz
- App: https://1nfected92.github.io/howdybiz/
- Successful CI/build/Pages deployment: https://github.com/1nfected92/howdybiz/actions/runs/36830700979 (36 seconds).
- `npm test` repeated after source restoration: **24 passed, 0 failed**; build succeeded.
- Published dashboard defaults to Demo ON, loads six complete-contact fictional records, and keeps the seventh incomplete sample in the enrichment queue.
- Saved a demo note and stage, saved an email draft, reloaded the deployed app, and verified note, stage and chronological history persisted in the session.
- Preparing and saving a draft did not send mail. Reviewing a send while unconfigured was blocked. Switching to Live without backend/sign-in was blocked and Demo stayed ON.
- Screenshot: `docs/dashboard.jpg` (fictional samples only).
- The workflow reported upstream GitHub Actions Node 20 deprecation warnings; build and deploy succeeded. Hosted integration checks below remain outstanding.

## Hosted Supabase verification

- Initial migration applied successfully; all four public CRM tables and five private integration tables have RLS enabled.
- `api` function deployed and active. The OAuth callback and health endpoint are public; every CRM POST verifies the Auth user and configured owner.
- Auth Site URL and exact redirect allowlist saved for the deployed `/howdybiz/` URL. Email authentication is enabled; automatic email confirmation is disabled.
- `APP_URL`, `OWNER_EMAIL` and a generated 32-byte `GMAIL_TOKEN_KEY` were saved in encrypted function secrets. No secret values are committed.
- Health endpoint: HTTP 200, `status: ok`, owner configured, Places and Gmail OAuth credentials absent.
- Anonymous CRM SELECT and privileged mode RPC returned HTTP 401 with permission denied.
- Unauthenticated workspace requests returned a sign-in-required error; untrusted browser origins are rejected.
- Hosted SQL verified ordinary authenticated users cannot INSERT, call privileged mode RPCs or access the private schema.
- A rolled-back transaction inserted isolated verification users/records and asserted that the owner sees its row and another user sees none. All fixtures were rolled back.
- Security advisor returned only five informational private-table notices for RLS without policies. This is intentional: browser roles have no schema access; only the service role uses those tables. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Google Cloud displayed “Site Unavailable” on opening and on one reload. Google client/API key creation remains blocked in this browser.

## External blockers

| Dependency | Observed state | Required next step |
|---|---|---|
| GitHub repository and Pages | Public `1nfected92/howdybiz` source published. GitHub Pages build and deployment succeeded. Published dashboard opened at `/howdybiz/`. | Completed; public backend configuration is included. |
| Dedicated Supabase project | Owner authorized pausing `football-squares`; status is INACTIVE. Dedicated `howdybiz` project `jmofyaleyhhylmxenqme` is ACTIVE_HEALTHY. The Soleful Goddess was not modified. | Completed. No paid upgrade performed. |
| Google discovery and photos | No Google Places/Geocoding API credentials supplied. | Configure Google Cloud APIs, billing/quota limits and backend API key. |
| Gmail runtime connection | Conversation Gmail profile verified; its credentials are not transferable to the application. No web OAuth client credentials supplied. | Configure Google web OAuth and explicitly connect Gmail in the app. |

New-project quote: **$0/month**. Creation succeeded after the authorized football pause. No paid upgrade was performed. No business or Gmail test email was sent.

## Not verified in this environment

- Owner email-link delivery and signed-in app workflows, including live record persistence after reload.
- Live Google search, contact-enrichment coverage, Geocoding and Google photo availability.
- Real Google OAuth consent, token refresh, Gmail acceptance and mailbox receipt.
- Send performance under concurrent production traffic.

The database tests use real PostgreSQL semantics through PGlite, not hosted Supabase services. Website-request safety checks validate URL/DNS/redirect inputs; DNS pinning is not implemented, so this is not a guarantee against all DNS-rebinding behavior. The API is restricted to the verified workspace owner. Gmail authorization is send-only; reply reading and open tracking are not included. Payment entries are manual and do not charge or confirm provider transactions.

See `README.md` for setup and post-deployment validation steps.
