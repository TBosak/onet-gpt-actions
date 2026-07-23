import { BodyError } from "./http";
import { occupationCode } from "./validation";
import type {
  JobDetailInput,
  JobPreferences,
  JobSearchInput,
  ParticipantLocation,
  ResumeProfile,
} from "./edge";
import { assertNoProhibitedParticipantData } from "./edge";

export function validateJobSearchInput(value: unknown): JobSearchInput {
  const body = object(value, "request", ["resumeProfile", "location", "preferences"]);
  const parsed = {
    resumeProfile: resumeProfile(body.resumeProfile),
    location: location(body.location),
    preferences: preferences(body.preferences),
  };
  assertNoProhibitedParticipantData(parsed);
  return parsed;
}

export function validateJobDetailInput(value: unknown): JobDetailInput {
  const body = object(value, "request", ["jobId", "resumeProfile", "location", "preferences"]);
  const parsed: JobDetailInput = {
    jobId: string(body.jobId, "jobId", 200),
    resumeProfile: resumeProfile(body.resumeProfile),
  };
  if (body.location !== undefined) parsed.location = location(body.location);
  if (body.preferences !== undefined) parsed.preferences = preferences(body.preferences);
  assertNoProhibitedParticipantData(parsed);
  return parsed;
}

export function validateOutlookInput(value: unknown) {
  const body = object(value, "request", ["onetCode", "location", "includeSalary"]);
  return {
    onetCode: occupationCode(body.onetCode),
    location: location(body.location),
    includeSalary: boolean(body.includeSalary, false),
  };
}

export function validateTrainingInput(value: unknown) {
  const body = object(value, "request", [
    "onetCode",
    "location",
    "keyword",
    "programLength",
    "programFormat",
    "limit",
  ]);
  const parsed: {
    onetCode: string;
    location: ParticipantLocation;
    keyword?: string;
    programLength?: string;
    programFormat?: string;
    limit: number;
  } = {
    onetCode: occupationCode(body.onetCode),
    location: location(body.location),
    limit: integer(body.limit, 10, 1, 20, "limit"),
  };
  if (body.keyword !== undefined) parsed.keyword = string(body.keyword, "keyword", 100);
  if (body.programLength !== undefined) parsed.programLength = string(body.programLength, "programLength", 40);
  if (body.programFormat !== undefined) parsed.programFormat = string(body.programFormat, "programFormat", 40);
  return parsed;
}

export function validateRequirementsInput(value: unknown) {
  const body = object(value, "request", ["onetCode", "state", "limit"]);
  const state = string(body.state, "state", 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) fail("state must be a two-letter abbreviation.");
  return {
    onetCode: occupationCode(body.onetCode),
    state,
    limit: integer(body.limit, 10, 1, 20, "limit"),
  };
}

export function validateSupportInput(value: unknown) {
  const body = object(value, "request", ["categories", "location", "limit"]);
  if (!Array.isArray(body.categories) || body.categories.length < 1 || body.categories.length > 3) {
    fail("categories must contain one to three supported resource categories.");
  }
  const supported: ReadonlySet<string> = new Set([
    "american-job-centers",
    "reentry-programs",
    "justice-impacted-state-resources",
  ]);
  const categories = [...new Set(body.categories.map((item) => string(item, "categories[]", 50)))];
  for (const category of categories) {
    if (!supported.has(category)) fail(`Unsupported resource category: ${category}.`);
  }
  return {
    categories: categories as Array<
      "american-job-centers" | "reentry-programs" | "justice-impacted-state-resources"
    >,
    location: location(body.location),
    limit: integer(body.limit, 10, 1, 20, "limit"),
  };
}

function resumeProfile(value: unknown): ResumeProfile {
  const body = object(value, "resumeProfile", [
    "skills",
    "experienceYears",
    "education",
    "credentials",
    "targetOccupations",
  ]);
  const skills = stringArray(body.skills, "resumeProfile.skills", 50, 100);
  const credentials = body.credentials === undefined
    ? []
    : stringArray(body.credentials, "resumeProfile.credentials", 25, 100);
  if (!Array.isArray(body.targetOccupations) || body.targetOccupations.length > 10) {
    fail("resumeProfile.targetOccupations must be an array with at most 10 entries.");
  }
  const targetOccupations = body.targetOccupations.map((item, index) => {
    const target = object(item, `resumeProfile.targetOccupations[${index}]`, ["onetCode", "confidence"]);
    return {
      onetCode: occupationCode(target.onetCode),
      confidence: number(target.confidence, 0, 1, `targetOccupations[${index}].confidence`),
    };
  });
  return {
    skills,
    experienceYears: number(body.experienceYears, 0, 70, "resumeProfile.experienceYears"),
    education: string(body.education, "resumeProfile.education", 100),
    credentials,
    targetOccupations,
  };
}

function location(value: unknown): ParticipantLocation {
  const body = object(value, "location", ["postalCode", "city", "state", "radiusMiles"]);
  const parsed: ParticipantLocation = {
    radiusMiles: integer(body.radiusMiles, 25, 1, 100, "location.radiusMiles"),
  };
  if (body.postalCode !== undefined) parsed.postalCode = string(body.postalCode, "location.postalCode", 10);
  if (body.city !== undefined) parsed.city = string(body.city, "location.city", 100);
  if (body.state !== undefined) parsed.state = string(body.state, "location.state", 2).toUpperCase();
  if (!parsed.postalCode && !(parsed.city && parsed.state) && !parsed.state) {
    fail("location requires postalCode, city and state, or state.");
  }
  return parsed;
}

function preferences(value: unknown): JobPreferences {
  const body = object(value, "preferences", [
    "postedWithinDays",
    "minimumHourlyPay",
    "employmentTypes",
    "shiftPreferences",
    "transportationReliable",
    "keywords",
    "limit",
  ]);
  const parsed: JobPreferences = {
    postedWithinDays: integer(body.postedWithinDays, 30, 0, 90, "preferences.postedWithinDays"),
    employmentTypes: body.employmentTypes === undefined
      ? []
      : stringArray(body.employmentTypes, "preferences.employmentTypes", 8, 40),
    shiftPreferences: body.shiftPreferences === undefined
      ? []
      : stringArray(body.shiftPreferences, "preferences.shiftPreferences", 8, 40),
    limit: integer(body.limit, 15, 1, 20, "preferences.limit"),
  };
  if (body.minimumHourlyPay !== undefined) {
    parsed.minimumHourlyPay = number(body.minimumHourlyPay, 0, 500, "preferences.minimumHourlyPay");
  }
  if (body.transportationReliable !== undefined) {
    parsed.transportationReliable = boolean(body.transportationReliable, false);
  }
  if (body.keywords !== undefined) parsed.keywords = string(body.keywords, "preferences.keywords", 100);
  return parsed;
}

function object(value: unknown, field: string, allowedKeys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${field} must be an object.`);
  const record = value as Record<string, unknown>;
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) fail(`${field}.${key} is not allowed.`);
  }
  return record;
}

function string(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") fail(`${field} must be a string.`);
  const normalized = value.trim();
  if (!normalized) fail(`${field} is required.`);
  if (normalized.length > maxLength) fail(`${field} exceeds ${maxLength} characters.`);
  if (/[\u0000-\u001F\u007F]/.test(normalized)) fail(`${field} contains control characters.`);
  return normalized;
}

function stringArray(value: unknown, field: string, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) fail(`${field} must be an array with at most ${maxItems} entries.`);
  return [...new Set(value.map((item) => string(item, `${field}[]`, maxLength)))];
}

function number(value: unknown, minimum: number, maximum: number, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    fail(`${field} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number, field: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    fail(`${field} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function boolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") fail("Expected a boolean value.");
  return value;
}

function fail(message: string): never {
  throw new BodyError(422, "validation_error", message);
}
