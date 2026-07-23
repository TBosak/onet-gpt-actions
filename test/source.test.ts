import { describe, expect, it } from "vitest";
import { detectLatestRelease } from "../scripts/onet/source";

describe("O*NET release detection", () => {
  it("selects the newest release advertised by the official page", async () => {
    const fakeFetch = async () =>
      new Response(`
        <h1>O*NET® 30.2 Database</h1>
        <a href="/dl_files/database/db_30_3_json/occupation_data.json">JSON</a>
      `);
    await expect(detectLatestRelease(fakeFetch as typeof fetch)).resolves.toBe("30.3");
  });

  it("fails closed when no release is discoverable", async () => {
    const fakeFetch = async () => new Response("<html>No database here</html>");
    await expect(detectLatestRelease(fakeFetch as typeof fetch)).rejects.toThrow(
      "Could not detect an O*NET release",
    );
  });
});
