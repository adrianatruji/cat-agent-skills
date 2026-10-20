/**
 * Fetch all-time skill download counts and write `src/data/downloads.json`.
 *
 * Total per slug = Clarity-era baseline (`src/data/downloads-baseline.json`)
 *                + retired tally (stored in the release body)
 *                + `download_count` of each live asset on the
 *                  `skill-downloads` release.
 *
 * Usage:
 *   GITHUB_TOKEN=... npm run downloads:fetch
 *
 * Config (env):
 *   GITHUB_TOKEN / GH_TOKEN   token with repo read access (optional for public repos)
 *   DOWNLOADS_REPO            owner/repo (default: GITHUB_REPOSITORY, then microsoft/cat-agent-skills)
 *
 * Non-fatal like `fetch-ratings.ts`: on any error the existing snapshot is kept.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateDownloads, DOWNLOADS_RELEASE_TAG, parseRetired, type Counts } from "../src/lib/release-downloads";
import { GitHubClient } from "./github-release";

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), "../src/data");
const OUT = resolve(DATA, "downloads.json");
const BASELINE = resolve(DATA, "downloads-baseline.json");

const REPO = process.env.DOWNLOADS_REPO ?? process.env.GITHUB_REPOSITORY ?? "microsoft/cat-agent-skills";
const TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";

function warn(msg: string): void {
  console.warn(`[fetch-downloads] ${msg}`);
}

function readCounts(path: string): Counts {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Counts;
  } catch {
    warn(`could not parse ${path}; treating as empty.`);
    return {};
  }
}

async function main(): Promise<void> {
  const baseline = readCounts(BASELINE);
  const gh = new GitHubClient(REPO, TOKEN);
  const release = await gh.getReleaseByTag(DOWNLOADS_RELEASE_TAG);
  if (!release) {
    warn(`release "${DOWNLOADS_RELEASE_TAG}" not found on ${REPO}; using baseline only.`);
  }
  const retired = release ? parseRetired(release.body) : {};
  const assets = release ? await gh.listAssets(release.id) : [];
  const totals = aggregateDownloads(baseline, retired, assets);

  if (Object.keys(totals).length === 0 && existsSync(OUT)) {
    warn("no counts found; keeping existing snapshot.");
    return;
  }
  writeFileSync(OUT, JSON.stringify(totals, null, 2) + "\n");
  console.log(
    `[fetch-downloads] wrote ${Object.keys(totals).length} count(s) from ${assets.length} asset(s) on ${REPO}`,
  );
}

try {
  await main();
} catch (err) {
  warn(`failed: ${(err as Error).message}; keeping existing snapshot.`);
}
