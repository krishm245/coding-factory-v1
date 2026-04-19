import {
  type GitRunner,
  type RepositoryContext,
  defaultGitRunner,
} from "./repository.js";

export interface GitDiffSummaryRequest {
  repository: RepositoryContext;
}

export interface GitDiffSummary {
  changedFiles: string[];
  stat: string;
}

export type GitDiffSummaryCollector = (
  request: GitDiffSummaryRequest,
) => GitDiffSummary;

export class GitDiffSummaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitDiffSummaryError";
  }
}

export function collectGitDiffSummary(
  request: GitDiffSummaryRequest,
  runGit: GitRunner = defaultGitRunner,
): GitDiffSummary {
  try {
    const changedFiles = runGit(
      ["diff", "--name-only"],
      request.repository.root,
    )
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const stat = runGit(
      ["diff", "--stat"],
      request.repository.root,
    ).trim();

    return {
      changedFiles,
      stat,
    };
  } catch {
    throw new GitDiffSummaryError("Unable to collect git diff summary.");
  }
}
