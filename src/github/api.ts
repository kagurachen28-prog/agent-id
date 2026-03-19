const GITHUB_API = "https://api.github.com";

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "agent-id/0.1.0",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function githubFetch(path: string): Promise<Response> {
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
  const res = await fetch(url, { headers: getHeaders() });

  // Rate limit handling
  const remaining = res.headers.get("X-RateLimit-Remaining");
  const resetAt = res.headers.get("X-RateLimit-Reset");

  if (res.status === 403 && remaining === "0" && resetAt) {
    const resetDate = new Date(parseInt(resetAt) * 1000);
    throw new Error(
      `GitHub API rate limit exceeded. Resets at ${resetDate.toISOString()}. ` +
        `Set GITHUB_TOKEN env var to increase limits.`
    );
  }

  if (res.status === 404) {
    throw new Error(`GitHub resource not found: ${path}`);
  }

  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${res.statusText}`);
  }

  return res;
}

export async function githubFetchJson<T>(path: string): Promise<T> {
  const res = await githubFetch(path);
  return res.json() as Promise<T>;
}

/**
 * Paginated fetch — collects all pages from a GitHub list endpoint.
 * Uses Link header for pagination.
 */
export async function githubFetchAllPages<T>(path: string, maxPages = 10): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = path.startsWith("http")
    ? path
    : `${GITHUB_API}${path}`;
  let page = 0;

  while (url && page < maxPages) {
    const res = await githubFetch(url);
    const data = await res.json();

    if (Array.isArray(data)) {
      results.push(...data);
    } else if (data.items && Array.isArray(data.items)) {
      results.push(...data.items);
    }

    // Parse Link header for next page
    const link = res.headers.get("Link");
    url = null;
    if (link) {
      const nextMatch = link.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        url = nextMatch[1];
      }
    }
    page++;
  }

  return results;
}
