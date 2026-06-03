![metrognome — propose → measure → keep / revert](docs/banner.png)

> **Metro + metronome + the measure-rhythm loop.** A Claude Code plugin that turns React Native performance work into one autonomous, scientific loop: **propose → measure → keep/revert.**

<!-- ORIGIN: Xavier to supply — 2–3 sentences on why you built this. -->

React Native performance tooling is powerful but scattered — each tool knows one thing, nothing shares context between sessions, and there's no gate between "this might help" and "this actually helped." metrognome routes each measurement to the right tool and runs a loop with a real gate: one fix at a time, measured N times, kept only if the gain clears the noise — else reverted. Git is the experiment log; kept changes are metric-gated and the final commit shape is configurable.

![metrognome 3D Perf Map — white canvas, green chrome, node size = perf debt, color = severity.](docs/perf-map.png)

---

## Architecture

metrognome routes each measurement to the right tool, then owns the loop, the gate, the ledger, the memory, and the map:

![metrognome orchestration — the conductor, metro-mcp, and three Callstack tools](docs/diagrams/orchestration.png)

agent-device, agent-react-devtools, and react-native-best-practices are independent open-source projects by **Callstack**; metro-mcp is an independent open-source project. metrognome does not bundle or modify them, it conducts them. See [Attribution](#attribution).

---

## What `/metrognome` does

Run `/metrognome` for a menu (or pass args / plain English to skip it):

1. **Autoresearch** — pick a preset, run the autonomous loop:
   `first-load` (TTI) · `listing` (FPS/jank) · `memory-leaks` (RAM) · `bundle-size` · `re-renders`.
   Each iteration applies **one atomic fix**, re-measures with an N-run protocol, and keeps it **only if the gain beats the measurement noise** — otherwise it auto-reverts. Kept changes are metric-gated; the final commit shape is configurable (per-iteration · one commit · leave staged).

2. **Perf Map 3D** — a static, device-free scan of the repo → an interactive 3D force-graph (open it in any browser, fully offline). Node **size = perf debt**, **color = severity**. Click a node for the flaw, `file:line`, and the matching Callstack guide. Emits a **Top-3** you paste straight back into Autoresearch.

3. **Doctor** — verify/install the toolchain, check a live Metro session + a clean git tree, and bootstrap the repo's `.metrognome/` memory.

```bash
# Perf Map, by hand:
node skills/metrognome/scripts/perf_scan.mjs <your-rn-app> --out graph.json
node skills/metrognome/scripts/build_perf_map.mjs graph.json --out perf-map.html --open
```

---

## What the skill offers

**Modes** (`/metrognome` menu):

| Mode | What it does |
|---|---|
| **Autoresearch** | Pick a preset; asks commit mode + live report (opt-in); runs the autonomous measure→fix→keep/revert loop. |
| **Perf Map 3D** | Device-free static scan → interactive HTML force-graph → Top-3 hotspots. |
| **Doctor** | Verifies/installs the toolchain, checks Metro + clean tree, bootstraps `.metrognome/` (including `config.json`). |
| **Configurations** | View/edit `.metrognome/config.json` — commit mode, live report, N, k, budget. |

**Presets** (Autoresearch):

| Preset | Target metric |
|---|---|
| `first-load` | TTI — cold-start time to interactive |
| `listing` | FPS / jank — dropped frames in FlatList/SectionList/FlashList |
| `memory-leaks` | RAM — JS heap growth across open↔close cycles |
| `bundle-size` | Bundle bytes — JS output size |
| `re-renders` | Re-render count — wasted component commits |

**Scripts / CLIs** (device-free unless noted):

| Script | npm alias | What it does |
|---|---|---|
| `perf_scan.mjs` | `npm run scan` | Scans an RN repo, emits `graph.json` of perf hotspots |
| `build_perf_map.mjs` | `npm run map` | Renders `graph.json` → standalone HTML 3D force-graph |
| `build_run_report.mjs` | `npm run report` | Renders `run-state.json` → live HTML progress dashboard |
| `stats.mjs` | `npm run stats:test` | Statistical gate (mean ± stddev, keep/revert decision) — self-testable |
| `doctor.mjs` | — | Toolchain check, Metro + git preflight, `.metrognome/` bootstrap + `config.json` |
| `heap_sample.mjs` | — | JS-heap leak sampling across open↔close cycles — needs a live app |

Installed-plugin path: `${CLAUDE_PLUGIN_ROOT}/skills/metrognome/scripts/<script>`.

---

### Signal, not noise

![Signal not noise — four-layer funnel from all findings to real hotspots](docs/diagrams/signal-vs-noise.png)

Static RN heuristics fire constantly in healthy code. The Perf Map's scoring is designed to surface the structural problems that actually matter — not every inline prop and missing `memo`. How it stays selective: severity weights, diminishing returns, structural-only centrality, and a combined debt+severity gate. Details and tuning constants: `skills/metrognome/references/perf-map.md`.

---

## Install

```
/plugin marketplace add xavi-999/metrognome      # or a local path to this repo
/plugin install metrognome
```

This registers the `/metrognome` command, the orchestrator skill, the bundled `metro-mcp` MCP server, and the perf-memory hook. Then run **Doctor** once in your RN app to install the CLI tools and bootstrap `.metrognome/`.

**Scripts need `npm install`:** When used inside a Claude session the SessionStart hook installs dependencies automatically. For by-hand / CI use (e.g. `npm run scan`), run `npm install` in the plugin directory first.

---

## Quickstart

### Map your app (no device needed)

1. Run `/metrognome` → select **Perf Map 3D**.
2. metrognome scans the repo, builds a standalone HTML map, and opens it — node **size = debt**, **color = severity**.
3. Click a hotspot → flaw, `file:line`, and the matching fix guide.
4. Copy the printed **Top-3** command, e.g. `/metrognome listing --target FeedScreen`.

**By hand** (CI / no Claude):
```bash
npm run scan -- path/to/your-rn-app --out graph.json
npm run map  -- graph.json --out perf-map.html --open
```

### Run the loop

Paste a Top-3 command (or pick **Autoresearch** → preset from the menu) — metrognome measures, applies one fix, keeps it only if the gain beats the noise, else auto-reverts. *Needs the live toolchain + Metro + a clean tree — run Doctor first* (see [Requirements & constraints](#requirements--constraints)).

---

## Requirements & constraints

- **Node ≥ 18**; a React Native / Expo app on **Metro + Hermes**.
- **`npm install` in plugin root** — required before running scripts by hand or in CI. Inside a Claude session the SessionStart hook does this automatically.
- **Perf Map + stats need no device.** The live loop needs a simulator/emulator/device + a running Metro session.
- **Live-loop toolchain** (installed via Doctor): `agent-device`, `agent-react-devtools` (CLIs), `metro-mcp` (bundled MCP), and the `react-native-best-practices` Callstack agent-skill.
- **Clean git tree required for Autoresearch** — git is the experiment log; auto-revert needs a clean baseline. Doctor refuses to run dirty. The final commit shape is configurable via `.metrognome/config.json` (`commitMode`: `per-iteration` · `one-commit` · `no-commit`).
- **Local-only.** The loop needs live Metro + a device — it cannot run as a cloud cron.
- **iOS Simulator blind spot:** displayed-frame **FPS** is unavailable (Apple constraint — Simulator renders on the host GPU). Every other signal (JS heap, re-renders, longtask jank, TTI, CPU/RAM) works on Simulator. For FPS: use **Flashlight** (Android) or **Instruments/XCTest** (real iOS device).
- **RN < 0.85: one CDP connection.** Close all RN DevTools / Fusebox windows before metro-mcp runtime calls.
- **Expo / New Arch:** if metro-mcp runtime calls time out, set `newArchitecture: true`; `listing`/`re-renders` degrade to the CDP-free path (metro-mcp unverified offline).
- **Discipline:** one variable per iteration; never record an unmeasured fix.

---

## How the loop stays honest

![The metrognome optimization loop — propose → measure → gate → keep/revert](docs/diagrams/loop.png)

- **N-run variance control.** Every metric is measured N times (default 5, one warm-up discarded); decisions use mean ± stddev, not a single sample.
- **The gate.** Keep a change iff `improvement > max(min_effect, k·pooled_stddev)` (k≈2). If it can't be distinguished from device jitter, it's reverted. (`scripts/stats.mjs`, self-testable.)

![The gate — two distributions, noise band, KEEP vs REVERT decision](docs/diagrams/gate.png)

- **Git as experiment log.** Clean tree required; per-iteration commits enable instant `git restore .` revert. The final commit shape is configurable: keep each commit, squash to one, or leave staged for review.
- **Experiment Ledger** (`.metrognome/ledger/`) records every run verbosely; **Performance Memory** (`.metrognome/perf-memory.md`) distills each into one durable line, committed with the app so the whole team inherits the knowledge.

---

## Repo layout

```
.claude-plugin/      plugin.json + marketplace.json (self-installable)
.mcp.json            bundles metro-mcp
commands/            /metrognome entrypoint
hooks/               SessionStart (npm install) + UserPromptSubmit (perf-memory nudge)
skills/metrognome/
  SKILL.md           the orchestrator (menu, routing, loop, gate, ledger, memory, config)
  references/        presets · tools · measurement · perf-map · memory
  scripts/           perf_scan · build_perf_map · build_run_report · stats · doctor · heap_sample
  assets/            vendored 3d-force-graph · HTML templates · ledger template · sample run-state
docs/                banner.svg/png · perf-map.png · diagrams/ (loop · orchestration · gate · signal-vs-noise)
examples/            sample-rn-app fixture with seeded anti-patterns
```

In the target RN repo, Doctor bootstraps:
- `.metrognome/perf-memory.md` — cumulative performance brain (committed with the app)
- `.metrognome/config.json` — run settings: commit mode, live report, N, k, budget
- `.metrognome/ledger/` — verbose per-run experiment logs
- `.metrognome/archive/` — compacted old memory
- `.metrognome/.gitignore` — excludes generated artifacts (`report.html`, `run-state.json`)

---

## Attribution

metrognome orchestrates these independent open-source tools. agent-device, agent-react-devtools, and react-native-best-practices are by **Callstack**; metro-mcp is by its own contributors. None are bundled or modified here; all trademarks and copyrights belong to their owners.

- **metro-mcp** — MCP server bridging Metro via CDP — https://www.npmjs.com/package/metro-mcp
- **agent-device** — device-driving CLI — https://www.npmjs.com/package/agent-device
- **agent-react-devtools** — React telemetry CLI daemon — https://www.npmjs.com/package/agent-react-devtools
- **react-native-best-practices** — perf knowledge base — https://github.com/callstackincubator/agent-skills

The Perf Map vendors, unmodified, the offline browser build of **3d-force-graph** by Vasco Asturiano (MIT) — https://github.com/vasturiano/3d-force-graph (license in `skills/metrognome/assets/3d-force-graph.LICENSE`).

## License

MIT — see [LICENSE](./LICENSE).
