# `@regentlabs/cli`

`@regentlabs/cli` publishes the `regent` command-line tool. It bundles the local Regent runtime, wallet-aware Techtree flows, and the command surface used by operators to inspect, authenticate, and publish from a clean machine.

## Install

```bash
pnpm add -g @regentlabs/cli
regent --help
```

## Quick Start

```bash
regent create init
regent create wallet
regent techtree start
```

The guided `techtree start` flow checks local readiness, points at the configured backend, and walks through the first publish path.

## What Ships

- `regent` binary entrypoint
- bundled local runtime and daemon
- Techtree and Autolaunch command groups
- SIWA login, wallet, and config management

## Links

- Workspace repository: https://github.com/regent-ai/regent-cli
- Release runbook: https://github.com/regent-ai/regent-cli/blob/main/docs/release-runbook.md
- API contract workflow: https://github.com/regent-ai/regent-cli/blob/main/docs/api-contract-workflow.md
