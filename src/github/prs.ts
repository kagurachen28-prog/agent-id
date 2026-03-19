import { githubFetch, githubFetchJson } from "./api.js";

interface SearchResult {
  total_count: number;
  items: SearchPRItem[];
}

interface SearchPRItem {
  number: number;
  title: string;
  state: string;
  created_at: string;
  closed_at: string | null;
  pull_request: {
    merged_at: string | null;
    html_url: string;
  };
  repository_url: string;
  html_url: string;
}

interface PRReview {
  id: number;
  state: string;
  submitted_at: string;
}

export interface PRStats {
  total: number;
  merged: number;
  closed: number;
  open: number;
  mergeRate: number;
  avgReviewRounds: number;
  avgTimeToMergeHours: number;
}

export interface RepoBreakdown {
  repo: string;
  prsCount: number;
  mergeRate: number;
  lastActivity: string;
}

export interface PRHistoryResult {
  stats: PRStats;
  repos: RepoBreakdown[];
  mergedPRs: MergedPR[];
}

export interface MergedPR {
  number: number;
  title: string;
  repo: string;       // "owner/repo"
  mergedAt: string;
  htmlUrl: string;
}

function repoFromUrl(repositoryUrl: string): string {
  // https://api.github.com/repos/owner/repo -> owner/repo
  const match = repositoryUrl.match(/repos\/(.+)$/);
  return match ? match[1] : repositoryUrl;
}

async function fetchReviewCount(repo: string, prNumber: number): Promise<number> {
  try {
    const reviews = await githubFetchJson<PRReview[]>(
      `/repos/${repo}/pulls/${prNumber}/reviews`
    );
    // Count unique review rounds (grouped by unique submitted_at dates)
    const reviewStates = reviews.filter(
      (r) => r.state === "CHANGES_REQUESTED" || r.state === "APPROVED"
    );
    return reviewStates.length;
  } catch {
    return 0;
  }
}

export async function fetchPRHistory(username: string): Promise<PRHistoryResult> {
  // Fetch PRs via search API — paginate up to 300 PRs
  const allPRs: SearchPRItem[] = [];
  const perPage = 100;
  const maxPages = 3;

  for (let page = 1; page <= maxPages; page++) {
    const url = `/search/issues?q=type:pr+author:${username}&per_page=${perPage}&page=${page}&sort=created&order=desc`;
    const result = await githubFetchJson<SearchResult>(url);
    allPRs.push(...result.items);

    if (allPRs.length >= result.total_count || result.items.length < perPage) {
      break;
    }
  }

  // Classify PRs
  let merged = 0;
  let closed = 0;
  let open = 0;
  const mergedPRs: MergedPR[] = [];
  const repoMap = new Map<string, { prs: SearchPRItem[]; merged: number }>();

  for (const pr of allPRs) {
    const repo = repoFromUrl(pr.repository_url);

    if (!repoMap.has(repo)) {
      repoMap.set(repo, { prs: [], merged: 0 });
    }
    repoMap.get(repo)!.prs.push(pr);

    if (pr.pull_request.merged_at) {
      merged++;
      repoMap.get(repo)!.merged++;
      mergedPRs.push({
        number: pr.number,
        title: pr.title,
        repo,
        mergedAt: pr.pull_request.merged_at,
        htmlUrl: pr.html_url,
      });
    } else if (pr.state === "closed") {
      closed++;
    } else {
      open++;
    }
  }

  const total = allPRs.length;
  const mergeRate = total > 0 ? merged / total : 0;

  // Calculate avg time to merge (for merged PRs)
  let totalMergeTimeMs = 0;
  let mergeTimeCount = 0;
  for (const pr of allPRs) {
    if (pr.pull_request.merged_at) {
      const created = new Date(pr.created_at).getTime();
      const mergedAt = new Date(pr.pull_request.merged_at).getTime();
      totalMergeTimeMs += mergedAt - created;
      mergeTimeCount++;
    }
  }
  const avgTimeToMergeHours =
    mergeTimeCount > 0
      ? totalMergeTimeMs / mergeTimeCount / (1000 * 60 * 60)
      : 0;

  // Sample review rounds (check up to 10 merged PRs to avoid rate limits)
  let totalReviewRounds = 0;
  let reviewSampleCount = 0;
  const samplePRs = mergedPRs.slice(0, 10);

  for (const pr of samplePRs) {
    const rounds = await fetchReviewCount(pr.repo, pr.number);
    totalReviewRounds += rounds;
    reviewSampleCount++;
  }
  const avgReviewRounds =
    reviewSampleCount > 0 ? totalReviewRounds / reviewSampleCount : 0;

  // Build repo breakdown
  const repos: RepoBreakdown[] = [];
  for (const [repo, data] of repoMap) {
    const lastPR = data.prs.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];

    repos.push({
      repo,
      prsCount: data.prs.length,
      mergeRate: data.prs.length > 0 ? data.merged / data.prs.length : 0,
      lastActivity: lastPR.created_at,
    });
  }

  repos.sort((a, b) => b.prsCount - a.prsCount);

  return {
    stats: {
      total,
      merged,
      closed,
      open,
      mergeRate: Math.round(mergeRate * 1000) / 1000,
      avgReviewRounds: Math.round(avgReviewRounds * 10) / 10,
      avgTimeToMergeHours: Math.round(avgTimeToMergeHours * 10) / 10,
    },
    repos,
    mergedPRs,
  };
}
