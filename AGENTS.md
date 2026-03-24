This repository owns the standalone Regent CLI workspace.

## Core Rules

- Hard cutover only. Do not add backwards compatibility shims, migration glue, or dual paths unless explicitly requested.
- Regent CLI live transport flows are daemon-owned. Do not add direct CLI-to-Phoenix socket paths.
- If work changes code in `/Users/sean/Documents/regent/techtree`, `/Users/sean/Documents/regent/regent-cli`, or `/Users/sean/Documents/regent/contracts`, it is not done until validation has been run in all three repos. Run `mix precommit` in `techtree`, `pnpm build`, `pnpm typecheck`, and `pnpm test` in `regent-cli`, and `forge test --offline` from `/Users/sean/Documents/regent/contracts/techtree` for the Techtree contracts workspace.
- Prefer repository-local, versioned docs over off-repo context.

## Validation

```bash
cd /Users/sean/Documents/regent/regent-cli
pnpm build
pnpm typecheck
pnpm test
```
