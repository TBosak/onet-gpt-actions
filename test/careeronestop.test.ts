import { describe, expect, it } from "vitest";
import {
  CareerOneStopClient,
  ProviderError,
  sanitizeText,
} from "../src/lib/careeronestop";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function recordingClient(urls: string[]) {
  return new CareerOneStopClient(
    { userId: "edge-user", apiToken: "provider-secret" },
    {
      retries: 0,
      fetcher: async (input) => {
        urls.push(String(input));
        return jsonResponse({ Jobs: [], SchoolPrograms: [] });
      },
    },
  );
}

describe("CareerOneStop adapter", () => {
  it("constructs every launch endpoint inside the single adapter", async () => {
    const urls: string[] = [];
    const client = recordingClient(urls);

    await client.validateLocation("63701");
    await client.listJobs({
      keyword: "53-7065.00",
      location: "63701",
      radiusMiles: 25,
      postedWithinDays: 30,
      pageSize: 15,
    });
    await client.getJobDetails("job-1");
    await client.getLmi("53-7065.00", "63701");
    await client.listTrainingPrograms({
      keyword: "53-7065.00",
      location: "63701",
      radiusMiles: 25,
      limitRecord: 10,
    });
    await client.getTrainingProgram("program-1");

    expect(urls[0]).toContain("/v1/location/edge-user/63701?enableMetaData=true");
    expect(urls[1]).toContain("/v2/jobsearch/edge-user/53-7065.00/63701/25/0/0/0/15/30");
    expect(urls[2]).toContain("/v2/jobsearch/edge-user/job-1?isHtml=false");
    expect(urls[3]).toContain("/v1/lmi/edge-user/53-7065.00/63701?enableMetaData=true");
    expect(urls[4]).toContain(
      "/v2/training/programs/edge-user/53-7065.00/63701/25/0/0/0/0/0/0/0/0/0/0/10",
    );
    expect(urls[5]).toContain("/v2/training/program/edge-user/program-1?enableMetaData=true");
  });

  it("constructs the bounded first-expansion endpoints", async () => {
    const urls: string[] = [];
    const client = recordingClient(urls);

    await client.getSalary("53-7065.00", "63701");
    await client.listLicenses("53-7065.00", "MO", 10);
    await client.listCertifications("53-7065.00", 10);
    await client.listAmericanJobCenters({ location: "63701", radiusMiles: 25, limitRecord: 10 });
    await client.listReentryPrograms({ location: "63701", radiusMiles: 25, limitRecord: 10 });
    await client.listStateResources("MO", "Justice-Impacted", 10);

    expect(urls[0]).toContain("/v1/comparesalaries/edge-user/wage?keyword=53-7065.00");
    expect(urls[1]).toContain("/v1/license/edge-user/53-7065.00/MO/0/0/0/10");
    expect(urls[2]).toContain("/v1/certificationfinder/edge-user/53-7065.00/0/0/0/0/0/0/0/0/0/10");
    expect(urls[3]).toContain("/v1/ajcfinder/edge-user/63701/25/0/0/0/0/0/0/0/10");
    expect(urls[4]).toContain("/v1/reentryprogramfinder/edge-user/63701/25/0/0/0/10");
    expect(urls[5]).toContain("/v1/stateresources/edge-user/MO/Justice-Impacted/0/10");
  });

  it("uses bearer auth, requests non-HTML job details, and redacts credentials from errors", async () => {
    let capturedUrl = "";
    let capturedAuthorization = "";
    const client = new CareerOneStopClient(
      { userId: "private-user-id", apiToken: "private-token" },
      {
        retries: 0,
        fetcher: async (input, init) => {
          capturedUrl = String(input);
          capturedAuthorization = new Headers(init?.headers).get("authorization") ?? "";
          return jsonResponse({ message: "no" }, 401);
        },
      },
    );

    let failure: unknown;
    try {
      await client.getJobDetails("job-1");
    } catch (error) {
      failure = error;
    }

    expect(capturedUrl).toContain("isHtml=false");
    expect(capturedAuthorization).toBe("Bearer private-token");
    expect(failure).toBeInstanceOf(ProviderError);
    expect(JSON.stringify(failure)).not.toContain("private-user-id");
    expect(JSON.stringify(failure)).not.toContain("private-token");
  });

  it("trims whitespace from runtime credentials before constructing requests", async () => {
    let capturedUrl = "";
    let capturedAuthorization = "";
    const client = new CareerOneStopClient(
      { userId: "  edge-user\n", apiToken: "  provider-secret\r\n" },
      {
        retries: 0,
        fetcher: async (input, init) => {
          capturedUrl = String(input);
          capturedAuthorization = new Headers(init?.headers).get("authorization") ?? "";
          return jsonResponse({});
        },
      },
    );

    await client.validateLocation("63701");

    expect(capturedUrl).toContain("/v1/location/edge-user/63701");
    expect(capturedUrl).not.toContain("%0A");
    expect(capturedAuthorization).toBe("Bearer provider-secret");
  });

  it("normalizes malformed and untrusted provider responses", async () => {
    const client = new CareerOneStopClient(
      { userId: "edge-user", apiToken: "provider-secret" },
      {
        retries: 0,
        fetcher: async () => new Response("not-json", { status: 200 }),
      },
    );
    await expect(client.validateLocation("63701")).rejects.toMatchObject({
      code: "provider_invalid_response",
      status: 502,
    });
    expect(sanitizeText("<b>Apply</b> &amp; learn\u0000 now")).toBe("Apply & learn now");
  });
});
