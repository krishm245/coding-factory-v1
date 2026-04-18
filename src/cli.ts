import { Command } from "commander";
import {
  type IssueCommandDependencies,
  registerIssueCommand,
} from "./commands/issue.js";

export type CliDependencies = IssueCommandDependencies;

export function createProgram(dependencies: CliDependencies = {}): Command {
  const program = new Command();

  program
    .name("coding-factory")
    .description("Run a local-LLM coding factory against GitHub issues.")
    .version("0.1.0");

  registerIssueCommand(program, dependencies);

  return program;
}
