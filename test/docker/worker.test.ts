import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKER_IMAGE,
  WorkerContainerError,
  getWorkerContainerName,
  resolveWorkerConfig,
  startWorkerContainer,
} from "../../src/docker/worker.js";
import type { RepositoryContext } from "../../src/git/repository.js";

const repositoryContext: RepositoryContext = {
  root: "/repo",
  currentBranch: "coding-factory/issue-123",
  remoteUrl: "git@github.com:owner/repo.git",
  github: {
    owner: "owner",
    repo: "repo",
  },
  isClean: true,
};

describe("resolveWorkerConfig", () => {
  it("uses the explicit worker image first", () => {
    expect(resolveWorkerConfig("python:3.12-slim", {
      CODING_FACTORY_WORKER_IMAGE: "golang:1.23",
    })).toEqual({
      workerImage: "python:3.12-slim",
    });
  });

  it("uses CODING_FACTORY_WORKER_IMAGE when no flag is provided", () => {
    expect(resolveWorkerConfig(undefined, {
      CODING_FACTORY_WORKER_IMAGE: "golang:1.23",
    })).toEqual({
      workerImage: "golang:1.23",
    });
  });

  it("falls back to the default worker image", () => {
    expect(resolveWorkerConfig(undefined, {})).toEqual({
      workerImage: DEFAULT_WORKER_IMAGE,
    });
  });
});

describe("getWorkerContainerName", () => {
  it("uses the issue number in the container name", () => {
    expect(getWorkerContainerName(123)).toBe("coding-factory-issue-123");
  });
});

describe("startWorkerContainer", () => {
  it("starts a detached worker container and probes the requirement document", () => {
    const calls: string[][] = [];
    const result = startWorkerContainer({
      branchName: "coding-factory/issue-123",
      issueNumber: 123,
      repository: repositoryContext,
      workerImage: "alpine:3.20",
    }, (args) => {
      calls.push(args);

      return args[0] === "run" ? "container-123\n" : "";
    });

    expect(result).toEqual({
      containerId: "container-123",
      containerName: "coding-factory-issue-123",
      workerImage: "alpine:3.20",
      workspacePath: "/workspace",
    });
    expect(calls).toEqual([
      [
        "run",
        "-d",
        "--name",
        "coding-factory-issue-123",
        "--workdir",
        "/workspace",
        "--mount",
        "type=bind,source=/repo,target=/workspace",
        "alpine:3.20",
        "sleep",
        "infinity",
      ],
      [
        "exec",
        "coding-factory-issue-123",
        "test",
        "-f",
        "/workspace/requirements/issue-123.md",
      ],
    ]);
  });

  it("fails clearly when Docker run fails", () => {
    expect(() => startWorkerContainer({
      branchName: "coding-factory/issue-123",
      issueNumber: 123,
      repository: repositoryContext,
      workerImage: "alpine:3.20",
    }, () => {
      throw new Error("container already exists");
    })).toThrow(new WorkerContainerError("container already exists"));
  });

  it("fails clearly when the requirement file probe fails", () => {
    expect(() => startWorkerContainer({
      branchName: "coding-factory/issue-123",
      issueNumber: 123,
      repository: repositoryContext,
      workerImage: "alpine:3.20",
    }, (args) => {
      if (args[0] === "exec") {
        throw new Error("file missing");
      }

      return "container-123\n";
    })).toThrow(new WorkerContainerError("file missing"));
  });
});
