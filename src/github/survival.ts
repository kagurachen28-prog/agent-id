import { githubFetchJson } from "./api.js";
import type { MergedPR } from "./prs.js";

interface SearchCommitResult {
  total_count: number;
  items: {
    sha: string;
    commit: {
      message: string;
    };
    html_url: string;
  }[];
}

export interface CodeSurvivalResult {
  mergedPRs: number;
  revertedPRs: number;
  survivalRate: number;
  revertedDetails: {
    prNumber: number;
    prTitle: string;
    repo: string;
    revertCommitUrl: string;
  }[];
}

/**
 * Check if a merged PR was reverted by searching for revert commits.
 * Basic MVP: search commit messages in the same repo for "revert" + PR number/title.
 */
async function checkPRReverted(
  pr: MergedPR
): Promise<{ reverted: boolean; revertUrl?: string }> {
  try {
    // Search for revert commits in the same repo
    // Common patterns: "Revert #123", 'Revert "PR title"', "This reverts commit <sha>"
    const query = encodeURIComponent(
      `repo:${pr.repo} "revert" "${pr.number}"`
    );
    const result = await githubFetchJson<SearchCommitResult>(
      `/search/commits?q=${query}&per_page=5`
    );

    if (result.total_count > 0) {
      // Verify at least one commit message actually mentions this PR
      for (const item of result.items) {
        const msg = item.commit.message.toLowerCase();
        if (
          msg.includes(`#${pr.number}`) ||
          msg.includes(`revert "${pr.title.toLowerCase()}"`) ||
          msg.includes(`revert '${pr.title.toLowerCase()}'`)
        ) {
          return { reverted: true, revertUrl: item.html_url };
        }
      }
    }

    // Also try searching by PR title
    const titleQuery = encodeURIComponent(
      `repo:${pr.repo} revert "${pr.title}"`
    );
    const titleResult = await githubFetchJson<SearchCommitResult>(
      `/search/commits?q=${titleQuery}&per_page=3`
    );

    for (const item of titleResult.items) {
      const msg = item.commit.message.toLowerCase();
      if (msg.includes("revert") && msg.includes(pr.title.toLowerCase())) {
        return { reverted: true, revertUrl: item.html_url };
      }
    }

    return { reverted: false };
  } catch {
    // If search fails (rate limit, etc.), assume not reverted
    return { reverted: false };
  }
}

export async function checkCodeSurvival(
  mergedPRs: MergedPR[]
): Promise<CodeSurvivalResult> {
  const revertedDetails: CodeSurvivalResult["revertedDetails"] = [];

  // Check a sample of merged PRs (up to 20 to stay within rate limits)
  const sample = mergedPRs.slice(0, 20);

  for (const pr of sample) {
    const result = await checkPRReverted(pr);
    if (result.reverted) {
      revertedDetails.push({
        prNumber: pr.number,
        prTitle: pr.title,
        repo: pr.repo,
        revertCommitUrl: result.revertUrl || "",
      });
    }
  }

  const checked = sample.length;
  const reverted = revertedDetails.length;
  const survivalRate = checked > 0 ? (checked - reverted) / checked : 1;

  return {
    mergedPRs: checked,
    revertedPRs: reverted,
    survivalRate: Math.round(survivalRate * 1000) / 1000,
    revertedDetails,
  };
}
