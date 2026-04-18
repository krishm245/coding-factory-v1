import { describe, expect, it, vi } from "vitest";
import { createProgram } from "../../src/cli.js";
import {
  createIssueCommandSummary,
  parseIssueNumber,
} from "../../src/commands/issue.js";
import {
  type RepositoryContext,
  RepositoryValidationError,
} from "../../src/git/repository.js";

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
  it("parses issue command options", async () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const program = createProgram({
      loadRepositoryContext: () => repositoryContext,
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
      ],
      { from: "node" },
    );

    expect(output).toHaveBeenCalledWith(
      "Coding Factory issue command parsed successfully.",
    );
    expect(output).toHaveBeenCalledWith(
      JSON.stringify(
        {
          issueNumber: 123,
          model: "ai/test-model",
          testScript: "test:all",
          dryRun: true,
          repository: repositoryContext,
        },
        null,
        2,
      ),
    );

    output.mockRestore();
  });

  it("creates a normalized command summary", () => {
    expect(createIssueCommandSummary(123, {}, repositoryContext)).toEqual({
      issueNumber: 123,
      model: undefined,
      testScript: undefined,
      dryRun: false,
      repository: repositoryContext,
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
    const program = createProgram({
      loadRepositoryContext: () => {
        throw new RepositoryValidationError("Current directory is not inside a git repository.");
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
      program.parseAsync(["node", "coding-factory", "issue", "123"], {
        from: "node",
      }),
    ).rejects.toMatchObject({
      code: "commander.error",
      message:
        "Repository validation failed: Current directory is not inside a git repository.",
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
