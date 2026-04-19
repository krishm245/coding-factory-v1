import { describe, expect, it } from "vitest";
import { buildPullRequestContent } from "../../src/pr/content.js";

const issue = {
  issueNumber: 123,
  title: "Add Docker MCP issue fetching",
  state: "open",
  url: "https://github.com/owner/repo/issues/123",
  author: "johndoe123",
  labels: ["enhancement"],
  body: "Fetch this issue through Docker MCP.",
  repository: {
    owner: "owner",
    repo: "repo",
  },
  mcpProfile: "coding_factory",
};

describe("buildPullRequestContent", () => {
  it("builds deterministic pull request title and body content", () => {
    expect(buildPullRequestContent({
      changedFiles: ["src/index.ts", "requirements/issue-123.md"],
      commitSha: "abc123",
      issue,
      requirementPath: "requirements/issue-123.md",
    })).toEqual({
      title: "Implement issue #123: Add Docker MCP issue fetching",
      body: [
        "Closes #123",
        "",
        "## Summary",
        "",
        "- Implements GitHub issue #123.",
        "- Uses requirement document: requirements/issue-123.md",
        "- Commit: abc123",
        "",
        "## Changed Files",
        "",
        "- src/index.ts",
        "- requirements/issue-123.md",
        "",
        "## Tests",
        "",
        "- Not run in this milestone.",
      ].join("\n"),
    });
  });

  it("reports when no changed files are available", () => {
    expect(buildPullRequestContent({
      changedFiles: [],
      commitSha: "abc123",
      issue,
      requirementPath: "requirements/issue-123.md",
    }).body).toContain("- No changed files reported.");
  });
});
