#!/usr/bin/env node
/**
 * doctor.mjs — metrognome preflight + first-run setup.
 *
 * Run from the TARGET RN repo. Auto-bootstraps the .metrognome/ workspace,
 * probes Metro dev server + agent-react-devtools daemon live status,
 * and scopes git state reporting to inform scoped tracking — metrognome never
 * touches pre-existing dirty files.
 *
 * Usage:
 *   node doctor.mjs            # report checklist + setup actions
 *   node doctor.mjs --init     # also create .metrognome/ if missing
 *   node doctor.mjs --launch-metro  # open Metro in a new terminal (macOS best-effort)
 *                                   # or print the start command on non-macOS / failure
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const repo = process.cwd();
const doInit = process.argv.includes('--init');
const doLaunchMetro = process.argv.includes('--launch-metro');
const ok = (b) => (b ? '\x1b[32mOK \x1b[0m' : '\x1b[31mXX \x1b[0m');
const warn = '\x1b[33m?? \x1b[0m';

function has(cmd) {
  try { execSync(`command -v ${cmd}`, { stdio: 'ignore' }); return true; } catch { return false; }
}
function sh(cmd) {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; }
}

// ── Metro port (honor --port flag or RCT_METRO_PORT env) ─────────────────────
function metroPort() {
  const portIdx = process.argv.indexOf('--port');
  if (portIdx !== -1) {
    const p = parseInt(process.argv[portIdx + 1], 10);
    if (!isNaN(p)) return p;
  }
  const envPort = process.env.RCT_METRO_PORT;
  if (envPort) {
    const p = parseInt(envPort, 10);
    if (!isNaN(p)) return p;
  }
  return 8081;
}

// ── Live Metro probe (single /json/list call) ─────────────────────────────────
function probeMetro(port) {
  const url = `http://localhost:${port}/json/list`;
  const raw = sh(`curl -s --max-time 2 "${url}"`);
  if (!raw) return { reachable: false, liveTargets: 0 };
  try {
    const targets = JSON.parse(raw);
    // Exclude the synthetic "-1" ghost (REACT_NATIVE_RELOADABLE_PAGE_ID)
    const live = Array.isArray(targets) ? targets.filter(t => t.id !== '-1') : [];
    return { reachable: true, liveTargets: live.length };
  } catch {
    return { reachable: true, liveTargets: 0 };
  }
}

// ── agent-react-devtools daemon probe ────────────────────────────────────────
function probeDevtools() {
  const out = sh('agent-react-devtools status 2>/dev/null');
  if (!out) return { running: false, connected: 0 };
  const m = out.match(/Apps:\s*(\d+)\s+connected/i);
  return { running: true, connected: m ? parseInt(m[1], 10) : 0 };
}

// ── Package manager + start command detection ─────────────────────────────────
function detectStartEnv() {
  let pkgManager = 'npm';
  if (fs.existsSync(path.join(repo, 'bun.lockb'))) pkgManager = 'bun';
  else if (fs.existsSync(path.join(repo, 'pnpm-lock.yaml'))) pkgManager = 'pnpm';
  else if (fs.existsSync(path.join(repo, 'yarn.lock'))) pkgManager = 'yarn';

  let startCmd = `${pkgManager} start`;
  try {
    const raw = sh('cat package.json');
    if (raw) {
      const pkg = JSON.parse(raw);
      const scripts = pkg?.scripts || {};
      const s = scripts.start || '';
      if (/expo\s+start/.test(s)) {
        const flag = s.includes('--dev-client') ? ' --dev-client' : '';
        const runner = pkgManager === 'npm' ? 'npx' : pkgManager;
        startCmd = `${runner} expo start${flag}`;
      } else if (/react-native\s+start/.test(s)) {
        const runner = pkgManager === 'npm' ? 'npx' : pkgManager;
        startCmd = `${runner} react-native start`;
      } else if (s) {
        startCmd = `${pkgManager} start`;
      }
    }
  } catch {}

  return { pkgManager, startCmd };
}

// ── Launch Metro in a new visible terminal (macOS best-effort) ────────────────
// Always prints the command regardless of launch success — never assume success.
function launchMetro(startCmd) {
  console.log(`\n  Metro start command: ${startCmd}`);

  if (process.platform !== 'darwin') {
    console.log(`  (non-macOS) Run the command above in your terminal to start Metro.`);
    return false;
  }

  // Check if iTerm2 is running
  const iTerm2Running = (() => {
    try {
      const r = sh('pgrep -x iTerm2');
      return r !== null && r.length > 0;
    } catch { return false; }
  })();

  const escapedRepo = repo.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const escapedCmd = startCmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  let script;
  if (iTerm2Running) {
    script = `tell application "iTerm2"
  activate
  set newWindow to (create window with default profile)
  tell current session of newWindow
    write text "cd \\"${escapedRepo}\\" && ${escapedCmd}"
  end tell
end tell`;
  } else {
    script = `tell application "Terminal"
  activate
  do script "cd \\"${escapedRepo}\\" && ${escapedCmd}"
end tell`;
  }

  const tmpScript = path.join(os.tmpdir(), 'mg-launch-metro.scpt');
  try {
    fs.writeFileSync(tmpScript, script);
    execFileSync('osascript', [tmpScript], { stdio: 'ignore' });
    const term = iTerm2Running ? 'iTerm2' : 'Terminal.app';
    console.log(`  ${ok(true)} opened Metro in ${term} — watch that window for bundle output`);
    return true;
  } catch (e) {
    console.log(`  ${warn} osascript launch failed — run the command above in your own terminal`);
    return false;
  }
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

  let preExistingDirty = [];
  if (isGit) {
    const dirtyOut = sh('git status --porcelain') || '';
    preExistingDirty = dirtyOut.split('\n').map(l => l.trim()).filter(Boolean);
    if (preExistingDirty.length === 0) {
      console.log(`  ${ok(true)} git tree clean`);
    } else {
      console.log(`  ${warn} ${preExistingDirty.length} pre-existing change(s) — metrognome will leave these untouched:`);
      for (const f of preExistingDirty) console.log(`      ${f}`);
    }
  }

  const pkgRaw = sh('cat package.json') || '';
  const isRN = fs.existsSync(path.join(repo, 'package.json')) &&
    /react-native|expo/.test(pkgRaw);
  console.log(`  ${isRN ? ok(true) : warn} looks like a React Native / Expo app`);

  // ── New Arch detection ────────────────────────────────────────────────────
  let newArch = false;
  let rnVersion = null;
  try {
    const pkg = JSON.parse(pkgRaw);
    const rnDep = pkg?.dependencies?.['react-native'] || pkg?.devDependencies?.['react-native'] || '';
    const rnMatch = rnDep.match(/(\d+)\.(\d+)/);
    if (rnMatch) {
      const [, major, minor] = rnMatch.map(Number);
      rnVersion = `${major}.${minor}`;
      if (major > 0 || minor >= 76) newArch = true;
    }
  } catch {}
  const appJsonPath = path.join(repo, 'app.json');
  const appConfigPaths = ['app.config.js', 'app.config.ts', 'app.config.mjs'].map(f => path.join(repo, f));
  if (fs.existsSync(appJsonPath)) {
    try {
      const aj = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
      const flag = aj?.expo?.newArchEnabled ?? aj?.newArchEnabled;
      if (flag === true) newArch = true;
      if (flag === false) newArch = false;
    } catch {}
  }
  for (const cp of appConfigPaths) {
    if (fs.existsSync(cp)) {
      const txt = fs.readFileSync(cp, 'utf8');
      if (/newArchEnabled\s*:\s*true/.test(txt)) newArch = true;
      if (/newArchEnabled\s*:\s*false/.test(txt)) newArch = false;
    }
  }

  // ── Entry-file inspection (detect harmful connect import if present) ───────
  // RN auto-connects to agent-react-devtools on port 8097 — no app code change needed.
  // The `./connect` export is web-only; adding it to an RN entry point crashes New Arch apps.
  let connectPresent = false;
  let connectFile = null;
  let entryFile = null;
  const candidates = ['index.js', 'index.ts', 'index.tsx', 'App.js', 'App.ts', 'App.tsx'];
  try {
    const pkg = JSON.parse(pkgRaw);
    if (pkg?.main && !pkg.main.startsWith('node_modules') && !pkg.main.includes('expo-router')) {
      const mainPath = path.join(repo, pkg.main);
      if (fs.existsSync(mainPath) && !candidates.includes(pkg.main)) candidates.unshift(pkg.main);
    }
  } catch {}
  for (const c of candidates) {
    const fp = path.join(repo, c);
    if (fs.existsSync(fp)) {
      entryFile = c;
      const content = fs.readFileSync(fp, 'utf8');
      if (content.includes('agent-react-devtools/connect')) {
        connectPresent = true;
        connectFile = c;
      }
      break;
    }
  }

  // ── Live session probe ────────────────────────────────────────────────────
  const port = metroPort();
  const metro = probeMetro(port);
  const devtools = probeDevtools();
  const { startCmd } = detectStartEnv();

  console.log('');
  console.log(`  Live session:`);
  console.log(`  ${ok(metro.reachable)} Metro dev server on :${port}${metro.reachable ? ` (${metro.liveTargets} live Hermes target${metro.liveTargets !== 1 ? 's' : ''})` : ' — not reachable'}`);
  if (ard) {
    console.log(`  ${ok(devtools.running && devtools.connected > 0)} agent-react-devtools daemon — ${devtools.running ? `${devtools.connected} app${devtools.connected !== 1 ? 's' : ''} connected` : 'not running'}`);
  }
  if (!metro.reachable) {
    console.log(`  ${warn} Metro is not running. Start it with: ${startCmd}`);
    console.log(`       or run: node doctor.mjs --launch-metro  to open it in a new terminal`);
  } else if (metro.liveTargets === 0 || (devtools.running && devtools.connected === 0)) {
    console.log(`  ${warn} Metro is up but app session is dead (0 connected / 0 live Hermes targets).`);
    console.log(`       Relaunch the app: agent-device open <bundleId> --relaunch`);
    console.log(`       Then: agent-react-devtools wait --connected`);
    console.log(`       reload_app does NOT revive a dead session — only relaunching the app works.`);
  }

  // ── Setup actions ─────────────────────────────────────────────────────────
  const setupActions = [];
  if (connectPresent) {
    setupActions.push(
      `REMOVE 'agent-react-devtools/connect' import from ${connectFile}: this is a web-only export that crashes RN New Arch. RN auto-connects on port 8097 — no app code change needed.`
    );
  }
  if (newArch) {
    setupActions.push(`SET metro-mcp newArchitecture:true in metro-mcp config (New Arch detected${rnVersion ? ` — RN ${rnVersion}` : ''})`);
  }

  console.log('');
  if (setupActions.length === 0) {
    const state = connectFile
      ? `connect import absent from entry file (correct for RN — auto-connects on 8097)`
      : entryFile ? `entry file ${entryFile} looks clean` : 'no setup actions needed';
    console.log(`  ${ok(true)} setup actions: none — ${state}`);
  } else {
    console.log(`  Setup actions (agent will handle these automatically):`);
    for (const a of setupActions) console.log(`    • ${a}`);
  }

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

  // ── --launch-metro ────────────────────────────────────────────────────────
  if (doLaunchMetro) {
    console.log(`\n  Launching Metro...`);
    launchMetro(startCmd);
  }

  console.log(`\n  Platform note — displayed-frame FPS:`);
  console.log(`    iOS Simulator: NOT available (Apple constraint — Simulator renders on host Mac GPU).`);
  console.log(`    iOS real device: Instruments / XCTest hitch metrics.`);
  console.log(`    Android: Flashlight (bamlab/flashlight) via dumpsys gfxinfo — zero app instrumentation.`);
  console.log(`    For 'listing' on Simulator, gate on re-renders or longtask ms instead of FPS.\n`);
}

main();
