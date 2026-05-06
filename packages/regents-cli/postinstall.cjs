#!/usr/bin/env node

if (process.env.npm_config_loglevel === "silent") {
  process.exit(0);
}

process.stdout.write(
  [
    "",
    "Regents CLI installed.",
    "Install the Regents agent skills:",
    "  regents setup skills",
    "",
  ].join("\n"),
);
