import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SqlRecord, TransformResult } from "./transform";

const TABLE_ORDER = [
  "occupations",
  "occupation_search",
  "elements",
  "occupation_scores",
  "technologies",
  "occupation_technologies",
  "related_occupations",
] as const;

const DELETE_ORDER = [
  "occupation_search",
  "related_occupations",
  "occupation_technologies",
  "technologies",
  "occupation_text_items",
  "occupation_scores",
  "elements",
  "occupation_aliases",
  "occupations",
] as const;

export interface ImportManifest {
  generatedAt: string;
  version: string;
  sourceUrl: string;
  sourceSha256: string;
  occupationCount: number;
  expectedCounts: Record<string, number>;
  predictedRowWrites: number;
  rowWriteBudget: number;
  chunkCount: number;
  chunkFiles: string[];
  warnings: string[];
}

export async function writeImportBundle(
  transformed: TransformResult,
  outputRoot = "dist/onet",
  rowWriteBudget = Number(process.env.ONET_MAX_ROW_WRITES ?? "90000"),
): Promise<{ directory: string; manifest: ImportManifest }> {
  if (!Number.isInteger(rowWriteBudget) || rowWriteBudget < 1) {
    throw new Error("ONET_MAX_ROW_WRITES must be a positive integer.");
  }

  const directory = join(outputRoot, transformed.version);
  const chunkDirectory = join(directory, "chunks");
  await rm(directory, { recursive: true, force: true });
  await mkdir(chunkDirectory, { recursive: true });

  const records = [...transformed.records].sort(
    (left, right) => tableRank(left.table) - tableRank(right.table) || recordKey(left).localeCompare(recordKey(right)),
  );
  const predictedRowWrites = records.length + 5;
  if (predictedRowWrites > rowWriteBudget) {
    throw new Error(
      `Planned ${predictedRowWrites} row writes exceeds the configured budget of ${rowWriteBudget}.`,
    );
  }

  const prelude = [
    "PRAGMA foreign_keys = ON;",
    ...DELETE_ORDER.map(
      (table) => `DELETE FROM ${table} WHERE dataset_version = ${sqlLiteral(transformed.version)};`,
    ),
    `DELETE FROM dataset_versions WHERE version = ${sqlLiteral(transformed.version)};`,
    insertStatement({
      table: "dataset_versions",
      values: {
        version: transformed.version,
        source_url: transformed.sourceUrl,
        source_sha256: transformed.sourceSha256,
        occupation_count: transformed.occupationCount,
        status: "staging",
        notes: JSON.stringify({ warnings: transformed.warnings }),
      },
    }),
  ].join("\n");
  await writeFile(join(directory, "00-prelude.sql"), `${prelude}\n`);

  const chunkFiles: string[] = [];
  let statements: string[] = [];
  let bytes = 0;
  const flush = async () => {
    if (statements.length === 0) return;
    const file = `chunk-${String(chunkFiles.length + 1).padStart(4, "0")}.sql`;
    await writeFile(join(chunkDirectory, file), `PRAGMA foreign_keys = ON;\n${statements.join("\n")}\n`);
    chunkFiles.push(`chunks/${file}`);
    statements = [];
    bytes = 0;
  };

  for (const record of records) {
    const statement = insertStatement(record);
    const size = Buffer.byteLength(statement, "utf8");
    if (statements.length >= 250 || bytes + size > 700_000) await flush();
    statements.push(statement);
    bytes += size;
  }
  await flush();

  const activation = `PRAGMA foreign_keys = ON;
UPDATE dataset_versions
SET status = 'superseded'
WHERE status = 'active' AND version <> ${sqlLiteral(transformed.version)};
UPDATE dataset_versions
SET status = 'active', activated_at = CURRENT_TIMESTAMP
WHERE version = ${sqlLiteral(transformed.version)} AND status = 'staging';
INSERT INTO database_metadata(key, value, updated_at)
VALUES ('active_dataset_version', ${sqlLiteral(transformed.version)}, CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
INSERT INTO database_metadata(key, value, updated_at)
VALUES ('api_status', 'ready', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
`;
  await writeFile(join(directory, "99-activate.sql"), activation);

  const verify = verificationSql(transformed.version);
  await writeFile(join(directory, "98-verify.sql"), `${verify}\n`);

  const manifest: ImportManifest = {
    generatedAt: new Date().toISOString(),
    version: transformed.version,
    sourceUrl: transformed.sourceUrl,
    sourceSha256: transformed.sourceSha256,
    occupationCount: transformed.occupationCount,
    expectedCounts: transformed.expectedCounts,
    predictedRowWrites,
    rowWriteBudget,
    chunkCount: chunkFiles.length,
    chunkFiles,
    warnings: transformed.warnings,
  };
  await writeFile(join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { directory, manifest };
}

export function insertStatement(record: SqlRecord): string {
  const entries = Object.entries(record.values);
  if (entries.length === 0) throw new Error(`Cannot insert an empty ${record.table} record.`);
  const columns = entries.map(([column]) => quoteIdentifier(column)).join(", ");
  const values = entries.map(([, value]) => sqlLiteral(value)).join(", ");
  return `INSERT INTO ${quoteIdentifier(record.table)} (${columns}) VALUES (${values});`;
}

export function sqlLiteral(value: string | number | null): string {
  if (value === null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("SQL numeric values must be finite.");
    return String(value);
  }
  return `'${value.replaceAll("'", "''")}'`;
}

export function verificationSql(version: string): string {
  const quoted = sqlLiteral(version);
  return `SELECT
  (SELECT COUNT(*) FROM occupations WHERE dataset_version = ${quoted}) AS occupations,
  (SELECT COUNT(*) FROM occupation_search WHERE dataset_version = ${quoted}) AS occupation_search,
  (SELECT COUNT(*) FROM elements WHERE dataset_version = ${quoted}) AS elements,
  (SELECT COUNT(*) FROM occupation_scores WHERE dataset_version = ${quoted}) AS occupation_scores,
  (SELECT COUNT(*) FROM technologies WHERE dataset_version = ${quoted}) AS technologies,
  (SELECT COUNT(*) FROM occupation_technologies WHERE dataset_version = ${quoted}) AS occupation_technologies,
  (SELECT COUNT(*) FROM related_occupations WHERE dataset_version = ${quoted}) AS related_occupations,
  (
    SELECT COUNT(*)
    FROM occupations
    WHERE dataset_version = ${quoted} AND json_valid(profile_json) = 0
  ) AS invalid_profile_json,
  (
    SELECT COUNT(*)
    FROM occupations
    WHERE dataset_version = ${quoted} AND job_zone IS NOT NULL AND job_zone NOT BETWEEN 1 AND 5
  ) AS invalid_job_zone,
  (
    SELECT COUNT(*)
    FROM occupations
    WHERE dataset_version = ${quoted} AND code IN ('11-1011.00', '15-1252.00', '29-1141.00')
  ) AS known_codes,
  (
    SELECT COUNT(DISTINCT occupation_code)
    FROM occupation_scores
    WHERE dataset_version = ${quoted} AND scale_id = 'OI'
  ) AS oi_matchable_occupations,
  (
    SELECT COUNT(*)
    FROM (
      SELECT occupation_code
      FROM occupation_scores
      WHERE dataset_version = ${quoted} AND scale_id = 'OI'
      GROUP BY occupation_code
      HAVING COUNT(*) = 6
         AND COUNT(DISTINCT element_id) = 6
         AND SUM(CASE WHEN element_id IN ('1.B.1.a', '1.B.1.b', '1.B.1.c', '1.B.1.d', '1.B.1.e', '1.B.1.f') THEN 0 ELSE 1 END) = 0
    ) AS complete_oi_profiles
  ) AS oi_complete_occupations,
  (
    SELECT COUNT(*)
    FROM (
      SELECT occupation_code
      FROM occupation_scores
      WHERE dataset_version = ${quoted} AND scale_id = 'OI'
      GROUP BY occupation_code
      HAVING COUNT(*) <> 6
          OR COUNT(DISTINCT element_id) <> 6
          OR SUM(CASE WHEN element_id IN ('1.B.1.a', '1.B.1.b', '1.B.1.c', '1.B.1.d', '1.B.1.e', '1.B.1.f') THEN 0 ELSE 1 END) <> 0
    ) AS invalid_oi_profiles
  ) AS invalid_oi_dimension_count,
  (
    SELECT COUNT(*)
    FROM occupation_scores
    WHERE dataset_version = ${quoted}
      AND scale_id = 'OI'
      AND element_id IN ('1.B.1.g', '1.B.1.h', '1.B.1.i')
  ) AS ih_rows_in_oi_scores,
  (
    SELECT COUNT(*)
    FROM occupation_scores s
    LEFT JOIN occupations o ON o.code = s.occupation_code AND o.dataset_version = s.dataset_version
    LEFT JOIN elements e ON e.id = s.element_id AND e.dataset_version = s.dataset_version
    WHERE s.dataset_version = ${quoted} AND (o.code IS NULL OR e.id IS NULL)
  ) AS orphan_scores,
  (
    SELECT COUNT(*)
    FROM occupation_technologies ot
    LEFT JOIN occupations o ON o.code = ot.occupation_code AND o.dataset_version = ot.dataset_version
    LEFT JOIN technologies t ON t.id = ot.technology_id AND t.dataset_version = ot.dataset_version
    WHERE ot.dataset_version = ${quoted} AND (o.code IS NULL OR t.id IS NULL)
  ) AS orphan_technologies,
  (
    SELECT COUNT(*)
    FROM related_occupations r
    LEFT JOIN occupations o ON o.code = r.occupation_code AND o.dataset_version = r.dataset_version
    LEFT JOIN occupations ro ON ro.code = r.related_code AND ro.dataset_version = r.dataset_version
    WHERE r.dataset_version = ${quoted} AND (o.code IS NULL OR ro.code IS NULL)
  ) AS orphan_related;`;
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
}

function tableRank(table: string): number {
  const index = TABLE_ORDER.indexOf(table as (typeof TABLE_ORDER)[number]);
  if (index < 0) throw new Error(`Unsupported import table: ${table}`);
  return index;
}

function recordKey(record: SqlRecord): string {
  return `${record.table}:${JSON.stringify(record.values)}`;
}
