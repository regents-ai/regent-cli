---
name: regents-autolaunch
description: Use Regents CLI for Autolaunch prelaunch setup, agent launch readiness, launch jobs, subject actions, auctions, and holdings.
---

# Regents Autolaunch

Use this skill when a person asks to prepare, validate, publish, launch, or operate an Autolaunch agent project.

## Safety

Do not submit wallet actions unless the person explicitly asks to submit. Prefer commands that prepare, validate, preview, list, or watch.

Do not read private project files unless the person names the exact folder or file to use.

## Start

```bash
regents auth login --audience autolaunch
regents identity ensure
regents autolaunch agents list --launchable
```

## Guided Launch Path

Prepare prelaunch data:

```bash
regents autolaunch prelaunch wizard
```

Validate:

```bash
regents autolaunch prelaunch validate --agent <agent-id>
```

Preview launch:

```bash
regents autolaunch launch preview --agent <agent-id>
```

Create launch:

```bash
regents autolaunch launch create --agent <agent-id>
```

Watch a job:

```bash
regents autolaunch jobs watch <job-id>
```

## Operations

- Subject details: `regents autolaunch subjects get --subject <address>`
- Auctions: `regents autolaunch auctions list`
- Holdings: `regents autolaunch holdings claim-usdc --subject <address>`
- Contracts: `regents autolaunch registry get`

Use `--json --no-input` when running from an automated agent.
