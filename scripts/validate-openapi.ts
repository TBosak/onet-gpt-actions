import { openapi, operationIds } from "../src/openapi";

const expected = [
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

const actual = operationIds();
const unique = new Set(actual);
if (openapi.openapi !== "3.1.0") throw new Error("OpenAPI version must be 3.1.0.");
if (actual.length !== unique.size) throw new Error("OpenAPI operationId values must be unique.");
if (actual.length !== expected.length || expected.some((id, index) => actual[index] !== id)) {
  throw new Error(`Expected exactly the 20 approved operation IDs in order; found: ${actual.join(", ")}`);
}
console.log(`OpenAPI validated with ${actual.length} unique GPT-facing operations.`);
