// Shared shape for a found on-screen element (label + center + size).
export type El = { type: string; label: string; cx: number; cy: number; area: number };
export type Platform = "ios" | "android";

/** Canonical screen-name → filename slug. Any run of non-alphanumerics (spaces,
 *  underscores, punctuation) collapses to a single dash, so "Model Selection",
 *  "model_selection", and "model-selection" all map to the SAME screens/<slug>.png.
 *  Used by BOTH screenshot capture (ios/android) and the atlas, so the atlas's
 *  image refs always match the files on disk. */
export const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
