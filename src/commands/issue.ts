import { Command, InvalidArgumentError } from "commander";
import {
  type RepositoryContext,
  RepositoryValidationError,
  loadRepositoryContext,
} from "../git/repository.js";
import {
  GitHubIssueFetchError,
  type GitHubIssueFetcher,
  fetchGitHubIssueViaDockerMcp,
  resolveMcpProfile,
} from "../mcp/github.js";

export interface IssueCommandOptions {
  model?: string;
  testScript?: string;
  dryRun?: boolean;
  mcpProfile?: string;
}

export interface IssueCommandSummary {
  issueNumber: number;
  model?: string;
  testScript?: string;
  dryRun: boolean;
  mcpProfile: string;
  repository: RepositoryContext;
}

export interface IssueCommandDependencies {
  loadRepositoryContext?: () => RepositoryContext;
  fetchGitHubIssue?: GitHubIssueFetcher;
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
  mcpProfile: string,
): IssueCommandSummary {
  return {
    issueNumber,
    model: options.model,
    testScript: options.testScript,
    dryRun: options.dryRun ?? false,
    mcpProfile,
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
    .option(
      "--test-script <script>",
      "package.json script that runs the full test suite",
    )
    .option(
      "--dry-run",
      "parse inputs and report planned execution without making changes",
    )
    .option(
      "--mcp-profile <profile>",
      "Docker MCP profile to use for GitHub issue access",
    )
    .action(
      (issueNumber: number, options: IssueCommandOptions, command: Command) => {
        let repository: RepositoryContext;

        try {
          repository = (
            dependencies.loadRepositoryContext ?? loadRepositoryContext
          )();
        } catch (error) {
          const message =
            error instanceof RepositoryValidationError || error instanceof Error
              ? error.message
              : "Unable to validate git repository.";

          command.error(`Repository validation failed: ${message}`);
        }

        const mcpProfile = resolveMcpProfile(options.mcpProfile);
        const summary = createIssueCommandSummary(
          issueNumber,
          options,
          repository,
          mcpProfile,
        );

        try {
          const issue = (
            dependencies.fetchGitHubIssue ?? fetchGitHubIssueViaDockerMcp
          )({
            issueNumber,
            repository: repository.github,
            mcpProfile,
          });

          console.log("Coding Factory GitHub issue fetched successfully.");
          console.log(
            JSON.stringify(
              {
                ...summary,
                issue,
              },
              null,
              2,
            ),
          );
        } catch (error) {
          const message =
            error instanceof GitHubIssueFetchError || error instanceof Error
              ? error.message
              : "Unable to fetch GitHub issue through Docker MCP.";

          command.error(`GitHub issue fetch failed: ${message}`);
        }
      },
    );
}
