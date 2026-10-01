# HowdyBiz verification — 2026-10-01

**Result: connected-worker integration is deployed on Supabase. Public discovery ran successfully and Gmail draft access was verified. The default route requires no Google API keys or separate OAuth client. The scheduled worker checked the queue successfully. Actual Gmail Send acceptance remains unverified.**

## Connector integration verification

- **36 automated tests passed**, including eight PostgreSQL queue/transport tests and four session persistence/synchronization tests. Build succeeded.
- Additive connector migration applied, API version 6 deployed, and enabled hourly automation created successfully.
- Connected Gmail profile email matched the confirmed Supabase owner; one owner sign-in session exists. No tokens or sign-in codes were read.
- Real demo discovery request progressed queued → running → completed. One complete-contact business was verified from its own contact page and stored in the isolated demo workspace. A blocked candidate was omitted. No exhaustive coverage, Google ratings, photos or radius coverage was claimed.
- An actual Gmail `TEST` draft was created, addressed only to the connected owner. It remains unsent. No business or test email was sent.
- Browser roles cannot call connector RPCs or access the private queue. Duplicate submissions are rejected. Tampered CC/BCC and changed Gmail identity are rejected before transport.
- Mode switches cancel waiting jobs and previews. Running or unknown mail outcomes block switches. Demo clearing cancels searches and prevents late completion from repopulating the workspace.
- Search refresh preserves notes, pipeline stage, quotes and payment history. Background updates defer table replacement while a field or modal is active; no full-screen polling renders occur.
- Security advisor now reports seven intentional private-table RLS-without-policy INFO notices and one password-protection WARN. The application uses email-link authentication; compromised-password screening remains disabled in Supabase. Reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Connector Pages deployment passed in 48 seconds: https://github.com/1nfected92/howdybiz/actions/runs/36938022370. The published dashboard opened with the new Requests view, hourly public-search label and optional Google-details button disabled. No application JavaScript error was observed.
- Hosted connector checks also passed: explicit submission produced a queued ticket, injected BCC was rejected before transport, and all verification fixtures were rolled back. Anonymous worker RPC returned HTTP 401; unauthenticated workspace access remained blocked.
- Scheduled execution successfully read the connected Gmail profile and checked the Supabase queue, with matching owner identity and zero pending jobs. The worker was found paused during the subsequent run-now request and resumed.
- Owner session synchronization now updates already open tabs after email-link sign-in and cross-tab sign-out. Search opens the sign-in dialog rather than returning an authentication toast. Typed search criteria survive the sign-in transition.
- Browser caching retained an older unversioned script after deployment. Builds now place all frontend modules and styles in a content-hashed asset directory; relative imports and the 404 fallback were verified against the built files.
- Owner session deployment passed in 38 seconds: https://github.com/1nfected92/howdybiz/actions/runs/36938343084.
- Sign-in synchronization source deployment passed: https://github.com/1nfected92/howdybiz/actions/runs/36939557203 (build 24 seconds, deploy 12 seconds).
- Cache-safe Pages deployment succeeded: https://github.com/1nfected92/howdybiz/actions/runs/36939727263 (build 31 seconds, deploy 8 seconds). The published HTML references content-versioned frontend assets.
- Published search now opens the owner sign-in dialog; closing it preserves the entered keyword and ZIP. Screenshot: `docs/sign-in-working.jpg`. This screenshot verifies the sign-in entry point, not a completed browser login.
- **Not yet observed:** a real Gmail Send acceptance or mailbox receipt. No unreviewed email was sent. Do not describe the unsent draft as a send test.

## Earlier source/UI checks

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

## Initial published-site verification (before backend connection)

- Repository: https://github.com/1nfected92/howdybiz
- App: https://1nfected92.github.io/howdybiz/
- Successful CI/build/Pages deployment: https://github.com/1nfected92/howdybiz/actions/runs/36830700979 (36 seconds).
- `npm test` repeated after source restoration: **24 passed, 0 failed**; build succeeded.
- Published dashboard defaults to Demo ON, loads six complete-contact fictional records, and keeps the seventh incomplete sample in the enrichment queue.
- Saved a demo note and stage, saved an email draft, reloaded the deployed app, and verified note, stage and chronological history persisted in the session.
- Preparing and saving a draft did not send mail. Reviewing a send while unconfigured was blocked. Switching to Live without backend/sign-in was blocked and Demo stayed ON.
- Screenshot: `docs/dashboard.jpg` (fictional samples only).
- The workflow reported upstream GitHub Actions Node 20 deprecation warnings; build and deploy succeeded. Hosted integration checks below remain outstanding.

## Backend-connected Pages verification

- Successful backend-connected build and deployment: https://github.com/1nfected92/howdybiz/actions/runs/36898932167 (39 seconds).
- The published app opened at `https://1nfected92.github.io/howdybiz/`; Integrations displays the dedicated Supabase URL and public key, with sign-in still required.
- The current app defaults to Demo ON with no live business records. Google is labeled Setup required, Gmail OAuth required, and GitHub Pages Published.
- Screenshot: `docs/backend-connected.jpg` (public configuration only).
- Latest source verification: **24 automated tests passed**, and the static build succeeded.

## Hosted Supabase verification

- Initial migration applied successfully; all four public CRM tables and five private integration tables have RLS enabled.
- `api` function deployed and active. The OAuth callback and health endpoint are public; every CRM POST verifies the Auth user and configured owner.
- Auth Site URL and exact redirect allowlist saved for the deployed `/howdybiz/` URL. Email authentication is enabled; automatic email confirmation is disabled.
- `APP_URL`, `OWNER_EMAIL` and a generated 32-byte `GMAIL_TOKEN_KEY` were saved in encrypted function secrets. No secret values are committed.
- Health endpoint: HTTP 200, `status: ok`, owner configured, Places and Gmail OAuth credentials absent.
- Anonymous CRM SELECT and privileged mode RPC returned HTTP 401 with permission denied.
- Unauthenticated workspace requests returned a sign-in-required error. An invalid session was rejected; an untrusted origin returned HTTP 403. CORS preflight succeeded for the configured GitHub Pages origin.
- Hosted SQL verified ordinary authenticated users cannot INSERT, call privileged mode RPCs or access the private schema.
- A rolled-back transaction inserted isolated verification users/records and asserted that the owner sees its row and another user sees none. All fixtures were rolled back.
- Security advisor returned only five informational private-table notices for RLS without policies. This is intentional: browser roles have no schema access; only the service role uses those tables. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Google Cloud displayed “Site Unavailable” on opening and on one reload. Google client/API key creation remains blocked in this browser.

## Optional direct API dependencies

| Dependency | Observed state | Required next step |
|---|---|---|
| GitHub repository and Pages | Public `1nfected92/howdybiz` source published. GitHub Pages build and deployment succeeded. Published dashboard opened at `/howdybiz/`. | Completed; public backend configuration is included. |
| Dedicated Supabase project | Owner authorized pausing `football-squares`; status is INACTIVE. Dedicated `howdybiz` project `jmofyaleyhhylmxenqme` is ACTIVE_HEALTHY. The Soleful Goddess was not modified. | Completed. No paid upgrade performed. |
| Google discovery and photos | No Google Places/Geocoding API credentials supplied. | Configure Google Cloud APIs, billing/quota limits and backend API key. |
| Gmail runtime connection | Conversation Gmail profile verified; its credentials are not transferable to the application. No web OAuth client credentials supplied. | Configure Google web OAuth and explicitly connect Gmail in the app. |

New-project quote: **$0/month**. Creation succeeded after the authorized football pause. No paid upgrade was performed. No business or Gmail test email was sent.

## Not verified in this environment

- Owner confirmation and an Auth session are now verified in the database. This browser has not completed an owner-authenticated dashboard session, and hosted live edits after reload remain unverified.
- Live Google search, contact-enrichment coverage, Geocoding and Google photo availability.
- Real Google OAuth consent, token refresh, Gmail acceptance and mailbox receipt.
- Send performance under concurrent production traffic.

The database tests use real PostgreSQL semantics through PGlite, not hosted Supabase services. Website-request safety checks validate URL/DNS/redirect inputs; DNS pinning is not implemented, so this is not a guarantee against all DNS-rebinding behavior. The API is restricted to the verified workspace owner. Gmail authorization is send-only; reply reading and open tracking are not included. Payment entries are manual and do not charge or confirm provider transactions.

See `README.md` for setup and post-deployment validation steps.
