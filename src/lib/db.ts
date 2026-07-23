import type { MetadataMap, OccupationRow } from "../types";

export async function getMetadata(db: D1Database): Promise<MetadataMap> {
  const result = await db
    .prepare("SELECT key, value, updated_at FROM database_metadata ORDER BY key")
    .all<{ key: string; value: string; updated_at: string }>();
  return Object.fromEntries(
    result.results.map((row) => [row.key, { value: row.value, updated_at: row.updated_at }]),
  );
}

export async function getActiveVersion(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM database_metadata WHERE key = 'active_dataset_version'")
    .first<{ value: string }>();
  return row?.value?.trim() || null;
}

export function parseProfile(row: OccupationRow): Omit<OccupationRow, "profile_json"> & {
  profile: Record<string, unknown>;
} {
  let profile: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.profile_json) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      profile = parsed as Record<string, unknown>;
    }
  } catch {
    profile = {};
  }
  const { profile_json: _profileJson, ...rest } = row;
  return { ...rest, profile };
}
