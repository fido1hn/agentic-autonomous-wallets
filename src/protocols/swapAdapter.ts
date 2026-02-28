import { ReasonCodes } from "../core/reasonCodes";
import type { ExecutionIntent, SerializedTransaction } from "../types/intents";
import { buildJupiterSwap } from "./jupiterAdapter";
import { buildOrcaSwap } from "./orcaAdapter";
import { buildRaydiumSwap } from "./raydiumAdapter";
import { resolveSolanaCluster } from "./solanaCluster";

export function resolveSwapProtocol(intent: ExecutionIntent): "jupiter" | "raydium" | "orca" {
  if (intent.swapProtocol === "jupiter" || intent.swapProtocol === "raydium" || intent.swapProtocol === "orca") {
    return intent.swapProtocol;
  }

  const cluster = resolveSolanaCluster();
  if (cluster === "devnet" || cluster === "mainnet-beta" || cluster === "unknown") {
    return "orca";
  }
  if (cluster === "testnet") {
    return "raydium";
  }
  return "orca";
}

export async function buildSwapTransaction(intent: ExecutionIntent): Promise<SerializedTransaction> {
  const protocol = resolveSwapProtocol(intent);

  if (protocol === "jupiter") {
    return buildJupiterSwap(intent);
  }

  if (protocol === "orca") {
    return buildOrcaSwap(intent);
  }

  if (protocol === "raydium") {
    return buildRaydiumSwap(intent);
  }

  throw new Error(ReasonCodes.swapProtocolUnavailable);
}
