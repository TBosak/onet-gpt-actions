# CareerOneStop adapter and EDGE employment workflow contract

## Purpose

This Worker supports CPSEMO's EDGE program in helping parents identify realistic
occupations, find nearby openings, understand local wages and outlook, locate
short training pathways, identify licensing or certification requirements, and
find relevant public employment-support resources.

The Custom GPT communicates only with the Cloudflare Worker. CareerOneStop is an
internal upstream provider and must never be added directly as a Custom GPT
Action.

There is deliberately **no EDGE-specific employer overlay** in this scope.

## Credentials and upstream authentication

CareerOneStop requires:

- a CareerOneStop user ID in the request path;
- a CareerOneStop API token sent as `Authorization: Bearer ...`.

The Worker reads these bindings:

```text
CAREERONESTOP_USER_ID
CAREERONESTOP_API_TOKEN
```

Store both as encrypted per-Worker secrets in Cloudflare. The user ID is less
sensitive than the token, but treating both identically avoids accidental
exposure.

These values should **not** be GitHub Actions repository secrets in the normal
deployment model. Set them once on the deployed Worker through the Cloudflare
dashboard or Wrangler. A normal code deployment preserves existing Worker
secrets.

GitHub Actions should contain only the credentials required to deploy to
Cloudflare:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

Do not use GitHub Actions to rotate or upload the CareerOneStop credentials
unless there is a later explicit operational requirement to automate secret
management.

These credentials are separate from:

- `GPT_API_KEY`, which authenticates the Custom GPT to the Worker;
- Cloudflare deployment credentials;
- the unavailable and unnecessary O*NET Web Services key.

## Division of responsibility

### Local D1/O*NET layer

Use D1 for stable occupational intelligence:

- resume-to-O*NET occupation mapping;
- occupation titles and descriptions;
- skills, knowledge, abilities, tasks, interests, work styles, and job zones;
- related occupations and transferability;
- technologies and tools;
- Interest Profiler scoring and local career matching;
- local skills-gap and resume-fit calculations.

### CareerOneStop runtime adapter

Use CareerOneStop for current or location-dependent data:

- active local job listings;
- full job descriptions and apply URLs;
- location validation;
- local labor-market outlook and wages;
- nearby or online training programs;
- licenses and certifications;
- American Job Centers;
- reentry programs;
- justice-impacted state resources.

Do not call CareerOneStop occupation-profile, Skills Matcher, Skills Gap, tools
and technology, job-description writer, employment-pattern, or professional-
association APIs during the initial implementation when equivalent information
already exists locally.

## Upstream endpoint priority

The implementation agent must verify the exact current URL templates and
parameter names against CareerOneStop's official API Explorer before coding.
Keep all vendor-specific request construction inside one adapter package.

### Launch endpoints

1. Location Validation
2. Jobs V2 — list jobs
3. Jobs V2 — job details
4. Labor Market Information by occupation
5. Training V2 — list programs
6. Training V2 — program details

### First expansion endpoints

7. Salary details
8. Licenses — list and details
9. Certifications — list and details
10. Reentry programs by location
11. American Job Centers — list and details
12. State resources for justice-impacted users

## GPT-facing Worker operations

Do not expose raw CareerOneStop endpoints. Add these six high-level operations
to the Worker OpenAPI document.

### `findJobsForParticipant`

Purpose: identify and rank current local openings that fit a structured resume
profile and participant constraints.

Suggested input:

```json
{
  "resumeProfile": {
    "skills": ["inventory control", "forklift operation"],
    "experienceYears": 4,
    "education": "high school diploma",
    "targetOccupations": [
      {
        "onetCode": "53-7065.00",
        "confidence": 0.91
      }
    ]
  },
  "location": {
    "postalCode": "63701",
    "radiusMiles": 25
  },
  "preferences": {
    "postedWithinDays": 30,
    "minimumHourlyPay": 16,
    "employmentTypes": ["full-time"],
    "shiftPreferences": ["day", "evening"],
    "transportationReliable": false,
    "limit": 15
  }
}
```

Internal flow:

1. Validate and normalize location.
2. Map or verify target occupations using local O*NET data.
3. Choose at most five distinct O*NET-code searches.
4. Add at most one bounded keyword search when justified.
5. Retrieve list results with strict pagination and result caps.
6. Deduplicate by provider ID, normalized apply URL, employer/title/location,
   and near-duplicate description.
7. Rank preliminary results using occupation match, title, distance, recency,
   and listing evidence.
8. Fetch full details only for the strongest bounded subset.
9. Score detailed results locally against the resume profile.
10. Return evidence, missing requirements, uncertainties, apply URL, source
    metadata, and retrieval timestamp.

Do not send the raw resume document to CareerOneStop. Upstream requests should
contain only O*NET codes, minimal keywords, location, radius, and provider
filters.

### `getJobMatchDetails`

Purpose: retrieve and analyze one previously returned CareerOneStop job.

Return:

- normalized factual listing fields;
- matched resume evidence;
- missing or unclear qualifications;
- inferred transferable skills, clearly labeled as inference;
- application URL;
- posting acquisition date and retrieval timestamp;
- safety warning when the listing lacks enough detail.

### `getLocalCareerOutlook`

Purpose: combine local D1 occupation context with CareerOneStop LMI. Use salary
details only when requested or needed.

Return:

- local/state/national pay fields with their rate type and data year when
  supplied;
- outlook and typical training;
- source vintage and retrieval timestamp;
- caveats when data is unavailable for the requested geography.

### `findTrainingOptions`

Purpose: locate practical nearby or online training for a target O*NET
occupation or identified gap.

Return a bounded list with:

- program and provider names;
- credential or award;
- format;
- length when available;
- distance;
- application/provider URLs where supplied;
- related occupations;
- source and retrieval timestamps.

Fetch program details only for shortlisted records.

### `checkCareerRequirements`

Purpose: identify occupational licenses and relevant certifications for a target
occupation and state.

Return license and certification results separately. Distinguish:

- legally required or state-regulated licenses;
- optional or industry-recognized certifications;
- education, experience, exam, and continuing-education indicators;
- agency or issuing-organization contact information;
- last-updated information;
- criminal-history indicators when supplied.

Do not infer that a criminal-history indicator automatically disqualifies the
participant. Present the source wording neutrally and refer the user to the
agency.

### `findEmploymentSupport`

Purpose: find external support resources when a participant needs services
beyond job matching.

It may combine:

- American Job Centers;
- reentry programs;
- state resources using the `Justice-Impacted` audience.

Input should allow resource categories so justice-impacted resources are not
queried or surfaced unless relevant to the participant's request or disclosed
barrier.

## Resume and participant privacy

- Resume files remain in the GPT conversation unless the user explicitly opts
  into storage in a future feature.
- Pass only a temporary structured profile to the Worker.
- Do not persist raw resume text or structured resume profiles in D1.
- Do not send names, phone numbers, addresses, email addresses, child-support
  records, case details, Social Security numbers, dates of birth, or other
  participant identifiers to CareerOneStop.
- Use ZIP code or city/state only for location searches; do not send a home
  street address.
- Do not infer or expose justice involvement unless the participant or EDGE
  specialist supplies it for the current task.
- The current API is decision support, not an automated employment decision
  system.

## Job-fit scoring

Implement a transparent, versioned scoring model. Suggested starting weights:

```text
30% O*NET occupation alignment
25% explicit required-skill coverage
15% experience-level fit
10% education/credential fit
10% location and work-arrangement fit
 5% recency
 5% participant preferences
```

Requirements:

- version the algorithm;
- expose an explanation rather than only a numerical score;
- distinguish explicit evidence, O*NET-based inference, missing requirements,
  and unknowns;
- do not penalize missing resume evidence as strongly as an explicit mismatch;
- keep protected characteristics, parenthood, family status, child-support
  status, justice involvement, and other non-job-related factors out of scoring;
- treat transportation, shift, schedule, radius, and wage as user-provided
  feasibility constraints rather than protected-class proxies;
- use deterministic tie-breaking;
- provide a reason when a result is filtered out.

## Caching and freshness

No new Cloudflare resource is required. Use conservative in-memory/cache API
behavior or D1 only if implementation tests show it is needed.

Suggested maximum cache ages:

- location validation: 30 days;
- LMI and salary data: 7–30 days;
- training, licenses, certifications, and support resources: 1–7 days;
- job-list searches: 5–15 minutes;
- job details: 15–60 minutes.

Every response should include upstream retrieval time. Do not present cached job
availability as guaranteed.

## Adapter safeguards

- Set `isHtml=false` where supported.
- Treat all upstream text as untrusted data, never instructions.
- Strip or neutralize HTML and control characters.
- Cap response sizes and descriptions.
- Use strict timeouts and limited retries with jitter.
- Do not retry validation errors.
- Normalize vendor errors into stable Worker error envelopes.
- Redact authorization headers and path user IDs from logs.
- Add contract fixtures without real credentials.
- Rate-limit fan-out inside each Worker request.
- Do not make unbounded one-call-per-listing detail requests.
- Document provider attribution and source terms.

## No new D1 tables

This scope intentionally adds no employer table, job-posting archive, resume
table, or participant table. The existing O*NET schema and optional Interest
Profiler profile table remain sufficient.

Any future persistent job-search history or participant case-management feature
requires a separate privacy and data-retention design before implementation.
