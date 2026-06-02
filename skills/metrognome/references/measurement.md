# Measurement & the Gate

## Why single samples lie

Device performance is noisy: thermals, garbage collection, background work, JIT/Hermes warm-up, and OS scheduling all move a number run-to-run by 5–15% with no code change. A single before/after pair will routinely show a "win" that is pure jitter — and if you keep unmeasured wins, your commit history fills with changes that did nothing (or regressed) and you can't tell which. metrognome's entire credibility rests on **only keeping changes whose improvement is larger than the measurement noise.**

## The N-run protocol

For both baseline and candidate:

1. Run the preset's measurement **N times** (default **N=5**).
2. **Discard one warm-up run** (the first run pays JIT/cache costs). Keep the remaining N−1.
3. Compute **mean ± sample stddev** over the kept runs (`scripts/stats.mjs`).

Use the *same* driving workload each time (same scroll distance, same cycle count) — a `.ad` replay script from agent-device makes this exact. Differences in the workload are a hidden variable that defeats the gate.

## The gate

Keep a change only if its improvement clears the **noise band**:

```
improvement = (lower-is-better) ? baseline_mean − candidate_mean
                                : candidate_mean − baseline_mean      // FPS
pooled_std  = sqrt(((n₁−1)·s₁² + (n₂−1)·s₂²) / (n₁+n₂−2))
noise_band  = max(min_effect, k · pooled_std)            // k ≈ 2
KEEP  ⇔  improvement > noise_band
```

Two thresholds, both must be cleared:
- **`k · pooled_std`** — statistical: the change must stand out from run-to-run jitter (k≈2 ≈ keep only clearly-separated distributions).
- **`min_effect`** — practical: an absolute floor so you don't chase a real-but-trivial 2 ms. Set per preset (e.g. TTI 30 ms, jank 2 dropped frames, RAM a few MB, FPS 2–3 fps, bundle a few KB).

Direction per metric: **lower-is-better** for TTI, jank, RAM, bundle bytes, wasted commits; **higher-is-better** for FPS.

## Choose a metric your platform can actually measure

Before baselining, confirm that the metric you plan to gate on is available on your target platform. Using a metric that returns N/A or a constant zero defeats the gate.

| Metric | iOS Simulator | iOS device | Android |
|---|---|---|---|
| **Displayed-frame FPS** | ❌ unavailable (Apple constraint) | ✅ Instruments / XCTest hitch metrics | ✅ Flashlight (`dumpsys gfxinfo`) |
| **JS-thread jank** (longtask ms) | ✅ CDP `PerformanceObserver` | ✅ | ✅ |
| **Re-render commit count / slow renders** | ✅ agent-react-devtools | ✅ | ✅ |
| **JS-heap bytes** (leak signal) | ✅ `heap_sample.mjs` (CDP) | ✅ | ✅ |
| **Startup / TTI** | ✅ | ✅ | ✅ |
| **CPU / memory (OS)** | ✅ agent-device (no FPS column) | ✅ | ✅ |

For `listing` on an iOS Simulator, gate on **re-render count** (`agent-react-devtools profile rerenders`) or **longtask duration** rather than FPS. For `memory-leaks` on any platform, use **`heap_sample.mjs --cycles N`** piped into `stats.mjs --direction lower --unit bytes`.

## Run it

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/metrognome/scripts/stats.mjs" \
  --baseline  "1200,1180,1210,1190" \
  --candidate "980,1000,990,1010" \
  --min-effect 30 --k 2 --direction lower --unit ms
```

Returns JSON with both distributions, the improvement (absolute + %), the pooled std, the noise band, and `decision: KEEP | REVERT` with a reason. Self-check the math any time with `node …/stats.mjs --self-test`.

## After the decision

- **KEEP** → atomic `git commit` whose message carries the measured delta and n, e.g.
  `perf(listing): getItemLayout on FeedScreen — jank 18→4 frames (−78%, n=4)`.
- **REVERT** → `git restore .`; log it as REVERTED in the Ledger with both distributions so the same dead-end isn't retried (and record it in `perf-memory.md`).

Record **both full distributions** in the Ledger either way — a reverted result is still data, and it's what stops a future run from re-trying a proven-neutral fix.
