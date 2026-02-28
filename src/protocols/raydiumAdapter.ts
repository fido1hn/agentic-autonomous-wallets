import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { ReasonCodes } from "../core/reasonCodes";
import type { ExecutionIntent, SerializedTransaction } from "../types/intents";

const SOL_MINT = "So11111111111111111111111111111111111111112";

function resolveSolanaRpc(): string {
  const rpc = process.env.SOLANA_RPC?.trim();
  if (!rpc) {
    throw new Error(`${ReasonCodes.solanaRpcReadFailed}: missing SOLANA_RPC`);
  }
  return rpc;
}

let createSolanaConnection = (): Connection => new Connection(resolveSolanaRpc(), "confirmed");

function requireAddress(value: string | undefined, code: string): string {
  if (!value) {
    throw new Error(code);
  }
  return value;
}

function isSolMint(mint: string): boolean {
  return mint === SOL_MINT;
}

function getAta(owner: string, mint: string): string {
  return getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(owner), false, TOKEN_PROGRAM_ID).toBase58();
}

async function buildCreateAtaTransaction(ownerAddress: string, mintAddress: string): Promise<string> {
  const connection = createSolanaConnection();
  const owner = new PublicKey(ownerAddress);
  const mint = new PublicKey(mintAddress);
  const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const { blockhash } = await connection.getLatestBlockhash("confirmed");

  const transaction = new Transaction({
    feePayer: owner,
    recentBlockhash: blockhash
  }).add(
    createAssociatedTokenAccountInstruction(
      owner,
      ata,
      owner,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );

  return Buffer.from(
    transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    })
  ).toString("base64");
}

export async function buildRaydiumSwap(intent: ExecutionIntent): Promise<SerializedTransaction> {
  const walletAddress = requireAddress(intent.walletAddress, ReasonCodes.walletAddressUnavailable);
  const inputMint = requireAddress(intent.fromMint, ReasonCodes.policySwapMintRequired);
  const outputMint = requireAddress(intent.toMint, ReasonCodes.policySwapMintRequired);

  const connection = createSolanaConnection();
  const outputAccount = isSolMint(outputMint) ? undefined : getAta(walletAddress, outputMint);
  const prependTransactions: string[] = [];
  if (outputAccount) {
    const outputAccountInfo = await connection.getAccountInfo(new PublicKey(outputAccount), "confirmed");
    if (!outputAccountInfo) {
      prependTransactions.push(await buildCreateAtaTransaction(walletAddress, outputMint));
    }
  }

  const quoteUrl = process.env.RAYDIUM_SWAP_QUOTE_URL ?? "https://transaction-v1.raydium.io/compute/swap-base-in";
  const buildUrl = process.env.RAYDIUM_SWAP_BUILD_URL ?? "https://transaction-v1.raydium.io/transaction/swap-base-in";
  const txVersion = process.env.RAYDIUM_TX_VERSION ?? "LEGACY";
  const computeUnitPriceMicroLamports = process.env.RAYDIUM_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS ?? "0";

  const quoteParams = new URLSearchParams({
    inputMint,
    outputMint,
    amount: intent.amountAtomic,
    slippageBps: String(intent.maxSlippageBps ?? 100),
    txVersion
  });

  const quoteResponse = await fetch(`${quoteUrl}?${quoteParams.toString()}`);
  if (!quoteResponse.ok) {
    throw new Error(`${ReasonCodes.raydiumQuoteFailed}: status ${quoteResponse.status}`);
  }

  const quote = (await quoteResponse.json()) as Record<string, unknown>;

  const buildResponse = await fetch(buildUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      txVersion,
      wallet: walletAddress,
      swapResponse: quote,
      computeUnitPriceMicroLamports,
      wrapSol: isSolMint(inputMint),
      unwrapSol: isSolMint(outputMint),
      inputAccount: isSolMint(inputMint) ? undefined : getAta(walletAddress, inputMint),
      outputAccount
    })
  });

  if (!buildResponse.ok) {
    throw new Error(`${ReasonCodes.raydiumBuildFailed}: status ${buildResponse.status}`);
  }

  const built = (await buildResponse.json()) as {
    data?: Array<{ transaction?: string }>;
  };

  const transactions = built.data
    ?.map((item) => item.transaction)
    .filter((item): item is string => typeof item === "string" && item.length > 0);

  if (!transactions || transactions.length === 0) {
    throw new Error(`${ReasonCodes.raydiumBuildFailed}: missing transaction payload`);
  }

  return [...prependTransactions, ...transactions];
}

export function setRaydiumConnectionFactoryForTests(fn: (() => Connection) | null): void {
  createSolanaConnection = fn ?? (() => new Connection(resolveSolanaRpc(), "confirmed"));
}
