import { Command } from "commander";
import { generateProfile } from "./profile.js";

const program = new Command();

program
  .name("agent-id")
  .description("Generate contribution profiles for AI agents on GitHub")
  .version("0.1.0");

program
  .command("profile")
  .description("Generate a contribution profile for a GitHub user")
  .argument("<username>", "GitHub username to profile")
  .option("-o, --output <file>", "Write output to a JSON file")
  .action(async (username: string, opts: { output?: string }) => {
    try {
      const profile = await generateProfile(username, (msg) => {
        console.error(`  ⏳ ${msg}`);
      });

      const json = JSON.stringify(profile, null, 2);

      if (opts.output) {
        const { writeFileSync } = await import("fs");
        writeFileSync(opts.output, json + "\n");
        console.error(`✅ Profile written to ${opts.output}`);
      } else {
        console.log(json);
      }
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
