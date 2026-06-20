// One-command setup for whichever phone is plugged in.
// iOS: userspace tunnel + WebDriverAgent + port-forward (auto-signed).
// Android: just adb — no signing, no driver to install.
import { execSync, spawn } from "node:child_process";
import { mkdirSync, openSync, copyFileSync, existsSync } from "node:fs";
import { createConnection } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as device from "./device.js";
import * as iosDev from "./ios.js";
import * as androidDev from "./android.js";
import { installWda, wdaInstalled, detectInstalledWda } from "./signing.js";

const WDA_BUNDLE = process.env.ROVEFLOW_WDA_BUNDLE ?? "com.facebook.WebDriverAgentRunner.xctrunner";
const WDA_PORT = Number(process.env.ROVEFLOW_WDA_PORT ?? 12004);
const OUT = process.env.ROVEFLOW_OUT ?? path.resolve("roveflow-out");
const LOGS = path.join(OUT, "logs");

const has = (cmd: string) => { try { execSync(`command -v ${cmd}`, { stdio: "ignore" }); return true; } catch { return false; } };
const sh = (cmd: string) => execSync(cmd, { stdio: "inherit" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function bg(name: string, cmd: string, args: string[]): void {
  mkdirSync(LOGS, { recursive: true });
  const log = openSync(path.join(LOGS, `${name}.log`), "a");
  spawn(cmd, args, { detached: true, stdio: ["ignore", log, log], env: { ...process.env, ENABLE_GO_IOS_AGENT: "user" } }).unref();
}
async function step<T>(label: string, fn: () => T | Promise<T>): Promise<T> {
  process.stdout.write(`• ${label} ... `);
  try { const r = await fn(); console.log("ok"); return r; } catch (e) { console.log("FAILED"); throw e; }
}

/** The userspace-tunnel port `tunnel ls` reports for THIS device, or null. */
function tunnelPort(): number | null {
  try {
    const out = iosDev.ios(["tunnel", "ls"], { quiet: true });
    if (!out.includes(iosDev.udid())) return null;
    const m = out.match(/"userspaceTunPort":\s*(\d+)/);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}
/** Can we actually open a TCP connection to a local port? */
function portOpen(port: number): Promise<boolean> {
  return new Promise((res) => {
    const s = createConnection({ host: "127.0.0.1", port });
    const done = (ok: boolean) => { s.destroy(); res(ok); };
    s.once("connect", () => done(true));
    s.once("error", () => res(false));
    s.setTimeout(1500, () => done(false));
  });
}
/** A tunnel is only usable if `tunnel ls` lists it AND its port truly accepts
 *  connections. `tunnel ls` happily reports a STALE/dead tunnel from a previous
 *  run — trusting it is what causes "ConnectUserSpaceTunnel: connection refused"
 *  when WDA starts (the driver then never comes up). */
async function tunnelHealthy(): Promise<boolean> {
  const p = tunnelPort();
  return p != null && (await portOpen(p));
}

async function bringUpIOS(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  if (!(await tunnelHealthy())) {
    // Clear any stale/dead tunnel (registered but not serving) before starting fresh.
    try { execSync("pkill -f 'ios tunnel start'", { stdio: "ignore" }); } catch { /* none running */ }
    await sleep(500);
    console.log("  ↳ If your iPhone asks, tap “Trust” and enter your passcode. First-time pairing can take ~30s…");
    await step("start userspace tunnel (no sudo)", async () => {
      bg("tunnel", "ios", ["tunnel", "start", "--userspace"]);
      // First run also waits on the on-device Trust + pairing handshake — give it ~90s.
      // Wait for the port to ACTUALLY accept connections, not just appear in `tunnel ls`.
      for (let i = 0; i < 60; i++) { await sleep(1500); if (await tunnelHealthy()) return; }
      throw new Error("tunnel did not come up after 90s — make sure you tapped Trust on the iPhone. See roveflow-out/logs/tunnel.log");
    });
  }
  if (!wdaInstalled()) await step("install WebDriverAgent (one-time signing)", () => installWda());
  const wdaId = detectInstalledWda() ?? WDA_BUNDLE; // works for Roveflow- or Sideloadly-signed WDA
  await step("start WebDriverAgent runner", () => bg("wda", "ios", ["runwda", `--bundleid=${wdaId}`, `--testrunnerbundleid=${wdaId}`, "--xctestconfig=WebDriverAgentRunner.xctest"]));
  await step("forward driver port", () => bg("forward", "ios", ["forward", String(WDA_PORT), "8100"]));
  console.log("  ↳ If your iPhone shows “Enter Passcode for XCTest”, enter it now. Waiting for the driver…");
  await step("wait for driver health (up to 2 min)", async () => {
    for (let i = 0; i < 80; i++) { await sleep(1500); if (await device.health()) return; }
    throw new Error("driver never came up — check roveflow-out/logs/wda.log. Usual causes: a stale/dead RSD tunnel (look for 'ConnectUserSpaceTunnel: connection refused' — retry to rebuild it), the on-device passcode prompt, or a locked phone.");
  });
}

async function bringUpAndroid(): Promise<void> {
  await step("start adb", () => { execSync("adb start-server", { stdio: "ignore" }); });
  console.log("  ↳ If your phone asks, tap “Allow USB debugging”. Waiting for the device…");
  await step("confirm device authorized", async () => {
    for (let i = 0; i < 20; i++) { try { androidDev.udid(); return; } catch { /* waiting for the on-device prompt */ } await sleep(1500); }
    androidDev.udid(); // final attempt throws a clear message
  });
}

/** Dir of this module, working in both ESM (tsx: import.meta.url) and the CJS bundle
 *  (esbuild leaves import.meta.url undefined there, but __dirname is defined). */
function moduleDir(): string {
  try { return path.dirname(fileURLToPath(import.meta.url)); }
  catch { return __dirname; }
}

/** Install the /rove skill globally so `/rove` is available in Claude Code. */
function installRoveSkill(): void {
  const src = path.join(moduleDir(), "..", "skills", "rove", "SKILL.md");
  if (!existsSync(src)) return; // not bundled in this tree — skip
  const dest = path.join(os.homedir(), ".claude", "skills", "rove");
  mkdirSync(dest, { recursive: true });
  copyFileSync(src, path.join(dest, "SKILL.md"));
}

export async function setup(): Promise<void> {
  console.log("Roveflow setup\n──────────────");
  await step("install the /rove skill (~/.claude/skills/rove)", () => installRoveSkill());
  if (!has("ffmpeg") && has("brew")) await step("install ffmpeg", () => sh("brew install ffmpeg"));
  if (!has("ios")) await step("install go-ios", () => sh("npm install -g go-ios"));

  // Pick the platform from what's actually plugged in — never assume.
  let p: device.Platform;
  if (iosDev.detected()) p = "ios";
  else if (has("adb") && androidDev.detected()) p = "android";
  else throw new Error("No device detected. iPhone: connect via USB, unlock, tap Trust. Android: enable USB debugging, tap Allow. Then retry.");
  process.env.ROVEFLOW_PLATFORM = p; // pin for the rest of the run
  console.log(`Platform: ${p}`);
  if (p === "ios") await bringUpIOS(); else await bringUpAndroid();
  console.log(`\n✓ Ready (${p}). Try:  roveflow screenshot home  |  roveflow doctor  |  /rove in Claude Code`);
}

export async function doctor(): Promise<boolean> {
  let p: device.Platform | null = null;
  try { p = device.platform(); } catch { /* no device */ }
  const rows: [string, boolean][] = [];
  rows.push([p === "android" ? "adb installed" : "go-ios installed", has(p === "android" ? "adb" : "ios")]);
  rows.push(["ffmpeg installed", has("ffmpeg")]);
  rows.push(["device connected", (() => { try { return !!device.udid(); } catch { return false; } })()]);
  rows.push(["driver ready", await device.health().catch(() => false)]);
  let ok = true;
  console.log(`platform: ${p ?? "none detected"}`);
  for (const [l, v] of rows) { ok &&= v; console.log(`  ${v ? "✓" : "✗"} ${l}`); }
  console.log(ok ? "\nAll good — ready to rove." : "\nSomething's down — run `roveflow setup`.");
  return ok;
}
