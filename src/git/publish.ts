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

export interface VerifyRemoteBranchRequest {
  branchName: string;
  remote?: string;
  repository: RepositoryContext;
}

export interface WaitForRemoteBranchRequest extends VerifyRemoteBranchRequest {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export type IssueBranchPublisher = (
  request: PublishIssueBranchRequest,
) => PublishIssueBranchResult;
export type RemoteDefaultBranchResolver = (
  repository: RepositoryContext,
) => string;
export type RemoteBranchVerifier = (
  request: VerifyRemoteBranchRequest,
) => void;
export type RemoteBranchWaiter = (
  request: WaitForRemoteBranchRequest,
) => Promise<void>;

export const DEFAULT_REMOTE_BRANCH_WAIT_TIMEOUT_MS = 10_000;
export const DEFAULT_REMOTE_BRANCH_WAIT_POLL_INTERVAL_MS = 1_000;

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

export function resolveRemoteDefaultBranch(
  repository: RepositoryContext,
  runGit: GitRunner = defaultGitRunner,
): string {
  const output = runRequiredGit(
    ["ls-remote", "--symref", "origin", "HEAD"],
    repository.root,
    runGit,
    "Unable to resolve origin default branch.",
  );
  const prefix = "ref: refs/heads/";
  const refLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith(prefix) && line.endsWith("\tHEAD"));

  if (!refLine) {
    throw new GitPublishError("Origin default branch ref is missing or malformed.");
  }

  const branchName = refLine.slice(prefix.length, refLine.indexOf("\tHEAD")).trim();

  if (branchName.length === 0) {
    throw new GitPublishError("Origin default branch ref is missing or malformed.");
  }

  return branchName;
}

export function verifyRemoteBranchExists(
  request: VerifyRemoteBranchRequest,
  runGit: GitRunner = defaultGitRunner,
): void {
  if (!remoteBranchExists(request, runGit)) {
    throw new GitPublishError(
      `Remote branch ${request.remote ?? "origin"}/${request.branchName} is not readable.`,
    );
  }
}

export async function waitForRemoteBranch(
  request: WaitForRemoteBranchRequest,
  {
    now = Date.now,
    runGit = defaultGitRunner,
    sleep = defaultSleep,
  }: {
    now?: () => number;
    runGit?: GitRunner;
    sleep?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<void> {
  const timeoutMs = request.timeoutMs ?? DEFAULT_REMOTE_BRANCH_WAIT_TIMEOUT_MS;
  const pollIntervalMs =
    request.pollIntervalMs ?? DEFAULT_REMOTE_BRANCH_WAIT_POLL_INTERVAL_MS;
  const deadline = now() + timeoutMs;

  while (true) {
    if (remoteBranchExists(request, runGit)) {
      return;
    }

    if (now() >= deadline) {
      throw new GitPublishError(
        `Remote branch ${request.remote ?? "origin"}/${request.branchName} was not visible after ${Math.ceil(timeoutMs / 1000)} seconds.`,
      );
    }

    await sleep(pollIntervalMs);
  }
}

function remoteBranchExists(
  request: VerifyRemoteBranchRequest,
  runGit: GitRunner,
): boolean {
  const output = runRequiredGit(
    ["ls-remote", "--heads", request.remote ?? "origin", request.branchName],
    request.repository.root,
    runGit,
    `Unable to verify remote branch ${request.remote ?? "origin"}/${request.branchName}.`,
  );

  return output.trim().length > 0;
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

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
