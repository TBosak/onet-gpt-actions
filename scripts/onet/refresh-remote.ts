import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { detectLatestRelease, downloadRelease } from "./source";
import { writeImportBundle, sqlLiteral } from "./sql";
import { transformRelease } from "./transform";
import { parseD1Rows, runWrangler } from "./wrangler";

const DATABASE = "onet-gpt-data";
const outputRoot = "dist/onet";
const logPath = join(outputRoot, "refresh.log");
await mkdir(outputRoot, { recursive: true });
await writeFile(logPath, "");

requireEnvironment("CLOUDFLARE_ACCOUNT_ID");
requireEnvironment("CLOUDFLARE_API_TOKEN");

const force = ["1", "true", "yes"].includes(String(process.env.ONET_FORCE ?? "").toLowerCase());
const version = await detectLatestRelease();
const activeVersion = await queryScalar(
  "SELECT value FROM database_metadata WHERE key = 'active_dataset_version'",
  "value",
);

if (activeVersion === version && !force) {
  await writeSummary({
    status: "unchanged",
    detectedVersion: version,
    activeVersion,
    message: "The active O*NET release already matches the official release page.",
  });
  console.log(`O*NET ${version} is already active; no remote writes were performed.`);
  process.exit(0);
}

const release = await downloadRelease(version);
const transformed = transformRelease(release);
const { directory, manifest } = await writeImportBundle(transformed, outputRoot);

const existing = await remoteQuery(
  `SELECT version, source_sha256, status FROM dataset_versions WHERE version = ${sqlLiteral(version)}`,
);
const cleanupRows = await countExistingVersionRows(version);
const plannedRemoteWrites = manifest.predictedRowWrites + cleanupRows;
if (plannedRemoteWrites > manifest.rowWriteBudget) {
  throw new Error(
    `Planned ${plannedRemoteWrites} remote row writes (${manifest.predictedRowWrites} inserts/activation plus ${cleanupRows} cleanup deletes) exceeds the configured budget of ${manifest.rowWriteBudget}.`,
  );
}
if (
  existing[0]?.source_sha256 === release.sourceSha256 &&
  existing[0]?.status === "active" &&
  !force
) {
  await writeSummary({
    status: "unchanged",
    detectedVersion: version,
    activeVersion: version,
    sourceSha256: release.sourceSha256,
    message: "The exact release checksum is already active.",
  });
  console.log(`O*NET ${version} with checksum ${release.sourceSha256} is already active.`);
  process.exit(0);
}

await executeFile(join(directory, "00-prelude.sql"));
for (const relative of manifest.chunkFiles) await executeFile(join(directory, relative));

const verificationRows = await executeFile(join(directory, "98-verify.sql"), true);
const verification = Object.fromEntries(
  verificationRows.map((row) => [String(row.metric), Number(row.value)]),
);
validateVerification(manifest.expectedCounts, verification, manifest.occupationCount);
await executeFile(join(directory, "99-activate.sql"));

const finalVersion = await queryScalar(
  "SELECT value FROM database_metadata WHERE key = 'active_dataset_version'",
  "value",
);
if (finalVersion !== version) throw new Error(`Activation failed: expected ${version}, found ${finalVersion}.`);

await writeSummary({
  status: "activated",
  detectedVersion: version,
  previousActiveVersion: activeVersion || null,
  activeVersion: finalVersion,
  sourceSha256: release.sourceSha256,
  predictedRowWrites: manifest.predictedRowWrites,
  cleanupRowWrites: cleanupRows,
  plannedRemoteWrites,
  expectedCounts: manifest.expectedCounts,
  verification,
  warnings: manifest.warnings,
});
console.log(`Activated O*NET ${version} after successful bounded import and verification.`);

async function countExistingVersionRows(version: string): Promise<number> {
  const quoted = sqlLiteral(version);
  const tables = [
    "occupation_search",
    "related_occupations",
    "occupation_technologies",
    "technologies",
    "occupation_text_items",
    "occupation_scores",
    "elements",
    "occupation_aliases",
    "occupations",
  ];
  const terms = [
    ...tables.map(
      (table) => `(SELECT COUNT(*) FROM ${table} WHERE dataset_version = ${quoted})`,
    ),
    `(SELECT COUNT(*) FROM dataset_versions WHERE version = ${quoted})`,
  ];
  const rows = await remoteQuery(`SELECT ${terms.join(" + ")} AS row_count`);
  return Number(rows[0]?.row_count ?? 0);
}

async function remoteQuery(sql: string): Promise<Record<string, unknown>[]> {
  const result = await runWrangler(
    ["d1", "execute", DATABASE, "--remote", "--json", "--command", sql],
    logPath,
  );
  return parseD1Rows(result.stdout);
}

async function queryScalar(sql: string, key: string): Promise<string> {
  const rows = await remoteQuery(sql);
  return String(rows[0]?.[key] ?? "");
}

async function executeFile(path: string, returnRows = false): Promise<Record<string, unknown>[]> {
  const result = await runWrangler(
    ["d1", "execute", DATABASE, "--remote", "--json", "--file", path],
    logPath,
  );
  return returnRows ? parseD1Rows(result.stdout) : [];
}

function validateVerification(
  expectedCounts: Record<string, number>,
  actual: Record<string, number>,
  occupationCount: number,
): void {
  for (const [table, expected] of Object.entries(expectedCounts)) {
    if (actual[table] !== expected) {
      throw new Error(`Verification failed for ${table}: expected ${expected}, found ${actual[table]}.`);
    }
  }
  if (actual.occupations !== occupationCount) throw new Error("Occupation count verification failed.");
  if (actual.occupation_search !== actual.occupations) throw new Error("FTS count does not match occupations.");
  if (actual.invalid_profile_json !== 0) throw new Error("Invalid profile JSON found.");
  if (actual.invalid_job_zone !== 0) throw new Error("Invalid job zones found.");
  if (actual.known_codes !== 3) throw new Error("Representative occupation validation failed.");
  if (!actual.oi_matchable_occupations || actual.oi_matchable_occupations < 1) {
    throw new Error("No matchable OI occupation profiles were imported.");
  }
  if (actual.oi_complete_occupations !== actual.oi_matchable_occupations) {
    throw new Error("One or more matchable occupations do not have all six OI dimensions.");
  }
  if (actual.invalid_oi_dimension_count !== 0) throw new Error("Invalid OI dimensions were imported.");
  if (actual.ih_rows_in_oi_scores !== 0) throw new Error("IH high-point rows were imported as OI dimensions.");
  for (const metric of ["orphan_scores", "orphan_technologies", "orphan_related"]) {
    if (actual[metric] !== 0) throw new Error(`${metric} verification failed.`);
  }
}

async function writeSummary(value: Record<string, unknown>): Promise<void> {
  await writeFile(
    join(outputRoot, "refresh-summary.json"),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), ...value }, null, 2)}\n`,
  );
}

function requireEnvironment(name: string): void {
  if (!process.env[name]) throw new Error(`${name} is required for remote refresh.`);
}
