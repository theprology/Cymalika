const { BrowserWindow } = require("electron");
const { randomUUID } = require("node:crypto");
class Browser {
  constructor(workspace, parent) {
    this.workspace = workspace;
    this.parent = parent;
    this.window = null;
    this.snapshot = "";
    this.secrets = new Set();
    this.pendingPermissions = new Map();
    this.permissionGrants = new Set();
  }
  check(raw) {
    this.workspace.require("browser");
    const u = new URL(raw);
    if (
      !["http:", "https:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      (!this.workspace.fullComputer && !this.workspace.origins.has(u.origin))
    )
      throw Error("Enable this website origin in Access first.");
    return u.href;
  }
  async open(raw) {
    const url = this.check(raw);
    if (!this.window || this.window.isDestroyed()) {
      const win = (this.window = new BrowserWindow({
        width: 1100,
        height: 800,
        title: "CyMalika Browser",
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          partition: "cymalika-browser-" + randomUUID(),
        },
      }));
      const wc = win.webContents;
      wc.setWindowOpenHandler(() => ({ action: "deny" }));
      wc.session.setPermissionRequestHandler(
        (sender, permission, callback, details = {}) => {
          try {
            const url = new URL(this.check(wc.getURL()));
            const origin = new URL(
              details.requestingUrl || details.securityOrigin || url.href,
            ).origin;
            if (
              sender !== wc ||
              origin !== url.origin ||
              !["notifications", "geolocation", "media"].includes(permission) ||
              (permission === "media" &&
                (!details.mediaTypes?.length ||
                  details.mediaTypes.some(
                    (type) => !["audio", "video"].includes(type),
                  ))) ||
              this.pendingPermissions.size >= 8
            )
              return callback(false);
            const id = randomUUID();
            this.pendingPermissions.set(id, {
              id,
              origin,
              permission,
              media: details.mediaTypes || [],
              callback,
            });
          } catch {
            callback(false);
          }
        },
      );
      wc.session.setPermissionCheckHandler(
        (sender, permission, origin, details = {}) => {
          try {
            if (sender !== wc) return false;
            const key = new URL(origin).origin + ":" + permission;
            return permission === "media"
              ? ["audio", "video"].includes(details.mediaType) &&
                  this.permissionGrants.has(key + ":" + details.mediaType)
              : this.permissionGrants.has(key);
          } catch {
            return false;
          }
        },
      );
      wc.session.on("will-download", (event) => event.preventDefault());
      for (const name of ["will-navigate", "will-redirect"])
        wc.on(name, (event, destination) => {
          try {
            this.check(destination);
          } catch {
            event.preventDefault();
          }
        });
      wc.on("did-start-navigation", (_event, _url, _inPlace, isMainFrame) => {
        if (isMainFrame !== false) this.denyPermissions();
        this.snapshot = "";
      });
      wc.on("will-attach-webview", (event) => event.preventDefault());
    }
    await this.window.loadURL(url);
    this.window.show();
    return { url: this.window.webContents.getURL() };
  }
  page() {
    if (!this.window || this.window.isDestroyed())
      throw Error("Open a browser page first.");
    this.check(this.window.webContents.getURL());
    return this.window.webContents;
  }
  async read() {
    const wc = this.page();
    this.snapshot = randomUUID();
    const data = await wc.executeJavaScript(
      `(()=>{const nodes=[...document.querySelectorAll('button,a,input,textarea,select,[role="button"]')].filter(e=>e.getClientRects().length).slice(0,100);window.__cymalikaBrowserElements=nodes;const secrets=[...document.querySelectorAll('input[type=password]')].map(e=>e.value).filter(Boolean);const redact=s=>secrets.reduce((v,p)=>v.split(p).join('[redacted]'),String(s));return {url:location.href,title:document.title,text:redact(document.body.innerText).slice(0,12000),elements:nodes.map((e,i)=>({id:String(i),role:e.tagName.toLowerCase(),label:redact(e.getAttribute('aria-label')||e.innerText||e.getAttribute('placeholder')||'').slice(0,200),secure:e.type==='password',filled:e.type==='password'?!!e.value:undefined,value:e.type==='password'?'[redacted]':String(e.value||'').slice(0,500)}))}})()`,
    );
    const safe = JSON.parse(
      JSON.stringify(data, (_k, v) =>
        typeof v === "string"
          ? [...this.secrets].reduce((s, p) => s.split(p).join("[redacted]"), v)
          : v,
      ),
    );
    return {
      ...safe,
      permissions: [...this.pendingPermissions.values()].map(
        ({ id, origin, permission, media }) => ({
          id,
          origin,
          permission,
          media,
        }),
      ),
      snapshot: this.snapshot,
    };
  }
  async action(a) {
    const wc = this.page();
    if (
      !this.snapshot ||
      a.snapshot !== this.snapshot ||
      !/^\d{1,3}$/.test(a.element)
    )
      throw Error("Read a fresh page snapshot first.");
    if (
      !["click", "fill"].includes(a.operation) ||
      String(a.text || "").length > 10000
    )
      throw Error("Invalid browser action.");
    const args = JSON.stringify({
      element: Number(a.element),
      operation: a.operation,
      text: a.text || "",
    });
    this.snapshot = "";
    return wc.executeJavaScript(
      `(()=>{const a=${args},e=window.__cymalikaBrowserElements?.[a.element];if(!e||!e.isConnected||!e.getClientRects().length||e.type==='password'||e.type==='file')throw Error('Choose a visible non-sensitive element from a fresh snapshot.');if(a.operation==='fill'){if(!['INPUT','TEXTAREA'].includes(e.tagName))throw Error('Choose a text field.');const setter=Object.getOwnPropertyDescriptor(e.tagName==='INPUT'?HTMLInputElement.prototype:HTMLTextAreaElement.prototype,'value').set;setter.call(e,a.text);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}else e.click();return {status:'performed',url:location.href}})()`,
    );
  }
  denyPermissions(clearGrants = true) {
    const pending = [...this.pendingPermissions.values()];
    this.pendingPermissions.clear();
    if (clearGrants) this.permissionGrants.clear();
    for (const request of pending) request.callback(false);
  }
  permissionDetails(a) {
    const origin = new URL(this.page().getURL()).origin,
      request = this.pendingPermissions.get(a.id);
    if (!request || a.snapshot !== this.snapshot || request.origin !== origin)
      throw Error(
        "Read the current page and choose its pending permission request.",
      );
    return {
      id: request.id,
      origin,
      permission: request.permission,
      media: request.media,
    };
  }
  permission(a) {
    const details = this.permissionDetails(a),
      request = this.pendingPermissions.get(a.id);
    if (typeof a.allow !== "boolean") throw Error("Choose allow or deny.");
    if (
      details.permission === "media" &&
      (!details.media?.length ||
        details.media.some((type) => !["audio", "video"].includes(type)))
    )
      throw Error("Unsupported media scope.");
    this.pendingPermissions.delete(a.id);
    this.snapshot = "";
    if (a.allow) {
      const key = details.origin + ":" + details.permission;
      if (details.permission === "media")
        for (const type of details.media)
          this.permissionGrants.add(key + ":" + type);
      else this.permissionGrants.add(key);
    }
    request.callback(a.allow);
    return {
      status: "decision_sent",
      allow: a.allow,
      ...details,
      next: "Read the page to check the outcome. The operating system may still require direct user approval.",
    };
  }
  async fillPassword(a) {
    const wc = this.page(),
      snapshot = this.snapshot,
      url = wc.getURL();
    if (!snapshot || a.snapshot !== snapshot || !/^\d{1,3}$/.test(a.element))
      throw Error("Read a fresh browser snapshot first.");
    const element = Number(a.element);
    const valid = await wc.executeJavaScript(
      `(()=>{const e=window.__cymalikaBrowserElements?.[${element}];return !!(e&&e.isConnected&&e.type==='password'&&e.getClientRects().length)})()`,
    );
    if (!valid) throw Error("Choose an inspected password field.");
    let secret = await this.passwordPrompt?.(
      "Website: " +
        new URL(url).origin +
        "\nPassword field " +
        a.element +
        "\n" +
        (a.reason || ""),
    );
    if (secret === null || secret === undefined) return { status: "rejected" };
    try {
      if (
        this.window?.isDestroyed() ||
        this.snapshot !== snapshot ||
        this.page() !== wc ||
        wc.getURL() !== url
      )
        throw Error("Target changed while awaiting approval.");
      this.snapshot = "";
      this.secrets.add(secret);
      const result = await wc.executeJavaScript(
        `(()=>{if(location.href!==${JSON.stringify(url)})throw Error('Target changed');const e=window.__cymalikaBrowserElements?.[${element}];if(!e||!e.isConnected||e.type!=='password'||!e.getClientRects().length)throw Error('Field changed');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(secret)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return {status:'filled',submitted:false}})()`,
      );
      return result;
    } catch {
      throw Error(
        "Password was not filled: the target changed, access was revoked, or the field rejected entry. Inspect it again.",
      );
    } finally {
      secret = null;
    }
  }
  async capture() {
    if (this.secrets.size)
      throw Error(
        "Use redacted text snapshots after password entry; close this browser session before requesting images.",
      );
    const wc = this.page(),
      image = await wc.capturePage(),
      size = image.getSize();
    return {
      mime: "image/png",
      data: image.toPNG().toString("base64"),
      ...size,
      url: wc.getURL(),
      name: "Browser page",
    };
  }
  close() {
    this.denyPermissions();
    this.snapshot = "";
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
    this.secrets.clear();
  }
}
module.exports = { Browser };
