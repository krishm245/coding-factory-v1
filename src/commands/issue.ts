import { Command, InvalidArgumentError } from "commander";
import {
  type DockerStartupEnsurer,
  WorkerContainerError,
  type WorkerContainerRemover,
  type WorkerContainerStarter,
  type WorkerImageEnsurer,
  ensureDockerReadyAtStartup,
  ensureWorkerImage,
  removeWorkerContainer,
  resolveWorkerConfig,
  startWorkerContainer,
} from "../docker/worker.js";
import {
  GitBranchError,
  type IssueBranchEnsurer,
  ensureIssueBranch,
} from "../git/branch.js";
import {
  type GitDiffSummaryCollector,
  GitDiffSummaryError,
  collectGitDiffSummary,
} from "../git/diff.js";
import {
  type RepositoryContext,
  RepositoryValidationError,
  loadRepositoryContext,
} from "../git/repository.js";
import {
  type IssueBranchPublisher,
  GitPublishError,
  publishIssueBranch,
  resolveRemoteDefaultBranch,
  type RemoteBranchVerifier,
  type RemoteBranchWaiter,
  type RemoteDefaultBranchResolver,
  verifyRemoteBranchExists,
  waitForRemoteBranch,
} from "../git/publish.js";
import {
  GitHubIssueFetchError,
  type GitHubIssueFetcher,
  type PullRequestCreator,
  createPullRequestViaDockerMcp,
  fetchGitHubIssueViaDockerMcp,
  resolveMcpProfile,
} from "../mcp/github.js";
import {
  ImplementationGenerationError,
  type ImplementationPatchGenerator,
  RequirementGenerationError,
  type RequirementMarkdownGenerator,
  generateImplementationPatchViaDockerModelRunner,
  generateRequirementMarkdownViaDockerModelRunner,
  resolveModelConfig,
} from "../model/runner.js";
import {
  RequirementDocumentError,
  type RequirementDocumentExistsChecker,
  type RequirementDocumentWriter,
  getRequirementDocumentPath,
  requirementDocumentExists,
  writeRequirementDocument,
} from "../requirements/document.js";
import { buildPullRequestContent } from "../pr/content.js";
import {
  type PatchApplier,
  PatchApplicationError,
  applyPatchInContainer,
} from "../worker/patch.js";
import {
  type RepoSummaryCollector,
  collectRepoSummary,
} from "../worker/repo-summary.js";

export interface IssueCommandOptions {
  model?: string;
  testScript?: string;
  dryRun?: boolean;
  mcpProfile?: string;
  workerImage?: string;
}

export interface IssueCommandSummary {
  issueNumber: number;
  model: string;
  modelBaseUrl: string;
  testScript?: string;
  dryRun: boolean;
  mcpProfile: string;
  workerImage: string;
  repository: RepositoryContext;
}

export type ProgressLogger = (message: string) => void;

export interface IssueCommandDependencies {
  loadRepositoryContext?: () => RepositoryContext;
  fetchGitHubIssue?: GitHubIssueFetcher;
  generateRequirementMarkdown?: RequirementMarkdownGenerator;
  writeRequirementDocument?: RequirementDocumentWriter;
  requirementDocumentExists?: RequirementDocumentExistsChecker;
  ensureIssueBranch?: IssueBranchEnsurer;
  ensureWorkerImage?: WorkerImageEnsurer;
  startWorkerContainer?: WorkerContainerStarter;
  collectRepoSummary?: RepoSummaryCollector;
  generateImplementationPatch?: ImplementationPatchGenerator;
  applyPatch?: PatchApplier;
  collectGitDiffSummary?: GitDiffSummaryCollector;
  removeWorkerContainer?: WorkerContainerRemover;
  publishIssueBranch?: IssueBranchPublisher;
  createPullRequest?: PullRequestCreator;
  resolveRemoteDefaultBranch?: RemoteDefaultBranchResolver;
  verifyRemoteBranchExists?: RemoteBranchVerifier;
  waitForRemoteBranch?: RemoteBranchWaiter;
  logProgress?: ProgressLogger;
  ensureDockerReadyAtStartup?: DockerStartupEnsurer;
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
  workerImage: string,
): IssueCommandSummary {
  return {
    issueNumber,
    model,
    modelBaseUrl,
    testScript: options.testScript,
    dryRun: options.dryRun ?? false,
    mcpProfile,
    workerImage,
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
    .option(
      "--worker-image <image>",
      "Docker image to use for the mounted worker container",
    )
    .action(
      async (
        issueNumber: number,
        options: IssueCommandOptions,
        command: Command,
      ) => {
        const logProgress = dependencies.logProgress ?? defaultProgressLogger;
        let repository: RepositoryContext;

        try {
          await (
            dependencies.ensureDockerReadyAtStartup ??
            ensureDockerReadyAtStartup
          )({
            logProgress,
          });
        } catch (error) {
          const message =
            error instanceof WorkerContainerError || error instanceof Error
              ? error.message
              : "Unable to verify Docker availability.";

          command.error(`Docker startup failed: ${message}`);
          return;
        }

        logProgress("Validating git repository context.");

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

        logProgress("Resolving model, MCP, and worker configuration.");

        try {
          modelConfig = resolveModelConfig(options.model);
        } catch (error) {
          const message =
            error instanceof RequirementGenerationError ||
            error instanceof Error
              ? error.message
              : "Unable to resolve Docker Model Runner configuration.";

          command.error(`Requirement generation failed: ${message}`);
          return;
        }

        const mcpProfile = resolveMcpProfile(options.mcpProfile);
        const workerConfig = resolveWorkerConfig(options.workerImage);
        const summary = createIssueCommandSummary(
          issueNumber,
          options,
          repository,
          mcpProfile,
          modelConfig.model,
          modelConfig.modelBaseUrl,
          workerConfig.workerImage,
        );

        let issue;

        logProgress(
          `Fetching GitHub issue #${issueNumber} from ${repository.github.owner}/${repository.github.repo} using Docker MCP profile ${mcpProfile}.`,
        );

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

        console.log(issue);

        if (options.dryRun) {
          let markdown: string;

          logProgress(
            `Generating requirement markdown for issue #${issueNumber} with model ${modelConfig.model}.`,
          );

          try {
            markdown = await generateRequirementMarkdown(
              dependencies.generateRequirementMarkdown,
              issue,
              modelConfig,
            );
          } catch (error) {
            const message =
              error instanceof RequirementGenerationError ||
              error instanceof Error
                ? error.message
                : "Unable to generate requirement markdown.";

            command.error(`Requirement generation failed: ${message}`);
            return;
          }

          const requirementDocument = {
            dryRun: true,
            path: getRequirementDocumentPath(repository, issueNumber)
              .relativePath,
          };

          logProgress(
            "Dry run enabled; printing generated requirement markdown without modifying the repository.",
          );

          console.log(
            "Coding Factory requirement markdown generated successfully.",
          );
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

        let issueBranch;

        logProgress(`Preparing issue branch for issue #${issueNumber}.`);

        try {
          issueBranch = (dependencies.ensureIssueBranch ?? ensureIssueBranch)({
            issueNumber,
            repository,
          });
        } catch (error) {
          const message =
            error instanceof GitBranchError || error instanceof Error
              ? error.message
              : "Unable to prepare issue branch.";

          command.error(`Issue branch setup failed: ${message}`);
          return;
        }

        const requirementPath = getRequirementDocumentPath(
          repository,
          issueNumber,
        ).relativePath;
        const hasRequirementDocument = (
          dependencies.requirementDocumentExists ?? requirementDocumentExists
        )(repository, issueNumber);
        let requirementDocument = {
          dryRun: false,
          path: requirementPath,
          overwritten: hasRequirementDocument,
        };

        let markdown: string;

        logProgress(
          `Generating requirement markdown for issue #${issueNumber} with model ${modelConfig.model}.`,
        );

        try {
          markdown = await generateRequirementMarkdown(
            dependencies.generateRequirementMarkdown,
            issue,
            modelConfig,
          );
        } catch (error) {
          const message =
            error instanceof RequirementGenerationError ||
            error instanceof Error
              ? error.message
              : "Unable to generate requirement markdown.";

          command.error(`Requirement generation failed: ${message}`);
          return;
        }

        logProgress(`Writing requirement document to ${requirementPath}.`);

        try {
          const result = (
            dependencies.writeRequirementDocument ?? writeRequirementDocument
          )({
            issueNumber,
            markdown,
            repository,
          });

          requirementDocument = {
            dryRun: false,
            path: result.relativePath,
            overwritten: hasRequirementDocument,
          };
        } catch (error) {
          const message =
            error instanceof RequirementDocumentError || error instanceof Error
              ? error.message
              : "Unable to write requirement document.";

          command.error(`Requirement generation failed: ${message}`);
          return;
        }

        logProgress(`Preparing worker image ${workerConfig.workerImage}.`);

        try {
          (dependencies.ensureWorkerImage ?? ensureWorkerImage)(
            workerConfig.workerImage,
          );
        } catch (error) {
          const message =
            error instanceof WorkerContainerError || error instanceof Error
              ? error.message
              : "Unable to prepare worker image.";

          command.error(`Worker image setup failed: ${message}`);
          return;
        }

        let workerContainer;

        logProgress(
          `Starting worker container for branch ${issueBranch.branchName}.`,
        );

        try {
          workerContainer = (
            dependencies.startWorkerContainer ?? startWorkerContainer
          )({
            branchName: issueBranch.branchName,
            issueNumber,
            repository,
            workerImage: workerConfig.workerImage,
          });
        } catch (error) {
          const message =
            error instanceof WorkerContainerError || error instanceof Error
              ? error.message
              : "Unable to start worker container.";

          command.error(`Worker container startup failed: ${message}`);
          return;
        }

        let implementation;
        let diffSummary;
        let cleanupError: string | undefined;

        try {
          logProgress(
            "Collecting repository context for implementation generation.",
          );

          const repoSummary = (
            dependencies.collectRepoSummary ?? collectRepoSummary
          )({
            issueNumber,
            repository,
          });

          logProgress(
            `Generating implementation patch with model ${modelConfig.model}.`,
          );

          const patch = await (
            dependencies.generateImplementationPatch ??
            generateImplementationPatchViaDockerModelRunner
          )({
            repoSummary,
            model: modelConfig.model,
            modelBaseUrl: modelConfig.modelBaseUrl,
          });

          logProgress(
            `Applying implementation patch in worker container ${workerContainer.containerName}.`,
          );

          (dependencies.applyPatch ?? applyPatchInContainer)({
            containerName: workerContainer.containerName,
            patch,
          });

          logProgress("Collecting git diff summary.");

          diffSummary = (
            dependencies.collectGitDiffSummary ?? collectGitDiffSummary
          )({
            repository,
          });

          implementation = {
            changedFiles: diffSummary.changedFiles,
            diffStat: diffSummary.stat,
          };
        } catch (error) {
          const message = getImplementationErrorMessage(error);

          logProgress(
            `Removing worker container ${workerContainer.containerName}.`,
          );

          cleanupError = cleanupWorkerContainer(
            workerContainer.containerName,
            dependencies.removeWorkerContainer,
          );

          const cleanupSuffix = cleanupError
            ? ` Cleanup also failed: ${cleanupError}`
            : "";

          command.error(`Implementation failed: ${message}${cleanupSuffix}`);
          return;
        }

        logProgress(
          `Removing worker container ${workerContainer.containerName}.`,
        );

        cleanupError = cleanupWorkerContainer(
          workerContainer.containerName,
          dependencies.removeWorkerContainer,
        );

        if (cleanupError) {
          command.error(`Worker container cleanup failed: ${cleanupError}`);
          return;
        }

        let publishResult;

        logProgress(`Publishing issue branch ${issueBranch.branchName}.`);

        try {
          publishResult = (
            dependencies.publishIssueBranch ?? publishIssueBranch
          )({
            branchName: issueBranch.branchName,
            commitMessage: `feat: implement issue ${issueNumber}`,
            repository,
          });
        } catch (error) {
          const message =
            error instanceof GitPublishError || error instanceof Error
              ? error.message
              : "Unable to publish issue branch.";

          command.error(`Issue branch publish failed: ${message}`);
          return;
        }

        const pullRequestContent = buildPullRequestContent({
          changedFiles: diffSummary.changedFiles,
          commitSha: publishResult.commitSha,
          issue,
          requirementPath: requirementDocument.path,
        });
        let pullRequestBaseBranch: string;

        try {
          logProgress("Resolving pull request base branch from origin/HEAD.");
          pullRequestBaseBranch = (
            dependencies.resolveRemoteDefaultBranch ?? resolveRemoteDefaultBranch
          )(repository);
          logProgress(`Verifying remote base branch ${pullRequestBaseBranch}.`);
          (
            dependencies.verifyRemoteBranchExists ?? verifyRemoteBranchExists
          )({
            branchName: pullRequestBaseBranch,
            repository,
          });
          logProgress(
            `Waiting for remote branch ${issueBranch.branchName} to become visible on origin.`,
          );
          await (
            dependencies.waitForRemoteBranch ?? waitForRemoteBranch
          )({
            branchName: issueBranch.branchName,
            repository,
          });
        } catch (error) {
          const message =
            error instanceof GitPublishError || error instanceof Error
              ? error.message
              : "Unable to prepare pull request refs.";

          command.error(`Pull request preparation failed: ${message}`);
          return;
        }

        let pullRequest;

        logProgress(`Opening pull request for issue #${issueNumber}.`);

        try {
          pullRequest = (
            dependencies.createPullRequest ?? createPullRequestViaDockerMcp
          )({
            base: pullRequestBaseBranch,
            body: pullRequestContent.body,
            head: issueBranch.branchName,
            mcpProfile,
            repository: repository.github,
            title: pullRequestContent.title,
          });
        } catch (error) {
          const message =
            error instanceof GitHubIssueFetchError || error instanceof Error
              ? error.message
              : "Unable to open pull request through Docker MCP.";

          command.error(`Pull request creation failed: ${message}`);
          return;
        }

        try {
          console.log("Coding Factory pull request opened successfully.");
          console.log(`Pull request: ${pullRequest.url}`);
          console.log(
            JSON.stringify(
              {
                ...summary,
                issue,
                issueBranch,
                requirementDocument,
                workerContainer,
                implementation,
                cleanup: {
                  containerRemoved: true,
                },
                publish: publishResult,
                pullRequest,
              },
              null,
              2,
            ),
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to print implementation result.";

          command.error(`Implementation failed: ${message}`);
        }
      },
    );
}

function defaultProgressLogger(message: string): void {
  console.error(message);
}

async function generateRequirementMarkdown(
  generator: RequirementMarkdownGenerator | undefined,
  issue: Parameters<RequirementMarkdownGenerator>[0]["issue"],
  modelConfig: ReturnType<typeof resolveModelConfig>,
): Promise<string> {
  return (generator ?? generateRequirementMarkdownViaDockerModelRunner)({
    issue,
    model: modelConfig.model,
    modelBaseUrl: modelConfig.modelBaseUrl,
  });
}

function getImplementationErrorMessage(error: unknown): string {
  if (
    error instanceof ImplementationGenerationError ||
    error instanceof PatchApplicationError ||
    error instanceof GitDiffSummaryError ||
    error instanceof Error
  ) {
    return error.message;
  }

  return "Unable to implement requirement.";
}

function cleanupWorkerContainer(
  containerName: string,
  remover: WorkerContainerRemover | undefined,
): string | undefined {
  try {
    (remover ?? removeWorkerContainer)(containerName);
    return undefined;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "Unable to remove worker container.";
  }
}
