import { describe, expect, it } from "vitest";
import {
  PatchApplicationError,
  applyPatchInContainer,
  normalizeUnifiedDiffHunkCounts,
  preparePatchForGitApply,
  validateUnifiedDiffPatch,
} from "../../src/worker/patch.js";

const patch = [
  "diff --git a/src/index.ts b/src/index.ts",
  "index 1111111..2222222 100644",
  "--- a/src/index.ts",
  "+++ b/src/index.ts",
  "@@ -1 +1 @@",
  "-console.log('hello');",
  "+console.log('implemented');",
].join("\n");
const newFilePatch = [
  "diff --git a/README.md b/README.md",
  "new file mode 100644",
  "index 0000000..0000000",
  "--- /dev/null",
  "+++ b/README.md",
  "@@ -0,0 +1,3 @@",
  "+# Coding Factory CLI",
  "+",
  "+A local-LLM coding factory CLI.",
].join("\n");
const overcountedNewFilePatch = [
  "diff --git a/README.md b/README.md",
  "new file mode 100644",
  "index 0000000..0000000",
  "--- /dev/null",
  "+++ b/README.md",
  "@@ -0,0 +1,5 @@",
  "+# Coding Factory CLI",
  "+",
  "+A local-LLM coding factory CLI.",
].join("\n");
const undercountedNewFilePatch = [
  "diff --git a/README.md b/README.md",
  "new file mode 100644",
  "index 0000000..0000000",
  "--- /dev/null",
  "+++ b/README.md",
  "@@ -0,0 +1,2 @@",
  "+# Coding Factory CLI",
  "+",
  "+A local-LLM coding factory CLI.",
].join("\n");
const readmePatchWithBadCountAndMissingNewline = [
  "diff --git a/README.md b/README.md",
  "new file mode 100644",
  "index 0000000..0a1b2c3",
  "--- /dev/null",
  "+++ b/README.md",
  "@@ -0,0 +1,2 @@",
  "+# Coding Factory CLI",
  "+",
  "+A local-LLM coding factory CLI designed to automate issue implementation.",
  "+",
  "+## Usage",
  "+",
  "+```bash",
  "+coding-factory issue 123",
  "+```",
].join("\n");
const preparedReadmePatch = [
  "diff --git a/README.md b/README.md",
  "new file mode 100644",
  "index 0000000..0a1b2c3",
  "--- /dev/null",
  "+++ b/README.md",
  "@@ -0,0 +1,9 @@",
  "+# Coding Factory CLI",
  "+",
  "+A local-LLM coding factory CLI designed to automate issue implementation.",
  "+",
  "+## Usage",
  "+",
  "+```bash",
  "+coding-factory issue 123",
  "+```",
  "",
].join("\n");

describe("validateUnifiedDiffPatch", () => {
  it("accepts text unified diffs with relative repo paths", () => {
    expect(() => validateUnifiedDiffPatch(patch)).not.toThrow();
  });

  it("accepts git-style new-file patches", () => {
    expect(() => validateUnifiedDiffPatch(newFilePatch)).not.toThrow();
  });

  it("rejects non-diff output", () => {
    expect(() => validateUnifiedDiffPatch("I changed the code.")).toThrow(
      new PatchApplicationError("Implementation patch is not a unified diff."),
    );
  });

  it("rejects parent-directory paths", () => {
    expect(() =>
      validateUnifiedDiffPatch(
        [
          "diff --git a/../secret b/../secret",
          "--- a/../secret",
          "+++ b/../secret",
        ].join("\n"),
      ),
    ).toThrow(new PatchApplicationError("Unsafe patch path: ../secret"));
  });

  it("rejects binary patches", () => {
    expect(() =>
      validateUnifiedDiffPatch(
        ["diff --git a/image.png b/image.png", "GIT binary patch"].join("\n"),
      ),
    ).toThrow(
      new PatchApplicationError(
        "Implementation patch must not include binary changes.",
      ),
    );
  });

  it("rejects file deletions", () => {
    expect(() =>
      validateUnifiedDiffPatch(
        [
          "diff --git a/src/index.ts b/src/index.ts",
          "deleted file mode 100644",
          "--- a/src/index.ts",
          "+++ /dev/null",
        ].join("\n"),
      ),
    ).toThrow(
      new PatchApplicationError("Implementation patch must not delete files."),
    );
  });
});

describe("normalizeUnifiedDiffHunkCounts", () => {
  it("repairs overcounted hunk headers", () => {
    expect(normalizeUnifiedDiffHunkCounts(overcountedNewFilePatch)).toBe(
      newFilePatch,
    );
  });

  it("repairs undercounted hunk headers", () => {
    expect(normalizeUnifiedDiffHunkCounts(undercountedNewFilePatch)).toBe(
      newFilePatch,
    );
  });
});

describe("preparePatchForGitApply", () => {
  it("repairs hunk counts and adds a trailing newline", () => {
    expect(preparePatchForGitApply(readmePatchWithBadCountAndMissingNewline)).toBe(
      preparedReadmePatch,
    );
  });

  it("does not add an extra newline when one already exists", () => {
    expect(preparePatchForGitApply(`${newFilePatch}\n`)).toBe(`${newFilePatch}\n`);
  });
});

describe("applyPatchInContainer", () => {
  it("checks the patch before applying it inside the container", () => {
    const calls: Array<{ args: string[]; input?: string }> = [];

    applyPatchInContainer(
      {
        containerName: "coding-factory-issue-123",
        patch,
      },
      (args, input) => {
        calls.push({
          args,
          input,
        });
        return "";
      },
    );

    expect(calls).toEqual([
      {
        args: [
          "exec",
          "-i",
          "--workdir",
          "/workspace",
          "coding-factory-issue-123",
          "git",
          "apply",
          "--check",
          "--recount",
          "-",
        ],
        input: `${patch}\n`,
      },
      {
        args: [
          "exec",
          "-i",
          "--workdir",
          "/workspace",
          "coding-factory-issue-123",
          "git",
          "apply",
          "--recount",
          "-",
        ],
        input: `${patch}\n`,
      },
    ]);
  });

  it("applies the normalized patch when hunk counts are wrong", () => {
    const calls: Array<{ args: string[]; input?: string }> = [];

    applyPatchInContainer(
      {
        containerName: "coding-factory-issue-123",
        patch: undercountedNewFilePatch,
      },
      (args, input) => {
        calls.push({
          args,
          input,
        });
        return "";
      },
    );

    expect(calls.map((call) => call.input)).toEqual([
      `${newFilePatch}\n`,
      `${newFilePatch}\n`,
    ]);
  });

  it("fails before applying if the check fails", () => {
    const calls: string[][] = [];

    expect(() =>
      applyPatchInContainer(
        {
          containerName: "coding-factory-issue-123",
          patch,
        },
        (args) => {
          calls.push(args);
          throw new Error("patch does not apply");
        },
      ),
    ).toThrow(new PatchApplicationError("patch does not apply"));

    expect(calls).toHaveLength(1);
  });
});
