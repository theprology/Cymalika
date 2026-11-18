# Using Cipher

## Your first task

Keep Ollama running. Open Settings, choose Ollama, use `http://localhost:11434`, and select an installed model. Cipher does not install models. Run Check your model before relying on agent tools. Open your project folder and begin with Ask to explore its structure. Plan creates a draft with steps and acceptance checks; reviewing it authorizes a plan, not subsequent saves or commands. Build can propose those actions for review.

A useful request is: “Find the relevant files yourself, make this change, preserve unrelated work, and run the existing checks.” Review the actual diff and command before approving. A model can make mistakes even after a successful compatibility check.

## Files and recovery

The index includes up to 5,000 non-hidden files, excludes common build/dependency directories, and is not a semantic index or complete `.gitignore` interpreter. Reads and edits support UTF-8 files up to 1 MB. Existing files require a read hash before a proposed edit. Changed files reject stale proposals. Checkpoints undo a save only if the current file still matches that save. Commands have a 60-second deadline; deliberately detached descendants may need manual cleanup.

## Plans, goals, and memory

Workbench contains plans, goals, resources, and project memory. Goals track milestones and evidence between conversations; they do not silently schedule background work. Only you mark a goal complete. Resources start empty: add UTF-8 text references or skills, then enable them for the intended scope. Imports start disabled. Resources have size limits and are loaded on demand; PDF and Word extraction are not included. Project memory is sent with that project's tasks.

## Browser and app access

In Workbench → Access, enable Browser and add exact origins such as `http://localhost:3000`. Review opening and interacting with pages. Browser sessions are temporary. Remote pages receive no Cipher application bridge. Normal web subresources still load, so origin limits are not a network firewall.

In the native Mac app, grant Accessibility in System Settings, then enable computer tools and choose allowed running apps inside Cipher. Screen Recording is needed for window captures. Approve one action at a time. Passwords, payments, OS permission dialogs, security warnings, and irreversible confirmations should be handled by you. Some apps expose limited accessibility information. Updates to locally signed builds can require refreshing macOS permissions.

Windows/Linux currently provide browser tools, not control of other desktop applications. The interface explains this instead of offering unsupported controls.

## Git and connections

Open the repository's top-level folder. Git must be installed. Cipher can inspect status/diffs/history, create a branch, and commit selected files after review. It refuses a commit when unrelated changes are already staged. App-managed commits disable hooks and signing; use your regular workflow if these are required. Nothing is pushed automatically.

HTTP MCP supports the revisions shown in Connections and a focused set of tools/resource methods. It does not implement stdio transport, OAuth, sampling, or every server feature. Supply a session token if needed and review external calls. Imported tool descriptions and resources are untrusted content, not permission grants.

## Troubleshooting

- **Cannot connect:** check Ollama is running and the endpoint is correct. Remote APIs require HTTPS; plain HTTP is limited to localhost.
- **Model says it cannot edit:** run Check your model and try native or text-action protocol. Tool reliability depends on the model.
- **Context exceeded:** start a new chat or increase the context budget to one your model can support. Desktop/browser snapshots are bounded and older snapshots compact automatically.
- **Git commit failed:** inspect the output and staging area. Cipher does not silently fix identity, hooks, or repository configuration.
- **Task stopped:** inspect the actual file/browser/app state. Stop does not reverse completed actions.
- **Permission stopped working after update:** remove/re-add the installed Cipher app in the relevant Mac privacy settings, then allow intended apps inside Cipher again.

API keys remain session-only. Export useful conversations from Activity log before clearing history. Keep backups of important projects; checkpoints do not replace version control.
