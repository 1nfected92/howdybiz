# HowdyBiz verification — 2026-10-01

**Result: frontend and backend source completed; GitHub repository created. Hosted backend and live provider integrations remain blocked.**

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

## External blockers

| Dependency | Observed state | Required next step |
|---|---|---|
| GitHub repository and Pages | Public `1nfected92/howdybiz` repository created using the authorized browser session. | Publish source through the connector and verify GitHub Pages workflow and public URL. |
| Dedicated Supabase project | New project request failed: account already has the two active free projects `football-squares` and `the-soleful-goddess`. | Resolve project capacity through an authorized plan change or an explicitly selected project pause. Neither existing project was modified. |
| Google discovery and photos | No Google Places/Geocoding API credentials supplied. | Configure Google Cloud APIs, billing/quota limits and backend API key. |
| Gmail runtime connection | Conversation Gmail profile verified; its credentials are not transferable to the application. No web OAuth client credentials supplied. | Configure Google web OAuth and explicitly connect Gmail in the app. |

The initial new-project cost quote was **$0/month**, but creation did not succeed. No Supabase upgrade or project pause was performed. No business or test email was sent.

## Not verified in this environment

- Actual GitHub Pages publication, Actions run and public URL.
- Hosted Supabase migration, Auth email-link delivery, security advisors and runtime function deployment.
- Live Google search, contact-enrichment coverage, Geocoding and Google photo availability.
- Real Google OAuth consent, token refresh, Gmail acceptance and mailbox receipt.
- Send performance under concurrent production traffic.

The database tests use real PostgreSQL semantics through PGlite, not hosted Supabase services. Website-request safety checks validate URL/DNS/redirect inputs; DNS pinning is not implemented, so this is not a guarantee against all DNS-rebinding behavior. The API is restricted to the verified workspace owner. Gmail authorization is send-only; reply reading and open tracking are not included. Payment entries are manual and do not charge or confirm provider transactions.

See `README.md` for setup and post-deployment validation steps.
