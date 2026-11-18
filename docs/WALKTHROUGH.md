# Cipher: your first project, step by step

You do not need to be a programmer to follow this guide. Take one step at a time. If a proposed action is confusing, reject it and ask Cipher to explain.

Open **Getting started** near the bottom-left of Cipher to replay the guided tour. The printable handbook covers the same workflow in more detail.

## 1. Understand the two parts

**Your model** produces answers. **Cipher** is the app that gives your model tools to work with your project. Think of Cipher as a work desk and the model as the helper sitting at it. The helper can make mistakes, so you review changes.

A **project** is simply the folder containing the files for your website, app, or other code. You do not need VS Code to use Cipher.

## 2. Open Cipher and start Ollama

1. Open the Cipher app for your operating system.
2. Open Ollama and leave it running.
3. Make sure you already have a model installed in Ollama. Cipher does not download one.
4. In Cipher, look for **Connected** near the model selector at the top. If it is not connected, follow the next section.

Cipher is free. Running a local model uses your computer's resources. If you choose a paid cloud API, that provider may charge you separately.

## 3. Connect your installed model

1. Click **Settings & connections** near the bottom-left.
2. Click **Model connection**.
3. Set **Connection type** to **Ollama - local models**.
4. For Ollama on this computer, use **http://localhost:11434** as the API base URL.
5. Leave the API key blank for a normal local Ollama setup.
6. Enter your installed model's exact name in **Model ID**, or choose it in the model selector after saving.
7. Click **Save settings**.
8. Click **Check your model** on the welcome screen. Wait for the result.

**What you should see:** Connected, your model's name, and either a successful tool check or an explanation of why the check failed. A successful check verifies a small exchange; it does not guarantee every coding task succeeds. Do not download another model unless you decide to do so yourself.

## 4. Open your project folder

1. Click **Open project** at the top-left.
2. In the folder picker, choose the folder containing the project you want to work on.
3. Click **Open**.
4. Look at the left side of Cipher. Your project name and files should appear.

You do not have to add each file to a message. The model can search the selected folder and read relevant files. Clicking a file opens the built-in editor. **Add to next message** is optional when you want to point out a specific file.

If you are learning, use a copy of a project or a separate Git branch. Keep a backup of anything important.

## 5. Find your way around the screen

| Area                      | What it is for                                         |
| ------------------------- | ------------------------------------------------------ |
| Left sidebar              | Open a folder, find files, open Workbench and Settings |
| Model selector at the top | Choose which installed model or API model answers      |
| Ask / Plan / Build tabs   | Choose the kind of help you want                       |
| Middle conversation       | Read your messages and Cipher's replies                |
| Message box at the bottom | Type your request                                      |
| Right activity panel      | Review tool activity, file changes, and command output |
| Stop button while working | Cancel pending work and request command termination    |
| Getting started           | Replay the tour whenever you need it                   |

Use **Activity** at the top to show or hide the right panel. Approval requests bring it back when needed.

## 6. Start with a question

1. Click **Ask**.
2. Click the message box at the bottom.
3. Type: **Read this project, explain what it does, and tell me how to run it. Do not change any files.**
4. Press **Command + Enter** on Mac, or **Ctrl + Enter** on Windows/Linux. You can also click the send arrow.
5. Wait while the model reads the files it needs.
6. Read its explanation. Ask it to explain any unfamiliar words.

Ask mode cannot save project changes. If the model has not read the relevant files, ask it to inspect them before making claims.

## 7. Ask for a plan before a change

1. Click **Plan**.
2. Describe the result you want in plain language. Include the problem, desired result, and anything that must stay unchanged.
3. For example: **Find where the contact form is handled. Plan a clearer error message when an email address is missing. Keep the rest of the form unchanged.** Use a request that fits your actual project.
4. Send the request.
5. Open **Workbench → Plans** to inspect a structured plan if the model created one.
6. Read the steps and acceptance checks. An acceptance check explains how you will know a step worked.
7. Edit the plan if needed. Choose **Review & build** when it matches what you want.

Approving a plan does not approve future file saves or commands. You review those separately.

## 8. Request and approve a code change

1. Choose **Build**, or start building from your reviewed plan.
2. Ask for one clear change at a time. You can say: **Find the relevant files yourself, make the change, and run the existing checks. Preserve unrelated work.**
3. When Cipher proposes a file change, open **Changes** in the right panel.
4. Check the file name and reason for the change.
5. Expand **Line changes**. Green lines are additions; red lines are removals.
6. Read **Current contents** and **Proposed contents** when you need more detail.
7. Click **Approve & save** only if you want the change written to your project.
8. Click **Reject** if it is wrong or unclear. Then ask for a correction or explanation.

**What you should see after approval:** a saved message and a checkpoint. A rejected proposal has not been saved. A model saying “done” is not proof that a save happened; check the actual tool result.

## 9. Check the result

1. Ask Cipher to run the project's existing tests, or explain how you can check the change yourself.
2. If it requests a command, read the exact command and working folder before approving it.
3. Commands run as your computer user. Do not approve an unfamiliar command just because the model requested it.
4. Open **Terminal** in the activity panel to read the real output.
5. If a check fails, ask Cipher to investigate the actual failure.
6. Open or run your project normally and confirm the behavior you wanted.

A test is a program that checks expected behavior. An **exit code** is the number returned when a command ends; zero usually means success, but the output and actual behavior still matter. Cipher's command deadline is 60 seconds. Longer-running servers should be started using your normal development workflow.

## 10. Undo or stop

### Undo a saved file

1. Find its saved change card.
2. Click **Undo this save**.
3. Cipher restores the previous contents only if the file has not changed again since that checkpoint.

If the file changed again, Cipher refuses to overwrite newer work. Use Git or your backup for more complicated recovery. Checkpoints do not replace version control.

### Stop a task

Click **Stop** while Cipher is working. It cancels pending approvals and generation and requests termination of approved commands. It does not undo saves, clicks, or commands that already happened. Inspect the actual state before resuming.

## 11. Edit a file yourself

1. Click the file in the left sidebar.
2. Change its text in the built-in editor.
3. Click **Review my edits**.
4. Review the proposed change.
5. Click **Approve & save** to write it, or **Reject** to leave it unapplied.

You can use the same checkpoint recovery as a model-proposed edit.

## 12. Explore advanced tools when you need them

- **Plans:** organise a change into reviewed steps.
- **Goals:** track a larger outcome with milestones and evidence. Goals do not secretly run in the background.
- **Resources:** add your own text notes, references, and reusable instructions. Enable only what you want the model to use. Imported references start disabled.
- **Project memory:** save conventions and decisions for the selected project.
- **Model profiles:** save connection settings. API keys remain session-only.
- **Browser:** enable exact website origins in Access, then review browser actions. A website origin is its scheme, host, and port, such as http://localhost:3000.
- **Computer:** in the native Mac app, grant the required Mac permissions, then select allowed running apps inside Cipher. Control of other desktop apps is not yet available on Windows/Linux.
- **Git:** inspect changes and review a new branch or selected-file commit. Git must be installed. Cipher does not push automatically.
- **Connections:** connect supported HTTP MCP tools. MCP is a way for apps to offer tools and resources to a model. Only connect services you trust.
- **Activity log:** review a local record and export your conversation.

## 13. Change the appearance

1. Open **Settings & connections → Appearance**.
2. Choose **Daylight**, **After hours**, or **Hacker**.
3. Choose a text size that is comfortable to read.
4. Save settings.

The small theme button in the top-right also cycles through the three themes.

## 14. If something goes wrong

| What you see                                | What to try                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Not connected                               | Check Ollama is running, the API address is correct, and the installed model exists              |
| Model says it cannot edit                   | Check Build mode, run Check your model, and inspect tool errors; some models follow tools poorly |
| No files appear                             | Open the correct source folder; hidden, excluded, large, or unsupported files may not appear     |
| File changed outside Cipher                 | Read it again and request a fresh proposal; do not force an old edit over newer work             |
| Context budget exceeded                     | Start a new chat or increase Context in Agent controls only if your model can support it         |
| A command failed                            | Read Terminal output and ask for an explanation; do not assume the change works                  |
| Git commit failed                           | Check Git is installed, the correct repository is open, and staging/identity settings are valid  |
| Mac permission stopped working after update | Refresh Cipher's entry in Mac privacy settings, then enable only intended apps in Cipher again   |

## Before you call a task finished

- You understand what changed.
- You approved the intended files.
- You read the real check results.
- You tried the changed behavior.
- You know how to recover using a checkpoint, Git, or a backup.

Cipher helps you do the work. Your model's speed and accuracy vary. Keep important decisions and approvals in your hands.
