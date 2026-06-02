# Tools & Signal Routing

metrognome delegates all measurement to four Callstack tools. This file is the **cheatsheet + routing table**. Command surfaces drift between releases — when something doesn't match, the installed CLI help is the source of truth (`agent-device help workflow`, `agent-react-devtools --help`) and the live MCP tool list for metro-mcp. **This is the single file to update before a pitch or when a tool version bumps.** (Verified against: metro-mcp 0.11.x, agent-device 0.16.x, agent-react-devtools 0.4.x.)

## Routing — which tool for which signal

| Signal you need | Tool | Why |
|---|---|---|
| Drive the app (open, tap, type, scroll, gestures, wait, assert) | agent-device | the user-simulation layer; produces the workload you measure |
| CPU/memory **device** samples, video, traces, crash context, `.ad` replay | agent-device | on-device evidence capture |
| Per-component re-render causes, slow renders, commit timeline | agent-react-devtools | the only React-fiber-aware source |
| Hermes CPU profile, heap sampling, network, console/exceptions, JS eval, navigation | metro-mcp | CDP into Metro/Hermes, no app code changes |
| Which fix to try | react-native-best-practices | the hypothesis catalog (mapped per preset in `presets.md`) |

CPU shows up in more than one tool on purpose. Prefer **metro-mcp** for Hermes-level JS CPU/heap and **agent-device** for OS-level device CPU/memory while driving a real workload. For anything about *components re-rendering*, only **agent-react-devtools** sees the fiber tree.

---

## agent-device (CLI)

Drives iOS Simulator, Android Emulator, physical devices, tvOS, macOS, desktop. Start every session by reading `agent-device help workflow` — it is the agent-facing source of truth.

```bash
agent-device apps --platform ios            # list installed/available apps
agent-device open <App> --platform ios      # launch app, start a session
agent-device snapshot -i                     # accessibility snapshot w/ interactive refs (@e3, …)
agent-device tap @e3                          # tap a ref (also: selectors, coords)
agent-device fill @e3 "test@example.com"     # type into a field
agent-device scroll ...                       # scroll/swipe the target list (drives `listing`)
agent-device screenshot ./artifacts/x.png    # capture evidence
agent-device close                            # end the session
```

Also exposes: gestures, `wait`/assert, video recording, logs, traces, network capture, **CPU/memory performance samples**, **React render profiles**, and `.ad` replay scripts (record an interaction once, replay it deterministically — the basis for the post-v1 CI regression guard). Use the topic help for production flows: `agent-device help <dogfooding|debugging|replay|...>`. Some iOS ops need `brew install idb-companion`.

**metrognome uses it to:** produce the workload (open/scroll/cycle) and grab device-level CPU/mem timing for `first-load`, `listing`, `memory-leaks`.

---

## agent-react-devtools (CLI daemon)

A persistent background daemon that survives across CLI calls; token-efficient output built for LLMs. Refs look like `@c5`.

**One-time app setup required (Expo SDK 55 + New Arch):** Add `import 'agent-react-devtools/connect'` as the first line of the app's entry point (e.g. `index.js`, before any React import). Run `npx agent-react-devtools init --dry-run` to see what it would add. Without this import, the daemon listens on 8097 but the Expo/New Arch app never connects — `agent-react-devtools status` will show "Apps: 0 connected" even after a reload.

```bash
agent-react-devtools start [--port 8097]     # start daemon (then run/refresh the app)
agent-react-devtools status                   # "Apps: 1 connected" when wired up
agent-react-devtools wait --connected         # block until an app connects

agent-react-devtools get tree [@c1] [--depth N] [--all] [--max-lines N]
agent-react-devtools get component <@c1>      # props, state, hooks
agent-react-devtools find <Name> [--exact]    # locate a component
agent-react-devtools count                     # component counts by type
agent-react-devtools errors                    # components with errors/warnings

agent-react-devtools profile start [name]
agent-react-devtools profile stop
agent-react-devtools profile slow [--limit N]       # slowest components by avg duration
agent-react-devtools profile rerenders [--limit N]  # most re-rendered components  <-- `re-renders` preset
agent-react-devtools profile timeline [--limit N]   # commit timeline
agent-react-devtools profile report <@c1>           # render report for a component
agent-react-devtools profile export <file>          # React DevTools Profiler JSON
agent-react-devtools profile diff <before.json> <after.json> [--threshold N]  # before/after compare
```

**metrognome uses it to:** find the dominant re-render cause (`profile rerenders`/`slow`) for the `re-renders` and `listing` presets, and `profile diff` to verify a fix at the component level.

---

## metro-mcp (bundled MCP server)

Connects to Metro via Chrome DevTools Protocol — **no app code changes** for most features. Works with Expo, bare RN, anything on Metro + Hermes. Bundled by this plugin's `.mcp.json` (`npx -y metro-mcp@latest`). Call its tools directly as MCP tools (not via Bash).

**Expo / New Arch CDP gotchas** (verified on Expo SDK 55 / RN 0.83 / New Arch, June 2026):

- **CDP channel works on New Arch.** Raw `Runtime.evaluate` succeeds against the correct target. metro-mcp's timeout on New Arch is a **target-selection bug**, not a stack incompatibility.
- **Target selection on New Arch:** RN 0.83 New Arch exposes two pages per device — page 1 `"React Native Bridgeless [C++ connection]"` (`nativePageReloads: true`, `prefersFuseboxFrontend: true`) is the live JS/Hermes runtime; page 2 `"UI [C++ connection]"` (`nativePageReloads: false`) is the UI thread and is **not JS-evaluable**. metro-mcp's `selectBestTarget` appears to prefer `nativePageReloads: false` and picks the UI thread → `Runtime.evaluate` hangs. **Workaround:** per metromcp.dev/troubleshooting, try setting metro-mcp's `newArchitecture: true` config flag — this may re-route target selection to the Fusebox JS page (unverified; check the troubleshooting page for the current fix).
- **Single CDP slot (RN < 0.85).** Hermes allows one debugger connection; there is no multiplexing. If a React Native DevTools / Fusebox frontend is open (e.g. you pressed "Open DevTools"), it holds the slot and metro-mcp's evaluate hangs. **Close all RN DevTools browser tabs / windows before calling runtime metro-mcp tools.**
- **Stale targets** (metro#985, fixed in RN 0.84+): repeated reload/relaunch can leave dead `/json/list` entries with climbing IDs (`-1`, `-2`, `-3`). If evaluate times out on a freshly-selected target, **restart Metro + launch the app once** without reloading. Stale entries from prior sessions pile up until Metro restarts.
- **The `-1` synthetic target** (`REACT_NATIVE_RELOADABLE_PAGE_ID = "-1"`, title `"React Native Experimental (Improved Chrome Reloads)"`, `vm: "don't use"`) is a ghost — it is not callable. On New Arch this ghost ID may not appear, but if it does, exclude it by `id === "-1"` (exact match only; device-scoped pages like `hash-1` are real).
- **`nativePageReloads: false` warning is benign** — it only governs which target the RN DevTools frontend auto-opens on `j`; it does **not** mean the target is non-callable.

Tool groups (counts as of 0.11.x — confirm exact names from the live tool list):

| Group | Tools | Use for |
|---|---|---|
| **profiler** | ~9 | CPU profiling (React DevTools hook) + **heap sampling** + render tracking → `first-load`, `memory-leaks` |
| **network** | ~6 | request tracking, response-body inspection, stats |
| **console** | ~2 | console log collection with filtering (catch warnings/exceptions) |
| **evaluate** | 1 | execute JS in the app runtime (read a global, force a GC, time a path) |

Plus `open_devtools` (opens the rn_fusebox frontend through the proxy so it coexists with the MCP), and recording/automation tools (`start_test_recording`, `tap_element`, `type_text`, `swipe`).

**metrognome uses it to:** take Hermes CPU profiles + heap samples per cycle (`memory-leaks`), CPU profile cold start (`first-load`), and read console exceptions during a run.

---

## Per-platform measurement matrix — what is genuinely available where

Understanding which signals each platform exposes is critical for picking the right metric in the gate. Not all limitations are tool defects — some are hard platform boundaries.

| Signal | iOS Simulator | iOS real device | Android emu/device | Channel & what it measures |
|---|---|---|---|---|
| **Displayed / GPU-composited frame FPS** | ❌ **genuine Apple constraint** — Simulator renders on the host Mac GPU; frame timing is neither exposed nor representative (WWDC'19 #418) | ✅ (Instruments / Xcode; hard to automate post-Flipper) | ✅ Flashlight (`dumpsys gfxinfo`, zero instrumentation) | OS-level — real screen pixels composited by the GPU |
| **JS-thread jank** (`PerformanceObserver longtask`) | ✅ via CDP eval | ✅ | ✅ | JS-thread saturation — heavy `renderItem`, GC pauses, oversized closures; stable in RN 0.83 |
| **Per-component re-render causes & commit timeline** | ✅ agent-react-devtools (port 8097) | ✅ | ✅ | React-fiber-aware; independent of CDP & GPU |
| **JS heap / leaks** (`Runtime.getHeapUsage` + `HeapProfiler.collectGarbage`) | ✅ **via CDP — `heap_sample.mjs`** | ✅ | ✅ | Hermes JS-object heap; monotonic growth across nav cycles = leak signal |
| **Startup / TTI** (`performance.rnStartupTiming`) | ✅ | ✅ | ✅ | RN init + bundle-exec timeline |
| **CPU / memory (OS-level)** | ✅ agent-device `metrics --json` (CPU, memory; FPS column absent) | ✅ | ✅ | XCTest (iOS) / ADB (Android) |

### What genuinely cannot be measured on the iOS Simulator — and why it is a platform boundary, not a tool defect

**Displayed-frame FPS** is the one signal that is permanently unavailable on the iOS Simulator. Apple's Simulator renders the app on the **host Mac's GPU**, and the OS does not expose per-frame display timestamps through any public API in that context (WWDC'19 session #418; confirmed by Instruments, Flashlight, and every major RN profiler). This is not a metrognome gap, a missing feature, or a fixable bug — it is an architectural property of how the Simulator works. The correct response is to route that signal to the right platform: **Flashlight** on Android, **Instruments / XCTest hitch metrics** on an iOS real device.

Every *other* performance signal — JS-thread jank, component re-renders, JS-heap growth, startup time, CPU/memory — is fully measurable on the iOS Simulator via the channels listed above.

---

## CDP-free measurement paths (work on Expo when metro-mcp runtime calls are unavailable)

`agent-react-devtools` and `agent-device` run on **completely separate channels** from metro-mcp's CDP. They are not affected by the CDP slot, stale targets, or the New Arch target-selection bug described above. The `listing` and `re-renders` presets can be **fully measured without metro-mcp's runtime channel**:

| Tool | Channel | Expo support | Signals available without CDP |
|---|---|---|---|
| **agent-react-devtools** | port 8097 (react-devtools-core WebSocket) | Requires `import 'agent-react-devtools/connect'` at the top of the app entry point (before React loads) — run `npx agent-react-devtools init` to add it. On Expo SDK 55 / RN 0.83 New Arch the auto-connection *does not* work without this import. | `profile rerenders`, `profile slow`, `profile timeline`, component tree, render causes |
| **agent-device** | XCTest (iOS) / ADB (Android) | Works with Expo dev-client builds | `metrics --json` (CPU, memory; **FPS absent on Simulator** — see matrix above); `perf --json` (OS-level); `.ad` replay |
| **Flashlight** (`bamlab/flashlight`) | Android ADB — zero app instrumentation | Android only | FPS / CPU / RAM during any scroll workload |
| **heap_sample.mjs** | CDP raw WS (page 1, Hermes JS runtime) | Works with any Metro + Hermes app; no app code changes | `Runtime.getHeapUsage` — cross-platform JS heap leak signal; use with `--cycles N` + agent-device nav cycles |

When metro-mcp's `newArchitecture` config is not yet set and the runtime channel is unavailable, **run `listing` and `re-renders` entirely on this path** — the gate math (`stats.mjs`) is identical regardless of the measurement source.

---

## react-native-best-practices (Callstack agent-skill)

Knowledge base from `callstackincubator/agent-skills`: 9 JS + 9 native + 9 bundling guides, each rated CRITICAL/HIGH/MEDIUM, organized around the cycle Measure → Optimize → Re-measure → Validate. Not vendored (avoids license/staleness) — install via Doctor. `presets.md` maps each metrognome preset to the specific guide to consult. This is the source of the *hypothesis*; metrognome supplies the *measured verdict*.
