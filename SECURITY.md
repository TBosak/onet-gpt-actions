# Security policy

Report suspected credential exposure or vulnerabilities privately to the repository owner. Do not place API keys, Cloudflare tokens, CareerOneStop credentials, recovery tokens, request headers, raw resumes, participant identifiers, or sensitive search/profile details in public issues.

## Authentication boundaries

Protected routes require `X-API-Key`. That shared key authenticates the Custom GPT, not an individual user. `CAREERONESTOP_USER_ID` and `CAREERONESTOP_API_TOKEN` authenticate only the Worker to the upstream provider. All three are encrypted Worker secrets and are not ordinary GitHub Actions secrets.

GitHub Actions contains only `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. The deployment workflow does not upload or rotate runtime secrets. The refresh workflow is the only automated production-data writer.

## Provider boundary

All CareerOneStop URL and bearer-header construction is isolated in `src/lib/careeronestop.ts`. The adapter uses bounded timeouts/retries, caps response size, requests non-HTML job details, strips HTML and control characters, and returns stable errors without provider URLs, path user IDs, tokens, or authorization headers. Runtime code logs only a request ID and a generic unexpected-error string after provider errors have already been normalized.

Do not add logging of request bodies, provider requests, environment bindings, or upstream response headers. Do not place `CAREERONESTOP_USER_ID`, `CAREERONESTOP_API_TOKEN`, or `GPT_API_KEY` in workflows, OpenAPI, test fixtures, documentation examples containing real values, or issue reports.

## Participant privacy

Resume files stay in the GPT conversation. The Worker accepts a temporary structured profile containing only job-relevant skills, experience, education, credentials, and target O*NET codes. It does not persist raw resumes or participant profiles and does not send names, phone numbers, email addresses, street addresses, dates of birth, Social Security numbers, child-support records, case information, or participant identifiers upstream. Strict field whitelists and obvious identifier-pattern checks reject sensitive values before provider calls.

Justice-impacted resources are requested only when explicitly selected. Justice involvement, parenthood, family status, child-support status, and protected characteristics never affect job-fit scoring.

## Interest Profiler and D1

Interest Profiler use is ephemeral by default. Optional saved profiles store a SHA-256 recovery-token hash rather than the token, omit raw answers and direct identifiers, support expiration, and can be revoked or permanently deleted. Recovery tokens are bearer credentials and must be protected by the user.

Request bodies and result counts are bounded. Request-driven D1 values use prepared statements. Import SQL is generated only from official downloaded source files after transformation and validation, and the workflow aborts before remote writes when the planned write count exceeds the configured budget.
