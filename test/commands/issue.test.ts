import { afterEach, describe, expect, it, vi } from "vitest";
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
  workerImage: "alpine:3.20",
  workspacePath: "/workspace",
};

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
    const program = createProgram({
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue,
      generateRequirementMarkdown,
      writeRequirementDocument,
      ensureIssueBranch,
      startWorkerContainer,
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
          workerImage: "alpine:3.20",
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
        "alpine:3.20",
      ),
    ).toEqual({
      issueNumber: 123,
      model: "ai/test-model",
      modelBaseUrl: "http://localhost:12434/engines/v1",
      testScript: undefined,
      dryRun: false,
      mcpProfile: "coding_factory",
      workerImage: "alpine:3.20",
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
    const writeRequirementDocument = vi.fn(() => ({
      absolutePath: "/repo/requirements/issue-123.md",
      relativePath: "requirements/issue-123.md",
    }));
    const startWorkerContainer = vi.fn(() => workerContainer);
    const program = createProgram({
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue: () => githubIssue,
      ensureIssueBranch,
      requirementDocumentExists: () => false,
      generateRequirementMarkdown,
      writeRequirementDocument,
      startWorkerContainer,
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
      workerImage: "alpine:3.20",
    });
    expect(output).toHaveBeenCalledWith(
      "Coding Factory worker container started successfully.",
    );
  });

  it("reuses an existing requirement document on the issue branch", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const generateRequirementMarkdown = vi.fn(async () => requirementMarkdown);
    const writeRequirementDocument = vi.fn();
    const startWorkerContainer = vi.fn(() => workerContainer);
    const program = createProgram({
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
    });

    await program.parseAsync(
      ["node", "coding-factory", "issue", "123", "--model", "ai/test-model"],
      { from: "node" },
    );

    expect(generateRequirementMarkdown).not.toHaveBeenCalled();
    expect(writeRequirementDocument).not.toHaveBeenCalled();
    expect(startWorkerContainer).toHaveBeenCalled();
  });

  it("uses the worker image flag for the container", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const startWorkerContainer = vi.fn(() => ({
      ...workerContainer,
      workerImage: "python:3.12-slim",
    }));
    const program = createProgram({
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue: () => githubIssue,
      ensureIssueBranch: () => issueBranch,
      requirementDocumentExists: () => true,
      generateRequirementMarkdown: async () => requirementMarkdown,
      startWorkerContainer,
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
  });

  it("uses CODING_FACTORY_WORKER_IMAGE when no worker image flag is provided", async () => {
    vi.stubEnv("CODING_FACTORY_WORKER_IMAGE", "golang:1.23");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const startWorkerContainer = vi.fn(() => ({
      ...workerContainer,
      workerImage: "golang:1.23",
    }));
    const program = createProgram({
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue: () => githubIssue,
      ensureIssueBranch: () => issueBranch,
      requirementDocumentExists: () => true,
      generateRequirementMarkdown: async () => requirementMarkdown,
      startWorkerContainer,
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

  it("fails when worker container startup fails", async () => {
    const program = createProgram({
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue: () => githubIssue,
      ensureIssueBranch: () => issueBranch,
      requirementDocumentExists: () => true,
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
