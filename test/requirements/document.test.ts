import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import type { RepositoryContext } from "../../src/git/repository.js";
import {
  getRequirementDocumentPath,
  writeRequirementDocument,
} from "../../src/requirements/document.js";

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

describe("requirement document files", () => {
  it("builds the requirement document path", () => {
    const repository = createRepositoryContext("/repo");

    expect(getRequirementDocumentPath(repository, 123)).toEqual({
      absolutePath: "/repo/requirements/issue-123.md",
      relativePath: "requirements/issue-123.md",
    });
  });

  it("creates the requirements directory and writes markdown", () => {
    const repository = createRepositoryContext(createTempRoot());

    const result = writeRequirementDocument({
      issueNumber: 123,
      markdown: "# Issue 123",
      repository,
    });

    expect(result.relativePath).toBe("requirements/issue-123.md");
    expect(existsSync(result.absolutePath)).toBe(true);
    expect(readFileSync(result.absolutePath, "utf8")).toBe("# Issue 123\n");
  });

  it("overwrites an existing requirement document", () => {
    const repository = createRepositoryContext(createTempRoot());
    const existingPath = join(repository.root, "requirements", "issue-123.md");
    writeRequirementDocument({
      issueNumber: 123,
      markdown: "# Issue 123",
      repository,
    });
    writeFileSync(existingPath, "# Edited by a human\n", "utf8");

    const result = writeRequirementDocument({
      issueNumber: 123,
      markdown: "# New issue 123",
      repository,
    });

    expect(result.relativePath).toBe("requirements/issue-123.md");
    expect(readFileSync(existingPath, "utf8")).toBe("# New issue 123\n");
  });
});

function createTempRoot(): string {
  tempRoot = mkdtempSync(join(tmpdir(), "coding-factory-test-"));
  return tempRoot;
}

function createRepositoryContext(root: string): RepositoryContext {
  return {
    root,
    currentBranch: "main",
    remoteUrl: "git@github.com:owner/repo.git",
    github: {
      owner: "owner",
      repo: "repo",
    },
    isClean: true,
  };
}
