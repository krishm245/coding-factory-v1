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
import {
  RequirementGenerationError,
  type RequirementMarkdownGenerator,
  generateRequirementMarkdownViaDockerModelRunner,
  resolveModelConfig,
} from "../model/runner.js";
import {
  RequirementDocumentError,
  type RequirementDocumentWriter,
  getRequirementDocumentPath,
  writeRequirementDocument,
} from "../requirements/document.js";

export interface IssueCommandOptions {
  model?: string;
  testScript?: string;
  dryRun?: boolean;
  mcpProfile?: string;
}

export interface IssueCommandSummary {
  issueNumber: number;
  model: string;
  modelBaseUrl: string;
  testScript?: string;
  dryRun: boolean;
  mcpProfile: string;
  repository: RepositoryContext;
}

export interface IssueCommandDependencies {
  loadRepositoryContext?: () => RepositoryContext;
  fetchGitHubIssue?: GitHubIssueFetcher;
  generateRequirementMarkdown?: RequirementMarkdownGenerator;
  writeRequirementDocument?: RequirementDocumentWriter;
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
  model: string,
  modelBaseUrl: string,
): IssueCommandSummary {
  return {
    issueNumber,
    model,
    modelBaseUrl,
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
      async (
        issueNumber: number,
        options: IssueCommandOptions,
        command: Command,
      ) => {
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
          return;
        }

        let modelConfig: ReturnType<typeof resolveModelConfig>;

        try {
          modelConfig = resolveModelConfig(options.model);
        } catch (error) {
          const message =
            error instanceof RequirementGenerationError || error instanceof Error
              ? error.message
              : "Unable to resolve Docker Model Runner configuration.";

          command.error(`Requirement generation failed: ${message}`);
          return;
        }

        const mcpProfile = resolveMcpProfile(options.mcpProfile);
        const summary = createIssueCommandSummary(
          issueNumber,
          options,
          repository,
          mcpProfile,
          modelConfig.model,
          modelConfig.modelBaseUrl,
        );

        let issue;

        try {
          issue = (
            dependencies.fetchGitHubIssue ?? fetchGitHubIssueViaDockerMcp
          )({
            issueNumber,
            repository: repository.github,
            mcpProfile,
          });
        } catch (error) {
          const message =
            error instanceof GitHubIssueFetchError || error instanceof Error
              ? error.message
              : "Unable to fetch GitHub issue through Docker MCP.";

          command.error(`GitHub issue fetch failed: ${message}`);
          return;
        }

        let markdown: string;

        try {
          markdown = await (
            dependencies.generateRequirementMarkdown
            ?? generateRequirementMarkdownViaDockerModelRunner
          )({
            issue,
            model: modelConfig.model,
            modelBaseUrl: modelConfig.modelBaseUrl,
          });
        } catch (error) {
          const message =
            error instanceof RequirementGenerationError || error instanceof Error
              ? error.message
              : "Unable to generate requirement markdown.";

          command.error(`Requirement generation failed: ${message}`);
          return;
        }

        if (options.dryRun) {
          const requirementDocument = {
            dryRun: true,
            path: getRequirementDocumentPath(repository, issueNumber).relativePath,
          };

          console.log("Coding Factory requirement markdown generated successfully.");
          console.log(
            JSON.stringify(
              {
                ...summary,
                issue,
                requirementDocument,
              },
              null,
              2,
            ),
          );
          console.log(markdown);
          return;
        }

        try {
          const result = (
            dependencies.writeRequirementDocument ?? writeRequirementDocument
          )({
            issueNumber,
            markdown,
            repository,
          });

          console.log("Coding Factory requirement document written successfully.");
          console.log(
            JSON.stringify(
              {
                ...summary,
                issue,
                requirementDocument: {
                  dryRun: false,
                  path: result.relativePath,
                },
              },
              null,
              2,
            ),
          );
        } catch (error) {
          const message =
            error instanceof RequirementDocumentError || error instanceof Error
              ? error.message
              : "Unable to write requirement document.";

          command.error(`Requirement generation failed: ${message}`);
        }
      },
    );
}
