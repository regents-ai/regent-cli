import fs from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { loadYaml } from "./dependency-preflight.mjs";
import {
  cliCommandContractFiles,
  readWorkspaceManifest,
} from "../packages/regents-cli/src/workspace/manifest.js";

const root = resolve(import.meta.dirname, "..");
const YAML = await loadYaml(root);
const outputPath = resolve(root, "packages/regents-cli/src/generated/cli-command-metadata.ts");
const commandListPath = resolve(root, "docs/regents-cli-command-list.md");
const manifest = readWorkspaceManifest(root, YAML);
const cliContractFiles = cliCommandContractFiles(manifest, root);

const currentAvailabilityValues = new Set(["current", "beta_disabled"]);
const platformPublicCommand = (command) =>
  command.startsWith("platform ") ||
  command.startsWith("runtime ") ||
  command.startsWith("agentbook ") ||
  command.startsWith("work ") ||
  command === "agent connect hermes" ||
  command === "agent connect openclaw" ||
  command === "agent link" ||
  command === "agent execution-pool" ||
  command === "bug" ||
  command === "security-report" ||
  command.startsWith("regent-staking ");

const parseYaml = (file) => YAML.parse(fs.readFileSync(file, "utf8"));
const normalizeCommandName = (command) => command.replace(/^regents?\s+/u, "");
const topLevelGroup = (command) => command.split(" ")[0];
const commandKey = (command) => command.replace(/^regents?\s+/u, "").replace(/[<>\s-]+/gu, "_");
const compactObject = (value) => {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(compactObject);
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, compactObject(entryValue)]),
  );
};

const metadataWithoutExamples = (metadata) => {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }

  const { examples: _examples, ...rest } = metadata;
  return compactObject(rest);
};

const commandSpecificMapValue = (map, normalizedCommand) => {
  if (!map || typeof map !== "object") {
    return undefined;
  }

  return (
    map[normalizedCommand] ??
    map[`regents ${normalizedCommand}`] ??
    map[commandKey(normalizedCommand)] ??
    map[normalizedCommand.split(" ").at(-1)]
  );
};

const readGroupArgs = (group, normalizedCommand) =>
  commandSpecificMapValue(group.command_args, normalizedCommand) ??
  commandSpecificMapValue(group.args, normalizedCommand);

const readGroupFlags = (group, normalizedCommand) =>
  commandSpecificMapValue(group.command_flags, normalizedCommand) ??
  commandSpecificMapValue(group.flags, normalizedCommand);

const readAgentMetadata = (agentMetadata, normalizedCommand) => {
  if (!agentMetadata || typeof agentMetadata !== "object") {
    return undefined;
  }

  const commandOverrides = commandSpecificMapValue(agentMetadata.commands, normalizedCommand);
  if (!commandOverrides) {
    return compactObject(agentMetadata);
  }

  const { commands: _commands, ...defaults } = agentMetadata;
  return compactObject({ ...defaults, ...commandOverrides });
};

const readContractGroups = (owner, contract) => {
  if (Array.isArray(contract.commands)) {
    const byGroup = new Map();
    const ownerAgentDefaults = contract["x-regent-agent-defaults"];

    for (const command of contract.commands) {
      if (!command || typeof command !== "object" || typeof command.name !== "string") {
        continue;
      }

      const normalizedCommand = normalizeCommandName(command.name);
      const availability = typeof command.availability === "string" ? command.availability : "current";
      if (owner === "platform" && (!platformPublicCommand(normalizedCommand) || !currentAvailabilityValues.has(availability))) {
        continue;
      }

      const groupName = topLevelGroup(normalizedCommand);
      const group = byGroup.get(groupName) ?? { owner, name: groupName, commands: [], commandDetails: [] };
      group.commands.push(normalizedCommand);
      group.commandDetails.push(
        compactObject({
          command: normalizedCommand,
          owner,
          group: groupName,
          interface: command.transport?.kind,
          auth_mode: command.auth?.mode,
          auth_audience: command.auth?.audience,
          output_envelope: command.output?.format,
          operation_ids: command.transport?.operationIds,
          args: command.args,
          flags: command.flags,
          examples: command.examples ?? command.agent_metadata?.examples ?? ownerAgentDefaults?.examples,
          agent_metadata: metadataWithoutExamples(command.agent_metadata ?? ownerAgentDefaults),
          summary: command.summary,
          usage: command.usage,
          next_step: command.next_step,
        }),
      );
      byGroup.set(groupName, group);
    }

    return Array.from(byGroup.values());
  }

  return (contract.command_groups ?? []).map((group) => ({
    owner,
    name: typeof group.name === "string" ? group.name : owner,
    commands: (group.commands ?? []).map(normalizeCommandName),
    commandDetails: (group.commands ?? []).map((command) => {
      const normalizedCommand = normalizeCommandName(command);
      const agentMetadata = readAgentMetadata(group.agent_metadata, normalizedCommand);
      const help = group.help ?? {};

      return compactObject({
        command: normalizedCommand,
        owner,
        group: typeof group.name === "string" ? group.name : owner,
        interface: group.interface,
        auth_mode: group.auth_mode,
        auth_audience: group.auth_audience,
        output_envelope: group.output_envelope,
        args: readGroupArgs(group, normalizedCommand),
        flags: readGroupFlags(group, normalizedCommand),
        examples: agentMetadata?.examples ?? group.examples,
        agent_metadata: metadataWithoutExamples(agentMetadata),
        summary: help.summary ?? group.summary,
        usage: help.usage ?? group.usage,
        next_step: help.next_step ?? group.next_step,
      });
    }),
  }));
};

export const buildCliCommandMetadata = () => {
  const groups = Object.entries(cliContractFiles).flatMap(([owner, file]) =>
    readContractGroups(owner, parseYaml(file)),
  );
  const commands = Array.from(new Set(groups.flatMap((group) => group.commands))).sort();
  const topLevelGroups = Array.from(new Set(commands.map(topLevelGroup))).sort();
  const commandsByTopLevelGroup = Object.fromEntries(
    topLevelGroups.map((groupName) => [
      groupName,
      commands.filter((command) => command === groupName || command.startsWith(`${groupName} `)),
    ]),
  );
  const commandDetails = groups.flatMap((group) => group.commandDetails ?? []).sort((left, right) =>
    left.command.localeCompare(right.command),
  );
  const commandDetailsByCommand = Object.fromEntries(
    commandDetails.map((detail) => [detail.command, detail]),
  );

  return { commands, commandsByTopLevelGroup, commandDetails, commandDetailsByCommand };
};

const generatedHeader = [
  "// Generated by scripts/generate-cli-command-metadata.mjs.",
  "// Source: CLI contract YAML files.",
  "",
];

export const renderCliCommandMetadata = () => {
  const metadata = buildCliCommandMetadata();
  return [
    ...generatedHeader,
    `export const CLI_COMMANDS = ${JSON.stringify(metadata.commands, null, 2)} as const;`,
    "",
    `export const CLI_COMMANDS_BY_TOP_LEVEL_GROUP = ${JSON.stringify(
      metadata.commandsByTopLevelGroup,
      null,
      2,
    )} as const;`,
    "",
    `export const CLI_COMMAND_DETAILS_BY_COMMAND = ${JSON.stringify(
      metadata.commandDetailsByCommand,
      null,
      2,
    )} as const;`,
    "",
  ].join("\n");
};

const titleCaseGroup = (groupName) =>
  groupName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const renderCliCommandList = () => {
  const metadata = buildCliCommandMetadata();
  return [
    "# Regents CLI Command List",
    "",
    "This file lists the full command surface shipped by the standalone Regents CLI in this repo.",
    "",
    "Source used: CLI contract YAML files via `scripts/generate-cli-command-metadata.mjs`.",
    "",
    `Total commands: ${metadata.commands.length}.`,
    "",
    "## Full Command List",
    "",
    ...Object.entries(metadata.commandsByTopLevelGroup).flatMap(([groupName, commands]) => [
      `### ${titleCaseGroup(groupName)}`,
      "",
      ...commands.map((command) => {
        const detail = metadata.commandDetailsByCommand[command];
        return detail?.summary
          ? `- \`regents ${command}\` - ${detail.summary}`
          : `- \`regents ${command}\``;
      }),
      "",
    ]),
  ].join("\n");
};

export const checkCliCommandMetadata = () => {
  const expected = renderCliCommandMetadata();
  const actual = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  const expectedCommandList = renderCliCommandList();
  const actualCommandList = fs.existsSync(commandListPath)
    ? fs.readFileSync(commandListPath, "utf8")
    : "";
  return {
    ok: actual === expected && actualCommandList === expectedCommandList,
    metadataOk: actual === expected,
    commandListOk: actualCommandList === expectedCommandList,
    expected,
    actual,
    expectedCommandList,
    actualCommandList,
    outputPath,
    commandListPath,
  };
};

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const checkOnly = process.argv.includes("--check");
  const result = checkCliCommandMetadata();

  if (checkOnly) {
    if (!result.ok) {
      if (!result.metadataOk) {
        console.error(`Generated CLI command metadata is out of date: ${outputPath}`);
      }
      if (!result.commandListOk) {
        console.error(`Generated CLI command list is out of date: ${commandListPath}`);
      }
      console.error("Run pnpm generate:cli-command-metadata.");
      process.exitCode = 1;
    }
  } else {
    fs.writeFileSync(outputPath, result.expected);
    fs.writeFileSync(commandListPath, result.expectedCommandList);
  }
}
