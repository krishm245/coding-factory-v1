import { describe, expect, it } from "vitest";
import {
  GitDiffSummaryError,
  collectGitDiffSummary,
} from "../../src/git/diff.js";
import type { GitRunner, RepositoryContext } from "../../src/git/repository.js";

const repositoryContext: RepositoryContext = {
  root: "/repo",
  currentBranch: "coding-factory/issue-123",
  remoteUrl: "git@github.com:owner/repo.git",
  github: {
    owner: "owner",
    repo: "repo",
  },
  isClean: true,
};

describe("collectGitDiffSummary", () => {
  it("collects changed file names and diff stat", () => {
    const runGit: GitRunner = (args) => {
      if (args.join(" ") === "diff --name-only") {
        return "src/index.ts\n";
      }

      if (args.join(" ") === "diff --stat") {
        return " src/index.ts | 2 +-\n";
      }

      throw new Error("unexpected command");
    };

    expect(collectGitDiffSummary({
      repository: repositoryContext,
    }, runGit)).toEqual({
      changedFiles: ["src/index.ts"],
      stat: "src/index.ts | 2 +-",
    });
  });

  it("fails clearly when git diff fails", () => {
    expect(() => collectGitDiffSummary({
      repository: repositoryContext,
    }, () => {
      throw new Error("git failed");
    })).toThrow(
      new GitDiffSummaryError("Unable to collect git diff summary."),
    );
  });
});
