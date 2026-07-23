# Operations runbook

## GitHub and secret protection

After the first successful run, protect `main`, require pull requests and CI review, dismiss stale approvals, restrict direct pushes, and use a protected `production` environment for deploy and refresh jobs. Workflow permissions remain `contents: read`.

GitHub Actions requires only `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. The token should be account-scoped and limited to Workers Scripts: Edit, D1: Edit, and Account Settings: Read. Do not use the Global API Key.

Before deployment, set `GPT_API_KEY`, `CAREERONESTOP_USER_ID`, and `CAREERONESTOP_API_TOKEN` directly on the existing Worker. Their live state was not reverified during repository preparation. Never place their values in source or workflows.

## Pre-deployment checklist

- [ ] `bun run ci` passes.
- [ ] `bun run interest-profiler:validate` confirms 30 items, mappings, choices, and content SHA-256.
- [ ] `bun run validate:providers` confirms one CareerOneStop adapter, no O*NET Web Services calls, no runtime secrets in workflows/OpenAPI/logging, and 20 operations.
- [ ] OpenAPI exposes exactly the 20 approved unique operation IDs in order.
- [ ] `GPT_API_KEY`, `CAREERONESTOP_USER_ID`, and `CAREERONESTOP_API_TOKEN` exist on the Worker and are absent from Git history.
- [ ] Migration `0002_interest_profiler.sql` has advanced schema metadata to `3`.
- [ ] Provider path templates have been compared with the current official CareerOneStop API Explorer.
- [ ] Credentialed synthetic provider-contract checks pass without exposing secrets or participant data.

## Provider health and failure behavior

`/health` returns only `careeronestop_configured: true|false`; it never returns secret values. Provider calls use an eight-second timeout, one retry for transient failures, one-megabyte response cap, HTML/control-character sanitization, and stable errors:

- `502 provider_request_rejected` or `provider_invalid_response` for nontransient/re malformed upstream responses;
- `503 provider_temporarily_unavailable` or `provider_unavailable` for transient upstream failure;
- `504 provider_timeout` for timeout after bounded retry;
- `503 provider_not_configured` when required Worker secrets are absent.

Job search is bounded to six list calls, three concurrent provider calls, and eight detail calls. Training details are bounded to five shortlisted records. No provider response is stored in D1.

CareerOneStop API details may change. Revalidate the endpoint contract after upstream announcements or any recurring provider error. Update the adapter contract version, tests, and provider documentation together.

## Participant privacy checks

- [ ] No raw resume, name, phone, email, street address, DOB, SSN, child-support record, case information, or participant identifier is sent to the Worker operation.
- [ ] Only temporary job-relevant profile fields, O*NET code/minimal keyword, ZIP or city/state, radius, and supported preferences are used.
- [ ] Justice-impacted resources are requested only when explicitly relevant.
- [ ] Logs contain request IDs and stable error codes only; no request bodies, provider URLs, authorization headers, provider user IDs, or tokens.

## Pre-import checklist

- [ ] Release detection comes from `https://www.onetcenter.org/database.html`.
- [ ] Required JSON downloads include Occupation Data, Career Interest Types, and Job Zones.
- [ ] Source manifest records every URL and SHA-256 plus the combined release digest.
- [ ] Occupation count is 800–1,200 and representative codes exist.
- [ ] Every matchable occupation has exactly six unique expected `OI` dimensions.
- [ ] No `IH` high-point element is stored as an `OI` numeric score.
- [ ] Job zones are null or 1–5; profile JSON is valid.
- [ ] FTS row count equals occupation count.
- [ ] No normalized relationship is orphaned.
- [ ] Predicted D1 row writes are at or below 90,000, including staging cleanup.
- [ ] Transformation and verification SQL are complete before the first remote write.
- [ ] The previous active dataset remains available for rollback.

## Import failure behavior

An unchanged release exits successfully before download/import writes. Download, parsing, transformation, form validation, or budget failures perform no remote writes. Import verification failure prevents activation and leaves the previous active release selected. A staging rerun first removes rows tagged with that staging version; those cleanup deletes consume D1 writes, so inspect artifacts before repeatedly forcing a failed import.

The refresh artifact retains the source manifest, checksums, generated SQL chunks, verification queries, activation SQL, redacted Wrangler log, and summary.

## Rollback

```bash
CONFIRM_ROLLBACK=30.2 \
CLOUDFLARE_ACCOUNT_ID=... \
CLOUDFLARE_API_TOKEN=... \
bun run data:rollback -- --to 30.2
```

The confirmation must exactly match an imported dataset version. Rollback changes only active metadata/status and does not reconstruct deleted releases.

## Saved-profile maintenance

Profiles may be permanently deleted or revoked through the API using the recovery token. Expired profiles are excluded from load operations but are not automatically purged. Add a separately reviewed maintenance job before introducing physical expiration cleanup.
