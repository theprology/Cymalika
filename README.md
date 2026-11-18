<div align="center">

# Cipher

### Your models. Your workspace.

A calm, open-source desktop workspace for reading, writing, and improving code with the models you choose.

**Local Ollama · Compatible APIs · Reviewed actions · Three themes**

[Beginner walkthrough](docs/WALKTHROUGH.md) · [Getting started](#get-started) · [Features](#a-workspace-that-does-more) · [Build](#build-from-source) · [Roadmap](docs/ROADMAP.md) · [MIT license](LICENSE)

</div>

---

Cipher brings conversations, project files, plans, and tools into one desktop app. Open your project, choose an installed model, and describe what you want to build. Cipher gives the model tools to find relevant files, propose edits, and request checks. You review actions before they run.

No Cipher account, subscription, or model download is required. Cloud providers may charge for their APIs. Cipher never downloads or silently switches models.

## Get started

1. Install Cipher from [Releases](https://github.com/theprology/cipher/releases). Check the release notes for available installers and verification status.
2. Run Ollama with a model you already have, or open **Settings → Model connection** to connect an API.
3. Choose **Open project** and select your source folder.
4. Run **Check your model** to verify a small tool exchange.
5. Choose **Ask**, **Plan**, or **Build** and describe your task.
6. Review proposed edits and commands in **Activity** before approving them.

Try: “Find how sign-in works, explain the relevant files, and propose a plan to improve its error messages.” Then review the plan and ask Cipher to build it.

You do not need to attach each file. The model can list and search the project and read relevant source on demand, within the configured limits.

Need a slower introduction? Click **Getting started** inside the app for the nine-step tour, or follow [the beginner walkthrough](docs/WALKTHROUGH.md). A printable [eight-page handbook](docs/Cipher-Beginners-Handbook.pdf) is also included.

## A workspace that does more

| Capability         | What you can do                                                        |
| ------------------ | ---------------------------------------------------------------------- |
| Conversations      | Read formatted Markdown, tables, and code; copy replies or code blocks |
| Project tools      | Find files, search source, read content, and review changes            |
| Checkpoints        | Undo an approved save when it will not overwrite newer work            |
| Ask / Plan / Build | Understand code, review structured plans, then implement               |
| Goals              | Track milestones, evidence, pause/resume, and reviewed completion      |
| Resources          | Add your own instructions, references, and reusable text materials     |
| Project memory     | Keep conventions and decisions with each project                       |
| Model profiles     | Save connection and generation settings without saving API keys        |
| Streaming          | Watch replies arrive from supported providers                          |
| Browser            | Inspect and interact with websites you explicitly allow                |
| Git                | Inspect changes, create branches, and review selected-file commits     |
| MCP                | Connect supported HTTP tools and text resources                        |
| Appearance         | Daylight, After hours, and Hacker themes; adjustable text size         |
| Mac computer tools | Inspect allowed apps, approve actions, and request window capture      |

## Platform support

| Platform                | App                                        | Status                                 |
| ----------------------- | ------------------------------------------ | -------------------------------------- |
| macOS 13+ Apple Silicon | Native Swift / WebKit app                  | Installed and tested locally           |
| Windows x64             | Electron `.exe` installer and portable app | Build pipeline; see release validation |
| Linux x64               | Electron AppImage and Debian package       | Build pipeline; see release validation |

The Windows and Linux versions share the interface, model adapters, and agent loop. Their backend provides coding, Git, streaming, and browser tools. **Control of other desktop applications is currently Mac-only.** Do not assume desktop automation parity between platforms. Windows/Linux installers are unsigned unless a release explicitly says otherwise. Mac builds are locally signed and not Apple-notarized.

## Bring your own model

- **Ollama:** `http://localhost:11434`
- **OpenAI-compatible endpoints:** enter the API base URL, including its prefix such as `/v1`.
- **Anthropic:** use its API endpoint and your session API key.

Native tool calls are preferred. Text actions offer a fallback for some models without native tools. Compatibility depends on the model and endpoint; connecting successfully does not guarantee reliable autonomous coding. Image support is opt-in for models that accept images.

## Your workspace, your decisions

File edits, commands, browser actions, Mac app actions, and external tool calls require review. Ask and Plan are read-only for project changes. Browser, computer, and extension access reset to off on restart.

File tools stay inside the selected project and exclude symbolic-link paths and common credential files. Commands run as your user and **are not confined to the project folder**. Review the exact command before approving it. Stop cancels pending work and requests process termination; it cannot undo actions already performed.

Chats, non-secret settings, and checkpoints stay in local application data. They can contain source code and output and are not encrypted. Session API keys and attached image bytes are excluded from saved chat state. The model endpoint you select receives the context you send. MCP endpoints and allowed websites receive their respective requests. There is no built-in analytics service or automatic updater.

See [the user guide](docs/USER_GUIDE.md) for limits and setup, and [validation](docs/VALIDATION.md) for tested paths and outstanding checks.

## Build from source

Requirements: Node.js 24+, npm, and Git. Native Mac builds additionally need Xcode command-line tools and Python 3.

```sh
npm ci
npm test
```

**Native Mac app**

```sh
./build.sh
# build/Cipher.app
```

Set `CIPHER_ARCH=x86_64` to compile an Intel target; the local runtime validation covers Apple Silicon.

**Windows / Linux desktop development**

```sh
npm start
```

Build on the target operating system:

```sh
npm run dist:win
npm run dist:linux
```

Installers appear in `dist/`. GitHub Actions runs tests and produces platform artifacts. Tagged builds prepare a draft release after all configured platform jobs succeed. Existing releases are left unchanged.

## Contribute

Bug reports, accessibility improvements, platform testing, and focused pull requests are welcome. Include your operating system, Cipher version, provider/model, reproduction steps, and sanitized logs. Never include API keys or private project contents.

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Cipher is free to use, modify, and redistribute under the [MIT license](LICENSE). Model weights and third-party services retain their own licenses and terms.
