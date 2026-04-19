# Coding Factory CLI

A local-LLM coding factory CLI designed to automate the process of turning GitHub issues into implemented features via isolated Docker workspaces.

## Usage

The primary command is `coding-factory issue <issue-number>`.

### Basic Execution

To run the factory for a specific issue, use:

```bash
coding-factory issue 123
```

This command will:
1. Load the repository context.
2. Fetch the details of GitHub issue #123.
3. Generate a requirement document (e.g., `requirements/issue-123.md`).
4. Build and run a Docker worker container.
5. Generate implementation patches based on the requirements and repository context.
6. Apply the patches to a new feature branch.
7. Push the branch and create a Pull Request.

### Options

You can customize the run using flags:

* `--model <model>`: Specify the LLM model to use (e.g., `gpt-4o`).
* `--test-script <script>`: Specify a `package.json` script to run tests after implementation.
* `--dry-run`: Run the process without making actual commits or PRs.
* `--mcp-profile <profile>`: Specify the MCP profile to use for GitHub interactions.

## Prerequisites

1. **Docker:** Docker must be installed and running.
2. **Git:** Git must be installed and configured.
3. **LLM Engine:** A local LLM engine accessible via the configured MCP profile must be running.

## Getting Started

1. Clone the repository.
2. Install dependencies: `pnpm install`
3. Run the CLI: `pnpm start` (or use `coding-factory` if installed globally).

For detailed configuration, refer to the environment variables or command-line options.
