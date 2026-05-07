#!/usr/bin/env node

if (process.env.npm_config_loglevel === "silent") {
  process.exit(0);
}

const alphaWarning =
  "Regents apps and the CLI are in ALPHA testing and funds are not guaranteed safe in any shape or form";
const orange = "\x1b[38;2;212;167;86m";
const reset = "\x1b[0m";
const colorAllowed =
  process.env.NO_COLOR === undefined &&
  process.env.npm_config_color !== "false" &&
  process.env.TERM !== "dumb";
const warningLine = colorAllowed
  ? `${orange}${alphaWarning}${reset}`
  : alphaWarning;

process.stdout.write(
  [
    "",
    "Regents CLI installed.",
    warningLine,
    "Install the Regents agent skills:",
    "  regents setup skills",
    "",
  ].join("\n"),
);
