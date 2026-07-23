# CareerOneStop provider-contract test plan

No fixture contains real credentials. Unit tests use a recording fetch stub and placeholder values.

## Automated tests in this repository

`test/careeronestop.test.ts` verifies:

1. Exact official path construction for all six launch calls: location validation, Jobs V2 list, Jobs V2 details, LMI, Training V2 list, and Training V2 details.
2. Exact path construction for salary, licenses, certifications, American Job Centers, reentry programs, and justice-impacted state resources.
3. Bearer-token placement in the upstream request header only.
4. `isHtml=false` for job details.
5. Stable 502/503/504 error normalization without provider credentials or path user IDs.
6. Rejection of invalid JSON and sanitization of HTML/control characters.
7. Upstream response-size limits.

`test/edge.test.ts` verifies:

1. Versioned 30/25/15/10/10/5/5 job-fit scoring.
2. Deterministic output and tie-breaking inputs.
3. Neutral treatment of unavailable evidence versus explicit mismatch.
4. Explanations, missing requirements, and unknowns.
5. Rejection of direct identifiers, raw resumes, case-related fields, and obvious identifier patterns embedded in allowed string fields.

`scripts/validate-provider-boundaries.ts` fails CI when:

- runtime code or workflows reference O*NET Web Services;
- any file outside the single provider adapter constructs a CareerOneStop URL or upstream authorization header;
- GitHub Actions consumes `GPT_API_KEY` or CareerOneStop runtime credentials;
- `wrangler.jsonc` does not declare exactly the three required Worker secret names;
- OpenAPI exposes provider binding names or upstream authorization details;
- runtime logging could print provider credentials;
- the GPT-facing operation count differs from 20.

## Credentialed preproduction contract run

Perform this only after secrets are set directly on the deployed Worker.

1. Call `/health`; verify `careeronestop_configured: true` without secret values.
2. Call each of the six EDGE operations with a test ZIP, a public O*NET code, and synthetic job-relevant inputs containing no real participant data.
3. Verify provider responses include retrieval timestamps and do not expose the CareerOneStop user ID, token, or authorization header.
4. Confirm invalid ZIP/state, unknown fields, street-address fields, raw resume fields, and oversized input return stable 4xx errors without an upstream request.
5. Confirm a simulated provider timeout maps to 504; 429/5xx maps to 503 after bounded retry; nontransient rejection maps to 502.
6. Confirm job search performs no more than six list calls and eight detail calls, with concurrency capped at three.
7. Confirm training performs one bounded list call and at most five detail calls, with no more than three provider calls in flight.
8. Confirm justice-impacted resources are queried only when that category is explicitly requested.
9. Confirm application logs contain request IDs and stable errors only—never upstream URLs, authorization headers, tokens, provider user IDs, raw resumes, or participant identifiers.
10. Recheck all provider templates against the current official API Explorer before the first production deployment and after any provider contract change.

## Change-control trigger

CareerOneStop notes that API details can change. A provider path, parameter, authentication, or response-shape change requires an adapter version bump, fixture update, test-plan rerun, and OpenAPI impact review before deployment.
