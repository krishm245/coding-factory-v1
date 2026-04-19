# Coding Factory CLI

A local-LLM coding factory CLI designed to automate the process of turning GitHub issues into implemented code changes via isolated Docker workspaces.

## Usage

The primary command is `coding-factory issue <issue-number>`.

### Basic Execution

To run the factory for a specific issue, you must provide the issue number:

```bash
coding-factory issue 123
```

This command will:
1. Load the repository context.
2. Fetch the details of GitHub issue #123.
3. Generate a requirement document (e.g., `requirements/issue-123.md`).
4. Run the LLM to generate an implementation patch based on the requirements and repository context.
5. Apply the patch in a temporary Docker workspace.
6. Commit and push the changes to a new branch (`coding-factory/issue-123`).
7. Create a Pull Request against the base branch.

### Options

You can customize the process using flags:

* `--model <model>`: Specifies the LLM model to use (e.g., `gpt-4o`).
* `--test-script <script>`: A script defined in `package.json` to run full tests after implementation.
* `--dry-run`: Run the process without committing or pushing changes.
* `--mcp-profile <profile>`: Specifies the MCP profile to use for GitHub interactions.
* `--worker-image <image>`: Specifies the Docker image to use for the worker container.

## Prerequisites

Before running, ensure you have:
1. Docker installed and running.
2. Git configured locally.
3. Access credentials configured for the target GitHub repository (via SSH or HTTPS).

## Supported Commands

Currently, the CLI supports the following command:

* `issue <issue-number>`: Executes the full coding factory workflow for a GitHub issue.

## Out of Scope

* Detailed API documentation for the underlying LLM or MCP services.
* Advanced tutorials or complex, multi-step workflows beyond basic issue implementation.
