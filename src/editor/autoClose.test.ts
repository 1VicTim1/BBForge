import { expect, it } from "vitest";
import { closingFor, insideRaw } from "./autoClose";

const at = (text: string) => ({ text: text.replace("|", ""), at: text.indexOf("|") });
const close = (value: string) => { const { text, at: position } = at(value); return closingFor(text, position); };

it("closes an opening tag unless an unmatched closing tag already follows", () => {
  expect(close("[b|")).toBe("[/b]");
  expect(close("[spoiler=Заголовок|")).toBe("[/spoiler]");
  expect(close("[b|текст[/b]")).toBeNull();
  expect(close("[b|[b]x[/b]")).toBe("[/b]");
  expect(close("[b|[b]x[/b] и [/b]")).toBeNull();
  expect(close("[*|")).toBeNull();
  expect(close("[unknown|")).toBeNull();
  expect(close("[code]x [b|")).toBeNull();
  expect(close("[code]x[/code] [i|")).toBe("[/i]");
});

it("knows when a position is inside [code]", () => {
  expect(insideRaw("a [code]fn main() {", 19)).toBe(true);
  expect(insideRaw("a [code]x[/code] b", 18)).toBe(false);
});
