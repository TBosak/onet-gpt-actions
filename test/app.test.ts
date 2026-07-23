import { describe, expect, it } from "vitest";
import { app } from "../src/app";

const env = {
  GPT_API_KEY: "test-secret",
  CAREERONESTOP_USER_ID: "",
  CAREERONESTOP_API_TOKEN: "",
  DB: {} as D1Database,
};

describe("public and authentication behavior", () => {
  it("serves the OpenAPI document publicly", async () => {
    const response = await app.request("/openapi.json", {}, env);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { openapi: string };
    expect(body.openapi).toBe("3.1.0");
  });

  it("serves the privacy policy publicly", async () => {
    const response = await app.request("/privacy", {}, env);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("raw answers");
  });

  it("rejects protected routes without the API key before touching D1", async () => {
    const response = await app.request("/v1/meta/version", {}, env);
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("serves the static Interest Profiler form without touching D1", async () => {
    const response = await app.request(
      "/v1/interest-profiler/form",
      { headers: { "x-api-key": "test-secret" } },
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { formId: string; questions: unknown[] };
    expect(body.formId).toBe("mini-ip-30");
    expect(body.questions).toHaveLength(30);
  });

  it("fails clearly when CareerOneStop Worker secrets are missing", async () => {
    const response = await app.request(
      "/v1/edge/jobs/details",
      {
        method: "POST",
        headers: { "x-api-key": "test-secret", "content-type": "application/json" },
        body: JSON.stringify({
          jobId: "job-1",
          resumeProfile: {
            skills: [],
            experienceYears: 0,
            education: "high school diploma",
            targetOccupations: [],
          },
        }),
      },
      env,
    );
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("provider_not_configured");
  });
});
