# Conversational Interest Profiler contract

## Architectural boundary

The Custom GPT owns conversation and pacing. The Cloudflare Worker owns:

- canonical assessment content;
- request validation;
- deterministic scoring;
- local occupation matching;
- optional privacy-preserving profile persistence.

There are **zero runtime calls to O*NET Web Services**. GitHub Actions obtain
the public downloadable O*NET database files and deploy transformed data to D1.
The official assessment form is vendored with the Worker.

## Conversation flow

1. The GPT calls `getInterestProfilerForm` once.
2. The GPT explains the five official response choices.
3. The GPT asks the official activity statements without changing their wording.
4. The GPT may ask one item at a time or in small batches.
5. The GPT maps natural-language responses to values 1–5.
6. Ambiguous responses are confirmed rather than guessed.
7. The GPT retains answers in the current conversation.
8. After all 30 answers are present, the GPT calls `scoreInterestProfile` once.
9. The Worker returns six RIASEC scores and locally ranked careers.
10. Storage is opt-in only.

The Worker must not require one API call per question.

## Operations

### `getInterestProfilerForm`

Returns:

- form ID and version;
- attribution and license notice;
- five official response options;
- 30 ordered questions with RIASEC areas;
- conversational administration guidance.

No O*NET dataset import is required for this operation.

### `scoreInterestProfile`

Input:

```json
{
  "formId": "mini-ip-30",
  "formVersion": "...",
  "answers": [
    { "index": 1, "value": 1 }
  ],
  "filters": {
    "jobZones": [2, 3, 4],
    "brightOutlookOnly": false,
    "stemOnly": false,
    "limit": 20
  }
}
```

Validation:

- exactly 30 unique indexes;
- indexes cover 1–30;
- values are integers 1–5;
- supplied form version equals the deployed form;
- no unknown fields;
- bounded result limit.

Output:

- raw and normalized six-area scores;
- ranked RIASEC high-point order;
- scoring and matching algorithm versions;
- active O*NET dataset version;
- locally ranked occupations;
- explicit disclosure that matching was calculated by this service from
  downloadable O*NET occupational profiles, not returned by O*NET Web Services.

### `saveInterestProfile`

Optional. Accepts a completed score object and preferences. Generates:

- a random profile ID;
- a high-entropy recovery token shown once;
- only a cryptographic hash stored in D1.

Do not store the 30 raw answers by default.

### `loadInterestProfile`

Requires the recovery token. Returns saved scores and preferences, then can
re-run career matching against either the recorded or current dataset according
to an explicit request option.

### `deleteInterestProfile`

Requires the recovery token. Revokes or permanently deletes the saved profile.

## Scoring

Implement scoring from the official O*NET Interest Profiler documentation and
lock it behind deterministic fixtures. The implementation must be independent
of the language model.

The score response must identify:

```text
scoring_version: onet-mini-ip-local-v1
```

Do not label locally calculated output as an O*NET Web Services response.

## Local career matching

Import the `Career Interest Types` downloadable JSON table. For each occupation,
retain the six rows whose scale is `OI` and map them to the six RIASEC dimensions.
The same table also contains `IH` high-point codes; retain these as useful
metadata, but do not mix IH values into the six-dimensional numeric vector.

Follow the current O*NET technical report on career returns:

- calculate profile correspondence using the correlation coefficient between
  the six-dimensional customer profile and each occupation's six-dimensional
  OI profile;
- document treatment of zero variance and missing data;
- use deterministic tie-breaking;
- apply job-zone and other filters after computing a valid correspondence
  score unless the report specifies otherwise;
- version any fit-band thresholds and display rules;
- include the raw correlation value in internal/debug output but expose a
  user-friendly fit label and explanation.

The initial matching identifier should be:

```text
matching_version: onet-profile-correlation-local-v1
```

Add tests using manually checked vectors, perfect positive/negative correlation,
ties, zero-variance vectors, filters, and missing occupation dimensions.

## D1 data requirements

Required for assessment scoring:

- none; the form and item-to-area mapping are static Worker assets.

Required for occupation matching:

- `Occupation Data`
- `Career Interest Types`
- `Job Zone Reference` and occupation job-zone data

Recommended for richer results:

- alternate/sample titles;
- related occupations;
- Bright Outlook and STEM flags;
- education, training, and experience;
- technology skills;
- task statements;
- skills and knowledge.

No O*NET API credentials are used by the importer or Worker.

## Privacy

Default mode is ephemeral:

- raw answers remain in the GPT conversation;
- the Worker receives them for scoring;
- the application database does not retain them;
- no user account is created.

Saved mode is explicit opt-in:

- store scores, preferences, versions, and timestamps;
- do not store names, email addresses, or raw answers by default;
- hash recovery tokens;
- support deletion;
- publish retention and expiration behavior.

The shared GPT API key authenticates the GPT, not the individual user. Never use
it as a user identity.
