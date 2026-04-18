import { execFileSync } from "node:child_process";

export interface GitHubRepository {
  owner: string;
  repo: string;
}

export interface RepositoryContext {
  root: string;
  currentBranch: string;
  remoteUrl: string;
  github: GitHubRepository;
  isClean: boolean;
}

export type GitRunner = (args: string[], cwd: string) => string;

export class RepositoryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryValidationError";
  }
}

export function defaultGitRunner(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function parseGitHubRemote(remoteUrl: string): GitHubRepository {
  const trimmedRemoteUrl = remoteUrl.trim();
  const scpStyleMatch = /^git@github\.com:([^/]+)\/(.+)$/.exec(trimmedRemoteUrl);

  if (scpStyleMatch) {
    return normalizeGitHubRepository(scpStyleMatch[1], scpStyleMatch[2]);
  }

  try {
    const parsedUrl = new URL(trimmedRemoteUrl);

    if (parsedUrl.hostname !== "github.com") {
      throw new RepositoryValidationError("Origin remote must point to github.com.");
    }

    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "ssh:") {
      throw new RepositoryValidationError("Origin remote must use HTTPS or SSH.");
    }

    const pathParts = parsedUrl.pathname.replace(/^\/+/, "").split("/");

    if (pathParts.length !== 2) {
      throw new RepositoryValidationError("Origin remote is not a valid GitHub repository URL.");
    }

    return normalizeGitHubRepository(pathParts[0], pathParts[1]);
  } catch (error) {
    if (error instanceof RepositoryValidationError) {
      throw error;
    }

    throw new RepositoryValidationError("Origin remote is not a valid GitHub URL.");
  }
}

export function loadRepositoryContext(
  cwd = process.cwd(),
  runGit: GitRunner = defaultGitRunner,
): RepositoryContext {
  const insideWorkTree = runRequiredGit(
    ["rev-parse", "--is-inside-work-tree"],
    cwd,
    runGit,
    "Current directory is not inside a git repository.",
  ).trim();

  if (insideWorkTree !== "true") {
    throw new RepositoryValidationError("Current directory is not inside a git repository.");
  }

  const root = runRequiredGit(
    ["rev-parse", "--show-toplevel"],
    cwd,
    runGit,
    "Unable to resolve git repository root.",
  ).trim();

  const currentBranch = runRequiredGit(
    ["branch", "--show-current"],
    cwd,
    runGit,
    "Unable to detect the current git branch.",
  ).trim();

  if (currentBranch.length === 0) {
    throw new RepositoryValidationError("Current git checkout is in detached HEAD state.");
  }

  const remoteUrl = runRequiredGit(
    ["remote", "get-url", "origin"],
    cwd,
    runGit,
    "Missing required git remote named origin.",
  ).trim();
  const github = parseGitHubRemote(remoteUrl);
  const status = runRequiredGit(
    ["status", "--porcelain"],
    cwd,
    runGit,
    "Unable to inspect git working tree status.",
  );
  const isClean = status.trim().length === 0;

  if (!isClean) {
    throw new RepositoryValidationError("Git working tree must be clean before running coding-factory.");
  }

  return {
    root,
    currentBranch,
    remoteUrl,
    github,
    isClean,
  };
}

function runRequiredGit(
  args: string[],
  cwd: string,
  runGit: GitRunner,
  errorMessage: string,
): string {
  try {
    return runGit(args, cwd);
  } catch {
    throw new RepositoryValidationError(errorMessage);
  }
}

function normalizeGitHubRepository(owner: string, rawRepo: string): GitHubRepository {
  const repo = rawRepo.replace(/\.git$/, "").replace(/\/+$/, "");

  if (owner.length === 0 || repo.length === 0 || repo.includes("/")) {
    throw new RepositoryValidationError("Origin remote is not a valid GitHub repository URL.");
  }

  return {
    owner,
    repo,
  };
}
