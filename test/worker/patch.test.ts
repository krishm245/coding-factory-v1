import { describe, expect, it } from "vitest";
import {
  PatchApplicationError,
  applyPatchInContainer,
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
const miscountedNewFilePatch = [
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
    expect(() => validateUnifiedDiffPatch([
      "diff --git a/../secret b/../secret",
      "--- a/../secret",
      "+++ b/../secret",
    ].join("\n"))).toThrow(
      new PatchApplicationError("Unsafe patch path: ../secret"),
    );
  });

  it("rejects binary patches", () => {
    expect(() => validateUnifiedDiffPatch([
      "diff --git a/image.png b/image.png",
      "GIT binary patch",
    ].join("\n"))).toThrow(
      new PatchApplicationError("Implementation patch must not include binary changes."),
    );
  });

  it("rejects file deletions", () => {
    expect(() => validateUnifiedDiffPatch([
      "diff --git a/src/index.ts b/src/index.ts",
      "deleted file mode 100644",
      "--- a/src/index.ts",
      "+++ /dev/null",
    ].join("\n"))).toThrow(
      new PatchApplicationError("Implementation patch must not delete files."),
    );
  });
});

describe("applyPatchInContainer", () => {
  it("checks the patch before applying it inside the container", () => {
    const calls: Array<{ args: string[]; input?: string }> = [];

    applyPatchInContainer({
      containerName: "coding-factory-issue-123",
      patch,
    }, (args, input) => {
      calls.push({
        args,
        input,
      });
      return "";
    });

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
        input: patch,
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
        input: patch,
      },
    ]);
  });

  it("asks git to recount hunk sizes for model-generated patches", () => {
    const calls: Array<{ args: string[]; input?: string }> = [];

    applyPatchInContainer({
      containerName: "coding-factory-issue-123",
      patch: miscountedNewFilePatch,
    }, (args, input) => {
      calls.push({
        args,
        input,
      });
      return "";
    });

    expect(calls.map((call) => call.args)).toEqual([
      [
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
      [
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
    ]);
    expect(calls.every((call) => call.input === miscountedNewFilePatch)).toBe(true);
  });

  it("fails before applying if the check fails", () => {
    const calls: string[][] = [];

    expect(() => applyPatchInContainer({
      containerName: "coding-factory-issue-123",
      patch,
    }, (args) => {
      calls.push(args);
      throw new Error("patch does not apply");
    })).toThrow(new PatchApplicationError("patch does not apply"));

    expect(calls).toHaveLength(1);
  });
});
