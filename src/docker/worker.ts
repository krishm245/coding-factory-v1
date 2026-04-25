import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { RepositoryContext } from "../git/repository.js";
import { getRequirementDocumentPath } from "../requirements/document.js";

export const DEFAULT_WORKER_IMAGE = "coding-factory-worker:latest";
export const DEFAULT_DOCKER_STARTUP_TIMEOUT_MS = 60_000;
export const DEFAULT_DOCKER_POLL_INTERVAL_MS = 1_000;

export interface WorkerConfig {
  workerImage: string;
}

export interface DockerStartupOptions {
  logProgress?: (message: string) => void;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface DockerStartupDependencies {
  runDocker?: DockerRunner;
  openDockerDesktop?: () => void;
  sleep?: (milliseconds: number) => Promise<void>;
  platform?: NodeJS.Platform;
}

export interface StartWorkerContainerRequest {
  branchName: string;
  issueNumber: number;
  repository: RepositoryContext;
  workerImage: string;
}

export interface WorkerContainerResult {
  containerId: string;
  containerName: string;
  workerImage: string;
  workspacePath: string;
}

export type DockerRunner = (args: string[]) => string;

export type WorkerContainerStarter = (
  request: StartWorkerContainerRequest,
) => WorkerContainerResult;

export type WorkerImageEnsurer = (workerImage: string) => void;
export type WorkerContainerRemover = (containerName: string) => void;
export type DockerStartupEnsurer = (
  options?: DockerStartupOptions,
) => Promise<void>;

export class WorkerContainerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerContainerError";
  }
}

export function resolveWorkerConfig(
  optionWorkerImage: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  return {
    workerImage:
      optionWorkerImage ?? env.CODING_FACTORY_WORKER_IMAGE ?? DEFAULT_WORKER_IMAGE,
  };
}

export function getWorkerContainerName(issueNumber: number): string {
  return `coding-factory-issue-${issueNumber}`;
}

export async function ensureDockerReadyAtStartup(
  options: DockerStartupOptions = {},
  dependencies: DockerStartupDependencies = {},
): Promise<void> {
  const {
    logProgress = noopProgressLogger,
    timeoutMs = DEFAULT_DOCKER_STARTUP_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_DOCKER_POLL_INTERVAL_MS,
  } = options;
  const runDocker = dependencies.runDocker ?? defaultDockerRunner;
  const openDockerDesktop = dependencies.openDockerDesktop ?? defaultOpenDockerDesktop;
  const sleep = dependencies.sleep ?? defaultSleep;
  const platform = dependencies.platform ?? process.platform;

  logProgress("Checking Docker availability.");

  if (isDockerReady(runDocker)) {
    logProgress("Docker is already running.");
    return;
  }

  if (platform !== "darwin") {
    throw new WorkerContainerError(
      "Docker is not available. Start Docker and try again.",
    );
  }

  logProgress("Docker is not running; starting Docker Desktop.");

  try {
    openDockerDesktop();
  } catch (error) {
    const message = extractDockerErrorMessage(error)
      ?? "Unable to launch Docker Desktop.";

    throw new WorkerContainerError(
      `Docker Desktop could not be started automatically: ${message} Install or launch Docker Desktop manually and try again.`,
    );
  }

  logProgress("Waiting for Docker to become ready.");

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);

    if (isDockerReady(runDocker)) {
      logProgress("Docker is ready.");
      return;
    }
  }

  throw new WorkerContainerError(
    `Docker Desktop did not become ready within ${Math.ceil(timeoutMs / 1000)} seconds. Launch Docker Desktop manually and try again.`,
  );
}

export function startWorkerContainer(
  request: StartWorkerContainerRequest,
  runDocker: DockerRunner = defaultDockerRunner,
): WorkerContainerResult {
  const containerName = getWorkerContainerName(request.issueNumber);

  const containerId = runRequiredDocker(
    [
      "run",
      "-d",
      "--name",
      containerName,
      "--workdir",
      "/workspace",
      "--mount",
      `type=bind,source=${request.repository.root},target=/workspace`,
      request.workerImage,
      "sleep",
      "infinity",
    ],
    runDocker,
    `Unable to start worker container ${containerName}.`,
  ).trim();

  const requirementPath = getRequirementDocumentPath(
    request.repository,
    request.issueNumber,
  ).relativePath;

  runRequiredDocker(
    [
      "exec",
      containerName,
      "test",
      "-f",
      `/workspace/${requirementPath}`,
    ],
    runDocker,
    `Worker container cannot see /workspace/${requirementPath}.`,
  );

  return {
    containerId,
    containerName,
    workerImage: request.workerImage,
    workspacePath: "/workspace",
  };
}

export function ensureWorkerImage(
  workerImage: string,
  runDocker: DockerRunner = defaultDockerRunner,
): void {
  if (workerImage !== DEFAULT_WORKER_IMAGE) {
    return;
  }

  try {
    runDocker(["image", "inspect", workerImage]);
    return;
  } catch {
    // Build the project-owned default image below.
  }

  runRequiredDocker(
    [
      "build",
      "-t",
      workerImage,
      "-f",
      getWorkerDockerfilePath(),
      getWorkerBuildContextPath(),
    ],
    runDocker,
    `Unable to build worker image ${workerImage}.`,
  );
}

export function removeWorkerContainer(
  containerName: string,
  runDocker: DockerRunner = defaultDockerRunner,
): void {
  runRequiredDocker(
    ["rm", "-f", containerName],
    runDocker,
    `Unable to remove worker container ${containerName}.`,
  );
}

export function defaultDockerRunner(args: string[]): string {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function defaultOpenDockerDesktop(): void {
  execFileSync("open", ["-a", "Docker"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function getWorkerDockerfilePath(): string {
  return join(getProjectRoot(), "worker", "Dockerfile");
}

function getWorkerBuildContextPath(): string {
  return join(getProjectRoot(), "worker");
}

function getProjectRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function isDockerReady(runDocker: DockerRunner): boolean {
  try {
    runDocker(["info"]);
    return true;
  } catch {
    return false;
  }
}

function runRequiredDocker(
  args: string[],
  runDocker: DockerRunner,
  errorMessage: string,
): string {
  try {
    return runDocker(args);
  } catch (error) {
    throw new WorkerContainerError(extractDockerErrorMessage(error) ?? errorMessage);
  }
}

function extractDockerErrorMessage(error: unknown): string | undefined {
  if (isRecord(error)) {
    const stderr = readBufferString(error, "stderr");
    const stdout = readBufferString(error, "stdout");
    const output = stderr || stdout;

    if (output) {
      const message = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .at(-1);

      return message;
    }
  }

  return error instanceof Error && error.message.length > 0
    ? error.message
    : undefined;
}

function readBufferString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function noopProgressLogger(message: string): void {
  void message;
}
