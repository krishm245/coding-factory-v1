import { Command, InvalidArgumentError } from "commander";

export interface IssueCommandOptions {
  model?: string;
  testScript?: string;
  dryRun?: boolean;
}

export interface IssueCommandSummary {
  issueNumber: number;
  model?: string;
  testScript?: string;
  dryRun: boolean;
}

export function parseIssueNumber(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new InvalidArgumentError("Issue number must be a positive integer.");
  }

  return Number.parseInt(value, 10);
}

export function createIssueCommandSummary(
  issueNumber: number,
  options: IssueCommandOptions
): IssueCommandSummary {
  return {
    issueNumber,
    model: options.model,
    testScript: options.testScript,
    dryRun: options.dryRun ?? false
  };
}

export function registerIssueCommand(program: Command): void {
  program
    .command("issue")
    .description("Run the coding factory for a GitHub issue.")
    .argument("<issue-number>", "GitHub issue number", parseIssueNumber)
    .option("--model <model>", "Docker Model Runner model to use")
    .option("--test-script <script>", "package.json script that runs the full test suite")
    .option("--dry-run", "parse inputs and report planned execution without making changes")
    .action((issueNumber: number, options: IssueCommandOptions) => {
      const summary = createIssueCommandSummary(issueNumber, options);

      console.log("Coding Factory issue command parsed successfully.");
      console.log(JSON.stringify(summary, null, 2));
    });
}
