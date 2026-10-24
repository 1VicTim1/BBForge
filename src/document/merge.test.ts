import { describe, expect, it } from "vitest";
import { mergeCommands, restrictCommand } from "./merge";
import { decodeDocument } from "./state";
import { identity } from "./commands";

const document = decodeDocument(new TextEncoder().encode("abcdef"));
const edit = (from: number, to: number, insert = "") => ({ ...identity(document), label: "x", changes: [{ from, to, insert }] });

describe("batch merging", () => {
  it("joins disjoint changes and skips overlapping ones", () => {
    const { command, skipped } = mergeCommands(document, [edit(0, 2), edit(1, 3), edit(4, 5, "Z")], "Очистка");
    expect(command?.changes).toEqual([{ from: 0, to: 2, insert: "" }, { from: 4, to: 5, insert: "Z" }]);
    expect(command?.label).toBe("Очистка");
    expect(skipped).toBe(1);
  });
  it("returns nothing when no change survives", () => {
    expect(mergeCommands(document, [], "x").command).toBeNull();
  });
  it("restricts a command to a range", () => {
    const command = { ...identity(document), label: "x", changes: [{ from: 0, to: 1, insert: "" }, { from: 3, to: 4, insert: "" }] };
    expect(restrictCommand(command, { from: 2, to: 6 })?.changes).toEqual([{ from: 3, to: 4, insert: "" }]);
    expect(restrictCommand(command, { from: 5, to: 6 })).toBeNull();
    expect(restrictCommand(command, null)).toBe(command);
  });
});
