# O*NET GPT Data API

A Cloudflare Worker for a Custom GPT that combines transformed public O*NET® downloadable data, the official 30-item English Mini Interest Profiler, and privacy-bounded EDGE employment support. The Worker is the only action host. It never calls or proxies O*NET Web Services and requires no O*NET API credential. CareerOneStop is the sole live employment-data provider in the initial release and remains hidden behind the Worker.

## Fixed infrastructure

- Worker: `onet-gpt-api`
- URL: `https://onet-gpt-api.timb63701.workers.dev`
- D1 database: `onet-gpt-data`
- D1 database ID: `49013492-f380-4937-8926-20e6fb0d5dc9`
- D1 binding: `DB`
- Live baseline schema: `2`
- Target schema after `0002_interest_profiler.sql`: `3`

Do not recreate or rename these resources. CareerOneStop adds no Cloudflare resource and no D1 migration.

## Architecture

GitHub Actions detects the current O*NET database release, downloads selected official JSON files, transforms them into a bounded denormalized dataset, verifies staging, and activates it only after validation. The Worker reads D1 and contains the canonical Interest Profiler form as a versioned static asset.

CareerOneStop handles only current or location-dependent information: location validation, current Jobs V2 listings/details, local LMI, training, salary, licensing, certifications, American Job Centers, reentry programs, and state resources. All vendor-specific URL construction and bearer authentication live in `src/lib/careeronestop.ts`.

The default assessment mode is ephemeral. Raw answers are used for one scoring request and are not written to D1. Optional saved profiles store only six scores, preferences, form/algorithm versions, dataset version, timestamps, and a SHA-256 recovery-token hash. Raw resumes and structured participant profiles are not persisted.

## GPT-facing operations

The OpenAPI 3.1 document at `/openapi.json` exposes exactly 20 operations:

1. `searchOccupations`
2. `getOccupationProfile`
3. `compareOccupations`
4. `rankOccupations`
5. `findRelatedOccupations`
6. `browseOccupations`
7. `searchSkills`
8. `searchTechnologies`
9. `getDataVersion`
10. `getInterestProfilerForm`
11. `scoreInterestProfile`
12. `saveInterestProfile`
13. `loadInterestProfile`
14. `deleteInterestProfile`
15. `findJobsForParticipant`
16. `getJobMatchDetails`
17. `getLocalCareerOutlook`
18. `findTrainingOptions`
19. `checkCareerRequirements`
20. `findEmploymentSupport`

Public utility routes are `/`, `/health`, `/openapi.json`, and `/privacy`. Every `/v1/*` request requires `X-API-Key`.

## Interest Profiler behavior

`getInterestProfilerForm` returns the canonical form, five official choices, license metadata, and administration guidance without requiring an imported dataset. The GPT asks the unmodified statements and retains answers in the conversation. After all 30 answers are present, it calls `scoreInterestProfile` once.

Scoring is deterministic (`onet-mini-ip-local-v1`). Career matching uses Pearson correlation between the six customer RIASEC scores and each occupation's six `OI` values (`onet-profile-correlation-local-v1`). `IH` high-point rows are retained separately and never enter the numeric vector. Flat customer profiles and zero-variance occupation profiles are not matched. Fit bands are versioned from the October 2025 O*NET Career Returns report:

- Best: `r >= 0.729`
- Good: `r >= 0.608`
- Okay: `r >= 0.426`
- Lower correlations are omitted.

## EDGE employment behavior

`findJobsForParticipant` sends CareerOneStop at most five O*NET-code searches plus one bounded keyword search, then fetches details for at most eight shortlisted jobs. Provider fan-out, including shortlisted training details, is capped at three concurrent calls. The local, versioned `edge-job-fit-v1` model explains a 100-point score using:

- 30 points: O*NET occupation alignment
- 25 points: explicit skill coverage
- 15 points: experience fit
- 10 points: education/credential fit
- 10 points: location/work-arrangement fit
- 5 points: recency
- 5 points: participant preferences

Unknown evidence receives neutral treatment and is disclosed separately from explicit mismatch. Protected characteristics, parenthood, family status, child-support status, justice involvement, and other non-job-related factors are excluded. Transportation, shift, radius, schedule, and wage are user-supplied feasibility preferences, not eligibility factors.

Never submit raw resumes, names, phone numbers, email addresses, street addresses, dates of birth, Social Security numbers, child-support records, case data, or participant identifiers. Only a temporary job-relevant profile, O*NET codes/minimal keywords, ZIP or city/state, radius, and supported filters are accepted. Obvious email, phone, Social Security number, and street-address patterns are rejected even when embedded in an otherwise allowed field.

## Official sources

### O*NET

- Current database/release discovery: `https://www.onetcenter.org/database.html`
- Downloaded JSON files: `https://www.onetcenter.org/dl_files/database/db_<release>_json/<table>.json`
- Career Interest Types dictionary: `https://www.onetcenter.org/dictionary/30.3/json/career_interest_types.html`
- Canonical Mini-IP form provenance: `https://services.onetcenter.org/reference/mnm/ip/ip_questions_30`
- Career Returns report: `https://www.onetcenter.org/reports/IP_Career_Returns.html`
- Database license: `https://www.onetcenter.org/license_db.html`
- Career Exploration Tools license: `https://www.onetcenter.org/license_tools.html`

The form source URL is provenance metadata only; runtime source and workflows do not fetch it.

### CareerOneStop

- API Explorer: `https://api.careeronestop.org/api-explorer/`
- Developer overview: `https://www.careeronestop.org/Developers/WebAPI/web-api.aspx`
- Citation guidance: `https://www.careeronestop.org/Help/cite-this-website.aspx`

See `docs/CAREERONESTOP_PROVIDER.md` for the verified path templates and safeguards.

## Local development

```bash
bun install
cp config/.dev.vars.example .dev.vars
bun run db:migrate:local
bun run ci
bun run dev
```

`.dev.vars` must contain local-only values for `GPT_API_KEY`, `CAREERONESTOP_USER_ID`, and `CAREERONESTOP_API_TOKEN` and must never be committed.

Prepare an O*NET release locally without touching Cloudflare:

```bash
ONET_MAX_ROW_WRITES=90000 bun run data:prepare
```

Generated manifests, checksums, validation SQL, activation SQL, and bounded import chunks are written under `dist/onet/<release>/`.

## Required manual secrets

GitHub Actions are not operational until these repository or `production` environment secrets exist:

- `CLOUDFLARE_ACCOUNT_ID` = `0b9fc64dcbdce3defab40cd129a91dac`
- `CLOUDFLARE_API_TOKEN` = a narrowly scoped token with Workers Scripts: Edit, D1: Edit, and Account Settings: Read for this account only

Set these three runtime values directly on the existing Worker, not in ordinary GitHub Actions secrets:

- `GPT_API_KEY`
- `CAREERONESTOP_USER_ID`
- `CAREERONESTOP_API_TOKEN`

Their current live state was not reverified while preparing this repository. `wrangler.jsonc` declares the required names, so deployment fails clearly when one is absent. Cloudflare preserves encrypted Worker secrets during normal code deployments.

Example Wrangler setup:

```bash
bunx wrangler secret put GPT_API_KEY
bunx wrangler secret put CAREERONESTOP_USER_ID
bunx wrangler secret put CAREERONESTOP_API_TOKEN
```

Use the `GPT_API_KEY` value as the Custom GPT Action's `X-API-Key` credential. Never commit or invent any secret value.

## Exact first production run

1. Create the GitHub repository and push this scaffold to `main`.
2. Add only `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` to the protected `production` environment.
3. Verify or set all three required Worker runtime secrets directly in Cloudflare.
4. Run `bun install` and `bun run ci` locally.
5. Apply only the additive saved-profile migration to the existing live schema: `bunx wrangler d1 execute onet-gpt-data --remote --file=migrations/0002_interest_profiler.sql`.
6. Run **Validate and Deploy Worker** manually.
7. Verify `/health`, `/openapi.json`, and `/privacy`; `/health` should disclose only whether CareerOneStop is configured.
8. Run the credentialed provider-contract checks in `docs/CAREERONESTOP_CONTRACT_TEST_PLAN.md` using synthetic data.
9. Run **Refresh O*NET Data** manually with `force` disabled.
10. Inspect the manifest, checksums, generated SQL, verification metrics, and refresh summary artifact.
11. Confirm `/health` reports schema `3`, `api_status: ready`, and an active dataset.
12. Exercise all 20 operations before importing `/openapi.json` into the Custom GPT.

## Import safeguards and limitations

The importer counts planned row writes and aborts above `ONET_MAX_ROW_WRITES` (default `90000`). It validates occupation counts, representative codes, profile JSON, job zones, FTS parity, referential integrity, six complete `OI` dimensions per matchable occupation, and zero `IH` rows in the numeric vector.

Bright Outlook and STEM flags remain false until official classification inputs are added. The importer retains the previous active release for rollback and does not automatically purge older superseded releases. No application-level participant account system, job archive, employer overlay, resume database, or case-management table exists.

CareerOneStop responses are current-provider data with varying source vintages. The Worker does not guarantee that a listing remains open, that a wage is offered, or that a license/certification record is complete. No provider response is persisted, and the initial release adds no shared cache.

See `NOTICE.md`, `SECURITY.md`, `docs/OPERATIONS.md`, and `contracts/careeronestop-edge-api.md`.
