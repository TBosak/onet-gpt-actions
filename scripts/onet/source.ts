import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const ONET_DATABASE_PAGE = "https://www.onetcenter.org/database.html";
export const REQUIRED_FILES = [
  "occupation_data",
  "job_titles",
  "job_zones",
  "task_statements",
  "software_skills",
  "related_occupations",
  "career_interest_types",
  "essential_skills",
] as const;

export type RequiredFile = (typeof REQUIRED_FILES)[number];
export type JsonRow = Record<string, unknown>;

export interface OnetFile {
  name: RequiredFile;
  url: string;
  sha256: string;
  rows: JsonRow[];
}

export interface DownloadedRelease {
  version: string;
  sourceUrl: string;
  sourceSha256: string;
  files: OnetFile[];
}

export async function detectLatestRelease(fetcher: typeof fetch = fetch): Promise<string> {
  const response = await fetcher(ONET_DATABASE_PAGE, {
    headers: { "user-agent": "onet-gpt-api-release-check/1.0" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`O*NET release page returned HTTP ${response.status}.`);
  const html = await response.text();
  const versions = [
    ...html.matchAll(/O\*NET(?:®|&reg;)?\s+(\d{1,2}\.\d{1,2})\s+Database/gi),
    ...html.matchAll(/db_(\d{1,2})_(\d{1,2})_json/gi),
  ].map((match) => (match[2] ? `${match[1]}.${match[2]}` : match[1]!));
  const unique = [...new Set(versions)].sort(compareVersions).reverse();
  if (!unique[0]) throw new Error("Could not detect an O*NET release from the official database page.");
  return unique[0];
}

export async function downloadRelease(
  version: string,
  root = ".data/raw",
  fetcher: typeof fetch = fetch,
): Promise<DownloadedRelease> {
  const versionKey = version.replace(".", "_");
  const directory = join(root, version);
  await mkdir(directory, { recursive: true });
  const files: OnetFile[] = [];

  for (const name of REQUIRED_FILES) {
    const url = `https://www.onetcenter.org/dl_files/database/db_${versionKey}_json/${name}.json`;
    const path = join(directory, `${name}.json`);
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch {
      const response = await fetcher(url, {
        headers: { "user-agent": "onet-gpt-api-data-refresh/1.0" },
        redirect: "follow",
      });
      if (!response.ok) throw new Error(`${name}.json returned HTTP ${response.status}.`);
      text = await response.text();
      await writeFile(path, text);
    }

    const parsed = JSON.parse(text) as { row?: unknown };
    if (!Array.isArray(parsed.row)) throw new Error(`${name}.json does not contain a row array.`);
    const rows = parsed.row.filter(isObject) as JsonRow[];
    if (rows.length !== parsed.row.length) throw new Error(`${name}.json contains non-object rows.`);
    files.push({ name, url, sha256: sha256(text), rows });
  }

  const sourceSha256 = sha256(
    files
      .map((file) => `${file.name}:${file.sha256}`)
      .sort()
      .join("\n"),
  );
  return { version, sourceUrl: ONET_DATABASE_PAGE, sourceSha256, files };
}

export function fileRows(release: DownloadedRelease, name: RequiredFile): JsonRow[] {
  const file = release.files.find((item) => item.name === name);
  if (!file) throw new Error(`Missing required O*NET file: ${name}.`);
  return file.rows;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isObject(value: unknown): value is JsonRow {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compareVersions(left: string, right: string): number {
  const [leftMajor = 0, leftMinor = 0] = left.split(".").map(Number);
  const [rightMajor = 0, rightMinor = 0] = right.split(".").map(Number);
  return leftMajor - rightMajor || leftMinor - rightMinor;
}
