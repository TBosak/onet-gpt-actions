import { createHash } from "node:crypto";
import type { DownloadedRelease, JsonRow } from "./source";
import { fileRows } from "./source";

export interface SqlRecord {
  table: string;
  values: Record<string, string | number | null>;
}

export interface TransformResult {
  version: string;
  sourceUrl: string;
  sourceSha256: string;
  occupationCount: number;
  expectedCounts: Record<string, number>;
  records: SqlRecord[];
  warnings: string[];
}

interface OccupationBase {
  code: string;
  title: string;
  description: string;
  jobZone: number | null;
  aliases: string[];
  tasks: string[];
  skills: ProfileScore[];
  interests: ProfileScore[];
  interestHighPoints: ProfileInterestHighPoint[];
  technologies: ProfileTechnology[];
  related: ProfileRelated[];
}

interface ProfileScore {
  id: string;
  name: string;
  value: number;
  scale: string;
}

interface ProfileInterestHighPoint {
  rank: number;
  area: string;
  code: number;
}

interface ProfileTechnology {
  name: string;
  category: string;
  hot: boolean;
  inDemand: boolean;
}

interface ProfileRelated {
  code: string;
  tier: string;
  index: number | null;
}

const FAMILY_NAMES: Record<string, string> = {
  "11": "Management",
  "13": "Business and Financial Operations",
  "15": "Computer and Mathematical",
  "17": "Architecture and Engineering",
  "19": "Life, Physical, and Social Science",
  "21": "Community and Social Service",
  "23": "Legal",
  "25": "Educational Instruction and Library",
  "27": "Arts, Design, Entertainment, Sports, and Media",
  "29": "Healthcare Practitioners and Technical",
  "31": "Healthcare Support",
  "33": "Protective Service",
  "35": "Food Preparation and Serving Related",
  "37": "Building and Grounds Cleaning and Maintenance",
  "39": "Personal Care and Service",
  "41": "Sales and Related",
  "43": "Office and Administrative Support",
  "45": "Farming, Fishing, and Forestry",
  "47": "Construction and Extraction",
  "49": "Installation, Maintenance, and Repair",
  "51": "Production",
  "53": "Transportation and Material Moving",
  "55": "Military Specific",
};

const OI_ELEMENTS = new Map([
  ["1.B.1.a", "Realistic"],
  ["1.B.1.b", "Investigative"],
  ["1.B.1.c", "Artistic"],
  ["1.B.1.d", "Social"],
  ["1.B.1.e", "Enterprising"],
  ["1.B.1.f", "Conventional"],
]);

const IH_ELEMENTS = ["1.B.1.g", "1.B.1.h", "1.B.1.i"] as const;
const IH_AREA_BY_CODE: Record<number, string> = {
  1: "Realistic",
  2: "Investigative",
  3: "Artistic",
  4: "Social",
  5: "Enterprising",
  6: "Conventional",
};

export function transformRelease(release: DownloadedRelease): TransformResult {
  const warnings: string[] = [];
  const occupations = new Map<string, OccupationBase>();
  const records: SqlRecord[] = [];

  for (const row of fileRows(release, "occupation_data")) {
    const code = text(row, "onetsoc_code");
    const title = text(row, "title");
    const description = text(row, "description");
    if (!validCode(code) || !title) continue;
    occupations.set(code, {
      code,
      title,
      description,
      jobZone: null,
      aliases: [],
      tasks: [],
      skills: [],
      interests: [],
      interestHighPoints: [],
      technologies: [],
      related: [],
    });
  }

  if (occupations.size < 800 || occupations.size > 1_200) {
    throw new Error(`Occupation count ${occupations.size} is outside the expected 800–1,200 range.`);
  }
  for (const known of ["11-1011.00", "15-1252.00", "29-1141.00"]) {
    if (!occupations.has(known)) throw new Error(`Representative occupation ${known} is missing.`);
  }

  for (const row of fileRows(release, "job_titles")) {
    const occupation = occupations.get(text(row, "onetsoc_code"));
    const title = text(row, "title", "alternate_title", "reported_job_title");
    if (occupation && title && title !== occupation.title && occupation.aliases.length < 50) {
      pushUnique(occupation.aliases, title);
    }
  }

  for (const row of fileRows(release, "job_zones")) {
    const occupation = occupations.get(text(row, "onetsoc_code"));
    const zone = number(row, "job_zone");
    if (occupation && zone !== null && zone >= 1 && zone <= 5) occupation.jobZone = zone;
  }

  for (const row of fileRows(release, "task_statements")) {
    const occupation = occupations.get(text(row, "onetsoc_code"));
    const task = text(row, "task", "task_statement", "description");
    if (occupation && task && occupation.tasks.length < 25) pushUnique(occupation.tasks, task);
  }

  const elementRecords = new Map<string, SqlRecord>();
  const scoreRecords: SqlRecord[] = [];

  for (const row of fileRows(release, "essential_skills")) {
    if (text(row, "scale_id").toUpperCase() !== "IM") continue;
    if (yes(row, "recommend_suppress") || yes(row, "not_relevant")) continue;
    const occupation = occupations.get(text(row, "onetsoc_code"));
    const id = text(row, "element_id");
    const name = text(row, "element_name");
    const value = number(row, "data_value");
    if (!occupation || !id || !name || value === null) continue;
    occupation.skills.push({ id, name, value, scale: "IM" });
    elementRecords.set(`skill:${id}`, elementRecord(id, release.version, "skill", name));
    scoreRecords.push({
      table: "occupation_scores",
      values: {
        occupation_code: occupation.code,
        element_id: id,
        scale_id: "IM",
        value,
        dataset_version: release.version,
        metadata_json: json({ source: "essential_skills" }),
      },
    });
  }

  const oiDimensionsByOccupation = new Map<string, Set<string>>();
  for (const row of fileRows(release, "career_interest_types")) {
    const scale = text(row, "scale_id").toUpperCase();
    const occupation = occupations.get(text(row, "onetsoc_code"));
    const id = text(row, "element_id");
    if (!occupation || !id) continue;

    if (scale === "IH") {
      const rankIndex = IH_ELEMENTS.indexOf(id as (typeof IH_ELEMENTS)[number]);
      if (rankIndex < 0) continue;
      const value = number(row, "data_value");
      if (value === null || !Number.isInteger(value) || value < 0 || value > 6) {
        throw new Error(`Invalid IH high-point value for ${occupation.code} ${id}: ${text(row, "data_value")}.`);
      }
      if (value > 0) {
        const area = IH_AREA_BY_CODE[value];
        if (!area) throw new Error(`Unknown IH high-point code ${value} for ${occupation.code} ${id}.`);
        occupation.interestHighPoints.push({
          rank: rankIndex + 1,
          area,
          code: value,
        });
      }
      continue;
    }

    if (scale !== "OI" || !OI_ELEMENTS.has(id)) continue;
    const value = number(row, "data_value");
    if (value === null || value < 1 || value > 7) {
      throw new Error(`Invalid OI value for ${occupation.code} ${id}: ${text(row, "data_value")}.`);
    }
    const dimensions = oiDimensionsByOccupation.get(occupation.code) ?? new Set<string>();
    if (dimensions.has(id)) throw new Error(`Duplicate OI dimension ${id} for ${occupation.code}.`);
    dimensions.add(id);
    oiDimensionsByOccupation.set(occupation.code, dimensions);
    const canonicalName = OI_ELEMENTS.get(id);
    if (!canonicalName) throw new Error(`Unknown OI dimension ${id} for ${occupation.code}.`);
    occupation.interests.push({ id, name: canonicalName, value, scale: "OI" });
    elementRecords.set(`interest:${id}`, elementRecord(id, release.version, "interest", canonicalName));
    scoreRecords.push({
      table: "occupation_scores",
      values: {
        occupation_code: occupation.code,
        element_id: id,
        scale_id: "OI",
        value,
        dataset_version: release.version,
        metadata_json: json({ source: "career_interest_types", scale: "OI" }),
      },
    });
  }

  for (const [code, dimensions] of oiDimensionsByOccupation) {
    if (dimensions.size !== OI_ELEMENTS.size) {
      throw new Error(`Occupation ${code} has ${dimensions.size} OI dimensions; expected six.`);
    }
    for (const id of OI_ELEMENTS.keys()) {
      if (!dimensions.has(id)) throw new Error(`Occupation ${code} is missing OI dimension ${id}.`);
    }
  }
  if (oiDimensionsByOccupation.size === 0) {
    throw new Error("No complete OI occupation profiles were generated.");
  }

  const technologyRecords = new Map<string, SqlRecord>();
  const occupationTechnologyRecords = new Map<string, SqlRecord>();
  for (const row of fileRows(release, "software_skills")) {
    const occupation = occupations.get(text(row, "onetsoc_code"));
    const name = text(row, "workplace_example", "example");
    const category = text(row, "element_name", "commodity_title");
    const hot = yes(row, "hot_technology");
    const inDemand = yes(row, "in_demand");
    if (!occupation || !name) continue;
    mergeTechnology(occupation.technologies, { name, category, hot, inDemand });
    if (!hot && !inDemand) continue;
    const id = technologyId(name);
    technologyRecords.set(id, {
      table: "technologies",
      values: {
        id,
        dataset_version: release.version,
        name,
        category: category || null,
        metadata_json: json({ source: "software_skills" }),
      },
    });
    const relationshipKey = `${occupation.code}:${id}`;
    const existingRelationship = occupationTechnologyRecords.get(relationshipKey);
    occupationTechnologyRecords.set(relationshipKey, {
      table: "occupation_technologies",
      values: {
        occupation_code: occupation.code,
        technology_id: id,
        hot_technology: Math.max(Number(existingRelationship?.values.hot_technology ?? 0), hot ? 1 : 0),
        in_demand: Math.max(Number(existingRelationship?.values.in_demand ?? 0), inDemand ? 1 : 0),
        dataset_version: release.version,
      },
    });
  }

  const relatedRecords: SqlRecord[] = [];
  for (const row of fileRows(release, "related_occupations")) {
    const code = text(row, "onetsoc_code");
    const relatedCode = text(row, "related_onetsoc_code");
    const occupation = occupations.get(code);
    if (!occupation || !occupations.has(relatedCode)) continue;
    const tierRaw = text(row, "relatedness_tier").toLowerCase();
    const relationType = tierRaw.startsWith("primary") ? "primary" : "supplemental";
    const index = number(row, "related_index", "index");
    occupation.related.push({ code: relatedCode, tier: relationType, index });
    relatedRecords.push({
      table: "related_occupations",
      values: {
        occupation_code: code,
        related_code: relatedCode,
        relation_type: relationType,
        score: index === null ? null : Math.max(0, 100 - index),
        dataset_version: release.version,
      },
    });
  }

  for (const occupation of [...occupations.values()].sort((a, b) => a.code.localeCompare(b.code))) {
    occupation.skills.sort(byValueThenName);
    occupation.interests.sort(byValueThenName);
    occupation.interestHighPoints.sort((left, right) => left.rank - right.rank);
    occupation.technologies.sort((a, b) => Number(b.hot || b.inDemand) - Number(a.hot || a.inDemand) || a.name.localeCompare(b.name));
    occupation.related.sort((a, b) => (a.index ?? 999) - (b.index ?? 999));
    const familyCode = occupation.code.slice(0, 2);
    const profile = {
      code: occupation.code,
      title: occupation.title,
      description: occupation.description,
      jobZone: occupation.jobZone,
      jobFamily: { code: familyCode, title: FAMILY_NAMES[familyCode] ?? "Other" },
      alternateTitles: occupation.aliases,
      tasks: occupation.tasks,
      skills: occupation.skills,
      interests: occupation.interests,
      interestHighPoints: occupation.interestHighPoints,
      technologies: occupation.technologies.slice(0, 75),
      relatedOccupations: occupation.related.slice(0, 20),
      source: {
        name: "O*NET Database downloadable data",
        release: release.version,
        url: release.sourceUrl,
        transformed: true,
      },
    };
    records.push({
      table: "occupations",
      values: {
        code: occupation.code,
        dataset_version: release.version,
        title: occupation.title,
        description: occupation.description,
        job_zone: occupation.jobZone,
        job_family_code: familyCode,
        job_family_title: FAMILY_NAMES[familyCode] ?? "Other",
        bright_outlook: 0,
        stem: 0,
        profile_json: json(profile),
      },
    });
    records.push({
      table: "occupation_search",
      values: {
        code: occupation.code,
        dataset_version: release.version,
        title: occupation.title,
        description: occupation.description,
        alternate_titles: occupation.aliases.join(" | "),
        tasks: occupation.tasks.join(" | "),
        skills: occupation.skills.map((item) => item.name).join(" | "),
        technologies: occupation.technologies.map((item) => item.name).join(" | "),
      },
    });
  }

  records.push(...elementRecords.values());
  records.push(...scoreRecords);
  records.push(...technologyRecords.values());
  records.push(...occupationTechnologyRecords.values());
  records.push(...dedupeRecords(relatedRecords));

  const expectedCounts = countByTable(records);
  if ((expectedCounts.occupation_search ?? 0) !== occupations.size) {
    throw new Error("FTS row count does not equal occupation count.");
  }
  if (scoreRecords.length === 0) warnings.push("No normalized skill or interest scores were generated.");
  warnings.push(`${oiDimensionsByOccupation.size} occupations have complete six-dimensional OI profiles.`);
  if (occupationTechnologyRecords.size === 0) warnings.push("No hot or in-demand technologies were generated.");
  warnings.push("Bright Outlook and STEM flags remain false until official classification inputs are added.");

  return {
    version: release.version,
    sourceUrl: release.sourceUrl,
    sourceSha256: release.sourceSha256,
    occupationCount: occupations.size,
    expectedCounts,
    records,
    warnings,
  };
}

function elementRecord(id: string, version: string, category: string, name: string): SqlRecord {
  return {
    table: "elements",
    values: {
      id,
      dataset_version: version,
      category,
      name,
      description: "",
      parent_id: null,
      metadata_json: json({ source: category === "skill" ? "essential_skills" : "career_interest_types" }),
    },
  };
}

function text(row: JsonRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null) return String(value).trim();
  }
  return "";
}

function number(row: JsonRow, ...keys: string[]): number | null {
  const value = text(row, ...keys);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function yes(row: JsonRow, key: string): boolean {
  return ["y", "yes", "1", "true"].includes(text(row, key).toLowerCase());
}

function validCode(value: string): boolean {
  return /^\d{2}-\d{4}\.\d{2}$/.test(value);
}

function technologyId(name: string): string {
  return createHash("sha256").update(name.normalize("NFKC").trim().toLowerCase()).digest("hex").slice(0, 32);
}

function mergeTechnology(values: ProfileTechnology[], next: ProfileTechnology): void {
  const existing = values.find((item) => item.name.toLowerCase() === next.name.toLowerCase());
  if (existing) {
    existing.hot ||= next.hot;
    existing.inDemand ||= next.inDemand;
    if (!existing.category && next.category) existing.category = next.category;
    return;
  }
  values.push(next);
}

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function byValueThenName(left: ProfileScore, right: ProfileScore): number {
  return right.value - left.value || left.name.localeCompare(right.name);
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function dedupeRecords(records: SqlRecord[]): SqlRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${record.table}:${JSON.stringify(record.values)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function countByTable(records: SqlRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) counts[record.table] = (counts[record.table] ?? 0) + 1;
  return counts;
}
