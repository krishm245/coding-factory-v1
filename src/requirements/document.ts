import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { RepositoryContext } from "../git/repository.js";

export interface WriteRequirementDocumentRequest {
  issueNumber: number;
  markdown: string;
  repository: RepositoryContext;
}

export interface RequirementDocumentWriteResult {
  absolutePath: string;
  relativePath: string;
}

export type RequirementDocumentWriter = (
  request: WriteRequirementDocumentRequest,
) => RequirementDocumentWriteResult;

export type RequirementDocumentExistsChecker = (
  repository: RepositoryContext,
  issueNumber: number,
) => boolean;

export class RequirementDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequirementDocumentError";
  }
}

export function getRequirementDocumentPath(
  repository: RepositoryContext,
  issueNumber: number,
): RequirementDocumentWriteResult {
  const relativePath = `requirements/issue-${issueNumber}.md`;

  return {
    absolutePath: join(repository.root, relativePath),
    relativePath,
  };
}

export function writeRequirementDocument(
  request: WriteRequirementDocumentRequest,
): RequirementDocumentWriteResult {
  const paths = getRequirementDocumentPath(
    request.repository,
    request.issueNumber,
  );

  try {
    mkdirSync(join(request.repository.root, "requirements"), {
      recursive: true,
    });
    writeFileSync(paths.absolutePath, ensureTrailingNewline(request.markdown), {
      encoding: "utf8",
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Unable to write requirement document.";

    throw new RequirementDocumentError(message);
  }

  return paths;
}

export function requirementDocumentExists(
  repository: RepositoryContext,
  issueNumber: number,
): boolean {
  return existsSync(getRequirementDocumentPath(repository, issueNumber).absolutePath);
}

function ensureTrailingNewline(markdown: string): string {
  return markdown.endsWith("\n") ? markdown : `${markdown}\n`;
}
