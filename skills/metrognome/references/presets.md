# Presets

Five presets. Each: **Metric** · **Drive** (agent-device) · **Measure** (tool) · **Diagnose** (react-native-best-practices guide) · **Candidate fixes** (try one at a time, gate each). Always run the N-run protocol in `measurement.md`; never stack fixes.

The `--target <Screen/Component>` arg names the screen or component to focus on. If omitted, ask or infer from the Perf Map Top-3 / Performance Memory.

---

## `first-load` — cold-start / TTI

- **Prerequisites:** Metro running, ≥1 Hermes target, live app session, git `usable`. **Hermes required** — CDP heap/CPU profiling is unavailable on JSC (agent-device launch timing still works but gives less signal). See engine matrix in `references/tools.md`.
- **Metric:** time-to-interactive from launch to the home screen being usable (lower is better).
- **Drive:** `agent-device open <App>` from a cold start; time until the first interactive frame (snapshot shows the home content + tappable refs).
- **Measure:** metro-mcp profiler (Hermes CPU profile of startup) + agent-device launch timing. Inspect the CPU profile for the dominant startup cost.
- **Diagnose:** RN best-practices **bundling/lazy-loading** + **js** startup guides.
- **Candidate fixes:** lazy-load non-home screens (`React.lazy` / dynamic `import()`); defer heavy top-level imports off the boot path; trim/inline-config fonts; on Android, disable JS bundle compression (Hermes can mmap the uncompressed bundle → faster startup); move work out of module top-level into post-interaction.

## `listing` — scroll jank

- **Prerequisites:** Metro running, live app session, git `usable`. CDP-free path (agent-react-devtools + agent-device) — works on both Hermes and JSC. FPS signal requires Android/Flashlight or real iOS device (see platform note).
- **Metric:** JS-thread jank / wasted re-renders during a sustained scroll (lower is better). **Platform note:** Displayed-frame FPS is **not available on the iOS Simulator** (Apple platform constraint — see `references/tools.md` matrix); use Android/Flashlight or a real iOS device for FPS. JS-side jank signals (re-renders, longtask, CPU profile) work on Simulator.
- **Drive:** `agent-device scroll` continuously on the target list.
- **Measure (CDP-free — works on Expo incl. iOS Simulator):** `agent-react-devtools profile start` → scroll → `profile stop` → `profile slow` / `profile rerenders` (dominant re-render causes); `agent-device metrics --json` for OS-level frame health (CPU, memory; **`fps.droppedFramePercent` only meaningful on Android/device**). On Android or a real iOS device, add `Flashlight` for zero-instrumentation FPS+CPU+RAM. If metro-mcp runtime channel is available (see `references/tools.md`), correlate with Hermes CPU profile for JS-side frame budget.
- **Gate metric on iOS Simulator:** use re-render commit count (agent-react-devtools `profile rerenders`) or longtask duration (CDP `heap_sample.mjs`-style `PerformanceObserver longtask`) — `stats.mjs --direction lower --unit ms`. `min-effect` ≈ 20 ms for longtask.
- **Gate metric on Android / iOS device:** FPS (higher-is-better) from Flashlight / agent-device, `min-effect` ≈ 2–3 fps, `--direction higher`.
- **Diagnose:** RN best-practices **js/optimizing-flatlist** (and FlashList migration guide).
- **Candidate fixes:** add `getItemLayout`; stable `keyExtractor` (never the array index); `React.memo` the row component + memoize its props; tune `initialNumToRender` / `windowSize` / `maxToRenderPerBatch`; `removeClippedSubviews`; migrate to **FlashList** if list is large and heterogeneous.

## `memory-leaks` — RAM stability

- **Prerequisites:** Metro running, ≥1 Hermes target, live app session, git `usable`. **Hermes required** — `heap_sample.mjs` uses Hermes CDP. Not available on JSC (route to `bundle-size` or `listing` instead if JSC is detected).
- **Metric:** JS-heap growth across repeated open↔close cycles of the target screen (should return to baseline after GC; sustained growth = leak). Works on iOS Simulator, iOS device, Android.
- **Drive:** `agent-device` cyclic open/close of the target screen ×N (e.g. 10 cycles). Use an `.ad` replay script for a deterministic workload.
- **Measure (primary — cross-platform incl. iOS Simulator):** `heap_sample.mjs --once` after each agent-device cycle; or `heap_sample.mjs --cycles N` for a GC-bracketed N-reading series. Output is a comma-separated usedSize series ready for `stats.mjs`.
  - Each reading: `HeapProfiler.collectGarbage` → settle 400 ms → `Runtime.getHeapUsage` → record `usedSize` bytes.
  - A leak shows as `usedSize` that does not return to the baseline floor even after GC.
  - **Note:** `getHeapUsage` tracks the Hermes JS-object heap only — TypedArray backing buffers are tracked separately. Most RN leaks (retained subscribers, closures, component subtrees) live in the JS-object heap and will appear. Native memory leaks will not.
- **Measure (alternative):** metro-mcp `start_heap_sampling` / `stop_heap_sampling` for an allocation-site breakdown. Use when you need to identify *which* objects are leaking, not just that a leak exists. See `references/tools.md` for CDP gotchas.
- **Gate:** `stats.mjs --direction lower --unit bytes --min-effect 2000000 --k 2` (2 MB absolute floor; set lower, e.g. 500000, for a known-small leak in a targeted screen). Feed `--baseline` from before the fix, `--candidate` from after.
- **Diagnose:** RN best-practices **js/cleanup-effects** (effects, subscriptions, timers).
- **Candidate fixes:** return cleanup functions from `useEffect` (remove listeners, `clearInterval`/`clearTimeout`); cancel in-flight requests/subscriptions on unmount; avoid capturing large closures in long-lived refs; detach native event emitters.

## `bundle-size` — JS bundle bytes

- **Prerequisites:** git `usable`. **No device, Metro, or session required** — this is a build-time metric. Works on both Hermes and JSC. Skip the session bring-up sub-protocol entirely for this preset.
- **Metric:** production JS bundle size in bytes (lower is better). Build-time, no device.
- **Drive:** n/a — produce a release bundle (`npx react-native bundle …` / `expo export`) and measure bytes; optionally a source-map explorer for composition.
- **Measure:** bundle byte size before/after; the Perf Map flags `barrelImport` sites as suspects.
- **Diagnose:** RN best-practices **bundling/avoid-barrel-files** + tree-shaking/code-splitting guides.
- **Candidate fixes:** import leaf modules directly instead of through barrel `index` files; code-split rarely-used screens; drop or swap heavy deps (e.g. moment → a lighter date lib); enable tree-shaking-friendly imports.

## `re-renders` — wasted commits

- **Prerequisites:** Metro running, live app session (`agent-react-devtools` on port 8097), git `usable`. CDP-free path — works on both Hermes and JSC. Requires agent-react-devtools daemon running and ≥1 app connected.
- **Metric:** wasted/excessive re-renders on the target screen (lower is better).
- **Drive:** `agent-device` interactions on the target screen (the ones that feel laggy).
- **Measure:** agent-react-devtools `profile rerenders` (most re-rendered components) and `profile slow`; `get component @cN` to inspect why props change. Verify with `profile diff` before/after.
- **Diagnose:** RN best-practices **js/memoization** + **js/avoid-anonymous-functions**.
- **Candidate fixes:** memoize handlers (`useCallback`) and derived objects (`useMemo`); `React.memo` pure children; hoist static styles out of render; split oversized contexts so unrelated consumers don't re-render; stop defining components inside components.

---

## Mapping the Perf Map to a preset

The Perf Map's detectors carry the preset on each finding, so a Top-3 line maps directly:

| Detector | Preset |
|---|---|
| `listNoItemLayout`, `indexAsKey`, `oversizedList` | `listing` |
| `nestedComponent`, `inlinePropLiteral`, `listRowNoMemo` | `re-renders` |
| `effectNoCleanup` | `memory-leaks` |
| `barrelImport` | `bundle-size` |
| `heavyEntryImport`, `imageNoDims` | `first-load` |
