import { Command } from "commander";

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
    console.log(`Fetching profile for ${username}...`);
  });

program.parse();
