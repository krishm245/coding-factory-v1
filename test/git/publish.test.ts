import { describe, expect, it } from "vitest";
import {
  DEFAULT_REMOTE_BRANCH_WAIT_POLL_INTERVAL_MS,
  DEFAULT_REMOTE_BRANCH_WAIT_TIMEOUT_MS,
  GitPublishError,
  publishIssueBranch,
  resolveRemoteDefaultBranch,
  verifyRemoteBranchExists,
  waitForRemoteBranch,
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

describe("resolveRemoteDefaultBranch", () => {
  it("resolves the origin default branch from the remote HEAD symref", () => {
    expect(resolveRemoteDefaultBranch(repositoryContext, () => [
      "ref: refs/heads/main\tHEAD",
      "abc123\tHEAD",
    ].join("\n"))).toBe("main");
  });

  it("fails clearly when the remote HEAD symref is missing", () => {
    expect(() => resolveRemoteDefaultBranch(repositoryContext, () => "abc123\tHEAD\n")).toThrow(
      new GitPublishError("Origin default branch ref is missing or malformed."),
    );
  });
});

describe("verifyRemoteBranchExists", () => {
  it("accepts readable remote branches", () => {
    expect(() => verifyRemoteBranchExists({
      branchName: "main",
      repository: repositoryContext,
    }, () => "abc123\trefs/heads/main\n")).not.toThrow();
  });

  it("fails when the remote branch cannot be read", () => {
    expect(() => verifyRemoteBranchExists({
      branchName: "main",
      repository: repositoryContext,
    }, () => "")).toThrow(
      new GitPublishError("Remote branch origin/main is not readable."),
    );
  });
});

describe("waitForRemoteBranch", () => {
  it("returns once the remote branch becomes visible", async () => {
    let callCount = 0;
    const sleepCalls: number[] = [];

    await expect(waitForRemoteBranch(
      {
        branchName: "coding-factory/issue-123",
        repository: repositoryContext,
        timeoutMs: 5_000,
        pollIntervalMs: 250,
      },
      {
        now: () => callCount * 250,
        runGit: () => {
          callCount += 1;
          return callCount >= 2
            ? "abc123\trefs/heads/coding-factory/issue-123\n"
            : "";
        },
        sleep: async (milliseconds) => {
          sleepCalls.push(milliseconds);
        },
      },
    )).resolves.toBeUndefined();

    expect(sleepCalls).toEqual([250]);
  });

  it("fails clearly when the remote branch never becomes visible", async () => {
    let currentTime = 0;

    await expect(waitForRemoteBranch(
      {
        branchName: "coding-factory/issue-123",
        repository: repositoryContext,
        timeoutMs: 1_000,
        pollIntervalMs: 500,
      },
      {
        now: () => currentTime,
        runGit: () => "",
        sleep: async (milliseconds) => {
          currentTime += milliseconds;
        },
      },
    )).rejects.toThrow(
      new GitPublishError(
        "Remote branch origin/coding-factory/issue-123 was not visible after 1 seconds.",
      ),
    );
  });

  it("exports the default wait timing constants", () => {
    expect(DEFAULT_REMOTE_BRANCH_WAIT_TIMEOUT_MS).toBe(10_000);
    expect(DEFAULT_REMOTE_BRANCH_WAIT_POLL_INTERVAL_MS).toBe(1_000);
  });
});
