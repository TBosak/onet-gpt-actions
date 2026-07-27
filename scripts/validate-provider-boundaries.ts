import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { operationIds, openapi } from "../src/openapi";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeFiles = await collect(join(root, "src"));
const workflowFiles = await collect(join(root, ".github", "workflows"));
const wranglerConfigPath = join(root, "wrangler.jsonc");
const configFiles = [wranglerConfigPath];
const allFiles = [...runtimeFiles, ...workflowFiles, ...configFiles];
const contents = new Map<string, string>();
for (const path of allFiles) contents.set(path, await readFile(path, "utf8"));

const forbiddenOnetRuntimeHosts = [
  "api-v2.onetcenter.org",
  "services.onetcenter.org/ws/",
  "services.onetcenter.org/ws?",
];
for (const [path, text] of contents) {
  for (const host of forbiddenOnetRuntimeHosts) {
    assert(!text.includes(host), `${relative(root, path)} references prohibited O*NET Web Services host ${host}.`);
  }
}

const adapterPath = join(root, "src", "lib", "careeronestop.ts");
for (const [path, text] of contents) {
  if (text.includes("api.careeronestop.org")) {
    assert(path === adapterPath, `${relative(root, path)} bypasses the single CareerOneStop adapter.`);
  }
  if (/authorization\s*:/i.test(text)) {
    assert(path === adapterPath, `${relative(root, path)} constructs an upstream Authorization header outside the adapter.`);
  }
}

for (const path of workflowFiles) {
  const text = contents.get(path) ?? "";
  assert(!/CAREERONESTOP_(?:USER_ID|API_TOKEN)/.test(text), `${relative(root, path)} must not consume CareerOneStop runtime secrets.`);
  assert(!/GPT_API_KEY/.test(text), `${relative(root, path)} must not consume the persistent Worker API secret.`);
}

const wrangler = stripJsonComments(contents.get(wranglerConfigPath) ?? "");
const parsed = JSON.parse(wrangler) as { secrets?: { required?: string[] } };
const expectedSecrets = ["GPT_API_KEY", "CAREERONESTOP_USER_ID", "CAREERONESTOP_API_TOKEN"];
assert(
  JSON.stringify(parsed.secrets?.required) === JSON.stringify(expectedSecrets),
  `wrangler.jsonc must declare exactly these required Worker secrets in order: ${expectedSecrets.join(", ")}.`,
);

const openapiText = JSON.stringify(openapi);
assert(!openapiText.includes("CAREERONESTOP_USER_ID"), "OpenAPI must not expose the CareerOneStop user-ID binding name.");
assert(!openapiText.includes("CAREERONESTOP_API_TOKEN"), "OpenAPI must not expose the CareerOneStop token binding name.");
assert(!openapiText.includes("Bearer API Token"), "OpenAPI must not expose upstream authorization details.");
assert(
  !Object.keys(openapi.paths).some((path) => path.startsWith("/v1/edge/")),
  "CareerOneStop-backed /v1/edge routes must not appear in the GPT-facing Worker OpenAPI contract.",
);
assert(operationIds().length === 14, "The GPT-facing Worker OpenAPI surface must contain exactly 14 local operations.");

const prohibitedLogPatterns = [
  /console\.(?:log|info|warn|error|debug)\([^\n]*(?:CAREERONESTOP_USER_ID|CAREERONESTOP_API_TOKEN)/,
  /JSON\.stringify\([^\n]*(?:apiToken|userId)/,
];
for (const path of runtimeFiles) {
  const text = contents.get(path) ?? "";
  for (const pattern of prohibitedLogPatterns) {
    assert(!pattern.test(text), `${relative(root, path)} may print a CareerOneStop credential or path user ID.`);
  }
}

console.log(
  "Validated provider boundaries: one CareerOneStop adapter, no O*NET Web Services runtime calls, no provider secrets in workflows/OpenAPI/logging, and 14 local GPT-facing operations with no exposed /v1/edge routes.",
);

async function collect(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(path)));
    else if ([".ts", ".yml", ".yaml", ".json", ".jsonc"].includes(extname(entry.name))) files.push(path);
  }
  return files.sort();
}

function stripJsonComments(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
