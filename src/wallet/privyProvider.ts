import { Connection } from "@solana/web3.js";
import { classifySolanaFailure } from "../core/solanaFailure";
import type { WalletProvider } from "../core/walletProvider";
import type { SignatureResult } from "../types/intents";
import { getPrivyClient } from "./privyClient";

function resolveSolanaRpc(): string {
  const rpc = process.env.SOLANA_RPC;
  if (!rpc || rpc.trim() === "") {
    throw new Error("PRIVY_SIGN_ERROR: missing SOLANA_RPC");
  }
  return rpc;
}

let broadcastSignedTransaction = async (signedTxBase64: string): Promise<string> => {
  const connection = new Connection(resolveSolanaRpc(), "confirmed");
  return connection.sendRawTransaction(Buffer.from(signedTxBase64, "base64"));
};

export const privyProvider: WalletProvider = {
  name: "privy",
  async signAndSend(params): Promise<SignatureResult> {
    if (!params.agentId) {
      throw new Error("PRIVY_SIGN_ERROR: missing agentId");
    }
    if (!params.serializedTx) {
      throw new Error("PRIVY_SIGN_ERROR: empty serialized transaction");
    }
    if (!params.walletRef) {
      throw new Error("PRIVY_SIGN_ERROR: missing walletRef");
    }

    const privy = getPrivyClient();
    const transactions = Array.isArray(params.serializedTx) ? params.serializedTx : [params.serializedTx];
    const signatures: string[] = [];

    for (const serializedTx of transactions) {
      const result = await privy.wallets().solana().signTransaction(params.walletRef, {
        transaction: Buffer.from(serializedTx, "base64")
      });

      const signedTx = result.signed_transaction;
      if (!signedTx) {
        throw new Error("PRIVY_SIGN_ERROR: missing signed transaction");
      }

      try {
        const signature = await broadcastSignedTransaction(signedTx);
        signatures.push(signature);
      } catch (error) {
        const classified = classifySolanaFailure(
          error,
          "SIGNING_FAILED",
          "Provider signing or broadcast failed."
        );
        throw new Error(classified.reasonCode + (classified.reasonDetail ? `: ${classified.reasonDetail}` : ""));
      }
    }

    return {
      txSignature: signatures[signatures.length - 1] ?? "",
      txSignatures: signatures,
      provider: "privy"
    };
  }
};

export function setBroadcastSignedTransactionForTests(
  fn: ((signedTxBase64: string) => Promise<string>) | null
): void {
  if (!fn) {
    broadcastSignedTransaction = async (signedTxBase64: string): Promise<string> => {
      const connection = new Connection(resolveSolanaRpc(), "confirmed");
      return connection.sendRawTransaction(Buffer.from(signedTxBase64, "base64"));
    };
    return;
  }
  broadcastSignedTransaction = fn;
}
