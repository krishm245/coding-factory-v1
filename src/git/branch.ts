import {
  type GitRunner,
  type RepositoryContext,
  defaultGitRunner,
} from "./repository.js";

export interface EnsureIssueBranchRequest {
  issueNumber: number;
  repository: RepositoryContext;
}

export interface IssueBranchResult {
  branchName: string;
  created: boolean;
}

export type IssueBranchEnsurer = (
  request: EnsureIssueBranchRequest,
) => IssueBranchResult;

export class GitBranchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitBranchError";
  }
}

export function getIssueBranchName(issueNumber: number): string {
  return `coding-factory/issue-${issueNumber}`;
}

export function ensureIssueBranch(
  request: EnsureIssueBranchRequest,
  runGit: GitRunner = defaultGitRunner,
): IssueBranchResult {
  const branchName = getIssueBranchName(request.issueNumber);
  const created = !branchExists(branchName, request.repository.root, runGit);

  if (created) {
    runRequiredGit(
      ["checkout", "-b", branchName],
      request.repository.root,
      runGit,
      `Unable to create issue branch ${branchName}.`,
    );
  } else {
    runRequiredGit(
      ["checkout", branchName],
      request.repository.root,
      runGit,
      `Unable to checkout existing issue branch ${branchName}.`,
    );
  }

  const status = runRequiredGit(
    ["status", "--porcelain"],
    request.repository.root,
    runGit,
    "Unable to inspect git working tree after checking out issue branch.",
  );

  if (status.trim().length > 0) {
    throw new GitBranchError(
      "Git working tree must be clean after checking out issue branch.",
    );
  }

  return {
    branchName,
    created,
  };
}

function branchExists(
  branchName: string,
  cwd: string,
  runGit: GitRunner,
): boolean {
  try {
    runGit(["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], cwd);
    return true;
  } catch {
    return false;
  }
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
    throw new GitBranchError(errorMessage);
  }
}
