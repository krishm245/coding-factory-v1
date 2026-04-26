import { execFileSync } from "node:child_process";

import type { GitHubRepository } from "../git/repository.js";

export const DEFAULT_MCP_PROFILE = "coding_factory";
const CREATE_PULL_REQUEST_TOOL = "create_pull_request";

export interface FetchGitHubIssueRequest {
  issueNumber: number;
  repository: GitHubRepository;
  mcpProfile: string;
}

export interface CreatePullRequestRequest {
  base: string;
  body: string;
  head: string;
  headRepository?: GitHubRepository;
  mcpProfile: string;
  repository: GitHubRepository;
  title: string;
}

export interface CreatedPullRequest {
  number?: number;
  title?: string;
  url: string;
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

export type PullRequestCreator = (
  request: CreatePullRequestRequest,
) => CreatedPullRequest;

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

    throw new GitHubIssueFetchError(
      extractDockerMcpErrorMessage(
        error,
        "Unable to fetch GitHub issue through Docker MCP.",
      ),
    );
  }
}

export function createPullRequestViaDockerMcp(
  request: CreatePullRequestRequest,
): CreatedPullRequest {
  const {
    base,
    body,
    head,
    headRepository,
    mcpProfile,
    repository,
    title,
  } = request;
  const qualifiedHead = qualifyPullRequestHead(
    repository,
    headRepository ?? repository,
    head,
  );

  try {
    const stdout = execFileSync(
      "docker",
      [
        "mcp",
        "tools",
        "call",
        "--gateway-arg",
        `--profile=${mcpProfile}`,
        CREATE_PULL_REQUEST_TOOL,
        `owner=${repository.owner}`,
        `repo=${repository.repo}`,
        `base=${base}`,
        `head=${qualifiedHead}`,
        `title=${title}`,
        `body=${body}`,
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    return normalizeCreatedPullRequest(parseDockerMcpJsonOutput(stdout));
  } catch (error) {
    if (error instanceof GitHubIssueFetchError) {
      throw error;
    }

    const message = extractDockerMcpErrorMessage(
      error,
      "Unable to open pull request through Docker MCP.",
    );

    throw new GitHubIssueFetchError(
      explainCreatePullRequestToolError(message, mcpProfile, {
        base,
        head: qualifiedHead,
      }),
    );
  }
}

export function qualifyPullRequestHead(
  baseRepository: GitHubRepository,
  headRepository: GitHubRepository,
  head: string,
): string {
  if (head.includes(":")) {
    return head;
  }

  if (
    baseRepository.owner === headRepository.owner
    && baseRepository.repo === headRepository.repo
  ) {
    return head;
  }

  return `${headRepository.owner}:${head}`;
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

export function normalizeCreatedPullRequest(payload: unknown): CreatedPullRequest {
  if (!isRecord(payload)) {
    throw new GitHubIssueFetchError("Docker MCP pull request payload is not an object.");
  }

  const pullRequest = unwrapPullRequestPayload(payload);
  const url = readOptionalString(pullRequest, "html_url")
    ?? readOptionalString(pullRequest, "url");

  if (!url) {
    throw new GitHubIssueFetchError("Docker MCP pull request payload is missing a URL.");
  }

  return {
    number: readNumber(pullRequest, "number"),
    title: readOptionalString(pullRequest, "title"),
    url,
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

function unwrapPullRequestPayload(payload: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(payload.pullRequest)) {
    return payload.pullRequest;
  }

  if (isRecord(payload.pull_request)) {
    return payload.pull_request;
  }

  return payload;
}

export function explainCreatePullRequestToolError(
  message: string,
  mcpProfile: string,
  refs?: { base: string; head: string },
): string {
  if (!message.includes(`unknown tool "${CREATE_PULL_REQUEST_TOOL}"`)) {
    if (!message.includes("not all refs are readable") || !refs) {
      return message;
    }

    return [
      message,
      `Pull request refs used: base=${refs.base}, head=${refs.head}.`,
      "Verify that the GitHub MCP token can read the private repository and the pushed branch refs.",
    ].join(" ");
  }

  return [
    `Docker MCP profile "${mcpProfile}" does not expose the GitHub "${CREATE_PULL_REQUEST_TOOL}" tool.`,
    "Enable the GitHub MCP pull_requests toolset and make sure the server is not running in read-only mode.",
    `Verify with: docker mcp tools list --gateway-arg --profile=${mcpProfile}`,
  ].join(" ");
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

function extractDockerMcpErrorMessage(error: unknown, fallback: string): string {
  if (isRecord(error)) {
    const stderr = readBufferString(error, "stderr");
    const stdout = readBufferString(error, "stdout");
    const output = stderr || stdout;

    if (output) {
      return simplifyDockerMcpOutput(output, fallback);
    }
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}

function readBufferString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  return typeof value === "string" ? value : undefined;
}

function simplifyDockerMcpOutput(output: string, fallback: string): string {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("Tool call took:"));

  return lines.at(-1) ?? fallback;
}
