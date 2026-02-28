import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";
import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import type { ExecutionIntent, SerializedTransaction } from "../types/intents";
import { ReasonCodes } from "../core/reasonCodes";

function resolveSolanaRpc(): string {
  const rpc = process.env.SOLANA_RPC?.trim();
  if (!rpc) {
    throw new Error(`${ReasonCodes.solanaRpcReadFailed}: missing SOLANA_RPC`);
  }
  return rpc;
}

let createSolanaConnection = (): Connection => {
  return new Connection(resolveSolanaRpc(), "confirmed");
};

function requirePublicKey(value: string | undefined, reasonCode: string): PublicKey {
  if (!value) {
    throw new Error(reasonCode);
  }
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(reasonCode);
  }
}

function serializeUnsigned(transaction: Transaction): SerializedTransaction {
  return Buffer.from(
    transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    })
  ).toString("base64");
}

function parseAtomicAmount(value: string): bigint {
  try {
    const parsed = BigInt(value);
    if (parsed <= 0n) {
      throw new Error("non-positive");
    }
    return parsed;
  } catch {
    throw new Error(ReasonCodes.policyInvalidAmount);
  }
}

function toSafeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(ReasonCodes.policyInvalidAmount);
  }
  return Number(value);
}

export async function buildSolTransfer(intent: ExecutionIntent): Promise<SerializedTransaction> {
  const connection = createSolanaConnection();
  const owner = requirePublicKey(intent.walletAddress, ReasonCodes.walletAddressUnavailable);
  const recipient = requirePublicKey(intent.recipientAddress, ReasonCodes.transferRecipientRequired);
  const amount = parseAtomicAmount(intent.amountAtomic);
  const { blockhash } = await connection.getLatestBlockhash("confirmed");

  const transaction = new Transaction({
    feePayer: owner,
    recentBlockhash: blockhash
  }).add(
    SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: recipient,
      lamports: toSafeNumber(amount)
    })
  );

  return serializeUnsigned(transaction);
}

export async function buildSplTransfer(intent: ExecutionIntent): Promise<SerializedTransaction> {
  const connection = createSolanaConnection();
  const owner = requirePublicKey(intent.walletAddress, ReasonCodes.walletAddressUnavailable);
  const recipient = requirePublicKey(intent.recipientAddress, ReasonCodes.transferRecipientRequired);
  const mint = requirePublicKey(intent.mintAddress, ReasonCodes.transferMintRequired);

  const senderAta = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const recipientAta = getAssociatedTokenAddressSync(
    mint,
    recipient,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const amount = parseAtomicAmount(intent.amountAtomic);

  const parsedMint = await connection.getParsedAccountInfo(mint, "confirmed");
  const decimals =
    (parsedMint.value?.data &&
    "parsed" in parsedMint.value.data &&
    (parsedMint.value.data.parsed as { info?: { decimals?: number } }).info?.decimals !== undefined)
      ? (parsedMint.value.data.parsed as { info: { decimals: number } }).info.decimals
      : null;
  if (decimals === null) {
    throw new Error(ReasonCodes.splMintMetadataUnavailable);
  }

  const recipientAtaInfo = await connection.getAccountInfo(recipientAta, "confirmed");
  const { blockhash } = await connection.getLatestBlockhash("confirmed");

  const transaction = new Transaction({
    feePayer: owner,
    recentBlockhash: blockhash
  });

  if (!recipientAtaInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        owner,
        recipientAta,
        recipient,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }

  transaction.add(
    createTransferCheckedInstruction(
      senderAta,
      mint,
      recipientAta,
      owner,
      amount,
      decimals,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  return serializeUnsigned(transaction);
}

export function setSolanaTransferConnectionFactoryForTests(fn: (() => Connection) | null): void {
  createSolanaConnection = fn ?? (() => new Connection(resolveSolanaRpc(), "confirmed"));
}
