import { afterEach, describe, expect, it } from "vitest";
import { activeProfile, AUTO_PROFILE, builtinOf, detectProfile, isKnownTag, listProfiles, renderStyle, resolveProfile, setActiveProfile, setPluginProfiles, tagFor, tagRole, validateProfile, type TagProfile } from "./profile";
import { createSpoiler } from "../document/structure";
import { applyFormat } from "../document/formatting";
import { decodeDocument } from "../document/state";
import type { AnalysisSnapshot, Node } from "../analysis/types";

const hideForum: TagProfile = {
  id: "hide-forum", name: "Hide", extends: "4pda", removeTags: ["spoiler", "b"],
  tags: [{ name: "hide", as: "spoiler" }, { name: "strong", as: "b" }, { name: "mod", role: "block", value: "optional", render: { element: "div", caption: "Модератор: {value}", style: { color: "{value}", border: "1px solid red" } } }],
};
afterEach(() => { setPluginProfiles([]); setActiveProfile("4pda"); });

describe("forum profiles", () => {
  it("starts with the built-in 4PDA profile", () => {
    expect(activeProfile().id).toBe("4pda");
    expect(builtinOf("SPOILER")).toBe("spoiler");
    expect(tagRole("*")).toBe("item");
    expect(isKnownTag("mod")).toBe(false);
  });

  it("maps forum tags to built-in behaviours and back", () => {
    setPluginProfiles([{ profile: hideForum, source: "test.plugin" }]);
    setActiveProfile("hide-forum");
    expect(listProfiles().map((item) => item.id)).toEqual(["4pda", "hide-forum"]);
    expect(builtinOf("hide")).toBe("spoiler");
    expect(builtinOf("spoiler")).toBeNull();
    expect(isKnownTag("spoiler")).toBe(false);
    expect(tagFor("spoiler")).toBe("hide");
    expect(tagFor("b")).toBe("strong");
    expect(tagFor("i")).toBe("i");
    expect(tagRole("mod")).toBe("block");
    expect(activeProfile().analyzer.tags.find((tag) => tag.name === "hide")?.as).toBe("spoiler");
    expect(activeProfile().analyzer.tags.find((tag) => tag.name === "code")?.raw).toBe(true);
  });

  it("writes new markup with the active profile's tag names", () => {
    setPluginProfiles([{ profile: hideForum, source: "test.plugin" }]);
    setActiveProfile("hide-forum");
    const document = decodeDocument(new TextEncoder().encode("text"));
    const text: Node = { kind: "text", span: { start: 0, end: 4 }, name: null, parameter: null, children: [], openingSpan: null, contentSpan: { start: 0, end: 4 }, closingSpan: null, wellFormed: true };
    const snapshot: AnalysisSnapshot = { documentId: document.id, revision: document.revision, source: document.text, analysis: { nodes: [text], diagnostics: [], tokens: [] } };
    expect(createSpoiler(document, { from: 0, to: 4 }, "Title", snapshot).changes.map((change) => change.insert)).toEqual(["[hide=Title]", "[/hide]"]);
    expect(applyFormat(document, snapshot, { documentId: document.id, revision: document.revision, from: 0, to: 4 }, "b").changes.map((change) => change.insert)).toEqual(["[strong]", "[/strong]"]);
  });

  it("drops unsafe and malformed parts of plugin profiles", () => {
    const profile = validateProfile({ id: "x", tags: [{ name: "ok", as: "nope", render: { element: "script" } }, { name: "bad name" }, { name: "s2", render: { element: "span", style: { color: "{value}", background: "red", fontFamily: "url(x)" } } }] })!;
    expect(profile.tags.map((tag) => tag.name)).toEqual(["ok", "s2"]);
    expect(profile.tags[0].as).toBeUndefined();
    expect(profile.tags[0].render).toBeUndefined();
    expect(profile.tags[1].render?.style).toEqual({ color: "{value}" });
    expect(validateProfile({ id: "../x", tags: [] })).toBeNull();
  });

  it("fills render styles only with values of the declared format", () => {
    const resolved = resolveProfile({ id: "x", name: "x", tags: [{ name: "c", valueFormat: "color", render: { element: "span", style: { color: "{value}" } } }] }, () => undefined);
    const spec = resolved.tags.get("c")!;
    expect(renderStyle(spec, "red")).toEqual({ color: "red" });
    expect(renderStyle(spec, "red;background:url(x)")).toEqual({});
  });

  it("picks the profile that fits the document", () => {
    const smf: TagProfile = { id: "smf", name: "SMF", tags: [{ name: "b" }, { name: "iurl", as: "url" }, { name: "li", as: "*" }, { name: "list" }], detect: { tags: ["iurl"] } };
    const xen: TagProfile = { id: "xenforo", name: "XenForo", extends: "4pda", tags: [{ name: "ispoiler", role: "inline" }], detect: { hosts: ["xenforo.com"] } };
    setPluginProfiles([{ profile: validateProfile(smf)!, source: "p" }, { profile: validateProfile(xen)!, source: "p" }]);
    expect(detectProfile("", AUTO_PROFILE)).toBe("4pda");
    expect(detectProfile("[b]x[/b] [spoiler=a]b[/spoiler]", "4pda")).toBe("4pda");
    expect(detectProfile("[b]x[/b] [iurl=https://a]b[/iurl] [list][li]a[/list]", "4pda")).toBe("smf");
    expect(detectProfile("[ispoiler]x[/ispoiler] [spoiler]y[/spoiler]", "4pda")).toBe("xenforo");
    expect(detectProfile("see https://xenforo.com/community/ and [b]x[/b]", "4pda")).toBe("xenforo");
    expect(detectProfile("[url=https://4pda.to/forum/]x[/url] [b]y[/b]", "xenforo")).toBe("4pda");
    // A tie keeps the current profile.
    expect(detectProfile("[b]x[/b]", "xenforo")).toBe("xenforo");
  });
});
