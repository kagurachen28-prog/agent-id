import { githubFetchJson } from "./api.js";
import type { MergedPR } from "./prs.js";

interface ReviewComment {
  id: number;
  body: string;
  created_at: string;
  user: {
    login: string;
  };
  path?: string;
  html_url: string;
}

interface PRCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      date: string;
    };
  };
}

export interface ReviewPatternsResult {
  commonIssues: { category: string; count: number }[];
  correctionRate: number;
  repeatOffenses: number;
  totalReviewComments: number;
  sampleSize: number;
}

// Keyword-based categorization of review comments
const ISSUE_CATEGORIES: { category: string; keywords: RegExp[] }[] = [
  {
    category: "security",
    keywords: [
      /security/i, /vulnerab/i, /injection/i, /xss/i, /auth/i,
      /sanitiz/i, /escap/i, /secret/i, /credential/i, /token/i,
      /permission/i, /access control/i,
    ],
  },
  {
    category: "style",
    keywords: [
      /naming/i, /convention/i, /format/i, /indent/i, /whitespace/i,
      /style/i, /lint/i, /casing/i, /readab/i, /clean/i,
      /nit\b/i, /nit:/i, /minor/i,
    ],
  },
  {
    category: "logic",
    keywords: [
      /logic/i, /bug/i, /error/i, /wrong/i, /incorrect/i,
      /off.by.one/i, /edge.case/i, /boundary/i, /condition/i,
      /race.condition/i, /deadlock/i, /infinite/i,
    ],
  },
  {
    category: "performance",
    keywords: [
      /performance/i, /slow/i, /optimi/i, /efficien/i,
      /memory/i, /leak/i, /cache/i, /complex/i, /O\(n/i,
    ],
  },
  {
    category: "testing",
    keywords: [
      /test/i, /coverage/i, /assert/i, /mock/i, /spec/i,
      /unit test/i, /integration/i,
    ],
  },
  {
    category: "documentation",
    keywords: [
      /document/i, /comment/i, /jsdoc/i, /readme/i, /docstring/i,
      /explain/i, /describe/i,
    ],
  },
  {
    category: "architecture",
    keywords: [
      /architect/i, /design/i, /pattern/i, /coupling/i, /cohesion/i,
      /abstraction/i, /interface/i, /refactor/i, /structure/i,
      /modular/i, /separation/i,
    ],
  },
  {
    category: "error_handling",
    keywords: [
      /error.handl/i, /exception/i, /try.catch/i, /throw/i,
      /graceful/i, /fallback/i, /retry/i, /timeout/i,
    ],
  },
];

function categorizeComment(body: string): string[] {
  const categories: string[] = [];
  for (const { category, keywords } of ISSUE_CATEGORIES) {
    if (keywords.some((kw) => kw.test(body))) {
      categories.push(category);
    }
  }
  return categories.length > 0 ? categories : ["other"];
}

async function fetchPRReviewComments(
  repo: string,
  prNumber: number,
  author: string
): Promise<{ comments: ReviewComment[]; hadFixCommit: boolean }> {
  try {
    // Fetch review comments (inline code review comments)
    const comments = await githubFetchJson<ReviewComment[]>(
      `/repos/${repo}/pulls/${prNumber}/comments?per_page=100`
    );

    // Filter to comments NOT by the PR author (these are reviewer feedback)
    const reviewerComments = comments.filter(
      (c) => c.user.login !== author
    );

    // Check if there was a commit after the first review comment (suggests fix)
    let hadFixCommit = false;
    if (reviewerComments.length > 0) {
      const firstReviewTime = new Date(
        reviewerComments[0].created_at
      ).getTime();

      try {
        const commits = await githubFetchJson<PRCommit[]>(
          `/repos/${repo}/pulls/${prNumber}/commits?per_page=100`
        );
        hadFixCommit = commits.some(
          (c) =>
            new Date(c.commit.author.date).getTime() > firstReviewTime
        );
      } catch {
        // Ignore
      }
    }

    return { comments: reviewerComments, hadFixCommit };
  } catch {
    return { comments: [], hadFixCommit: false };
  }
}

export async function analyzeReviewPatterns(
  mergedPRs: MergedPR[],
  username: string
): Promise<ReviewPatternsResult> {
  const categoryCounts = new Map<string, number>();
  let totalComments = 0;
  let prsWithReviews = 0;
  let prsWithFixes = 0;

  // Sample up to 15 merged PRs
  const sample = mergedPRs.slice(0, 15);

  for (const pr of sample) {
    const { comments, hadFixCommit } = await fetchPRReviewComments(
      pr.repo,
      pr.number,
      username
    );

    if (comments.length > 0) {
      prsWithReviews++;
      totalComments += comments.length;

      if (hadFixCommit) {
        prsWithFixes++;
      }

      for (const comment of comments) {
        const categories = categorizeComment(comment.body);
        for (const cat of categories) {
          categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
        }
      }
    }
  }

  // Sort categories by frequency
  const commonIssues = Array.from(categoryCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  // Correction rate: proportion of reviewed PRs where the author pushed a fix
  const correctionRate =
    prsWithReviews > 0 ? prsWithFixes / prsWithReviews : 0;

  // Repeat offenses: categories that appear in > 30% of reviewed PRs
  // (indicates the same issue keeps coming up)
  let repeatOffenses = 0;
  if (prsWithReviews >= 3) {
    for (const issue of commonIssues) {
      if (issue.count / prsWithReviews > 0.3 && issue.category !== "other") {
        repeatOffenses++;
      }
    }
  }

  return {
    commonIssues,
    correctionRate: Math.round(correctionRate * 1000) / 1000,
    repeatOffenses,
    totalReviewComments: totalComments,
    sampleSize: sample.length,
  };
}
