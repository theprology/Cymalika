# Using CyMalika

## Your first task

Open **Models & downloads** to select your installed model, or use **Local engine** and **Get models** to install an engine and download a model inside CyMalika. Existing Ollama users can keep their current installation at `http://localhost:11434`. Run Check your model before relying on agent tools. Open your project folder and begin with Ask to explore its structure. Plan creates a draft with steps and acceptance checks; reviewing it authorizes a plan, not subsequent saves or commands. Build can propose those actions for review.

A useful request is: “Find the relevant files yourself, make this change, preserve unrelated work, and run the existing checks.” Review the actual diff and command before approving. A model can make mistakes even after a successful compatibility check.

## Files and recovery

The index includes up to 5,000 non-hidden files, excludes common build/dependency directories, and is not a semantic index or complete `.gitignore` interpreter. Reads and edits support UTF-8 files up to 1 MB. Existing files require a read hash before a proposed edit. Changed files reject stale proposals. Checkpoints undo a save only if the current file still matches that save. Commands have a 60-second deadline; deliberately detached descendants may need manual cleanup.

## Plans, goals, and memory

More tools contains plans, goals, resources, and project memory. Goals track milestones and evidence between conversations; they do not silently schedule background work. Only you mark a goal complete. Resources start empty: add UTF-8 text references or skills, then enable them for the intended scope. Imports start disabled. Resources have size limits and are loaded on demand; PDF and Word extraction are not included. Project memory is sent with that project's tasks.

## Computer access: one switch

1. Keep your existing model selected. Turn on **Computer access** at the top of the sidebar.
2. Describe the result in chat. You do not need to choose every app, configure website origins, select a coding project, or attach each file.
3. Review proposed saves, commands, app launches, clicks, and typing in the conversation. Reads and browser navigation can happen automatically during the task.
4. Use **Stop** to interrupt a task. Turn **Computer access off** to cancel pending work, close CyMalika Browser, and disconnect app, browser, and user-file tools. Approved changes already made remain in place.

For example: “Research a topic online and save a report in Documents,” or “Find my meeting notes in Documents and save a short summary in a new file.” Ask specifies read-only help; Plan explores and proposes steps; Build can request changes.

Computer access lasts only for the current session and resets when CyMalika quits or reloads. It uses your existing model without downloading or switching models. App/file contents are shared with the selected model, so choose a provider you trust. If Ollama reports image support for your selected model, window-image tools are available in this mode; models without image support can still use accessible text and file/browser tools.

File tools browse ordinary folders inside your home directory, including Documents, Desktop and Downloads. Hidden folders, credential stores, symbolic-link escapes and system locations are excluded. Text reads are bounded; approved terminal commands can handle tasks outside those direct tools and run with your normal account permissions. This is not administrator access or a bypass of macOS, Windows or Linux permissions.

On Mac, app control needs Accessibility permission; captures additionally need Screen Recording. Windows uses UI Automation and Linux uses AT-SPI; X11 provides pointer/key tools and capture, while Wayland support depends on exposed accessibility controls. Some apps do not expose everything a model needs. Passwords, payments, permission prompts, legal agreements, security warnings and irreversible actions need you. See [computer access](COMPUTER_USE.md) for details.

**Access details** explains the switch. Individual capability controls remain in More tools → Access when Computer access is off.

## Git and connections

Open the repository's top-level folder. Git must be installed. CyMalika can inspect status/diffs/history, create a branch, and commit selected files after review. It refuses a commit when unrelated changes are already staged. App-managed commits disable hooks and signing; use your regular workflow if these are required. Nothing is pushed automatically.

HTTP MCP supports the revisions shown in Connections and a focused set of tools/resource methods. It does not implement stdio transport, OAuth, sampling, or every server feature. Supply a session token if needed and review external calls. Imported tool descriptions and resources are untrusted content, not permission grants.

## Troubleshooting

- **Cannot connect:** check Ollama is running and the endpoint is correct. Remote APIs require HTTPS; plain HTTP is limited to localhost.
- **Model says it cannot edit:** run Check your model and try native or text-action protocol. Tool reliability depends on the model.
- **Context exceeded:** start a new chat or increase the context budget to one your model can support. Desktop/browser snapshots are bounded and older snapshots compact automatically.
- **Git commit failed:** inspect the output and staging area. CyMalika does not silently fix identity, hooks, or repository configuration.
- **Task stopped:** inspect the actual file/browser/app state. Stop does not reverse completed actions.
- **Permission stopped working after update:** remove/re-add the installed CyMalika app in the relevant Mac privacy settings, then turn Computer access on again.

API keys remain session-only. Export useful conversations from Activity log before clearing history. Keep backups of important projects; checkpoints do not replace version control.

## Task feedback

Edits, commands, and computer actions appear as approval cards directly in the conversation. Review the proposed change, then approve or reject it. Rejected actions are not retried automatically. Activity is an optional detail panel. Files are discovered automatically within your selected project; attaching each file is unnecessary.

CyMalika retries a chat-only response up to twice when a task asks for action. If the model still does not use tools, CyMalika reports that nothing happened. This improves recovery but does not guarantee the same ability as Codex; task success still depends on the selected model and must be checked against actual edits and test results. No model is downloaded or replaced by this flow.
