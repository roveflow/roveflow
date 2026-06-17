// Shared shape for a found on-screen element (label + center + size).
export type El = { type: string; label: string; cx: number; cy: number; area: number };
export type Platform = "ios" | "android";
