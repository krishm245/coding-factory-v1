import { Command } from "commander";
import { registerIssueCommand } from "./commands/issue.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("coding-factory")
    .description("Run a local-LLM coding factory against GitHub issues.")
    .version("0.1.0");

  registerIssueCommand(program);

  return program;
}
