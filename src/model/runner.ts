import type { NormalizedGitHubIssue } from "../mcp/github.js";
import type { RepoSummary } from "../worker/repo-summary.js";

export const DEFAULT_MODEL_BASE_URL = "http://localhost:12434/engines/v1";

export interface ModelConfig {
  model: string;
  modelBaseUrl: string;
}

export interface GenerateRequirementMarkdownRequest extends ModelConfig {
  issue: NormalizedGitHubIssue;
}

export interface GenerateImplementationPatchRequest extends ModelConfig {
  repoSummary: RepoSummary;
}

export type RequirementMarkdownGenerator = (
  request: GenerateRequirementMarkdownRequest,
) => Promise<string>;

export type ImplementationPatchGenerator = (
  request: GenerateImplementationPatchRequest,
) => Promise<string>;

export class RequirementGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequirementGenerationError";
  }
}

export class ImplementationGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImplementationGenerationError";
  }
}

export function resolveModelConfig(
  optionModel: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ModelConfig {
  const model = optionModel ?? env.CODING_FACTORY_MODEL;

  if (!model) {
    throw new RequirementGenerationError(
      "Docker Model Runner model is required. Pass --model or set CODING_FACTORY_MODEL.",
    );
  }

  return {
    model,
    modelBaseUrl: env.CODING_FACTORY_MODEL_BASE_URL ?? DEFAULT_MODEL_BASE_URL,
  };
}

export async function generateRequirementMarkdownViaDockerModelRunner(
  request: GenerateRequirementMarkdownRequest,
): Promise<string> {
  const response = await fetch(buildChatCompletionsUrl(request.modelBaseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      messages: buildRequirementMessages(request.issue),
      temperature: 0.2,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new RequirementGenerationError(
      `Docker Model Runner request failed with HTTP ${response.status}.`,
    );
  }

  return parseChatCompletionMarkdown(await response.json());
}

export async function generateImplementationPatchViaDockerModelRunner(
  request: GenerateImplementationPatchRequest,
): Promise<string> {
  const response = await fetch(buildChatCompletionsUrl(request.modelBaseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      messages: buildImplementationPatchMessages(request.repoSummary),
      temperature: 0.1,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new ImplementationGenerationError(
      `Docker Model Runner request failed with HTTP ${response.status}.`,
    );
  }

  return parseChatCompletionPatch(await response.json());
}

export function buildChatCompletionsUrl(modelBaseUrl: string): string {
  return `${modelBaseUrl.replace(/\/+$/, "")}/chat/completions`;
}

export function buildRequirementMessages(
  issue: NormalizedGitHubIssue,
): Array<{ role: "system" | "user"; content: string }> {
  return [
    {
      role: "system",
      content: [
        "You turn GitHub issues into implementation requirement documents.",
        "Return only markdown.",
        "Do not wrap the markdown in a code fence.",
        "Do not include a verbatim copy of the original issue body.",
        "Use these exact top-level headings: Summary, Requirements, Acceptance Criteria, Test Expectations, Out of Scope, Implementation Notes.",
        "Make uncertain assumptions explicit in the relevant section.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Issue number: ${issue.issueNumber}`,
        `Title: ${issue.title}`,
        `State: ${issue.state}`,
        `URL: ${issue.url ?? "not provided"}`,
        `Author: ${issue.author ?? "not provided"}`,
        `Labels: ${issue.labels.length > 0 ? issue.labels.join(", ") : "none"}`,
        "",
        "Issue body:",
        issue.body?.trim() || "(empty)",
        "",
        "Write a requirements document that starts with:",
        `# Issue ${issue.issueNumber}: ${issue.title}`,
      ].join("\n"),
    },
  ];
}

export function buildImplementationPatchMessages(
  repoSummary: RepoSummary,
): Array<{ role: "system" | "user"; content: string }> {
  return [
    {
      role: "system",
      content: [
        "You modify repositories by returning a single git-style unified diff patch.",
        "Return only the patch.",
        "Do not include prose.",
        "Do not wrap the patch in a markdown code fence.",
        "Every file change must start with a line like: diff --git a/<path> b/<path>.",
        "Use paths relative to the repository root.",
        "For new files, include: new file mode 100644, --- /dev/null, and +++ b/<path>.",
        "Make hunk line counts exact.",
        "For new files, the +N count in @@ -0,0 +1,N @@ must equal the number of added content lines.",
        "Every line inside a hunk, including blank lines and markdown code fence lines, must start with +, -, or a space.",
        "The patch must end with a trailing newline.",
        "Do not delete files.",
        "Do not include binary patches.",
        "When modifying a file that already exists in the repository tree, do not mark it as a new file.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        "Requirement document:",
        repoSummary.requirementMarkdown,
        "",
        "Repository tree:",
        repoSummary.tree.join("\n"),
        "",
        "Selected files:",
        ...repoSummary.files.flatMap((file) => [
          `--- ${file.path} ---`,
          file.content,
          "",
        ]),
        "Return the implementation as one git-style unified diff patch.",
        "Example new-file header:",
        "diff --git a/README.md b/README.md",
        "new file mode 100644",
        "index 0000000..0000000",
        "--- /dev/null",
        "+++ b/README.md",
      ].join("\n"),
    },
  ];
}

export function parseChatCompletionMarkdown(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new RequirementGenerationError("Docker Model Runner returned a malformed response.");
  }

  const choices = payload.choices;

  if (!Array.isArray(choices) || choices.length === 0) {
    throw new RequirementGenerationError("Docker Model Runner returned no choices.");
  }

  const firstChoice = choices[0];

  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw new RequirementGenerationError("Docker Model Runner returned a malformed choice.");
  }

  const content = firstChoice.message.content;

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new RequirementGenerationError("Docker Model Runner returned empty markdown.");
  }

  return stripMarkdownFence(content.trim());
}

export function parseChatCompletionPatch(payload: unknown): string {
  const rawPatch = parseChatCompletionContent(
    payload,
    new ImplementationGenerationError("Docker Model Runner returned a malformed response."),
  );
  const patch = normalizeSimpleUnifiedDiff(stripPatchFence(rawPatch.trim()));

  if (!patch.includes("diff --git ")) {
    throw new ImplementationGenerationError(
      "Docker Model Runner did not return a unified diff patch.",
    );
  }

  return patch;
}

function parseChatCompletionContent(payload: unknown, malformedError: Error): string {
  if (!isRecord(payload)) {
    throw malformedError;
  }

  const choices = payload.choices;

  if (!Array.isArray(choices) || choices.length === 0) {
    throw new RequirementGenerationError("Docker Model Runner returned no choices.");
  }

  const firstChoice = choices[0];

  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw malformedError;
  }

  const content = firstChoice.message.content;

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new RequirementGenerationError("Docker Model Runner returned empty markdown.");
  }

  return content.trim();
}

function stripMarkdownFence(markdown: string): string {
  const fenceMatch = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i.exec(markdown);

  return fenceMatch ? fenceMatch[1].trim() : markdown;
}

function stripPatchFence(patch: string): string {
  const fenceMatch = /^```(?:diff|patch)?\s*\n([\s\S]*?)\n```$/i.exec(patch);

  return fenceMatch ? fenceMatch[1].trim() : patch;
}

function normalizeSimpleUnifiedDiff(patch: string): string {
  if (patch.includes("diff --git ")) {
    return patch;
  }

  const lines = patch.split(/\r?\n/);
  const oldHeader = lines[0];
  const newHeader = lines[1];

  if (!oldHeader?.startsWith("--- ") || !newHeader?.startsWith("+++ ")) {
    return patch;
  }

  const oldPath = normalizeSimpleDiffPath(oldHeader.slice(4).trim(), "a/");
  const newPath = normalizeSimpleDiffPath(newHeader.slice(4).trim(), "b/");

  if (!oldPath || !newPath) {
    return patch;
  }

  const body = lines.slice(2);

  if (!body.some((line) => line.startsWith("@@ "))) {
    return patch;
  }

  if (oldPath !== "/dev/null" && newPath !== "/dev/null" && oldPath !== newPath) {
    return patch;
  }

  if (oldPath === "/dev/null") {
    return [
      `diff --git a/${newPath} b/${newPath}`,
      "new file mode 100644",
      "index 0000000..0000000",
      "--- /dev/null",
      `+++ b/${newPath}`,
      ...body,
    ].join("\n");
  }

  return [
    `diff --git a/${oldPath} b/${newPath}`,
    `--- a/${oldPath}`,
    newPath === "/dev/null" ? "+++ /dev/null" : `+++ b/${newPath}`,
    ...body,
  ].join("\n");
}

function normalizeSimpleDiffPath(path: string, prefix: "a/" | "b/"): string {
  if (path === "/dev/null") {
    return path;
  }

  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
