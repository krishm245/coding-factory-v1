import { describe, expect, it } from "vitest";
import {
  type GitRunner,
  loadRepositoryContext,
  parseGitHubRemote,
} from "../../src/git/repository.js";

describe("parseGitHubRemote", () => {
  it.each([
    ["https://github.com/owner/repo.git", { owner: "owner", repo: "repo" }],
    ["https://github.com/owner/repo", { owner: "owner", repo: "repo" }],
    ["git@github.com:owner/repo.git", { owner: "owner", repo: "repo" }],
    ["ssh://git@github.com/owner/repo.git", { owner: "owner", repo: "repo" }],
  ])("parses %s", (remoteUrl, expected) => {
    expect(parseGitHubRemote(remoteUrl)).toEqual(expected);
  });

  it.each([
    "https://gitlab.com/owner/repo.git",
    "git@gitlab.com:owner/repo.git",
    "not-a-url",
    "https://github.com/owner",
    "https://github.com/owner/repo/extra",
  ])("rejects %s", (remoteUrl) => {
    expect(() => parseGitHubRemote(remoteUrl)).toThrow();
  });
});

describe("loadRepositoryContext", () => {
  it("loads repository context for a valid clean GitHub repo", () => {
    const runGit = createMockGitRunner({
      "rev-parse --is-inside-work-tree": "true\n",
      "rev-parse --show-toplevel": "/repo\n",
      "branch --show-current": "main\n",
      "remote get-url origin": "git@github.com:owner/repo.git\n",
      "status --porcelain": "",
    });

    expect(loadRepositoryContext("/repo", runGit)).toEqual({
      root: "/repo",
      currentBranch: "main",
      remoteUrl: "git@github.com:owner/repo.git",
      github: {
        owner: "owner",
        repo: "repo",
      },
      isClean: true,
    });
  });

  it("throws when not inside a git repository", () => {
    const runGit = createMockGitRunner(
      {},
      new Set(["rev-parse --is-inside-work-tree"]),
    );

    expect(() => loadRepositoryContext("/repo", runGit)).toThrow(
      "Current directory is not inside a git repository.",
    );
  });

  it("throws for detached HEAD", () => {
    const runGit = createMockGitRunner({
      "rev-parse --is-inside-work-tree": "true\n",
      "rev-parse --show-toplevel": "/repo\n",
      "branch --show-current": "\n",
    });

    expect(() => loadRepositoryContext("/repo", runGit)).toThrow(
      "Current git checkout is in detached HEAD state.",
    );
  });

  it("throws when origin remote is missing", () => {
    const runGit = createMockGitRunner(
      {
        "rev-parse --is-inside-work-tree": "true\n",
        "rev-parse --show-toplevel": "/repo\n",
        "branch --show-current": "main\n",
      },
      new Set(["remote get-url origin"]),
    );

    expect(() => loadRepositoryContext("/repo", runGit)).toThrow(
      "Missing required git remote named origin.",
    );
  });

  it("throws when the working tree is dirty", () => {
    const runGit = createMockGitRunner({
      "rev-parse --is-inside-work-tree": "true\n",
      "rev-parse --show-toplevel": "/repo\n",
      "branch --show-current": "main\n",
      "remote get-url origin": "git@github.com:owner/repo.git\n",
      "status --porcelain": " M src/index.ts\n",
    });

    expect(() => loadRepositoryContext("/repo", runGit)).toThrow(
      "Git working tree must be clean before running coding-factory.",
    );
  });
});

function createMockGitRunner(
  outputByCommand: Record<string, string>,
  failingCommands = new Set<string>(),
): GitRunner {
  return (args) => {
    const command = args.join(" ");

    if (failingCommands.has(command)) {
      throw new Error(`git ${command} failed`);
    }

    const output = outputByCommand[command];

    if (output === undefined) {
      throw new Error(`Unexpected git command: ${command}`);
    }

    return output;
  };
}
