import { Hono } from "hono";
import { getActiveVersion, getMetadata, parseProfile } from "./lib/db";
import { CareerOneStopClient, ProviderError } from "./lib/careeronestop";
import {
  EdgeValidationError,
  checkCareerRequirements,
  findEmploymentSupport,
  findJobsForParticipant,
  findTrainingOptions,
  getJobMatchDetails,
  getLocalCareerOutlook,
} from "./lib/edge";
import {
  validateJobDetailInput,
  validateJobSearchInput,
  validateOutlookInput,
  validateRequirementsInput,
  validateSupportInput,
  validateTrainingInput,
} from "./lib/edge-validation";
import {
  FIT_RULES_VERSION,
  MATCHING_VERSION,
  SCORING_VERSION,
  generateRecoveryToken,
  hashRecoveryToken,
  interestProfilerForm,
  matchInterestProfile,
  scoreInterestAnswers,
  validateRecoveryRequest,
  validateSavedScore,
  validateScoreRequest,
} from "./lib/interest-profiler";
import {
  BodyError,
  errorResponse,
  readJsonBody,
  requestId,
  secureEqual,
} from "./lib/http";
import {
  boundedInt,
  finiteNumber,
  nonEmptyString,
  occupationCode,
  optionalBoolean,
  toFtsQuery,
} from "./lib/validation";
import { openapi } from "./openapi";
import type { AppEnv, OccupationRow } from "./types";

const PUBLIC_URL = "https://onet-gpt-api.timb63701.workers.dev";
const PRIVACY_TEXT = `O*NET GPT Data API Privacy Policy

This service uses transformed O*NET downloadable occupational data and a vendored O*NET Mini Interest Profiler form. The assessment is ephemeral by default: raw answers are received for scoring but are not written to the application database.

Saved profiles are optional and require explicit opt-in. A saved profile contains only the six scores, filters/preferences, form and algorithm versions, dataset version, timestamps, and a cryptographic hash of an opaque recovery token. It does not contain raw answers, names, or email addresses. A recovery token can be used to load, revoke, or permanently delete a saved profile.

The shared API key authenticates the Custom GPT, not an individual user. Cloudflare may process routine request metadata and security logs. Do not send sensitive personal information in search terms or profile preferences.

For EDGE employment support, the Worker sends only bounded occupation codes or keywords, city/state or ZIP, radius, and provider-supported filters to CareerOneStop. It does not send or persist raw resumes, names, contact information, street addresses, child-support records, case information, dates of birth, or Social Security numbers. CareerOneStop data is treated as untrusted source material and is normalized before return.

Job-fit scores are transparent local decision support and are not automated employment decisions. Protected characteristics and family or child-support status are excluded from scoring.

O*NET® is a trademark of the U.S. Department of Labor, Employment and Training Administration. This independent service is not sponsored, endorsed, or approved by USDOL/ETA.`;

const OCCUPATION_COLUMNS = `
  o.code,
  o.dataset_version,
  o.title,
  o.description,
  o.job_zone,
  o.job_family_code,
  o.job_family_title,
  o.bright_outlook,
  o.stem,
  o.profile_json,
  o.updated_at`;

export const app = new Hono<AppEnv>();

app.use("*", async (c, next) => {
  c.set("requestId", requestId(c.req.raw));
  await next();
  c.header("x-request-id", c.get("requestId"));
  c.header("x-content-type-options", "nosniff");
  c.header("referrer-policy", "no-referrer");
  c.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
});

app.use("/v1/*", async (c, next) => {
  const expected = c.env.GPT_API_KEY ?? "";
  const supplied = c.req.header("x-api-key") ?? "";
  if (!expected || !supplied || !(await secureEqual(expected, supplied))) {
    return errorResponse(c, 401, "unauthorized", "A valid X-API-Key header is required.");
  }
  await next();
});

app.get("/", (c) =>
  c.json({
    service: "O*NET GPT Data API",
    health: `${PUBLIC_URL}/health`,
    openapi: `${PUBLIC_URL}/openapi.json`,
    privacy: `${PUBLIC_URL}/privacy`,
  }),
);

app.get("/openapi.json", (c) => {
  c.header("cache-control", "public, max-age=300");
  return c.json(openapi);
});

app.get("/privacy", (c) => {
  c.header("content-type", "text/plain; charset=utf-8");
  c.header("cache-control", "public, max-age=3600");
  return c.body(PRIVACY_TEXT);
});

app.get("/health", async (c) => {
  const metadata = await getMetadata(c.env.DB);
  c.header("cache-control", "no-store");
  return c.json({
    ok: true,
    database: "reachable",
    api_status: metadata.api_status?.value ?? "unknown",
    schema_version: metadata.schema_version?.value ?? null,
    active_dataset_version: metadata.active_dataset_version?.value || null,
    careeronestop_configured: Boolean(
      c.env.CAREERONESTOP_USER_ID && c.env.CAREERONESTOP_API_TOKEN,
    ),
    timestamp: new Date().toISOString(),
  });
});

app.get("/v1/meta/version", async (c) => {
  const metadata = await getMetadata(c.env.DB);
  const activeVersion = metadata.active_dataset_version?.value || null;
  const dataset = activeVersion
    ? await c.env.DB
        .prepare(
          `SELECT version, source_url, source_sha256, imported_at, activated_at,
                  occupation_count, status, notes
           FROM dataset_versions
           WHERE version = ?`,
        )
        .bind(activeVersion)
        .first<Record<string, unknown>>()
    : null;
  return c.json({ metadata, dataset });
});

app.get("/v1/occupations/search", async (c) => {
  const version = await requireDataset(c);
  if (typeof version !== "string") return version;
  const query = nonEmptyString(c.req.query("q"), "q");
  const limit = boundedInt(c.req.query("limit"), 10, 1, 25);
  const ftsQuery = toFtsQuery(query);
  if (!ftsQuery) return errorResponse(c, 422, "validation_error", "q has no searchable terms.");

  const result = await c.env.DB
    .prepare(
      `SELECT o.code, o.title, o.description, o.job_zone, o.job_family_code,
              o.job_family_title, o.bright_outlook, o.stem,
              bm25(occupation_search) AS relevance
       FROM occupation_search
       JOIN occupations o
         ON o.code = occupation_search.code
        AND o.dataset_version = occupation_search.dataset_version
       WHERE occupation_search MATCH ?
         AND occupation_search.dataset_version = ?
       ORDER BY relevance, o.title
       LIMIT ?`,
    )
    .bind(ftsQuery, version, limit)
    .all<Record<string, unknown>>();

  return c.json({ version, query, occupations: result.results });
});

app.get("/v1/occupations", async (c) => {
  const version = await requireDataset(c);
  if (typeof version !== "string") return version;
  const limit = boundedInt(c.req.query("limit"), 20, 1, 50);
  const values: unknown[] = [version];
  const clauses = ["o.dataset_version = ?"];

  const jobZone = c.req.query("jobZone");
  if (jobZone !== undefined) {
    const parsed = boundedInt(jobZone, 0, 0, 5);
    if (parsed < 1) return errorResponse(c, 422, "validation_error", "jobZone must be 1 through 5.");
    clauses.push("o.job_zone = ?");
    values.push(parsed);
  }

  const family = c.req.query("jobFamily")?.trim();
  if (family) {
    clauses.push("o.job_family_code = ?");
    values.push(family);
  }

  const bright = optionalBoolean(c.req.query("brightOutlook") ?? null);
  if (bright !== undefined) {
    clauses.push("o.bright_outlook = ?");
    values.push(bright ? 1 : 0);
  }

  const stem = optionalBoolean(c.req.query("stem") ?? null);
  if (stem !== undefined) {
    clauses.push("o.stem = ?");
    values.push(stem ? 1 : 0);
  }

  const after = c.req.query("after")?.trim();
  if (after) {
    clauses.push("o.code > ?");
    values.push(after);
  }
  values.push(limit + 1);

  const result = await c.env.DB
    .prepare(
      `SELECT o.code, o.title, o.description, o.job_zone, o.job_family_code,
              o.job_family_title, o.bright_outlook, o.stem
       FROM occupations o
       WHERE ${clauses.join(" AND ")}
       ORDER BY o.code
       LIMIT ?`,
    )
    .bind(...values)
    .all<Record<string, unknown>>();

  const hasMore = result.results.length > limit;
  const occupations = hasMore ? result.results.slice(0, limit) : result.results;
  const next = hasMore ? String(occupations.at(-1)?.code ?? "") : null;
  return c.json({ version, occupations, next });
});

app.post("/v1/occupations/compare", async (c) => {
  const version = await requireDataset(c);
  if (typeof version !== "string") return version;
  const body = await readJsonBody<{ codes?: unknown }>(c);
  if (!Array.isArray(body.codes) || body.codes.length < 2 || body.codes.length > 5) {
    return errorResponse(c, 422, "validation_error", "codes must contain two to five occupation codes.");
  }
  const codes = [...new Set(body.codes.map(occupationCode))];
  if (codes.length !== body.codes.length) {
    return errorResponse(c, 422, "validation_error", "codes must be unique.");
  }

  const placeholders = codes.map(() => "?").join(", ");
  const result = await c.env.DB
    .prepare(
      `SELECT ${OCCUPATION_COLUMNS}
       FROM occupations o
       WHERE o.dataset_version = ? AND o.code IN (${placeholders})`,
    )
    .bind(version, ...codes)
    .all<OccupationRow>();
  const byCode = new Map(result.results.map((row) => [row.code, parseProfile(row)]));
  const missing = codes.filter((code) => !byCode.has(code));
  if (missing.length > 0) {
    return errorResponse(c, 404, "occupation_not_found", "One or more occupations were not found.", {
      missing,
    });
  }
  return c.json({ version, occupations: codes.map((code) => byCode.get(code)) });
});

app.post("/v1/occupations/rank", async (c) => {
  const version = await requireDataset(c);
  if (typeof version !== "string") return version;
  const body = await readJsonBody<{
    criteria?: Array<{ elementId?: unknown; weight?: unknown }>;
    jobZones?: unknown;
    limit?: unknown;
  }>(c);
  if (!Array.isArray(body.criteria) || body.criteria.length < 1 || body.criteria.length > 20) {
    return errorResponse(c, 422, "validation_error", "criteria must contain one to twenty entries.");
  }

  const criteria = body.criteria.map((item, index) => ({
    elementId: nonEmptyString(item.elementId, `criteria[${index}].elementId`, 40),
    weight: finiteNumber(item.weight, `criteria[${index}].weight`, Number.EPSILON, 100),
  }));
  const limit = boundedInt(body.limit === undefined ? undefined : String(body.limit), 10, 1, 25);
  const cte = criteria.map(() => "(?, ?)").join(", ");
  const values: unknown[] = criteria.flatMap((item) => [item.elementId, item.weight]);
  values.push(version, version);

  const where = ["o.dataset_version = ?", "s.dataset_version = ?"];
  if (body.jobZones !== undefined) {
    if (!Array.isArray(body.jobZones) || body.jobZones.length > 5) {
      return errorResponse(c, 422, "validation_error", "jobZones must be an array of values 1 through 5.");
    }
    const zones = [...new Set(body.jobZones.map((value) => finiteNumber(value, "jobZones", 1, 5)))];
    if (zones.length > 0) {
      where.push(`o.job_zone IN (${zones.map(() => "?").join(", ")})`);
      values.push(...zones);
    }
  }
  values.push(limit);

  const result = await c.env.DB
    .prepare(
      `WITH criteria(element_id, weight) AS (VALUES ${cte})
       SELECT o.code, o.title, o.description, o.job_zone, o.job_family_code,
              o.job_family_title, o.bright_outlook, o.stem,
              ROUND(SUM(s.value * criteria.weight) / SUM(criteria.weight), 4) AS score,
              COUNT(*) AS matched_criteria
       FROM criteria
       JOIN occupation_scores s ON s.element_id = criteria.element_id
       JOIN occupations o
         ON o.code = s.occupation_code
        AND o.dataset_version = s.dataset_version
       WHERE ${where.join(" AND ")}
       GROUP BY o.code, o.dataset_version
       HAVING matched_criteria = ?
       ORDER BY score DESC, o.title
       LIMIT ?`,
    )
    .bind(...values.slice(0, -1), criteria.length, values.at(-1))
    .all<Record<string, unknown>>();

  return c.json({ version, criteria, occupations: result.results });
});

app.get("/v1/interest-profiler/form", (c) => {
  c.header("cache-control", "private, max-age=86400, immutable");
  return c.json({
    ...interestProfilerForm,
    administrationGuidance: {
      instruction:
        "Ask the statements without changing their wording. The user answers with one of the five official choices. Confirm ambiguous natural-language responses instead of guessing.",
      recommendedBatchSize: 5,
      submitWhenComplete: "Call scoreInterestProfile once with all 30 unique answers.",
      persistence: "Conversation-only mode is the default. Saving is optional and explicit.",
    },
  });
});

app.post("/v1/interest-profiler/score", async (c) => {
  const request = validateScoreRequest(await readJsonBody<unknown>(c));
  const scores = scoreInterestAnswers(request.answers);
  const version = await getActiveVersion(c.env.DB);
  const matches =
    version && scores.validForMatching
      ? await matchInterestProfile(c.env.DB, version, scores.raw, request.filters)
      : [];
  return c.json({
    formId: request.formId,
    formVersion: request.formVersion,
    scoringVersion: SCORING_VERSION,
    matchingVersion: MATCHING_VERSION,
    fitRulesVersion: FIT_RULES_VERSION,
    activeDatasetVersion: version,
    scores,
    filters: request.filters,
    occupations: matches,
    matchingStatus: !scores.validForMatching
      ? "flat_profile"
      : version
        ? "complete"
        : "dataset_not_loaded",
    disclosure:
      "Assessment scores and occupation matches are calculated locally by this service from the vendored form and downloadable O*NET occupational profiles. They are not O*NET Web Services responses.",
  });
});

app.post("/v1/interest-profiler/profiles", async (c) => {
  const saved = validateSavedScore(await readJsonBody<unknown>(c));
  const dataset = await c.env.DB
    .prepare("SELECT status FROM dataset_versions WHERE version = ?")
    .bind(saved.matchedDatasetVersion)
    .first<{ status: string }>();
  if (!dataset) {
    return errorResponse(c, 409, "dataset_not_available", "The requested matched dataset is not available.");
  }
  const profileId = crypto.randomUUID();
  const recoveryToken = generateRecoveryToken();
  const tokenHash = await hashRecoveryToken(recoveryToken);
  await c.env.DB
    .prepare(
      `INSERT INTO interest_profiles (
         id, access_token_hash, form_id, form_version, scoring_version, matching_version,
         scores_json, preferences_json, matched_dataset_version, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      profileId,
      tokenHash,
      saved.formId,
      saved.formVersion,
      saved.scoringVersion,
      saved.matchingVersion,
      JSON.stringify(saved.scores),
      JSON.stringify(saved.preferences),
      saved.matchedDatasetVersion,
      saved.expiresAt,
    )
    .run();
  return c.json(
    {
      profileId,
      recoveryToken,
      expiresAt: saved.expiresAt,
      warning: "Store the recovery token now. It is shown only once and cannot be recovered by the service.",
    },
    201,
  );
});

app.post("/v1/interest-profiler/profiles/load", async (c) => {
  const request = validateRecoveryRequest(await readJsonBody<unknown>(c), "load");
  const tokenHash = await hashRecoveryToken(request.recoveryToken);
  const row = await c.env.DB
    .prepare(
      `SELECT id, form_id, form_version, scoring_version, matching_version, scores_json,
              preferences_json, matched_dataset_version, created_at, updated_at,
              last_accessed_at, expires_at
       FROM interest_profiles
       WHERE access_token_hash = ?
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR datetime(expires_at) > CURRENT_TIMESTAMP)`,
    )
    .bind(tokenHash)
    .first<{
      id: string;
      form_id: string;
      form_version: string;
      scoring_version: string;
      matching_version: string;
      scores_json: string;
      preferences_json: string;
      matched_dataset_version: string;
      created_at: string;
      updated_at: string;
      last_accessed_at: string | null;
      expires_at: string | null;
    }>();
  if (!row) return errorResponse(c, 404, "profile_not_found", "No active saved profile matches that recovery token.");

  const currentVersion = await getActiveVersion(c.env.DB);
  const matchVersion = request.matchAgainst === "current" ? currentVersion : row.matched_dataset_version;
  if (!matchVersion) {
    return errorResponse(c, 503, "dataset_not_loaded", "The requested matching dataset is not active.");
  }
  const dataset = await c.env.DB
    .prepare("SELECT status FROM dataset_versions WHERE version = ?")
    .bind(matchVersion)
    .first<{ status: string }>();
  if (!dataset) {
    return errorResponse(c, 409, "dataset_not_available", "The saved profile's requested dataset is no longer available.");
  }

  const scores = JSON.parse(row.scores_json) as ReturnType<typeof scoreInterestAnswers>;
  const savedPreferences = JSON.parse(row.preferences_json) as Parameters<typeof matchInterestProfile>[3];
  const filters = request.filters ?? savedPreferences;
  const occupations = scores.validForMatching
    ? await matchInterestProfile(c.env.DB, matchVersion, scores.raw, filters)
    : [];
  await c.env.DB
    .prepare("UPDATE interest_profiles SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(row.id)
    .run();

  return c.json({
    profile: {
      profileId: row.id,
      formId: row.form_id,
      formVersion: row.form_version,
      scoringVersion: row.scoring_version,
      matchingVersion: row.matching_version,
      scores,
      preferences: savedPreferences,
      matchedDatasetVersion: row.matched_dataset_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastAccessedAt: row.last_accessed_at,
      expiresAt: row.expires_at,
    },
    matchAgainst: request.matchAgainst,
    matchedDatasetVersion: matchVersion,
    filters,
    occupations,
    disclosure:
      "Occupation matches were recalculated locally from downloadable O*NET occupational profiles and are not O*NET Web Services responses.",
  });
});

app.post("/v1/interest-profiler/profiles/delete", async (c) => {
  const request = validateRecoveryRequest(await readJsonBody<unknown>(c), "delete");
  const tokenHash = await hashRecoveryToken(request.recoveryToken);
  const existing = await c.env.DB
    .prepare("SELECT id FROM interest_profiles WHERE access_token_hash = ? AND revoked_at IS NULL")
    .bind(tokenHash)
    .first<{ id: string }>();
  if (!existing) return errorResponse(c, 404, "profile_not_found", "No active saved profile matches that recovery token.");
  const mode = request.mode ?? "delete";
  if (mode === "revoke") {
    await c.env.DB
      .prepare("UPDATE interest_profiles SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(existing.id)
      .run();
  } else {
    await c.env.DB.prepare("DELETE FROM interest_profiles WHERE id = ?").bind(existing.id).run();
  }
  return c.json({ profileId: existing.id, mode, removed: true });
});


app.post("/v1/edge/jobs/search", async (c) => {
  const input = validateJobSearchInput(await readJsonBody<unknown>(c));
  c.header("cache-control", "no-store");
  return c.json(await findJobsForParticipant(c.env.DB, careerOneStop(c), input));
});

app.post("/v1/edge/jobs/details", async (c) => {
  const input = validateJobDetailInput(await readJsonBody<unknown>(c));
  c.header("cache-control", "no-store");
  return c.json(await getJobMatchDetails(careerOneStop(c), input));
});

app.post("/v1/edge/career-outlook", async (c) => {
  const input = validateOutlookInput(await readJsonBody<unknown>(c));
  c.header("cache-control", "private, max-age=900");
  return c.json(await getLocalCareerOutlook(c.env.DB, careerOneStop(c), input));
});

app.post("/v1/edge/training", async (c) => {
  const input = validateTrainingInput(await readJsonBody<unknown>(c));
  c.header("cache-control", "private, max-age=900");
  return c.json(await findTrainingOptions(careerOneStop(c), input));
});

app.post("/v1/edge/requirements", async (c) => {
  const input = validateRequirementsInput(await readJsonBody<unknown>(c));
  c.header("cache-control", "private, max-age=3600");
  return c.json(await checkCareerRequirements(careerOneStop(c), input));
});

app.post("/v1/edge/support", async (c) => {
  const input = validateSupportInput(await readJsonBody<unknown>(c));
  c.header("cache-control", "private, max-age=900");
  return c.json(await findEmploymentSupport(careerOneStop(c), input));
});

app.get("/v1/skills/search", async (c) => {
  const version = await requireDataset(c);
  if (typeof version !== "string") return version;
  const query = nonEmptyString(c.req.query("q"), "q");
  const limit = boundedInt(c.req.query("limit"), 10, 1, 25);
  const result = await c.env.DB
    .prepare(
      `SELECT e.id, e.name, e.description,
              COUNT(s.occupation_code) AS occupation_count,
              ROUND(AVG(s.value), 3) AS average_score
       FROM elements e
       LEFT JOIN occupation_scores s
         ON s.element_id = e.id
        AND s.dataset_version = e.dataset_version
       WHERE e.dataset_version = ?
         AND e.category = 'skill'
         AND (e.name LIKE ? ESCAPE '\\' OR e.description LIKE ? ESCAPE '\\')
       GROUP BY e.id, e.dataset_version
       ORDER BY CASE WHEN lower(e.name) = lower(?) THEN 0 ELSE 1 END,
                occupation_count DESC, e.name
       LIMIT ?`,
    )
    .bind(version, like(query), like(query), query, limit)
    .all<Record<string, unknown>>();
  return c.json({ version, query, skills: result.results });
});

app.get("/v1/technologies/search", async (c) => {
  const version = await requireDataset(c);
  if (typeof version !== "string") return version;
  const query = nonEmptyString(c.req.query("q"), "q");
  const limit = boundedInt(c.req.query("limit"), 10, 1, 25);
  const result = await c.env.DB
    .prepare(
      `SELECT t.id, t.name, t.category,
              COUNT(ot.occupation_code) AS occupation_count,
              SUM(ot.hot_technology) AS hot_occupation_count,
              SUM(ot.in_demand) AS in_demand_occupation_count
       FROM technologies t
       LEFT JOIN occupation_technologies ot
         ON ot.technology_id = t.id
        AND ot.dataset_version = t.dataset_version
       WHERE t.dataset_version = ?
         AND t.name LIKE ? ESCAPE '\\'
       GROUP BY t.id, t.dataset_version
       ORDER BY CASE WHEN lower(t.name) = lower(?) THEN 0 ELSE 1 END,
                occupation_count DESC, t.name
       LIMIT ?`,
    )
    .bind(version, like(query), query, limit)
    .all<Record<string, unknown>>();
  return c.json({ version, query, technologies: result.results });
});

app.get("/v1/occupations/:code/related", async (c) => {
  const version = await requireDataset(c);
  if (typeof version !== "string") return version;
  const code = occupationCode(c.req.param("code"));
  const limit = boundedInt(c.req.query("limit"), 10, 1, 25);
  const exists = await c.env.DB
    .prepare("SELECT 1 AS found FROM occupations WHERE code = ? AND dataset_version = ?")
    .bind(code, version)
    .first<{ found: number }>();
  if (!exists) return errorResponse(c, 404, "occupation_not_found", `Occupation ${code} was not found.`);

  const result = await c.env.DB
    .prepare(
      `SELECT o.code, o.title, o.description, o.job_zone, o.job_family_code,
              o.job_family_title, o.bright_outlook, o.stem,
              r.relation_type, r.score
       FROM related_occupations r
       JOIN occupations o
         ON o.code = r.related_code
        AND o.dataset_version = r.dataset_version
       WHERE r.dataset_version = ? AND r.occupation_code = ?
       ORDER BY CASE r.relation_type WHEN 'primary' THEN 0 ELSE 1 END,
                r.score DESC, o.title
       LIMIT ?`,
    )
    .bind(version, code, limit)
    .all<Record<string, unknown>>();
  return c.json({ version, code, occupations: result.results });
});

app.get("/v1/occupations/:code", async (c) => {
  const version = await requireDataset(c);
  if (typeof version !== "string") return version;
  const code = occupationCode(c.req.param("code"));
  const row = await c.env.DB
    .prepare(
      `SELECT ${OCCUPATION_COLUMNS}
       FROM occupations o
       WHERE o.code = ? AND o.dataset_version = ?`,
    )
    .bind(code, version)
    .first<OccupationRow>();
  if (!row) return errorResponse(c, 404, "occupation_not_found", `Occupation ${code} was not found.`);
  return c.json(parseProfile(row));
});

app.notFound((c) => errorResponse(c, 404, "not_found", "Route not found."));

app.onError((error, c) => {
  if (error instanceof BodyError) {
    return errorResponse(c, error.status, error.code, error.message, error.details);
  }
  if (error instanceof ProviderError) {
    return errorResponse(c, error.status, error.code, error.message, error.details);
  }
  if (error instanceof EdgeValidationError) {
    return errorResponse(c, 422, "validation_error", error.message);
  }
  console.error(
    JSON.stringify({
      requestId: c.get("requestId"),
      errorType: error instanceof Error ? error.name : "unknown",
    }),
  );
  return errorResponse(c, 500, "internal_error", "The service encountered an unexpected error.");
});

function careerOneStop(c: Parameters<typeof errorResponse>[0]): CareerOneStopClient {
  return new CareerOneStopClient({
    userId: c.env.CAREERONESTOP_USER_ID ?? "",
    apiToken: c.env.CAREERONESTOP_API_TOKEN ?? "",
  });
}

async function requireDataset(c: Parameters<typeof errorResponse>[0]) {
  const version = await getActiveVersion(c.env.DB);
  return version ?? errorResponse(c, 503, "dataset_not_loaded", "The first O*NET data import has not run.");
}

function like(value: string): string {
  return `%${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}
