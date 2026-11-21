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
  return (value / scale).toFixed(1) + (scale === 1024 ** 3 ? " GB" : " MB");
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
    if (!libraryEndpoint && tab === "download") libraryTab = "engine";
    await renderModelLibrary();
    pollLibraryJobs();
  } catch (e) {
    libraryMessage(e.message, true);
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
function renderLibraryDownloads() {
  libraryMessage(
    "Downloads begin only after you review and confirm. Model formats, licenses, hardware and tool support vary.",
  );
  const search = elem("div", "library-search");
  const source = elem("select");
  source.setAttribute("aria-label", "Model source");
  for (const [v, t] of [
    ["ollama", "Ollama model ID"],
    ["huggingface", "Hugging Face · public GGUF"],
  ])
    source.append(new Option(t, v));
  const query = elem("input");
  query.placeholder = "Model ID, or search Hugging Face…";
  query.setAttribute("aria-label", "Find a model");
  const go = libraryButton("Find model", "button primary", async () => {
    if (source.value === "ollama")
      return reviewModelDownload(query.value, "Ollama registry");
    const searchEpoch = libraryViewEpoch;
    libraryMessage("Searching Hugging Face GGUF repositories…");
    const results = await native("request", {
      url:
        "https://huggingface.co/api/models?filter=gguf&limit=12&full=true&cardData=true&search=" +
        encodeURIComponent(query.value.trim()),
      method: "GET",
    });
    if (searchEpoch !== libraryViewEpoch) return;
    if (!Array.isArray(results))
      throw Error("The model directory returned an invalid response.");
    $("modelSearchResults").replaceChildren();
    for (const m of results) {
      if (!/^[\w.-]+\/[\w.-]+$/.test(m.id || "")) continue;
      const c = elem("article", "library-model-card");
      c.append(
        elem("strong", "", m.id),
        elem(
          "p",
          "muted",
          `${Number(m.downloads || 0).toLocaleString()} downloads · License: ${String(m.cardData?.license || "see model card")} ${m.gated ? "· Gated model" : ""}`,
        ),
      );
      const quant = elem("input");
      quant.value = "Q4_K_M";
      quant.placeholder = "Quantization (for example Q4_K_M)";
      quant.setAttribute("aria-label", "Quantization for " + m.id);
      const a = libraryActions(c);
      a.append(
        libraryButton("Read model card", "button", async () => {
          const data = await native("request", {
            url: "https://huggingface.co/" + m.id + "/raw/main/README.md",
            method: "GET",
          });
          const cardText = elem(
            "pre",
            "library-model-readme",
            String(data.text || "No model card text returned.").slice(0, 40000),
          );
          c.append(cardText);
        }),
        quant,
        libraryButton(
          m.gated ? "Requires Hugging Face access" : "Review download",
          "button primary",
          () =>
            reviewModelDownload(
              "hf.co/" + m.id + ":" + (quant.value.trim() || "Q4_K_M"),
              "Hugging Face · " + m.id,
              String(m.cardData?.license || "See the model card"),
            ),
        ),
      );
      $("modelSearchResults").append(c);
    }
    libraryMessage(
      results.length
        ? "Choose a quantization supported by the repository. Public GGUF models can be downloaded through Ollama."
        : "No matching public GGUF repositories found.",
    );
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
      "div",
      "library-help",
      "Ollama accepts model IDs such as qwen3:8b. Hugging Face downloads use hf.co/owner/GGUF-repository:quantization. Private/gated repositories need access configured with the provider; arbitrary Safetensors files cannot run directly in Ollama.",
    ),
  );
  const results = elem("div");
  results.id = "modelSearchResults";
  $("modelLibraryBody").append(results);
  const prompt = libraryCard(
    "Already know the model ID?",
    "Choose Ollama model ID above, enter the exact ID, and review the download. There is no automatic model replacement.",
  );
  libraryActions(prompt).append(
    libraryButton("Open Hugging Face search", "button", () => {
      source.value = "huggingface";
      query.focus();
    }),
  );
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
  const body = $("modelLibraryBody");
  const info = libraryCard(
    "Your models, your connections",
    "Keep local models, LM Studio/llama.cpp/vLLM servers, OpenAI-compatible services and Anthropic connections side by side. A compatible API is required; model capabilities still determine available features.",
  );
  const name = elem("input");
  name.placeholder = "Connection name";
  name.setAttribute("aria-label", "Connection name");
  libraryActions(info).append(
    name,
    libraryButton("Save current connection", "button primary", () => {
      if (busy) return toast("Wait for the current task.");
      if (!name.value.trim())
        return libraryMessage("Give this connection a name.", true);
      const p = {
        id: crypto.randomUUID(),
        name: name.value.trim().slice(0, 80),
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
    libraryButton("Add / edit connection", "button", () => {
      $("modelLibraryDialog").close();
      settingsOpen();
    }),
  );
  for (const p of desk.profiles) {
    const c = libraryCard(
      p.name,
      `${p.settings.model} · ${p.settings.provider} · ${p.settings.endpoint}`,
    );
    libraryActions(c).append(
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
  body.append(
    elem(
      "p",
      "muted",
      "Connection keys stay in memory for this app session. They are never saved in connection profiles or chat history.",
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
