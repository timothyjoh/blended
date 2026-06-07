/**
 * Blended walkthrough capture runner.
 *
 * Invoked by the engine-intercepted `walkthrough_capture` feature step via
 * `.cycle/walkthrough.sh` with `CYCLE_ARTIFACT_DIR` in env and cwd = repo root,
 * under `engine.walkthrough_hook_timeout_ms`. It boots blended's OWN ephemeral
 * Astro **dev** server (the app is `output: 'server'` + the Vercel adapter, which
 * has no `astro preview`; the dev server is what the e2e suite drives too), opens
 * a video-recording Chromium page, and saves screenshots + `walkthrough.webm`
 * into `$CYCLE_ARTIFACT_DIR/walkthrough/`. The engine then lists that dir and
 * writes the `walkthrough-artifacts.json` manifest — that manifest is
 * engine-owned and records media files only.
 *
 * This hook additionally PRODUCES a hook-owned degradation sidecar:
 * `$CYCLE_ARTIFACT_DIR/walkthrough-errors.json` (phase-aware:
 * `walkthrough-<phase>-errors.json`) carrying `{ degraded, reason, errors }`.
 * `degraded: true` means the per-cycle `walkthrough.mjs` was absent,
 * unimportable, or threw (or recorded no non-home captures) and the runner fell
 * back to the home-page capture — i.e. the walkthrough is NOT real evidence of
 * this cycle's functionality. The sidecar survives independent of the
 * engine-written manifest; the reflection step reads it and flags a degraded
 * walkthrough on a UI-shipping `feature` cycle. The write is best-effort and
 * never fails the cycle.
 *
 * It runs the per-cycle scenario at `$CYCLE_ARTIFACT_DIR/walkthrough.mjs`
 * (dynamic `import()` of a `file://` URL); if that scenario is absent,
 * unimportable, or throws, it degrades to a default home-page capture so a cycle
 * always yields something observable.
 *
 * Resilience contract: this step is SUPPLEMENTARY and must NEVER fail a cycle.
 * The engine treats a non-zero hook exit as fatal, so `captureWalkthrough` never
 * throws (it catches everything and returns
 * `{ media, chapters, errors, degraded, reason }`) and `main()` unconditionally
 * `process.exit(0)` — including when the sidecar write fails. Every degraded
 * path emits a loud one-line `[blended-walkthrough] …` stderr diagnostic —
 * nothing is swallowed.
 *
 * Plain JS / `.mjs`, dependencies are `playwright` + node built-ins only (no
 * project `.ts` imports), so it runs under a bare `node`.
 */

import { chromium } from "playwright";
import { join, dirname } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const LOG_PREFIX = "[blended-walkthrough] ";
const MEDIA_DIRNAME = "walkthrough";
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Dedicated port (distinct from the e2e config's 4399) so a lingering test
// server can't be mistaken for ours and ours is torn down cleanly.
const DEV_PORT = 4478;
const BASE_URL = `http://127.0.0.1:${DEV_PORT}`;
const SERVER_READY_TIMEOUT_MS = 90_000;

function logDiag(msg) {
  process.stderr.write(`${LOG_PREFIX}${msg}\n`);
}

// The chapter marker recorded by `defaultFallback` — its presence as the ONLY
// chapter marks a run that degraded to the home-page capture.
const HOME_CHAPTER = "00-home";

/**
 * Pure, total degradation decision. Given the scenario outcome and the chapters
 * recorded, decide whether this run degraded to the home-page fallback. Never
 * throws on missing/empty inputs — empty/missing inputs resolve to a well-formed
 * `{ degraded: true, reason }`.
 *
 * @param {{ outcome?: { fellBack?: boolean, reason?: string|null }, chapters?: string[] }} [input]
 * @returns {{ degraded: boolean, reason: string }}
 */
export function decideDegradation({ outcome, chapters } = {}) {
  const ch = Array.isArray(chapters) ? chapters : [];
  const nonHome = ch.filter((c) => c !== HOME_CHAPTER);
  if (outcome?.fellBack === true) {
    const r =
      typeof outcome.reason === "string" && outcome.reason.trim()
        ? outcome.reason.trim()
        : "scenario fell back to default home capture";
    return { degraded: true, reason: r };
  }
  if (nonHome.length === 0) {
    return {
      degraded: true,
      reason: "scenario ran but recorded no non-home captures",
    };
  }
  return {
    degraded: false,
    reason: `scenario recorded ${nonHome.length} non-home capture(s)`,
  };
}

/**
 * Phase-aware sidecar filename, mirroring the engine's
 * `walkthrough-${phase}-artifacts.json` / `walkthrough-artifacts.json`.
 *
 * @param {string|undefined} phase
 * @returns {string}
 */
export function walkthroughErrorsFileName(phase) {
  const p = typeof phase === "string" ? phase.trim() : "";
  return p ? `walkthrough-${p}-errors.json` : "walkthrough-errors.json";
}

/**
 * Pure serialization of the hook-owned sidecar payload. Coerces missing/invalid
 * fields to a well-formed default so it never throws.
 *
 * @param {{ degraded?: boolean, reason?: string, errors?: string[] }} [input]
 * @returns {{ degraded: boolean, reason: string, errors: string[] }}
 */
export function buildWalkthroughErrorsSidecar({ degraded, reason, errors } = {}) {
  return {
    degraded: degraded === true,
    reason: typeof reason === "string" ? reason : "",
    errors: Array.isArray(errors) ? errors : [],
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Boot blended's Astro dev server in its own process group (so the whole tree
 * can be killed on teardown), then poll until it answers on BASE_URL. Returns
 * `{ child }`; rejects if the server never becomes ready within the timeout.
 */
async function bootDevServer() {
  const child = spawn(
    "npm",
    ["run", "dev", "--", "--port", String(DEV_PORT), "--host", "127.0.0.1"],
    { cwd: REPO_ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  // Drain stdio so a chatty dev server can't fill the pipe buffer and stall.
  child.stdout?.on("data", () => {});
  child.stderr?.on("data", () => {});
  let exited = false;
  child.on("exit", () => {
    exited = true;
  });

  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited) throw new Error("dev server exited before becoming ready");
    try {
      const res = await fetch(BASE_URL, { method: "GET" });
      // Any HTTP response (even a 404/500) means the server is up and serving.
      if (res) return { child };
    } catch {
      // not up yet
    }
    await sleep(1000);
  }
  throw new Error(`dev server not ready after ${SERVER_READY_TIMEOUT_MS}ms`);
}

/** SIGTERM → grace → SIGKILL the dev server's whole process group. Never throws. */
async function killDevServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const pgid = -child.pid;
  try {
    process.kill(pgid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {}
  }
  for (let i = 0; i < 15; i++) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await sleep(200);
  }
  try {
    process.kill(pgid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {}
  }
}

/**
 * Build the `{ page, capture, baseURL }` scenario harness. `capture(name)`
 * writes `walkthrough/<name>.png` (full page) and records a chapter marker.
 */
async function makeHarness(page, baseURL, mediaDir, errors) {
  const chapters = [];
  await mkdir(mediaDir, { recursive: true });
  async function capture(name) {
    try {
      await page.screenshot({ path: join(mediaDir, `${name}.png`), fullPage: true });
      chapters.push(name);
    } catch (err) {
      const reason = `capture(${name}) failed: ${String(err?.message ?? err)}`;
      errors.push(reason);
      logDiag(reason);
    }
  }
  return { harness: { page, baseURL, capture }, chapters };
}

/**
 * Default fallback capture: the app's home page. Used when the per-cycle
 * scenario is absent, unimportable, or throws. Waits on `load` (NOT
 * `networkidle` — InstantDB realtime sync keeps the network busy) plus a short
 * settle for client-island hydration.
 */
async function defaultFallback(harness, errors) {
  const { page, baseURL, capture } = harness;
  try {
    await page.goto(baseURL, { waitUntil: "load", timeout: 30_000 });
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await sleep(2500); // let React islands hydrate / InstantDB first paint
    await capture("00-home");
  } catch (err) {
    const reason = `fallback home capture: ${String(err?.message ?? err)}`;
    errors.push(reason);
    logDiag(reason);
  }
}

/**
 * Import the per-cycle `walkthrough.mjs` scenario and run it against the
 * harness, degrading to {@link defaultFallback} on any error. Returns a
 * structured outcome `{ fellBack, reason }` so the caller can derive the
 * degradation signal (`fellBack: true` means the fallback was taken).
 */
async function runScenarioOrFallback(harness, artifactDir, errors) {
  const scenarioPath = join(artifactDir, "walkthrough.mjs");
  try {
    const mod = await import(pathToFileURL(scenarioPath).href);
    const scenario = mod.default;
    if (typeof scenario !== "function") {
      throw new Error("walkthrough.mjs default export is not a function");
    }
    await scenario(harness);
    return { fellBack: false, reason: null };
  } catch (err) {
    const reason =
      err?.code === "ERR_MODULE_NOT_FOUND"
        ? "no walkthrough.mjs"
        : String(err?.message ?? err);
    errors.push(reason);
    logDiag(`scenario unavailable (${reason}); falling back to default home capture`);
    await defaultFallback(harness, errors);
    return { fellBack: true, reason };
  }
}

/**
 * Orchestrate one walkthrough capture. NEVER throws. `scenarioRunner` is
 * injectable for tests; defaults to {@link runScenarioOrFallback}.
 */
export async function captureWalkthrough({ artifactDir, scenarioRunner } = {}) {
  const errors = [];
  const media = [];
  let chapters = [];

  // Single funnel for every return path so none can return the old shape
  // without the `degraded`/`reason` fields. `outcome` carries whether the
  // run fell back (and why); the chapter list is the secondary signal.
  const finalize = ({ outcome }) => {
    const { degraded, reason } = decideDegradation({ outcome, chapters });
    return { media, chapters, errors, degraded, reason };
  };

  if (!artifactDir) {
    logDiag("captureWalkthrough called without artifactDir; nothing to capture");
    errors.push("missing artifactDir");
    return finalize({ outcome: { fellBack: true, reason: "missing artifactDir" } });
  }

  const phase = process.env.CYCLE_WALKTHROUGH_PHASE?.trim() || undefined;
  const mediaDir = phase
    ? join(artifactDir, MEDIA_DIRNAME, phase)
    : join(artifactDir, MEDIA_DIRNAME);

  try {
    await mkdir(mediaDir, { recursive: true });
  } catch (err) {
    logDiag(`failed to create media dir: ${String(err?.message ?? err)}`);
    errors.push(`mkdir media dir: ${String(err?.message ?? err)}`);
    return finalize({
      outcome: { fellBack: true, reason: `mkdir media dir: ${String(err?.message ?? err)}` },
    });
  }

  let boot;
  try {
    boot = await bootDevServer();
  } catch (err) {
    logDiag(`dev server boot failed: ${String(err?.message ?? err)}`);
    errors.push(`boot: ${String(err?.message ?? err)}`);
    return finalize({
      outcome: { fellBack: true, reason: `boot: ${String(err?.message ?? err)}` },
    });
  }
  const { child } = boot;

  const videoDir = join(mediaDir, ".video-tmp");
  let browser;
  let context;
  let page;
  // Defaults to "ran" so a genuine capture crash that records no chapters still
  // resolves to `degraded: true` via the "no non-home captures" branch (rather
  // than being mistaken for an intentional fallback).
  let outcome = { fellBack: false, reason: null };
  try {
    await mkdir(videoDir, { recursive: true });
    browser = await chromium.launch();
    context = await browser.newContext({
      recordVideo: { dir: videoDir },
      viewport: { width: 1280, height: 800 },
    });
    page = await context.newPage();

    const { harness, chapters: ch } = await makeHarness(page, BASE_URL, mediaDir, errors);
    chapters = ch;

    const runner = scenarioRunner ?? runScenarioOrFallback;
    // A custom injected `scenarioRunner` returning `undefined` is treated as
    // "ran" (`{ fellBack: false }`); the chapter check is then the signal.
    outcome = (await runner(harness, artifactDir, errors)) ?? { fellBack: false, reason: null };
  } catch (err) {
    logDiag(`capture failed: ${String(err?.message ?? err)}`);
    errors.push(`capture: ${String(err?.message ?? err)}`);
  } finally {
    try {
      const video = page?.video();
      await page?.close().catch((e) => logDiag(`page.close failed: ${String(e?.message ?? e)}`));
      if (video) {
        try {
          await video.saveAs(join(mediaDir, "walkthrough.webm"));
          await video.delete().catch(() => {});
        } catch (err) {
          logDiag(`video save failed: ${String(err?.message ?? err)}`);
          errors.push(`video save: ${String(err?.message ?? err)}`);
        }
      }
    } catch (err) {
      logDiag(`video teardown failed: ${String(err?.message ?? err)}`);
      errors.push(`video teardown: ${String(err?.message ?? err)}`);
    }
    if (context) await context.close().catch((e) => logDiag(`context.close failed: ${String(e?.message ?? e)}`));
    if (browser) await browser.close().catch((e) => logDiag(`browser.close failed: ${String(e?.message ?? e)}`));
    await killDevServer(child);
    // Best-effort: remove the temp video dir (the saved .webm lives in mediaDir).
    await import("node:fs/promises").then(({ rm }) =>
      rm(videoDir, { recursive: true, force: true }).catch(() => {}),
    );
  }

  for (const name of chapters) media.push(`${name}.png`);
  media.push("walkthrough.webm");
  return finalize({ outcome });
}

async function main() {
  try {
    const artifactDir = process.env.CYCLE_ARTIFACT_DIR;
    if (!artifactDir) {
      logDiag("CYCLE_ARTIFACT_DIR unset; nothing to capture");
      process.exit(0);
    }
    const result = await captureWalkthrough({ artifactDir });
    const phase = process.env.CYCLE_WALKTHROUGH_PHASE?.trim() || undefined;
    const sidecarName = walkthroughErrorsFileName(phase);
    // Best-effort: a sidecar-write failure (unwritable dir, ENOSPC) must NOT
    // fail the cycle — log it, record it in `errors[]`, and still exit 0.
    try {
      await writeFile(
        join(artifactDir, sidecarName),
        JSON.stringify(buildWalkthroughErrorsSidecar(result), null, 2) + "\n",
      );
      logDiag(`wrote ${sidecarName} (degraded=${result.degraded}; reason=${result.reason})`);
    } catch (err) {
      const msg = `sidecar write failed: ${String(err?.message ?? err)}`;
      result.errors.push(msg);
      logDiag(msg);
    }
    logDiag(`done: ${result.chapters.length} screenshot(s), ${result.errors.length} error(s)`);
  } catch (err) {
    logDiag(`unexpected failure (continuing, exit 0): ${String(err?.message ?? err)}`);
  } finally {
    process.exit(0);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
