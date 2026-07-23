# CareerOneStop provider adapter

CareerOneStop is the only live employment-data provider in the initial release. It is private infrastructure behind the Cloudflare Worker and is never exposed as a Custom GPT action host.

## Authentication boundary

The adapter reads `CAREERONESTOP_USER_ID` and `CAREERONESTOP_API_TOKEN` from encrypted Worker secrets. It places the user ID only in the vendor request path and sends the token only as an `Authorization: Bearer` header. Provider URLs, credentials, and authorization headers are never logged or returned.

The Custom GPT supplies only `X-API-Key` to this Worker. It never receives CareerOneStop credentials.

## Verified provider paths

The route builder in `src/lib/careeronestop.ts` centralizes these official contracts:

| Capability | Provider path |
|---|---|
| Location validation | `/v1/location/{userId}/{location}` |
| Jobs V2 list | `/v2/jobsearch/{userId}/{keyword}/{location}/{radius}/{sortColumns}/{sortOrder}/{startRecord}/{pageSize}/{days}` |
| Jobs V2 details | `/v2/jobsearch/{userId}/{JvId}` |
| Local LMI | `/v1/lmi/{userId}/{onetCode}/{location}` |
| Salary details | `/v1/comparesalaries/{userId}/wage` |
| Training V2 list | `/v2/training/programs/{userId}/{keyword}/{location}/{radius}/{programLength}/{school}/{programName}/{programFormat}/{occupation}/{filterBySource}/{area}/{sortColumns}/{sortDirection}/{startRecord}/{limitRecord}` |
| Training V2 details | `/v2/training/program/{userId}/{detailID}` |
| License list | `/v1/license/{userId}/{keyword}/{location}/{sortColumns}/{sortDirections}/{startRecord}/{limitRecord}` |
| Certification list | `/v1/certificationfinder/{userId}/{keyword}/{directFlag}/{industry}/{certType}/{organization}/{occupation}/{agency}/{sortColumn}/{sortDirections}/{startRecord}/{limitRecord}` |
| American Job Centers | `/v1/ajcfinder/{userId}/{location}/{radius}/{centerType}/{youthServices}/{workersServices}/{businessServices}/{sortColumns}/{sortDirections}/{startRecord}/{limitRecord}` |
| Reentry programs | `/v1/reentryprogramfinder/{userId}/{location}/{radius}/{sortColumns}/{sortDirections}/{startRecord}/{limitRecord}` |
| State resources | `/v1/stateresources/{userId}/{state}/{audience}/{startRecord}/{limitRecord}` |

Official API Explorer: `https://api.careeronestop.org/api-explorer/`.

## Safeguards

- One adapter owns all vendor URL and authorization construction.
- Eight-second default timeout, one retry, bounded jitter, and retries only for transient network, 429, or 5xx failures.
- One-megabyte maximum upstream response and bounded object/array/string sanitization.
- Job details request `isHtml=false`; all returned strings are still stripped of HTML and control characters.
- Stable Worker errors use `provider_*` codes and never include request URLs or secret material.
- Job searches use at most five O*NET-code queries plus one bounded keyword query.
- Provider fan-out is capped at three concurrent requests; full details are fetched for at most eight shortlisted jobs and five shortlisted training programs. A failed training-detail call falls back to sanitized list evidence rather than failing the whole request.
- No provider response is persisted in D1.

## Freshness and limitations

Each response includes a Worker retrieval timestamp and provider metadata when supplied. The initial implementation performs live bounded requests and does not add a new cache or Cloudflare resource. Current job availability is not guaranteed; users must confirm opening status, compensation, schedule, qualifications, and employer legitimacy before applying.

CareerOneStop publishes data from multiple underlying sources with different update schedules. Missing data is returned as unknown rather than inferred.
