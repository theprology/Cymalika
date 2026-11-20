const { BrowserWindow } = require("electron");
const { randomUUID } = require("node:crypto");
class Browser {
  constructor(workspace, parent) {
    this.workspace = workspace;
    this.parent = parent;
    this.window = null;
    this.snapshot = "";
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
        title: "Cipher Browser",
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          partition: "cipher-browser-" + randomUUID(),
        },
      }));
      const wc = win.webContents;
      wc.setWindowOpenHandler(() => ({ action: "deny" }));
      wc.session.setPermissionRequestHandler((_wc, _permission, callback) =>
        callback(false),
      );
      wc.session.setPermissionCheckHandler(() => false);
      wc.session.on("will-download", (event) => event.preventDefault());
      for (const name of ["will-navigate", "will-redirect"])
        wc.on(name, (event, destination) => {
          try {
            this.check(destination);
          } catch {
            event.preventDefault();
          }
        });
      wc.on("did-start-navigation", () => {
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
      `(()=>{const nodes=[...document.querySelectorAll('button,a,input,textarea,select,[role="button"]')].filter(e=>e.getClientRects().length).slice(0,100);window.__cipherBrowserElements=nodes;return {url:location.href,title:document.title,text:document.body.innerText.slice(0,12000),elements:nodes.map((e,i)=>({id:String(i),role:e.tagName.toLowerCase(),label:(e.getAttribute('aria-label')||e.innerText||e.getAttribute('placeholder')||'').slice(0,200),value:e.type==='password'?'[redacted]':String(e.value||'').slice(0,500)}))}})()`,
    );
    return { ...data, snapshot: this.snapshot };
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
      `(()=>{const a=${args},e=window.__cipherBrowserElements?.[a.element];if(!e||!e.isConnected||!e.getClientRects().length||e.type==='password'||e.type==='file')throw Error('Choose a visible non-sensitive element from a fresh snapshot.');if(a.operation==='fill'){if(!['INPUT','TEXTAREA'].includes(e.tagName))throw Error('Choose a text field.');const setter=Object.getOwnPropertyDescriptor(e.tagName==='INPUT'?HTMLInputElement.prototype:HTMLTextAreaElement.prototype,'value').set;setter.call(e,a.text);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}else e.click();return {status:'performed',url:location.href}})()`,
    );
  }
  async capture() {
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
    this.snapshot = "";
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
  }
}
module.exports = { Browser };
