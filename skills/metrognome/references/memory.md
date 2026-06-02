# Performance Memory

metrognome accumulates a terse per-repo log of every perf gap it encounters across sessions, and routes future work from those priors. That's what turns a generic optimizer into *this app's* optimizer.

- **Lives in the target repo**, not the plugin: `.metrognome/perf-memory.md`. Committed **with the app**, so the whole team inherits the accumulated knowledge. (The plugin is shared/open-source; the memory is per-project.)
- **Token-frugal:** one line per gap. Mirrors the index-style discipline of a good `MEMORY.md` and the ≤4-line catalog entries of `webapp-perf-playbook` — terse enough that reading the whole file at the start of a run is cheap.

## Entry format

One line per gap:

```
area/file · symptom · suspected cause · preset · status · ref
```

- **area/file** — `screens/FeedScreen.tsx` or a component name.
- **symptom** — what was observed (`18 dropped frames on scroll`, `heap +12MB / 10 cycles`).
- **suspected cause** — short hypothesis (`FlatList missing getItemLayout`).
- **preset** — `first-load | listing | memory-leaks | bundle-size | re-renders`.
- **status** — `open` (found, not yet fixed) · `fixed` (kept, measured) · `reverted` (tried, didn't clear the gate — don't retry).
- **ref** — commit SHA or ledger filename backing the claim.

### Examples

```
screens/FeedScreen.tsx · 18 dropped frames scrolling feed · FlatList no getItemLayout · listing · fixed · a1b2c3d (18→4, n=5)
screens/FeedScreen.tsx · rows re-render on every parent update · Row not memoized · re-renders · reverted · 2026-05-30-re-renders.md (Δ within noise)
state/messages/convo/index.tsx · heap +12MB / 10 open-close · useEffect no cleanup · memory-leaks · open · perf-map 2026-05-30
App.tsx · +220ms TTI · synchronous moment import at entry · first-load · fixed · d4e5f6a (−210ms, n=5)
```

## Read path (leverage priors)

At the **start of any metrognome run, and any perf-related work** in a `.metrognome/`-tracked repo, read this file first. It tells you:
- the known hotspots (skip rediscovery),
- what already worked (`fixed` → the route for this repo is proven),
- what to **not** retry (`reverted` → it didn't clear the gate here; don't burn a cycle on it).

A repo prior layered over the generic Callstack guides = faster, sharper routing. Once populated, a new symptom is matched against memory and the skill often already knows the preset + fix that worked here — that's the "centralized performance agent" payoff.

## Write path (accumulate)

Append a one-line entry whenever:
- a gap is **discovered** (Perf Map hotspot, an autoresearch baseline, or ad-hoc perf work) → `status: open`,
- a fix is **validated** (KEEP) → `status: fixed`, with the commit and the measured delta in the ref,
- a fix is **reverted** (didn't clear the gate) → `status: reverted`, with the ledger ref.

Distill a verbose Ledger entry into a single durable Memory line — the Ledger holds the full distributions; the Memory holds the lesson.

## Compaction policy

Keep the file small and high-signal:
- **Merge duplicates** — repeated mentions of the same file/symptom collapse to the latest status.
- **Archive resolved+verified** — move `fixed` (and stale `reverted`) lines older than the active work to `.metrognome/archive/perf-memory-<date>.md`. Keep `open` items and recent results in the live file.
- Trigger compaction when the live file exceeds ~50 lines or feels noisy. The live file should read like a current to-do + proven-route list, not a full history.

## Bootstrap header

Doctor stamps a new `.metrognome/perf-memory.md` with this header:

```markdown
# Performance Memory — <repo name>

> metrognome's per-repo brain. One line per perf gap:
> `area/file · symptom · suspected cause · preset · status(open|fixed|reverted) · ref`
> Read at the start of any perf work. Commit this file with the app.

<!-- entries below, newest first -->
```
