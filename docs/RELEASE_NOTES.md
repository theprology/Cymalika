# Cipher 0.5.0 local candidate

## 0.5.6

- macOS uses cooperative app activation and raises the target browser window before verifying focus; input is still refused if the correct app is not foreground.

- Computer tasks continue past app discovery and browser inspection instead of asking the user to open an ordinary target page.
- A new reviewed browser-navigation tool opens a website in a new tab of the chosen running browser, preserving its existing session and tabs. Mac navigation uses the native browser URL-opening API without address-bar typing. Windows/Linux navigation uses fresh accessibility snapshots between inputs. The model must inspect the resulting page.
- Combined website-and-report tasks check for navigation, observation, a successful file save, and a matching readback before accepting completion. Rejected actions stop recovery.
- Navigation guidance distinguishes Cipher Browser's separate session from an existing Chrome/Safari login and keeps login, permission and production confirmations with the user.
- New-tab keyboard support is shared across macOS, Windows and Linux. Existing models and saved settings are preserved.

## 0.5.5

- Turning Coffee on now shows a brief, non-blocking sip animation over the current chat, then automatically disappears after one sip. Keep-awake remains on.
- Removed the separate Coffee screen, replay button and Back to work step. Colours stay in the sidebar. Reduced-motion users see a short static confirmation.
- Added regression and packaged-app checks for automatic dismissal, rapid off/on cycles and unchanged native keep-awake state.

## 0.5.4

- App colour now changes the whole workspace, dialogs, editor and sidebar, independently of Coffee being on or off. Light/dark/hacker modes still work.
- Coffee opens a full-window drinking animation with app colour controls. Back to work closes the animation while keeping Coffee on; Show drinking animation reopens it. On Mac, Coffee holds display, system idle and disk idle assertions, matching `caffeinate -dim`. Closing the lid and manual Sleep remain available.
- Enter sends a chat message. Shift+Enter inserts a line break, and Command/Ctrl+Enter still sends. IME composition does not send prematurely.
- Project Explorer groups folders and files, supports collapse/search and sidebar resizing, and opens files in a tabbed, syntax-coloured source viewer with line numbers. Manual draft edits remain separate until reviewed and saved.

## 0.5.3

- Fixed context fitting for large JSON-encoded source results, including the final evidence summary. Compaction now measures the serialized request and leaves saved history unchanged.
- Added Coffee in the sidebar: keep the computer and display awake while Cipher is open, with an animated cup taking a sip. Normal sleep returns when switched off or when the app exits.
- Cycle six coffee colours, step back, or pick a swatch. The colour is remembered; Coffee starts off after an app restart. Reduced-motion preferences are respected.
- Uses macOS power assertions and Electron power blockers on Windows/Linux; it does not change system sleep settings or override lid closure or manual Sleep.

## 0.5.2

- Repeated identical discovery requests trigger compatibility recovery and are not executed indefinitely. Duplicate progress messages are hidden.
- Investigations finish with an evidence summary when they exhaust their steps or stop making progress. Questions cannot confirm readiness based only on filenames/search results.
- Search prioritizes source over documentation and accepts a path filter. File discovery accepts a filename substring.
- Added regression coverage for repeated searches, progress-only answers, source-prioritized search and scoped search.

## 0.5.1

- Large single-task conversations now compact older observations automatically instead of stopping with a context-budget error. The full saved chat is preserved.
- Context estimates reserve room for instructions, tools and the model reply; project indexes scale with the configured context.
- Compaction keeps tool calls paired with their results and tells the model to re-read partial evidence before editing.
- Validated with the existing local Ollama model discovering and fixing a disposable project, then running its tests; an oversized-read variant exercises compaction. This is a focused reliability check, not a claim of parity with hosted coding models.

- One Computer access switch enables session app discovery, internet browsing and user-folder file tools, with no per-app or per-origin setup.
- The same selected model can discover running/installed apps, request opening an app, browse/search websites, find text files, propose saves, and request commands in a chosen user directory.
- No selected coding project or manual file attachment is needed for computer tasks. Project scope remains separate.
- Turning access off cancels pending work, closes Cipher Browser and revokes broad access. App quit and interface recovery reset it too.
- Proposed writes, commands, app launches, clicks and typing remain reviewable. Hidden credential stores, OS permissions and protected human-only actions retain their boundaries.
- The existing local model passed a real shared-loop test discovering notes and saving a correct summary in a disposable user folder.

The local Mac build is signed and notarized. This does not download or switch models. The public 0.4.0 release remains separate from this local candidate until new release assets are published.

---

# Cipher 0.4.1 local candidate

- Chat-first layout with Activity closed by default and clearer mode hints.
- Direct Computer use setup: select an app, connect it, describe the task in chat.
- File, command and computer-action reviews appear in the conversation; command output stays with its review card.
- Smaller context-relevant tool menus, bounded retries for chat-only completion claims, and explicit failure when no action happened. Rejected actions are not retried.
- Clearer computer tool schemas and validation before showing approval requests.
- Interface recovery cancels pending work, disconnects advanced access, and preserves saved conversations and the selected model. Native Mac also provides View → Reload Interface and Stop Task.
- Hidden thinking envelopes and updated in-app guidance. Light, dark and Hacker themes remain available.

This candidate uses existing models. The local Mac build is signed and notarized. See VALIDATION.md for the checks and their limits; the public 0.4.0 downloads remain the previous release.

---

# Cipher 0.4.0

Computer tools now extend beyond the native Mac app.

- Windows UI Automation and Linux AT-SPI can discover allowed apps, inspect controls, replace editable text and activate buttons.
- Windows and Linux X11 add reviewed pointer clicks, supported key combinations, scrolling and window capture.
- Single-use snapshots, process identities, password-field redaction, window ownership checks and cancellation protect app boundaries.
- Access includes an explicit **Select all listed apps** option for the session.
- Windows/Linux use Ctrl + Alt + Shift + F12 for global stop when the desktop allows it; the visible Stop button remains available.
- The beginner handbook and computer-use guide explain setup and platform differences.

## Signing status

**Mac:** Developer ID Application signed by N&RDRIVEWAYS&PATIOS LTD (CQC6547AK7), hardened runtime, trusted timestamp, Apple notarization and stapled tickets. The installed application passes Gatekeeper as Notarized Developer ID.

**Linux:** packages have GitHub build-provenance attestations, in addition to release SHA-256 checksums. This is supply-chain verification; Linux has no Apple notarization service.

**Windows:** the applications and installers are still unsigned by a trusted Windows publisher. A request for free open-source signing review has been sent to SignPath. The signed-build pipeline is prepared and refuses unsigned candidates when signing is required. An enrollment request is not an issued certificate.

## Desktop limits

Normal operating-system permissions apply. Windows protected/elevated windows and secure desktops are not bypassed. Linux X11 supports pointer/key/capture tools; Wayland currently supports exposed accessibility operations, with compositor-mediated pointer and capture sessions still outstanding. Choose allowed apps and review actions in Cipher. No model weights are included or downloaded.
