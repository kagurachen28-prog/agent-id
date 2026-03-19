import {
  getCachedResponse,
  setCachedResponse,
  cacheDisabled,
  ttlMultiplier,
  TTL,
} from "../cache.js";

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

/**
 * Determine TTL for a given URL.
 * /users/<name> → 1 hour; everything else (PRs, reviews, commits, search) → 6 hours.
 */
function ttlForUrl(url: string): number {
  if (/\/users\/[^/]+$/.test(url)) return TTL.USER_PROFILE * ttlMultiplier;
  return TTL.PR_REVIEW_DATA * ttlMultiplier;
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
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;

  if (!cacheDisabled) {
    const cached = getCachedResponse(url, ttlForUrl(url));
    if (cached !== null) return JSON.parse(cached) as T;
  }

  const res = await githubFetch(path);
  const text = await res.text();

  setCachedResponse(url, text);

  return JSON.parse(text) as T;
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
    // Check cache for this specific page URL
    if (!cacheDisabled) {
      const cached = getCachedResponse(url, ttlForUrl(url));
      if (cached !== null) {
        const data = JSON.parse(cached);
        // For cached responses we lose Link headers, so we store a wrapper
        if (data.__items && data.__nextUrl !== undefined) {
          if (Array.isArray(data.__items)) {
            results.push(...data.__items);
          }
          url = data.__nextUrl;
          page++;
          continue;
        }
      }
    }

    const res = await githubFetch(url);
    const data = await res.json();

    let items: T[] = [];
    if (Array.isArray(data)) {
      items = data;
    } else if (data.items && Array.isArray(data.items)) {
      items = data.items;
    }
    results.push(...items);

    // Parse Link header for next page
    const link = res.headers.get("Link");
    let nextUrl: string | null = null;
    if (link) {
      const nextMatch = link.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        nextUrl = nextMatch[1];
      }
    }

    // Cache this page with its items and next URL
    setCachedResponse(url, JSON.stringify({ __items: items, __nextUrl: nextUrl }));

    url = nextUrl;
    page++;
  }

  return results;
}
