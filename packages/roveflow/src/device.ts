// Platform router — auto-detects an iPhone (WebDriverAgent) or Android (adb)
// and dispatches to the right backend. find/tapText/isKeyboardUp are shared.
import * as ios from "./ios.js";
import * as android from "./android.js";
import type { El, Platform } from "./types.js";
export type { El, Platform };

let _p: Platform | null = (process.env.ROVEFLOW_PLATFORM as Platform) || null;

export function platform(): Platform {
  if (_p) return _p;
  // Honor a pinned platform (set by setup / the device cache) so routine commands
  // skip the go-ios `ios list` probe — the biggest per-command overhead.
  const env = process.env.ROVEFLOW_PLATFORM as Platform;
  if (env === "ios" || env === "android") return (_p = env);
  if (ios.detected()) _p = "ios";
  else if (android.detected()) _p = "android";
  else throw new Error("No device found. Plug in an iPhone or Android phone (USB, unlocked) and run `roveflow setup`.");
  return _p;
}
const be = () => (platform() === "ios" ? ios : android);

/** screenshot-pixels per tap-point. Android is 1:1; iOS varies by device
 *  (@2x on SE/11/XR, @3x on Pro/Plus), so we derive it from the live device
 *  (screenshot px ÷ window points) instead of assuming 3. `ROVEFLOW_SCALE`
 *  forces a value and skips the probe. */
export async function scale(): Promise<number> {
  if (process.env.ROVEFLOW_SCALE) return Number(process.env.ROVEFLOW_SCALE);
  if (platform() !== "ios") return 1;
  return ios.scale();
}

export function udid(): string { return be().udid(); }
export function listApps(): string { return be().listApps(); }
export function health(): Promise<boolean> { return be().health(); }
export function windowSize(): Promise<{ width: number; height: number }> { return be().windowSize(); }
export function tap(x: number, y: number): Promise<void> { return be().tap(x, y); }
export function swipe(x1: number, y1: number, x2: number, y2: number, d = 600): Promise<void> { return be().swipe(x1, y1, x2, y2, d); }
export function typeText(s: string): Promise<void> { return be().typeText(s); }
export function eraseText(n: number): Promise<void> { return be().eraseText(n); }
export function pressButton(n: string): Promise<void> { return be().pressButton(n); }
export function launch(id: string): void { be().launch(id); }
export function stop(id: string): void { be().stop(id); }
export function screenshot(name: string, dir: string): Promise<string> { return Promise.resolve(be().screenshot(name, dir)); }
export function collect(): Promise<El[]> { return be().collect(); }

/** The "set of marks": visible labeled elements, deduped and ordered top→bottom
 *  then left→right (row-banded), so each gets a stable index the model can tap by
 *  with `tapindex`. Tapping a mark uses the element's own reported center (in
 *  points), which sidesteps the pixel→point scale guessing that makes coordinate
 *  taps miss. */
export async function elements(): Promise<El[]> {
  const seen = new Set<string>();
  const list: El[] = [];
  for (const e of await collect()) {
    // Prefer the stable id for identity; coarsen the position to an 8pt grid so a
    // few-px shift between visits doesn't read as a different element. Keep id-only
    // elements (no human label) — they're tappable and identifiable.
    const k = `${e.id || `${e.type}|${e.label}`}|${Math.round(e.cx / 8)},${Math.round(e.cy / 8)}`;
    if (seen.has(k) || (!e.label && !e.id)) continue;
    seen.add(k);
    list.push(e);
  }
  return list.sort((a, b) => (Math.abs(a.cy - b.cy) > 12 ? a.cy - b.cy : a.cx - b.cx));
}

export function overlay(): boolean { const b = be() as any; return typeof b.overlay === "function" ? b.overlay() : false; }

// djb2 → base36, small and stable. Not crypto; just a screen signature.
function hash(s: string): string { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(s);
// Types whose label is part of the screen's stable skeleton (nav/controls), vs
// free body text (StaticText/Image) that changes with content and would over-split.
const STRUCT = new Set(["Button", "Cell", "Tab", "TabBar", "NavigationBar", "SegmentedControl", "TextField", "SearchField", "SecureTextField", "Switch", "Link", "MenuItem"]);
const short = (t: string) => (t || "").replace(/^XCUIElementType/, "").replace(/^android\.widget\./, "");
const normLabel = (s: string) => s.toLowerCase().replace(/\d+/g, "#").replace(/[^a-z#]+/g, " ").trim();

/** A structural fingerprint of the screen: the multiset of stable ids plus the
 *  labels of skeletal controls, with volatile content (numbers, body text)
 *  dropped — so the same screen dedups across visits even when its data differs,
 *  while genuinely different screens diverge. */
export function fingerprint(els: El[]): string {
  const toks = new Set<string>();
  for (const e of els) {
    if (e.id && !isUuid(e.id)) { toks.add("#" + e.id); continue; }
    const st = short(e.type);
    if (STRUCT.has(st) && e.label && !e.label.startsWith("(unlabeled")) {
      const n = normLabel(e.label);
      if (n.length > 1) toks.add(`${st}:${n}`);
    }
  }
  const arr = [...toks].sort();
  return arr.length ? `${hash(arr.join("|"))}.${arr.length}` : "empty";
}

/** Screen-level metadata for dedup + no-op detection: a fingerprint and whether
 *  a sheet/overlay is floating over a previous screen. */
export async function screenMeta(els: El[]): Promise<{ fp: string; overlay: boolean; n: number }> {
  return { fp: fingerprint(els), overlay: overlay(), n: els.length };
}

export async function find(text: string): Promise<El[]> {
  const t = text.toLowerCase();
  return (await collect()).filter((e) => e.label.toLowerCase().includes(t)).sort((a, b) => a.area - b.area);
}
export async function tapText(text: string, tries = 5): Promise<El> {
  for (let i = 0; i < tries; i++) {
    const c = await find(text);
    if (c.length) { await tap(c[0].cx, c[0].cy); return c[0]; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`NOT FOUND after ${tries} tries: ${text}`);
}
export async function isKeyboardUp(): Promise<boolean> {
  const labels = (await collect()).map((e) => e.label.toLowerCase()).join(" ");
  return labels.includes("return") || labels.includes("space");
}
