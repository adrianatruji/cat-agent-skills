/**
 * Shared logic for counting skill downloads via a GitHub Release.
 *
 * Every downloadable artifact (`<slug>.zip`, `<slug>.json`, `<slug>.md`) is
 * published as an asset on a single release (tag {@link DOWNLOADS_RELEASE_TAG}),
 * and the download buttons link straight to those assets. GitHub counts every
 * asset download (`download_count`), which the daily workflow reads back.
 *
 * When a skill's file changes, its asset has to be replaced, and a replaced
 * asset starts again at 0. Before deleting the old asset, its count is folded
 * into a "retired" tally stored in the release body, so totals never go down.
 *
 * All-time total per slug = Clarity-era baseline + retired tally + live assets.
 */

export const DOWNLOADS_RELEASE_TAG = "skill-downloads";

export type Counts = Record<string, number>;
export type AssetCount = { name: string; download_count: number };

const ASSET_RE = /^((?!-)(?!.*--)[a-z0-9-]{1,64}(?<!-))\.(zip|json|md)$/;

/** Skill slug for a release asset name, or null for anything else. */
export function slugFromAssetName(name: string): string | null {
  const m = ASSET_RE.exec(name);
  return m ? m[1] : null;
}

function add(into: Counts, from: Counts): void {
  for (const [slug, n] of Object.entries(from)) {
    if (typeof n === "number" && Number.isFinite(n) && n > 0) {
      into[slug] = (into[slug] ?? 0) + n;
    }
  }
}

/** Combine baseline, retired tally, and live asset counts into sorted totals. */
export function aggregateDownloads(
  baseline: Counts,
  retired: Counts,
  assets: AssetCount[],
): Counts {
  const totals: Counts = {};
  add(totals, baseline);
  add(totals, retired);
  const live: Counts = {};
  for (const a of assets) {
    const slug = slugFromAssetName(a.name);
    if (slug) live[slug] = (live[slug] ?? 0) + (a.download_count ?? 0);
  }
  add(totals, live);
  const sorted: Counts = {};
  for (const key of Object.keys(totals).sort()) sorted[key] = totals[key];
  return sorted;
}

const BODY_START = "<!-- retired-downloads:start -->";
const BODY_END = "<!-- retired-downloads:end -->";

/** Read the retired tally out of the release body (empty when absent/invalid). */
export function parseRetired(body: string | null | undefined): Counts {
  if (!body) return {};
  const start = body.indexOf(BODY_START);
  const end = body.indexOf(BODY_END);
  if (start === -1 || end === -1 || end < start) return {};
  const block = body
    .slice(start + BODY_START.length, end)
    .replace(/```(json)?/g, "")
    .trim();
  try {
    const parsed = JSON.parse(block || "{}");
    const out: Counts = {};
    add(out, parsed && typeof parsed === "object" ? parsed : {});
    return out;
  } catch {
    return {};
  }
}

/** Render the release body that carries the retired tally. */
export function formatReleaseBody(retired: Counts): string {
  const sorted: Counts = {};
  for (const key of Object.keys(retired).sort()) sorted[key] = retired[key];
  return [
    "Download files for the skill gallery. Maintained automatically by the",
    "deploy workflow; the gallery's download counts are read from these assets.",
    "",
    "**Do not edit or delete this release by hand.** The block below keeps the",
    "download counts of replaced files so totals never go down.",
    "",
    BODY_START,
    "```json",
    JSON.stringify(sorted, null, 2),
    "```",
    BODY_END,
    "",
  ].join("\n");
}
