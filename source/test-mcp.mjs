import assert from "node:assert/strict";
import http from "node:http";
import { mcpRequest, mcpResult } from "./web/advanced-engine.mjs";
const received = [];
const server = http.createServer(async (req, res) => {
  let text = "";
  for await (const part of req) text += part;
  const body = JSON.parse(text);
  received.push({ headers: req.headers, body });
  if (!body.id) {
    res.writeHead(202);
    res.end();
    return;
  }
  const result =
    body.method === "initialize"
      ? { protocolVersion: "2025-11-25", capabilities: { tools: {} } }
      : body.method === "tools/list"
        ? {
            tools: [
              {
                name: "echo",
                inputSchema: {
                  type: "object",
                  properties: { text: { type: "string" } },
                },
              },
            ],
          }
        : body.method === "resources/list"
          ? { resources: [{ uri: "fixture://guide", name: "Guide" }] }
          : body.method === "resources/read"
            ? {
                contents: [
                  { uri: "fixture://guide", text: "Reference fixture" },
                ],
              }
            : {
                content: [
                  { type: "text", text: body.params.arguments?.text || "OK" },
                ],
              };
  if (req.url === "/sse") {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end(
      "event: message\ndata: " +
        JSON.stringify({ jsonrpc: "2.0", id: body.id, result }) +
        "\n\n",
    );
  } else {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Mcp-Session-Id": "fixture-session",
    });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = "http://127.0.0.1:" + server.address().port;
async function call(version, method, params = {}, path = "/mcp", options = {}) {
  const req = mcpRequest(
    { version, endpoint: base + path },
    method,
    params,
    options,
  );
  const r = await fetch(req.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...req.headers },
    body: JSON.stringify(req.body),
  });
  const text = await r.text();
  if (options.notification) return {};
  const data = r.headers.get("content-type").startsWith("text/event-stream")
    ? { text }
    : JSON.parse(text);
  return mcpResult(req.id, data);
}
try {
  assert.equal((await call("2026-07-28", "tools/list")).tools[0].name, "echo");
  assert.equal(received.at(-1).headers["mcp-method"], "tools/list");
  assert.equal(
    received.at(-1).body.params._meta[
      "io.modelcontextprotocol/protocolVersion"
    ],
    "2026-07-28",
  );
  assert.equal(
    (
      await call(
        "2026-07-28",
        "tools/call",
        { name: "echo", arguments: { text: "hello" } },
        "/sse",
      )
    ).content[0].text,
    "hello",
  );
  assert.equal(received.at(-1).headers["mcp-name"], "echo");
  assert.equal(
    (await call("2025-11-25", "initialize", { protocolVersion: "2025-11-25" }))
      .protocolVersion,
    "2025-11-25",
  );
  assert(!received.at(-1).body.params._meta);
  await call("2025-11-25", "notifications/initialized", {}, "/mcp", {
    notification: true,
    session: "fixture-session",
  });
  assert.equal(received.at(-1).headers["mcp-session-id"], "fixture-session");
  assert.equal(
    (await call("2026-07-28", "resources/list")).resources[0].uri,
    "fixture://guide",
  );
  assert.equal(
    (await call("2026-07-28", "resources/read", { uri: "fixture://guide" }))
      .contents[0].text,
    "Reference fixture",
  );
  assert.throws(() => mcpResult("expected", { id: "wrong", result: {} }));
  assert.throws(
    () => mcpResult("x", { id: "x", error: { message: "failure" } }),
    /failure/,
  );
  console.log(
    "PASS: real local HTTP MCP JSON/SSE exchanges, modern metadata/headers, legacy initialization/session, tool calls and reference reads.",
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}
