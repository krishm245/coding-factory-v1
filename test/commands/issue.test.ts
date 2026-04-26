import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProgram } from "../../src/cli.js";
import {
  createIssueCommandSummary,
  parseIssueNumber,
} from "../../src/commands/issue.js";
import {
  type RepositoryContext,
  RepositoryValidationError,
} from "../../src/git/repository.js";
import type { NormalizedGitHubIssue } from "../../src/mcp/github.js";

const repositoryContext: RepositoryContext = {
  root: "/repo",
  currentBranch: "main",
  remoteUrl: "git@github.com:owner/repo.git",
  github: {
    owner: "owner",
    repo: "repo",
  },
  isClean: true,
};

const githubIssue: NormalizedGitHubIssue = {
  issueNumber: 123,
  title: "Add Docker MCP issue fetching",
  state: "open",
  url: "https://github.com/owner/repo/issues/123",
  author: "johndoe123",
  labels: ["enhancement"],
  body: "Fetch this issue through Docker MCP.",
  repository: repositoryContext.github,
  mcpProfile: "test-profile",
};
const requirementMarkdown = [
  "# Issue 123: Add Docker MCP issue fetching",
  "",
  "## Summary",
  "",
  "Fetch GitHub issue data through Docker MCP.",
].join("\n");
const issueBranch = {
  branchName: "coding-factory/issue-123",
  created: true,
};
const workerContainer = {
  containerId: "container-123",
  containerName: "coding-factory-issue-123",
  workerImage: "coding-factory-worker:latest",
  workspacePath: "/workspace",
};
const requirementWriteResult = {
  absolutePath: "/repo/requirements/issue-123.md",
  relativePath: "requirements/issue-123.md",
};
const repoSummary = {
  requirementMarkdown,
  tree: ["package.json", "src/index.ts"],
  files: [
    {
      path: "src/index.ts",
      content: "console.log('hello');\n",
    },
  ],
};
const implementationPatch = [
  "diff --git a/src/index.ts b/src/index.ts",
  "index 1111111..2222222 100644",
  "--- a/src/index.ts",
  "+++ b/src/index.ts",
  "@@ -1 +1 @@",
  "-console.log('hello');",
  "+console.log('implemented');",
].join("\n");
const diffSummary = {
  changedFiles: ["src/index.ts"],
  stat: " src/index.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)",
};
const publishResult = {
  branchName: "coding-factory/issue-123",
  commitSha: "abc123",
  remote: "origin",
};
const pullRequest = {
  number: 7,
  title: "Implement issue #123: Add Docker MCP issue fetching",
  url: "https://github.com/owner/repo/pull/7",
};

function createImplementationDependencies() {
  return {
    ensureWorkerImage: vi.fn(),
    collectRepoSummary: vi.fn(() => repoSummary),
    generateImplementationPatch: vi.fn(async () => implementationPatch),
    applyPatch: vi.fn(),
    collectGitDiffSummary: vi.fn(() => diffSummary),
    removeWorkerContainer: vi.fn(),
  };
}

function createPublishDependencies() {
  return {
    publishIssueBranch: vi.fn(() => publishResult),
    resolveRemoteDefaultBranch: vi.fn(() => "main"),
    verifyRemoteBranchExists: vi.fn(),
    waitForRemoteBranch: vi.fn(async () => undefined),
    createPullRequest: vi.fn(() => pullRequest),
  };
}

function createRequirementDependencies(exists = true) {
  return {
    requirementDocumentExists: vi.fn(() => exists),
    generateRequirementMarkdown: vi.fn(async () => requirementMarkdown),
    writeRequirementDocument: vi.fn(() => requirementWriteResult),
  };
}

function createDockerStartupDependency() {
  return {
    ensureDockerReadyAtStartup: vi.fn(async () => undefined),
  };
}

function findJsonLog(calls: unknown[][]): string {
  const message = calls
    .map((call) => call[0])
    .find((value): value is string => typeof value === "string" && value.startsWith("{"));

  if (!message) {
    throw new Error("Expected a JSON console log.");
  }

  return message;
}

function progressMessages(logProgress: ReturnType<typeof vi.fn>): unknown[] {
  return logProgress.mock.calls.map((call) => call[0]);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("createProgram", () => {
  it("registers the CLI name and issue command", () => {
    const program = createProgram();

    expect(program.name()).toBe("coding-factory");
    expect(program.commands.map((command) => command.name())).toContain(
      "issue",
    );
  });
});

describe("parseIssueNumber", () => {
  it("accepts positive integer issue numbers", () => {
    expect(parseIssueNumber("123")).toBe(123);
  });

  it.each(["0", "-1", "abc", "1.5", ""])(
    "rejects invalid issue number %s",
    (value) => {
      expect(() => parseIssueNumber(value)).toThrow(
        "Issue number must be a positive integer.",
      );
    },
  );
});

describe("issue command", () => {
  it("generates and previews requirement markdown in dry-run mode", async () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchGitHubIssue = vi.fn(() => githubIssue);
    const generateRequirementMarkdown = vi.fn(async () => requirementMarkdown);
    const writeRequirementDocument = vi.fn();
    const ensureIssueBranch = vi.fn(() => issueBranch);
    const startWorkerContainer = vi.fn(() => workerContainer);
    const publishIssueBranch = vi.fn(() => publishResult);
    const createPullRequest = vi.fn(() => pullRequest);
    const ensureDockerReadyAtStartup = vi.fn(async (options?: {
      logProgress?: (message: string) => void;
    }) => {
      options?.logProgress?.("Checking Docker availability.");
      options?.logProgress?.("Docker is already running.");
    });
    const logProgress = vi.fn();
    const program = createProgram({
      ensureDockerReadyAtStartup,
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue,
      generateRequirementMarkdown,
      writeRequirementDocument,
      ensureIssueBranch,
      startWorkerContainer,
      publishIssueBranch,
      createPullRequest,
      logProgress,
    });

    await program.parseAsync(
      [
        "node",
        "coding-factory",
        "issue",
        "123",
        "--model",
        "ai/test-model",
        "--test-script",
        "test:all",
        "--dry-run",
        "--mcp-profile",
        "test-profile",
      ],
      { from: "node" },
    );

    expect(fetchGitHubIssue).toHaveBeenCalledWith({
      issueNumber: 123,
      repository: repositoryContext.github,
      mcpProfile: "test-profile",
    });
    expect(generateRequirementMarkdown).toHaveBeenCalledWith({
      issue: githubIssue,
      model: "ai/test-model",
      modelBaseUrl: "http://localhost:12434/engines/v1",
    });
    expect(writeRequirementDocument).not.toHaveBeenCalled();
    expect(ensureIssueBranch).not.toHaveBeenCalled();
    expect(startWorkerContainer).not.toHaveBeenCalled();
    expect(publishIssueBranch).not.toHaveBeenCalled();
    expect(createPullRequest).not.toHaveBeenCalled();
    expect(progressMessages(logProgress)).toEqual([
      "Checking Docker availability.",
      "Docker is already running.",
      "Validating git repository context.",
      "Resolving model, MCP, and worker configuration.",
      "Fetching GitHub issue #123 from owner/repo using Docker MCP profile test-profile.",
      "Generating requirement markdown for issue #123 with model ai/test-model.",
      "Dry run enabled; printing generated requirement markdown without modifying the repository.",
    ]);
    expect(output).toHaveBeenCalledWith(
      "Coding Factory requirement markdown generated successfully.",
    );
    expect(output).toHaveBeenCalledWith(
      JSON.stringify(
        {
          issueNumber: 123,
          model: "ai/test-model",
          modelBaseUrl: "http://localhost:12434/engines/v1",
          testScript: "test:all",
          dryRun: true,
          mcpProfile: "test-profile",
          workerImage: "coding-factory-worker:latest",
          repository: repositoryContext,
          issue: githubIssue,
          requirementDocument: {
            dryRun: true,
            path: "requirements/issue-123.md",
          },
        },
        null,
        2,
      ),
    );
    expect(output).toHaveBeenCalledWith(requirementMarkdown);
  });

  it("creates a normalized command summary", () => {
    expect(
      createIssueCommandSummary(
        123,
        {},
        repositoryContext,
        "coding_factory",
        "ai/test-model",
        "http://localhost:12434/engines/v1",
        "coding-factory-worker:latest",
      ),
    ).toEqual({
      issueNumber: 123,
      model: "ai/test-model",
      modelBaseUrl: "http://localhost:12434/engines/v1",
      testScript: undefined,
      dryRun: false,
      mcpProfile: "coding_factory",
      workerImage: "coding-factory-worker:latest",
      repository: repositoryContext,
    });
  });

  it("uses the default Docker MCP profile", async () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchGitHubIssue = vi.fn(() => ({
      ...githubIssue,
      mcpProfile: "coding_factory",
    }));
    const program = createProgram({
      ...createDockerStartupDependency(),
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue,
      generateRequirementMarkdown: async () => requirementMarkdown,
    });

    await program.parseAsync(
      ["node", "coding-factory", "issue", "123", "--dry-run", "--model", "ai/test-model"],
      { from: "node" },
    );

    expect(fetchGitHubIssue).toHaveBeenCalledWith({
      issueNumber: 123,
      repository: repositoryContext.github,
      mcpProfile: "coding_factory",
    });
    expect(output).toHaveBeenCalledWith(
      "Coding Factory requirement markdown generated successfully.",
    );
  });

  it("uses CODING_FACTORY_MCP_PROFILE when no profile flag is provided", async () => {
    vi.stubEnv("CODING_FACTORY_MCP_PROFILE", "env-profile");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchGitHubIssue = vi.fn(() => ({
      ...githubIssue,
      mcpProfile: "env-profile",
    }));
    const program = createProgram({
      ...createDockerStartupDependency(),
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue,
      generateRequirementMarkdown: async () => requirementMarkdown,
    });

    await program.parseAsync(
      ["node", "coding-factory", "issue", "123", "--dry-run", "--model", "ai/test-model"],
      { from: "node" },
    );

    expect(fetchGitHubIssue).toHaveBeenCalledWith({
      issueNumber: 123,
      repository: repositoryContext.github,
      mcpProfile: "env-profile",
    });
  });

  it("lets --mcp-profile override CODING_FACTORY_MCP_PROFILE", async () => {
    vi.stubEnv("CODING_FACTORY_MCP_PROFILE", "env-profile");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchGitHubIssue = vi.fn(() => githubIssue);
    const program = createProgram({
      ...createDockerStartupDependency(),
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue,
      generateRequirementMarkdown: async () => requirementMarkdown,
    });

    await program.parseAsync(
      [
        "node",
        "coding-factory",
        "issue",
        "123",
        "--dry-run",
        "--model",
        "ai/test-model",
        "--mcp-profile",
        "flag-profile",
      ],
      { from: "node" },
    );

    expect(fetchGitHubIssue).toHaveBeenCalledWith({
      issueNumber: 123,
      repository: repositoryContext.github,
      mcpProfile: "flag-profile",
    });
  });

  it("uses CODING_FACTORY_MODEL when --model is not provided", async () => {
    vi.stubEnv("CODING_FACTORY_MODEL", "ai/env-model");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const generateRequirementMarkdown = vi.fn(async () => requirementMarkdown);
    const program = createProgram({
      ...createDockerStartupDependency(),
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue: () => githubIssue,
      generateRequirementMarkdown,
    });

    await program.parseAsync(["node", "coding-factory", "issue", "123", "--dry-run"], {
      from: "node",
    });

    expect(generateRequirementMarkdown).toHaveBeenCalledWith({
      issue: githubIssue,
      model: "ai/env-model",
      modelBaseUrl: "http://localhost:12434/engines/v1",
    });
  });

  it("uses CODING_FACTORY_MODEL_BASE_URL for requirement generation", async () => {
    vi.stubEnv("CODING_FACTORY_MODEL_BASE_URL", "http://localhost:12434/custom/v1");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const generateRequirementMarkdown = vi.fn(async () => requirementMarkdown);
    const program = createProgram({
      ...createDockerStartupDependency(),
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue: () => githubIssue,
      generateRequirementMarkdown,
    });

    await program.parseAsync(
      ["node", "coding-factory", "issue", "123", "--dry-run", "--model", "ai/test-model"],
      { from: "node" },
    );

    expect(generateRequirementMarkdown).toHaveBeenCalledWith({
      issue: githubIssue,
      model: "ai/test-model",
      modelBaseUrl: "http://localhost:12434/custom/v1",
    });
  });

  it("creates the branch, writes requirements, and starts the worker container", async () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const ensureIssueBranch = vi.fn(() => issueBranch);
    const generateRequirementMarkdown = vi.fn(async () => requirementMarkdown);
    const writeRequirementDocument = vi.fn(() => requirementWriteResult);
    const ensureWorkerImage = vi.fn();
    const startWorkerContainer = vi.fn(() => workerContainer);
    const collectRepoSummary = vi.fn(() => repoSummary);
    const generateImplementationPatch = vi.fn(async () => implementationPatch);
    const applyPatch = vi.fn();
    const collectGitDiffSummary = vi.fn(() => diffSummary);
    const removeWorkerContainer = vi.fn();
    const publishIssueBranch = vi.fn(() => publishResult);
    const resolveRemoteDefaultBranch = vi.fn(() => "develop");
    const verifyRemoteBranchExists = vi.fn();
    const waitForRemoteBranch = vi.fn(async () => undefined);
    const createPullRequest = vi.fn(() => pullRequest);
    const ensureDockerReadyAtStartup = vi.fn(async (options?: {
      logProgress?: (message: string) => void;
    }) => {
      options?.logProgress?.("Checking Docker availability.");
      options?.logProgress?.("Docker is already running.");
    });
    const logProgress = vi.fn();
    const program = createProgram({
      ensureDockerReadyAtStartup,
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue: () => githubIssue,
      ensureIssueBranch,
      requirementDocumentExists: () => false,
      generateRequirementMarkdown,
      writeRequirementDocument,
      ensureWorkerImage,
      startWorkerContainer,
      collectRepoSummary,
      generateImplementationPatch,
      applyPatch,
      collectGitDiffSummary,
      removeWorkerContainer,
      publishIssueBranch,
      resolveRemoteDefaultBranch,
      verifyRemoteBranchExists,
      waitForRemoteBranch,
      createPullRequest,
      logProgress,
    });

    await program.parseAsync(
      ["node", "coding-factory", "issue", "123", "--model", "ai/test-model"],
      { from: "node" },
    );

    expect(ensureIssueBranch).toHaveBeenCalledWith({
      issueNumber: 123,
      repository: repositoryContext,
    });
    expect(
      ensureIssueBranch.mock.invocationCallOrder[0],
    ).toBeLessThan(generateRequirementMarkdown.mock.invocationCallOrder[0]);
    expect(writeRequirementDocument).toHaveBeenCalledWith({
      issueNumber: 123,
      markdown: requirementMarkdown,
      repository: repositoryContext,
    });
    expect(startWorkerContainer).toHaveBeenCalledWith({
      branchName: "coding-factory/issue-123",
      issueNumber: 123,
      repository: repositoryContext,
      workerImage: "coding-factory-worker:latest",
    });
    expect(ensureWorkerImage).toHaveBeenCalledWith("coding-factory-worker:latest");
    expect(collectRepoSummary).toHaveBeenCalledWith({
      issueNumber: 123,
      repository: repositoryContext,
    });
    expect(generateImplementationPatch).toHaveBeenCalledWith({
      repoSummary,
      model: "ai/test-model",
      modelBaseUrl: "http://localhost:12434/engines/v1",
    });
    expect(applyPatch).toHaveBeenCalledWith({
      containerName: "coding-factory-issue-123",
      patch: implementationPatch,
    });
    expect(collectGitDiffSummary).toHaveBeenCalledWith({
      repository: repositoryContext,
    });
    expect(removeWorkerContainer).toHaveBeenCalledWith("coding-factory-issue-123");
    expect(publishIssueBranch).toHaveBeenCalledWith({
      branchName: "coding-factory/issue-123",
      commitMessage: "feat: implement issue 123",
      repository: repositoryContext,
    });
    expect(resolveRemoteDefaultBranch).toHaveBeenCalledWith(repositoryContext);
    expect(verifyRemoteBranchExists).toHaveBeenCalledWith({
      branchName: "develop",
      repository: repositoryContext,
    });
    expect(waitForRemoteBranch).toHaveBeenCalledWith({
      branchName: "coding-factory/issue-123",
      repository: repositoryContext,
    });
    expect(createPullRequest).toHaveBeenCalledWith({
      base: "develop",
      body: expect.stringContaining("Closes #123"),
      head: "coding-factory/issue-123",
      headRepository: repositoryContext.github,
      mcpProfile: "coding_factory",
      repository: githubIssue.repository,
      title: "Implement issue #123: Add Docker MCP issue fetching",
    });
    expect(progressMessages(logProgress)).toEqual([
      "Checking Docker availability.",
      "Docker is already running.",
      "Validating git repository context.",
      "Resolving model, MCP, and worker configuration.",
      "Fetching GitHub issue #123 from owner/repo using Docker MCP profile coding_factory.",
      "Preparing issue branch for issue #123.",
      "Generating requirement markdown for issue #123 with model ai/test-model.",
      "Writing requirement document to requirements/issue-123.md.",
      "Preparing worker image coding-factory-worker:latest.",
      "Starting worker container for branch coding-factory/issue-123.",
      "Collecting repository context for implementation generation.",
      "Generating implementation patch with model ai/test-model.",
      "Applying implementation patch in worker container coding-factory-issue-123.",
      "Collecting git diff summary.",
      "Removing worker container coding-factory-issue-123.",
      "Publishing issue branch coding-factory/issue-123.",
      "Resolving pull request base branch from origin/HEAD.",
      "Verifying remote base branch develop.",
      "Waiting for remote branch coding-factory/issue-123 to become visible on origin.",
      "Opening pull request for issue #123.",
    ]);
    expect(output).toHaveBeenCalledWith(
      "Coding Factory pull request opened successfully.",
    );
    expect(output).toHaveBeenCalledWith(
      "Pull request: https://github.com/owner/repo/pull/7",
    );
    expect(JSON.parse(findJsonLog(output.mock.calls))).toMatchObject({
      requirementDocument: {
        overwritten: false,
      },
      implementation: {
        changedFiles: diffSummary.changedFiles,
        diffStat: diffSummary.stat,
      },
      cleanup: {
        containerRemoved: true,
      },
      publish: publishResult,
      pullRequest,
    });
  });

  it("passes separate source and target repositories for cross-repo pull requests", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const createPullRequest = vi.fn(() => pullRequest);
    const crossRepoIssue: NormalizedGitHubIssue = {
      ...githubIssue,
      repository: {
        owner: "upstream-owner",
        repo: "upstream-repo",
      },
      url: "https://github.com/upstream-owner/upstream-repo/issues/123",
    };
    const program = createProgram({
      ...createDockerStartupDependency(),
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue: () => crossRepoIssue,
      ensureIssueBranch: () => issueBranch,
      requirementDocumentExists: () => false,
      generateRequirementMarkdown: async () => requirementMarkdown,
      writeRequirementDocument: () => requirementWriteResult,
      ensureWorkerImage: vi.fn(),
      startWorkerContainer: () => workerContainer,
      collectRepoSummary: () => repoSummary,
      generateImplementationPatch: async () => implementationPatch,
      applyPatch: vi.fn(),
      collectGitDiffSummary: () => diffSummary,
      removeWorkerContainer: vi.fn(),
      publishIssueBranch: () => publishResult,
      resolveRemoteDefaultBranch: () => "main",
      verifyRemoteBranchExists: vi.fn(),
      waitForRemoteBranch: async () => undefined,
      createPullRequest,
    });

    await program.parseAsync(
      ["node", "coding-factory", "issue", "123", "--model", "ai/test-model"],
      { from: "node" },
    );

    expect(createPullRequest).toHaveBeenCalledWith({
      base: "main",
      body: expect.stringContaining("Closes #123"),
      head: "coding-factory/issue-123",
      headRepository: repositoryContext.github,
      mcpProfile: "coding_factory",
      repository: crossRepoIssue.repository,
      title: "Implement issue #123: Add Docker MCP issue fetching",
    });
  });

  it("overwrites an existing requirement document on the issue branch", async () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const generateRequirementMarkdown = vi.fn(async () => requirementMarkdown);
    const writeRequirementDocument = vi.fn(() => requirementWriteResult);
    const startWorkerContainer = vi.fn(() => workerContainer);
    const implementationDependencies = createImplementationDependencies();
    const publishDependencies = createPublishDependencies();
    const program = createProgram({
      ...createDockerStartupDependency(),
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue: () => githubIssue,
      ensureIssueBranch: () => ({
        branchName: "coding-factory/issue-123",
        created: false,
      }),
      requirementDocumentExists: () => true,
      generateRequirementMarkdown,
      writeRequirementDocument,
      startWorkerContainer,
      ...implementationDependencies,
      ...publishDependencies,
    });

    await program.parseAsync(
      ["node", "coding-factory", "issue", "123", "--model", "ai/test-model"],
      { from: "node" },
    );

    expect(generateRequirementMarkdown).toHaveBeenCalledWith({
      issue: githubIssue,
      model: "ai/test-model",
      modelBaseUrl: "http://localhost:12434/engines/v1",
    });
    expect(writeRequirementDocument).toHaveBeenCalledWith({
      issueNumber: 123,
      markdown: requirementMarkdown,
      repository: repositoryContext,
    });
    expect(startWorkerContainer).toHaveBeenCalled();
    expect(implementationDependencies.generateImplementationPatch).toHaveBeenCalled();
    expect(implementationDependencies.removeWorkerContainer).toHaveBeenCalledWith(
      "coding-factory-issue-123",
    );
    expect(publishDependencies.publishIssueBranch).toHaveBeenCalled();
    expect(publishDependencies.createPullRequest).toHaveBeenCalled();
    expect(JSON.parse(findJsonLog(output.mock.calls))).toMatchObject({
      requirementDocument: {
        overwritten: true,
      },
    });
  });

  it("uses the worker image flag for the container", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const startWorkerContainer = vi.fn(() => ({
      ...workerContainer,
      workerImage: "python:3.12-slim",
    }));
    const implementationDependencies = createImplementationDependencies();
    const publishDependencies = createPublishDependencies();
    const program = createProgram({
      ...createDockerStartupDependency(),
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue: () => githubIssue,
      ensureIssueBranch: () => issueBranch,
      ...createRequirementDependencies(),
      startWorkerContainer,
      ...implementationDependencies,
      ...publishDependencies,
    });

    await program.parseAsync(
      [
        "node",
        "coding-factory",
        "issue",
        "123",
        "--model",
        "ai/test-model",
        "--worker-image",
        "python:3.12-slim",
      ],
      { from: "node" },
    );

    expect(startWorkerContainer).toHaveBeenCalledWith({
      branchName: "coding-factory/issue-123",
      issueNumber: 123,
      repository: repositoryContext,
      workerImage: "python:3.12-slim",
    });
    expect(implementationDependencies.ensureWorkerImage).toHaveBeenCalledWith(
      "python:3.12-slim",
    );
    expect(publishDependencies.createPullRequest).toHaveBeenCalled();
  });

  it("uses CODING_FACTORY_WORKER_IMAGE when no worker image flag is provided", async () => {
    vi.stubEnv("CODING_FACTORY_WORKER_IMAGE", "golang:1.23");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const startWorkerContainer = vi.fn(() => ({
      ...workerContainer,
      workerImage: "golang:1.23",
    }));
    const implementationDependencies = createImplementationDependencies();
    const publishDependencies = createPublishDependencies();
    const program = createProgram({
      ...createDockerStartupDependency(),
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue: () => githubIssue,
      ensureIssueBranch: () => issueBranch,
      ...createRequirementDependencies(),
      startWorkerContainer,
      ...implementationDependencies,
      ...publishDependencies,
    });

    await program.parseAsync(
      ["node", "coding-factory", "issue", "123", "--model", "ai/test-model"],
      { from: "node" },
    );

    expect(startWorkerContainer).toHaveBeenCalledWith({
      branchName: "coding-factory/issue-123",
      issueNumber: 123,
      repository: repositoryContext,
      workerImage: "golang:1.23",
    });
    expect(implementationDependencies.ensureWorkerImage).toHaveBeenCalledWith(
      "golang:1.23",
    );
    expect(publishDependencies.createPullRequest).toHaveBeenCalled();
  });

  it("fails after cleanup when issue branch publishing fails", async () => {
    const removeWorkerContainer = vi.fn();
    const createPullRequest = vi.fn(() => pullRequest);
    const program = createProgram({
      ...createDockerStartupDependency(),
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue: () => githubIssue,
      ensureIssueBranch: () => issueBranch,
      ...createRequirementDependencies(),
      ensureWorkerImage: vi.fn(),
      startWorkerContainer: () => workerContainer,
      collectRepoSummary: () => repoSummary,
      generateImplementationPatch: async () => implementationPatch,
      applyPatch: vi.fn(),
      collectGitDiffSummary: () => diffSummary,
      removeWorkerContainer,
      publishIssueBranch: () => {
        throw new Error("No changes to commit.");
      },
      createPullRequest,
    });
    const issueCommand = program.commands.find(
      (command) => command.name() === "issue",
    );

    program.exitOverride();
    program.configureOutput({
      writeErr: () => undefined,
    });
    issueCommand?.exitOverride();
    issueCommand?.configureOutput({
      writeErr: () => undefined,
    });

    await expect(
      program.parseAsync(
        ["node", "coding-factory", "issue", "123", "--model", "ai/test-model"],
        { from: "node" },
      ),
    ).rejects.toMatchObject({
      code: "commander.error",
      message: "Issue branch publish failed: No changes to commit.",
    });
    expect(removeWorkerContainer).toHaveBeenCalledWith("coding-factory-issue-123");
    expect(createPullRequest).not.toHaveBeenCalled();
  });

  it("fails after publishing when pull request creation fails", async () => {
    const publishIssueBranch = vi.fn(() => publishResult);
    const program = createProgram({
      ...createDockerStartupDependency(),
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue: () => githubIssue,
      ensureIssueBranch: () => issueBranch,
      ...createRequirementDependencies(),
      startWorkerContainer: () => workerContainer,
      ...createImplementationDependencies(),
      publishIssueBranch,
      createPullRequest: () => {
        throw new Error("Validation Failed: pull request already exists.");
      },
      resolveRemoteDefaultBranch: () => "main",
      verifyRemoteBranchExists: vi.fn(),
      waitForRemoteBranch: async () => undefined,
    });
    const issueCommand = program.commands.find(
      (command) => command.name() === "issue",
    );

    program.exitOverride();
    program.configureOutput({
      writeErr: () => undefined,
    });
    issueCommand?.exitOverride();
    issueCommand?.configureOutput({
      writeErr: () => undefined,
    });

    await expect(
      program.parseAsync(
        ["node", "coding-factory", "issue", "123", "--model", "ai/test-model"],
        { from: "node" },
      ),
    ).rejects.toMatchObject({
      code: "commander.error",
      message:
        "Pull request creation failed: Validation Failed: pull request already exists.",
    });
    expect(publishIssueBranch).toHaveBeenCalledWith({
      branchName: "coding-factory/issue-123",
      commitMessage: "feat: implement issue 123",
      repository: repositoryContext,
    });
  });

  it("fails clearly when the pushed branch is not visible on the remote", async () => {
    const publishIssueBranch = vi.fn(() => publishResult);
    const createPullRequest = vi.fn(() => pullRequest);
    const program = createProgram({
      ...createDockerStartupDependency(),
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue: () => githubIssue,
      ensureIssueBranch: () => issueBranch,
      ...createRequirementDependencies(),
      startWorkerContainer: () => workerContainer,
      ...createImplementationDependencies(),
      publishIssueBranch,
      resolveRemoteDefaultBranch: () => "main",
      verifyRemoteBranchExists: vi.fn(),
      waitForRemoteBranch: async () => {
        throw new Error(
          "Remote branch origin/coding-factory/issue-123 was not visible after 10 seconds.",
        );
      },
      createPullRequest,
    });
    const issueCommand = program.commands.find(
      (command) => command.name() === "issue",
    );

    program.exitOverride();
    program.configureOutput({
      writeErr: () => undefined,
    });
    issueCommand?.exitOverride();
    issueCommand?.configureOutput({
      writeErr: () => undefined,
    });

    await expect(
      program.parseAsync(
        ["node", "coding-factory", "issue", "123", "--model", "ai/test-model"],
        { from: "node" },
      ),
    ).rejects.toMatchObject({
      code: "commander.error",
      message:
        "Pull request preparation failed: Remote branch origin/coding-factory/issue-123 was not visible after 10 seconds.",
    });
    expect(createPullRequest).not.toHaveBeenCalled();
  });

  it("throws for invalid issue arguments", async () => {
    const program = createProgram();
    const issueCommand = program.commands.find(
      (command) => command.name() === "issue",
    );

    program.exitOverride();
    program.configureOutput({
      writeErr: () => undefined,
    });
    issueCommand?.exitOverride();
    issueCommand?.configureOutput({
      writeErr: () => undefined,
    });

    await expect(
      program.parseAsync(["node", "coding-factory", "issue", "abc"], {
        from: "node",
      }),
    ).rejects.toMatchObject({
      code: "commander.invalidArgument",
    });
  });

  it("fails when repository validation fails", async () => {
    const fetchGitHubIssue = vi.fn(() => githubIssue);
    const program = createProgram({
      ...createDockerStartupDependency(),
      loadRepositoryContext: () => {
        throw new RepositoryValidationError("Current directory is not inside a git repository.");
      },
      fetchGitHubIssue,
      generateRequirementMarkdown: async () => requirementMarkdown,
    });
    const issueCommand = program.commands.find(
      (command) => command.name() === "issue",
    );

    program.exitOverride();
    program.configureOutput({
      writeErr: () => undefined,
    });
    issueCommand?.exitOverride();
    issueCommand?.configureOutput({
      writeErr: () => undefined,
    });

    await expect(
      program.parseAsync(["node", "coding-factory", "issue", "123"], {
        from: "node",
      }),
    ).rejects.toMatchObject({
      code: "commander.error",
      message:
        "Repository validation failed: Current directory is not inside a git repository.",
    });
    expect(fetchGitHubIssue).not.toHaveBeenCalled();
  });

  it("fails when GitHub issue fetching fails", async () => {
    const program = createProgram({
      ...createDockerStartupDependency(),
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue: () => {
        throw new Error("Issue 123 was not found.");
      },
      generateRequirementMarkdown: async () => requirementMarkdown,
    });
    const issueCommand = program.commands.find(
      (command) => command.name() === "issue",
    );

    program.exitOverride();
    program.configureOutput({
      writeErr: () => undefined,
    });
    issueCommand?.exitOverride();
    issueCommand?.configureOutput({
      writeErr: () => undefined,
    });

    await expect(
      program.parseAsync(
        ["node", "coding-factory", "issue", "123", "--dry-run", "--model", "ai/test-model"],
        { from: "node" },
      ),
    ).rejects.toMatchObject({
      code: "commander.error",
      message: "GitHub issue fetch failed: Issue 123 was not found.",
    });
  });

  it("fails when issue branch setup fails", async () => {
    const startWorkerContainer = vi.fn(() => workerContainer);
    const program = createProgram({
      ...createDockerStartupDependency(),
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue: () => githubIssue,
      ensureIssueBranch: () => {
        throw new Error("Git working tree must be clean after checking out issue branch.");
      },
      startWorkerContainer,
    });
    const issueCommand = program.commands.find(
      (command) => command.name() === "issue",
    );

    program.exitOverride();
    program.configureOutput({
      writeErr: () => undefined,
    });
    issueCommand?.exitOverride();
    issueCommand?.configureOutput({
      writeErr: () => undefined,
    });

    await expect(
      program.parseAsync(
        ["node", "coding-factory", "issue", "123", "--model", "ai/test-model"],
        { from: "node" },
      ),
    ).rejects.toMatchObject({
      code: "commander.error",
      message:
        "Issue branch setup failed: Git working tree must be clean after checking out issue branch.",
    });
    expect(startWorkerContainer).not.toHaveBeenCalled();
  });

  it("fails before GitHub fetching when no model is configured", async () => {
    const fetchGitHubIssue = vi.fn(() => githubIssue);
    const program = createProgram({
      ...createDockerStartupDependency(),
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue,
    });
    const issueCommand = program.commands.find(
      (command) => command.name() === "issue",
    );

    program.exitOverride();
    program.configureOutput({
      writeErr: () => undefined,
    });
    issueCommand?.exitOverride();
    issueCommand?.configureOutput({
      writeErr: () => undefined,
    });

    await expect(
      program.parseAsync(["node", "coding-factory", "issue", "123", "--dry-run"], {
        from: "node",
      }),
    ).rejects.toMatchObject({
      code: "commander.error",
      message:
        "Requirement generation failed: Docker Model Runner model is required. Pass --model or set CODING_FACTORY_MODEL.",
    });
    expect(fetchGitHubIssue).not.toHaveBeenCalled();
  });

  it("fails when requirement markdown generation fails", async () => {
    const program = createProgram({
      ...createDockerStartupDependency(),
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue: () => githubIssue,
      generateRequirementMarkdown: () => {
        throw new Error("Model request failed.");
      },
    });
    const issueCommand = program.commands.find(
      (command) => command.name() === "issue",
    );

    program.exitOverride();
    program.configureOutput({
      writeErr: () => undefined,
    });
    issueCommand?.exitOverride();
    issueCommand?.configureOutput({
      writeErr: () => undefined,
    });

    await expect(
      program.parseAsync(
        ["node", "coding-factory", "issue", "123", "--dry-run", "--model", "ai/test-model"],
        { from: "node" },
      ),
    ).rejects.toMatchObject({
      code: "commander.error",
      message: "Requirement generation failed: Model request failed.",
    });
  });

  it("removes the worker container when implementation patch generation fails", async () => {
    const removeWorkerContainer = vi.fn();
    const program = createProgram({
      ...createDockerStartupDependency(),
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue: () => githubIssue,
      ensureIssueBranch: () => issueBranch,
      ...createRequirementDependencies(),
      ensureWorkerImage: vi.fn(),
      startWorkerContainer: () => workerContainer,
      collectRepoSummary: () => repoSummary,
      generateImplementationPatch: () => {
        throw new Error("Patch generation failed.");
      },
      removeWorkerContainer,
    });
    const issueCommand = program.commands.find(
      (command) => command.name() === "issue",
    );

    program.exitOverride();
    program.configureOutput({
      writeErr: () => undefined,
    });
    issueCommand?.exitOverride();
    issueCommand?.configureOutput({
      writeErr: () => undefined,
    });

    await expect(
      program.parseAsync(
        ["node", "coding-factory", "issue", "123", "--model", "ai/test-model"],
        { from: "node" },
      ),
    ).rejects.toMatchObject({
      code: "commander.error",
      message: "Implementation failed: Patch generation failed.",
    });
    expect(removeWorkerContainer).toHaveBeenCalledWith("coding-factory-issue-123");
  });

  it("removes the worker container when implementation patch application fails", async () => {
    const removeWorkerContainer = vi.fn();
    const program = createProgram({
      ...createDockerStartupDependency(),
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue: () => githubIssue,
      ensureIssueBranch: () => issueBranch,
      ...createRequirementDependencies(),
      ensureWorkerImage: vi.fn(),
      startWorkerContainer: () => workerContainer,
      collectRepoSummary: () => repoSummary,
      generateImplementationPatch: async () => implementationPatch,
      applyPatch: () => {
        throw new Error("Patch does not apply.");
      },
      removeWorkerContainer,
    });
    const issueCommand = program.commands.find(
      (command) => command.name() === "issue",
    );

    program.exitOverride();
    program.configureOutput({
      writeErr: () => undefined,
    });
    issueCommand?.exitOverride();
    issueCommand?.configureOutput({
      writeErr: () => undefined,
    });

    await expect(
      program.parseAsync(
        ["node", "coding-factory", "issue", "123", "--model", "ai/test-model"],
        { from: "node" },
      ),
    ).rejects.toMatchObject({
      code: "commander.error",
      message: "Implementation failed: Patch does not apply.",
    });
    expect(removeWorkerContainer).toHaveBeenCalledWith("coding-factory-issue-123");
  });

  it("fails when worker container startup fails", async () => {
    const program = createProgram({
      ...createDockerStartupDependency(),
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue: () => githubIssue,
      ensureIssueBranch: () => issueBranch,
      ...createRequirementDependencies(),
      ensureWorkerImage: vi.fn(),
      startWorkerContainer: () => {
        throw new Error("Container already exists.");
      },
    });
    const issueCommand = program.commands.find(
      (command) => command.name() === "issue",
    );

    program.exitOverride();
    program.configureOutput({
      writeErr: () => undefined,
    });
    issueCommand?.exitOverride();
    issueCommand?.configureOutput({
      writeErr: () => undefined,
    });

    await expect(
      program.parseAsync(
        ["node", "coding-factory", "issue", "123", "--model", "ai/test-model"],
        { from: "node" },
      ),
    ).rejects.toMatchObject({
      code: "commander.error",
      message: "Worker container startup failed: Container already exists.",
    });
  });

  it("fails clearly when Docker startup fails", async () => {
    const program = createProgram({
      ensureDockerReadyAtStartup: async () => {
        throw new Error("Docker Desktop did not become ready within 60 seconds. Launch Docker Desktop manually and try again.");
      },
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue: () => githubIssue,
      generateRequirementMarkdown: async () => requirementMarkdown,
    });
    const issueCommand = program.commands.find(
      (command) => command.name() === "issue",
    );

    program.exitOverride();
    program.configureOutput({
      writeErr: () => undefined,
    });
    issueCommand?.exitOverride();
    issueCommand?.configureOutput({
      writeErr: () => undefined,
    });

    await expect(
      program.parseAsync(
        ["node", "coding-factory", "issue", "123", "--dry-run", "--model", "ai/test-model"],
        { from: "node" },
      ),
    ).rejects.toMatchObject({
      code: "commander.error",
      message:
        "Docker startup failed: Docker Desktop did not become ready within 60 seconds. Launch Docker Desktop manually and try again.",
    });
  });
});

describe("program help", () => {
  it("includes CLI description and issue command", () => {
    const program = createProgram();
    const help = program.helpInformation();

    expect(help).toContain(
      "Run a local-LLM coding factory against GitHub issues.",
    );
    expect(help).toContain("issue");
  });
});
