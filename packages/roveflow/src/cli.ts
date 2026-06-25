#!/usr/bin/env node
import { Command } from "commander";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import * as d from "./device.js";
import { slug } from "./types.js";
import { setup, doctor } from "./setup.js";
import { buildAtlas, makeVideos } from "./atlas.js";
import { buildShareZip, uploadShare } from "./share.js";
import { uninstall, keygen, installWda, exportWda } from "./signing.js";

const OUT = process.env.ROVEFLOW_OUT ?? path.resolve("roveflow-out");
const SCREENS = path.join(OUT, "screens");
const ELEMENTS_CACHE = path.join(OUT, "elements.json");
const STATE = path.join(OUT, ".state.json");   // last observed screen (name + signature)
const STEPS = path.join(OUT, "steps.jsonl");   // append-only capture log → ground truth for the atlas graph
const DEVICE_CACHE = path.join(os.tmpdir(), "roveflow-device.json");

// Reuse the platform + UDID that `setup` detected, so routine commands skip the
// slow go-ios `ios list` probe (the dominant per-command overhead).
try {
  const c = JSON.parse(readFileSync(DEVICE_CACHE, "utf8"));
  if (c.platform && !process.env.ROVEFLOW_PLATFORM) process.env.ROVEFLOW_PLATFORM = c.platform;
  if (c.udid && !process.env.ROVEFLOW_UDID) process.env.ROVEFLOW_UDID = c.udid;
} catch { /* no cache yet — detect normally */ }

const SETTLE_MS = Number(process.env.ROVEFLOW_SETTLE_MS ?? 450);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Cache + print the "set of marks". Returns the count. */
function printElements(els: d.El[]): number {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(ELEMENTS_CACHE, JSON.stringify(els));
  if (!els.length) console.log("(no labeled elements — fall back to a screenshot + `tap <x> <y> --px`)");
  else els.forEach((e, i) => console.log(`[${String(i + 1).padStart(2)}] ${(e.type || "?").padEnd(12)} ${(e.label || "").slice(0, 48).padEnd(48)}${e.id ? ` #${e.id}` : ""}`));
  return els.length;
}
async function listElements(): Promise<number> { return printElements(await d.elements()); }

type Seen = { name: string; fp: string };
function readState(): Seen | null { try { return JSON.parse(readFileSync(STATE, "utf8")); } catch { return null; } }
function priorScreens(): Seen[] {
  try { return readFileSync(STEPS, "utf8").trim().split("\n").map((l) => JSON.parse(l)); } catch { return []; }
}
/** Record the observed screen and surface dedup signals: a sheet/overlay floating
 *  over the previous screen, a no-op action (signature unchanged), or a revisit of
 *  a screen already captured under another name. This is the machinery that was
 *  missing — previously the model was the only memory of "have I seen this?". */
function recordScreen(name: string, meta: { fp: string; overlay: boolean; n: number }): void {
  const prev = readState();
  const prior = priorScreens();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(STATE, JSON.stringify({ name, fp: meta.fp }));
  appendFileSync(STEPS, JSON.stringify({ ts: new Date().toISOString(), name, fp: meta.fp, overlay: meta.overlay, n: meta.n }) + "\n");
  if (meta.overlay) console.log("⚠ overlay/sheet open over the previous screen — dismiss it (swipe the sheet down, or tap outside) before navigating, or you'll re-capture the same overlay under a new name.");
  if (prev && prev.fp === meta.fp && prev.name !== name) console.log(`⚠ no-op: signature ${meta.fp} is identical to "${prev.name}" — your last action changed nothing. Don't save this as a new screen.`);
  else { const hit = prior.find((s) => s.fp === meta.fp && s.name !== name); if (hit) console.log(`↩ revisit: same signature ${meta.fp} as "${hit.name}" — this is not a new screen, reuse that name.`); }
}

/** One round-trip "observe": screenshot + element list together (fetched in
 *  parallel), so a drive step is a single CLI call (one model turn) not several. */
async function look(name: string): Promise<void> {
  const [shot, els] = await Promise.all([d.screenshot(name, SCREENS), d.elements()]);
  console.log(shot);
  printElements(els);
  recordScreen(name, await d.screenMeta(els));
}
/** After an action, settle briefly then observe — so act+observe is one call. */
async function thenLook(name?: string): Promise<void> {
  if (!name) return;
  await sleep(SETTLE_MS);
  await look(name);
}

const program = new Command();
program.name("roveflow").description("Autopilot UX mapper for physical iPhone + Android apps — driven by Claude Code").version("0.2.1");

// ---- lifecycle ----
program.command("setup").description("Install deps + bring up tunnel/WDA/forward (one command)")
  .action(async () => { try { await setup(); } catch (e: any) { console.error("\n" + (e?.message ?? e)); process.exit(1); } });
program.command("doctor").description("Health-check the device pipeline").action(async () => { process.exit((await doctor()) ? 0 : 1); });
program.command("keygen").description("Find your signing profile + print the one command to make the signing key").action(keygen);
program.command("install-wda").description("Sign + install WebDriverAgent on the device (needs keygen first)").action(() => installWda());
program.command("export-wda").description("Export a WebDriverAgent.ipa to sign with Sideloadly/AltStore (free Apple ID, no Xcode)")
  .action(() => {
    const ipa = exportWda();
    console.log("WebDriverAgent.ipa exported:\n  " + ipa + "\n");
    console.log("Sign it with a free Apple ID — no Xcode:");
    console.log("  1. Install Sideloadly (https://sideloadly.io) or AltStore.");
    console.log("  2. Open it, drag in the .ipa above, enter your Apple ID, click Start.");
    console.log("  3. Enter the 2FA code, then unlock the iPhone and tap Trust.");
    console.log("  4. Back here, run `roveflow setup` — it auto-detects the signed app.");
  });
program.command("uninstall").description("Stop processes + remove WDA from device + delete signing artifacts").action(() => uninstall());
program.command("devices").description("List the connected phone + installed apps").action(() => {
  console.log("platform:", d.platform());
  console.log("device:", d.udid());
  console.log(d.listApps());
});

// ---- interaction primitives (what the skill calls) ----
program.command("launch <bundleId>").description("Launch an installed app").action((b) => { d.launch(b); console.log("launched", b); });
program.command("stop <bundleId>").action((b) => { d.stop(b); console.log("stopped", b); });

program.command("screenshot <name>").alias("snap").description("Capture current screen -> screens/<name>.png")
  .action(async (name) => console.log(await d.screenshot(name, SCREENS)));

program.command("tap <x> <y>").description("Tap. Add --px to give coordinates read from a screenshot.")
  .option("--px", "treat x/y as screenshot pixels (iOS divides by device scale; Android is 1:1)")
  .option("--look <name>", "after tapping, settle + screenshot + list the resulting screen")
  .action(async (x, y, o) => { const s = o.px ? await d.scale() : 1; await d.tap(+x / s, +y / s); console.log(`tapped ${x},${y}${o.px ? " (px)" : ""}`); await thenLook(o.look); });

program.command("swipe <x1> <y1> <x2> <y2>").description("Swipe/drag. Add --px for screenshot pixel coords.")
  .option("--px", "pixel coords").option("--dur <ms>", "duration ms", "600").option("--look <name>", "after swiping, settle + screenshot + list the resulting screen")
  .action(async (x1, y1, x2, y2, o) => { const s = o.px ? await d.scale() : 1; await d.swipe(+x1 / s, +y1 / s, +x2 / s, +y2 / s, +o.dur); console.log("swiped"); await thenLook(o.look); });

program.command("type <text>").description("Type into the focused field").option("--look <name>", "after typing, settle + screenshot + list")
  .action(async (t, o) => { await d.typeText(t); console.log("typed:", t); await thenLook(o.look); });
program.command("erase <n>").description("Delete N characters").action(async (n) => { await d.eraseText(+n); console.log("erased", n); });
program.command("button <name>").description("Hardware button: home | volumeup | volumedown").action(async (n) => { await d.pressButton(n); console.log("pressed", n); });
program.command("home").description("Go to springboard").option("--look <name>", "after going home, settle + screenshot + list")
  .action(async (o) => { await d.pressButton("home"); console.log("home"); await thenLook(o.look); });

program.command("find <text>").description("Find tappable elements whose label contains <text> (with point coords)")
  .action(async (t) => { const c = await d.find(t); if (!c.length) return console.log("NOT FOUND:", t); for (const e of c.slice(0, 8)) console.log(`(${e.cx.toFixed(0)},${e.cy.toFixed(0)}) [${e.area.toFixed(0)}] ${e.type} ${e.label.slice(0, 50)}`); });
program.command("taptext <text>").description("Find by label and tap the most specific match (retries)")
  .option("--look <name>", "after tapping, settle + screenshot + list the resulting screen")
  .action(async (t, o) => { const e = await d.tapText(t); console.log(`-> ${t} @ (${e.cx.toFixed(0)},${e.cy.toFixed(0)})`); await thenLook(o.look); });

program.command("look <name>").description("One step: screenshot + numbered element list in a single call (the fast drive loop)")
  .action(async (name) => { try { await look(name); } catch (err: any) { console.error(`couldn't read the screen — is the driver up? \`roveflow doctor\`\n${err?.message ?? err}`); process.exit(1); } });
program.command("elements").alias("els").description("Numbered list of on-screen elements — then tap one with `tapindex <n>` (most reliable)")
  .action(async () => {
    try { await listElements(); } catch (err: any) { console.error(`couldn't read the screen — is the driver up? \`roveflow doctor\`\n${err?.message ?? err}`); process.exit(1); }
  });
program.command("tapindex <n>").alias("tapi").description("Tap element #n from the last list (true center, no pixel math). --look <name> returns the next screen in the same call.")
  .option("--look <name>", "after tapping, settle + screenshot + list the resulting screen (one round-trip step)")
  .action(async (n, o) => {
    try {
      if (!existsSync(ELEMENTS_CACHE)) throw new Error("run `roveflow elements` or `roveflow look <name>` first to list what's on screen");
      const els: d.El[] = JSON.parse(readFileSync(ELEMENTS_CACHE, "utf8"));
      const e = els[+n - 1];
      if (!e) throw new Error(`no element #${n} — the last list had ${els.length}. Re-run \`roveflow look <name>\`.`);
      await d.tap(e.cx, e.cy);
      console.log(`-> [${n}] ${e.type} "${e.label.slice(0, 40)}" @ (${e.cx.toFixed(0)},${e.cy.toFixed(0)})`);
      await thenLook(o.look);
    } catch (err: any) { console.error(err?.message ?? err); process.exit(1); }
  });

program.command("tree").description("Print visible labeled elements (label · point · area)").action(async () => {
  const seen = new Set<string>();
  for (const e of await d.collect()) { const k = `${e.type}|${e.cx.toFixed(0)},${e.cy.toFixed(0)}|${e.label}`; if (seen.has(k)) continue; seen.add(k); console.log(`${e.type.padEnd(11)} (${e.cx.toFixed(0).padStart(4)},${e.cy.toFixed(0).padStart(4)}) [${e.area.toFixed(0).padStart(7)}] ${e.label.slice(0, 46)}`); }
});
program.command("size").description("Window size in points").action(async () => console.log(await d.windowSize()));
program.command("signature").alias("sig").description("Structural fingerprint + overlay flag for the current screen (dedup signal)")
  .action(async () => { const els = await d.elements(); const m = await d.screenMeta(els); console.log(`fp=${m.fp}  overlay=${m.overlay}  elements=${m.n}  withId=${els.filter((e) => e.id).length}`); });

// ---- atlas ----
program.command("atlas").description("Build atlas.html (+ videos) from roveflow-out/journeys.json")
  .option("--no-videos", "skip video generation").action((o) => {
    if (!existsSync(path.join(OUT, "journeys.json"))) return console.error("no journeys.json in", OUT);
    if (o.videos) makeVideos(OUT);
    const r = buildAtlas(OUT);
    console.log(`wrote ${path.join(OUT, "atlas.html")} (${r.screens} screens, ${r.paths} journeys, ${r.steps} steps)`);
  });

// Build atlas.html on demand if the run has a manifest but was never assembled,
// so `export`/`share` Just Work after a capture without a separate `atlas` step.
function ensureAtlasBuilt(): void {
  if (existsSync(path.join(OUT, "atlas.html"))) return;
  if (!existsSync(path.join(OUT, "journeys.json"))) throw new Error(`nothing to share in ${OUT} — capture a run first`);
  makeVideos(OUT);
  buildAtlas(OUT);
}

// ---- share ----
program.command("export [zip]").description("Bundle the atlas (+ screens/videos) into a self-contained .zip")
  .action((zip) => {
    try {
      ensureAtlasBuilt();
      const m = JSON.parse(readFileSync(path.join(OUT, "journeys.json"), "utf8"));
      const dest = path.resolve(zip ?? `${slug(m.app ?? "roveflow")}-flow.zip`);
      const r = buildShareZip(OUT, dest);
      console.log(`wrote ${dest} (${r.files} files, ${(r.bytes / 1024 / 1024).toFixed(1)} MB)`);
      console.log("Unzip and open atlas.html — works offline, no server.");
    } catch (e: any) { console.error(e?.message ?? e); process.exit(1); }
  });

program.command("share").description("Upload the atlas and print an unlisted web link")
  .option("--api <url>", "share service base url", process.env.ROVEFLOW_SHARE_API)
  .action(async (o) => {
    try {
      ensureAtlasBuilt();
      console.log("uploading…");
      const { url } = await uploadShare(OUT, o.api, (s) => process.stdout.write(`\r${s}`.padEnd(60)));
      console.log(`\nShareable link (unlisted): ${url}`);
    } catch (e: any) { console.error("\n" + (e?.message ?? e)); process.exit(1); }
  });

program.command("serve").description("Serve the atlas locally").option("-p, --port <n>", "port", "8765").action((o) => {
  const root = OUT;
  createServer((req, res) => {
    const rel = decodeURIComponent((req.url || "/").split("?")[0]); const f = path.join(root, rel === "/" ? "atlas.html" : rel);
    if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); return res.end("not found"); }
    const ext = path.extname(f); const ct = ext === ".html" ? "text/html" : ext === ".png" ? "image/png" : ext === ".mp4" ? "video/mp4" : "application/octet-stream";
    res.writeHead(200, { "Content-Type": ct }); res.end(readFileSync(f));
  }).listen(+o.port, () => console.log(`Atlas at http://127.0.0.1:${o.port}/atlas.html`));
});

// Force node-style argv parsing. Commander otherwise auto-detects `process.versions.electron`
// (still set when the desktop runs this bundle via ELECTRON_RUN_AS_NODE) and slices argv like
// a packaged Electron app would, treating the script path as a stray command.
program.parseAsync(process.argv, { from: "node" });
