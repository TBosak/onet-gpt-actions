# Interest Profiler source asset

The production repository must vendor the official English O*NET Mini Interest
Profiler as a static, versioned JSON asset. It must not retrieve questions from
O*NET Web Services at runtime and must not require an O*NET API key.

Expected production path:

```text
src/data/interest-profiler/mini-ip-30.en.json
```

Validate that file against `mini-ip-30.schema.json`.

## Content rules

- Include exactly 30 activity statements.
- Preserve the official wording and order verbatim.
- Preserve the official RIASEC area assigned to each item.
- Preserve the official five answer choices and numeric values 1–5.
- Record source URL, retrieval timestamp, SHA-256, form version, language, and
  attribution.
- Set `license.modified` to `false`.
- Do not paraphrase, simplify, expand, or replace assessment items.
- Do not let the Custom GPT improvise substitute questions.
- The GPT may add conversational framing and may normalize a user's natural
  language answer into an official response value, but ambiguity must be
  confirmed with the user.

## Licensing boundary

The assessment content is separate from the O*NET database license. Verbatim
redistribution should use the O*NET Career Exploration Tools CC BY-ND 4.0
option with the required attribution. Any modified assessment belongs under
the separate O*NET Tools Developer License and must not be introduced as an
incidental implementation change.

## Acquisition

The GitHub implementation agent should obtain the current official form from
an official O*NET source, preserve it verbatim, and commit it with a source
manifest. Do not scrape or copy a third-party reproduction.

The schema file intentionally contains no assessment wording.
