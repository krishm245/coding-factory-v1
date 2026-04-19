import { describe, expect, it } from "vitest";
import {
  GitHubIssueFetchError,
  normalizeGitHubIssue,
  parseDockerMcpJsonOutput,
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
