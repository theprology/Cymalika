# Contributing

Use Node.js 24+, run `npm ci`, then `npm test`. Run `npm run format` for web/desktop code. Native Mac changes require `./build.sh` and the native streaming check (`python3 source/test-native-stream.py`). Use `xcrun swift-format format --in-place source/*.swift` for Swift formatting.

Keep changes focused. Preserve user review boundaries, project path checks, stale-write protection, and cancellation. Add regression checks for behavior that could fail, rather than tests that only mirror an implementation. Do not commit application state, local projects, credentials, model weights, build output, or node_modules.

Describe what changed, how you verified it, and which platforms were actually exercised. An installer compiling successfully is not proof that all desktop behavior works on that operating system.
