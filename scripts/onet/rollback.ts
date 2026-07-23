import { sqlLiteral } from "./sql";
import { parseD1Rows, runWrangler } from "./wrangler";

const DATABASE = "onet-gpt-data";
const index = process.argv.indexOf("--to");
const version = index >= 0 ? process.argv[index + 1] : undefined;
if (!version || !/^\d+\.\d+$/.test(version)) {
  throw new Error("Usage: bun run data:rollback -- --to <release-version>");
}
if (process.env.CONFIRM_ROLLBACK !== version) {
  throw new Error(`Set CONFIRM_ROLLBACK=${version} to confirm the rollback target.`);
}
if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
  throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.");
}

const lookup = await runWrangler([
  "d1",
  "execute",
  DATABASE,
  "--remote",
  "--json",
  "--command",
  `SELECT version, status, occupation_count FROM dataset_versions WHERE version = ${sqlLiteral(version)}`,
]);
const row = parseD1Rows(lookup.stdout)[0];
if (!row || !["active", "superseded"].includes(String(row.status))) {
  throw new Error(`Rollback target ${version} is not an available active or superseded dataset.`);
}

const sql = `UPDATE dataset_versions SET status = 'superseded' WHERE status = 'active' AND version <> ${sqlLiteral(version)};
UPDATE dataset_versions SET status = 'active', activated_at = CURRENT_TIMESTAMP WHERE version = ${sqlLiteral(version)};
INSERT INTO database_metadata(key, value, updated_at)
VALUES ('active_dataset_version', ${sqlLiteral(version)}, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
INSERT INTO database_metadata(key, value, updated_at)
VALUES ('api_status', 'ready', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`;
await runWrangler(["d1", "execute", DATABASE, "--remote", "--json", "--command", sql]);
console.log(`Rolled back the active dataset to O*NET ${version}.`);
