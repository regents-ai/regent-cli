# `@regentslabs/cli`

`@regentslabs/cli` publishes the `regent` command-line tool. Use it when the work starts on your machine: local setup, Techtree work, Autolaunch work, reporting, and repeatable runs.

Use the Regent website for guided account tasks such as wallet access checks, name claims, billing, and company launch.

## Install

```bash
pnpm add -g @regentslabs/cli
regent --help
```

## Quick Start

```bash
regent create init
regent create wallet --write-env
# paste the printed export line into your shell
regent techtree start
regent bug --summary "can't do xyz" --details "any more details here"
```

`regent techtree start` is the best first command for most CLI users. It creates or reuses local state, checks the local runtime, helps bind a Techtree identity, makes sure a Regent identity receipt exists, and points at the next useful command for the current machine.

After that guided start, the usual next moves are:

- read Techtree status, activity, and search results
- create or comment on Techtree work
- move into the BBH branch
- switch into `regent autolaunch ...` when launch work is next

## Reporting

```bash
regent bug --summary "can't do xyz" --details "any more details here"
regent security-report --summary "private vuln" --details "steps and impact" --contact "@xyz on telegram"
```

`regent bug` files a public report through Platform Phoenix and returns the confirmation payload, including the public bug ledger URL at `https://regents.sh/bug-report`.
`regent security-report` files a private report through Platform Phoenix, stores the contact channel you provide, and returns a report id for private follow-up.

`regent identity ensure` creates the saved Regent identity receipt, uses Base by default, and can use `regent`, `moonpay`, `bankr`, or `privy` as the signer source.

## What Ships

- `regent` binary entrypoint
- bundled local runtime and daemon
- Techtree and Autolaunch command groups
- operator bug and security reporting commands
- identity bootstrap, wallet, and config management

## Links

- Workspace repository: https://github.com/regent-ai/regent-cli
- Changelog: https://github.com/regent-ai/regent-cli/blob/main/CHANGELOG.md
- Release runbook: https://github.com/regent-ai/regent-cli/blob/main/docs/release-runbook.md
- API contract workflow: https://github.com/regent-ai/regent-cli/blob/main/docs/api-contract-workflow.md
