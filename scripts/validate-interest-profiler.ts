import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const assetPath = new URL("../src/data/interest-profiler/mini-ip-30.en.json", import.meta.url);
const schemaPath = new URL("../src/data/interest-profiler/mini-ip-30.schema.json", import.meta.url);
const asset = JSON.parse(await readFile(assetPath, "utf8")) as Record<string, unknown>;
const schema = JSON.parse(await readFile(schemaPath, "utf8")) as JsonSchema;
validateSchema(asset, schema, "$", []);

const areas = ["realistic", "investigative", "artistic", "social", "enterprising", "conventional"];
const expectedOptions = [
  [1, "Strongly Dislike"],
  [2, "Dislike"],
  [3, "Unsure"],
  [4, "Like"],
  [5, "Strongly Like"],
];

assert(asset.formId === "mini-ip-30", "Unexpected formId.");
assert(typeof asset.formVersion === "string" && asset.formVersion.length > 0, "Missing formVersion.");
assert(asset.language === "en", "Only the English form is approved.");
const license = asset.license as Record<string, unknown>;
assert(license.name === "CC BY-ND 4.0", "Unexpected form license.");
assert(license.modified === false, "The vendored form must be marked unmodified.");

for (const [index, expected] of expectedOptions.entries()) {
  const actual = (asset.answerOptions as Array<Record<string, unknown>>)[index];
  assert(actual?.value === expected[0] && actual?.label === expected[1], `Answer option ${index + 1} changed.`);
}
for (const [offset, question] of (asset.questions as Array<Record<string, unknown>>).entries()) {
  assert(question.index === offset + 1, `Question index ${offset + 1} is out of order.`);
  assert(question.area === areas[offset % 6], `Question ${offset + 1} has an unexpected RIASEC mapping.`);
}

const canonical = JSON.stringify({ answerOptions: asset.answerOptions, questions: asset.questions });
const digest = createHash("sha256").update(canonical).digest("hex");
assert(asset.sourceSha256 === digest, `sourceSha256 mismatch: expected ${digest}.`);
console.log(`Validated ${asset.formId} ${asset.formVersion} against JSON Schema: 30 verbatim items, five choices, SHA-256 ${digest}.`);

interface JsonSchema {
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  pattern?: string;
  format?: string;
}

function validateSchema(value: unknown, rule: JsonSchema, path: string, errors: string[]): void {
  const types = rule.type === undefined ? [] : Array.isArray(rule.type) ? rule.type : [rule.type];
  if (types.length > 0 && !types.some((type) => matchesType(value, type))) {
    errors.push(`${path} must be ${types.join(" or ")}.`);
  }
  if ("const" in rule && value !== rule.const) errors.push(`${path} must equal ${JSON.stringify(rule.const)}.`);
  if (rule.enum && !rule.enum.some((item) => item === value)) errors.push(`${path} is outside the approved enum.`);

  if (typeof value === "string") {
    if (rule.minLength !== undefined && value.length < rule.minLength) errors.push(`${path} is too short.`);
    if (rule.pattern && !new RegExp(rule.pattern, "u").test(value)) errors.push(`${path} does not match its pattern.`);
    if (rule.format === "date-time" && !Number.isFinite(Date.parse(value))) errors.push(`${path} is not a date-time.`);
    if (rule.format === "uri") {
      try {
        new URL(value);
      } catch {
        errors.push(`${path} is not a URI.`);
      }
    }
  }
  if (typeof value === "number") {
    if (rule.minimum !== undefined && value < rule.minimum) errors.push(`${path} is below its minimum.`);
    if (rule.maximum !== undefined && value > rule.maximum) errors.push(`${path} is above its maximum.`);
  }
  if (Array.isArray(value)) {
    if (rule.minItems !== undefined && value.length < rule.minItems) errors.push(`${path} has too few items.`);
    if (rule.maxItems !== undefined && value.length > rule.maxItems) errors.push(`${path} has too many items.`);
    if (rule.items) value.forEach((item, index) => validateSchema(item, rule.items!, `${path}[${index}]`, errors));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    for (const required of rule.required ?? []) {
      if (!(required in object)) errors.push(`${path}.${required} is required.`);
    }
    if (rule.additionalProperties === false) {
      const allowed = new Set(Object.keys(rule.properties ?? {}));
      for (const key of Object.keys(object)) if (!allowed.has(key)) errors.push(`${path}.${key} is not allowed.`);
    }
    for (const [key, propertyRule] of Object.entries(rule.properties ?? {})) {
      if (key in object) validateSchema(object[key], propertyRule, `${path}.${key}`, errors);
    }
  }
  if (path === "$" && errors.length > 0) throw new Error(`Interest Profiler schema validation failed:\n- ${errors.join("\n- ")}`);
}

function matchesType(value: unknown, type: string): boolean {
  if (type === "object") return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "null") return value === null;
  return typeof value === type;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
