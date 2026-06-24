// iOS backend — WebDriverAgent REST (forwarded on localhost:WDA_PORT) + go-ios (`ios`).
// Coordinates are WDA *points*; screenshots are @2x/@3x pixels — the px→pt scale is
// derived per-device (see scale()), not assumed.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { El } from "./types.js";
import { slug } from "./types.js";

const WDA_PORT = Number(process.env.ROVEFLOW_WDA_PORT ?? 12004);
const BASE = `http://127.0.0.1:${WDA_PORT}`;
let _udid: string | null = process.env.ROVEFLOW_UDID ?? null;
let _sid: string | null = null;

export function ios(args: string[], opts: { quiet?: boolean } = {}): string {
  try { return execFileSync("ios", args, { encoding: "utf8", stdio: ["ignore", "pipe", opts.quiet ? "ignore" : "pipe"] }); }
  catch (e: any) { return e.stdout?.toString() ?? ""; }
}

/** UDIDs of USB-attached iPhones only. `ios list` also reports Wi-Fi-paired
 *  devices, which linger after the cable is unplugged and make setup pick iOS
 *  (and proactively print "tap Trust") with nothing actually plugged in.
 *  `--detail` exposes ConnectionType so we can keep only the USB ones. */
function usbUdids(): string[] {
  try {
    const out = ios(["list", "--detail"], { quiet: true });
    const j = JSON.parse(out.split("\n").find((l) => l.includes("deviceList")) ?? out);
    return (j.deviceList ?? [])
      .filter((d: any) => String(d?.ConnectionType ?? "").toUpperCase() === "USB")
      .map((d: any) => d?.Udid)
      .filter(Boolean);
  } catch { return []; }
}

export function detected(): boolean {
  return usbUdids().length > 0;
}

export function udid(): string {
  if (_udid) return _udid;
  // A pinned UDID (from setup / the device cache) avoids the go-ios `ios list` probe.
  if (process.env.ROVEFLOW_UDID) return (_udid = process.env.ROVEFLOW_UDID);
  _udid = usbUdids()[0] ?? null;
  if (!_udid) throw new Error("No iPhone found. Connect it (USB, unlocked) and run `roveflow setup`.");
  return _udid;
}

export function listApps(): string { return ios(["apps", "--list"], { quiet: true }).trim(); }

async function req(method: string, p: string, body?: unknown): Promise<any> {
  const res = await fetch(BASE + p, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function session(): Promise<string> {
  if (_sid) { const r = await req("GET", `/session/${_sid}/window/size`); if (r?.value?.width) return _sid; }
  const r = await req("POST", "/session", { capabilities: { alwaysMatch: {} } });
  _sid = r.sessionId ?? r.value?.sessionId;
  if (!_sid) throw new Error("Could not create WDA session — run `roveflow doctor`.");
  // Cap the accessibility-snapshot depth so /source (the element dump) stays fast.
  // Real controls can sit deep: e.g. a segmented control's tabs at depth ~37. 40 is
  // the measured sweet spot — it reaches those (and a little headroom) at +~300ms,
  // just before per-step cost explodes (depth 50 was ~5x slower on a chart-heavy
  // screen). Tunable via ROVEFLOW_SNAPSHOT_DEPTH.
  try { await req("POST", `/session/${_sid}/appium/settings`, { settings: { snapshotMaxDepth: Number(process.env.ROVEFLOW_SNAPSHOT_DEPTH ?? 40) } }); } catch { /* best effort */ }
  return _sid;
}

export async function health(): Promise<boolean> {
  try { const r = await fetch(BASE + "/health", { signal: AbortSignal.timeout(4000) }); if ((await r.text()).includes("I-AM-ALIVE")) return true; } catch { /* */ }
  try { const r = await fetch(BASE + "/status", { signal: AbortSignal.timeout(4000) }); const t = await r.text(); return r.ok && (t.includes('"build"') || t.includes('"sessionId"')); } catch { return false; }
}

export async function windowSize(): Promise<{ width: number; height: number }> {
  const sid = await session(); return (await req("GET", `/session/${sid}/window/size`)).value;
}

/** Native screenshot-pixels per WDA point, derived once from the live device and
 *  cached. Read the screenshot's true pixel width from the PNG IHDR header and
 *  divide by the window's point width; rounded to the nearest integer (iPhones
 *  are @2x or @3x). Falls back to 3 if either probe fails. */
let _scale: number | null = null;
export async function scale(): Promise<number> {
  if (_scale) return _scale;
  try {
    const sid = await session();
    const sz = (await req("GET", `/session/${sid}/window/size`)).value;
    const r = await req("GET", `/session/${sid}/screenshot`);
    const b64 = r?.value;
    let pxW = 0;
    if (typeof b64 === "string" && b64.length) {
      const buf = Buffer.from(b64, "base64");
      // PNG: 8-byte signature, then IHDR chunk; width is a big-endian uint32 at offset 16.
      if (buf.length > 24 && buf.toString("ascii", 12, 16) === "IHDR") pxW = buf.readUInt32BE(16);
    }
    if (pxW && sz?.width) return (_scale = Math.max(1, Math.round(pxW / sz.width)));
  } catch { /* fall through to default */ }
  return (_scale = 3);
}

async function actions(moves: any[]): Promise<void> {
  const sid = await session();
  await req("POST", `/session/${sid}/actions`, { actions: [{ type: "pointer", id: "finger1", parameters: { pointerType: "touch" }, actions: moves }] });
}
export async function tap(x: number, y: number): Promise<void> {
  await actions([{ type: "pointerMove", duration: 0, x: Math.round(x), y: Math.round(y) }, { type: "pointerDown", button: 0 }, { type: "pause", duration: 80 }, { type: "pointerUp", button: 0 }]);
}
export async function swipe(x1: number, y1: number, x2: number, y2: number, durMs = 600): Promise<void> {
  await actions([{ type: "pointerMove", duration: 0, x: Math.round(x1), y: Math.round(y1) }, { type: "pointerDown", button: 0 }, { type: "pointerMove", duration: durMs, x: Math.round(x2), y: Math.round(y2) }, { type: "pointerUp", button: 0 }]);
}
export async function typeText(s: string): Promise<void> { const sid = await session(); await req("POST", `/session/${sid}/wda/keys`, { value: [...s] }); }
export async function eraseText(n: number): Promise<void> { const sid = await session(); await req("POST", `/session/${sid}/wda/keys`, { value: Array(n).fill("") }); }
export async function pressButton(name: string): Promise<void> { const sid = await session(); await req("POST", `/session/${sid}/wda/pressButton`, { name }); }
export function launch(bundleId: string): void { ios(["launch", bundleId, "--udid", udid()], { quiet: true }); }
export function stop(bundleId: string): void { ios(["kill", bundleId, "--udid", udid()], { quiet: true }); }
export async function screenshot(name: string, dir: string): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${slug(name)}.png`);
  // Capture over the open WDA session (in-process HTTP) instead of spawning a
  // fresh go-ios subprocess each call — the subprocess spawn dominated per-step latency.
  try {
    const sid = await session();
    const r = await req("GET", `/session/${sid}/screenshot`);
    const b64 = r?.value;
    if (typeof b64 === "string" && b64.length) { writeFileSync(out, Buffer.from(b64, "base64")); return out; }
  } catch { /* fall back to go-ios below */ }
  ios(["screenshot", "--udid", udid(), "--output", out], { quiet: true });
  return out;
}
// WDA element types that are tappable on their own — surfaced even when unlabeled.
const INTERACTIVE = new Set([
  "Button", "Switch", "Link", "MenuItem", "Cell", "SegmentedControl", "Tab",
  "SearchField", "TextField", "SecureTextField", "Slider", "Stepper", "PopUpButton", "Checkbox",
]);
const shortType = (t: string) => (t || "").replace(/^XCUIElementType/, "") || "Element";

export async function collect(): Promise<El[]> {
  const sid = await session();
  const src = (await req("GET", `/session/${sid}/source?format=json`)).value;
  const sz = ((await req("GET", `/session/${sid}/window/size`)).value ?? {}) as { width?: number; height?: number };
  const W = sz.width ?? 0, H = sz.height ?? 0;
  // Coarse position cue (top-right, middle-center, …) so the model can match an
  // unlabeled mark to what it sees on the screenshot.
  const region = (cx: number, cy: number): string => {
    if (!W || !H) return "";
    const col = cx < W / 3 ? "left" : cx > (2 * W) / 3 ? "right" : "center";
    const row = cy < H / 3 ? "top" : cy > (2 * H) / 3 ? "bottom" : "middle";
    return `${row}-${col}`;
  };
  const out: El[] = [];
  const walk = (n: any) => {
    const r = n.rect ?? {}; const w = r.width ?? 0, h = r.height ?? 0;
    const visible = n.isVisible === 1 || n.isVisible === "1" || n.isVisible === true;
    if (visible && w > 0 && h > 0) {
      const cx = (r.x ?? 0) + w / 2, cy = (r.y ?? 0) + h / 2;
      const st = shortType(n.type);
      const leaf = !(n.children && n.children.length);
      const small = !W || !H || w * h < W * H * 0.5;
      const sized = w >= 20 && h >= 20;
      let label = n.label || n.name || n.value || "";
      // No native label? Surface it anyway if it's an interactive type, or a small
      // visible leaf icon/image/other (custom overlay buttons, the keynote close X) —
      // so it gets an index and the model taps its true center, never pixel math.
      if (!label && sized && small && (INTERACTIVE.has(st) || (leaf && (st === "Other" || st === "Image" || st === "Icon"))))
        label = `(unlabeled ${st}${region(cx, cy) ? ` · ${region(cx, cy)}` : ""})`;
      if (label) out.push({ type: n.type ?? "", label, cx, cy, area: w * h });
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(src); return out;
}
