// iOS backend — WebDriverAgent REST (forwarded on localhost:WDA_PORT) + go-ios (`ios`).
// Coordinates are WDA *points*; screenshots are 3× pixels (scale handled in the router).
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { El } from "./types.js";

const WDA_PORT = Number(process.env.ROVEFLOW_WDA_PORT ?? 12004);
const BASE = `http://127.0.0.1:${WDA_PORT}`;
let _udid: string | null = process.env.ROVEFLOW_UDID ?? null;
let _sid: string | null = null;

export function ios(args: string[], opts: { quiet?: boolean } = {}): string {
  try { return execFileSync("ios", args, { encoding: "utf8", stdio: ["ignore", "pipe", opts.quiet ? "ignore" : "pipe"] }); }
  catch (e: any) { return e.stdout?.toString() ?? ""; }
}

export function detected(): boolean {
  try {
    const out = ios(["list"], { quiet: true });
    const j = JSON.parse(out.split("\n").find((l) => l.includes("deviceList")) ?? out);
    return (j.deviceList?.length ?? 0) > 0;
  } catch { return false; }
}

export function udid(): string {
  if (_udid) return _udid;
  try {
    const out = ios(["list"], { quiet: true });
    const j = JSON.parse(out.split("\n").find((l) => l.includes("deviceList")) ?? out);
    _udid = j.deviceList?.[0] ?? null;
  } catch { /* */ }
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
  return _sid;
}

export async function health(): Promise<boolean> {
  try { const r = await fetch(BASE + "/health", { signal: AbortSignal.timeout(4000) }); if ((await r.text()).includes("I-AM-ALIVE")) return true; } catch { /* */ }
  try { const r = await fetch(BASE + "/status", { signal: AbortSignal.timeout(4000) }); const t = await r.text(); return r.ok && (t.includes('"build"') || t.includes('"sessionId"')); } catch { return false; }
}

export async function windowSize(): Promise<{ width: number; height: number }> {
  const sid = await session(); return (await req("GET", `/session/${sid}/window/size`)).value;
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
export function screenshot(name: string, dir: string): string {
  const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${slug}.png`);
  ios(["screenshot", "--udid", udid(), "--output", out], { quiet: true });
  return out;
}
export async function collect(): Promise<El[]> {
  const sid = await session();
  const src = (await req("GET", `/session/${sid}/source?format=json`)).value;
  const out: El[] = [];
  const walk = (n: any) => {
    const r = n.rect ?? {}; const w = r.width ?? 0, h = r.height ?? 0;
    const label = n.label || n.name || n.value || "";
    if ((n.isVisible === 1 || n.isVisible === "1" || n.isVisible === true) && label && w > 0 && h > 0)
      out.push({ type: n.type ?? "", label, cx: (r.x ?? 0) + w / 2, cy: (r.y ?? 0) + h / 2, area: w * h });
    for (const c of n.children ?? []) walk(c);
  };
  walk(src); return out;
}
