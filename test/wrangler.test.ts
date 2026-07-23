import { describe, expect, it } from "vitest";
import { parseD1Rows } from "../scripts/onet/wrangler";

describe("Wrangler D1 output parsing", () => {
  it("parses plain JSON output", () => {
    const rows = parseD1Rows(
      JSON.stringify([
        {
          results: [{ metric: "occupations", value: 1016 }],
          success: true,
        },
      ]),
    );
    expect(rows).toEqual([{ metric: "occupations", value: 1016 }]);
  });

  it("skips file-upload progress before the JSON payload", () => {
    const rows = parseD1Rows(`├ Checking if file needs uploading
│
├ 🌀 Uploading complete.
│
[
  {
    "results": [
      {
        "occupations": 1016,
        "orphan_scores": 0
      }
    ],
    "success": true
  }
]
`);
    expect(rows).toEqual([{ occupations: 1016, orphan_scores: 0 }]);
  });
});
