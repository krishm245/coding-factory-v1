# coding-factory

Run a local-LLM coding factory against GitHub issues from any compatible Git repo.

## Install Without npm Registry

Use a GitHub commit SHA so installs are reproducible.

### Global install

```sh
npm install -g github:krishm245/coding-factory-v1#cf2d13047a8c9e64ed230e23458fb37865de4413
coding-factory issue 2 --model <model>
```

### One-shot execution

```sh
pnpm dlx github:krishm245/coding-factory-v1#cf2d13047a8c9e64ed230e23458fb37865de4413 issue 2 --model <model>
```

## Run From Any Repo

Run `coding-factory` from inside the target repository. The CLI uses the current working directory to discover the Git repository root and its `origin` remote.

The target repository must:

- be a Git worktree
- have a GitHub `origin` remote
- have a clean working tree

## Prerequisites

- Node.js `>=22`
- Docker available locally
- Docker MCP configured for GitHub access
- Docker Model Runner enabled and a model selected with `--model` or `CODING_FACTORY_MODEL`

## Examples

```sh
coding-factory issue 2 --model ai/your-model
```
