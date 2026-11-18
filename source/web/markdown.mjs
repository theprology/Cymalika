// A small, dependency-free Markdown renderer. Model HTML is always literal text.
// Nodes are built with DOM APIs; no model text is assigned to innerHTML.
export function inlineTokens(text, depth = 0) {
  if (depth > 8) return [{ type: "text", text }];
  const result = [],
    pattern =
      /(`+)([^`]+?)\1|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(\*\*|__)(.+?)\5|(~~)(.+?)\7|(?<!\w)(\*|_)([^\n]+?)\9(?!\w)/g;
  let end = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > end)
      result.push({ type: "text", text: text.slice(end, m.index) });
    if (m[1]) result.push({ type: "code", text: m[2] });
    else if (m[3]) {
      try {
        const url = new URL(m[4]);
        result.push({
          type: "a",
          href: url.href,
          children: inlineTokens(m[3], depth + 1),
        });
      } catch {
        result.push({ type: "text", text: m[0] });
      }
    } else {
      const type = m[5] ? "strong" : m[7] ? "del" : "em";
      result.push({
        type,
        children: inlineTokens(m[6] || m[8] || m[10], depth + 1),
      });
    }
    end = m.index + m[0].length;
  }
  if (end < text.length) result.push({ type: "text", text: text.slice(end) });
  return result;
}
const listLine = (s) => s.match(/^(\s*)([-+*]|\d+[.)])\s+(.+)$/);
const tableCells = (s) =>
  s
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((x) => x.trim().replace(/\\\|/g, "|"));
const divider = (s) =>
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(s);
const special = (lines, i) =>
  /^\s*(`{3,}|~{3,})|^#{1,6}\s|^\s*>|^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(
    lines[i],
  ) ||
  listLine(lines[i]) ||
  (i + 1 < lines.length && lines[i].includes("|") && divider(lines[i + 1]));
export function markdownBlocks(input, depth = 0) {
  if (depth > 8) return [{ type: "p", text: input }];
  const lines = String(input).replace(/\r\n?/g, "\n").split("\n"),
    out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = line.match(/^\s*(`{3,}|~{3,})\s*([^\s`]*)[^\n]*$/);
    if (fence) {
      const code = [];
      i++;
      const close = new RegExp(
        "^\\s*" + fence[1][0] + "{" + fence[1].length + ",}\\s*$",
      );
      while (i < lines.length && !close.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      out.push({
        type: "pre",
        language: fence[2].toLowerCase(),
        text: code.join("\n"),
      });
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (h) {
      out.push({ type: "h" + h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push({ type: "hr" });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i]))
        body.push(lines[i++].replace(/^\s*> ?/, ""));
      out.push({
        type: "blockquote",
        children: markdownBlocks(body.join("\n"), depth + 1),
      });
      continue;
    }
    if (i + 1 < lines.length && line.includes("|") && divider(lines[i + 1])) {
      const header = tableCells(line),
        rows = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim())
        rows.push(tableCells(lines[i++]));
      out.push({ type: "table", header, rows });
      continue;
    }
    const first = listLine(line);
    if (first) {
      const items = [],
        ordered = /\d/.test(first[2]),
        indent = first[1].length,
        start = ordered ? parseInt(first[2], 10) : 1;
      while (i < lines.length) {
        const m = listLine(lines[i]);
        if (!m || m[1].length !== indent || /\d/.test(m[2]) !== ordered) break;
        const body = [m[3]];
        i++;
        while (
          i < lines.length &&
          lines[i].trim() &&
          /^\s/.test(lines[i]) &&
          (!listLine(lines[i]) || listLine(lines[i])[1].length > indent)
        )
          body.push(
            lines[i++].slice(Math.min(indent + 2, lines[i - 1]?.length || 0)),
          );
        items.push(markdownBlocks(body.join("\n"), depth + 1));
      }
      out.push({ type: ordered ? "ol" : "ul", start, items });
      continue;
    }
    const paragraph = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !special(lines, i))
      paragraph.push(lines[i++]);
    out.push({ type: "p", text: paragraph.join("\n") });
  }
  return out;
}
export function codeTokens(code, language) {
  if (
    !/^(py|python|js|javascript|jsx|ts|typescript|tsx|swift|java|c|cpp|csharp|cs|go|rust|rs|ruby|rb|sh|bash|zsh|json|css|sql)$/.test(
      language,
    )
  )
    return [{ type: "text", text: code }];
  const python = /^(py|python|ruby|rb|sh|bash|zsh)$/.test(language),
    keywords = new Set(
      "def class return import from as if else elif for while in is not and or None True False try except finally raise with pass async await function const let var new this null true false undefined export default throw catch switch case break continue public private static func guard struct enum protocol extension self nil var let do switch case defer package type interface implements extends void int string bool boolean select where insert update delete create table values".split(
        " ",
      ),
    );
  const regex = python
    ? /(#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b)/g
    : /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b)/g;
  const out = [];
  let end = 0;
  for (const m of code.matchAll(regex)) {
    if (m.index > end)
      out.push({ type: "text", text: code.slice(end, m.index) });
    const s = m[0],
      type =
        s.startsWith("#") || s.startsWith("//") || s.startsWith("/*")
          ? "comment"
          : /^["'`]/.test(s)
            ? "string"
            : /^\d/.test(s)
              ? "number"
              : keywords.has(s.toLowerCase()) || keywords.has(s)
                ? "keyword"
                : "text";
    out.push({ type, text: s });
    end = m.index + s.length;
  }
  if (end < code.length) out.push({ type: "text", text: code.slice(end) });
  return out;
}
export function renderMarkdown(
  box,
  text,
  { copy = () => {}, openLink = () => {} } = {},
) {
  const doc = box.ownerDocument,
    make = (tag, cls, value) => {
      const n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (value !== undefined) n.textContent = value;
      return n;
    };
  function inline(parent, value) {
    for (const t of inlineTokens(value)) {
      if (t.type === "text") parent.append(doc.createTextNode(t.text));
      else {
        const n = make(t.type);
        if (t.type === "a") {
          n.href = t.href;
          n.title = t.href;
          n.addEventListener("click", (event) => {
            event.preventDefault();
            openLink(t.href);
          });
        }
        if (t.children) tokens(n, t.children);
        else n.textContent = t.text;
        parent.append(n);
      }
    }
  }
  function tokens(parent, list) {
    for (const t of list) {
      if (t.type === "text") parent.append(doc.createTextNode(t.text));
      else {
        const n = make(t.type);
        if (t.type === "a") {
          n.href = t.href;
          n.addEventListener("click", (e) => {
            e.preventDefault();
            openLink(t.href);
          });
        }
        t.children ? tokens(n, t.children) : (n.textContent = t.text);
        parent.append(n);
      }
    }
  }
  function blocks(parent, list) {
    for (const b of list) {
      if (b.type === "pre") {
        const wrap = make("div", "code-wrap"),
          bar = make("div", "code-toolbar"),
          label = make("span", "", b.language || "code"),
          btn = make("button", "", "Copy code"),
          pre = make("pre"),
          code = make("code");
        btn.type = "button";
        btn.addEventListener("click", () => copy(b.text));
        bar.append(label, btn);
        for (const t of codeTokens(b.text, b.language))
          code.append(
            t.type === "text"
              ? doc.createTextNode(t.text)
              : make("span", "syntax-" + t.type, t.text),
          );
        pre.append(code);
        wrap.append(bar, pre);
        parent.append(wrap);
        continue;
      }
      if (b.type === "table") {
        const wrap = make("div", "table-scroll"),
          table = make("table"),
          thead = make("thead"),
          tr = make("tr");
        for (const s of b.header) {
          const th = make("th");
          inline(th, s);
          tr.append(th);
        }
        thead.append(tr);
        table.append(thead);
        const tbody = make("tbody");
        for (const r of b.rows) {
          const row = make("tr");
          for (let j = 0; j < b.header.length; j++) {
            const cell = make("td");
            inline(cell, r[j] || "");
            row.append(cell);
          }
          tbody.append(row);
        }
        table.append(tbody);
        wrap.append(table);
        parent.append(wrap);
        continue;
      }
      const n = make(b.type);
      if (b.items) {
        if (b.type === "ol" && b.start !== 1) n.start = b.start;
        for (const item of b.items) {
          const li = make("li");
          blocks(li, item);
          n.append(li);
        }
      } else if (b.children) blocks(n, b.children);
      else if (b.text !== undefined) inline(n, b.text);
      parent.append(n);
    }
  }
  // Thinking output is intentionally separate from the readable reply.
  blocks(
    box,
    markdownBlocks(String(text).replace(/^\s*<think>[\s\S]*?<\/think>\s*/, "")),
  );
}
