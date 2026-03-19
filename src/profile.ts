import { fetchUserProfile, type UserProfile } from "./github/user.js";
import { fetchPRHistory, type PRHistoryResult, type MergedPR } from "./github/prs.js";
import { checkCodeSurvival, type CodeSurvivalResult } from "./github/survival.js";
import { analyzeReviewPatterns, type ReviewPatternsResult } from "./github/reviews.js";

export interface AgentProfile {
  // Identity
  github: string;
  accountAge: number;
  isLikelyBot: boolean;
  botSignals: string[];
  bio: string | null;
  avatarUrl: string;

  // PR stats
  prs: {
    total: number;
    merged: number;
    closed: number;
    open: number;
    mergeRate: number;
    avgReviewRounds: number;
    avgTimeToMerge: number;
  };

  // Code survival
  codeSurvival: {
    mergedPRs: number;
    revertedPRs: number;
    survivalRate: number;
  };

  // Review patterns
  reviewPatterns: {
    commonIssues: string[];
    correctionRate: number;
    repeatOffenses: number;
  };

  // Contribution type distribution
  contributionTypes: {
    bugfix: number;
    test: number;
    docs: number;
    feature: number;
    refactor: number;
    ci: number;
  };

  // Active projects
  activeProjects: {
    repo: string;
    prsCount: number;
    mergeRate: number;
    lastActivity: string;
  }[];

  // Metadata
  generatedAt: string;
  version: string;
}

// Classify PR contribution type from title
const CONTRIBUTION_PATTERNS: { type: keyof AgentProfile["contributionTypes"]; patterns: RegExp[] }[] = [
  {
    // Docs first — "typo" is always docs, not bugfix
    type: "docs",
    patterns: [/\bdocs?\b/i, /\breadme\b/i, /\bchangelog\b/i, /\btypo\b/i, /\bwiki\b/i, /\bjsdoc\b/i, /\bdocstring/i],
  },
  {
    type: "ci",
    patterns: [/\bci\b/i, /\bcd\b/i, /\bpipeline\b/i, /\bworkflow\b/i, /\bdeploy/i, /\bdocker/i, /\bgithub.action/i],
  },
  {
    type: "test",
    patterns: [/\btest/i, /\bspec\b/i, /\bcoverage\b/i, /\bvitest\b/i, /\bjest\b/i, /\bcypress\b/i],
  },
  {
    type: "bugfix",
    patterns: [/\bfix/i, /\bbug\b/i, /\bpatch\b/i, /\bhotfix/i, /\bresolve/i, /\brepair/i],
  },
  {
    type: "refactor",
    patterns: [/\brefactor/i, /\bcleanup\b/i, /\bclean.up\b/i, /\brestructur/i, /\breorgani/i, /\bsimplif/i, /\bextract/i],
  },
  {
    type: "feature",
    patterns: [/\bfeat/i, /\badd\b/i, /\bimplement/i, /\bnew\b/i, /\bcreat/i, /\bintroduc/i, /\bsupport\b/i, /\benabl/i],
  },
];

function classifyContributions(
  prs: { title: string }[]
): AgentProfile["contributionTypes"] {
  const counts = {
    bugfix: 0,
    test: 0,
    docs: 0,
    feature: 0,
    refactor: 0,
    ci: 0,
  };

  for (const pr of prs) {
    let classified = false;
    for (const { type, patterns } of CONTRIBUTION_PATTERNS) {
      if (patterns.some((p) => p.test(pr.title))) {
        counts[type]++;
        classified = true;
        break; // First match wins (order matters)
      }
    }
    if (!classified) {
      counts.feature++; // Default to feature
    }
  }

  return counts;
}

export async function generateProfile(
  username: string,
  onProgress?: (msg: string) => void
): Promise<AgentProfile> {
  const log = onProgress || (() => {});

  log("Fetching user profile...");
  const user = await fetchUserProfile(username);

  log("Fetching PR history...");
  const prHistory = await fetchPRHistory(username);

  let survival: CodeSurvivalResult = {
    mergedPRs: 0,
    revertedPRs: 0,
    survivalRate: 1,
    revertedDetails: [],
  };

  let reviews: ReviewPatternsResult = {
    commonIssues: [],
    correctionRate: 0,
    repeatOffenses: 0,
    totalReviewComments: 0,
    sampleSize: 0,
  };

  if (prHistory.mergedPRs.length > 0) {
    log("Checking code survival...");
    survival = await checkCodeSurvival(prHistory.mergedPRs);

    log("Analyzing review feedback...");
    reviews = await analyzeReviewPatterns(prHistory.mergedPRs, username);
  }

  log("Classifying contributions...");
  // Use all PRs (not just merged) for contribution type classification
  const allPRTitles = [
    ...prHistory.mergedPRs.map((pr) => ({ title: pr.title })),
  ];
  // We don't have titles for non-merged PRs in current data model,
  // so classify based on merged PRs
  const contributionTypes = classifyContributions(allPRTitles);

  return {
    github: user.github,
    accountAge: user.accountAgeDays,
    isLikelyBot: user.isLikelyBot,
    botSignals: user.botSignals,
    bio: user.bio,
    avatarUrl: user.avatarUrl,

    prs: {
      total: prHistory.stats.total,
      merged: prHistory.stats.merged,
      closed: prHistory.stats.closed,
      open: prHistory.stats.open,
      mergeRate: prHistory.stats.mergeRate,
      avgReviewRounds: prHistory.stats.avgReviewRounds,
      avgTimeToMerge: prHistory.stats.avgTimeToMergeHours,
    },

    codeSurvival: {
      mergedPRs: survival.mergedPRs,
      revertedPRs: survival.revertedPRs,
      survivalRate: survival.survivalRate,
    },

    reviewPatterns: {
      commonIssues: reviews.commonIssues.map((i) => i.category),
      correctionRate: reviews.correctionRate,
      repeatOffenses: reviews.repeatOffenses,
    },

    contributionTypes,

    activeProjects: prHistory.repos.map((r) => ({
      repo: r.repo,
      prsCount: r.prsCount,
      mergeRate: r.mergeRate,
      lastActivity: r.lastActivity,
    })),

    generatedAt: new Date().toISOString(),
    version: "0.1.0",
  };
}
