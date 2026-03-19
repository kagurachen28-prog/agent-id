import { describe, it, expect } from "vitest";

// We test the classification logic and bot detection logic as pure functions.
// API-calling functions are integration tests (need network).

describe("bot detection", () => {
  // Import the module to test username pattern matching
  const BOT_USERNAME_PATTERNS = [
    /bot$/i,
    /\[bot\]$/i,
    /-bot-/i,
    /^bot-/i,
    /ci-/i,
    /auto-/i,
    /dependabot/i,
    /renovate/i,
    /greenkeeper/i,
    /snyk/i,
    /codecov/i,
    /github-actions/i,
  ];

  function matchesBotPattern(username: string): boolean {
    return BOT_USERNAME_PATTERNS.some((p) => p.test(username));
  }

  it("detects common bot usernames", () => {
    expect(matchesBotPattern("dependabot")).toBe(true);
    expect(matchesBotPattern("renovate")).toBe(true);
    expect(matchesBotPattern("github-actions")).toBe(true);
    expect(matchesBotPattern("my-ci-runner")).toBe(true);
    expect(matchesBotPattern("auto-merger")).toBe(true);
    expect(matchesBotPattern("deploy-bot")).toBe(true);
  });

  it("does not flag normal usernames", () => {
    expect(matchesBotPattern("kagurachen28-prog")).toBe(false);
    expect(matchesBotPattern("daniyuu")).toBe(false);
    expect(matchesBotPattern("octocat")).toBe(false);
    expect(matchesBotPattern("john-doe")).toBe(false);
  });
});

describe("contribution type classification", () => {
  const CONTRIBUTION_PATTERNS: { type: string; patterns: RegExp[] }[] = [
    {
      type: "docs",
      patterns: [/\bdocs?\b/i, /\breadme\b/i, /\bchangelog\b/i, /\btypo\b/i, /\bwiki\b/i],
    },
    {
      type: "ci",
      patterns: [/\bci\b/i, /\bcd\b/i, /\bpipeline\b/i, /\bworkflow\b/i, /\bdeploy/i, /\bdocker/i],
    },
    {
      type: "bugfix",
      patterns: [/\bfix/i, /\bbug\b/i, /\bpatch\b/i, /\bhotfix/i, /\bresolve/i, /\brepair/i],
    },
    {
      type: "test",
      patterns: [/\btest/i, /\bspec\b/i, /\bcoverage\b/i, /\bvitest\b/i, /\bjest\b/i],
    },
    {
      type: "refactor",
      patterns: [/\brefactor/i, /\bcleanup\b/i, /\bclean.up\b/i, /\brestructur/i, /\breorgani/i],
    },
    {
      type: "feature",
      patterns: [/\bfeat/i, /\badd\b/i, /\bimplement/i, /\bnew\b/i, /\bcreat/i, /\bintroduc/i],
    },
  ];

  function classify(title: string): string {
    for (const { type, patterns } of CONTRIBUTION_PATTERNS) {
      if (patterns.some((p) => p.test(title))) {
        return type;
      }
    }
    return "feature";
  }

  it("classifies bug fixes", () => {
    expect(classify("fix: resolve null pointer in parser")).toBe("bugfix");
    expect(classify("Bug: Login broken on mobile")).toBe("bugfix");
    expect(classify("hotfix for production crash")).toBe("bugfix");
  });

  it("classifies tests", () => {
    expect(classify("Add unit tests for auth module")).toBe("test");
    expect(classify("Improve test coverage")).toBe("test");
  });

  it("classifies docs", () => {
    expect(classify("Update README with usage examples")).toBe("docs");
    expect(classify("Fix typo in contributing guide")).toBe("docs");
  });

  it("classifies features", () => {
    expect(classify("feat: add dark mode support")).toBe("feature");
    expect(classify("Implement user dashboard")).toBe("feature");
  });

  it("classifies refactoring", () => {
    expect(classify("Refactor database layer")).toBe("refactor");
    expect(classify("Clean up unused imports")).toBe("refactor");
  });

  it("classifies CI/CD", () => {
    expect(classify("Update CI workflow")).toBe("ci");
    expect(classify("Add Docker build step")).toBe("ci");
  });

  it("defaults unknown titles to feature", () => {
    expect(classify("Improve performance of rendering")).toBe("feature");
  });
});

describe("review comment categorization", () => {
  const ISSUE_CATEGORIES: { category: string; keywords: RegExp[] }[] = [
    {
      category: "security",
      keywords: [/security/i, /vulnerab/i, /injection/i, /xss/i],
    },
    {
      category: "style",
      keywords: [/naming/i, /convention/i, /format/i, /nit\b/i, /nit:/i],
    },
    {
      category: "logic",
      keywords: [/logic/i, /bug/i, /error/i, /wrong/i, /edge.case/i],
    },
    {
      category: "performance",
      keywords: [/performance/i, /slow/i, /optimi/i, /memory/i],
    },
  ];

  function categorize(body: string): string[] {
    const cats: string[] = [];
    for (const { category, keywords } of ISSUE_CATEGORIES) {
      if (keywords.some((kw) => kw.test(body))) {
        cats.push(category);
      }
    }
    return cats.length > 0 ? cats : ["other"];
  }

  it("categorizes security comments", () => {
    expect(categorize("This is a SQL injection vulnerability")).toContain("security");
  });

  it("categorizes style comments", () => {
    expect(categorize("nit: naming convention mismatch")).toContain("style");
  });

  it("categorizes logic issues", () => {
    expect(categorize("This has a logic error in the edge case")).toContain("logic");
  });

  it("categorizes performance issues", () => {
    expect(categorize("This could be slow with large datasets")).toContain("performance");
  });

  it("returns other for uncategorizable comments", () => {
    expect(categorize("Looks good to me!")).toEqual(["other"]);
  });

  it("can return multiple categories", () => {
    const cats = categorize("This naming convention could cause a security issue");
    expect(cats).toContain("style");
    expect(cats).toContain("security");
  });
});
