# Changelog

## v0.1.0 — 2026-06-02

First public release.

- Static RN perf scan with ten Babel AST detectors (`perf_scan.mjs`)
- Offline 3D Perf Map — interactive force-graph, no device needed (`build_perf_map.mjs`)
- Statistical gate for KEEP/REVERT decisions — N-run mean ± stddev (`stats.mjs`)
- Doctor preflight: toolchain checks, Babel dep resolution, `.metrognome/` bootstrap
- Five Autoresearch presets: `first-load`, `listing`, `memory-leaks`, `bundle-size`, `re-renders`
- Per-repo Performance Memory (`.metrognome/perf-memory.md`)
- SessionStart hook auto-installs npm deps; UserPromptSubmit hook nudges memory consultation
- Sample fixture with seeded anti-patterns (`examples/sample-rn-app`)
