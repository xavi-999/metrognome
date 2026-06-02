# Perf Map 3D

A static, device-free scan of a RN repo that produces an interactive 3D graph and a Top-3 of the worst perf offenders. Nodes = source modules; edges = import relationships. Node **size = perf debt**, **color = severity**. The pipeline:

```
perf_scan.mjs  <repo>  -> graph.json        (Babel AST + detectors + scoring)
build_perf_map.mjs  graph.json  -> perf-map.html   (vendored 3d-force-graph + data, inlined, offline)
```

`build_perf_map.mjs --open` opens it; click any node for the flaw + `file:line` + Callstack guide. All tuning lives in `perf_scan.mjs`'s `CONFIG` block.

## The detectors

| Detector | Pattern | Severity | Preset |
|---|---|---|---|
| `listNoItemLayout` | FlatList/SectionList without `getItemLayout` | HIGH | listing |
| `indexAsKey` | `keyExtractor`/`key` returns the array index | HIGH | listing |
| `nestedComponent` | a named component defined inside another component | HIGH | re-renders |
| `effectNoCleanup` | `useEffect` adds a listener/timer/subscription, returns no cleanup | HIGH | memory-leaks |
| `heavyEntryImport` | full-package import of a heavy lib at an app-entry file | HIGH | first-load |
| `listRowNoMemo` | a list-row component used in a `.map`/`renderItem` but not `React.memo` | MEDIUM | re-renders |
| `inlinePropLiteral` | inline arrow / object / style literal as a JSX prop | LOW | re-renders |
| `barrelImport` | named import that resolves to a re-export barrel file | LOW | bundle-size |
| `imageNoDims` | remote `<Image>` with no explicit width/height | LOW | first-load |
| `oversizedList` | `initialNumToRender` too high / no `removeClippedSubviews` | LOW | listing |

## Scoring — and why signal beats noise

The make-or-break property is **signal vs noise**. RN static heuristics fire constantly in healthy code (a real 1465-module app yields ~1500 inline-prop and ~1400 barrel hits). A naive scorer lights up every node red and is useless. Four mechanisms keep the map honest — tuned against bluesky's `social-app` (1465 modules), which lands at **~19 hotspots (~1%)**, all structural:

1. **Severity weights.** CRITICAL 10 · HIGH 5 · MEDIUM 1.5 · LOW 0.4. The common-but-harmless detectors (inline props, barrels, image dims) are LOW by design.

2. **Per-detector diminishing returns.** Past `diminishAfter` (3) of the *same* detector in a file, extra hits add only `log2`. A config file with 150 idiomatic inline `options={{}}` props is not 150× worse than one with 2 — without this it would manufacture a fake hotspot. Distinct detectors still stack normally; rare structural findings keep full weight.

3. **Structural-only centrality.** debt = `structuralRaw · centralityMult + cosmeticRaw`, where `centralityMult = 1 + k·log2(1+fanIn) + (hasList ? listBonus : 0)`. Centrality (import fan-in) amplifies **only** MEDIUM+ structural debt — a real re-render bug in a hub imported 50× genuinely matters more than in a leaf. It does **not** amplify LOW noise, so a popular component full of inline props doesn't become a hotspot just for being popular. `log2` (not linear) keeps a 500-fan-in navigation hub from dwarfing everything (linear gave debt 262 vs 44; log gives a sane ~2–3× boost).

4. **Combined gate.** A node is a **hotspot** iff `debt ≥ hotspotDebt (6)` **OR** it has any HIGH/CRITICAL finding. The severity arm guarantees a lone memory leak or missing-`getItemLayout` in a leaf is never missed; the debt arm catches accumulated MEDIUM/LOW clusters. Everything else renders small + grey, with its findings still visible on hover/click — **low-severity hits aggregate quietly, they don't dominate the view.**

> If a scan lights up too much on a given repo, raise `hotspotDebt` (or lower a severity) in `CONFIG` — don't lower your standards in the report. Tune against the real target repo, not the seeded `examples/sample-rn-app` fixture (the fixture is circular by construction: it contains exactly what the detectors hunt, so it only proves the detectors *fire*, not that they're selective).

## Display filter & search

The Perf Map renders only nodes with `debt ≥ displayMinDebt` (CONFIG default **2**) — dropping the near-zero cold cloud while keeping all structural and accumulated debt. This is **adjustable live** via the `min debt` number control in the search panel (top-left, below the hero banner); links whose source or target falls below the threshold are also dropped (preventing phantom nodes from dangling edges). Nodes with debt 2–6 that aren't hotspots still render grey, so the "below gate" legend entry holds. The header `modules` stat always shows the true scanned count; the `N / M modules` counter in the panel reflects what's currently rendered.

A **search box** (above the min-debt control) filters the rendered set by filename. Results are ranked by name-relevance (exact > starts-with > contains, debt as tiebreak) and show the top 5 matches. Clicking a result or pressing Enter flies the 3D camera to that node and opens its detail panel. The `window.__perfmap` handle exposes `focusNode`, `applyThreshold`, and `rankMatches` for automated verification.

## Import resolution (correctness, not cosmetics)

Real RN apps import almost everything through **path aliases** (`#/…`, `@/…`), not `../`. `perf_scan.mjs` reads `tsconfig.json`/`jsconfig.json` `compilerOptions.paths` (walking up from the scan root) to resolve them. Without this the dependency graph is a disconnected cloud and fan-in (hence centrality) is meaningless — on bluesky, alias resolution took the graph from 814 edges to 8862 and exposed real hubs (fan-in up to 582). If `aliases (none found)` prints and the graph looks sparse, the repo may use a babel `module-resolver` alias not mirrored in tsconfig — add it to the tsconfig paths or extend `loadAliases`.

## Top-3 emission

`graph.json` includes a `top3` array (also printed by `perf_scan.mjs`). Each entry is a ready-to-paste Autoresearch command — present them verbatim:

```
1. [debt 19.31] /metrognome listing --target Gallery
     FlatList/SectionList without getItemLayout (FlatList) at components/images/Gallery/index.tsx:252
```

The `--target` is derived from the component/screen name (for `index.*` files, the parent folder), and the preset comes from the dominant (highest-severity) finding. Pasting one straight into Autoresearch closes the diagnose→fix loop.
