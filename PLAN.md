# Coding Factory V1 Plan

## Summary

Build a TypeScript CLI that runs from inside a target GitHub repo checkout:

```bash
coding-factory issue 123
```

The CLI will fetch GitHub issue `#123` through Docker MCP's GitHub server, generate a markdown requirement document, create an issue branch, run an isolated Docker worker container with the repo mounted, use Docker Model Runner through its OpenAI-compatible local API, implement the requested change, run the repo's full test suite, then open a pull request through GitHub MCP.

This plan assumes Docker Model Runner's OpenAI-compatible endpoint, per Docker docs, and Docker MCP Toolkit/Gateway with a configured GitHub MCP profile.

References:

- Docker Model Runner API: https://docs.docker.com/ai/model-runner/api-reference/
- Docker Model Runner overview: https://docs.docker.com/ai/model-runner/
- Docker MCP Toolkit: https://docs.docker.com/ai/mcp-catalog-and-toolkit/

## TODO

- [x] Scaffold the TypeScript CLI project with package metadata, build scripts, linting, and a `coding-factory` executable.
- [x] Add the `coding-factory issue <issue-number>` command with `--model`, `--test-script`, and `--dry-run` options.
- [skip] Implement configuration loading from an optional config file, environment variables, and CLI flags with clear precedence.
- [x] Add git repo validation, current branch detection, clean-working-tree checks, and GitHub remote parsing.
- [x] Integrate Docker MCP GitHub issue fetching for issue title, body, comments, labels, and repository metadata.
- [x] Generate `requirements/issue-<number>.md` from GitHub issue data using the local LLM.
- [x] Create and checkout `coding-factory/issue-<number>` branches from the current base branch.
- [x] Build the isolated Docker worker image used to operate on the mounted target repo.
- [x] Start the worker container with the repo mounted at `/workspace` and no broad host filesystem access.
- [x] Add a Docker Model Runner client using the OpenAI-compatible endpoint.
- [x] Implement the worker-side repo inspection and implementation loop driven by the generated requirement document.
- [ ] Add package manager detection and dependency installation inside the worker container.
- [ ] Implement full-suite test script selection with `--test-script`, `test:all`, then `test` fallback.
- [ ] Gate PR creation on the selected full test suite passing.
- [x] Generate deterministic commit messages and interim PR body content.
- [x] Commit successful changes on the issue branch.
- [x] Push the issue branch to the GitHub remote.
- [x] Open a pull request through Docker MCP GitHub tools.
- [ ] Add failure handling for missing test scripts, failed tests, model errors, Docker errors, MCP errors, and dirty git state.
- [ ] Add resumability so rerunning the same issue can continue from an existing requirement doc or issue branch.
- [ ] Add unit tests for CLI parsing, config loading, git detection, branch naming, requirement generation, test script selection, and PR body generation.
- [ ] Add integration tests with mocked Docker Model Runner and Docker MCP GitHub interactions.
- [ ] Add an end-to-end smoke test using a fixture repo and a test GitHub repository.

## Key Changes

- Create a TypeScript CLI package with a command shape like:

  ```bash
  coding-factory issue <issue-number> [--model <model>] [--test-script <script>] [--dry-run]
  ```

- The host CLI owns orchestration:
  - Validate current directory is a git repo with a GitHub remote.
  - Fetch issue title, body, comments, and labels via Docker MCP GitHub tools.
  - Create `coding-factory/issue-<number>` branch from the current base branch.
  - Write `requirements/issue-<number>.md`.
  - Start a worker container with the repo mounted at `/workspace`.
  - Call Docker Model Runner at the OpenAI-compatible base URL, defaulting to `http://localhost:12434/engines/v1`.
  - Run tests.
  - Commit changes.
  - Push branch.
  - Open PR through Docker MCP GitHub tools.

- Keep the repo isolated from the broader host environment:
  - The worker container receives only the mounted repo, selected environment variables, package manager cache mounts if configured, and access to the Docker Model Runner endpoint.
  - No host home directory mount by default.
  - No arbitrary host filesystem access.
  - GitHub credentials stay inside Docker MCP/Gateway configuration, not inside the worker container.

- Use a deterministic orchestrator plus local LLM generation:
  - The CLI controls lifecycle, git state, container execution, test gates, commits, and PR creation.
  - The LLM generates the requirement doc, implementation plan, code edits, commit summary, and PR body.
  - The LLM does not directly open PRs or mutate GitHub state.

## Workflow

1. `coding-factory issue 123` starts in the target repo checkout.
2. Fetch issue data through Docker MCP GitHub server.
3. Generate `requirements/issue-123.md` containing:
   - Issue metadata.
   - User-facing requirement summary.
   - Acceptance criteria.
   - Implementation notes inferred from the repo.
   - Test expectations.
   - Out-of-scope items.
4. Create and checkout branch:

   ```bash
   coding-factory/issue-123
   ```

5. Start the worker container:
   - Mount current repo to `/workspace`.
   - Set working directory to `/workspace`.
   - Provide model endpoint config.
   - Install dependencies only using the repo's normal package manager commands.
6. Agent loop inside the worker:
   - Inspect repo structure.
   - Build a short implementation plan.
   - Apply code changes.
   - Run formatting only if the repo already defines a formatting command.
   - Run the full test suite.
7. Test command policy:
   - If `--test-script` is provided, run that package script.
   - Otherwise inspect `package.json`.
   - Prefer `test:all` if present.
   - Fall back to `test`.
   - If no package test script exists, stop before PR creation and report the missing test command.
8. PR policy:
   - Open a PR only when the configured full test suite passes.
   - If tests fail, leave the branch and requirement doc in place, summarize failures, and do not open the PR.
9. PR body includes:
   - Linked issue.
   - Requirement summary.
   - Implementation summary.
   - Test command and result.
   - Any known limitations.

## Interfaces

Optional CLI config file:

```json
{
  "model": "ai/model-name",
  "modelBaseUrl": "http://localhost:12434/engines/v1",
  "testScript": "test:all",
  "workerImage": "coding-factory-worker:latest",
  "githubMcpProfile": "github"
}
```

Environment variables:

```bash
CODING_FACTORY_MODEL
CODING_FACTORY_MODEL_BASE_URL
CODING_FACTORY_TEST_SCRIPT
CODING_FACTORY_WORKER_IMAGE
CODING_FACTORY_MCP_PROFILE
```

Requirement docs live under:

```text
requirements/issue-<number>.md
```

Branches use:

```text
coding-factory/issue-<number>
```

## Test Plan

- Unit tests:
  - CLI argument parsing.
  - Git remote and repo detection.
  - Issue-to-requirement markdown generation.
  - Test script selection from `package.json`.
  - Branch name generation.
  - PR body generation.

- Integration tests with mocked services:
  - Mock Docker Model Runner responses.
  - Mock MCP GitHub issue fetch and PR creation.
  - Verify the CLI stops if tests fail.
  - Verify the CLI does not open a PR without a passing full test suite.

- End-to-end local smoke test:
  - Use a small fixture repo with `package.json`.
  - Run `coding-factory issue <n>` against a test GitHub repo.
  - Confirm requirement doc, branch, commit, pushed branch, and PR are created.

## Assumptions

- V1 is TypeScript.
- The CLI is run on the host from inside the target repo checkout.
- The target repo is mounted into a Docker worker container for isolated code execution.
- The worker writes directly to the checked-out issue branch.
- GitHub issue reads and PR creation go through Docker MCP Toolkit/Gateway with a configured GitHub MCP server.
- Docker Model Runner is enabled and reachable through its OpenAI-compatible endpoint.
- V1 supports repos with `package.json` and a full-suite test script, preferably `test:all` or `test`.
- PR creation is gated on the full test suite passing.

# Azure + SharePoint + Copilot Studio Secure Internal Assistant

## Summary

Build a Microsoft Entra-authenticated internal web app in Azure that lets approved employees
browse one approved SharePoint site/library live and chat with an embedded Copilot Studio agent
about files they are allowed to access. The site uses Entra ID as the primary gate, an app-
specific Entra security group as a second gate, Conditional Access for org-only policy
enforcement, and Microsoft Graph delegated access on behalf of the signed-in user so SharePoint
remains the source of truth for authorization.

## Implementation Changes

- Identity and access
  - Require Microsoft Entra sign-in for the website.
  - Restrict app entry to a dedicated Entra security group; block guests and external
    identities.
  - Enforce Conditional Access for MFA, managed/compliant device requirements, and org
    session controls.
  - Keep the app internet-reachable; do not rely on IP allowlists as the primary control.
- Azure hosting
  - Host the web app and backend API on a managed Azure web app/API tier.
  - Store secrets and app configuration in Azure Key Vault and app settings.
  - Put source-drive configuration behind a platform-admin-only control path; no self-service
    source registration in v1.
- File discovery
  - The UI performs live browse/search against one approved SharePoint site/library only.
  - The backend calls Microsoft Graph using the OAuth on-behalf-of flow with the user’s
    identity.
  - Show metadata and deep links to SharePoint/Office; do not preview or download files
    through the app in v1.
- Agent architecture
  - Use Copilot Studio, embedded in the website, with SSO from the signed-in site session.
  - Configure Copilot Studio manual authentication with Microsoft Entra ID for the agent,
    plus a separate canvas app registration for website SSO.
  - Implement the agent’s knowledge retrieval through a custom knowledge source using
    OnKnowledgeRequested, backed by your API.
  - The API executes live search/retrieval over the approved SharePoint scope with the user’s
    delegated token and returns only trimmed, citation-ready results.
  - Do not use a persistent external content index in v1. Fetch metadata/content transiently
    per request.
- Answer and data guardrails
  - Agent answers must be grounded and citation-based only; if evidence is missing, the agent
    refuses to answer.
  - Allow the agent to search any file the user can access within the one configured drive/
    library.
  - Retain only short-lived chat session context by default; no long-term document corpus or
    persistent chat history in v1.
  - Minimize sensitive logging of raw file content.

## Public Interfaces / Key Contracts

- Web app auth contract
  - Signed-in employee session with Entra ID token for the site.
  - App access group membership required before rendering file/chat surfaces.
- Backend API contract
  - File browse/search endpoints accept only authenticated site users and resolve Graph
    access via OBO.
  - Chat retrieval endpoint returns normalized search results for Copilot Studio with title,
    URL, snippet, and source identifiers suitable for citations.
- Copilot Studio integration contract
  - Agent uses Entra manual auth plus website SSO.
  - Agent knowledge calls the custom search endpoint rather than owning direct unrestricted
    SharePoint access.

- Employee in app access group can sign in, browse only authorized files, and open files in
  SharePoint.
- Employee outside the app access group is blocked before seeing app content.
- Guest/external account is denied.
- User with access to only a subset of the SharePoint library never sees unauthorized files in
  browse, search, or agent citations.
- Permission revocation in SharePoint is reflected immediately in the app and agent results.
- Agent answers include citations to accessible files only and refuses unsupported questions.
- Copilot Studio SSO works from the embedded website without separate login prompts.
- Admin-only source configuration path rejects non-admin users.
- Logs capture sign-in, denied access, file-result events, cited-document identifiers, and
  admin changes without storing unnecessary document bodies.

## Assumptions and Defaults

- V1 scope is one specific SharePoint site/library, not org-wide discovery.
- Production design uses GA building blocks only; no preview feature is required for the core
  path.
- If you already have a Copilot Studio agent created before March 18, 2026, do not assume it
  uses current Entra agent identity behavior; recreate it if governance validation shows it is
  still on a legacy service principal.
- Although lighter telemetry was discussed, this plan assumes audit-grade access and
  configuration logging because weaker telemetry is not compatible with the stated security
  requirement.
