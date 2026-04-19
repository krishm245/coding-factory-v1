import { execFileSync } from "node:child_process";

import type { GitHubRepository } from "../git/repository.js";

export const DEFAULT_MCP_PROFILE = "coding_factory";

export interface FetchGitHubIssueRequest {
  issueNumber: number;
  repository: GitHubRepository;
  mcpProfile: string;
}

export interface NormalizedGitHubIssue {
  issueNumber: number;
  title: string;
  state: string;
  url?: string;
  author?: string;
  labels: string[];
  body?: string;
  repository: GitHubRepository;
  mcpProfile: string;
}

export type GitHubIssueFetcher = (
  request: FetchGitHubIssueRequest,
) => NormalizedGitHubIssue;

export class GitHubIssueFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubIssueFetchError";
  }
}

export function resolveMcpProfile(
  optionProfile: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return optionProfile ?? env.CODING_FACTORY_MCP_PROFILE ?? DEFAULT_MCP_PROFILE;
}

export function fetchGitHubIssueViaDockerMcp(
  request: FetchGitHubIssueRequest,
): NormalizedGitHubIssue {
  const { issueNumber, mcpProfile, repository } = request;

  try {
    const stdout = execFileSync(
      "docker",
      [
        "mcp",
        "tools",
        "call",
        "--gateway-arg",
        `--profile=${mcpProfile}`,
        "issue_read",
        `owner=${repository.owner}`,
        `repo=${repository.repo}`,
        `issue_number=${issueNumber}`,
        "method=get",
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    return normalizeGitHubIssue(
      parseDockerMcpJsonOutput(stdout),
      request,
    );
  } catch (error) {
    if (error instanceof GitHubIssueFetchError) {
      throw error;
    }

    throw new GitHubIssueFetchError(extractDockerMcpErrorMessage(error));
  }
}

export function parseDockerMcpJsonOutput(output: string): unknown {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  let jsonLine: string | undefined;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];

    if (line.startsWith("{") || line.startsWith("[")) {
      jsonLine = line;
      break;
    }
  }

  if (!jsonLine) {
    throw new GitHubIssueFetchError("Docker MCP did not return a JSON payload.");
  }

  try {
    return JSON.parse(jsonLine) as unknown;
  } catch {
    throw new GitHubIssueFetchError("Docker MCP returned malformed JSON.");
  }
}

export function normalizeGitHubIssue(
  payload: unknown,
  request: FetchGitHubIssueRequest,
): NormalizedGitHubIssue {
  const issue = unwrapIssuePayload(payload);
  const title = readString(issue, "title");
  const state = readString(issue, "state");

  if (!title || !state) {
    throw new GitHubIssueFetchError("Docker MCP issue payload is missing required fields.");
  }

  return {
    issueNumber: readNumber(issue, "number") ?? request.issueNumber,
    title,
    state,
    url: readOptionalString(issue, "html_url") ?? readOptionalString(issue, "url"),
    author: readAuthor(issue),
    labels: readLabels(issue),
    body: readOptionalString(issue, "body"),
    repository: request.repository,
    mcpProfile: request.mcpProfile,
  };
}

function unwrapIssuePayload(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new GitHubIssueFetchError("Docker MCP issue payload is not an object.");
  }

  const nestedIssue = payload.issue;

  if (isRecord(nestedIssue)) {
    return nestedIssue;
  }

  return payload;
}

function readAuthor(issue: Record<string, unknown>): string | undefined {
  const user = issue.user;

  if (isRecord(user)) {
    return readOptionalString(user, "login");
  }

  const author = issue.author;

  if (isRecord(author)) {
    return readOptionalString(author, "login") ?? readOptionalString(author, "name");
  }

  return readOptionalString(issue, "author");
}

function readLabels(issue: Record<string, unknown>): string[] {
  const labels = issue.labels;

  if (!Array.isArray(labels)) {
    return [];
  }

  return labels.flatMap((label) => {
    if (typeof label === "string") {
      return [label];
    }

    if (isRecord(label)) {
      const name = readOptionalString(label, "name");
      return name ? [name] : [];
    }

    return [];
  });
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];

  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];

  return typeof value === "string" ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];

  return typeof value === "number" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractDockerMcpErrorMessage(error: unknown): string {
  if (isRecord(error)) {
    const stderr = readBufferString(error, "stderr");
    const stdout = readBufferString(error, "stdout");
    const output = stderr || stdout;

    if (output) {
      return simplifyDockerMcpOutput(output);
    }
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "Unable to fetch GitHub issue through Docker MCP.";
}

function readBufferString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  return typeof value === "string" ? value : undefined;
}

function simplifyDockerMcpOutput(output: string): string {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("Tool call took:"));

  return lines.at(-1) ?? "Unable to fetch GitHub issue through Docker MCP.";
}
