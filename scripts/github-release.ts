/**
 * Minimal GitHub REST helpers for the skill-downloads release.
 * Used by `fetch-downloads.ts` and `publish-downloads.ts`.
 */

export type ReleaseAsset = {
  id: number;
  name: string;
  size: number;
  download_count: number;
  digest?: string | null;
};

export type Release = {
  id: number;
  body: string | null;
  upload_url: string;
};

export class GitHubClient {
  constructor(
    readonly repo: string,
    private readonly token: string,
  ) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`invalid repo "${repo}"; expected owner/repo`);
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "cat-agent-skills-downloads",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...extra,
    };
  }

  async request<T>(method: string, url: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    const full = url.startsWith("http") ? url : `https://api.github.com/repos/${this.repo}${url}`;
    const isBinary = body instanceof Uint8Array;
    const res = await fetch(full, {
      method,
      headers: this.headers({
        ...(body !== undefined && !isBinary ? { "Content-Type": "application/json" } : {}),
        ...extraHeaders,
      }),
      body: body === undefined ? undefined : isBinary ? (body as Uint8Array) : JSON.stringify(body),
    });
    if (!res.ok) {
      const err = new Error(`GitHub ${method} ${full} -> HTTP ${res.status}: ${await res.text()}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  /** The release for `tag`, or null when it doesn't exist yet. */
  async getReleaseByTag(tag: string): Promise<Release | null> {
    try {
      return await this.request<Release>("GET", `/releases/tags/${encodeURIComponent(tag)}`);
    } catch (err) {
      if ((err as { status?: number }).status === 404) return null;
      throw err;
    }
  }

  async listAssets(releaseId: number): Promise<ReleaseAsset[]> {
    const all: ReleaseAsset[] = [];
    for (let page = 1; ; page++) {
      const batch = await this.request<ReleaseAsset[]>(
        "GET",
        `/releases/${releaseId}/assets?per_page=100&page=${page}`,
      );
      all.push(...batch);
      if (batch.length < 100) return all;
    }
  }
}
