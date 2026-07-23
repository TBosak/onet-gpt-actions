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
];

describe("OpenAPI document", () => {
  it("uses OpenAPI 3.1 and exposes exactly the approved local operations", () => {
    expect(openapi.openapi).toBe("3.1.0");
    expect(openapi.info.version).toBe("4.0.0");
    expect(operationIds()).toEqual(approved);
    expect(new Set(operationIds()).size).toBe(14);
    expect(Object.keys(openapi.paths).some((path) => path.startsWith("/v1/edge/"))).toBe(false);
  });
});
