import type { NormalizedGitHubIssue } from "../mcp/github.js";

export interface PullRequestContentRequest {
  changedFiles: string[];
  commitSha: string;
  issue: NormalizedGitHubIssue;
  requirementPath: string;
}

export interface PullRequestContent {
  body: string;
  title: string;
}

export function buildPullRequestContent(
  request: PullRequestContentRequest,
): PullRequestContent {
  return {
    title: `Implement issue #${request.issue.issueNumber}: ${request.issue.title}`,
    body: [
      `Closes #${request.issue.issueNumber}`,
      "",
      "## Summary",
      "",
      `- Implements GitHub issue #${request.issue.issueNumber}.`,
      `- Uses requirement document: ${request.requirementPath}`,
      `- Commit: ${request.commitSha}`,
      "",
      "## Changed Files",
      "",
      ...formatChangedFiles(request.changedFiles),
      "",
      "## Tests",
      "",
      "- Not run in this milestone.",
    ].join("\n"),
  };
}

function formatChangedFiles(changedFiles: string[]): string[] {
  if (changedFiles.length === 0) {
    return ["- No changed files reported."];
  }

  return changedFiles.map((file) => `- ${file}`);
}
