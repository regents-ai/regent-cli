import {
  runAgentHarnessList,
  runAgentInit,
  runAgentProfileList,
  runAgentProfileGet,
  runAgentStatus,
} from "../commands/agent.js";
import { runAgentContext } from "../commands/agent-context.js";
import { runConfigGet, runConfigWrite } from "../commands/config.js";
import { runCreateInit, runCreateWallet } from "../commands/create.js";
import { runDoctorCommand, runDoctorContractsCommand, runDoctorWorkspaceCommand } from "../commands/doctor.js";
import { runGossipsubStatus } from "../commands/gossipsub.js";
import { runMcpExportHermes } from "../commands/mcp.js";
import {
  runOperatorBalance,
  runOperatorInit,
  runOperatorSearch,
  runOperatorStatus,
  runOperatorWhoami,
} from "../commands/operator.js";
import { runRuntime } from "../commands/run.js";
import { runSetupSkills } from "../commands/setup-skills.js";
import { route, type CliRoute } from "./shared.js";

export const coreRoutes: readonly CliRoute[] = [
  route("init", async ({ parsedArgs, configPath }) => runOperatorInit(parsedArgs, configPath)),
  route("status", async ({ parsedArgs, configPath }) => runOperatorStatus(parsedArgs, configPath)),
  route("whoami", async ({ parsedArgs, configPath }) => runOperatorWhoami(parsedArgs, configPath)),
  route("balance", async ({ parsedArgs, configPath }) => runOperatorBalance(parsedArgs, configPath)),
  route("agent-context", async ({ configPath }) => {
    await runAgentContext(configPath);
    return 0;
  }),
  route("setup skills", async ({ parsedArgs }) => {
    await runSetupSkills(parsedArgs);
    return 0;
  }),
  route("search", async ({ parsedArgs, configPath }) => runOperatorSearch(parsedArgs, configPath), { variadicTail: true }),
  route("run", async ({ parsedArgs, configPath }) => {
    await runRuntime(parsedArgs, configPath);
    return 0;
  }),
  route("create init", async ({ parsedArgs }) => {
    await runCreateInit(parsedArgs);
    return 0;
  }),
  route("create wallet", async ({ parsedArgs }) => {
    await runCreateWallet(parsedArgs);
    return 0;
  }),
  route("config get", async ({ parsedArgs }) => {
    await runConfigGet(parsedArgs);
    return 0;
  }),
  route("config write", async ({ parsedArgs }) => {
    await runConfigWrite(parsedArgs);
    return 0;
  }),
  route("doctor runtime", async ({ parsedArgs, configPath }) => runDoctorCommand(parsedArgs, configPath)),
  route("doctor auth", async ({ parsedArgs, configPath }) => runDoctorCommand(parsedArgs, configPath)),
  route("doctor techtree", async ({ parsedArgs, configPath }) => runDoctorCommand(parsedArgs, configPath)),
  route("doctor transports", async ({ parsedArgs, configPath }) => runDoctorCommand(parsedArgs, configPath)),
  route("doctor xmtp", async ({ parsedArgs, configPath }) => runDoctorCommand(parsedArgs, configPath)),
  route("doctor contracts", async ({ parsedArgs, configPath }) => runDoctorContractsCommand(parsedArgs, configPath)),
  route("doctor workspace", async ({ parsedArgs, configPath }) => runDoctorWorkspaceCommand(parsedArgs, configPath)),
  route("doctor", async ({ parsedArgs, configPath }) => runDoctorCommand(parsedArgs, configPath), { variadicTail: true }),
  route("mcp export hermes", async ({ parsedArgs }) => {
    await runMcpExportHermes(parsedArgs);
    return 0;
  }),
  route("agent init", async ({ configPath }) => {
    await runAgentInit(configPath);
    return 0;
  }),
  route("agent status", async ({ configPath }) => {
    await runAgentStatus(configPath);
    return 0;
  }),
  route("agent profile list", async ({ configPath }) => {
    await runAgentProfileList(configPath);
    return 0;
  }),
  route("agent profile get", async ({ parsedArgs, configPath }) => {
    await runAgentProfileGet(parsedArgs, configPath);
    return 0;
  }),
  route("agent harness list", async ({ configPath }) => {
    await runAgentHarnessList(configPath);
    return 0;
  }),
  route("gossipsub status", async ({ configPath }) => {
    await runGossipsubStatus(configPath);
    return 0;
  }),
];
