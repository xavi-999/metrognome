---
name: metrognome
description: React Native performance optimization. Open the metrognome menu (Autoresearch / Perf Map 3D / Doctor), or pass a preset/target/natural-language goal to skip straight to work.
argument-hint: "[first-load|listing|memory-leaks|bundle-size|re-renders] [--target <Screen/Component>] | <natural-language goal>"
---

Use the **metrognome** skill (`skills/metrognome/SKILL.md`) to handle this request. metrognome routes React Native performance work through metro-mcp and Callstack's tooling (agent-device, agent-react-devtools, react-native-best-practices) and runs a scientific propose -> measure -> keep/revert loop, builds an interactive 3D Perf Map, and maintains a per-repo performance memory.

Read `${CLAUDE_PLUGIN_ROOT}/skills/metrognome/SKILL.md` now and follow it.

ARGUMENTS: $ARGUMENTS

Routing:
- **No arguments** -> present the top menu (Autoresearch / Perf Map 3D / Doctor / Configurations) per SKILL.md's menu rules.
- **A preset name** (`first-load`, `listing`, `memory-leaks`, `bundle-size`, `re-renders`), optionally with `--target` -> skip the menu and run that Autoresearch preset.
- **Natural language** (e.g. "fix jank on the feed list", "the app is slow to start") -> map it to the closest preset/target and confirm before running the loop.
- **`config` or `configurations`** -> open the Configurations menu (view/edit `.metrognome/config.json`).

Before doing anything else, run the Doctor preflight described in SKILL.md (tools present, Metro session live, auto-fix setup, metrognome scopes git to its own changes — pre-existing user edits are left untouched, load the repo's performance memory).

Note: if running scripts outside a Claude session, ensure `npm install` has been run in the plugin root first.
