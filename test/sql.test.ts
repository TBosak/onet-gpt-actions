import { describe, expect, it } from "vitest";
import { insertStatement, sqlLiteral, verificationSql } from "../scripts/onet/sql";

describe("bounded SQL generation", () => {
  it("escapes text literals", () => {
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'");
    expect(sqlLiteral(null)).toBe("NULL");
  });

  it("creates one-row insert statements", () => {
    expect(
      insertStatement({
        table: "occupations",
        values: { code: "15-1252.00", title: "Software Developers", job_zone: 4 },
      }),
    ).toBe(
      'INSERT INTO "occupations" ("code", "title", "job_zone") VALUES (\'15-1252.00\', \'Software Developers\', 4);',
    );
  });

  it("includes integrity metrics in one D1-compatible verification query", () => {
    const sql = verificationSql("30.3");
    expect(sql).toContain("invalid_profile_json");
    expect(sql).toContain("orphan_related");
    expect(sql).toContain("occupation_search");
    expect(sql).toContain("oi_complete_occupations");
    expect(sql).toContain("ih_rows_in_oi_scores");
    expect(sql).not.toContain("UNION ALL");
    expect(sql.trimStart().startsWith("SELECT")).toBe(true);
  });
});
