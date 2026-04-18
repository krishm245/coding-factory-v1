import { Command, InvalidArgumentError } from "commander";
import {
  type RepositoryContext,
  RepositoryValidationError,
  loadRepositoryContext,
} from "../git/repository.js";

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
  repository: RepositoryContext;
}

export interface IssueCommandDependencies {
  loadRepositoryContext?: () => RepositoryContext;
}

export function parseIssueNumber(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new InvalidArgumentError("Issue number must be a positive integer.");
  }

  return Number.parseInt(value, 10);
}

export function createIssueCommandSummary(
  issueNumber: number,
  options: IssueCommandOptions,
  repository: RepositoryContext,
): IssueCommandSummary {
  return {
    issueNumber,
    model: options.model,
    testScript: options.testScript,
    dryRun: options.dryRun ?? false,
    repository,
  };
}

export function registerIssueCommand(
  program: Command,
  dependencies: IssueCommandDependencies = {},
): void {
  program
    .command("issue")
    .description("Run the coding factory for a GitHub issue.")
    .argument("<issue-number>", "GitHub issue number", parseIssueNumber)
    .option("--model <model>", "Docker Model Runner model to use")
    .option("--test-script <script>", "package.json script that runs the full test suite")
    .option("--dry-run", "parse inputs and report planned execution without making changes")
    .action((issueNumber: number, options: IssueCommandOptions, command: Command) => {
      let repository: RepositoryContext;

      try {
        repository = (dependencies.loadRepositoryContext ?? loadRepositoryContext)();
      } catch (error) {
        const message =
          error instanceof RepositoryValidationError || error instanceof Error
            ? error.message
            : "Unable to validate git repository.";

        command.error(`Repository validation failed: ${message}`);
        return;
      }

      const summary = createIssueCommandSummary(issueNumber, options, repository);

      console.log("Coding Factory issue command parsed successfully.");
      console.log(JSON.stringify(summary, null, 2));
    });
}
