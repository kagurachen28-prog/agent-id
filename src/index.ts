import { Command } from "commander";
import { fetchUserProfile } from "./github/user.js";

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
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
