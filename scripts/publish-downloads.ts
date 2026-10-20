/**
 * Publish every downloadable skill file as an asset on the `skill-downloads`
 * GitHub Release, so the gallery's download buttons can link to it and GitHub
 * counts each download.
 *
 * Run AFTER `npm run build` (the per-skill SKILL.md files come from `dist/`).
 *
 *   - public/bundles/<slug>.zip|.json  -> asset <slug>.zip|.json
 *   - dist/skills/<slug>.md            -> asset <slug>.md (only for skills without a bundle)
 *
 * Unchanged files are skipped (compared by SHA-256), so their counts keep
 * growing. A changed file is uploaded under a temporary name, the old asset's
 * count is added to the retired tally in the release body, the old asset is
 * deleted, and the new one is renamed into place.
 *
 * Usage:
 *   GITHUB_TOKEN=... npm run downloads:publish
 *
 * Config (env):
 *   GITHUB_TOKEN / GH_TOKEN   token with `contents: write`
 *   DOWNLOADS_REPO            owner/repo (default: GITHUB_REPOSITORY, then microsoft/cat-agent-skills)
 *   GITHUB_SHA                commit to tag when the release is first created
 *
 * FATAL on error: the built site links to these assets, so deploying without
 * them would ship broken download buttons.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DOWNLOADS_RELEASE_TAG,
  formatReleaseBody,
  parseRetired,
  slugFromAssetName,
} from "../src/lib/release-downloads";
import { GitHubClient, type Release, type ReleaseAsset } from "./github-release";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLES_DIR = join(ROOT, "public", "bundles");
const DIST_SKILLS_DIR = join(ROOT, "dist", "skills");

const REPO = process.env.DOWNLOADS_REPO ?? process.env.GITHUB_REPOSITORY ?? "microsoft/cat-agent-skills";
const TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";

type LocalFile = { name: string; slug: string; path: string; bytes: Buffer; sha256: string };

function log(msg: string): void {
  console.log(`[publish-downloads] ${msg}`);
}

function localFile(name: string, path: string): LocalFile | null {
  const slug = slugFromAssetName(name);
  if (!slug) return null;
  const bytes = readFileSync(path);
  return { name, slug, path, bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function collectFiles(): LocalFile[] {
  const files: LocalFile[] = [];
  const bundled = new Set<string>();
  if (existsSync(BUNDLES_DIR)) {
    for (const name of readdirSync(BUNDLES_DIR).sort()) {
      const f = localFile(name, join(BUNDLES_DIR, name));
      if (f) {
        files.push(f);
        bundled.add(f.slug);
      }
    }
  }
  if (!existsSync(DIST_SKILLS_DIR)) {
    throw new Error(`${DIST_SKILLS_DIR} not found; run \`npm run build\` first.`);
  }
  for (const name of readdirSync(DIST_SKILLS_DIR).sort()) {
    if (!name.endsWith(".md")) continue;
    const f = localFile(name, join(DIST_SKILLS_DIR, name));
    if (f && !bundled.has(f.slug)) files.push(f);
  }
  return files;
}

function sameContent(asset: ReleaseAsset, file: LocalFile): boolean {
  if (asset.digest) return asset.digest === `sha256:${file.sha256}`;
  return asset.size === file.bytes.length;
}

async function ensureRelease(gh: GitHubClient): Promise<Release> {
  const existing = await gh.getReleaseByTag(DOWNLOADS_RELEASE_TAG);
  if (existing) return existing;
  log(`creating release "${DOWNLOADS_RELEASE_TAG}" on ${REPO}`);
  return gh.request<Release>("POST", "/releases", {
    tag_name: DOWNLOADS_RELEASE_TAG,
    ...(process.env.GITHUB_SHA ? { target_commitish: process.env.GITHUB_SHA } : {}),
    name: "Skill downloads",
    body: formatReleaseBody({}),
    prerelease: true,
    make_latest: "false",
  });
}

async function upload(gh: GitHubClient, release: Release, name: string, file: LocalFile): Promise<ReleaseAsset> {
  const base = release.upload_url.replace(/\{.*\}$/, "");
  return gh.request<ReleaseAsset>(
    "POST",
    `${base}?name=${encodeURIComponent(name)}`,
    new Uint8Array(file.bytes),
    { "Content-Type": "application/octet-stream" },
  );
}

async function main(): Promise<void> {
  if (!TOKEN) throw new Error("GITHUB_TOKEN is required to publish download assets.");
  const gh = new GitHubClient(REPO, TOKEN);
  const files = collectFiles();
  const release = await ensureRelease(gh);
  const byName = new Map((await gh.listAssets(release.id)).map((a) => [a.name, a]));
  const retired = parseRetired(release.body);

  let added = 0;
  let replaced = 0;
  let unchanged = 0;
  for (const file of files) {
    const current = byName.get(file.name);
    if (current && sameContent(current, file)) {
      unchanged++;
      continue;
    }
    if (!current) {
      await upload(gh, release, file.name, file);
      added++;
      log(`added ${file.name}`);
      continue;
    }
    const tmp = await upload(gh, release, `${file.name}.${Date.now()}.tmp`, file);
    await gh.request("DELETE", `/releases/assets/${current.id}`);
    retired[file.slug] = (retired[file.slug] ?? 0) + current.download_count;
    await gh.request("PATCH", `/releases/${release.id}`, { body: formatReleaseBody(retired) });
    await gh.request("PATCH", `/releases/assets/${tmp.id}`, { name: file.name });
    replaced++;
    log(`replaced ${file.name} (kept ${current.download_count} download(s))`);
  }
  log(`${files.length} file(s): ${added} added, ${replaced} replaced, ${unchanged} unchanged`);
}

await main();
