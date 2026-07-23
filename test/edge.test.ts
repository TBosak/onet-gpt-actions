import { describe, expect, it } from "vitest";
import {
  EdgeValidationError,
  assertNoProhibitedParticipantData,
  scoreJobFit,
} from "../src/lib/edge";

const resume = {
  skills: ["inventory control", "forklift operation"],
  experienceYears: 4,
  education: "high school diploma",
  credentials: ["forklift certification"],
  targetOccupations: [{ onetCode: "53-7065.00", confidence: 0.9 }],
};

const job = {
  id: "job-1",
  title: "Warehouse Associate",
  company: "Example Employer",
  description:
    "Full-time day shift. Requires 2 years of experience, a high school diploma, inventory control, and forklift operation.",
  distanceMiles: 8,
  acquisitionDate: new Date().toISOString(),
  url: "https://example.test/apply",
  location: "Cape Girardeau, MO",
  onetCodes: ["53-7065.00"],
  source: "CareerOneStop" as const,
  retrievedAt: new Date().toISOString(),
};

describe("EDGE privacy and scoring", () => {
  it("produces deterministic, explained fit scores", () => {
    const first = scoreJobFit(
      job,
      resume,
      { postalCode: "63701", radiusMiles: 25 },
      {
        postedWithinDays: 30,
        employmentTypes: ["full-time"],
        shiftPreferences: ["day"],
        limit: 15,
      },
    );
    const second = scoreJobFit(
      job,
      resume,
      { postalCode: "63701", radiusMiles: 25 },
      {
        postedWithinDays: 30,
        employmentTypes: ["full-time"],
        shiftPreferences: ["day"],
        limit: 15,
      },
    );
    expect(first).toEqual(second);
    expect(first.score).toBeGreaterThan(85);
    expect(first.evidence).toHaveLength(7);
    expect(first.algorithmVersion).toBe("edge-job-fit-v1");
  });

  it("rejects direct identifiers and raw resume fields", () => {
    expect(() => assertNoProhibitedParticipantData({ email: "person@example.com" })).toThrow(
      EdgeValidationError,
    );
    expect(() => assertNoProhibitedParticipantData({ rawResume: "full resume" })).toThrow(
      EdgeValidationError,
    );
    expect(() =>
      assertNoProhibitedParticipantData({ preferences: { keywords: "person@example.com" } }),
    ).toThrow(EdgeValidationError);
    expect(() =>
      assertNoProhibitedParticipantData({ location: { city: "123 Main Street" } }),
    ).toThrow(EdgeValidationError);
  });
});
