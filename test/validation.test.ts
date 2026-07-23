import { describe, expect, it } from "vitest";
import { boundedInt, occupationCode, optionalBoolean, toFtsQuery } from "../src/lib/validation";

describe("validation helpers", () => {
  it("bounds integer values", () => {
    expect(boundedInt("100", 10, 1, 25)).toBe(25);
    expect(boundedInt("-4", 10, 1, 25)).toBe(1);
    expect(boundedInt("bad", 10, 1, 25)).toBe(10);
  });

  it("validates O*NET-SOC codes", () => {
    expect(occupationCode("15-1252.00")).toBe("15-1252.00");
    expect(() => occupationCode("15-1252")).toThrow();
  });

  it("creates bounded FTS prefix terms without operators", () => {
    expect(toFtsQuery('software OR "security"')).toBe('"software"* AND "OR"* AND "security"*');
  });

  it("parses optional booleans", () => {
    expect(optionalBoolean("true")).toBe(true);
    expect(optionalBoolean("0")).toBe(false);
    expect(optionalBoolean("maybe")).toBeUndefined();
  });
});
