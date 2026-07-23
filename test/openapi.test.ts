import { describe, expect, it } from "vitest";
import { openapi, operationIds } from "../src/openapi";

const approved = [
  "searchOccupations",
  "getOccupationProfile",
  "compareOccupations",
  "rankOccupations",
  "findRelatedOccupations",
  "browseOccupations",
  "searchSkills",
  "searchTechnologies",
  "getDataVersion",
  "getInterestProfilerForm",
  "scoreInterestProfile",
  "saveInterestProfile",
  "loadInterestProfile",
  "deleteInterestProfile",
  "findJobsForParticipant",
  "getJobMatchDetails",
  "getLocalCareerOutlook",
  "findTrainingOptions",
  "checkCareerRequirements",
  "findEmploymentSupport",
];

describe("OpenAPI document", () => {
  it("uses OpenAPI 3.1 and exposes exactly the approved operations", () => {
    expect(openapi.openapi).toBe("3.1.0");
    expect(operationIds()).toEqual(approved);
    expect(new Set(operationIds()).size).toBe(20);
  });
});
