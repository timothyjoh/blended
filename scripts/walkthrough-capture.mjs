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
 * writes `walkthrough-artifacts.json` — this hook only PRODUCES media.
 *
 * It runs the per-cycle scenario at `$CYCLE_ARTIFACT_DIR/walkthrough.mjs`
 * (dynamic `import()` of a `file://` URL); if that scenario is absent,
 * unimportable, or throws, it degrades to a default home-page capture so a cycle
 * always yields something observable.
 *
 * Resilience contract: this step is SUPPLEMENTARY and must NEVER fail a cycle.
 * The engine treats a non-zero hook exit as fatal, so `captureWalkthrough` never
 * throws (it catches everything and returns `{ media, chapters, errors }`) and
 * `main()` unconditionally `process.exit(0)`. Every degraded path emits a loud
 * one-line `[blended-walkthrough] …` stderr diagnostic — nothing is swallowed.
 *
 * Plain JS / `.mjs`, dependencies are `playwright` + node built-ins only (no
 * project `.ts` imports), so it runs under a bare `node`.
 */

import { chromium } from "playwright";
import { join, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
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
 * harness, degrading to {@link defaultFallback} on any error.
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
    return;
  } catch (err) {
    const reason =
      err?.code === "ERR_MODULE_NOT_FOUND"
        ? "no walkthrough.mjs"
        : String(err?.message ?? err);
    errors.push(reason);
    logDiag(`scenario unavailable (${reason}); falling back to default home capture`);
    await defaultFallback(harness, errors);
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

  if (!artifactDir) {
    logDiag("captureWalkthrough called without artifactDir; nothing to capture");
    errors.push("missing artifactDir");
    return { media, chapters, errors };
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
    return { media, chapters, errors };
  }

  let boot;
  try {
    boot = await bootDevServer();
  } catch (err) {
    logDiag(`dev server boot failed: ${String(err?.message ?? err)}`);
    errors.push(`boot: ${String(err?.message ?? err)}`);
    return { media, chapters, errors };
  }
  const { child } = boot;

  const videoDir = join(mediaDir, ".video-tmp");
  let browser;
  let context;
  let page;
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
    await runner(harness, artifactDir, errors);
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
  return { media, chapters, errors };
}

async function main() {
  try {
    const artifactDir = process.env.CYCLE_ARTIFACT_DIR;
    if (!artifactDir) {
      logDiag("CYCLE_ARTIFACT_DIR unset; nothing to capture");
      process.exit(0);
    }
    const result = await captureWalkthrough({ artifactDir });
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
