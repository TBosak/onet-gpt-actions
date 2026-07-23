# Changelog

## 0.3.0 — 2026-07-23

- Added CareerOneStop as the sole live employment-data provider behind the existing Worker.
- Added six EDGE-oriented operations, bringing the approved OpenAPI surface to exactly 20 operations.
- Added one private adapter for location, Jobs V2, LMI, salary, Training V2, licenses, certifications, American Job Centers, reentry programs, and state resources.
- Added strict provider timeouts, bounded retry/jitter, response-size caps, HTML/control-character sanitization, error normalization, and credential redaction boundaries.
- Added privacy whitelists that reject raw resumes, direct identifiers, street addresses, child-support/case fields, and unknown request properties.
- Added bounded provider fan-out and deterministic local job-fit scoring with the versioned 30/25/15/10/10/5/5 model.
- Added provider contract fixtures, a credentialed preproduction test plan, and CI checks preventing O*NET Web Services calls or CareerOneStop secret use in GitHub Actions.
- Declared `GPT_API_KEY`, `CAREERONESTOP_USER_ID`, and `CAREERONESTOP_API_TOKEN` as required Worker secrets while keeping GitHub Actions limited to Cloudflare deployment credentials.
- Added no Cloudflare resource and no D1 migration.

## 0.2.0 — 2026-07-23

- Replaced the earlier direct interest-profile matching endpoint with the conversational Mini Interest Profiler flow.
- Added the versioned, verbatim 30-item English form and schema validation.
- Added deterministic scoring and Pearson-correlation occupation matching with versioned fit bands.
- Kept OI numeric dimensions separate from IH high-point codes throughout import and verification.
- Added optional recovery-token profile save, load/rematch, revoke, and permanent deletion.
- Added schema migration 0002 and advanced the target schema to 3.
- Expanded the OpenAPI action surface to the approved 14 operations.
- Kept all runtime requests local to the Cloudflare Worker; no O*NET Web Services API key or proxy is used.
- Added cleanup-aware D1 write-budget enforcement and additional importer integrity metrics.
