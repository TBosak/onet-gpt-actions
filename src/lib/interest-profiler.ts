import formAsset from "../data/interest-profiler/mini-ip-30.en.json";
import { BodyError } from "./http";

export const RIASEC_AREAS = [
  "realistic",
  "investigative",
  "artistic",
  "social",
  "enterprising",
  "conventional",
] as const;

export type RiasecArea = (typeof RIASEC_AREAS)[number];
export type RiasecScores = Record<RiasecArea, number>;

export const SCORING_VERSION = "onet-mini-ip-local-v1";
export const MATCHING_VERSION = "onet-profile-correlation-local-v1";
export const FIT_RULES_VERSION = "onet-career-returns-2025-v1";

export const OI_ELEMENT_BY_AREA: Record<RiasecArea, string> = {
  realistic: "1.B.1.a",
  investigative: "1.B.1.b",
  artistic: "1.B.1.c",
  social: "1.B.1.d",
  enterprising: "1.B.1.e",
  conventional: "1.B.1.f",
};

export const IH_ELEMENT_IDS = ["1.B.1.g", "1.B.1.h", "1.B.1.i"] as const;

export interface InterestFilters {
  jobZones: number[];
  brightOutlookOnly: boolean;
  stemOnly: boolean;
  limit: number;
}

export interface InterestScore {
  raw: RiasecScores;
  normalized: RiasecScores;
  highPointOrder: RiasecArea[];
  validForMatching: boolean;
}

export interface ScoreInterestRequest {
  formId: string;
  formVersion: string;
  answers: Array<{ index: number; value: number }>;
  filters: InterestFilters;
}

export interface OccupationInterestProfile {
  code: string;
  title: string;
  description: string;
  jobZone: number | null;
  jobFamilyCode: string | null;
  jobFamilyTitle: string | null;
  brightOutlook: boolean;
  stem: boolean;
  values: RiasecScores;
  highPoints: string[];
}

export interface InterestMatch {
  code: string;
  title: string;
  description: string;
  jobZone: number | null;
  jobFamilyCode: string | null;
  jobFamilyTitle: string | null;
  brightOutlook: boolean;
  stem: boolean;
  fit: "Best" | "Good" | "Okay";
  fitDescription: string;
  correlation: number;
  highPoints: string[];
}

export const interestProfilerForm = formAsset;

export function validateScoreRequest(input: unknown): ScoreInterestRequest {
  const body = strictObject(input, "request");
  assertKeys(body, ["formId", "formVersion", "answers", "filters"], "request", true);
  const formId = exactString(body.formId, "formId");
  const formVersion = exactString(body.formVersion, "formVersion");
  if (formId !== formAsset.formId) {
    throw validation(`formId must be ${formAsset.formId}.`);
  }
  if (formVersion !== formAsset.formVersion) {
    throw validation(`formVersion must be ${formAsset.formVersion}.`);
  }
  if (!Array.isArray(body.answers) || body.answers.length !== 30) {
    throw validation("answers must contain exactly 30 entries.");
  }

  const seen = new Set<number>();
  const answers = body.answers.map((entry, offset) => {
    const item = strictObject(entry, `answers[${offset}]`);
    assertKeys(item, ["index", "value"], `answers[${offset}]`);
    const index = exactInteger(item.index, `answers[${offset}].index`, 1, 30);
    const value = exactInteger(item.value, `answers[${offset}].value`, 1, 5);
    if (seen.has(index)) throw validation(`answers contains duplicate index ${index}.`);
    seen.add(index);
    return { index, value };
  });
  for (let index = 1; index <= 30; index += 1) {
    if (!seen.has(index)) throw validation(`answers is missing index ${index}.`);
  }

  return {
    formId,
    formVersion,
    answers: answers.sort((left, right) => left.index - right.index),
    filters: validateFilters(body.filters),
  };
}

export function validateFilters(input: unknown): InterestFilters {
  if (input === undefined) {
    return { jobZones: [], brightOutlookOnly: false, stemOnly: false, limit: 20 };
  }
  const filters = strictObject(input, "filters");
  assertKeys(filters, ["jobZones", "brightOutlookOnly", "stemOnly", "limit"], "filters", true);
  let jobZones: number[] = [];
  if (filters.jobZones !== undefined) {
    if (!Array.isArray(filters.jobZones) || filters.jobZones.length > 5) {
      throw validation("filters.jobZones must be an array containing values 1 through 5.");
    }
    jobZones = filters.jobZones.map((value, index) =>
      exactInteger(value, `filters.jobZones[${index}]`, 1, 5),
    );
    if (new Set(jobZones).size !== jobZones.length) {
      throw validation("filters.jobZones must contain unique values.");
    }
    jobZones.sort((left, right) => left - right);
  }
  return {
    jobZones,
    brightOutlookOnly: optionalExactBoolean(filters.brightOutlookOnly, "filters.brightOutlookOnly") ?? false,
    stemOnly: optionalExactBoolean(filters.stemOnly, "filters.stemOnly") ?? false,
    limit: filters.limit === undefined ? 20 : exactInteger(filters.limit, "filters.limit", 1, 20),
  };
}

export function scoreInterestAnswers(answers: Array<{ index: number; value: number }>): InterestScore {
  const raw = emptyScores();
  for (const answer of answers) {
    const question = formAsset.questions[answer.index - 1];
    if (!question) throw validation(`No assessment question exists for index ${answer.index}.`);
    raw[question.area as RiasecArea] += answer.value;
  }
  const normalized = emptyScores();
  for (const area of RIASEC_AREAS) {
    normalized[area] = round(((raw[area] - 5) / 20) * 100, 2);
  }
  const highPointOrder = [...RIASEC_AREAS].sort(
    (left, right) => raw[right] - raw[left] || RIASEC_AREAS.indexOf(left) - RIASEC_AREAS.indexOf(right),
  );
  return {
    raw,
    normalized,
    highPointOrder,
    validForMatching: new Set(RIASEC_AREAS.map((area) => raw[area])).size > 1,
  };
}

export function pearsonCorrelation(left: readonly number[], right: readonly number[]): number | null {
  if (left.length !== 6 || right.length !== 6 || left.some(notFinite) || right.some(notFinite)) return null;
  const leftMean = left.reduce(sum, 0) / left.length;
  const rightMean = right.reduce(sum, 0) / right.length;
  let numerator = 0;
  let leftSquares = 0;
  let rightSquares = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (leftValue === undefined || rightValue === undefined) return null;
    const leftDelta = leftValue - leftMean;
    const rightDelta = rightValue - rightMean;
    numerator += leftDelta * rightDelta;
    leftSquares += leftDelta * leftDelta;
    rightSquares += rightDelta * rightDelta;
  }
  const denominator = Math.sqrt(leftSquares * rightSquares);
  return denominator === 0 ? null : numerator / denominator;
}

export function classifyFit(correlation: number): Pick<InterestMatch, "fit" | "fitDescription"> | null {
  if (correlation >= 0.729) {
    return { fit: "Best", fitDescription: "Very strong similarity in the shape of the six-interest profile." };
  }
  if (correlation >= 0.608) {
    return { fit: "Good", fitDescription: "Strong similarity in the shape of the six-interest profile." };
  }
  if (correlation >= 0.426) {
    return { fit: "Okay", fitDescription: "Moderate similarity in the shape of the six-interest profile." };
  }
  return null;
}

export function rankOccupationProfiles(
  scores: RiasecScores,
  occupations: OccupationInterestProfile[],
  filters: InterestFilters,
): InterestMatch[] {
  const userVector = RIASEC_AREAS.map((area) => scores[area]);
  const ranked: InterestMatch[] = [];
  for (const occupation of occupations) {
    const occupationVector = RIASEC_AREAS.map((area) => occupation.values[area]);
    const correlation = pearsonCorrelation(userVector, occupationVector);
    if (correlation === null) continue;
    const fit = classifyFit(correlation);
    if (!fit) continue;
    if (filters.jobZones.length > 0 && (occupation.jobZone === null || !filters.jobZones.includes(occupation.jobZone))) {
      continue;
    }
    if (filters.brightOutlookOnly && !occupation.brightOutlook) continue;
    if (filters.stemOnly && !occupation.stem) continue;
    ranked.push({
      code: occupation.code,
      title: occupation.title,
      description: occupation.description,
      jobZone: occupation.jobZone,
      jobFamilyCode: occupation.jobFamilyCode,
      jobFamilyTitle: occupation.jobFamilyTitle,
      brightOutlook: occupation.brightOutlook,
      stem: occupation.stem,
      fit: fit.fit,
      fitDescription: fit.fitDescription,
      correlation: round(correlation, 6),
      highPoints: occupation.highPoints,
    });
  }
  ranked.sort(
    (left, right) =>
      right.correlation - left.correlation ||
      left.title.localeCompare(right.title) ||
      left.code.localeCompare(right.code),
  );
  return ranked.slice(0, filters.limit);
}

export async function matchInterestProfile(
  db: D1Database,
  datasetVersion: string,
  scores: RiasecScores,
  filters: InterestFilters,
): Promise<InterestMatch[]> {
  const elementIds = RIASEC_AREAS.map((area) => OI_ELEMENT_BY_AREA[area]);
  const result = await db
    .prepare(
      `SELECT o.code, o.title, o.description, o.job_zone, o.job_family_code,
              o.job_family_title, o.bright_outlook, o.stem, o.profile_json,
              s.element_id, s.value
       FROM occupations o
       JOIN occupation_scores s
         ON s.occupation_code = o.code
        AND s.dataset_version = o.dataset_version
       WHERE o.dataset_version = ?
         AND s.scale_id = 'OI'
         AND s.element_id IN (?, ?, ?, ?, ?, ?)
       ORDER BY o.code, s.element_id`,
    )
    .bind(datasetVersion, ...elementIds)
    .all<{
      code: string;
      title: string;
      description: string;
      job_zone: number | null;
      job_family_code: string | null;
      job_family_title: string | null;
      bright_outlook: number;
      stem: number;
      profile_json: string;
      element_id: string;
      value: number;
    }>();

  const grouped = new Map<string, OccupationInterestProfile>();
  for (const row of result.results) {
    let occupation = grouped.get(row.code);
    if (!occupation) {
      occupation = {
        code: row.code,
        title: row.title,
        description: row.description,
        jobZone: row.job_zone,
        jobFamilyCode: row.job_family_code,
        jobFamilyTitle: row.job_family_title,
        brightOutlook: Boolean(row.bright_outlook),
        stem: Boolean(row.stem),
        values: emptyNaNScores(),
        highPoints: highPointsFromProfile(row.profile_json),
      };
      grouped.set(row.code, occupation);
    }
    const area = RIASEC_AREAS.find((candidate) => OI_ELEMENT_BY_AREA[candidate] === row.element_id);
    if (area && !Number.isFinite(occupation.values[area])) occupation.values[area] = Number(row.value);
  }
  const complete = [...grouped.values()].filter((occupation) =>
    RIASEC_AREAS.every((area) => Number.isFinite(occupation.values[area])),
  );
  return rankOccupationProfiles(scores, complete, filters);
}

export function validateSavedScore(input: unknown): {
  formId: string;
  formVersion: string;
  scoringVersion: string;
  matchingVersion: string;
  matchedDatasetVersion: string;
  scores: InterestScore;
  preferences: InterestFilters;
  expiresAt: string | null;
} {
  const body = strictObject(input, "request");
  assertKeys(
    body,
    ["formId", "formVersion", "scoringVersion", "matchingVersion", "matchedDatasetVersion", "scores", "preferences", "expiresAt"],
    "request",
    true,
  );
  const formId = exactString(body.formId, "formId");
  const formVersion = exactString(body.formVersion, "formVersion");
  if (formId !== formAsset.formId || formVersion !== formAsset.formVersion) {
    throw validation("Saved profile form ID or version does not match the deployed form.");
  }
  const scoringVersion = exactString(body.scoringVersion, "scoringVersion");
  const matchingVersion = exactString(body.matchingVersion, "matchingVersion");
  if (scoringVersion !== SCORING_VERSION || matchingVersion !== MATCHING_VERSION) {
    throw validation("Saved profile algorithm versions do not match this service.");
  }
  const matchedDatasetVersion = exactString(body.matchedDatasetVersion, "matchedDatasetVersion");
  const scoresObject = strictObject(body.scores, "scores");
  assertKeys(scoresObject, ["raw", "normalized", "highPointOrder", "validForMatching"], "scores");
  const raw = validateScoreMap(scoresObject.raw, "scores.raw", 5, 25);
  const normalized = validateScoreMap(scoresObject.normalized, "scores.normalized", 0, 100);
  for (const area of RIASEC_AREAS) {
    const expected = round(((raw[area] - 5) / 20) * 100, 2);
    if (Math.abs(normalized[area] - expected) > 0.001) {
      throw validation(`scores.normalized.${area} is inconsistent with the raw score.`);
    }
  }
  if (!Array.isArray(scoresObject.highPointOrder) || scoresObject.highPointOrder.length !== 6) {
    throw validation("scores.highPointOrder must contain all six RIASEC areas.");
  }
  const highPointOrder = scoresObject.highPointOrder.map((value, index) => {
    const area = exactString(value, `scores.highPointOrder[${index}]`) as RiasecArea;
    if (!RIASEC_AREAS.includes(area)) throw validation(`Unknown RIASEC area: ${area}.`);
    return area;
  });
  if (new Set(highPointOrder).size !== 6) throw validation("scores.highPointOrder must be unique.");
  const expectedOrder = [...RIASEC_AREAS].sort(
    (left, right) => raw[right] - raw[left] || RIASEC_AREAS.indexOf(left) - RIASEC_AREAS.indexOf(right),
  );
  if (highPointOrder.some((area, index) => area !== expectedOrder[index])) {
    throw validation("scores.highPointOrder is inconsistent with the raw scores.");
  }
  const validForMatching = exactBoolean(scoresObject.validForMatching, "scores.validForMatching");
  if (validForMatching !== (new Set(Object.values(raw)).size > 1)) {
    throw validation("scores.validForMatching is inconsistent with the raw scores.");
  }
  let expiresAt: string | null = null;
  if (body.expiresAt !== undefined && body.expiresAt !== null) {
    expiresAt = exactString(body.expiresAt, "expiresAt");
    const timestamp = Date.parse(expiresAt);
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
      throw validation("expiresAt must be a valid future date-time.");
    }
    expiresAt = new Date(timestamp).toISOString();
  }
  return {
    formId,
    formVersion,
    scoringVersion,
    matchingVersion,
    matchedDatasetVersion,
    scores: { raw, normalized, highPointOrder, validForMatching },
    preferences: validateFilters(body.preferences),
    expiresAt,
  };
}

export function validateRecoveryRequest(
  input: unknown,
  purpose: "load" | "delete",
): {
  recoveryToken: string;
  matchAgainst: "recorded" | "current";
  filters?: InterestFilters;
  mode?: "delete" | "revoke";
} {
  const body = strictObject(input, "request");
  assertKeys(
    body,
    purpose === "load" ? ["recoveryToken", "matchAgainst", "filters"] : ["recoveryToken", "mode"],
    "request",
    true,
  );
  const recoveryToken = exactString(body.recoveryToken, "recoveryToken");
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(recoveryToken)) throw validation("recoveryToken is invalid.");
  const result: {
    recoveryToken: string;
    matchAgainst: "recorded" | "current";
    filters?: InterestFilters;
    mode?: "delete" | "revoke";
  } = {
    recoveryToken,
    matchAgainst:
      purpose === "load" && body.matchAgainst !== undefined
        ? enumString(body.matchAgainst, "matchAgainst", ["recorded", "current"])
        : "recorded",
  };
  if (purpose === "load" && body.filters !== undefined) result.filters = validateFilters(body.filters);
  if (purpose === "delete" && body.mode !== undefined) {
    result.mode = enumString(body.mode, "mode", ["delete", "revoke"]);
  }
  return result;
}

export function generateRecoveryToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export async function hashRecoveryToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function validateScoreMap(input: unknown, field: string, minimum: number, maximum: number): RiasecScores {
  const object = strictObject(input, field);
  assertKeys(object, [...RIASEC_AREAS], field);
  return Object.fromEntries(
    RIASEC_AREAS.map((area) => [area, exactNumber(object[area], `${field}.${area}`, minimum, maximum)]),
  ) as RiasecScores;
}

function highPointsFromProfile(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as { interestHighPoints?: unknown };
    if (Array.isArray(parsed.interestHighPoints)) {
      return parsed.interestHighPoints
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object") {
            const value = item as Record<string, unknown>;
            return typeof value.area === "string"
              ? value.area
              : typeof value.label === "string"
                ? value.label
                : typeof value.code === "string"
                  ? value.code
                  : "";
          }
          return "";
        })
        .filter(Boolean)
        .slice(0, 3);
    }
  } catch {
    // Import verification is responsible for invalid JSON. A malformed row must not break all results.
  }
  return [];
}

function emptyScores(): RiasecScores {
  return { realistic: 0, investigative: 0, artistic: 0, social: 0, enterprising: 0, conventional: 0 };
}

function emptyNaNScores(): RiasecScores {
  return {
    realistic: Number.NaN,
    investigative: Number.NaN,
    artistic: Number.NaN,
    social: Number.NaN,
    enterprising: Number.NaN,
    conventional: Number.NaN,
  };
}

function strictObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw validation(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
  optional = false,
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) throw validation(`${field} contains unknown field(s): ${unknown.join(", ")}.`);
  if (!optional) {
    const missing = allowed.filter((key) => !(key in value));
    if (missing.length > 0) throw validation(`${field} is missing field(s): ${missing.join(", ")}.`);
  }
}

function exactString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw validation(`${field} must be a non-empty string.`);
  return value.trim();
}

function exactInteger(value: unknown, field: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw validation(`${field} must be an integer from ${minimum} through ${maximum}.`);
  }
  return Number(value);
}

function exactNumber(value: unknown, field: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw validation(`${field} must be a finite number from ${minimum} through ${maximum}.`);
  }
  return value;
}

function exactBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw validation(`${field} must be a boolean.`);
  return value;
}

function optionalExactBoolean(value: unknown, field: string): boolean | undefined {
  return value === undefined ? undefined : exactBoolean(value, field);
}

function enumString<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw validation(`${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

function validation(message: string): BodyError {
  return new BodyError(422, "validation_error", message);
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function notFinite(value: number): boolean {
  return !Number.isFinite(value);
}

function sum(left: number, right: number): number {
  return left + right;
}
