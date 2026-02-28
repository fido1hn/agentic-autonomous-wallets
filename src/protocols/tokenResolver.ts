import { PublicKey } from "@solana/web3.js";
import { ReasonCodes } from "../core/reasonCodes";
import { resolveSolanaCluster, type SolanaCluster } from "./solanaCluster";

const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const ORCA_DEVNET_USDC_MINT = "BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k";
const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

type TokenResolverProtocol = "auto" | "jupiter" | "raydium" | "orca";
export interface ResolveKnownTokenInput {
  symbolOrMint: string;
  protocol?: TokenResolverProtocol;
}

export interface ResolvedToken {
  symbol: string;
  mint: string;
  cluster: SolanaCluster;
}

export class TokenResolutionError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TokenResolutionError";
    this.code = code;
  }
}

function looksLikeMintAddress(value: string): boolean {
  try {
    void new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

export function resolveKnownToken(input: ResolveKnownTokenInput): ResolvedToken | null {
  const raw = input.symbolOrMint.trim();
  const cluster = resolveSolanaCluster();
  const protocol = (input as { protocol?: TokenResolverProtocol }).protocol ?? "auto";

  if (looksLikeMintAddress(raw)) {
    return {
      symbol: "CUSTOM",
      mint: raw,
      cluster
    };
  }

  const upper = raw.toUpperCase();
  if (upper === "SOL") {
    return {
      symbol: "SOL",
      mint: WRAPPED_SOL_MINT,
      cluster
    };
  }

  if (upper === "USDC") {
    if (cluster === "devnet") {
      return {
        symbol: "USDC",
        mint: protocol === "orca" || protocol === "auto" ? ORCA_DEVNET_USDC_MINT : DEVNET_USDC_MINT,
        cluster
      };
    }
    if (cluster === "mainnet-beta") {
      return {
        symbol: "USDC",
        mint: MAINNET_USDC_MINT,
        cluster
      };
    }
  }

  return null;
}

export function requireResolvedToken(input: ResolveKnownTokenInput): ResolvedToken {
  const resolved = resolveKnownToken(input);
  if (resolved) {
    return resolved;
  }

  throw new TokenResolutionError(
    ReasonCodes.tokenSymbolUnsupported,
    "Only USDC is supported by symbol in this build. Provide a mint address for other tokens."
  );
}
