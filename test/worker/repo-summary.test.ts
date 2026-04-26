import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import type { RepositoryContext } from "../../src/git/repository.js";
import { collectRepoSummary } from "../../src/worker/repo-summary.js";

let tempRoot: string | undefined;

afterEach(() => {
  if (tempRoot) {
    rmSync(tempRoot, {
      recursive: true,
      force: true,
    });
    tempRoot = undefined;
  }
});

describe("collectRepoSummary", () => {
  it("collects requirement markdown, repo tree, and selected context files", () => {
    const repository = createRepository();
    mkdirSync(join(repository.root, "requirements"), {
      recursive: true,
    });
    mkdirSync(join(repository.root, "src"), {
      recursive: true,
    });
    mkdirSync(join(repository.root, "node_modules"), {
      recursive: true,
    });
    writeFileSync(
      join(repository.root, "requirements", "issue-123.md"),
      "# Issue 123\n",
      "utf8",
    );
    writeFileSync(
      join(repository.root, "package.json"),
      "{\"scripts\":{\"test\":\"vitest\"}}\n",
      "utf8",
    );
    writeFileSync(
      join(repository.root, "src", "index.ts"),
      "console.log('hello');\n",
      "utf8",
    );
    writeFileSync(
      join(repository.root, "node_modules", "ignored.ts"),
      "ignored\n",
      "utf8",
    );

    expect(collectRepoSummary({
      issueNumber: 123,
      repository,
    })).toEqual({
      requirementMarkdown: "# Issue 123\n",
      tree: [
        "package.json",
        "requirements/issue-123.md",
        "src/index.ts",
      ],
      files: [
        {
          path: "package.json",
          content: "{\"scripts\":{\"test\":\"vitest\"}}\n",
        },
        {
          path: "src/index.ts",
          content: "console.log('hello');\n",
        },
      ],
    });
  });

  it("includes files referenced by the requirement markdown", () => {
    const repository = createRepository();
    mkdirSync(join(repository.root, "requirements"), {
      recursive: true,
    });
    writeFileSync(
      join(repository.root, "requirements", "issue-123.md"),
      "# Issue 123\n\nUpdate `README.md` with setup guidance.\n",
      "utf8",
    );
    writeFileSync(
      join(repository.root, "README.md"),
      "# Repo\n",
      "utf8",
    );

    expect(collectRepoSummary({
      issueNumber: 123,
      repository,
    }).files).toEqual([
      {
        path: "README.md",
        content: "# Repo\n",
      },
    ]);
  });
});

function createRepository(): RepositoryContext {
  tempRoot = mkdtempSync(join(tmpdir(), "coding-factory-summary-"));

  return {
    root: tempRoot,
    currentBranch: "coding-factory/issue-123",
    remoteUrl: "git@github.com:owner/repo.git",
    github: {
      owner: "owner",
      repo: "repo",
    },
    isClean: true,
  };
}
