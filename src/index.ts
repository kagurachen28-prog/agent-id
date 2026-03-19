import { Command } from "commander";
import { fetchUserProfile } from "./github/user.js";
import { fetchPRHistory } from "./github/prs.js";
import { checkCodeSurvival } from "./github/survival.js";

const program = new Command();

program
  .name("agent-id")
  .description("Generate contribution profiles for AI agents on GitHub")
  .version("0.1.0");

program
  .command("profile")
  .description("Generate a contribution profile for a GitHub user")
  .argument("<username>", "GitHub username to profile")
  .action(async (username: string) => {
    try {
      console.log(`Fetching profile for ${username}...`);

      const userProfile = await fetchUserProfile(username);
      console.log("\n📋 User Profile:");
      console.log(JSON.stringify(userProfile, null, 2));

      console.log("\n📊 Fetching PR history...");
      const prHistory = await fetchPRHistory(username);
      console.log("\n📈 PR Stats:");
      console.log(JSON.stringify(prHistory.stats, null, 2));
      console.log(`\n📂 Active repos: ${prHistory.repos.length}`);
      for (const repo of prHistory.repos.slice(0, 5)) {
        console.log(
          `  - ${repo.repo}: ${repo.prsCount} PRs (${Math.round(repo.mergeRate * 100)}% merged)`
        );
      }

      if (prHistory.mergedPRs.length > 0) {
        console.log("\n🔍 Checking code survival...");
        const survival = await checkCodeSurvival(prHistory.mergedPRs);
        console.log("\n🛡️ Code Survival:");
        console.log(JSON.stringify({
          mergedPRs: survival.mergedPRs,
          revertedPRs: survival.revertedPRs,
          survivalRate: survival.survivalRate,
        }, null, 2));
        if (survival.revertedDetails.length > 0) {
          console.log("  Reverted PRs:");
          for (const r of survival.revertedDetails) {
            console.log(`    - #${r.prNumber}: ${r.prTitle}`);
          }
        }
      }
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
