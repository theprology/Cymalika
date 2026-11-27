const libraryRuntimes = [
  {
    id: "lmstudio",
    name: "LM Studio",
    endpoint: "http://localhost:1234/v1",
    help: "Start LM Studio’s local server with a supported GGUF or MLX chat model. CyMalika connects to its OpenAI-compatible API.",
  },
  {
    id: "llamacpp",
    name: "llama.cpp",
    endpoint: "http://localhost:8080/v1",
    help: "Run llama-server with a GGUF model supported by your llama.cpp version. CPU, Metal and GPU support depend on that build.",
  },
  {
    id: "mlx",
    name: "MLX-LM · Apple silicon",
    endpoint: "http://localhost:8080/v1",
    help: "Start mlx_lm.server on your Apple-silicon Mac with a supported MLX model. MLX-format Safetensors are different from arbitrary GPU checkpoints.",
  },
  {
    id: "vllm",
    name: "vLLM · local or GPU server",
    endpoint: "http://localhost:8000/v1",
    help: "Start vLLM on hardware that supports the model’s architecture and quantization. Large checkpoints usually need a Linux GPU server.",
  },
  {
    id: "sglang",
    name: "SGLang · local or GPU server",
    endpoint: "http://localhost:30000/v1",
    help: "Start SGLang with the publisher’s supported architecture, reasoning parser and tool parser. Hardware and runtime version matter.",
  },
  {
    id: "tgi",
    name: "Hugging Face TGI",
    endpoint: "http://localhost:8080/v1",
    help: "Connect a running Text Generation Inference server that supports chat completions for your chosen model.",
  },
  {
    id: "compatible",
    name: "Other / hosted OpenAI-compatible API",
    endpoint: "",
    help: "Enter the API base URL ending in /v1 and the model ID your server exposes. Remote connections use HTTPS; SSH tunnels can use localhost HTTP.",
  },
];
function hfModelId(raw) {
  let value = String(raw || "").trim();
  if (/^https?:\/\//i.test(value)) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw Error("Enter a Hugging Face model link or owner/model ID.");
    }
    if (
      url.protocol !== "https:" ||
      url.hostname !== "huggingface.co" ||
      url.username ||
      url.password
    )
      throw Error(
        "Use a model link on https://huggingface.co, without credentials.",
      );
    value = url.pathname.replace(/^\/+|\/+$/g, "");
    if (value.split("/").length > 2) {
      const parts = value.split("/");
      if (!["tree", "blob", "resolve"].includes(parts[2]))
        throw Error("Enter the model’s repository link.");
      value = parts.slice(0, 2).join("/");
    }
  }
  value = value.replace(/^hf\.co\//, "");
  if (
    /^[\w.-]+\/[\w.-]+$/.test(value) &&
    !value.split("/").some((x) => x === "." || x === "..")
  )
    return value;
  if (value.includes("://") || value.includes("/") || value.includes(".."))
    throw Error("Enter an owner/model ID or a Hugging Face model link.");
  return "";
}
function modelCatalogURL(raw, limit = 20) {
  const id = hfModelId(raw);
  return id
    ? "https://huggingface.co/api/models/" + id + "?blobs=true"
    : "https://huggingface.co/api/models?limit=" +
        Math.max(20, Math.min(100, limit)) +
        "&full=true&cardData=true&search=" +
        encodeURIComponent(String(raw || "").trim());
}
function modelRequirements(model, hardware = {}) {
  const files = Array.isArray(model.siblings) ? model.siblings : [];
  const tags = Array.isArray(model.tags) ? model.tags : [];
  const gguf = files.filter((f) => /\.gguf$/i.test(f.rfilename || ""));
  const weights = files.filter((f) =>
    /\.(safetensors|bin|pt|pth|onnx|h5|msgpack)$/i.test(f.rfilename || ""),
  );
  const mlx =
    tags.some((t) => /^mlx$/i.test(t)) ||
    model.library_name === "mlx" ||
    /^mlx-community\//i.test(model.id || "");
  const adapter =
    files.some((f) => /(^|\/)adapter_config\.json$/.test(f.rfilename || "")) ||
    tags.includes("peft");
  const formats = [];
  if (gguf.length || tags.includes("gguf")) formats.push("GGUF");
  if (weights.some((f) => /\.safetensors$/i.test(f.rfilename)))
    formats.push(mlx ? "MLX Safetensors" : "Safetensors");
  if (weights.some((f) => /\.(bin|pt|pth)$/i.test(f.rfilename)))
    formats.push("PyTorch");
  if (weights.some((f) => /\.onnx$/i.test(f.rfilename))) formats.push("ONNX");
  if (adapter) formats.push("Adapter · needs base model");
  const known = weights.filter((f) => Number(f.size || f.lfs?.size) > 0);
  const weightBytes = known.reduce(
    (n, f) => n + Number(f.size || f.lfs?.size),
    0,
  );
  const completeSize = weights.length > 0 && known.length === weights.length;
  const task = model.pipeline_tag || "Not reported";
  const chatCandidate = [
    "text-generation",
    "image-text-to-text",
    "text2text-generation",
  ].includes(task);
  const runtime = adapter
    ? "Load with a compatible base model and adapter-aware runtime; this is not a standalone model."
    : mlx
      ? "MLX-LM or LM Studio on Apple silicon, if this architecture is supported."
      : gguf.length
        ? "Ollama, llama.cpp or LM Studio, if their installed version supports this architecture and file layout."
        : formats.some((x) => ["Safetensors", "PyTorch"].includes(x))
          ? "A matching Transformers-based runtime, such as vLLM, SGLang or TGI, with explicit support for this architecture and quantization. These files do not install through CyMalika’s Ollama downloader."
          : "Runtime not established from metadata. Check the publisher’s model card; an OpenAI-compatible chat server is needed to use it in CyMalika.";
  const ram = Number(hardware.ram) || 0;
  const memory =
    weightBytes && ram && weightBytes > ram
      ? "Reported repository weight files exceed this computer’s total RAM. If these files form one checkpoint, it cannot fit fully in memory here. Repositories with alternative variants need comparison per variant. Offloading, conversion and architecture support require separate assessment."
      : "File size is not a RAM/VRAM requirement. Leave room for the operating system, runtime and context cache. Metadata alone cannot confirm this model will run on this computer.";
  return {
    formats,
    gguf,
    weightBytes,
    completeSize,
    task,
    chatCandidate,
    runtime,
    memory,
    adapter,
    mlx,
    architecture:
      (model.config?.architectures || []).join(", ") ||
      model.config?.model_type ||
      "Not reported",
    quantization:
      model.config?.quantization_config?.quant_method || "See model card",
  };
}
function runtimeConnection(raw) {
  const url = new URL(String(raw || "").trim());
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol === "http:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  )
    throw Error(
      "Use HTTPS for a remote server, or localhost HTTP. Keep credentials in the API key field.",
    );
  let base = url.href.replace(/\/+$/, "");
  if (/\/(models|chat\/completions|completions)$/.test(url.pathname))
    throw Error(
      "Enter the API base URL (usually ending in /v1), not a models or completions URL.",
    );
  if (url.pathname === "/") base += "/v1";
  return base;
}

function libraryButton(text, cls, fn) {
  return button(text, cls, async (event) => {
    try {
      await fn(event);
    } catch (error) {
      libraryMessage(error.message, true);
    }
  });
}
const profileFields = [
  "provider",
  "endpoint",
  "model",
  "protocol",
  "context",
  "maxTokens",
  "temperature",
  "rounds",
  "thinking",
  "streaming",
  "vision",
  "keepAlive",
];
const connectionKeys = new Map();
let libraryViewEpoch = 0;
let libraryTab = "installed",
  libraryRuntime = null,
  libraryEndpoint = "",
  libraryPoll = null,
  libraryLoading = false;
const completedLibraryJobs = new Set();
function assistantName() {
  const name = String(settings.assistantName || "").trim();
  return name && name.length <= 48 && !/[\u0000-\u001f\u007f]/.test(name)
    ? name
    : "CyMalika";
}
function paintIdentity() {
  const name = assistantName();
  $("assistantBrand").textContent = name;
  document.title = name;
  all(".assistant-name").forEach((e) => (e.textContent = name));
  $("prompt").placeholder = "Message " + name + "…";
}
function connectionKey(s) {
  return s.provider + "|" + s.endpoint.replace(/\/+$/, "");
}
function connectionSettings(s) {
  return Object.fromEntries(
    profileFields.filter((k) => s[k] !== undefined).map((k) => [k, s[k]]),
  );
}
function paintConnections() {
  const select = $("connectionSelect");
  select.replaceChildren(new Option("Current connection", ""));
  for (const p of desk.profiles) select.append(new Option(p.name, p.id));
  select.value = settings.activeProfile || "";
}
async function useConnection(p) {
  if (busy) return toast("Wait for the current task before switching models.");
  if (settings.apiKey)
    connectionKeys.set(connectionKey(settings), settings.apiKey);
  Object.assign(settings, connectionSettings(p.settings), {
    activeProfile: p.id,
  });
  settings.apiKey = connectionKeys.get(connectionKey(settings)) || "";
  capability = "Untested";
  await refreshModels();
  paintConnections();
  scheduleSave();
  toast(
    "Using " +
      p.name +
      (settings.provider !== "ollama" && !settings.apiKey
        ? " · add its API key in Settings if needed."
        : ""),
  );
}
function readableBytes(n) {
  const value = Number(n) || 0;
  if (!value) return "Not reported";
  const scale = value >= 1024 ** 3 ? 1024 ** 3 : 1024 ** 2;
  return (value / scale).toFixed(1) + (scale === 1024 ** 3 ? " GiB" : " MiB");
}
function localLibraryEndpoint() {
  const u = new URL(libraryEndpoint);
  if (
    u.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) ||
    u.username ||
    u.password ||
    !["/", ""].includes(u.pathname) ||
    u.search ||
    u.hash
  )
    throw Error("Connect a local Ollama engine in the Local engine tab first.");
  return u.origin;
}
async function libraryRequest(route, body, method) {
  const base = localLibraryEndpoint();
  return native("request", {
    url: base + "/api/" + route,
    method: method || (body ? "POST" : "GET"),
    ...(body ? { body } : {}),
  });
}
function libraryMessage(text, error = false) {
  $("modelLibraryStatus").textContent = text;
  $("modelLibraryStatus").classList.toggle("error", error);
}
function libraryCard(title, subtitle) {
  const card = elem("article", "library-model-card");
  card.append(elem("strong", "", title), elem("p", "muted", subtitle));
  $("modelLibraryBody").append(card);
  return card;
}
function libraryActions(card) {
  const row = elem("div", "library-actions");
  card.append(row);
  return row;
}
async function openModelLibrary(tab = "installed") {
  if (busy) return toast("Wait for the current task before managing models.");
  libraryTab = tab;
  $("modelLibraryDialog").showModal();
  libraryMessage("Finding your local engine…");
  try {
    libraryRuntime = await native("modelLibrary", { operation: "status" });
    try {
      if (settings.provider === "ollama") {
        const u = new URL(settings.endpoint);
        if (["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))
          libraryEndpoint = settings.endpoint;
      }
    } catch {}
    libraryEndpoint = libraryEndpoint || libraryRuntime.endpoint || "";
    await renderModelLibrary();
    pollLibraryJobs();
  } catch (e) {
    if (["download", "connections"].includes(libraryTab)) {
      libraryRuntime = null;
      await renderModelLibrary();
      libraryMessage(
        "Local engine status unavailable. Model search and API connections are still available. " +
          e.message,
        true,
      );
    } else libraryMessage(e.message, true);
  }
}
async function renderModelLibrary() {
  const viewEpoch = ++libraryViewEpoch;
  all("[data-library-tab]").forEach((b) =>
    b.classList.toggle("active", b.dataset.libraryTab === libraryTab),
  );
  const body = $("modelLibraryBody");
  body.replaceChildren();
  $("modelLibraryReview").replaceChildren();
  libraryMessage("");
  if (libraryTab === "engine") {
    renderLibraryEngine();
    return;
  }
  if (libraryTab === "connections") {
    renderLibraryConnections();
    return;
  }
  if (libraryTab === "download") {
    renderLibraryDownloads();
    return;
  }
  if (settings.provider !== "ollama") {
    libraryMessage("Reading models from your active API connection…");
    try {
      const anthropic = settings.provider === "anthropic";
      const data = await native("request", {
        url: endpoint(settings.endpoint, anthropic ? "v1/models" : "models"),
        method: "GET",
        headers: anthropic
          ? { "x-api-key": settings.apiKey, "anthropic-version": "2023-06-01" }
          : settings.apiKey
            ? { Authorization: "Bearer " + settings.apiKey }
            : {},
      });
      if (viewEpoch !== libraryViewEpoch) return;
      if (!Array.isArray(data.data))
        throw Error("The server did not return a compatible model list.");
      libraryMessage(
        `${data.data.length} model(s) reported by ${settings.endpoint}. Server availability does not prove model/tool compatibility.`,
      );
      for (const m of data.data) {
        if (typeof m.id !== "string") continue;
        const c = libraryCard(
          m.id,
          "Available through your current API connection · managed by that runtime",
        );
        libraryActions(c).append(
          libraryButton(
            settings.model === m.id ? "Selected" : "Use this model",
            "button primary",
            async () => {
              if (busy) return;
              settings.model = m.id;
              settings.activeProfile = "";
              capability = "Untested";
              scheduleSave();
              paintConnections();
              await refreshModels();
              await renderModelLibrary();
            },
          ),
        );
      }
      if (!data.data.length)
        libraryCard(
          "No models reported",
          "Start or load a model in the runtime, or use its exact server model ID in Connections. CyMalika does not download a replacement.",
        );
    } catch (e) {
      if (viewEpoch === libraryViewEpoch) libraryMessage(e.message, true);
    }
    return;
  }
  if (!libraryEndpoint) {
    libraryCard(
      "Start with a local engine",
      "Install or start Ollama in Local engine. Your existing API connections remain available.",
    );
    return;
  }
  libraryMessage("Reading installed and loaded models…");
  try {
    const [tags, running] = await Promise.all([
      libraryRequest("tags"),
      libraryRequest("ps").catch(() => ({ models: [] })),
    ]);
    if (viewEpoch !== libraryViewEpoch) return;
    const loaded = running.models || [];
    libraryMessage(
      `${(tags.models || []).length} installed · ${loaded.length} loaded in memory · ${readableBytes(libraryRuntime?.ram)} system RAM`,
    );
    if (!tags.models?.length)
      libraryCard(
        "Your model shelf is empty",
        "Choose Get models to download your first model inside the app.",
      );
    for (const m of tags.models || []) {
      const resident = loaded.find(
        (x) => x.name === m.name || x.model === m.name,
      );
      const details = [
        readableBytes(m.size),
        m.details?.parameter_size,
        m.details?.quantization_level,
        resident
          ? "Loaded · " + readableBytes(resident.size_vram) + " GPU memory"
          : "Not loaded",
      ]
        .filter(Boolean)
        .join(" · ");
      const c = libraryCard(m.name, details);
      const a = libraryActions(c);
      a.append(
        libraryButton(
          settings.provider === "ollama" &&
            settings.model === m.name &&
            settings.endpoint.replace("localhost", "127.0.0.1") ===
              libraryEndpoint.replace("localhost", "127.0.0.1")
            ? "Selected"
            : "Use this model",
          "button primary",
          () => useLibraryModel(m.name),
        ),
        libraryButton(
          resident ? "Unload from memory" : "Keep loaded",
          "button",
          async () => {
            if (busy) return toast("Wait for the current task.");
            libraryMessage(resident ? "Unloading…" : "Loading into memory…");
            await libraryRequest("generate", {
              model: m.name,
              stream: false,
              keep_alive: resident ? 0 : -1,
            });
            await renderModelLibrary();
          },
        ),
        libraryButton("Remove download", "button danger", () =>
          reviewModelRemoval(m.name),
        ),
      );
    }
  } catch (e) {
    if (viewEpoch !== libraryViewEpoch) return;
    libraryMessage(e.message, true);
    libraryCard(
      "Engine unavailable",
      "Open Local engine to start it or reconnect. A cloud API can be selected under Connections.",
    );
  }
}
async function useLibraryModel(name) {
  if (busy) return toast("Wait for the current task.");
  if (settings.apiKey)
    connectionKeys.set(connectionKey(settings), settings.apiKey);
  Object.assign(settings, {
    provider: "ollama",
    endpoint: localLibraryEndpoint(),
    model: name,
    apiKey: "",
    activeProfile: "",
  });
  await refreshModels();
  paintConnections();
  scheduleSave();
  libraryMessage("Selected " + name + ". You can return to chat.");
}
function reviewModelRemoval(name) {
  const review = $("modelLibraryReview");
  review.replaceChildren();
  review.append(
    elem("h3", "", "Remove " + name + "?"),
    elem(
      "p",
      "muted",
      "This removes the local model download from this engine. Shared layers used by other models remain. Your chats and other models are kept. Type the exact model ID to confirm.",
    ),
  );
  const input = elem("input");
  input.setAttribute("aria-label", "Model ID to remove");
  review.append(input);
  const row = libraryActions(review);
  row.append(
    libraryButton("Cancel", "button", () => review.replaceChildren()),
    libraryButton("Remove this model", "button danger", async () => {
      if (busy) return toast("Wait for the current task.");
      if (input.value !== name)
        return libraryMessage("The model ID does not match.", true);
      await libraryRequest("delete", { model: name }, "DELETE");
      if (
        settings.provider === "ollama" &&
        settings.model === name &&
        connectionKey(settings) ===
          connectionKey({ provider: "ollama", endpoint: libraryEndpoint })
      ) {
        settings.model = "";
        scheduleSave();
        await refreshModels();
      }
      await renderModelLibrary();
    }),
  );
  review.scrollIntoView?.({ block: "nearest" });
}
let catalogSearchEpoch = 0;
let catalogRequirementsEpoch = 0;
let catalogModel = "";
function renderLibraryDownloads() {
  libraryMessage(
    "Browse all model formats. Viewing requirements downloads metadata only; model downloads always need confirmation.",
  );
  const search = elem("div", "library-search"),
    source = elem("select");
  source.setAttribute("aria-label", "Model source");
  for (const [v, t] of [
    ["huggingface", "Hugging Face · all formats"],
    ["ollama", "Ollama model ID"],
  ])
    source.append(new Option(t, v));
  source.value = "huggingface";
  const query = elem("input");
  query.placeholder =
    "Search models, owner/model, or paste a Hugging Face link…";
  query.setAttribute("aria-label", "Find a model");
  const results = elem("div");
  results.id = "modelSearchResults";
  let limit = 20;
  const run = async () => {
    if (!query.value.trim())
      throw Error("Enter a model name or Hugging Face link.");
    if (source.value === "ollama")
      return reviewModelDownload(query.value, "Ollama registry");
    const searchEpoch = ++catalogSearchEpoch,
      viewEpoch = libraryViewEpoch;
    libraryMessage("Searching Hugging Face across all formats…");
    results.replaceChildren();
    $("modelLibraryReview").replaceChildren();
    ++catalogRequirementsEpoch;
    const data = await native("request", {
      url: modelCatalogURL(query.value, limit),
      method: "GET",
    });
    if (searchEpoch !== catalogSearchEpoch || viewEpoch !== libraryViewEpoch)
      return;
    const rows = Array.isArray(data) ? data : data?.id ? [data] : null;
    if (!rows) throw Error("The model directory returned an invalid response.");
    for (const m of rows) {
      if (!/^[\w.-]+\/[\w.-]+$/.test(m.id || "")) continue;
      const requirements = modelRequirements(m);
      const c = elem("article", "library-model-card");
      c.append(
        elem("strong", "", m.id),
        elem(
          "p",
          "muted",
          `${requirements.formats.join(" · ") || "Format not reported"} · Task: ${requirements.task} · License: ${String(m.cardData?.license || "see model card")}${m.gated ? " · Access approval required" : ""}`,
        ),
      );
      libraryActions(c).append(
        libraryButton("Requirements & ways to run", "button primary", () =>
          inspectCatalogModel(m.id),
        ),
      );
      results.append(c);
    }
    if (Array.isArray(data) && rows.length === limit && limit < 100)
      results.append(
        libraryButton("Show more results", "button", async () => {
          limit += 20;
          await run();
        }),
      );
    libraryMessage(
      rows.length
        ? `${rows.length} result(s) · all formats included. Inspect a model before choosing a runtime.`
        : "No matching public models found. Try the exact owner/model ID. Private or gated repositories may need access on Hugging Face.",
    );
    if (!Array.isArray(data) && rows.length === 1)
      await inspectCatalogModel(rows[0].id, data);
  };
  const go = libraryButton("Find model", "button primary", async () => {
    limit = 20;
    await run();
  });
  query.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      go.click();
    }
  };
  search.append(source, query, go);
  $("modelLibraryBody").append(
    search,
    elem(
      "p",
      "library-help",
      "Search includes GGUF, Safetensors, MLX, adapters and other formats. Search results are not a compatibility guarantee. Existing runtimes and models are kept until you explicitly choose another connection.",
    ),
    results,
  );
}
async function inspectCatalogModel(id, metadata) {
  const searchEpoch = catalogSearchEpoch,
    viewEpoch = libraryViewEpoch,
    requirementsEpoch = ++catalogRequirementsEpoch;
  libraryMessage("Reading model requirements…");
  const m =
    metadata ||
    (await native("request", { url: modelCatalogURL(id), method: "GET" }));
  if (
    searchEpoch !== catalogSearchEpoch ||
    viewEpoch !== libraryViewEpoch ||
    requirementsEpoch !== catalogRequirementsEpoch
  )
    return;
  if (m.id !== id)
    throw Error("Model metadata did not match the requested repository.");
  const r = modelRequirements(m, libraryRuntime || {}),
    review = $("modelLibraryReview");
  review.replaceChildren();
  const row = (label, text) => {
    const p = elem("p");
    p.append(elem("strong", "", label + ": "), elem("span", "", text));
    review.append(p);
  };
  review.append(elem("h3", "", id));
  row("Format", r.formats.join(" · ") || "Not reported");
  row(
    "Task",
    r.task +
      (r.chatCandidate
        ? " · chat template and tool support still need testing"
        : " · not established as a chat model; it may need a separate task-specific app"),
  );
  row("Architecture", r.architecture);
  row("Quantization", String(r.quantization));
  row(
    "Weight files",
    r.weightBytes
      ? readableBytes(r.weightBytes) +
          (r.completeSize
            ? " total reported checkpoint files"
            : " known files only; metadata is incomplete") +
          ". Alternative checkpoints, if present, are included in this repository total."
      : "Size not reported. Inspect the publisher’s files before installing.",
  );
  if (r.gguf.length) {
    const fileList = elem("details");
    fileList.append(
      elem("summary", "", `${r.gguf.length} GGUF file(s) · sizes and variants`),
    );
    for (const f of r.gguf.slice(0, 30))
      fileList.append(
        elem(
          "p",
          "library-help",
          f.rfilename + " · " + readableBytes(f.size || f.lfs?.size),
        ),
      );
    if (r.gguf.length > 30)
      fileList.append(
        elem(
          "p",
          "library-help",
          "First 30 files shown. See the model card for all variants. Split files must be combined as the runtime requires; alternative quantizations are separate choices.",
        ),
      );
    review.append(fileList);
  }
  row(
    "This computer",
    readableBytes(libraryRuntime?.ram) +
      " system RAM · " +
      readableBytes(libraryRuntime?.freeDisk) +
      " free disk. GPU capacity is not measured here.",
  );
  row("Memory", r.memory);
  row("Ways to run", r.runtime);
  row(
    "Remote server",
    "A normal CPU VPS is not equivalent to a GPU inference server. Check architecture support, total weight memory, extra context memory, GPU type/count and storage before renting hardware. CyMalika can connect to a compatible chat API over HTTPS or a localhost SSH tunnel.",
  );
  row(
    "Access & license",
    (m.gated
      ? "Hugging Face approval/authentication required. "
      : "Public metadata. ") +
      String(m.cardData?.license || "Read the publisher’s license."),
  );
  const a = libraryActions(review);
  a.append(
    libraryButton("Read model card", "button", async () => {
      const data = await native("request", {
        url: "https://huggingface.co/" + id + "/raw/main/README.md",
        method: "GET",
      });
      if (
        viewEpoch !== libraryViewEpoch ||
        requirementsEpoch !== catalogRequirementsEpoch ||
        !review.children.length
      )
        return;
      const pre = elem(
        "pre",
        "library-model-readme",
        String(data.text || "No model card returned.").slice(0, 40000),
      );
      review.append(pre);
    }),
    libraryButton("Set up a runtime connection", "button primary", async () => {
      catalogModel = id;
      libraryTab = "connections";
      await renderModelLibrary();
    }),
  );
  if (r.gguf.length && !r.adapter) {
    const quant = elem("select");
    quant.setAttribute("aria-label", "GGUF quantization");
    const choices = [
      ...new Set(
        r.gguf
          .map((f) =>
            (f.rfilename.match(
              /(?:^|[-_.])((?:IQ|Q|F|BF)\d[A-Z0-9_]*)(?=[-.]|$)/i,
            ) || [])[1]?.toUpperCase(),
          )
          .filter(Boolean),
      ),
    ];
    if (choices.length) {
      choices.forEach((q) => quant.append(new Option(q, q)));
      const q4 = choices.find((q) => q === "Q4_K_M");
      if (q4) quant.value = q4;
      a.append(
        quant,
        libraryButton("Review Ollama download", "button", () =>
          reviewModelDownload(
            "hf.co/" + id + ":" + quant.value,
            "Hugging Face GGUF · architecture support must be checked",
            String(m.cardData?.license || "See model card"),
          ),
        ),
      );
    } else
      row(
        "GGUF download",
        "GGUF files exist, but a supported quantization tag could not be identified. Use the publisher’s instructions with llama.cpp / LM Studio, or configure a running server.",
      );
  }
  a.append(
    libraryButton("Close requirements", "button", () =>
      review.replaceChildren(),
    ),
  );
  libraryMessage(
    "Requirements loaded. No model files downloaded and your active model is unchanged.",
  );
  review.scrollIntoView?.({ block: "nearest" });
}

function reviewModelDownload(
  raw,
  source,
  license = "Check the publisher’s model license",
) {
  const name = String(raw || "").trim();
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,299}$/.test(name) ||
    name.includes("..") ||
    name.includes("://")
  )
    return libraryMessage("Enter a valid model ID.", true);
  localLibraryEndpoint();
  const review = $("modelLibraryReview");
  review.replaceChildren();
  review.append(
    elem("h3", "", "Download " + name + "?"),
    elem("p", "", source),
    elem("p", "muted", "License: " + license),
    elem(
      "p",
      "muted",
      `The download may be several GB. Free disk: ${readableBytes(libraryRuntime?.freeDisk)}. System RAM: ${readableBytes(libraryRuntime?.ram)}. Download size is not the same as memory needed; larger context uses more memory.`,
    ),
  );
  const row = libraryActions(review);
  row.append(
    libraryButton("Cancel", "button", () => review.replaceChildren()),
    libraryButton("Download this model", "button primary", async () => {
      await native("modelLibrary", {
        operation: "pull",
        endpoint: localLibraryEndpoint(),
        name,
      });
      review.replaceChildren();
      libraryMessage("Download started. You can keep using the app.");
      pollLibraryJobs();
    }),
  );
  review.scrollIntoView?.({ block: "nearest" });
}
function renderLibraryConnections() {
  const c = libraryCard(
    "Connect another runtime",
    "Ollama is optional. Connect LM Studio, llama.cpp, MLX-LM, vLLM, SGLang, TGI or a hosted chat API. This connects an existing server; it does not install or start a runtime or download a model.",
  );
  const form = elem("div", "library-connection-form");
  const input = (label, type = "input") => {
    const wrap = elem("label"),
      control = elem(type);
    wrap.append(elem("span", "", label), control);
    control.setAttribute("aria-label", label);
    form.append(wrap);
    return control;
  };
  const runtime = input("Runtime", "select");
  libraryRuntimes.forEach((r) => runtime.append(new Option(r.name, r.id)));
  runtime.value = "lmstudio";
  const help = elem("p", "library-help");
  const name = input("Connection name"),
    base = input("API base URL"),
    model = input("Server model ID"),
    key = input("API key (optional, session only)");
  key.type = "password";
  key.autocomplete = "off";
  const models = input("Models reported by server", "select");
  models.append(new Option("Check connection to list models", ""));
  const status = elem("p", "library-help");
  status.setAttribute("role", "status");
  let connectionEpoch = 0;
  const resetConnection = () => {
    ++connectionEpoch;
    key.value = "";
    models.replaceChildren(new Option("Check connection to list models", ""));
    status.textContent = "";
  };
  base.oninput = resetConnection;
  const selectedPreset = () =>
    libraryRuntimes.find((r) => r.id === runtime.value) || libraryRuntimes[0];
  const apply = () => {
    const r = selectedPreset();
    base.value = r.endpoint;
    name.value = r.name;
    help.textContent = r.help;
    resetConnection();
  };
  runtime.onchange = apply;
  apply();
  model.value = catalogModel;
  models.onchange = () => {
    if (models.value) model.value = models.value;
  };
  c.append(help, form, status);
  libraryActions(c).append(
    libraryButton("Check connection & list models", "button", async () => {
      const url = runtimeConnection(base.value),
        suppliedKey = key.value,
        connectionRequest = connectionEpoch,
        viewEpoch = libraryViewEpoch;
      const data = await native("request", {
        url: endpoint(url, "models"),
        method: "GET",
        headers: suppliedKey ? { Authorization: "Bearer " + suppliedKey } : {},
      });
      if (
        connectionRequest !== connectionEpoch ||
        viewEpoch !== libraryViewEpoch
      )
        return;
      if (
        !Array.isArray(data.data) ||
        !data.data.every((m) => typeof m.id === "string")
      )
        throw Error(
          "This server did not return an OpenAI-compatible model list. Check its API base URL.",
        );
      models.replaceChildren(
        new Option("Choose a server model", ""),
        ...data.data.map((m) => new Option(m.id, m.id)),
      );
      status.textContent =
        "Connected · " +
        data.data.length +
        " model(s) reported. This checks the API, not model loading or tool capability. Nothing downloaded.";
    }),
    libraryButton("Save connection", "button primary", async () => {
      if (busy)
        throw Error("Wait for the current task before saving a connection.");
      const url = runtimeConnection(base.value);
      if (!name.value.trim() || !model.value.trim())
        throw Error("Enter a connection name and the server’s model ID.");
      const p = {
        id: crypto.randomUUID(),
        name: name.value.trim().slice(0, 80),
        settings: {
          ...connectionSettings(defaults),
          provider: "openai",
          endpoint: url,
          model: model.value.trim(),
          protocol: "auto",
        },
      };
      desk.profiles.push(p);
      if (key.value) connectionKeys.set(connectionKey(p.settings), key.value);
      catalogModel = "";
      paintConnections();
      scheduleSave();
      await renderModelLibrary();
      libraryMessage(
        "Connection saved. Your active model is unchanged; select Use connection when you are ready.",
      );
    }),
    libraryButton("Advanced connection settings", "button", () => {
      $("modelLibraryDialog").close();
      settingsOpen();
    }),
  );
  const current = libraryCard(
    "Keep your current setup",
    "Save your current settings as another connection without changing models.",
  );
  const currentName = elem("input");
  currentName.setAttribute("aria-label", "Current connection name");
  currentName.placeholder = "Connection name";
  libraryActions(current).append(
    currentName,
    libraryButton("Save current connection", "button", () => {
      if (busy) return;
      if (!currentName.value.trim())
        throw Error("Give this connection a name.");
      const p = {
        id: crypto.randomUUID(),
        name: currentName.value.trim().slice(0, 80),
        settings: connectionSettings(settings),
      };
      desk.profiles.push(p);
      settings.activeProfile = p.id;
      if (settings.apiKey)
        connectionKeys.set(connectionKey(settings), settings.apiKey);
      paintConnections();
      scheduleSave();
      renderModelLibrary();
    }),
  );
  for (const p of desk.profiles) {
    const card = libraryCard(
      p.name,
      `${p.settings.model} · ${p.settings.provider} · ${p.settings.endpoint}`,
    );
    libraryActions(card).append(
      libraryButton("Use connection", "button primary", async () => {
        await useConnection(p);
        libraryMessage("Selected " + p.name);
      }),
      libraryButton("Remove saved connection", "button", () => {
        if (busy) return;
        desk.profiles = desk.profiles.filter((x) => x.id !== p.id);
        if (settings.activeProfile === p.id) settings.activeProfile = "";
        paintConnections();
        scheduleSave();
        renderModelLibrary();
      }),
    );
  }
  $("modelLibraryBody").append(
    elem(
      "p",
      "library-help",
      "API keys remain in memory for this app session and are never saved in profiles or chat history. Saving a connection does not send chat content. Each runtime must support the model architecture and chat API; tool use needs a separate test.",
    ),
  );
}

function renderLibraryEngine() {
  const c = libraryCard(
    "Local engine",
    libraryRuntime?.endpoint
      ? "An Ollama engine is already running at " + libraryRuntime.endpoint
      : "No running Ollama engine found.",
  );
  c.append(
    elem(
      "p",
      "muted",
      `${readableBytes(libraryRuntime?.ram)} system RAM · ${readableBytes(libraryRuntime?.freeDisk)} free disk. GPU drivers and model format also affect compatibility.`,
    ),
  );
  const row = libraryActions(c);
  if (libraryRuntime?.endpoint)
    row.append(
      libraryButton("Use this local engine", "button primary", async () => {
        libraryEndpoint = libraryRuntime.endpoint;
        libraryTab = "installed";
        await renderModelLibrary();
      }),
    );
  if (libraryRuntime?.installed) {
    const max = elem("input");
    max.type = "number";
    max.min = "1";
    max.max = "64";
    max.value = String(settings.maxLoaded || 3);
    max.setAttribute("aria-label", "Maximum loaded models");
    c.append(
      elem(
        "p",
        "muted",
        "Maximum models kept loaded by the engine started here. Each model consumes RAM/VRAM; the engine can evict models when memory is insufficient. Existing external engines keep their own settings.",
      ),
      max,
    );
    row.append(
      libraryButton("Start local engine", "button", async () => {
        libraryMessage("Starting engine…");
        settings.maxLoaded = Number(max.value);
        const result = await native("modelLibrary", {
          operation: "start",
          maxLoaded: settings.maxLoaded,
        });
        libraryEndpoint = result.endpoint;
        libraryRuntime = await native("modelLibrary", { operation: "status" });
        scheduleSave();
        libraryTab = "installed";
        await renderModelLibrary();
      }),
    );
  }
  if (libraryRuntime?.managedRunning)
    row.append(
      libraryButton("Stop managed engine", "button", async () => {
        if (busy) return toast("Wait for the current task.");
        await native("modelLibrary", { operation: "stop" });
        libraryRuntime = await native("modelLibrary", { operation: "status" });
        await renderModelLibrary();
      }),
    );
  row.append(
    libraryButton(
      libraryRuntime?.installed
        ? "Review engine update"
        : "Install local engine",
      "button",
      async () => {
        libraryMessage("Checking the official Ollama package…");
        const plan = await native("modelLibrary", { operation: "plan" });
        const review = $("modelLibraryReview");
        review.replaceChildren();
        review.append(
          elem("h3", "", "Install Ollama " + plan.version + "?"),
          elem(
            "p",
            "muted",
            `${readableBytes(plan.size)} · official github.com/ollama/ollama release. SHA-256 is verified before extraction. Installed in this app’s private data folder, with no administrator service or automatic model download. Current Ollama installations are left in place.`,
          ),
          elem("code", "library-digest", plan.sha256),
        );
        libraryActions(review).append(
          libraryButton("Cancel", "button", () => review.replaceChildren()),
          libraryButton("Install this engine", "button primary", async () => {
            await native("modelLibrary", {
              operation: "install",
              plan: plan.id,
            });
            review.replaceChildren();
            pollLibraryJobs();
          }),
        );
      },
    ),
  );
  const endpoint = elem("input");
  endpoint.value = libraryEndpoint || "http://localhost:11434";
  endpoint.setAttribute("aria-label", "Local engine URL");
  const custom = libraryCard(
    "Connect an existing local Ollama engine",
    "Use a local address. Remote and cloud APIs belong in Connections.",
  );
  libraryActions(custom).append(
    endpoint,
    libraryButton("Connect", "button", async () => {
      libraryEndpoint = endpoint.value.trim();
      await libraryRequest("version");
      libraryTab = "installed";
      await renderModelLibrary();
    }),
  );
  c.append(
    elem(
      "p",
      "muted",
      "Models downloaded into a CyMalika-managed runtime stay on disk when you quit. Only the engine process started by CyMalika is stopped on exit. External Ollama processes are never stopped. Linux runtime extraction needs tar and zstd; GPU drivers are supplied by your system.",
    ),
  );
}
async function pollLibraryJobs() {
  clearTimeout(libraryPoll);
  if (libraryLoading) {
    libraryPoll = setTimeout(pollLibraryJobs, 750);
    return;
  }
  libraryLoading = true;
  let active = false;
  try {
    const jobs = await native("modelLibrary", { operation: "jobs" });
    const area = $("modelLibraryJobs");
    area.replaceChildren();
    for (const j of jobs) {
      const card = elem("div", "library-job");
      card.append(
        elem("strong", "", j.name),
        elem("span", "muted", j.state + " · " + j.status),
      );
      if (j.state === "running") {
        active = true;
        const progress = elem("progress");
        if (j.total > 0) {
          progress.max = j.total;
          progress.value = Math.min(j.completed, j.total);
        }
        progress.setAttribute("aria-label", "Download progress for " + j.name);
        card.append(
          progress,
          elem(
            "small",
            "muted",
            j.total > 0
              ? readableBytes(j.completed) + " / " + readableBytes(j.total)
              : "Waiting for engine progress…",
          ),
          libraryButton("Cancel download", "button", async () => {
            await native("modelLibrary", { operation: "cancel", id: j.id });
            pollLibraryJobs();
          }),
        );
      }
      if (j.state === "complete" && !completedLibraryJobs.has(j.id)) {
        completedLibraryJobs.add(j.id);
        libraryRuntime = await native("modelLibrary", { operation: "status" });
        if ($("modelLibraryDialog").open) await renderModelLibrary();
        if (j.kind === "model" && settings.provider === "ollama")
          await refreshModels();
      }
      area.append(card);
    }
  } catch (e) {
    libraryMessage(e.message, true);
  } finally {
    libraryLoading = false;
    if (active) libraryPoll = setTimeout(pollLibraryJobs, 750);
  }
}
function initModelLibrary() {
  paintIdentity();
  paintConnections();
  $("openModelLibrary").onclick = () => openModelLibrary();
  $("settingsModelLibrary").onclick = () => {
    $("settingsDialog").close();
    openModelLibrary("download");
  };
  $("connectionSelect").onchange = () => {
    const p = desk.profiles.find((x) => x.id === $("connectionSelect").value);
    if (p) useConnection(p).catch(failure);
  };
  all("[data-library-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        libraryTab = b.dataset.libraryTab;
        renderModelLibrary().catch((e) => libraryMessage(e.message, true));
      }),
  );
}
