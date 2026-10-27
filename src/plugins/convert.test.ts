// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { convertHtml, validateConverter } from "./convert";

const converter = validateConverter({
  id: "t.c.html", title: "HTML", maps: { size: { "14pt": "4" } },
  rules: [
    { match: "script, .post-edit-reason", skip: true },
    { match: "br", open: "\n", leaf: true },
    { match: "div.post-block.spoil", open: "[spoiler={bbcode:.block-title}]\n", close: "\n[/spoiler]", content: ".block-body", block: true },
    { match: "div.post-block.spoil", open: "[spoiler]\n", close: "\n[/spoiler]", content: ".block-body", block: true },
    { match: "div.post-block.code", open: "[code]", close: "[/code]", content: ".block-body", raw: true, block: true },
    { match: "img[src]", open: "[img]{attr:src}[/img]", leaf: true },
    { match: "a[href]", open: "[url=\"{attr:href}\"]", close: "[/url]" },
    { match: "b, strong", open: "[b]", close: "[/b]" },
    { match: "[style*='font-size']", open: "[size={style:font-size|map:size}]", close: "[/size]" },
    { match: "[style*='color']", open: "[color={style:color|hex}]", close: "[/color]" },
    { match: "ul", open: "[list]", close: "\n[/list]", block: true },
    { match: "li", open: "\n[*]" },
    { match: "div, p", block: true },
    { match: "bad[[selector" },
  ],
}, "t.c", () => undefined)!;

describe("HTML → BBCode", () => {
  it("converts a 4PDA-like post", () => {
    const html = `<div class="post_body"><span style="font-size:14pt;line-height:100%"><b><span style="color:blue">Happ</span></b></span><br />
      Описание <a href="https://happ.su/">сайт</a><script>alert(1)</script>
      <div class="post-block spoil close"><div class="block-title"><b>Скрин</b>шоты</div><div class="block-body"><img src="https://x/1.png"></div></div>
      <div class="post-block spoil"><div class="block-title"></div><div class="block-body">без названия</div></div>
      <div class="post-block code box"><div class="block-title"></div><div class="block-body">if (a) {<br />    b();<br />}</div></div>
      <ul><li>один</li><li><span style="color:rgb(255, 0, 0)">два</span></li></ul>
      <div class="post-edit-reason">Сообщение отредактировал</div></div>`;
    expect(convertHtml(html, converter)).toBe([
      "[size=4][b][color=blue]Happ[/color][/b][/size]",
      "Описание [url=\"https://happ.su/\"]сайт[/url]",
      "[spoiler=[b]Скрин[/b]шоты]\n[img]https://x/1.png[/img]\n[/spoiler]",
      "[spoiler]\nбез названия\n[/spoiler]",
      "[code]if (a) {\n    b();\n}[/code]",
      "[list]\n[*]один\n[*][color=#ff0000]два[/color]\n[/list]",
    ].join("\n"));
  });
  it("drops values that could break out of a tag and unknown sizes", () => {
    expect(convertHtml(`<a href='https://a/"]x[/url]'>t</a> <span style="font-size:99pt">big</span>`, converter)).toBe(`[url="https://a/x/url"]t[/url] big`);
  });
});
