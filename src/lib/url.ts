/**
 * Link for a downloadable skill file. When `PUBLIC_DOWNLOADS_RELEASE_URL` is set
 * at build time (the deploy workflow sets it), downloads are served from the
 * `skill-downloads` GitHub Release so GitHub counts them; otherwise (local dev,
 * CI previews) they fall back to the copy served with the site.
 */
export function downloadHref(assetName: string, localPath: string): string {
  const release = (import.meta.env.PUBLIC_DOWNLOADS_RELEASE_URL ?? "").replace(/\/$/, "");
  return release ? `${release}/${encodeURIComponent(assetName)}` : withBase(localPath);
}

/** Prefix a path with the configured base path (for GitHub Pages). */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${base}${clean}`;
}
