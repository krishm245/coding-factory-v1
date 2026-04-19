import { execFileSync } from "node:child_process";

export interface ApplyPatchRequest {
  containerName: string;
  patch: string;
}

export type PatchApplier = (request: ApplyPatchRequest) => void;
export type DockerPatchRunner = (args: string[], input?: string) => string;

export class PatchApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PatchApplicationError";
  }
}

export function applyPatchInContainer(
  request: ApplyPatchRequest,
  runDocker: DockerPatchRunner = defaultDockerPatchRunner,
): void {
  const patch = preparePatchForGitApply(request.patch);

  validateUnifiedDiffPatch(patch);
  runRequiredDocker(
    [
      "exec",
      "-i",
      "--workdir",
      "/workspace",
      request.containerName,
      "git",
      "apply",
      "--check",
      "--recount",
      "-",
    ],
    patch,
    runDocker,
    "Implementation patch failed validation.",
  );
  runRequiredDocker(
    [
      "exec",
      "-i",
      "--workdir",
      "/workspace",
      request.containerName,
      "git",
      "apply",
      "--recount",
      "-",
    ],
    patch,
    runDocker,
    "Unable to apply implementation patch.",
  );
}

export function preparePatchForGitApply(patch: string): string {
  const normalized = normalizeUnifiedDiffHunkCounts(patch);

  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

export function normalizeUnifiedDiffHunkCounts(patch: string): string {
  const lines = patch.split(/\r?\n/);
  const normalizedLines = [...lines];

  for (let index = 0; index < lines.length; index += 1) {
    const hunkMatch = parseHunkHeader(lines[index]);

    if (!hunkMatch) {
      continue;
    }

    const counts = countHunkLines(lines, index + 1);
    if (
      hunkMatch.oldCount === counts.oldCount &&
      hunkMatch.newCount === counts.newCount
    ) {
      continue;
    }

    normalizedLines[index] =
      `@@ -${hunkMatch.oldStart},${counts.oldCount} +${hunkMatch.newStart},${counts.newCount} @@${hunkMatch.section}`;
  }

  return normalizedLines.join("\n");
}

export function validateUnifiedDiffPatch(patch: string): void {
  if (!patch.includes("diff --git ")) {
    throw new PatchApplicationError(
      "Implementation patch is not a unified diff.",
    );
  }

  if (patch.includes("GIT binary patch") || patch.includes("Binary files ")) {
    throw new PatchApplicationError(
      "Implementation patch must not include binary changes.",
    );
  }

  if (
    patch.includes("deleted file mode") ||
    /^\+\+\+ \/dev\/null$/m.test(patch)
  ) {
    throw new PatchApplicationError(
      "Implementation patch must not delete files.",
    );
  }

  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      validateDiffHeader(line);
    }
  }
}

export function defaultDockerPatchRunner(
  args: string[],
  input?: string,
): string {
  return execFileSync("docker", args, {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function validateDiffHeader(line: string): void {
  const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);

  if (!match) {
    throw new PatchApplicationError(`Invalid diff header: ${line}`);
  }

  validatePatchPath(match[1]);
  validatePatchPath(match[2]);
}

function parseHunkHeader(line: string | undefined):
  | {
      newCount: number;
      newStart: string;
      oldCount: number;
      oldStart: string;
      section: string;
    }
  | undefined {
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(
    line ?? "",
  );

  if (!match) {
    return undefined;
  }

  return {
    oldCount: match[2] ? Number.parseInt(match[2], 10) : 1,
    oldStart: match[1],
    newCount: match[4] ? Number.parseInt(match[4], 10) : 1,
    newStart: match[3],
    section: match[5],
  };
}

function countHunkLines(
  lines: string[],
  startIndex: number,
): { newCount: number; oldCount: number } {
  let newCount = 0;
  let oldCount = 0;

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (line.startsWith("diff --git ") || parseHunkHeader(line)) {
      break;
    }

    if (line.startsWith("+") && !line.startsWith("+++ ")) {
      newCount += 1;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("--- ")) {
      oldCount += 1;
      continue;
    }

    if (line.startsWith(" ")) {
      oldCount += 1;
      newCount += 1;
    }
  }

  return {
    newCount,
    oldCount,
  };
}

function validatePatchPath(path: string): void {
  if (
    path.startsWith("/") ||
    path.startsWith("../") ||
    path.includes("/../") ||
    path === ".." ||
    path.includes("\0")
  ) {
    throw new PatchApplicationError(`Unsafe patch path: ${path}`);
  }
}

function runRequiredDocker(
  args: string[],
  input: string,
  runDocker: DockerPatchRunner,
  errorMessage: string,
): string {
  try {
    return runDocker(args, input);
  } catch (error) {
    throw new PatchApplicationError(
      extractDockerErrorMessage(error) ?? errorMessage,
    );
  }
}

function extractDockerErrorMessage(error: unknown): string | undefined {
  if (isRecord(error)) {
    const stderr = readBufferString(error, "stderr");
    const stdout = readBufferString(error, "stdout");
    const output = stderr || stdout;

    if (output) {
      return output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .at(-1);
    }
  }

  return error instanceof Error && error.message.length > 0
    ? error.message
    : undefined;
}

function readBufferString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
