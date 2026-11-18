# Where Cipher can go next

The following are proposals, not claims about shipped functionality.

## Highest value next

1. **Native Windows and Linux app control:** Windows UI Automation and Linux accessibility/desktop portals, with per-app grants and the same action review workflow. Linux support must account for Wayland and X11 differences.
2. **Git worktrees per task:** isolated branches, clean review, and explicit merge or discard so agent tasks do not collide with your current work.
3. **Language-aware project map:** symbol references, dependency navigation, and incremental indexing so models find relevant code with less context.
4. **Grouped change review:** approve a coherent patch with file-level decisions and safe rollback, rather than reviewing a long sequence of full-file proposals.
5. **Model capability profiles:** measured tool/vision/context support, task success history, and an explicit user-selected fallback. Never silently download or switch models.

## Workflow improvements

- Searchable conversation history, conversation rename/archive, and import/export.
- Command palette and customizable keyboard shortcuts.
- Test explorer with structured failures linked to source lines.
- Task queue with visible budgets and pause/resume at safe boundaries.
- Reproducible environments and optional command sandboxing.
- Human-reviewed pull request creation and CI result tracking.
- Document extraction for PDF/Word with citation back to the source.
- Voice input and optional speech output.
- MCP stdio/OAuth and per-server capability review.

## Distribution and trust

- Signed Windows installers, Apple notarization, and verified checksums.
- Explicit opt-in updates with release notes and rollback.
- Cross-platform accessibility audits and actual device testing.
- Optional encrypted local history and OS keychain integration.

Reliability and recovery should improve before introducing unattended background operation or broad computer access.
