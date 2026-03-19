import { githubFetchJson } from "./api.js";

interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  bio: string | null;
  public_repos: number;
  created_at: string;
  type: string;
  name: string | null;
  followers: number;
  following: number;
}

export interface UserProfile {
  github: string;
  accountAgeDays: number;
  publicRepos: number;
  bio: string | null;
  avatarUrl: string;
  isLikelyBot: boolean;
  botSignals: string[];
}

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

function detectBotSignals(user: GitHubUser): string[] {
  const signals: string[] = [];

  // Account type
  if (user.type === "Bot") {
    signals.push("account_type_bot");
  }

  // Username patterns
  for (const pattern of BOT_USERNAME_PATTERNS) {
    if (pattern.test(user.login)) {
      signals.push(`username_pattern: ${pattern.source}`);
      break;
    }
  }

  // No avatar (using default gravatar)
  if (!user.avatar_url || user.avatar_url.includes("gravatar.com/avatar/")) {
    // GitHub generates avatar IDs, so a truly missing avatar is rare
    // but default gravatars are a signal
  }

  // No bio
  if (!user.bio) {
    signals.push("no_bio");
  }

  // No name
  if (!user.name) {
    signals.push("no_display_name");
  }

  // Very new account (< 30 days)
  const ageMs = Date.now() - new Date(user.created_at).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays < 30) {
    signals.push("account_younger_than_30_days");
  }

  // No followers and no following (common for bots)
  if (user.followers === 0 && user.following === 0) {
    signals.push("no_social_connections");
  }

  return signals;
}

export async function fetchUserProfile(username: string): Promise<UserProfile> {
  const user = await githubFetchJson<GitHubUser>(`/users/${username}`);

  const ageMs = Date.now() - new Date(user.created_at).getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

  const botSignals = detectBotSignals(user);

  return {
    github: user.login,
    accountAgeDays: ageDays,
    publicRepos: user.public_repos,
    bio: user.bio,
    avatarUrl: user.avatar_url,
    isLikelyBot: botSignals.length >= 2 || botSignals.includes("account_type_bot"),
    botSignals,
  };
}
