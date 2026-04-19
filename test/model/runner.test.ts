import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ImplementationGenerationError,
  RequirementGenerationError,
  buildChatCompletionsUrl,
  buildImplementationPatchMessages,
  generateImplementationPatchViaDockerModelRunner,
  generateRequirementMarkdownViaDockerModelRunner,
  parseChatCompletionPatch,
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
const repoSummary = {
  requirementMarkdown: "# Issue 123\n\n## Requirements\n\n- Change output.",
  tree: ["src/index.ts"],
  files: [
    {
      path: "src/index.ts",
      content: "console.log('hello');\n",
    },
  ],
};
const patch = [
  "diff --git a/src/index.ts b/src/index.ts",
  "index 1111111..2222222 100644",
  "--- a/src/index.ts",
  "+++ b/src/index.ts",
  "@@ -1 +1 @@",
  "-console.log('hello');",
  "+console.log('implemented');",
].join("\n");
const simpleReadmePatch = [
  "--- README.md",
  "+++ README.md",
  "@@ -0,0 +1,3 @@",
  "+# Coding Factory CLI",
  "+",
  "+A local-LLM coding factory CLI.",
].join("\n");
const normalizedReadmePatch = [
  "diff --git a/README.md b/README.md",
  "new file mode 100644",
  "index 0000000..0000000",
  "--- /dev/null",
  "+++ b/README.md",
  "@@ -0,0 +1,3 @@",
  "+# Coding Factory CLI",
  "+",
  "+A local-LLM coding factory CLI.",
].join("\n");

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

describe("parseChatCompletionPatch", () => {
  it("returns a unified diff patch from the first chat completion choice", () => {
    expect(parseChatCompletionPatch({
      choices: [
        {
          message: {
            content: patch,
          },
        },
      ],
    })).toBe(patch);
  });

  it("strips diff code fences if a model includes them anyway", () => {
    expect(parseChatCompletionPatch({
      choices: [
        {
          message: {
            content: `\`\`\`diff\n${patch}\n\`\`\``,
          },
        },
      ],
    })).toBe(patch);
  });

  it("normalizes simple new-file diffs into git-style diffs", () => {
    expect(parseChatCompletionPatch({
      choices: [
        {
          message: {
            content: simpleReadmePatch,
          },
        },
      ],
    })).toBe(normalizedReadmePatch);
  });

  it("fails when the model does not return a patch", () => {
    expect(() => parseChatCompletionPatch({
      choices: [
        {
          message: {
            content: "I changed the file.",
          },
        },
      ],
    })).toThrow(
      new ImplementationGenerationError(
        "Docker Model Runner did not return a unified diff patch.",
      ),
    );
  });
});

describe("buildImplementationPatchMessages", () => {
  it("instructs the model to return exact hunk line counts", () => {
    const messages = buildImplementationPatchMessages(repoSummary);

    expect(messages[0]?.content).toContain("Make hunk line counts exact.");
    expect(messages[0]?.content).toContain(
      "the +N count in @@ -0,0 +1,N @@ must equal the number of added content lines",
    );
    expect(messages[0]?.content).toContain(
      "Every line inside a hunk, including blank lines and markdown code fence lines",
    );
    expect(messages[0]?.content).toContain(
      "The patch must end with a trailing newline.",
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

describe("generateImplementationPatchViaDockerModelRunner", () => {
  it("calls Docker Model Runner and returns a generated patch", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: patch,
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

    await expect(generateImplementationPatchViaDockerModelRunner({
      repoSummary,
      model: "ai/test-model",
      modelBaseUrl: "http://localhost:12434/engines/v1",
    })).resolves.toBe(patch);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:12434/engines/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"model\":\"ai/test-model\""),
      }),
    );
  });

  it("fails clearly for non-2xx responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad gateway", {
      status: 502,
    })));

    await expect(generateImplementationPatchViaDockerModelRunner({
      repoSummary,
      model: "ai/test-model",
      modelBaseUrl: "http://localhost:12434/engines/v1",
    })).rejects.toThrow(
      new ImplementationGenerationError(
        "Docker Model Runner request failed with HTTP 502.",
      ),
    );
  });
});
