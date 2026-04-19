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
  it("fetches and prints issue details after repository validation", async () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchGitHubIssue = vi.fn(() => githubIssue);
    const program = createProgram({
      loadRepositoryContext: () => repositoryContext,
      fetchGitHubIssue,
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
    expect(output).toHaveBeenCalledWith(
      "Coding Factory GitHub issue fetched successfully.",
    );
    expect(output).toHaveBeenCalledWith(
      JSON.stringify(
        {
          issueNumber: 123,
          model: "ai/test-model",
          testScript: "test:all",
          dryRun: true,
          mcpProfile: "test-profile",
          repository: repositoryContext,
          issue: githubIssue,
        },
        null,
        2,
      ),
    );
  });

  it("creates a normalized command summary", () => {
    expect(createIssueCommandSummary(123, {}, repositoryContext, "coding_factory")).toEqual({
      issueNumber: 123,
      model: undefined,
      testScript: undefined,
      dryRun: false,
      mcpProfile: "coding_factory",
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
    });

    await program.parseAsync(["node", "coding-factory", "issue", "123", "--dry-run"], {
      from: "node",
    });

    expect(fetchGitHubIssue).toHaveBeenCalledWith({
      issueNumber: 123,
      repository: repositoryContext.github,
      mcpProfile: "coding_factory",
    });
    expect(output).toHaveBeenCalledWith(
      "Coding Factory GitHub issue fetched successfully.",
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
    });

    await program.parseAsync(["node", "coding-factory", "issue", "123", "--dry-run"], {
      from: "node",
    });

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
    });

    await program.parseAsync(
      [
        "node",
        "coding-factory",
        "issue",
        "123",
        "--dry-run",
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
      message: "GitHub issue fetch failed: Issue 123 was not found.",
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
