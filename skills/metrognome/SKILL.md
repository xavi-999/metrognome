---
name: metrognome
description: Autonomous, scientific React Native & Expo performance optimization via a propose -> measure -> keep/revert loop. Use this WHENEVER an RN/Expo app is slow, laggy, janky, stuttering, freezing, or memory-hungry — slow cold start / TTI, dropped frames while scrolling a FlatList/SectionList/FlashList, rising RAM or a suspected memory leak, a bloated JS bundle, or wasted/excessive re-renders — even if the user never says "metrognome" or the word "performance". Also use it to build an interactive 3D Perf Map of an RN repo, profile a specific screen or component, or surface the worst perf offenders. It measures every change N times on a real device/simulator and keeps a fix only if the gain beats the measurement noise, committing each win with git-as-memory. Scope is React Native / Expo (Metro + Hermes) only — for web, Next.js, or Core Web Vitals work, use a web performance skill instead.
---

# metrognome

metrognome routes React Native performance work through Callstack's tools and enforces a measurement discipline: propose one fix → measure N times → keep it only if the gain beats the noise, else revert. Git is the internal memory; per-iteration commits enable instant auto-revert, and the final commit shape is configurable (per-iteration · one commit · leave staged).

It's the React Native twin of the web `webapp-perf-playbook`. Same spine: delegate measurement, own the catalog + glue loop, never record an unmeasured fix.

## Scope & Delegation (don't reinvent measurement)

This skill owns: the menu, signal routing, the loop, the keep/revert gate, the Experiment Ledger, the Performance Memory, and the Perf Map. **Measurement is delegated** to four tools (install/verify them with Doctor):

| Need | Tool | How |
|---|---|---|
| Drive the app / simulate a user (open, scroll, tap, open↔close cycles) | **agent-device** (CLI) | `agent-device open|scroll|tap|snapshot|screenshot …` |
| Per-component re-render causes, slow renders, commit timeline | **agent-react-devtools** (CLI daemon) | `agent-react-devtools get tree | get component @c1 | profile slow` |
| Hermes CPU/heap, network, console/exceptions, JS exec, navigation | **metro-mcp** (bundled MCP) | call its MCP tools directly — *preferred* for `first-load`; `listing`/`re-renders` can run fully on the CDP-free path if the runtime channel is unavailable (see `references/tools.md`) |
| **JS-heap leak sampling** (`memory-leaks`) — cross-platform incl. iOS Simulator | **`scripts/heap_sample.mjs`** | `node heap_sample.mjs --cycles N` → CSV → `stats.mjs --direction lower --unit bytes` |
| Which fix to try (the hypothesis) | **react-native-best-practices** (Callstack agent-skill) | look up the guide mapped to the preset |

Profiling deliberately overlaps (e.g. CPU is available from both metro-mcp and agent-device); pick the best source per signal. The exact, current command surface for each tool lives in `references/tools.md` — **read it before invoking any tool**, and treat it as the single place to update when a tool's flags change.

**Platform note — the one honest blind spot:** The only metric unavailable on the iOS Simulator is **displayed-frame FPS** (GPU-composited frames). This is an Apple platform constraint, not a tool defect — the Simulator renders on the host Mac GPU without exposing frame-timing. Every other preset signal (JS heap, re-renders, longtask jank, startup, CPU/memory) is fully measurable on Simulator. For FPS: use **Flashlight** on Android or **Instruments/XCTest** on a real iOS device.

## How to start: the menu (harness-agnostic)

**Rule:** if an interactive multiple-choice tool (e.g. AskUserQuestion) is available, use it to present the menu. Otherwise print a numbered Markdown menu and wait for a reply. Never assume a harness-specific widget exists.

Bare invocation → present the **top menu**:

1. **Autoresearch** — pick a preset, run the autonomous optimization loop.
2. **Perf Map 3D** — static repo scan → interactive 3D map → Top-3 fixes you can paste straight back into Autoresearch.
3. **Doctor** — verify/install the tools, check simulator + a live Metro session, check a clean git tree, bootstrap `.metrognome/`.
4. **Configurations** — view/edit `.metrognome/config.json` (commit mode, live report, N, k, budget).

Choosing **Autoresearch** → present the five presets:
`first-load` · `listing` · `memory-leaks` · `bundle-size` · `re-renders`.

**Run options (asked once, pre-filled from `.metrognome/config.json`):** Immediately after the preset is chosen, ask two quick questions (use AskUserQuestion if available, else a numbered menu). Both are pre-filled from config so accepting defaults takes one keystroke:

- **Commit mode** — `Commit each kept fix` (default: `per-iteration`) / `One commit at the end` / `Don't commit (leave staged for review)`.
- **Live report** — `Off` (default) / `On — write a live HTML dashboard to .metrognome/report.html`.

(N, k, and budget are only edited via **Configurations** — don't ask for them here.)

**Skip the menu when intent is explicit.** Accept direct args and natural language:
- `metrognome listing --target FeedScreen` → run that preset on that target.
- "fix jank on the feed list" → map to `listing`, infer the target, confirm, run.
- "the app takes forever to open" → `first-load`. "it leaks memory on the chat screen" → `memory-leaks`.
When you infer a preset/target from prose, state your interpretation in one line and proceed (don't interrogate).

The five presets — metric, what to drive, what to measure, which guide, candidate fixes — are in **`references/presets.md`**. Read the matching entry before running a preset.

## The optimization loop

Run this for an Autoresearch preset. It is a direct port of the web playbook's Measure→Diagnose→Apply→Re-measure→Keep/Revert, hardened with N-run variance control and git gating.

1. **Preflight (Doctor).** Tools present; a Metro session is live; **the git tree is clean** (git-as-memory needs a clean baseline — refuse to run dirty, offer to stash/commit first); then **load `.metrognome/perf-memory.md`** to prime known hotspots and skip routes already proven to revert here. Record `<baseline-sha>` (`git rev-parse HEAD`) — needed for the commit-mode transform at end of run. Load `.metrognome/config.json` for `commitMode`, `liveReport`, `runs`, `k`, `budget`.
2. **Baseline.** Run the preset's measurement **N times** (default N=5; discard one warmup run). Compute **mean ± stddev** with `scripts/stats.mjs`. Open an Experiment Ledger entry (`assets/ledger.template.md` → `.metrognome/ledger/<timestamp>-<preset>.md`).
3. **Diagnose.** Consult the preset's `react-native-best-practices` guide. Identify the **single dominant bottleneck**. Isolate one variable — **never stack fixes**.
4. **Propose + apply.** Apply **one atomic** candidate fix from the preset's catalog. Nothing else.
5. **Re-measure.** Identical N-run protocol.
6. **Gate.** Decide with `scripts/stats.mjs` (see `references/measurement.md`):
   `keep ⇔ improvement > max(min_effect, k · pooled_stddev)`, k≈2, direction per metric (lower-is-better for TTI/jank/RAM/bytes/commits; higher-is-better for FPS).
   - **KEEP** → `git add -A && git commit` with a message stating the measured delta (e.g. `perf(listing): getItemLayout on FeedScreen — jank 18→4 dropped frames (-78%, n=5)`). This per-iteration commit is **always made** — it is the revert isolation mechanism (step 6 REVERT below depends on it).
   - **REVERT** → `git restore .` / `git checkout -- .`. The change was indistinguishable from jitter; do not keep it.
   Record KEPT/REVERTED in the Ledger with **both distributions**. If `liveReport` is on, write `.metrognome/run-state.json` (see schema below) and call `node build_run_report.mjs run-state.json --out .metrognome/report.html`.
7. **Loop.** Next hypothesis until the budget is exhausted or no remaining fix clears the gate.
8. **End-of-run commit transform.** Apply the chosen `commitMode`:
   - `per-iteration` (default) — leave the per-iteration commits as-is. Nothing to do.
   - `one-commit` — `git reset --soft <baseline-sha>` then `git commit -m "perf(<preset>): <net-summary> (<n> iterations)"`. All kept changes land in one commit.
   - `no-commit` — `git reset --soft <baseline-sha>`. All kept changes are **staged but uncommitted** for the user to review, amend, and commit when ready.
9. **Report.** Summarize the Ledger and the resulting commits. Distill each kept/reverted result into **one line** in `.metrognome/perf-memory.md`.

**Discipline rules** (why they matter):
- *One variable at a time.* Stacked fixes make the gate meaningless — you can't attribute the delta.
- *Never record an unmeasured fix.* A change with no before/after distribution is folklore, not a result.
- *Clean tree, per-iteration commits (internal).* The per-iteration commit is what makes `git restore .` safe. `commitMode` shapes the *final* history — it never removes the internal per-iteration commits until end of run.

## Locating the bundled scripts

Commands below use `${CLAUDE_PLUGIN_ROOT}` (the plugin install root, set in plugin context). If it's empty in your shell, resolve the path once at the start of a session:

```bash
MG="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$(find "$HOME/.claude/plugins" -path '*metrognome*/scripts/perf_scan.mjs' 2>/dev/null | head -1)")")}"
# then call:  node "$MG/scripts/perf_scan.mjs" …   (note: $MG points at the skill dir here)
```

**Dependencies:** `perf_scan.mjs` requires `@babel/parser` and `@babel/traverse`. The SessionStart hook installs them automatically when metrognome is loaded in a Claude session. For by-hand / CI use, run `npm install` in the plugin root first (`${CLAUDE_PLUGIN_ROOT}`).

In the snippets below, treat `${CLAUDE_PLUGIN_ROOT}/skills/metrognome` and `$MG` as the same skill directory.

## Perf Map 3D (the diagnose→fix bridge)

A static scan that needs no device — fully usable any time. Steps:

```bash
# 1. scan the target RN repo -> graph.json (Babel AST + perf-debt scoring)
node "${CLAUDE_PLUGIN_ROOT}/skills/metrognome/scripts/perf_scan.mjs" <repo-or-src-path> --out graph.json

# 2. merge into a single standalone HTML (vendored 3d-force-graph + data inlined)
node "${CLAUDE_PLUGIN_ROOT}/skills/metrognome/scripts/build_perf_map.mjs" graph.json --out perf-map.html --open
```

Then: open `perf-map.html` (the `--open` flag does it; otherwise `open perf-map.html`). Node **size = perf debt**, **color = severity** (red CRITICAL / orange HIGH / yellow MEDIUM / grey below-gate). The map renders only nodes with **debt ≥ 2 by default** (live-adjustable via the `min debt` control below the hero banner). A **search box** in that same panel jumps to any module by name (top-5, name-relevance ranked, Enter flies the camera to the top hit). Clicking a node shows the flaw, `file:line`, and the matching Callstack guide. Finally, **read the `top3` array from graph.json (or the printed Top-3) and present each as a ready-to-paste Autoresearch command** — that closes the diagnose→fix loop.

The scoring, the ten detectors, and — critically — the **signal-vs-noise gating** (why most nodes stay grey) are documented in **`references/perf-map.md`**. The tuning constants live in `scripts/perf_scan.mjs`'s `CONFIG` block. If a scan lights up too much, raise the gate there — don't lower your standards in the report.

## Doctor (preflight + setup)

Use Doctor before any device loop, and to set a repo up the first time. Checks + fixes:

- **Tools present?** `metro-mcp` is bundled (this plugin's `.mcp.json`). For the CLIs:
  `npm i -g agent-device agent-react-devtools` (or run via `npx`). The Callstack knowledge base:
  install the `react-native-best-practices` agent-skill from `callstackincubator/agent-skills`.
- **Metro live?** Confirm a Metro/Expo dev server is running and a device/simulator is attached (`agent-device` can list devices). metro-mcp needs a live CDP session to return real data.
- **Clean git tree?** `git status --porcelain` must be empty before an Autoresearch run.
- **Bootstrap `.metrognome/`** in the target repo on first run: create `.metrognome/perf-memory.md` (from the header in `references/memory.md`), `.metrognome/config.json` (default settings), `.metrognome/ledger/`, `.metrognome/archive/`, and `.metrognome/.gitignore` (excludes `report.html` and `run-state.json` — generated artifacts). The memory + config + ledger are committed **with the app** so the team inherits the accumulated knowledge.

If metro-mcp is noisy when no Metro session exists, prefer launching it on demand here instead of always-on. (This degradation behavior is unverified offline — confirm against a live app.)

**On Expo / New Arch:** if metro-mcp's runtime calls (`evaluate_js`, profiler) time out, set the `newArchitecture: true` config flag in metro-mcp settings and close any RN DevTools frontends before retrying. The `listing` and `re-renders` presets degrade gracefully to the CDP-free path (agent-react-devtools + agent-device) — see `references/tools.md`.

## Performance Memory

Across sessions, metrognome builds up a terse per-repo log of every perf gap it encounters — even outside an explicit run — and routes future work from those priors.

- **Read** `.metrognome/perf-memory.md` at the start of any metrognome run **and any perf-related work** in a `.metrognome/`-tracked repo: known hotspots, what was tried, what worked/reverted. A repo prior layered over the generic Callstack guides → faster, sharper routing.
- **Append** one terse line whenever a gap is discovered (Perf Map, autoresearch, or ad-hoc work) or a fix is validated/reverted. Distill verbose Ledger entries into a single durable line.
- **Compact** when it grows: merge duplicates, move resolved+verified entries to `.metrognome/archive/`.

Format, read/append/compaction rules, and examples are in **`references/memory.md`**. The bundled `UserPromptSubmit` hook nudges you to consult + update the memory when a perf-related prompt lands in a `.metrognome/`-tracked repo — the hook reminds; this skill does the work.

## Configurations (menu item 4)

Read `.metrognome/config.json` and display each key with its current value and valid options. Let the user edit any field, then write the file back. If `config.json` is absent, bootstrap it with defaults (same as Doctor `--init` would do).

Config keys:

| Key | Default | Options |
|---|---|---|
| `commitMode` | `per-iteration` | `per-iteration` · `one-commit` · `no-commit` |
| `liveReport` | `false` | `true` · `false` |
| `openReport` | `true` | `true` · `false` (only relevant when `liveReport` is `true`) |
| `runs` | `5` | integer ≥ 2 |
| `warmupDiscard` | `1` | integer ≥ 0 |
| `k` | `2` | float ≥ 1 |
| `budget` | `6` | integer ≥ 0 (0 = run until no fix clears the gate) |

## run-state.json schema (written by the loop when `liveReport` is on)

```json
{
  "preset": "listing", "target": "FeedScreen", "status": "running",
  "startedAt": "2026-06-02T18:00:00Z", "unit": "ms", "direction": "lower",
  "baseline": { "mean": 1190, "std": 12, "runs": 4 },
  "iterations": [
    { "n": 1, "hypothesis": "getItemLayout", "guide": "js/optimizing-flatlist",
      "change": "Added getItemLayout to FeedScreen FlatList",
      "candidate": { "mean": 985, "std": 9, "runs": 4 },
      "decision": "KEEP", "delta": "-205ms (-17%)", "noiseBand": 24, "commit": "abc1234" }
  ],
  "netDelta": "-205ms (-17%)", "commits": ["abc1234"]
}
```

Rebuild the live report after each iteration: `node build_run_report.mjs .metrognome/run-state.json --out .metrognome/report.html`.
If `openReport` is `true`, open `report.html` once at the start of the run (it auto-refreshes every 3 seconds).

## Ledger vs Memory (don't confuse them)

- **Experiment Ledger** = per-run, verbose, reproducible. One file per run in `.metrognome/ledger/`. Template: `assets/ledger.template.md`.
- **Performance Memory** = cumulative, terse, the long-term brain. One file: `.metrognome/perf-memory.md`. Each Ledger run distills into one Memory line.

## Reference index

- `references/presets.md` — the 5 presets: trigger, drive, measure, guide, candidate fixes.
- `references/tools.md` — agent-device / agent-react-devtools / metro-mcp cheatsheets + routing. **Read before invoking a tool.**
- `references/measurement.md` — N-run variance protocol, the gate math, why single samples lie.
- `references/perf-map.md` — detectors, scoring, signal-vs-noise gating, Top-3 emission format.
- `references/memory.md` — Performance Memory entry format, read/append/compaction policy.
- `.metrognome/config.json` — per-repo settings (commit mode, live report, N, k, budget). Edited via **Configurations** menu.
- `assets/report.template.html` + `scripts/build_run_report.mjs` — live progress dashboard (written when `liveReport` is on).
- `.metrognome/run-state.json` — loop writes this after each iteration (gitignored); drives the live report.
