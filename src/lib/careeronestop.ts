const API_ORIGIN = "https://api.careeronestop.org";
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_TEXT_LENGTH = 20_000;

export type ProviderFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface CareerOneStopCredentials {
  userId: string;
  apiToken: string;
}

export interface CareerOneStopClientOptions {
  fetcher?: ProviderFetcher;
  timeoutMs?: number;
  retries?: number;
}

export class ProviderError extends Error {
  constructor(
    readonly status: 502 | 503 | 504,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface JobListRequest {
  keyword: string;
  location: string;
  radiusMiles: number;
  postedWithinDays: number;
  startRecord?: number;
  pageSize?: number;
}

export interface TrainingListRequest {
  keyword: string;
  location: string;
  radiusMiles: number;
  programLength?: string;
  programFormat?: string;
  startRecord?: number;
  limitRecord?: number;
}

export interface SupportListRequest {
  location: string;
  radiusMiles: number;
  startRecord?: number;
  limitRecord?: number;
}

export class CareerOneStopClient {
  private readonly fetcher: ProviderFetcher;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(
    private readonly credentials: CareerOneStopCredentials,
    options: CareerOneStopClientOptions = {},
  ) {
    if (!credentials.userId.trim() || !credentials.apiToken.trim()) {
      throw new ProviderError(
        503,
        "provider_not_configured",
        "CareerOneStop runtime credentials are not configured on the Worker.",
      );
    }
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = options.retries ?? 1;
  }

  validateLocation(location: string): Promise<Record<string, unknown>> {
    return this.get(`/v1/location/${segment(this.credentials.userId)}/${segment(location)}`, {
      enableMetaData: "true",
    });
  }

  listJobs(request: JobListRequest): Promise<Record<string, unknown>> {
    const start = request.startRecord ?? 0;
    const pageSize = request.pageSize ?? 10;
    return this.get(
      `/v2/jobsearch/${segment(this.credentials.userId)}/${segment(request.keyword)}/${segment(request.location)}/${request.radiusMiles}/0/0/${start}/${pageSize}/${request.postedWithinDays}`,
      {
        showFilters: "false",
        enableJobDescriptionSnippet: "true",
        enableMetaData: "true",
      },
    );
  }

  getJobDetails(jobId: string): Promise<Record<string, unknown>> {
    return this.get(`/v2/jobsearch/${segment(this.credentials.userId)}/${segment(jobId)}`, {
      isHtml: "false",
      enableMetaData: "true",
    });
  }

  getLmi(onetCode: string, location: string): Promise<Record<string, unknown>> {
    return this.get(
      `/v1/lmi/${segment(this.credentials.userId)}/${segment(onetCode)}/${segment(location)}`,
      { enableMetaData: "true" },
    );
  }

  getSalary(onetCode: string, location: string): Promise<Record<string, unknown>> {
    return this.get(`/v1/comparesalaries/${segment(this.credentials.userId)}/wage`, {
      keyword: onetCode,
      location,
      enableMetaData: "true",
    });
  }

  listTrainingPrograms(request: TrainingListRequest): Promise<Record<string, unknown>> {
    const start = request.startRecord ?? 0;
    const limit = request.limitRecord ?? 10;
    return this.get(
      `/v2/training/programs/${segment(this.credentials.userId)}/${segment(request.keyword)}/${segment(request.location)}/${request.radiusMiles}/${segment(request.programLength ?? "0")}/0/0/${segment(request.programFormat ?? "0")}/0/0/0/0/0/${start}/${limit}`,
      { enableMetaData: "true" },
    );
  }

  getTrainingProgram(programId: string): Promise<Record<string, unknown>> {
    return this.get(`/v2/training/program/${segment(this.credentials.userId)}/${segment(programId)}`, {
      enableMetaData: "true",
    });
  }

  listLicenses(onetCode: string, state: string, limit = 10): Promise<Record<string, unknown>> {
    return this.get(
      `/v1/license/${segment(this.credentials.userId)}/${segment(onetCode)}/${segment(state)}/0/0/0/${limit}`,
      { enableMetaData: "true" },
    );
  }

  listCertifications(onetCode: string, limit = 10): Promise<Record<string, unknown>> {
    return this.get(
      `/v1/certificationfinder/${segment(this.credentials.userId)}/${segment(onetCode)}/0/0/0/0/0/0/0/0/0/${limit}`,
      { enableMetaData: "true" },
    );
  }

  listAmericanJobCenters(request: SupportListRequest): Promise<Record<string, unknown>> {
    const start = request.startRecord ?? 0;
    const limit = request.limitRecord ?? 10;
    return this.get(
      `/v1/ajcfinder/${segment(this.credentials.userId)}/${segment(request.location)}/${request.radiusMiles}/0/0/0/0/0/0/${start}/${limit}`,
      { enableMetaData: "true" },
    );
  }

  listReentryPrograms(request: SupportListRequest): Promise<Record<string, unknown>> {
    const start = request.startRecord ?? 0;
    const limit = request.limitRecord ?? 10;
    return this.get(
      `/v1/reentryprogramfinder/${segment(this.credentials.userId)}/${segment(request.location)}/${request.radiusMiles}/0/0/${start}/${limit}`,
      { enableMetaData: "true" },
    );
  }

  listStateResources(state: string, audience: string, limit = 10): Promise<Record<string, unknown>> {
    return this.get(
      `/v1/stateresources/${segment(this.credentials.userId)}/${segment(state)}/${segment(audience)}/0/${limit}`,
      { enableMetaData: "true" },
    );
  }

  private async get(path: string, query: Record<string, string>): Promise<Record<string, unknown>> {
    const url = new URL(path, API_ORIGIN);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    let lastFailure: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetcher(url, {
          method: "GET",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${this.credentials.apiToken}`,
          },
          signal: controller.signal,
        });

        if (response.status === 429 || response.status >= 500) {
          if (attempt < this.retries) {
            await backoff(attempt);
            continue;
          }
          throw new ProviderError(
            503,
            "provider_temporarily_unavailable",
            "CareerOneStop is temporarily unavailable.",
            { upstreamStatus: response.status },
          );
        }
        if (!response.ok) {
          throw new ProviderError(
            502,
            "provider_request_rejected",
            "CareerOneStop rejected the normalized request.",
            { upstreamStatus: response.status },
          );
        }

        const declared = Number(response.headers.get("content-length") ?? "0");
        if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
          throw new ProviderError(502, "provider_response_too_large", "CareerOneStop returned an oversized response.");
        }
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > MAX_RESPONSE_BYTES) {
          throw new ProviderError(502, "provider_response_too_large", "CareerOneStop returned an oversized response.");
        }
        const text = new TextDecoder().decode(buffer);
        let parsed: unknown;
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          throw new ProviderError(502, "provider_invalid_response", "CareerOneStop returned invalid JSON.");
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new ProviderError(502, "provider_invalid_response", "CareerOneStop returned an invalid JSON object.");
        }
        return sanitizeValue(parsed) as Record<string, unknown>;
      } catch (error) {
        lastFailure = error;
        if (error instanceof ProviderError) throw error;
        if (error instanceof Error && error.name === "AbortError") {
          if (attempt < this.retries) {
            await backoff(attempt);
            continue;
          }
          throw new ProviderError(504, "provider_timeout", "CareerOneStop did not respond before the timeout.");
        }
        if (attempt < this.retries) {
          await backoff(attempt);
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw new ProviderError(503, "provider_unavailable", "CareerOneStop could not be reached.", {
      failureType: lastFailure instanceof Error ? lastFailure.name : "unknown",
    });
  }
}

export function sanitizeText(value: string, maxLength = MAX_TEXT_LENGTH): string {
  const withoutMarkup = decodeEntities(value).replace(/<[^>]*>/g, " ");
  const withoutControlCharacters = Array.from(withoutMarkup).filter(isAllowedTextCharacter).join("");
  return withoutControlCharacters.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function isAllowedTextCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0);
  return (
    codePoint === undefined ||
    (codePoint > 8 &&
      codePoint !== 11 &&
      codePoint !== 12 &&
      (codePoint < 14 || codePoint > 31) &&
      codePoint !== 127)
  );
}

export function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeText(value);
  if (Array.isArray(value)) return value.slice(0, 500).map(sanitizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 300)
        .map(([key, nested]) => [key, sanitizeValue(nested)]),
    );
  }
  return value;
}

function segment(value: string): string {
  return encodeURIComponent(value.trim());
}

function decodeEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

async function backoff(attempt: number): Promise<void> {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  const jitter = (random[0] ?? 0) % 75;
  await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1) + jitter));
}
