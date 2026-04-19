import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RequirementGenerationError,
  buildChatCompletionsUrl,
  generateRequirementMarkdownViaDockerModelRunner,
  parseChatCompletionMarkdown,
  resolveModelConfig,
} from "../../src/model/runner.js";
import type { NormalizedGitHubIssue } from "../../src/mcp/github.js";

const issue: NormalizedGitHubIssue = {
  issueNumber: 123,
  title: "Generate requirements",
  state: "open",
  labels: ["enhancement"],
  body: "Turn the issue into a requirements markdown file.",
  repository: {
    owner: "owner",
    repo: "repo",
  },
  mcpProfile: "coding_factory",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("resolveModelConfig", () => {
  it("uses the explicit model first", () => {
    expect(resolveModelConfig("ai/flag-model", {
      CODING_FACTORY_MODEL: "ai/env-model",
    })).toEqual({
      model: "ai/flag-model",
      modelBaseUrl: "http://localhost:12434/engines/v1",
    });
  });

  it("uses CODING_FACTORY_MODEL when no model flag is provided", () => {
    expect(resolveModelConfig(undefined, {
      CODING_FACTORY_MODEL: "ai/env-model",
    })).toMatchObject({
      model: "ai/env-model",
    });
  });

  it("uses CODING_FACTORY_MODEL_BASE_URL when provided", () => {
    expect(resolveModelConfig("ai/model", {
      CODING_FACTORY_MODEL_BASE_URL: "http://localhost:12434/custom/v1",
    })).toEqual({
      model: "ai/model",
      modelBaseUrl: "http://localhost:12434/custom/v1",
    });
  });

  it("fails clearly when no model is configured", () => {
    expect(() => resolveModelConfig(undefined, {})).toThrow(
      new RequirementGenerationError(
        "Docker Model Runner model is required. Pass --model or set CODING_FACTORY_MODEL.",
      ),
    );
  });
});

describe("buildChatCompletionsUrl", () => {
  it("appends the chat completions path without duplicating slashes", () => {
    expect(buildChatCompletionsUrl("http://localhost:12434/engines/v1/")).toBe(
      "http://localhost:12434/engines/v1/chat/completions",
    );
  });
});

describe("parseChatCompletionMarkdown", () => {
  it("returns markdown from the first chat completion choice", () => {
    expect(parseChatCompletionMarkdown({
      choices: [
        {
          message: {
            content: "# Issue 123: Generate requirements",
          },
        },
      ],
    })).toBe("# Issue 123: Generate requirements");
  });

  it("strips markdown code fences if a model includes them anyway", () => {
    expect(parseChatCompletionMarkdown({
      choices: [
        {
          message: {
            content: "```markdown\n# Issue 123\n```",
          },
        },
      ],
    })).toBe("# Issue 123");
  });

  it("fails when the model returns no choices", () => {
    expect(() => parseChatCompletionMarkdown({ choices: [] })).toThrow(
      new RequirementGenerationError("Docker Model Runner returned no choices."),
    );
  });
});

describe("generateRequirementMarkdownViaDockerModelRunner", () => {
  it("calls Docker Model Runner and returns generated markdown", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: "# Issue 123: Generate requirements",
          },
        },
      ],
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateRequirementMarkdownViaDockerModelRunner({
      issue,
      model: "ai/test-model",
      modelBaseUrl: "http://localhost:12434/engines/v1",
    })).resolves.toBe("# Issue 123: Generate requirements");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:12434/engines/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"model\":\"ai/test-model\""),
      }),
    );
  });

  it("fails clearly for non-2xx responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", {
      status: 404,
    })));

    await expect(generateRequirementMarkdownViaDockerModelRunner({
      issue,
      model: "ai/test-model",
      modelBaseUrl: "http://localhost:12434/engines/v1",
    })).rejects.toThrow(
      new RequirementGenerationError(
        "Docker Model Runner request failed with HTTP 404.",
      ),
    );
  });
});
