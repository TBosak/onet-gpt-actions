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
];

const actual = operationIds();
const unique = new Set(actual);
if (openapi.openapi !== "3.1.0") throw new Error("OpenAPI version must be 3.1.0.");
if (openapi.info.version !== "4.0.0") throw new Error("OpenAPI contract version must be 4.0.0.");
if (actual.length !== unique.size) throw new Error("OpenAPI operationId values must be unique.");
if (actual.length !== expected.length || expected.some((id, index) => actual[index] !== id)) {
  throw new Error(`Expected exactly the 14 approved local operation IDs in order; found: ${actual.join(", ")}`);
}
if (Object.keys(openapi.paths).some((path) => path.startsWith("/v1/edge/"))) {
  throw new Error("CareerOneStop-backed /v1/edge routes must not appear in the GPT-facing OpenAPI contract.");
}
console.log(`OpenAPI validated with ${actual.length} unique local GPT-facing operations.`);
