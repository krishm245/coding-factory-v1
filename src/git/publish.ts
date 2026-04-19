import {
  type GitRunner,
  type RepositoryContext,
  defaultGitRunner,
} from "./repository.js";

export interface PublishIssueBranchRequest {
  branchName: string;
  commitMessage: string;
  repository: RepositoryContext;
}

export interface PublishIssueBranchResult {
  branchName: string;
  commitSha: string;
  remote: string;
}

export type IssueBranchPublisher = (
  request: PublishIssueBranchRequest,
) => PublishIssueBranchResult;

export class GitPublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitPublishError";
  }
}

export function publishIssueBranch(
  request: PublishIssueBranchRequest,
  runGit: GitRunner = defaultGitRunner,
): PublishIssueBranchResult {
  const status = runRequiredGit(
    ["status", "--porcelain"],
    request.repository.root,
    runGit,
    "Unable to inspect git working tree before publishing.",
  );

  if (status.trim().length === 0) {
    throw new GitPublishError("No changes to commit.");
  }

  runRequiredGit(
    ["add", "-A"],
    request.repository.root,
    runGit,
    "Unable to stage issue branch changes.",
  );
  runRequiredGit(
    ["commit", "-m", request.commitMessage],
    request.repository.root,
    runGit,
    "Unable to commit issue branch changes.",
  );
  const commitSha = runRequiredGit(
    ["rev-parse", "HEAD"],
    request.repository.root,
    runGit,
    "Unable to resolve issue branch commit SHA.",
  ).trim();
  runRequiredGit(
    ["push", "-u", "origin", request.branchName],
    request.repository.root,
    runGit,
    "Unable to push issue branch to origin.",
  );

  return {
    branchName: request.branchName,
    commitSha,
    remote: "origin",
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
    throw new GitPublishError(errorMessage);
  }
}
