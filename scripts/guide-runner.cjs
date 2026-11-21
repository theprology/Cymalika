const fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
module.exports = async ({ win, workspace, modelLibrary, out, data }) => {
  const frames = path.join(out, "captures");
  await fs.mkdir(frames, { recursive: true });
  const manifest = [];
  const ui = (code) =>
    win.webContents.executeJavaScript(
      "(async()=>{try{" +
        code +
        "}catch(e){console.error(e.stack);throw e}})()",
    );
  win.webContents.on("console-message", (_event, details) =>
    console.log("Guide renderer:", details.message || details),
  );
  const wait = async (expression) => {
    for (let i = 0; i < 100; i++) {
      if (await ui("return (" + expression + ")")) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error("Guide state did not settle: " + expression);
  };
  const capture = async (name, label, type = "actual renderer") => {
    await new Promise((r) => setTimeout(r, 150));
    const image = await win.webContents.capturePage();
    const file = path.join(frames, name + ".png");
    await fs.writeFile(file, image.toPNG());
    manifest.push({ name, label, type, file });
    console.log("Captured", name);
  };
  await wait("!!current && !!settings.model");
  await ui(
    `$('tourDialog').open && $('tourDialog').close(); settings.tourSeen=true;settings.theme='dark';settings.coffeeColour=1;setTheme('dark');paintCoffee();paintIdentity();inspector(false);`,
  );
  await capture("01-welcome", "Your first screen");
  await ui(`await openModelLibrary();`);
  await capture("02-existing-model", "If Ollama is already installed");
  // A first-time setup view is explicitly identified as an illustration in the media.
  await ui(
    `libraryRuntime=await native('modelLibrary',{operation:'status'});libraryRuntime={...libraryRuntime,installed:false,endpoint:null,managedRunning:false};libraryTab='engine';await renderModelLibrary();`,
  );
  await capture(
    "03-new-engine",
    "Starting from scratch",
    "fresh-install illustration",
  );
  await ui(
    `window.__guidePlan=await native('modelLibrary',{operation:'plan'});const r=$('modelLibraryReview');r.replaceChildren();r.append(elem('h3','','Install Ollama '+__guidePlan.version+'?'),elem('p','muted',readableBytes(__guidePlan.size)+' · Official Ollama runtime. Verified with SHA-256 before installation. No model is downloaded yet.'));libraryActions(r).append(libraryButton('Cancel','button',()=>r.replaceChildren()),libraryButton('Install this engine','button primary',()=>{}));`,
  );
  await capture(
    "04-engine-review",
    "Review the local engine download",
    "review only; installation not executed",
  );
  await ui(
    `libraryRuntime=await native('modelLibrary',{operation:'status'});libraryEndpoint=libraryRuntime.endpoint;libraryTab='download';await renderModelLibrary();`,
  );
  await capture("05-get-model", "Choose a model");
  await ui(
    `reviewModelDownload('qwen3:4b','Ollama registry','Apache 2.0 · review the publisher’s model page');`,
  );
  await capture(
    "06-model-review",
    "Review the model download",
    "review only; model not downloaded",
  );
  await ui(
    `$('modelLibraryDialog').close();settingsOpen();all('[data-settings]').find(x=>x.dataset.settings==='appearance').click();$('assistantName').value='Atlas';`,
  );
  await capture("07-name", "Give your assistant a name");
  await ui(
    `settings.assistantName='Atlas';paintIdentity();$('settingsDialog').close();`,
  );
  const fixture = path.join(data, "Cipher-practice");
  await workspace.select(fixture);
  const files = await workspace.files();
  await ui(
    `await activateProject(${JSON.stringify({ path: fixture, name: "Cipher-practice", files })});await preview('src/pricing.py');`,
  );
  await capture("08-explorer", "Open and view your project");
  await ui(
    `closeFileViewer();newChat();$('welcome').classList.add('hidden');record('user','Create hello.txt containing "My assistant is working." Show me the change before saving. Do not run commands.');window.__guideHelloResult=null;approveEdit({path:'hello.txt',content:'My assistant is working.\\n',expected_hash:'',reason:'Prepared first-file exercise: create a small text file without running commands.'}).then(x=>window.__guideHelloResult=x);void 0;`,
  );
  await wait(
    `!!approval && $('messages').textContent.includes('Approve & save')`,
  );
  await capture(
    "22-first-file-review",
    "Your first file, without coding",
    "prepared teaching request; real approval UI",
  );
  await ui(
    `all('.inline-approval button').find(x=>x.textContent==='Approve & save').click();`,
  );
  await wait("!!window.__guideHelloResult");
  assert.equal(
    (await workspace.read("hello.txt")).content,
    "My assistant is working.\n",
  );
  await ui(`await preview('hello.txt');`);
  await capture(
    "23-first-file-saved",
    "Open your saved hello.txt",
    "actual disposable text-file creation",
  );
  await ui(`closeFileViewer();newChat();`);

  await ui(
    `closeFileViewer();setMode('ask');$('prompt').value='Explain what this project does in simple words. Do not change any files.';`,
  );
  await capture(
    "09-ask",
    "Start with a question",
    "prepared question; not a live inference capture",
  );
  await ui(
    `setMode('plan');$('prompt').value='Plan a fix for the basket total calculation. Find the relevant source and tests, but do not change anything yet.';`,
  );
  await capture(
    "10-plan",
    "Ask for a plan first",
    "prepared question; not a live inference capture",
  );
  const original = await workspace.read("src/pricing.py");
  assert(original.content.includes("return price + quantity"));
  const changed = original.content.replace(
    "return price + quantity",
    "return price * quantity",
  );
  await ui(
    `setMode('build');$('prompt').value='';$('welcome').classList.add('hidden');record('user','Fix the basket total calculation. Find the relevant source and tests yourself, then run the tests.');window.__guideEditResult=null;approveEdit(${JSON.stringify({ path: "src/pricing.py", content: changed, expected_hash: original.hash, reason: "Prepared teaching example: multiply the unit price by the quantity." })}).then(x=>window.__guideEditResult=x);void 0;`,
  );
  await wait(
    `!!approval && $('messages').textContent.includes('Approve & save')`,
  );
  await capture(
    "11-review-edit",
    "Review before saving",
    "prepared example edit; real approval UI",
  );
  await ui(
    `all('.inline-approval button').find(x=>x.textContent==='Approve & save').click();`,
  );
  await wait("!!window.__guideEditResult");
  assert((await workspace.read("src/pricing.py")).content === changed);
  await capture(
    "12-saved",
    "The approved file is saved",
    "actual disposable file save",
  );
  await ui(
    `window.__guideCommandResult=null;approveCommand({command:'python3 -m unittest discover -s tests -v',reason:'Run the practice project tests after the reviewed fix.'}).then(x=>window.__guideCommandResult=x);void 0;`,
  );
  await wait(`!!approval && $('messages').textContent.includes('Run command')`);
  await capture(
    "13-command",
    "Review a test command",
    "actual command approval UI",
  );
  await ui(
    `all('.command-card button').find(x=>x.textContent==='Run command').click();`,
  );
  await wait("!!window.__guideCommandResult");
  const result = await ui("return __guideCommandResult");
  assert.equal(result.exit_code, 0, result.output);
  assert(result.output.includes("Ran 2 tests"));
  await ui(`showPanel('terminal');inspector(true);`);
  await capture(
    "14-tests",
    "Read the actual test results",
    "real local test output",
  );
  await ui(`inspector(false);await preview('src/pricing.py');`);
  await capture("15-fixed-file", "Inspect the saved source", "real saved file");
  await ui(`closeFileViewer();hub('home');`);
  await capture("16-workbench", "Goals, plans and helpful resources");
  await ui(`$('workbenchDialog').close();hub('access');`);
  await capture(
    "17-computer",
    "Optional computer access",
    "access remains off; no OS grants requested",
  );
  await ui(
    `$('workbenchDialog').close();await openModelLibrary('connections');`,
  );
  await capture("18-connections", "Switch saved model connections");
  await ui(
    `$('modelLibraryDialog').close();settings.assistantName='Cipher';paintIdentity();chooseCoffeeColour(2);`,
  );
  await capture("19-colours", "Choose your app colour");
  await ui(`$('coffeeSwitch').checked=true;await toggleCoffee();`);
  await new Promise((r) => setTimeout(r, 3450));
  await capture("20-coffee", "Coffee keeps your computer awake");
  await new Promise((r) => setTimeout(r, 2200));
  await ui(
    `$('coffeeSwitch').checked=false;await toggleCoffee();$('helpButton').click();`,
  );
  await capture("21-tour", "Get help whenever you need it");
  await fs.writeFile(
    path.join(out, "manifest.json"),
    JSON.stringify(
      {
        version: require("../package.json").version,
        source: "Isolated copy of the actual Cipher renderer",
        modelDownloads: 0,
        runtimeDownloads: 0,
        modelInference: false,
        saveVerified: true,
        testResult: result,
        frames: manifest,
      },
      null,
      2,
    ),
  );
  return { guide: true, frames: manifest.length, exitCode: result.exit_code };
};
