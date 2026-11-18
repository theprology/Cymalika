# Security

Do not report credentials or private project data in a public issue. Use GitHub private vulnerability reporting when available, or open a minimal issue requesting a private reporting channel without including exploitation details.

Cipher is a desktop agent with user-approved file, process, browser, and app actions. Commands run as the current user. It is not an operating-system sandbox. Treat model output, project text, websites, and connected tools as untrusted. Review actions and keep your project under version control.

The interface must not grant capabilities on a model's behalf. Advanced grants reset on restart. Remote browser pages must have no application bridge. The Electron renderer uses context isolation, sandboxing, no Node integration, restricted navigation, and sender-validated IPC. Common credential paths and symlink escapes are excluded from file tools. These controls reduce risk but do not make arbitrary commands or connected servers safe.

This is an early open-source release. No independent security certification is claimed. Use current releases and consult their validation notes.
