# Changelog

## v0.2.2 — 2026-06-10

### Added
- **Performance Playbook** (`scripts/build_playbook.mjs`) — distils `.metrognome/ledger/*.md` into `playbook.md` + `playbook.json`: "proven wins" and "dead ends" aggregated across runs. SKILL.md now reads the playbook before baseline to skip already-tried patterns. `npm run playbook` / `npm run playbook:test` aliases added.
- **Metric trajectory trend chart** in the live run report — SVG step-line of the committed metric across iterations, KEEP/HOLD dots, ghost markers for rejected candidates, gradient fill, and endpoint labels.

### Fixed
- Hero image link in README (`docs/perf_map.png` → `docs/perf-map.png`).
- Version harmonized to `0.2.2` across `package.json`, `plugin.json`, and `marketplace.json`.
- CI workflow now uses `npm ci` (package-lock.json was already committed).
- README: removed stale placeholder comment, added founder context and origin section.

---

## v0.2.1 — 2026-06-07

### Added
- **Session-recovery onboarding** — Doctor restores `.metrognome/` context on session restart.
- **CI Autopilot templates** (`templates/ci/`) — device-free and device GitHub Actions workflows for weekly autonomous performance runs.
- **Standalone plugin logo** (`docs/logo*.png/svg`) — works without the banner.

### Fixed
- Run-report JSON guard for invalid state; `</script>` literal escape in inline JSON block.

---

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

Initial release (private).

- Static RN perf scan with ten Babel AST detectors (`perf_scan.mjs`)
- Offline 3D Perf Map — interactive force-graph, no device needed (`build_perf_map.mjs`)
- Statistical gate for KEEP/REVERT decisions — N-run mean ± stddev (`stats.mjs`)
- Doctor preflight: toolchain checks, Babel dep resolution, `.metrognome/` bootstrap
- Five Autoresearch presets: `first-load`, `listing`, `memory-leaks`, `bundle-size`, `re-renders`
- Per-repo Performance Memory (`.metrognome/perf-memory.md`)
- SessionStart hook auto-installs npm deps; UserPromptSubmit hook nudges memory consultation
- Sample fixture with seeded anti-patterns (`examples/sample-rn-app`)
