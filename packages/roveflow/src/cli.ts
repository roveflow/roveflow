#!/usr/bin/env node
import { Command } from "commander";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import * as d from "./device.js";
import { setup, doctor } from "./setup.js";
import { buildAtlas, makeVideos } from "./atlas.js";
import { uninstall, keygen, installWda, exportWda } from "./signing.js";

const OUT = process.env.ROVEFLOW_OUT ?? path.resolve("roveflow-out");
const SCREENS = path.join(OUT, "screens");

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
  .action((name) => console.log(d.screenshot(name, SCREENS)));

program.command("tap <x> <y>").description("Tap. Add --px to give coordinates read from a screenshot.")
  .option("--px", "treat x/y as screenshot pixels (iOS divides by device scale; Android is 1:1)")
  .action(async (x, y, o) => { const s = o.px ? d.scale() : 1; await d.tap(+x / s, +y / s); console.log(`tapped ${x},${y}${o.px ? " (px)" : ""}`); });

program.command("swipe <x1> <y1> <x2> <y2>").description("Swipe/drag. Add --px for screenshot pixel coords.")
  .option("--px", "pixel coords").option("--dur <ms>", "duration ms", "600")
  .action(async (x1, y1, x2, y2, o) => { const s = o.px ? d.scale() : 1; await d.swipe(+x1 / s, +y1 / s, +x2 / s, +y2 / s, +o.dur); console.log("swiped"); });

program.command("type <text>").description("Type into the focused field").action(async (t) => { await d.typeText(t); console.log("typed:", t); });
program.command("erase <n>").description("Delete N characters").action(async (n) => { await d.eraseText(+n); console.log("erased", n); });
program.command("button <name>").description("Hardware button: home | volumeup | volumedown").action(async (n) => { await d.pressButton(n); console.log("pressed", n); });
program.command("home").description("Go to springboard").action(async () => { await d.pressButton("home"); console.log("home"); });

program.command("find <text>").description("Find tappable elements whose label contains <text> (with point coords)")
  .action(async (t) => { const c = await d.find(t); if (!c.length) return console.log("NOT FOUND:", t); for (const e of c.slice(0, 8)) console.log(`(${e.cx.toFixed(0)},${e.cy.toFixed(0)}) [${e.area.toFixed(0)}] ${e.type} ${e.label.slice(0, 50)}`); });
program.command("taptext <text>").description("Find by label and tap the most specific match (retries)")
  .action(async (t) => { const e = await d.tapText(t); console.log(`-> ${t} @ (${e.cx.toFixed(0)},${e.cy.toFixed(0)})`); });

program.command("tree").description("Print visible labeled elements (label · point · area)").action(async () => {
  const seen = new Set<string>();
  for (const e of await d.collect()) { const k = `${e.type}|${e.cx.toFixed(0)},${e.cy.toFixed(0)}|${e.label}`; if (seen.has(k)) continue; seen.add(k); console.log(`${e.type.padEnd(11)} (${e.cx.toFixed(0).padStart(4)},${e.cy.toFixed(0).padStart(4)}) [${e.area.toFixed(0).padStart(7)}] ${e.label.slice(0, 46)}`); }
});
program.command("size").description("Window size in points").action(async () => console.log(await d.windowSize()));

// ---- atlas ----
program.command("atlas").description("Build atlas.html (+ videos) from roveflow-out/journeys.json")
  .option("--no-videos", "skip video generation").action((o) => {
    if (!existsSync(path.join(OUT, "journeys.json"))) return console.error("no journeys.json in", OUT);
    if (o.videos) makeVideos(OUT);
    const r = buildAtlas(OUT);
    console.log(`wrote ${path.join(OUT, "atlas.html")} (${r.screens} screens, ${r.paths} journeys, ${r.steps} steps)`);
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
