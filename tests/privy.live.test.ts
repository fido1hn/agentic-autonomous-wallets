import { describe, expect, it } from "bun:test";
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction
} from "@solana/web3.js";
import { createPrivyClient, resolvePrivyRuntimeConfig } from "../src/wallet/privyClient";

describe("privy live", () => {
  it("creates a wallet and signs a Solana transaction via Privy RPC", async () => {
    if (process.env.PRIVY_LIVE_TEST !== "true") {
      return;
    }

    const privy = createPrivyClient(resolvePrivyRuntimeConfig());
    const wallet = await privy.wallets().create({
      chain_type: "solana",
      "privy-idempotency-key": `aegis-privy-live-${Date.now()}`
    });

    const connection = new Connection(process.env.SOLANA_RPC ?? "https://api.devnet.solana.com", "confirmed");
    const { blockhash } = await connection.getLatestBlockhash();
    const payer = new PublicKey(wallet.address);
    const ix = SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: payer,
      lamports: 0
    });

    const message = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: [ix]
    }).compileToV0Message();
    const tx = new VersionedTransaction(message);
    const serializedTx = Buffer.from(tx.serialize()).toString("base64");

    const result = await privy.wallets().solana().signTransaction(wallet.id, {
      transaction: Buffer.from(serializedTx, "base64"),
      idempotency_key: `aegis-privy-sign-${Date.now()}`
    });

    expect(wallet.id.length).toBeGreaterThan(0);
    expect(wallet.address.length).toBeGreaterThan(0);
    expect(result.signed_transaction.length).toBeGreaterThan(0);
  });
});
