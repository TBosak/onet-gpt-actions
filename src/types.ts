export interface Bindings {
  DB: D1Database;
  GPT_API_KEY?: string;
  CAREERONESTOP_USER_ID?: string;
  CAREERONESTOP_API_TOKEN?: string;
}

export interface Variables {
  requestId: string;
}

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};

export interface MetadataValue {
  value: string;
  updated_at: string;
}

export type MetadataMap = Record<string, MetadataValue>;

export interface OccupationRow {
  code: string;
  dataset_version: string;
  title: string;
  description: string;
  job_zone: number | null;
  job_family_code: string | null;
  job_family_title: string | null;
  bright_outlook: number;
  stem: number;
  profile_json: string;
  updated_at: string;
}
