import { describe, expect, it } from "vitest";
import {
  GitPublishError,
  publishIssueBranch,
} from "../../src/git/publish.js";
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

describe("publishIssueBranch", () => {
  it("stages, commits, resolves SHA, and pushes the issue branch", () => {
    const calls: string[] = [];
    const runGit: GitRunner = (args) => {
      calls.push(args.join(" "));

      if (args.join(" ") === "status --porcelain") {
        return " M src/index.ts\n?? README.md\n";
      }

      if (args.join(" ") === "rev-parse HEAD") {
        return "abc123\n";
      }

      return "";
    };

    expect(publishIssueBranch({
      branchName: "coding-factory/issue-123",
      commitMessage: "feat: implement issue 123",
      repository: repositoryContext,
    }, runGit)).toEqual({
      branchName: "coding-factory/issue-123",
      commitSha: "abc123",
      remote: "origin",
    });
    expect(calls).toEqual([
      "status --porcelain",
      "add -A",
      "commit -m feat: implement issue 123",
      "rev-parse HEAD",
      "push -u origin coding-factory/issue-123",
    ]);
  });

  it("fails before commit when there are no changes", () => {
    expect(() => publishIssueBranch({
      branchName: "coding-factory/issue-123",
      commitMessage: "feat: implement issue 123",
      repository: repositoryContext,
    }, () => "")).toThrow(new GitPublishError("No changes to commit."));
  });

  it("fails before push when commit fails", () => {
    const calls: string[] = [];

    expect(() => publishIssueBranch({
      branchName: "coding-factory/issue-123",
      commitMessage: "feat: implement issue 123",
      repository: repositoryContext,
    }, (args) => {
      calls.push(args.join(" "));

      if (args.join(" ") === "status --porcelain") {
        return " M src/index.ts\n";
      }

      if (args[0] === "commit") {
        throw new Error("commit failed");
      }

      return "";
    })).toThrow(new GitPublishError("Unable to commit issue branch changes."));
    expect(calls).toEqual([
      "status --porcelain",
      "add -A",
      "commit -m feat: implement issue 123",
    ]);
  });
});
