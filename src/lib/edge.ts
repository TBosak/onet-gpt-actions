import { getActiveVersion, parseProfile } from "./db";
import { CareerOneStopClient } from "./careeronestop";
import type { OccupationRow } from "../types";

export const JOB_FIT_VERSION = "edge-job-fit-v1";
export const CAREERONESTOP_CONTRACT_VERSION = "careeronestop-2026-07-23-v1";

const PROHIBITED_KEYS = new Set([
  "name",
  "firstname",
  "lastname",
  "fullname",
  "email",
  "phone",
  "phonenumber",
  "street",
  "streetaddress",
  "address",
  "ssn",
  "socialsecuritynumber",
  "dateofbirth",
  "dob",
  "childsupport",
  "casenumber",
  "caseinformation",
  "rawresume",
  "resumetext",
]);

const PROHIBITED_VALUE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "email address", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  {
    label: "phone number",
    pattern: /(?:^|\D)(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}(?:$|\D)/,
  },
  { label: "Social Security number", pattern: /\b\d{3}-?\d{2}-?\d{4}\b/ },
  {
    label: "street address",
    pattern:
      /\b\d{1,6}\s+[A-Z0-9.'-]+(?:\s+[A-Z0-9.'-]+){0,4}\s+(?:STREET|ST|ROAD|RD|AVENUE|AVE|BOULEVARD|BLVD|LANE|LN|DRIVE|DR|COURT|CT|HIGHWAY|HWY)\b/i,
  },
];

export interface ResumeProfile {
  skills: string[];
  experienceYears: number;
  education: string;
  credentials: string[];
  targetOccupations: Array<{ onetCode: string; confidence: number }>;
}

export interface ParticipantLocation {
  postalCode?: string;
  city?: string;
  state?: string;
  radiusMiles: number;
}

export interface JobPreferences {
  postedWithinDays: number;
  minimumHourlyPay?: number;
  employmentTypes: string[];
  shiftPreferences: string[];
  transportationReliable?: boolean;
  keywords?: string;
  limit: number;
}

export interface JobSearchInput {
  resumeProfile: ResumeProfile;
  location: ParticipantLocation;
  preferences: JobPreferences;
}

export interface JobDetailInput {
  jobId: string;
  resumeProfile: ResumeProfile;
  location?: ParticipantLocation;
  preferences?: JobPreferences;
}

interface NormalizedJob {
  id: string;
  title: string;
  company: string;
  description: string;
  distanceMiles: number | null;
  acquisitionDate: string | null;
  url: string | null;
  location: string;
  onetCodes: string[];
  source: "CareerOneStop";
  retrievedAt: string;
}

interface EvidenceItem {
  component: string;
  points: number;
  maximum: number;
  status: "matched" | "partial" | "mismatch" | "unknown";
  explanation: string;
}

export interface JobFitResult {
  score: number;
  algorithmVersion: string;
  evidence: EvidenceItem[];
  missingRequirements: string[];
  unknowns: string[];
}

export async function findJobsForParticipant(
  db: D1Database,
  client: CareerOneStopClient,
  input: JobSearchInput,
): Promise<Record<string, unknown>> {
  assertNoProhibitedParticipantData(input);
  const location = locationString(input.location);
  const validatedLocation = await client.validateLocation(location);
  const targets = dedupeTargets(input.resumeProfile.targetOccupations).slice(0, 5);
  if (targets.length === 0 && !input.preferences.keywords) {
    throw new EdgeValidationError("At least one target occupation or bounded keyword is required.");
  }

  const activeVersion = await getActiveVersion(db);
  const localOccupations = activeVersion
    ? await loadLocalOccupations(db, activeVersion, targets.map((target) => target.onetCode))
    : [];

  const searches = targets.map((target) => target.onetCode);
  if (input.preferences.keywords?.trim()) searches.push(input.preferences.keywords.trim());

  assertValidatedLocation(validatedLocation);
  const listResponses = await mapWithConcurrency(searches.slice(0, 6), 3, (keyword) =>
    client.listJobs({
      keyword,
      location,
      radiusMiles: input.location.radiusMiles,
      postedWithinDays: input.preferences.postedWithinDays,
      pageSize: Math.min(25, Math.max(input.preferences.limit, 10)),
    }),
  );

  const retrievedAt = new Date().toISOString();
  const preliminary = dedupeJobs(
    listResponses.flatMap((response) => normalizeJobList(response, retrievedAt)),
  )
    .map((job) => ({
      job,
      preliminaryScore: preliminaryJobScore(job, input),
    }))
    .sort((left, right) => right.preliminaryScore - left.preliminaryScore || stableJobCompare(left.job, right.job));

  const detailLimit = Math.min(8, input.preferences.limit, preliminary.length);
  const details = await mapWithConcurrency(preliminary.slice(0, detailLimit), 3, async ({ job }) => {
    try {
      const detail = await client.getJobDetails(job.id);
      return mergeJobDetail(job, detail, retrievedAt);
    } catch (error) {
      if (error instanceof Error) {
        return { ...job, detailWarning: "Full listing details were unavailable; scoring uses bounded list evidence." };
      }
      return job;
    }
  });

  const ranked = details
    .map((job) => ({
      ...job,
      fit: scoreJobFit(job, input.resumeProfile, input.location, input.preferences),
    }))
    .sort((left, right) => right.fit.score - left.fit.score || stableJobCompare(left, right))
    .slice(0, input.preferences.limit);

  return {
    provider: "CareerOneStop",
    providerContractVersion: CAREERONESTOP_CONTRACT_VERSION,
    localDatasetVersion: activeVersion,
    validatedLocation,
    localOccupationContext: localOccupations,
    jobs: ranked,
    retrievedAt,
    disclosure:
      "CareerOneStop supplies current listing data. Job-fit scores are calculated locally and are decision support, not automated employment decisions.",
  };
}

export async function getJobMatchDetails(
  client: CareerOneStopClient,
  input: JobDetailInput,
): Promise<Record<string, unknown>> {
  assertNoProhibitedParticipantData(input);
  const retrievedAt = new Date().toISOString();
  const raw = await client.getJobDetails(input.jobId);
  const job = normalizeJobDetail(raw, input.jobId, retrievedAt);
  const fit = scoreJobFit(job, input.resumeProfile, input.location, input.preferences);
  return {
    provider: "CareerOneStop",
    providerContractVersion: CAREERONESTOP_CONTRACT_VERSION,
    job,
    fit,
    safetyWarning:
      job.description.length < 120
        ? "The listing has limited detail. Confirm qualifications, compensation, schedule, and employer legitimacy before applying."
        : null,
    retrievedAt,
  };
}

export async function getLocalCareerOutlook(
  db: D1Database,
  client: CareerOneStopClient,
  input: { onetCode: string; location: ParticipantLocation; includeSalary: boolean },
): Promise<Record<string, unknown>> {
  const location = locationString(input.location);
  const validatedLocation = await client.validateLocation(location);
  assertValidatedLocation(validatedLocation);
  const [lmi, salary, local] = await Promise.all([
    client.getLmi(input.onetCode, location),
    input.includeSalary ? client.getSalary(input.onetCode, location) : Promise.resolve(null),
    loadOneLocalOccupation(db, input.onetCode),
  ]);
  return {
    provider: "CareerOneStop",
    providerContractVersion: CAREERONESTOP_CONTRACT_VERSION,
    occupation: local,
    location,
    validatedLocation,
    laborMarketInformation: lmi,
    salary,
    retrievedAt: new Date().toISOString(),
    caveat: "Availability and geography detail depend on the source data returned for the requested location.",
  };
}

export async function findTrainingOptions(
  client: CareerOneStopClient,
  input: {
    onetCode: string;
    location: ParticipantLocation;
    keyword?: string;
    programLength?: string;
    programFormat?: string;
    limit: number;
  },
): Promise<Record<string, unknown>> {
  const location = locationString(input.location);
  const validatedLocation = await client.validateLocation(location);
  assertValidatedLocation(validatedLocation);
  const request = {
    keyword: input.keyword?.trim() || input.onetCode,
    location,
    radiusMiles: input.location.radiusMiles,
    limitRecord: input.limit,
    ...(input.programLength === undefined ? {} : { programLength: input.programLength }),
    ...(input.programFormat === undefined ? {} : { programFormat: input.programFormat }),
  };
  const list = await client.listTrainingPrograms(request);
  const programs = arrayFrom(list, "SchoolPrograms").slice(0, input.limit);
  const shortlisted = programs.slice(0, Math.min(5, input.limit));
  const details = await mapWithConcurrency(shortlisted, 3, async (program) => {
    const id = stringFrom(program, "DetailId");
    if (!id) return program;
    try {
      return await client.getTrainingProgram(id);
    } catch {
      return {
        ...program,
        DetailWarning: "Full program details were unavailable; list evidence is returned instead.",
      };
    }
  });
  return {
    provider: "CareerOneStop",
    providerContractVersion: CAREERONESTOP_CONTRACT_VERSION,
    occupationCode: input.onetCode,
    location,
    validatedLocation,
    programs,
    shortlistedDetails: details,
    retrievedAt: new Date().toISOString(),
  };
}

export async function checkCareerRequirements(
  client: CareerOneStopClient,
  input: { onetCode: string; state: string; limit: number },
): Promise<Record<string, unknown>> {
  const [licenses, certifications] = await Promise.all([
    client.listLicenses(input.onetCode, input.state, input.limit),
    client.listCertifications(input.onetCode, input.limit),
  ]);
  return {
    provider: "CareerOneStop",
    providerContractVersion: CAREERONESTOP_CONTRACT_VERSION,
    occupationCode: input.onetCode,
    state: input.state,
    licenses,
    certifications,
    criminalHistoryNotice:
      "A criminal-history indicator is source information, not an automatic disqualification. Confirm current rules with the named licensing agency.",
    retrievedAt: new Date().toISOString(),
  };
}

export async function findEmploymentSupport(
  client: CareerOneStopClient,
  input: {
    categories: Array<"american-job-centers" | "reentry-programs" | "justice-impacted-state-resources">;
    location: ParticipantLocation;
    limit: number;
  },
): Promise<Record<string, unknown>> {
  const location = locationString(input.location);
  const validatedLocation = await client.validateLocation(location);
  assertValidatedLocation(validatedLocation);
  const categories = [...new Set(input.categories)];
  const results: Record<string, unknown> = {};
  await Promise.all(
    categories.map(async (category) => {
      if (category === "american-job-centers") {
        results.americanJobCenters = await client.listAmericanJobCenters({
          location,
          radiusMiles: input.location.radiusMiles,
          limitRecord: input.limit,
        });
      } else if (category === "reentry-programs") {
        results.reentryPrograms = await client.listReentryPrograms({
          location,
          radiusMiles: input.location.radiusMiles,
          limitRecord: input.limit,
        });
      } else {
        const state = input.location.state?.trim().toUpperCase();
        if (!state || !/^[A-Z]{2}$/.test(state)) {
          throw new EdgeValidationError(
            "A two-letter state is required for justice-impacted state resources.",
          );
        }
        results.justiceImpactedStateResources = await client.listStateResources(
          state,
          "Justice-Impacted",
          input.limit,
        );
      }
    }),
  );
  return {
    provider: "CareerOneStop",
    providerContractVersion: CAREERONESTOP_CONTRACT_VERSION,
    categories,
    location,
    validatedLocation,
    resources: results,
    retrievedAt: new Date().toISOString(),
  };
}

export function scoreJobFit(
  job: NormalizedJob,
  resume: ResumeProfile,
  location?: ParticipantLocation,
  preferences?: JobPreferences,
): JobFitResult {
  const text = `${job.title} ${job.description}`.toLowerCase();
  const targets = dedupeTargets(resume.targetOccupations);
  const occupationConfidence = Math.max(
    0,
    ...targets
      .filter((target) => job.onetCodes.includes(target.onetCode))
      .map((target) => target.confidence),
  );
  const occupationEvidenceAvailable = job.onetCodes.length > 0 && targets.length > 0;
  const occupationPoints = occupationEvidenceAvailable
    ? Math.round(30 * occupationConfidence * 10) / 10
    : 15;

  const normalizedSkills = resume.skills.map((skill) => skill.trim()).filter(Boolean);
  const matchedSkills = normalizedSkills.filter((skill) => text.includes(skill.toLowerCase()));
  const skillRatio = normalizedSkills.length === 0 ? 0.5 : matchedSkills.length / normalizedSkills.length;
  const skillPoints = Math.round(25 * skillRatio * 10) / 10;

  const experienceRequirement = extractYears(text);
  const experienceStatus = experienceRequirement === null ? "unknown" : resume.experienceYears >= experienceRequirement ? "matched" : "mismatch";
  const experiencePoints = experienceRequirement === null ? 7.5 : experienceStatus === "matched" ? 15 : Math.max(0, 15 * (resume.experienceYears / Math.max(1, experienceRequirement)));

  const educationRequirement = extractEducation(text);
  const educationRank = educationLevel(resume.education);
  const requiredRank = educationRequirement ? educationLevel(educationRequirement) : null;
  const credentialMatches = resume.credentials.filter((credential) => text.includes(credential.toLowerCase()));
  const educationStatus = requiredRank === null ? "unknown" : educationRank >= requiredRank ? "matched" : "mismatch";
  const educationPoints = requiredRank === null ? 5 : educationStatus === "matched" ? 10 : credentialMatches.length > 0 ? 5 : 0;

  const distance = job.distanceMiles;
  const radius = location?.radiusMiles;
  const locationPoints = distance === null || radius === undefined ? 5 : distance <= radius ? 10 : 0;
  const locationStatus = distance === null || radius === undefined ? "unknown" : distance <= radius ? "matched" : "mismatch";

  const ageDays = job.acquisitionDate ? ageInDays(job.acquisitionDate, job.retrievedAt) : null;
  const recencyPoints = ageDays === null ? 2.5 : ageDays <= 7 ? 5 : ageDays <= 30 ? 3.5 : 1;
  const preferencePoints = preferences ? preferenceScore(text, preferences) : 2.5;

  const evidence: EvidenceItem[] = [
    {
      component: "O*NET occupation alignment",
      points: occupationPoints,
      maximum: 30,
      status: !occupationEvidenceAvailable
        ? "unknown"
        : occupationPoints >= 24
          ? "matched"
          : occupationPoints > 0
            ? "partial"
            : "mismatch",
      explanation: !occupationEvidenceAvailable
        ? "The provider did not return enough O*NET-code evidence, so this component receives neutral treatment."
        : occupationPoints > 0
          ? `The listing includes a target O*NET code with confidence ${occupationConfidence.toFixed(2)}.`
          : "The listing O*NET codes do not match a supplied target occupation.",
    },
    {
      component: "Explicit required-skill coverage",
      points: skillPoints,
      maximum: 25,
      status: skillRatio >= 0.75 ? "matched" : skillRatio > 0 ? "partial" : normalizedSkills.length ? "mismatch" : "unknown",
      explanation: normalizedSkills.length
        ? `${matchedSkills.length} of ${normalizedSkills.length} supplied skills appear explicitly in the listing text.`
        : "No structured skills were supplied, so this component remains uncertain.",
    },
    {
      component: "Experience-level fit",
      points: round(experiencePoints),
      maximum: 15,
      status: experienceStatus,
      explanation:
        experienceRequirement === null
          ? "No clear years-of-experience requirement was detected."
          : `The listing appears to request ${experienceRequirement} year(s); the profile reports ${resume.experienceYears}.`,
    },
    {
      component: "Education and credential fit",
      points: round(educationPoints),
      maximum: 10,
      status: educationStatus,
      explanation:
        educationRequirement === null
          ? "No clear education requirement was detected."
          : `Detected requirement: ${educationRequirement}.`,
    },
    {
      component: "Location and work-arrangement fit",
      points: round(locationPoints),
      maximum: 10,
      status: locationStatus,
      explanation:
        distance === null || radius === undefined
          ? "The provider did not supply enough distance evidence."
          : `Provider distance is ${distance} miles against a ${radius}-mile radius.`,
    },
    {
      component: "Recency",
      points: round(recencyPoints),
      maximum: 5,
      status: ageDays === null ? "unknown" : ageDays <= 30 ? "matched" : "partial",
      explanation: ageDays === null ? "Posting age is unavailable." : `The acquisition date is approximately ${ageDays} day(s) old.`,
    },
    {
      component: "Participant preferences",
      points: round(preferencePoints),
      maximum: 5,
      status: preferences ? (preferencePoints >= 4 ? "matched" : preferencePoints > 0 ? "partial" : "mismatch") : "unknown",
      explanation: preferences
        ? "Only preferences with explicit listing evidence affect this component; unknowns receive neutral treatment."
        : "No structured preferences were supplied.",
    },
  ];

  const score = round(evidence.reduce((sum, item) => sum + item.points, 0));
  const missingRequirements = evidence
    .filter((item) => item.status === "mismatch")
    .map((item) => item.component);
  const unknowns = evidence.filter((item) => item.status === "unknown").map((item) => item.component);
  return { score, algorithmVersion: JOB_FIT_VERSION, evidence, missingRequirements, unknowns };
}

export class EdgeValidationError extends Error {}

export function assertNoProhibitedParticipantData(value: unknown): void {
  inspect(value, "request");
}

function inspect(value: unknown, path: string): void {
  if (typeof value === "string") {
    for (const { label, pattern } of PROHIBITED_VALUE_PATTERNS) {
      if (pattern.test(value)) {
        throw new EdgeValidationError(`Sensitive participant value is not allowed at ${path}: ${label}`);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspect(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.replace(/[^a-z]/gi, "").toLowerCase();
    if (PROHIBITED_KEYS.has(normalized)) {
      throw new EdgeValidationError(`Sensitive participant field is not allowed: ${path}.${key}`);
    }
    inspect(nested, `${path}.${key}`);
  }
}

function locationString(location: ParticipantLocation): string {
  if (location.postalCode?.trim()) {
    const postal = location.postalCode.trim();
    if (!/^\d{5}(?:-\d{4})?$/.test(postal)) throw new EdgeValidationError("postalCode must be a US ZIP code.");
    return postal;
  }
  if (location.city?.trim() && location.state?.trim()) {
    const state = location.state.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(state)) throw new EdgeValidationError("state must be a two-letter abbreviation.");
    return `${location.city.trim()}, ${state}`;
  }
  if (location.state?.trim()) {
    const state = location.state.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(state)) throw new EdgeValidationError("state must be a two-letter abbreviation.");
    return state;
  }
  throw new EdgeValidationError("Provide postalCode or city and state.");
}

function dedupeTargets(targets: Array<{ onetCode: string; confidence: number }>) {
  const map = new Map<string, number>();
  for (const target of targets) {
    map.set(target.onetCode, Math.max(map.get(target.onetCode) ?? 0, target.confidence));
  }
  return [...map.entries()]
    .map(([onetCode, confidence]) => ({ onetCode, confidence }))
    .sort((left, right) => right.confidence - left.confidence || left.onetCode.localeCompare(right.onetCode));
}

async function loadLocalOccupations(db: D1Database, version: string, codes: string[]) {
  if (codes.length === 0) return [];
  const placeholders = codes.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT code, dataset_version, title, description, job_zone, job_family_code,
              job_family_title, bright_outlook, stem, profile_json, updated_at
       FROM occupations WHERE dataset_version = ? AND code IN (${placeholders})`,
    )
    .bind(version, ...codes)
    .all<OccupationRow>();
  return result.results.map(parseProfile);
}

async function loadOneLocalOccupation(db: D1Database, onetCode: string) {
  const version = await getActiveVersion(db);
  if (!version) return null;
  const row = await db
    .prepare(
      `SELECT code, dataset_version, title, description, job_zone, job_family_code,
              job_family_title, bright_outlook, stem, profile_json, updated_at
       FROM occupations WHERE dataset_version = ? AND code = ?`,
    )
    .bind(version, onetCode)
    .first<OccupationRow>();
  return row ? parseProfile(row) : null;
}

function normalizeJobList(response: Record<string, unknown>, retrievedAt: string): NormalizedJob[] {
  return arrayFrom(response, "Jobs").map((item) => ({
    id: stringFrom(item, "JvId") ?? "",
    title: stringFrom(item, "JobTitle") ?? "",
    company: stringFrom(item, "Company") ?? "",
    description: stringFrom(item, "DescriptionSnippet") ?? "",
    distanceMiles: numberFrom(item, "Distance"),
    acquisitionDate: stringFrom(item, "AcquisitionDate"),
    url: stringFrom(item, "URL"),
    location: stringFrom(item, "Location") ?? "",
    onetCodes: stringArrayFrom(item, "OnetCodes"),
    source: "CareerOneStop" as const,
    retrievedAt,
  })).filter((job) => job.id && job.title);
}

function normalizeJobDetail(response: Record<string, unknown>, id: string, retrievedAt: string): NormalizedJob {
  return {
    id,
    title: stringFrom(response, "JobTitle") ?? "",
    company: stringFrom(response, "Company") ?? "",
    description: stringFrom(response, "Description") ?? "",
    distanceMiles: null,
    acquisitionDate: stringFrom(response, "AcquisitionDate"),
    url: stringFrom(response, "URL"),
    location: stringFrom(response, "Location") ?? "",
    onetCodes: stringArrayFrom(response, "OnetCodes"),
    source: "CareerOneStop" as const,
    retrievedAt,
  };
}

function mergeJobDetail(job: NormalizedJob, response: Record<string, unknown>, retrievedAt: string): NormalizedJob {
  const detail = normalizeJobDetail(response, job.id, retrievedAt);
  return {
    ...job,
    title: detail.title || job.title,
    company: detail.company || job.company,
    description: detail.description || job.description,
    acquisitionDate: detail.acquisitionDate || job.acquisitionDate,
    url: detail.url || job.url,
    location: detail.location || job.location,
    onetCodes: detail.onetCodes.length ? detail.onetCodes : job.onetCodes,
  };
}

function dedupeJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const ids = new Set<string>();
  const urls = new Set<string>();
  const identities = new Set<string>();
  const descriptions = new Set<string>();
  return jobs.filter((job) => {
    const id = job.id.trim().toLowerCase();
    const url = normalizedUrl(job.url);
    const identity = `${job.company}|${job.title}|${job.location}`.toLowerCase().replace(/\s+/g, " ").trim();
    const description = job.description.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 240);
    if ((id && ids.has(id)) || (url && urls.has(url)) || (identity && identities.has(identity)) ||
        (description.length >= 80 && descriptions.has(description))) {
      return false;
    }
    if (id) ids.add(id);
    if (url) urls.add(url);
    if (identity) identities.add(identity);
    if (description.length >= 80) descriptions.add(description);
    return true;
  });
}

function normalizedUrl(value: string | null): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    const trackingKeys: string[] = [];
    url.searchParams.forEach((_value, key) => {
      if (key.toLowerCase().startsWith("utm_")) trackingKeys.push(key);
    });
    for (const key of trackingKeys) url.searchParams.delete(key);
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

function preliminaryJobScore(job: NormalizedJob, input: JobSearchInput): number {
  const target = input.resumeProfile.targetOccupations.find((item) => job.onetCodes.includes(item.onetCode));
  const occupation = (target?.confidence ?? 0) * 60;
  const distance = job.distanceMiles === null ? 10 : Math.max(0, 20 * (1 - job.distanceMiles / input.location.radiusMiles));
  const age = job.acquisitionDate ? ageInDays(job.acquisitionDate, job.retrievedAt) : null;
  const recency = age === null ? 5 : Math.max(0, 15 * (1 - age / Math.max(1, input.preferences.postedWithinDays)));
  const titleEvidence = input.resumeProfile.skills.some((skill) => job.title.toLowerCase().includes(skill.toLowerCase())) ? 5 : 0;
  return occupation + distance + recency + titleEvidence;
}

function stableJobCompare(left: NormalizedJob, right: NormalizedJob): number {
  return left.title.localeCompare(right.title) || left.company.localeCompare(right.company) || left.id.localeCompare(right.id);
}

function extractYears(text: string): number | null {
  const match = text.match(/(?:at least\s+)?(\d{1,2})\+?\s+years?(?:\s+of)?\s+experience/i);
  return match?.[1] ? Number(match[1]) : null;
}

function extractEducation(text: string): string | null {
  const candidates = ["doctoral degree", "master's degree", "bachelor's degree", "associate degree", "high school diploma", "ged"];
  return candidates.find((candidate) => text.includes(candidate)) ?? null;
}

function educationLevel(value: string): number {
  const normalized = value.toLowerCase();
  if (normalized.includes("doctor")) return 6;
  if (normalized.includes("master")) return 5;
  if (normalized.includes("bachelor")) return 4;
  if (normalized.includes("associate")) return 3;
  if (normalized.includes("some college") || normalized.includes("certificate")) return 2;
  if (normalized.includes("high school") || normalized.includes("ged")) return 1;
  return 0;
}

function preferenceScore(text: string, preferences: JobPreferences): number {
  const terms = [...preferences.employmentTypes, ...preferences.shiftPreferences]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (terms.length === 0) return 2.5;
  const matches = terms.filter((term) => text.includes(term)).length;
  return matches === 0 ? 2.5 : 2.5 + 2.5 * (matches / terms.length);
}

function ageInDays(value: string, asOf: string): number | null {
  const timestamp = Date.parse(value);
  const reference = Date.parse(asOf);
  if (!Number.isFinite(timestamp) || !Number.isFinite(reference)) return null;
  return Math.max(0, Math.floor((reference - timestamp) / 86_400_000));
}

function arrayFrom(value: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const nested = value[key];
  return Array.isArray(nested)
    ? nested.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function stringFrom(value: Record<string, unknown>, key: string): string | null {
  const nested = value[key];
  if (typeof nested === "string") return nested;
  if (typeof nested === "number") return String(nested);
  return null;
}

function numberFrom(value: Record<string, unknown>, key: string): number | null {
  const nested = Number(value[key]);
  return Number.isFinite(nested) ? nested : null;
}

function stringArrayFrom(value: Record<string, unknown>, key: string): string[] {
  const nested = value[key];
  return Array.isArray(nested) ? nested.filter((item): item is string => typeof item === "string") : [];
}

function assertValidatedLocation(value: Record<string, unknown>): void {
  const explicit = [value.IsValidLocation, value.IsValid, value.Valid].find(
    (item) => typeof item === "boolean" || typeof item === "string",
  );
  if (explicit === false || (typeof explicit === "string" && explicit.trim().toLowerCase() === "false")) {
    throw new EdgeValidationError("CareerOneStop could not validate the requested location.");
  }
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
