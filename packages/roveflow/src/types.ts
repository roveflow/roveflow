// Shared shape for a found on-screen element (label + center + size).
// `id` is the app's stable accessibility identifier when present (iOS
// rawIdentifier / token name, Android resource-id) — far more durable than
// label+coords for dedup and for matching an element across visits.
export type El = { type: string; label: string; cx: number; cy: number; area: number; id?: string };
export type Platform = "ios" | "android";

/** Canonical screen-name → filename slug. Any run of non-alphanumerics (spaces,
 *  underscores, punctuation) collapses to a single dash, so "Model Selection",
 *  "model_selection", and "model-selection" all map to the SAME screens/<slug>.png.
 *  Used by BOTH screenshot capture (ios/android) and the atlas, so the atlas's
 *  image refs always match the files on disk. */
export const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
