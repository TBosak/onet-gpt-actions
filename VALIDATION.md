# Validation record

Prepared on July 23, 2026 for repository version 0.3.0.

## Completed in the handoff environment

- Read the v3 handoff contract and incorporated its CareerOneStop/EDGE amendment without adding a Cloudflare resource or D1 migration.
- Parsed every JSON/JSONC file and both GitHub Actions YAML workflows.
- Performed a strict semantic TypeScript pass over `src`, `scripts`, tests, and Vitest configuration using TypeScript 5.8.3 with temporary declarations for unavailable Hono, Workers, Bun, Node, and Vitest packages.
- Compiled the CareerOneStop adapter and EDGE scoring modules to JavaScript and executed runtime fixtures.
- Verified exact current request construction for all six launch provider calls: location validation, Jobs V2 list/details, LMI, and Training V2 list/details.
- Verified request construction for salary, license, certification, American Job Center, reentry-program, and justice-impacted state-resource calls. Training detail fan-out is capped at three concurrent calls and degrades to list evidence on individual detail failure.
- Verified bearer authentication placement, `isHtml=false`, upstream HTML/control-character sanitization, invalid-JSON normalization, and credential-free provider errors.
- Verified the versioned 30/25/15/10/10/5/5 job-fit model returns seven explanations, deterministic output for a fixed retrieval time, neutral unknown treatment, and privacy rejection for prohibited fields and obvious embedded identifier patterns.
- Validated the vendored form against its JSON Schema and semantic invariants.
- Recomputed and matched form content SHA-256 `3212159a65c40fdd593598c2ae43af26d8964c2880b52f319ee0b90b8f6b6758`.
- Confirmed exactly 20 OpenAPI operation IDs in the approved order.
- Executed `scripts/validate-provider-boundaries.ts`: one provider adapter, no runtime/workflow O*NET Web Services calls, no Worker runtime secrets in GitHub Actions or OpenAPI, no credential logging pattern, and exact required-secret declarations.
- Applied migrations 0001 and 0002 to an in-memory SQLite database and confirmed `schema_version = 3` with no CareerOneStop table.
- Confirmed workflows reference only `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as GitHub secrets.

## Deferred to the first dependency-backed run

This execution environment has no Bun binary and cannot resolve the package registry, so it could not run the installed-package versions of `bun run ci`, Vitest, Biome, Wrangler configuration validation, or a local Miniflare/D1 integration test. Both supplied workflows run `bun run ci` before deployment or remote data writes.

No live CareerOneStop call was made because runtime credentials were not available. No production deploy, GitHub Actions run, D1 migration, source-data import, Cloudflare-resource change, or secret mutation was performed while preparing this archive.
