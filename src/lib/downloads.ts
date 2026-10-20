/**
 * Read-side helper for skill download counts.
 *
 * `src/data/downloads.json` is a static, committed snapshot of all-time download
 * counts keyed by skill slug, refreshed daily by the deploy workflow
 * (`scripts/fetch-downloads.ts`). Download buttons link to assets on the
 * `skill-downloads` GitHub Release, whose `download_count`s are added to the
 * Clarity-era numbers in `src/data/downloads-baseline.json` (Clarity's Data
 * Export API cannot return the `skill_download` event, so it can't be the
 * source). The site bakes the numbers in at build time, like `ratings.ts`.
 */
import downloads from "../data/downloads.json";

const counts = downloads as Record<string, number>;

/** All-time download count for a skill slug (0 when unknown). */
export function getDownloads(slug: string): number {
  const n = counts[slug];
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}
