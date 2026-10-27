import { describe, expect, it } from "vitest";
import { satisfies, tooNew } from "./semver";

describe("semver requirements", () => {
  it.each([
    ["1.2.3", "^1.0.0", true], ["2.0.0", "^1.0.0", false], ["0.9.9", "^1.0.0", false],
    ["0.2.5", "^0.2.0", true], ["0.3.0", "^0.2.0", false], ["0.0.4", "^0.0.3", false],
    ["1.2.9", "~1.2.3", true], ["1.3.0", "~1.2.3", false], ["1.9.0", "~1", true],
    ["1.4.0", ">=1.2.0 <2.0.0", true], ["2.0.0", ">=1.2.0 <2.0.0", false], ["2.0.0", ">=1.2.0, <2.0.0", false],
    ["3.1.0", "1.x || >=3", true], ["2.5.0", "1.x || >=3", false], ["9.9.9", "*", true],
    ["1.2.3", "=1.2.3", true], ["1.2.4", "=1.2.3", false], ["1.5.0", "1.2", true], ["1.0.0-beta", "^1.0.0", true],
    ["1.0.0", "nonsense", false], ["1.0.0", ">= 1.0.0", true],
  ])("%s meets %s: %s", (version, requirement, expected) => expect(satisfies(version, requirement)).toBe(expected));
  it("tells too new from too old", () => {
    expect(tooNew("2.0.0", "^1.0.0")).toBe(true);
    expect(tooNew("0.9.0", "^1.0.0")).toBe(false);
    expect(tooNew("1.5.0", "^1.0.0")).toBe(false);
  });
});
