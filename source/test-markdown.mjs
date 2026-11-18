import assert from "node:assert/strict";
import {
  markdownBlocks,
  inlineTokens,
  codeTokens,
  renderMarkdown,
} from "./web/markdown.mjs";
// A minimal DOM exercises the actual renderer without browser/runtime dependencies.
class Node {
  constructor(tag, doc) {
    this.tag = tag;
    this.ownerDocument = doc;
    this.children = [];
    this.events = {};
    this._text = "";
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  set textContent(value) {
    this.children = [];
    this._text = String(value);
  }
  get textContent() {
    return this._text + this.children.map((x) => x.textContent).join("");
  }
  set innerHTML(value) {
    throw Error("Unsafe HTML renderer used");
  }
  addEventListener(name, fn) {
    this.events[name] = fn;
  }
}
const doc = {
  createElement: (tag) => new Node(tag, doc),
  createTextNode: (text) => {
    const n = new Node("#text", doc);
    n.textContent = text;
    return n;
  },
};
const box = new Node("div", doc),
  copied = [],
  opened = [];
const input =
  '# Result\n\nA **bold** reply with `inline code` and *emphasis*.\n\n- First\n- Second\n  - Nested\n\n| File | Status |\n| --- | --- |\n| a.py | Fixed |\n\n```python\ndef add(a, b):\n    return a + b\n```\n\n> Review before saving.\n\n[Docs](https://example.com/docs)\n\n<img src="https://evil.test" onerror="alert(1)"><script>alert(2)</script>\n\n[unsafe](javascript:alert(3))';
renderMarkdown(box, input, {
  copy: (t) => copied.push(t),
  openLink: (u) => opened.push(u),
});
const all = (n) => [n, ...n.children.flatMap(all)],
  nodes = all(box),
  tags = nodes.map((x) => x.tag);
for (const tag of [
  "h1",
  "strong",
  "code",
  "em",
  "ul",
  "li",
  "table",
  "th",
  "td",
  "pre",
  "blockquote",
  "a",
  "button",
])
  assert(tags.includes(tag), tag);
assert(!tags.includes("script"));
assert(!tags.includes("img"));
assert(!tags.includes("iframe"));
assert(box.textContent.includes("<script>alert(2)</script>"));
assert.equal(nodes.filter((x) => x.tag === "a").length, 1);
const link = nodes.find((x) => x.tag === "a");
let prevented = false;
link.events.click({
  preventDefault() {
    prevented = true;
  },
});
assert(prevented);
assert.deepEqual(opened, ["https://example.com/docs"]);
nodes.find((x) => x.tag === "button").events.click();
assert.deepEqual(copied, ["def add(a, b):\n    return a + b"]);
assert.equal(nodes.filter((x) => x.tag === "ul").length, 2);
assert.equal(markdownBlocks("```js\nconst x = 1;")[0].text, "const x = 1;");
assert.equal(markdownBlocks("3. Three\n4. Four")[0].start, 3);
assert.equal(inlineTokens("a **bold** b")[1].type, "strong");
assert.equal(
  codeTokens('const x = "<b>"; // test', "js")
    .map((t) => t.text)
    .join(""),
  'const x = "<b>"; // test',
);
assert(codeTokens("return 42", "python").some((t) => t.type === "keyword"));
const thinking = new Node("div", doc);
renderMarkdown(thinking, "<think>private analysis</think>Visible reply");
assert.equal(thinking.textContent, "Visible reply");
const literal = new Node("div", doc);
renderMarkdown(literal, "```html\n<think>keep this code</think>\n```");
assert(literal.textContent.includes("<think>keep this code</think>"));
console.log(
  "Markdown rendering passed: typography, nested lists, code copying, safe links, literal HTML, and token preservation.",
);
