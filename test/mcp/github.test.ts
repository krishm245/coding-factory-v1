import { describe, expect, it } from "vitest";
import {
  GitHubIssueFetchError,
  explainCreatePullRequestToolError,
  normalizeCreatedPullRequest,
  normalizeGitHubIssue,
  parseDockerMcpJsonOutput,
  qualifyPullRequestHead,
  resolveMcpProfile,
} from "../../src/mcp/github.js";

const request = {
  issueNumber: 123,
  repository: {
    owner: "owner",
    repo: "repo",
  },
  mcpProfile: "coding_factory",
};

describe("resolveMcpProfile", () => {
  it("uses the explicit option first", () => {
    expect(resolveMcpProfile("flag-profile", {
      CODING_FACTORY_MCP_PROFILE: "env-profile",
    })).toBe("flag-profile");
  });

  it("uses the environment value before the default", () => {
    expect(resolveMcpProfile(undefined, {
      CODING_FACTORY_MCP_PROFILE: "env-profile",
    })).toBe("env-profile");
  });

  it("falls back to the default Docker MCP profile", () => {
    expect(resolveMcpProfile(undefined, {})).toBe("coding_factory");
  });
});

describe("parseDockerMcpJsonOutput", () => {
  it("parses the JSON payload after Docker MCP timing output", () => {
    expect(parseDockerMcpJsonOutput(
      'Tool call took: 802ms\n{"number":123,"title":"Test","state":"open"}\n',
    )).toEqual({
      number: 123,
      title: "Test",
      state: "open",
    });
  });

  it("fails clearly when Docker MCP does not return JSON", () => {
    expect(() => parseDockerMcpJsonOutput("Tool call took: 10ms\nok\n")).toThrow(
      new GitHubIssueFetchError("Docker MCP did not return a JSON payload."),
    );
  });

  it("fails clearly when Docker MCP returns malformed JSON", () => {
    expect(() => parseDockerMcpJsonOutput("Tool call took: 10ms\n{bad json}\n")).toThrow(
      new GitHubIssueFetchError("Docker MCP returned malformed JSON."),
    );
  });
});

describe("normalizeGitHubIssue", () => {
  it("normalizes GitHub issue payloads", () => {
    expect(normalizeGitHubIssue({
      number: 123,
      title: "Add Docker MCP fetching",
      state: "open",
      html_url: "https://github.com/owner/repo/issues/123",
      user: {
        login: "johndoe123",
      },
      labels: [
        {
          name: "enhancement",
        },
        "cli",
      ],
      body: "Fetch the issue by number.",
    }, request)).toEqual({
      issueNumber: 123,
      title: "Add Docker MCP fetching",
      state: "open",
      url: "https://github.com/owner/repo/issues/123",
      author: "johndoe123",
      labels: ["enhancement", "cli"],
      body: "Fetch the issue by number.",
      repository: request.repository,
      mcpProfile: "coding_factory",
    });
  });

  it("accepts payloads nested under an issue key", () => {
    expect(normalizeGitHubIssue({
      issue: {
        title: "Nested issue",
        state: "closed",
        labels: [],
      },
    }, request)).toMatchObject({
      issueNumber: 123,
      title: "Nested issue",
      state: "closed",
    });
  });

  it("fails when required fields are missing", () => {
    expect(() => normalizeGitHubIssue({ title: "Missing state" }, request)).toThrow(
      new GitHubIssueFetchError("Docker MCP issue payload is missing required fields."),
    );
  });
});

describe("normalizeCreatedPullRequest", () => {
  it("normalizes GitHub pull request payloads", () => {
    expect(normalizeCreatedPullRequest({
      number: 7,
      title: "Implement issue #123",
      html_url: "https://github.com/owner/repo/pull/7",
    })).toEqual({
      number: 7,
      title: "Implement issue #123",
      url: "https://github.com/owner/repo/pull/7",
    });
  });

  it("accepts pull request payloads nested under a pullRequest key", () => {
    expect(normalizeCreatedPullRequest({
      pullRequest: {
        number: 8,
        title: "Nested pull request",
        html_url: "https://github.com/owner/repo/pull/8",
      },
    })).toEqual({
      number: 8,
      title: "Nested pull request",
      url: "https://github.com/owner/repo/pull/8",
    });
  });

  it("accepts pull request payloads nested under a pull_request key", () => {
    expect(normalizeCreatedPullRequest({
      pull_request: {
        number: 9,
        title: "Snake case pull request",
        html_url: "https://github.com/owner/repo/pull/9",
      },
    })).toEqual({
      number: 9,
      title: "Snake case pull request",
      url: "https://github.com/owner/repo/pull/9",
    });
  });

  it("fails when the pull request URL is missing", () => {
    expect(() => normalizeCreatedPullRequest({
      number: 7,
      title: "Missing URL",
    })).toThrow(
      new GitHubIssueFetchError("Docker MCP pull request payload is missing a URL."),
    );
  });
});

describe("qualifyPullRequestHead", () => {
  it("qualifies bare branch names with the repository owner", () => {
    expect(qualifyPullRequestHead(request.repository, "coding-factory/issue-123")).toBe(
      "owner:coding-factory/issue-123",
    );
  });

  it("keeps already-qualified head refs unchanged", () => {
    expect(qualifyPullRequestHead(request.repository, "other-owner:feature")).toBe(
      "other-owner:feature",
    );
  });
});

describe("explainCreatePullRequestToolError", () => {
  it("turns unknown create_pull_request tool errors into actionable configuration guidance", () => {
    expect(explainCreatePullRequestToolError(
      'calling tool: calling "tools/call": unknown tool "create_pull_request"',
      "coding_factory",
    )).toBe(
      [
        'Docker MCP profile "coding_factory" does not expose the GitHub "create_pull_request" tool.',
        "Enable the GitHub MCP pull_requests toolset and make sure the server is not running in read-only mode.",
        "Verify with: docker mcp tools list --gateway-arg --profile=coding_factory",
      ].join(" "),
    );
  });

  it("keeps unrelated Docker MCP errors unchanged", () => {
    expect(explainCreatePullRequestToolError(
      "Validation Failed: pull request already exists.",
      "coding_factory",
    )).toBe("Validation Failed: pull request already exists.");
  });

  it("adds ref context for unreadable pull request refs", () => {
    expect(explainCreatePullRequestToolError(
      "Validation Failed: not all refs are readable",
      "coding_factory",
      {
        base: "main",
        head: "owner:coding-factory/issue-123",
      },
    )).toBe(
      [
        "Validation Failed: not all refs are readable",
        "Pull request refs used: base=main, head=owner:coding-factory/issue-123.",
        "Verify that the GitHub MCP token can read the private repository and the pushed branch refs.",
      ].join(" "),
    );
  });
});
