// Platform router — auto-detects an iPhone (WebDriverAgent) or Android (adb)
// and dispatches to the right backend. find/tapText/isKeyboardUp are shared.
import * as ios from "./ios.js";
import * as android from "./android.js";
import type { El, Platform } from "./types.js";
export type { El, Platform };

let _p: Platform | null = (process.env.ROVEFLOW_PLATFORM as Platform) || null;

export function platform(): Platform {
  if (_p) return _p;
  if (ios.detected()) _p = "ios";
  else if (android.detected()) _p = "android";
  else throw new Error("No device found. Plug in an iPhone or Android phone (USB, unlocked) and run `roveflow setup`.");
  return _p;
}
const be = () => (platform() === "ios" ? ios : android);

/** screenshot-pixels per tap-point: iOS is 3×, Android is 1:1. */
export function scale(): number { return platform() === "ios" ? Number(process.env.ROVEFLOW_SCALE ?? 3) : 1; }

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
export function screenshot(name: string, dir: string): string { return be().screenshot(name, dir); }
export function collect(): Promise<El[]> { return be().collect(); }

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
