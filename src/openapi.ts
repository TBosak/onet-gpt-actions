const errorResponse = {
  description: "Stable JSON error envelope",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
} as const;

const standardErrors = {
  "400": errorResponse,
  "401": errorResponse,
  "404": errorResponse,
  "409": errorResponse,
  "413": errorResponse,
  "422": errorResponse,
  "500": errorResponse,
  "502": errorResponse,
  "503": errorResponse,
  "504": errorResponse,
} as const;

const jsonBody = (schema: Record<string, unknown>) => ({
  required: true,
  content: { "application/json": { schema } },
});

const occupationSummary = {
  type: "object",
  properties: {
    code: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
    jobZone: { type: ["integer", "null"], minimum: 1, maximum: 5 },
    brightOutlook: { type: "boolean" },
    stem: { type: "boolean" },
  },
} as const;

const filtersSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    jobZones: {
      type: "array",
      maxItems: 5,
      uniqueItems: true,
      items: { type: "integer", minimum: 1, maximum: 5 },
    },
    brightOutlookOnly: { type: "boolean", default: false },
    stemOnly: { type: "boolean", default: false },
    limit: { type: "integer", minimum: 1, maximum: 20, default: 20 },
  },
} as const;

const riasecScores = {
  type: "object",
  additionalProperties: false,
  required: ["realistic", "investigative", "artistic", "social", "enterprising", "conventional"],
  properties: {
    realistic: { type: "number" },
    investigative: { type: "number" },
    artistic: { type: "number" },
    social: { type: "number" },
    enterprising: { type: "number" },
    conventional: { type: "number" },
  },
} as const;

const scoreObject = {
  type: "object",
  additionalProperties: false,
  required: ["raw", "normalized", "highPointOrder", "validForMatching"],
  properties: {
    raw: riasecScores,
    normalized: riasecScores,
    highPointOrder: {
      type: "array",
      minItems: 6,
      maxItems: 6,
      uniqueItems: true,
      items: {
        type: "string",
        enum: ["realistic", "investigative", "artistic", "social", "enterprising", "conventional"],
      },
    },
    validForMatching: { type: "boolean" },
  },
} as const;

const recoveryToken = { type: "string", minLength: 40, maxLength: 100 } as const;

const locationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["radiusMiles"],
  properties: {
    postalCode: { type: "string", pattern: "^\\d{5}(?:-\\d{4})?$" },
    city: { type: "string", maxLength: 100 },
    state: { type: "string", pattern: "^[A-Za-z]{2}$" },
    radiusMiles: { type: "integer", minimum: 1, maximum: 100, default: 25 },
  },
  description: "Use ZIP, city/state, or state only. Never send a street address.",
} as const;

const resumeProfileSchema = {
  type: "object",
  additionalProperties: false,
  required: ["skills", "experienceYears", "education", "targetOccupations"],
  properties: {
    skills: {
      type: "array",
      maxItems: 50,
      uniqueItems: true,
      items: { type: "string", maxLength: 100 },
    },
    experienceYears: { type: "number", minimum: 0, maximum: 70 },
    education: { type: "string", maxLength: 100 },
    credentials: {
      type: "array",
      maxItems: 25,
      uniqueItems: true,
      items: { type: "string", maxLength: 100 },
    },
    targetOccupations: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["onetCode", "confidence"],
        properties: {
          onetCode: { type: "string", pattern: "^\\d{2}-\\d{4}\\.\\d{2}$" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  },
  description:
    "Temporary structured job-relevant profile only. Do not include names, contact data, raw resume text, street addresses, case data, or other identifiers.",
} as const;

const preferencesSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    postedWithinDays: { type: "integer", minimum: 0, maximum: 90, default: 30 },
    minimumHourlyPay: { type: "number", minimum: 0, maximum: 500 },
    employmentTypes: {
      type: "array",
      maxItems: 8,
      items: { type: "string", maxLength: 40 },
    },
    shiftPreferences: {
      type: "array",
      maxItems: 8,
      items: { type: "string", maxLength: 40 },
    },
    transportationReliable: { type: "boolean" },
    keywords: { type: "string", maxLength: 100 },
    limit: { type: "integer", minimum: 1, maximum: 20, default: 15 },
  },
} as const;

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "O*NET GPT Data API",
    version: "3.0.0",
    description:
      "Occupational intelligence and a local conversational Interest Profiler built from downloadable O*NET data, plus privacy-bounded EDGE employment support using CareerOneStop behind the Worker. The Worker never calls O*NET Web Services at runtime. CareerOneStop credentials are Worker secrets and are never exposed through this API.",
  },
  servers: [{ url: "https://onet-gpt-api.timb63701.workers.dev" }],
  security: [{ ApiKeyAuth: [] }],
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message", "requestId"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              requestId: { type: "string" },
              details: {},
            },
          },
        },
      },
      OccupationSummary: occupationSummary,
      InterestFilters: filtersSchema,
      InterestScore: scoreObject,
      ParticipantLocation: locationSchema,
      ResumeProfile: resumeProfileSchema,
      JobPreferences: preferencesSchema,
    },
  },
  paths: {
    "/v1/occupations/search": {
      get: {
        operationId: "searchOccupations",
        summary: "Search occupations by title, description, tasks, skills, and technologies",
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string", maxLength: 200 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 25, default: 10 } },
        ],
        responses: { "200": { description: "Ranked occupation matches" }, ...standardErrors },
      },
    },
    "/v1/occupations/{code}": {
      get: {
        operationId: "getOccupationProfile",
        summary: "Get a complete transformed occupation profile",
        parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Occupation profile" }, ...standardErrors },
      },
    },
    "/v1/occupations/compare": {
      post: {
        operationId: "compareOccupations",
        summary: "Compare two to five occupation profiles",
        requestBody: jsonBody({
          type: "object",
          additionalProperties: false,
          required: ["codes"],
          properties: {
            codes: { type: "array", minItems: 2, maxItems: 5, uniqueItems: true, items: { type: "string" } },
          },
        }),
        responses: { "200": { description: "Comparable occupation profiles" }, ...standardErrors },
      },
    },
    "/v1/occupations/rank": {
      post: {
        operationId: "rankOccupations",
        summary: "Rank occupations by weighted O*NET skill or interest elements",
        requestBody: jsonBody({
          type: "object",
          additionalProperties: false,
          required: ["criteria"],
          properties: {
            criteria: {
              type: "array",
              minItems: 1,
              maxItems: 20,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["elementId", "weight"],
                properties: {
                  elementId: { type: "string" },
                  weight: { type: "number", exclusiveMinimum: 0, maximum: 100 },
                },
              },
            },
            jobZones: { type: "array", maxItems: 5, items: { type: "integer", minimum: 1, maximum: 5 } },
            limit: { type: "integer", minimum: 1, maximum: 25, default: 10 },
          },
        }),
        responses: { "200": { description: "Ranked occupations" }, ...standardErrors },
      },
    },
    "/v1/occupations/{code}/related": {
      get: {
        operationId: "findRelatedOccupations",
        summary: "Find primary and supplemental related occupations",
        parameters: [
          { name: "code", in: "path", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 25, default: 10 } },
        ],
        responses: { "200": { description: "Related occupations" }, ...standardErrors },
      },
    },
    "/v1/occupations": {
      get: {
        operationId: "browseOccupations",
        summary: "Browse occupations with structured filters",
        parameters: [
          { name: "jobZone", in: "query", schema: { type: "integer", minimum: 1, maximum: 5 } },
          { name: "jobFamily", in: "query", schema: { type: "string" } },
          { name: "brightOutlook", in: "query", schema: { type: "boolean" } },
          { name: "stem", in: "query", schema: { type: "boolean" } },
          { name: "after", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
        ],
        responses: { "200": { description: "Occupation page" }, ...standardErrors },
      },
    },
    "/v1/skills/search": {
      get: {
        operationId: "searchSkills",
        summary: "Search normalized O*NET skill elements",
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string", maxLength: 200 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 25, default: 10 } },
        ],
        responses: { "200": { description: "Skill matches" }, ...standardErrors },
      },
    },
    "/v1/technologies/search": {
      get: {
        operationId: "searchTechnologies",
        summary: "Search hot and in-demand technologies",
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string", maxLength: 200 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 25, default: 10 } },
        ],
        responses: { "200": { description: "Technology matches" }, ...standardErrors },
      },
    },
    "/v1/meta/version": {
      get: {
        operationId: "getDataVersion",
        summary: "Get API, schema, and active O*NET dataset status",
        responses: { "200": { description: "Version metadata" }, ...standardErrors },
      },
    },
    "/v1/interest-profiler/form": {
      get: {
        operationId: "getInterestProfilerForm",
        summary: "Get the canonical 30-item English Mini Interest Profiler form",
        responses: { "200": { description: "Versioned form and administration guidance" }, ...standardErrors },
      },
    },
    "/v1/interest-profiler/score": {
      post: {
        operationId: "scoreInterestProfile",
        summary: "Score all 30 answers and locally match occupations",
        requestBody: jsonBody({
          type: "object",
          additionalProperties: false,
          required: ["formId", "formVersion", "answers"],
          properties: {
            formId: { const: "mini-ip-30" },
            formVersion: { type: "string" },
            answers: {
              type: "array",
              minItems: 30,
              maxItems: 30,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["index", "value"],
                properties: {
                  index: { type: "integer", minimum: 1, maximum: 30 },
                  value: { type: "integer", minimum: 1, maximum: 5 },
                },
              },
            },
            filters: filtersSchema,
          },
        }),
        responses: { "200": { description: "Deterministic RIASEC scores and local correlation matches" }, ...standardErrors },
      },
    },
    "/v1/interest-profiler/profiles": {
      post: {
        operationId: "saveInterestProfile",
        summary: "Explicitly opt in to saving a scored profile without raw answers",
        requestBody: jsonBody({
          type: "object",
          additionalProperties: false,
          required: ["formId", "formVersion", "scoringVersion", "matchingVersion", "matchedDatasetVersion", "scores"],
          properties: {
            formId: { const: "mini-ip-30" },
            formVersion: { type: "string" },
            scoringVersion: { const: "onet-mini-ip-local-v1" },
            matchingVersion: { const: "onet-profile-correlation-local-v1" },
            matchedDatasetVersion: { type: "string" },
            scores: scoreObject,
            preferences: filtersSchema,
            expiresAt: { type: ["string", "null"], format: "date-time" },
          },
        }),
        responses: { "201": { description: "Saved profile and one-time recovery token" }, ...standardErrors },
      },
    },
    "/v1/interest-profiler/profiles/load": {
      post: {
        operationId: "loadInterestProfile",
        summary: "Load a saved profile and optionally rematch it",
        requestBody: jsonBody({
          type: "object",
          additionalProperties: false,
          required: ["recoveryToken"],
          properties: {
            recoveryToken,
            matchAgainst: { type: "string", enum: ["recorded", "current"], default: "recorded" },
            filters: filtersSchema,
          },
        }),
        responses: { "200": { description: "Saved profile and recalculated local matches" }, ...standardErrors },
      },
    },
    "/v1/interest-profiler/profiles/delete": {
      post: {
        operationId: "deleteInterestProfile",
        summary: "Revoke or permanently delete a saved profile",
        requestBody: jsonBody({
          type: "object",
          additionalProperties: false,
          required: ["recoveryToken"],
          properties: {
            recoveryToken,
            mode: { type: "string", enum: ["delete", "revoke"], default: "delete" },
          },
        }),
        responses: { "200": { description: "Profile removed or revoked" }, ...standardErrors },
      },
    },
    "/v1/edge/jobs/search": {
      post: {
        operationId: "findJobsForParticipant",
        summary: "Find and transparently rank current local jobs for a structured participant profile",
        description:
          "The Worker sends only bounded O*NET codes or minimal keywords, location, radius, and provider filters to CareerOneStop. Never include direct identifiers, raw resumes, or case data.",
        requestBody: jsonBody({
          type: "object",
          additionalProperties: false,
          required: ["resumeProfile", "location", "preferences"],
          properties: {
            resumeProfile: resumeProfileSchema,
            location: locationSchema,
            preferences: preferencesSchema,
          },
        }),
        responses: { "200": { description: "Current jobs with local, explained fit scores" }, ...standardErrors },
      },
    },
    "/v1/edge/jobs/details": {
      post: {
        operationId: "getJobMatchDetails",
        summary: "Retrieve and analyze one CareerOneStop job listing",
        requestBody: jsonBody({
          type: "object",
          additionalProperties: false,
          required: ["jobId", "resumeProfile"],
          properties: {
            jobId: { type: "string", maxLength: 200 },
            resumeProfile: resumeProfileSchema,
            location: locationSchema,
            preferences: preferencesSchema,
          },
        }),
        responses: { "200": { description: "Normalized job details, evidence, gaps, and apply URL" }, ...standardErrors },
      },
    },
    "/v1/edge/career-outlook": {
      post: {
        operationId: "getLocalCareerOutlook",
        summary: "Combine local occupation context with current CareerOneStop LMI",
        requestBody: jsonBody({
          type: "object",
          additionalProperties: false,
          required: ["onetCode", "location"],
          properties: {
            onetCode: { type: "string", pattern: "^\\d{2}-\\d{4}\\.\\d{2}$" },
            location: locationSchema,
            includeSalary: { type: "boolean", default: false },
          },
        }),
        responses: { "200": { description: "Local/state/national LMI, wages, source vintage, and caveats" }, ...standardErrors },
      },
    },
    "/v1/edge/training": {
      post: {
        operationId: "findTrainingOptions",
        summary: "Find bounded nearby or online training options",
        requestBody: jsonBody({
          type: "object",
          additionalProperties: false,
          required: ["onetCode", "location"],
          properties: {
            onetCode: { type: "string", pattern: "^\\d{2}-\\d{4}\\.\\d{2}$" },
            location: locationSchema,
            keyword: { type: "string", maxLength: 100 },
            programLength: { type: "string", maxLength: 40 },
            programFormat: { type: "string", maxLength: 40 },
            limit: { type: "integer", minimum: 1, maximum: 20, default: 10 },
          },
        }),
        responses: { "200": { description: "Training programs and shortlisted details" }, ...standardErrors },
      },
    },
    "/v1/edge/requirements": {
      post: {
        operationId: "checkCareerRequirements",
        summary: "Find occupational licenses and certifications for a state",
        requestBody: jsonBody({
          type: "object",
          additionalProperties: false,
          required: ["onetCode", "state"],
          properties: {
            onetCode: { type: "string", pattern: "^\\d{2}-\\d{4}\\.\\d{2}$" },
            state: { type: "string", pattern: "^[A-Za-z]{2}$" },
            limit: { type: "integer", minimum: 1, maximum: 20, default: 10 },
          },
        }),
        responses: { "200": { description: "Separate licensing and certification evidence" }, ...standardErrors },
      },
    },
    "/v1/edge/support": {
      post: {
        operationId: "findEmploymentSupport",
        summary: "Find American Job Centers and explicitly requested reentry or justice-impacted resources",
        requestBody: jsonBody({
          type: "object",
          additionalProperties: false,
          required: ["categories", "location"],
          properties: {
            categories: {
              type: "array",
              minItems: 1,
              maxItems: 3,
              uniqueItems: true,
              items: {
                type: "string",
                enum: ["american-job-centers", "reentry-programs", "justice-impacted-state-resources"],
              },
            },
            location: locationSchema,
            limit: { type: "integer", minimum: 1, maximum: 20, default: 10 },
          },
        }),
        responses: { "200": { description: "Requested public employment-support resources" }, ...standardErrors },
      },
    },
  },
} as const;

export function operationIds(): string[] {
  const ids: string[] = [];
  for (const path of Object.values(openapi.paths)) {
    for (const operation of Object.values(path)) {
      if (operation && typeof operation === "object" && "operationId" in operation) {
        ids.push(String(operation.operationId));
      }
    }
  }
  return ids;
}
