#!/usr/bin/env node
/**
 * doctor.mjs — metrognome preflight + first-run setup.
 *
 * Run from the TARGET RN repo. Verifies the toolchain, a clean git tree, and
 * the .metrognome/ workspace. With --init it bootstraps the workspace.
 *
 * Usage:
 *   node doctor.mjs            # report checklist
 *   node doctor.mjs --init     # also create .metrognome/ if missing
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const repo = process.cwd();
const doInit = process.argv.includes('--init');
const ok = (b) => (b ? '\x1b[32mOK \x1b[0m' : '\x1b[31mXX \x1b[0m');
const warn = '\x1b[33m?? \x1b[0m';

function has(cmd) {
  try { execSync(`command -v ${cmd}`, { stdio: 'ignore' }); return true; } catch { return false; }
}
function sh(cmd) {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; }
}

const PERF_MEMORY_HEADER = (name) => `# Performance Memory — ${name}

> metrognome's per-repo brain. One line per perf gap:
> \`area/file · symptom · suspected cause · preset · status(open|fixed|reverted) · ref\`
> Read at the start of any perf work. Commit this file with the app.

<!-- entries below, newest first -->
`;

const DEFAULT_CONFIG = {
  commitMode: 'per-iteration', // "per-iteration" | "one-commit" | "no-commit"
  liveReport: false,           // write/refresh .metrognome/report.html during the run
  openReport: true,            // auto-open report.html when liveReport is on
  runs: 5,                     // N measurement runs per iteration
  warmupDiscard: 1,            // warm-up runs to discard
  k: 2,                        // gate noise multiplier
  budget: 6,                   // max iterations per run (0 = run until no fix clears gate)
};

const GITIGNORE_CONTENT = `# metrognome — generated run artifacts (not committed with the app)
report.html
run-state.json
`;


function bootstrap() {
  const dir = path.join(repo, '.metrognome');
  fs.mkdirSync(path.join(dir, 'ledger'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'archive'), { recursive: true });

  const mem = path.join(dir, 'perf-memory.md');
  if (!fs.existsSync(mem)) fs.writeFileSync(mem, PERF_MEMORY_HEADER(path.basename(repo)));

  const cfg = path.join(dir, 'config.json');
  if (!fs.existsSync(cfg)) fs.writeFileSync(cfg, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');

  const gi = path.join(dir, '.gitignore');
  if (!fs.existsSync(gi)) fs.writeFileSync(gi, GITIGNORE_CONTENT);

  console.log(`  bootstrapped ${path.relative(repo, dir) || '.metrognome'}/ (perf-memory.md, config.json, ledger/, archive/)`);
  console.log(`  .metrognome/.gitignore created — report.html and run-state.json are gitignored`);
}

function main() {
  console.log(`\nmetrognome doctor — ${repo}\n`);

  const node = process.versions.node;
  const nodeOk = parseInt(node, 10) >= 18;
  console.log(`  ${ok(nodeOk)} node ${node} (>=18 required)`);

  const requireLocal = createRequire(import.meta.url);
  let babelOk = true;
  try { requireLocal('@babel/parser'); requireLocal('@babel/traverse'); } catch { babelOk = false; }
  console.log(`  ${ok(babelOk)} @babel/parser + @babel/traverse${babelOk ? '' : ' — run: npm install in the metrognome plugin root'}`);

  const ad = has('agent-device');
  const ard = has('agent-react-devtools');
  console.log(`  ${ad ? ok(true) : warn} agent-device ${ad ? '' : '— install: npm i -g agent-device (or use npx)'}`);
  console.log(`  ${ard ? ok(true) : warn} agent-react-devtools ${ard ? '' : '— install: npm i -g agent-react-devtools (or use npx)'}`);
  console.log(`  ${warn} metro-mcp — bundled via this plugin's .mcp.json (npx -y metro-mcp@latest); needs a LIVE Metro session to return data`);
  console.log(`  ${warn} react-native-best-practices — install the Callstack agent-skill from callstackincubator/agent-skills`);

  const isGit = !!sh('git rev-parse --is-inside-work-tree');
  console.log(`  ${ok(isGit)} inside a git repo ${isGit ? '' : '— git-as-memory needs version control'}`);
  if (isGit) {
    const dirty = sh('git status --porcelain');
    const clean = dirty === '';
    console.log(`  ${ok(clean)} clean git tree ${clean ? '' : '— commit/stash before an Autoresearch run (auto-revert needs a clean baseline)'}`);
  }

  const isRN = fs.existsSync(path.join(repo, 'package.json')) &&
    /react-native|expo/.test(sh('cat package.json') || '');
  console.log(`  ${isRN ? ok(true) : warn} looks like a React Native / Expo app`);

  const mgExists = fs.existsSync(path.join(repo, '.metrognome'));
  if (mgExists) {
    console.log(`  ${ok(true)} .metrognome/ workspace present`);
    const cfgExists = fs.existsSync(path.join(repo, '.metrognome', 'config.json'));
    if (!cfgExists) {
      const cfg = path.join(repo, '.metrognome', 'config.json');
      fs.writeFileSync(cfg, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
      console.log(`  ${ok(true)} .metrognome/config.json created with defaults`);
    } else {
      console.log(`  ${ok(true)} .metrognome/config.json present`);
    }
  } else if (doInit) { bootstrap(); }
  else console.log(`  ${warn} .metrognome/ not found — run: node doctor.mjs --init  (creates the per-repo memory, config.json, ledger)`);

  console.log(`\n  Live checks you must do against the running app (not testable here):`);
  console.log(`    - a Metro/Expo dev server is running`);
  console.log(`    - a simulator/emulator/device is attached:  agent-device apps --platform ios`);
  console.log(`    - the react-devtools daemon connects:        agent-react-devtools start && agent-react-devtools status`);
  console.log(`    - before metro-mcp runtime calls (evaluate_js, profiler): close ALL React Native`);
  console.log(`      DevTools / Fusebox browser windows — RN < 0.85 allows only one CDP connection.`);
  console.log(`    - confirm exactly one live Hermes target is present:`);
  console.log(`        curl -s localhost:8081/json/list | jq '.[] | {id,title,vm}'`);
  console.log(`      On New Arch the JS runtime page has nativePageReloads:true + prefersFuseboxFrontend:true.`);
  console.log(`      If metro-mcp runtime calls still time out, set newArchitecture:true in metro-mcp config.`);
  console.log(``);
  console.log(`  Cross-platform heap leak check (works on iOS Simulator, iOS device, Android):`);
  console.log(`    node <plugin>/skills/metrognome/scripts/heap_sample.mjs --once`);
  console.log(`    node <plugin>/skills/metrognome/scripts/heap_sample.mjs --cycles 5`);
  console.log(`    Then: node stats.mjs --baseline <csv> --candidate <csv> --direction lower --unit bytes`);
  console.log(``);
  console.log(`  Platform note — displayed-frame FPS:`);
  console.log(`    iOS Simulator: NOT available (Apple constraint — Simulator renders on host Mac GPU).`);
  console.log(`    iOS real device: Instruments / XCTest hitch metrics.`);
  console.log(`    Android: Flashlight (bamlab/flashlight) via dumpsys gfxinfo — zero app instrumentation.`);
  console.log(`    For 'listing' on Simulator, gate on re-renders or longtask ms instead of FPS.\n`);
}

main();
