import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  setTransactionMessageLifetimeUsingBlockhash,
  setTransactionMessageFeePayerSigner
} from "@solana/kit";
import {
  fetchSplashPool,
  setNativeMintWrappingStrategy,
  setWhirlpoolsConfig,
  swapInstructions
} from "@orca-so/whirlpools";
import { Connection } from "@solana/web3.js";
import { ReasonCodes } from "../core/reasonCodes";
import type { ExecutionIntent } from "../types/intents";
import { resolveSolanaCluster } from "./solanaCluster";

function resolveSolanaRpc(): string {
  const rpc = process.env.SOLANA_RPC?.trim();
  if (!rpc) {
    throw new Error(`${ReasonCodes.solanaRpcReadFailed}: missing SOLANA_RPC`);
  }
  return rpc;
}

let createConnection = (): Connection => new Connection(resolveSolanaRpc(), "confirmed");

let orcaDeps = {
  createRpc: (rpcUrl: string) => createSolanaRpc(rpcUrl),
  createNoopSigner,
  setWhirlpoolsConfig,
  setNativeMintWrappingStrategy,
  fetchSplashPool,
  swapInstructions
};

function requireAddress(value: string | undefined, code: string): string {
  if (!value) {
    throw new Error(code);
  }
  return value;
}

function resolveOrcaConfigKey(): "solanaDevnet" | "solanaMainnet" {
  const cluster = resolveSolanaCluster();
  if (cluster === "devnet") {
    return "solanaDevnet";
  }
  if (cluster === "mainnet-beta" || cluster === "unknown") {
    return "solanaMainnet";
  }
  throw new Error(`${ReasonCodes.orcaBuildFailed}: Orca swaps are not supported on ${cluster}.`);
}

export async function buildOrcaSwap(intent: ExecutionIntent): Promise<string> {
  const walletAddress = requireAddress(intent.walletAddress, ReasonCodes.walletAddressUnavailable);
  const inputMint = requireAddress(intent.fromMint, ReasonCodes.policySwapMintRequired);
  const outputMint = requireAddress(intent.toMint, ReasonCodes.policySwapMintRequired);

  try {
    await orcaDeps.setWhirlpoolsConfig(resolveOrcaConfigKey());
    orcaDeps.setNativeMintWrappingStrategy("ata");

    const rpc = orcaDeps.createRpc(resolveSolanaRpc());
    const signer = orcaDeps.createNoopSigner(address(walletAddress));
    const pool = await orcaDeps.fetchSplashPool(rpc as never, address(inputMint), address(outputMint));

    if (!pool.initialized) {
      throw new Error(`${ReasonCodes.orcaPoolUnavailable}: No initialized Orca splash pool found for this pair.`);
    }

    const swapPlan = await orcaDeps.swapInstructions(
      rpc as never,
      {
        mint: address(inputMint),
        inputAmount: BigInt(intent.amountAtomic)
      },
      pool.address,
      intent.maxSlippageBps ?? 100,
      signer as never
    );

    if (!swapPlan.instructions || swapPlan.instructions.length === 0) {
      throw new Error(`${ReasonCodes.orcaBuildFailed}: missing Orca instruction payload`);
    }

    const latestBlockhash = await createConnection().getLatestBlockhash("confirmed");
    const message = setTransactionMessageLifetimeUsingBlockhash(
      {
        blockhash: latestBlockhash.blockhash as never,
        lastValidBlockHeight: BigInt(latestBlockhash.lastValidBlockHeight)
      },
      appendTransactionMessageInstructions(
        swapPlan.instructions,
        setTransactionMessageFeePayerSigner(signer, createTransactionMessage({ version: "legacy" }))
      )
    );

    const transaction = compileTransaction(message);
    return getBase64EncodedWireTransaction(transaction);
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message.startsWith(`${ReasonCodes.orcaPoolUnavailable}:`) ||
        error.message.startsWith(`${ReasonCodes.orcaBuildFailed}:`) ||
        error.message === ReasonCodes.walletAddressUnavailable ||
        error.message === ReasonCodes.policySwapMintRequired
      ) {
        throw error;
      }
      throw new Error(`${ReasonCodes.orcaBuildFailed}: ${error.message}`);
    }
    throw new Error(`${ReasonCodes.orcaBuildFailed}: failed to build Orca swap`);
  }
}

export function setOrcaDependenciesForTests(
  overrides:
    | Partial<{
        createRpc: typeof orcaDeps.createRpc;
        createNoopSigner: typeof orcaDeps.createNoopSigner;
        setWhirlpoolsConfig: typeof orcaDeps.setWhirlpoolsConfig;
        setNativeMintWrappingStrategy: typeof orcaDeps.setNativeMintWrappingStrategy;
        fetchSplashPool: typeof orcaDeps.fetchSplashPool;
        swapInstructions: typeof orcaDeps.swapInstructions;
        createConnection: typeof createConnection;
      }>
    | null
): void {
  if (!overrides) {
    orcaDeps = {
      createRpc: (rpcUrl: string) => createSolanaRpc(rpcUrl),
      createNoopSigner,
      setWhirlpoolsConfig,
      setNativeMintWrappingStrategy,
      fetchSplashPool,
      swapInstructions
    };
    createConnection = (): Connection => new Connection(resolveSolanaRpc(), "confirmed");
    return;
  }

  orcaDeps = {
    ...orcaDeps,
    ...overrides
  };
  if (overrides.createConnection) {
    createConnection = overrides.createConnection;
  }
}
