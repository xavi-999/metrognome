# Changelog

## v0.2.0 — 2026-06-02

### Added
- **Light theme for Perf Map** — white canvas, performance-green accent (`#16a34a`), severity colors tuned for white. Canonical palette applied identically across all assets.
- **Banner** (`docs/banner.svg/png`) — equalizer mark + wordmark with green **g** accent + tagline.
- **Configurations menu (item 4)** — view/edit `.metrognome/config.json` from within `/metrognome`.
- **Configurable commit mode** — Autoresearch asks commit mode + live-report preference before running (pre-filled from config). End-of-run: `per-iteration` · `one-commit` (squash) · `no-commit` (leave staged).
- **Live run report** (`assets/report.template.html` + `scripts/build_run_report.mjs`) — auto-refreshing HTML dashboard showing KEEP/REVERT cards, distributions, net delta. `npm run report` alias.
- **Sample run-state** (`assets/run-state.sample.json`) — offline pitch demo (3 KEEP, 2 REVERT).
- **Doctor bootstraps `config.json` and `.metrognome/.gitignore`** on first `--init`.
- **Four pitch diagrams** (`docs/diagrams/`) — `loop`, `orchestration`, `gate`, `signal-vs-noise` — SVG + PNG, canonical palette.

### Changed
- README: banner at top, orchestration diagram replaces ASCII block, loop/gate/signal-vs-noise diagrams embedded, modes table updated to 4 items, commit language softened.
- SKILL.md: 4-item menu, run-options prompt, loop rewritten with commit-mode transform step, discipline rules softened, Doctor + reference index updated.
- `commands/metrognome.md`: Configurations routing added.
- `docs/perf-map.png`: regenerated from a real RN app scan under the light theme.

---

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
