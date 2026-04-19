import { describe, expect, it } from "vitest";
import {
  GitBranchError,
  ensureIssueBranch,
  getIssueBranchName,
} from "../../src/git/branch.js";
import type { GitRunner, RepositoryContext } from "../../src/git/repository.js";

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

describe("getIssueBranchName", () => {
  it("creates the coding factory issue branch name", () => {
    expect(getIssueBranchName(123)).toBe("coding-factory/issue-123");
  });
});

describe("ensureIssueBranch", () => {
  it("creates and checks out the issue branch when it does not exist", () => {
    const calls: string[] = [];
    const runGit: GitRunner = (args) => {
      calls.push(args.join(" "));

      if (args[0] === "show-ref") {
        throw new Error("missing branch");
      }

      return "";
    };

    expect(ensureIssueBranch({
      issueNumber: 123,
      repository: repositoryContext,
    }, runGit)).toEqual({
      branchName: "coding-factory/issue-123",
      created: true,
    });
    expect(calls).toEqual([
      "show-ref --verify --quiet refs/heads/coding-factory/issue-123",
      "checkout -b coding-factory/issue-123",
      "status --porcelain",
    ]);
  });

  it("checks out an existing issue branch without creating it", () => {
    const calls: string[] = [];
    const runGit: GitRunner = (args) => {
      calls.push(args.join(" "));
      return "";
    };

    expect(ensureIssueBranch({
      issueNumber: 123,
      repository: repositoryContext,
    }, runGit)).toEqual({
      branchName: "coding-factory/issue-123",
      created: false,
    });
    expect(calls).toEqual([
      "show-ref --verify --quiet refs/heads/coding-factory/issue-123",
      "checkout coding-factory/issue-123",
      "status --porcelain",
    ]);
  });

  it("fails if the worktree is dirty after checkout", () => {
    const runGit: GitRunner = (args) => {
      if (args[0] === "status") {
        return " M src/index.ts\n";
      }

      return "";
    };

    expect(() => ensureIssueBranch({
      issueNumber: 123,
      repository: repositoryContext,
    }, runGit)).toThrow(
      new GitBranchError(
        "Git working tree must be clean after checking out issue branch.",
      ),
    );
  });
});
