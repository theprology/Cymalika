# Computer use

Cipher 0.4 adds Windows and Linux computer tools. Mac downloads are Developer ID signed and Apple-notarized. Windows publisher signing is pending an external provider review. Linux packages have GitHub build-provenance attestations. Signing status is recorded per release; a workflow file alone does not mean a download is signed.

## Start here in 0.5

1. Select your existing model in Cipher. Nothing is downloaded.
2. Turn on **Computer access** at the top of the sidebar.
3. Describe your task in chat. The model discovers apps, browses/searches websites, and finds files in your home folder itself.
4. Review requested changes in chat. You can reject any action or stop a task.
5. Turn the switch off when finished. It cancels pending work, closes Cipher Browser and revokes the broad access. Existing approved saves are not undone.

You do not have to connect apps individually or enter website allowlists in this mode. For example: “Research a topic online, then write a report in Documents.” Browsing uses Cipher’s separate temporary browser session; signing into an existing Chrome profile is not automatic. The model can also discover running and installed desktop apps and request opening the app it needs.

Ordinary user-folder text files are available through bounded direct tools. Hidden credential stores and system paths are excluded. Existing files require a matching read-back hash before replacement, and reviewed saves keep checkpoints. Commands can use a folder inside home and always require review. Neither models nor tool calls can turn Computer access on themselves.

The switch resets on app quit or interface recovery. It does not grant operating-system permissions. Mac app control needs Accessibility, window capture needs Screen Recording, and Linux/Windows still enforce their normal permissions. Credentials, purchases, permissions, binding agreements, CAPTCHA/security-warning interactions and permanent deletion require explicit confirmation for the exact action. Review the target and consequences, then approve or reject the action card. Approval applies to that action only. Protected password fields, operating-system security dialogs and unsupported site controls may still need direct user input; approval does not remove a tool or OS limitation. Never put passwords in chat or confirmation text.

The 0.5 feature is available in source builds and the updated local Mac app. See release assets for the version of a published installer.

Use Cipher’s Stop button while a task runs. The global stop shortcut is Command + Shift + Escape on the native Mac app and Ctrl + Alt + Shift + F12 on Windows/Linux when the desktop allows registration. If the global shortcut is unavailable, Computer status says so.

Computer access resets when Cipher quits. Restarted applications must be selected again on Windows/Linux. An inspection creates short-lived element references; each approved action consumes that snapshot. Inspect again before the next action. Secure accessibility fields are redacted; screenshots can still contain sensitive information.

## Mac

Grant Cipher Accessibility in System Settings. Window capture additionally needs Screen Recording. The native backend supports accessibility actions and approved pointer, keyboard and scrolling operations. macOS still controls permissions and protected applications.

## Windows

Cipher uses Windows UI Automation to read exposed app controls and invoke buttons or replace editable text. Approved pointer clicks, supported key combinations and scrolling are also available. It does not request administrator privileges or bypass UAC, secure desktops or protected applications. Some older/custom controls expose limited accessibility information; use an approved window capture and pointer action when appropriate.

A fresh snapshot and an allowed running app are required. Window/process identities are checked again, and covered click locations are rejected. Generic text entry should use `set_text` with an inspected editable element. Arbitrary keystroke strings are not shell commands and are not accepted.

## Linux

Use the same desktop session as the apps you want to control. Accessibility uses AT-SPI. On Debian/Ubuntu the Debian package declares the dependencies; AppImage users may need to install them separately:

```sh
sudo apt-get install python3-gi gir1.2-atspi-2.0 at-spi2-core wmctrl xdotool
```

Enable accessibility in your desktop settings if no apps appear. Applications need to expose accessibility controls themselves.

- **X11:** accessibility actions plus approved pointer/key/scroll operations and window capture. Pointer tools require `wmctrl` and `xdotool`; a window manager must support focusing the allowed window.
- **Wayland:** exposed accessibility reads, button actions and editable-text operations. This backend does not yet implement compositor-mediated pointer/keyboard sessions or screen sharing. X11 tools cannot override Wayland isolation. Use an X11 session for those operations while portal support is being developed.

## Limits that signing cannot remove

Publisher signing identifies who distributed an app and detects modifications. Apple notarization checks the submitted Mac build. Neither grants system permissions, guarantees that every app exposes accessibility controls, nor makes every model reliable. Cipher keeps action review, app selection, cancellation and a visible Stop control.

See [publisher signing](SIGNING.md) and [validation](VALIDATION.md) for release evidence.

## Navigate and save a report

In **Build**, turn on **Computer access** and ask, for example:

> Use Google Chrome to open https://example.com in a new tab. Read the page, save a short report to Documents/Cipher-browser-test/report.txt, and read the saved file back to verify it. Keep existing tabs unchanged.

Create the destination folder first or choose an existing folder. Cipher can discover the running browser and propose one **Open website … (new tab)** review card, rather than asking you to navigate there yourself. It then inspects the loaded page and proposes the report save. Review the URL and file path before approving.

For an existing signed-in website, request the named desktop browser. Cipher Browser is a separate session and does not inherit Chrome or Safari logins. If a site needs a sensitive action, Cipher should ask for explicit confirmation of that action and its consequences. Approve in the review card if you want it performed. Enter credentials directly when the field is protected or the tool does not support it. Merely finding a running browser does not establish production readiness.

## Passwords and permissions after approval

When the model finds a password field, it can request **password_fill**. Cipher opens a separate **Allow password entry?** window naming the actual website/app and field. Type the password there and choose **Approve & fill password**. Never put it in chat. Cancel performs no fill. Login submission remains a separate reviewed action; the website/app can react to input as it normally would.

Password values stay in local session memory and the target field, outside model messages, saved chat and clipboard. Known plaintext reflections are redacted from text observations. Capture is disabled after secure entry for that session; use text observations instead. Closing Cipher Browser clears its secure session; restart Cipher to clear desktop secure-entry state.

Pending website requests appear in **browser_read.permissions**. The **browser_permission** tool shows the real origin, requested permission and allow/deny decision before granting. The model can also request **computer_permission** for an inspected desktop permission button. Approve the specific request, then have the model inspect the resulting state. Use a normal reviewed computer action for a switch after reading its current state.

macOS Touch ID, protected authentication, Windows UAC/secure desktop and protected Linux authentication cannot be bypassed. A website permission decision is separate from the OS's own privacy permission. If the OS or application rejects automation, Cipher reports that limit and you perform only that protected step directly. Some applications do not expose writable secure fields.
