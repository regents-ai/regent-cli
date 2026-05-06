import { printJson } from "../printer.js";
import { getFlag, parseCliArgs, type ParsedCliArgs } from "../parse.js";
import {
  listAutolaunchIdentities,
  mintAutolaunchIdentity,
  type IdentityListResult as TechtreeIdentityListResult,
  type IdentityMintResult as TechtreeIdentityMintResult,
} from "./autolaunch/identities.js";

export type { TechtreeIdentityListResult, TechtreeIdentityMintResult };

const withTechtreeBaseMainnetChain = (args: ParsedCliArgs): ParsedCliArgs => {
  const chainId = getFlag(args, "chain-id");
  if (chainId && chainId !== "8453") {
    throw new Error("Techtree identities use Base mainnet. Use --chain base-mainnet.");
  }

  const chain = getFlag(args, "chain")?.toLowerCase();
  if (chain && chain !== "base" && chain !== "base-mainnet") {
    throw new Error("Techtree identities use Base mainnet. Use --chain base-mainnet.");
  }

  if (chain || chainId) {
    return args;
  }

  return parseCliArgs([...args.raw, "--chain", "base-mainnet"]);
};

export const listTechtreeIdentities = (args: ParsedCliArgs): Promise<TechtreeIdentityListResult> =>
  listAutolaunchIdentities(withTechtreeBaseMainnetChain(args));

export const mintTechtreeIdentity = (args: ParsedCliArgs): Promise<TechtreeIdentityMintResult> =>
  mintAutolaunchIdentity(withTechtreeBaseMainnetChain(args));

export async function runTechtreeIdentitiesList(args: ParsedCliArgs): Promise<void> {
  printJson(await listTechtreeIdentities(args));
}

export async function runTechtreeIdentitiesMint(args: ParsedCliArgs): Promise<void> {
  printJson(await mintTechtreeIdentity(args));
}
