// One-command setup for whichever phone is plugged in.
// iOS: userspace tunnel + WebDriverAgent + port-forward (auto-signed).
// Android: just adb — no signing, no driver to install.
import { execSync, spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import path from "node:path";
import * as device from "./device.js";
import * as iosDev from "./ios.js";
import * as androidDev from "./android.js";
import { installWda, wdaInstalled } from "./signing.js";

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

async function tunnelUp(): Promise<boolean> { return iosDev.ios(["tunnel", "ls"], { quiet: true }).includes(iosDev.udid()); }

async function bringUpIOS(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  if (!(await tunnelUp())) {
    await step("start userspace tunnel (no sudo)", async () => {
      bg("tunnel", "ios", ["tunnel", "start", "--userspace"]);
      for (let i = 0; i < 15; i++) { await sleep(1500); if (await tunnelUp()) return; }
      throw new Error("tunnel did not come up — see roveflow-out/logs/tunnel.log");
    });
  }
  if (!wdaInstalled()) await step("install WebDriverAgent (one-time signing)", () => installWda());
  await step("start WebDriverAgent runner", () => bg("wda", "ios", ["runwda", `--bundleid=${WDA_BUNDLE}`, `--testrunnerbundleid=${WDA_BUNDLE}`, "--xctestconfig=WebDriverAgentRunner.xctest"]));
  await step("forward driver port", () => bg("forward", "ios", ["forward", String(WDA_PORT), "8100"]));
  console.log("  ↳ If your iPhone shows “Enter Passcode for XCTest”, enter it now. Waiting for the driver…");
  await step("wait for driver health (up to 2 min)", async () => {
    for (let i = 0; i < 80; i++) { await sleep(1500); if (await device.health()) return; }
    throw new Error("driver never came up — check roveflow-out/logs/wda.log (the on-device passcode prompt, or a locked phone, is the usual cause).");
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

export async function setup(): Promise<void> {
  console.log("Roveflow setup\n──────────────");
  if (!has("ffmpeg") && has("brew")) await step("install ffmpeg", () => sh("brew install ffmpeg"));
  if (!has("ios")) await step("install go-ios", () => sh("npm install -g go-ios"));

  let p: device.Platform;
  if (iosDev.detected()) p = "ios";
  else {
    if (!has("adb")) await step("install Android platform tools (adb)", () => {
      if (has("brew")) sh("brew install --cask android-platform-tools");
      else throw new Error("Install Android platform tools (adb): https://developer.android.com/tools/releases/platform-tools");
    });
    p = "android";
  }
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
