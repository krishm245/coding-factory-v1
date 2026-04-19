# Coding Factory CLI

A local-LLM coding factory CLI designed to automate the process of turning GitHub issues into implemented features. It operates by fetching issue details, generating requirement documents, creating code patches using a local LLM model, and finally creating a pull request against the target repository.

## 🚀 Features

*   **Issue Ingestion:** Fetches details for a specified GitHub issue.
*   **Requirement Generation:** Uses an LLM to generate a structured `README.md` (Requirement Document) based on the issue description.
*   **Code Implementation:** Generates a unified diff patch using the LLM based on the repository context and requirement document.
*   **Workflow Automation:** Manages Git operations (branching, committing, pushing) and interacts with GitHub via Docker MCP.

## 🛠️ Usage

The CLI is executed via the `coding-factory` command.

### Basic Execution

To run the factory for a specific issue number:

```bash
coding-factory issue <issue-number> [options]
```

### Options

| Option | Description |
| :--- | :--- |
| `--model <model>` | Specifies the Docker Model Runner model to use (e.g., `gpt-4o`). |
| `--test-script <script>` | A `package.json` script to run the full test suite after implementation. |
| `--dry-run` | Runs the process up to patch generation without applying or pushing. |
| `--mcp-profile <profile>` | Specifies the MCP profile to use for GitHub interactions. |

## ⚙️ Prerequisites

Before running, ensure you have:
1. Docker installed and running.
2. A configured Docker MCP environment capable of interacting with GitHub.
3. The necessary Git repository cloned locally.

## 📚 Documentation

For detailed information on the internal components (Git, Docker Worker, Model Runner), please refer to the respective module documentation.

---
*This README provides a high-level overview. For advanced workflows, please consult the CLI help output.*
