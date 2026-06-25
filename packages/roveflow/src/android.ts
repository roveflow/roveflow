// Android backend — plain `adb` over USB. No signing, no driver to install.
// Coordinates are real pixels (same space as screenshots), so scale is 1.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { El } from "./types.js";
import { slug } from "./types.js";

let _serial: string | null = process.env.ROVEFLOW_UDID ?? null;

export function adb(args: string[], opts: { quiet?: boolean } = {}): string {
  try { return execFileSync("adb", args, { encoding: "utf8", stdio: ["ignore", "pipe", opts.quiet ? "ignore" : "pipe"] }); }
  catch (e: any) { return e.stdout?.toString() ?? ""; }
}

function deviceList(): { serial: string; state: string }[] {
  return adb(["devices"], { quiet: true }).split("\n").slice(1).map((l) => l.trim()).filter(Boolean)
    .map((l) => { const [serial, state] = l.split(/\s+/); return { serial, state }; }).filter((d) => d.serial);
}
/** A USB-attached device. Network adb (`adb connect`) shows up as an `ip:port`
 *  serial; we treat only cable-attached devices as connected, mirroring iOS. */
const isUsb = (serial: string) => !serial.includes(":");
export function detected(): boolean { try { return deviceList().some((d) => d.state === "device" && isUsb(d.serial)); } catch { return false; } }

export function udid(): string {
  if (_serial) return _serial;
  const list = deviceList();
  const ready = list.find((d) => d.state === "device" && isUsb(d.serial));
  if (!ready) {
    if (list.some((d) => d.state === "unauthorized")) throw new Error("Android phone is unauthorized — tap “Allow USB debugging” on the phone, then retry.");
    throw new Error("No Android device. Enable USB debugging, plug in via USB, and run `roveflow setup`.");
  }
  _serial = ready.serial; return _serial;
}
function sh(args: string[], opts: { quiet?: boolean } = {}): string { return adb(["-s", udid(), ...args], opts); }

export async function health(): Promise<boolean> { return detected(); }
export function listApps(): string {
  return sh(["shell", "pm", "list", "packages", "-3"], { quiet: true }).split("\n").map((l) => l.replace("package:", "").trim()).filter(Boolean).sort().join("\n");
}
export async function windowSize(): Promise<{ width: number; height: number }> {
  const m = sh(["shell", "wm", "size"], { quiet: true }).match(/(\d+)\s*x\s*(\d+)/);
  return m ? { width: +m[1], height: +m[2] } : { width: 0, height: 0 };
}
export async function tap(x: number, y: number): Promise<void> { sh(["shell", "input", "tap", String(Math.round(x)), String(Math.round(y))], { quiet: true }); }
export async function swipe(x1: number, y1: number, x2: number, y2: number, durMs = 600): Promise<void> {
  sh(["shell", "input", "swipe", ...[x1, y1, x2, y2].map((n) => String(Math.round(n))), String(durMs)], { quiet: true });
}
export async function typeText(s: string): Promise<void> { sh(["shell", "input", "text", s.replace(/ /g, "%s")], { quiet: true }); }
export async function eraseText(n: number): Promise<void> { for (let i = 0; i < n; i++) sh(["shell", "input", "keyevent", "67"], { quiet: true }); }
const KEYS: Record<string, string> = { home: "3", back: "4", volumeup: "24", volumedown: "25", enter: "66" };
export async function pressButton(name: string): Promise<void> { sh(["shell", "input", "keyevent", KEYS[name.toLowerCase()] ?? name], { quiet: true }); }
export function launch(pkg: string): void { sh(["shell", "monkey", "-p", pkg, "-c", "android.intent.category.LAUNCHER", "1"], { quiet: true }); }
export function stop(pkg: string): void { sh(["shell", "am", "force-stop", pkg], { quiet: true }); }
export function screenshot(name: string, dir: string): string {
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${slug(name)}.png`);
  const buf = execFileSync("adb", ["-s", udid(), "exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(out, buf); return out;
}
// Set while walking the last dump — Android dialogs/bottom-sheets float over the
// previous screen the same way iOS sheets do (mirrors ios.overlay()).
let _overlay = false;
export function overlay(): boolean { return _overlay; }
const OVERLAY_RE = /Dialog|BottomSheet|PopupWindow|ModalBottomSheet/i;
// Strip the package prefix from a resource-id (com.app:id/login_button -> login_button).
const shortId = (s: string) => s.replace(/^.*\/(?=.)/, "");

export async function collect(): Promise<El[]> {
  _overlay = false;
  sh(["shell", "uiautomator", "dump", "/sdcard/rf-dump.xml"], { quiet: true });
  const xml = sh(["shell", "cat", "/sdcard/rf-dump.xml"], { quiet: true });
  const out: El[] = [];
  for (const m of xml.matchAll(/<node\b([^>]*?)\/?>/g)) {
    const a = m[1];
    const get = (k: string) => (a.match(new RegExp(k + '="([^"]*)"')) || [])[1] ?? "";
    const cls = get("class");
    if (!_overlay && OVERLAY_RE.test(cls)) _overlay = true;
    const id = shortId(get("resource-id"));
    const label = get("text") || get("content-desc");
    const b = get("bounds").match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if ((!label && !id) || !b) continue;
    const x1 = +b[1], y1 = +b[2], x2 = +b[3], y2 = +b[4];
    out.push({ type: (cls.split(".").pop() || ""), label: label || id, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, area: (x2 - x1) * (y2 - y1), ...(id ? { id } : {}) });
  }
  return out;
}
