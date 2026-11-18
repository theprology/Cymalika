# Computer use

Cipher 0.4 adds Windows and Linux computer tools. Mac downloads are Developer ID signed and Apple-notarized. Windows publisher signing is pending an external provider review. Linux packages have GitHub build-provenance attestations. Signing status is recorded per release; a workflow file alone does not mean a download is signed.

## Start here

1. Open the application you want Cipher to work with.
2. Open **Workbench → Access** in Cipher.
3. Enable **Inspect and control selected desktop apps**.
4. Tick the apps you want to allow, or choose **Select all listed apps**.
5. Choose **Apply session access**. Selections alone do not enable access.
6. Open **Workbench → Computer** and inspect the selected app.
7. Ask the model for one concrete task. Review the proposed action, then inspect its actual result.

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
