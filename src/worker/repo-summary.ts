import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import type { RepositoryContext } from "../git/repository.js";
import { getRequirementDocumentPath } from "../requirements/document.js";

export interface RepoSummaryRequest {
  issueNumber: number;
  repository: RepositoryContext;
}

export interface RepoSummary {
  requirementMarkdown: string;
  tree: string[];
  files: Array<{
    path: string;
    content: string;
  }>;
}

export type RepoSummaryCollector = (request: RepoSummaryRequest) => RepoSummary;

const MAX_TREE_ENTRIES = 120;
const MAX_FILES = 24;
const MAX_FILE_BYTES = 4_000;
const MAX_TOTAL_BYTES = 60_000;
const IGNORED_DIRECTORIES = new Set([
  ".git",
  "coverage",
  "dist",
  "node_modules",
]);
const PRIORITY_FILES = new Set([
  "package.json",
  "tsconfig.json",
  "vitest.config.ts",
  "eslint.config.js",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
]);
const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".go",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".py",
  ".rs",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);

export function collectRepoSummary(request: RepoSummaryRequest): RepoSummary {
  const requirementPath = getRequirementDocumentPath(
    request.repository,
    request.issueNumber,
  ).absolutePath;
  const requirementMarkdown = readTextFile(requirementPath);
  const tree = listRepoFiles(request.repository.root).slice(0, MAX_TREE_ENTRIES);
  const selectedFiles = selectContextFiles(tree);
  const files: RepoSummary["files"] = [];
  let totalBytes = requirementMarkdown.length;

  for (const path of selectedFiles) {
    if (path === getRequirementDocumentPath(request.repository, request.issueNumber).relativePath) {
      continue;
    }

    if (files.length >= MAX_FILES || totalBytes >= MAX_TOTAL_BYTES) {
      break;
    }

    const absolutePath = join(request.repository.root, path);
    const content = readTextFile(absolutePath).slice(0, MAX_FILE_BYTES);
    totalBytes += content.length;

    if (content.trim().length > 0) {
      files.push({
        path,
        content,
      });
    }
  }

  return {
    requirementMarkdown,
    tree,
    files,
  };
}

function listRepoFiles(root: string): string[] {
  const files: string[] = [];
  visitDirectory(root, root, files);
  return files.sort();
}

function visitDirectory(root: string, currentDirectory: string, files: string[]): void {
  if (files.length >= MAX_TREE_ENTRIES * 3) {
    return;
  }

  for (const entry of readdirSync(currentDirectory, {
    withFileTypes: true,
  })) {
    if (IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const absolutePath = join(currentDirectory, entry.name);
    const relativePath = relative(root, absolutePath);

    if (entry.isDirectory()) {
      visitDirectory(root, absolutePath, files);
      continue;
    }

    if (entry.isFile() && isCandidateTextFile(relativePath)) {
      files.push(relativePath);
    }
  }
}

function selectContextFiles(tree: string[]): string[] {
  const priority = tree.filter((path) => PRIORITY_FILES.has(path));
  const source = tree.filter((path) => path.startsWith("src/") || path.startsWith("test/"));
  return [...new Set([...priority, ...source])];
}

function isCandidateTextFile(path: string): boolean {
  if (PRIORITY_FILES.has(path)) {
    return true;
  }

  return SOURCE_EXTENSIONS.has(path.slice(path.lastIndexOf(".")));
}

function readTextFile(path: string): string {
  const stats = statSync(path);

  if (!stats.isFile()) {
    return "";
  }

  return readFileSync(path, "utf8");
}
