import { afterEach, describe, expect, it } from "bun:test";
import { Keypair, Transaction } from "@solana/web3.js";
import { buildSolTransfer, buildSplTransfer, setSolanaTransferConnectionFactoryForTests } from "../src/protocols/solanaTransferAdapter";

describe("solanaTransferAdapter", () => {
  afterEach(() => {
    setSolanaTransferConnectionFactoryForTests(null);
  });

  it("builds a SOL transfer transaction", async () => {
    const owner = Keypair.generate().publicKey.toBase58();
    const recipient = Keypair.generate().publicKey.toBase58();
    setSolanaTransferConnectionFactoryForTests(
      () =>
        ({
          getLatestBlockhash: async () => ({ blockhash: "11111111111111111111111111111111" }),
        }) as any
    );

    const serialized = await buildSolTransfer({
      agentId: "agent-1",
      action: "transfer",
      walletAddress: owner,
      transferAsset: "native",
      recipientAddress: recipient,
      amountAtomic: "5000",
    });

    const transaction = Transaction.from(Buffer.from(serialized, "base64"));
    expect(transaction.instructions.length).toBe(1);
    expect(transaction.feePayer?.toBase58()).toBe(owner);
  });

  it("builds an SPL transfer transaction when recipient ATA exists", async () => {
    const owner = Keypair.generate().publicKey.toBase58();
    const recipient = Keypair.generate().publicKey.toBase58();
    const mint = Keypair.generate().publicKey.toBase58();
    setSolanaTransferConnectionFactoryForTests(
      () =>
        ({
          getLatestBlockhash: async () => ({ blockhash: "11111111111111111111111111111111" }),
          getParsedAccountInfo: async () => ({
            value: {
              data: {
                parsed: {
                  info: {
                    decimals: 6,
                  },
                },
              },
            },
          }),
          getAccountInfo: async () => ({ executable: false }),
        }) as any
    );

    const serialized = await buildSplTransfer({
      agentId: "agent-1",
      action: "transfer",
      walletAddress: owner,
      transferAsset: "spl",
      recipientAddress: recipient,
      mintAddress: mint,
      amountAtomic: "1000",
    });

    const transaction = Transaction.from(Buffer.from(serialized, "base64"));
    expect(transaction.instructions.length).toBe(1);
  });

  it("builds an SPL transfer transaction with ATA creation when recipient ATA is missing", async () => {
    const owner = Keypair.generate().publicKey.toBase58();
    const recipient = Keypair.generate().publicKey.toBase58();
    const mint = Keypair.generate().publicKey.toBase58();
    setSolanaTransferConnectionFactoryForTests(
      () =>
        ({
          getLatestBlockhash: async () => ({ blockhash: "11111111111111111111111111111111" }),
          getParsedAccountInfo: async () => ({
            value: {
              data: {
                parsed: {
                  info: {
                    decimals: 6,
                  },
                },
              },
            },
          }),
          getAccountInfo: async () => null,
        }) as any
    );

    const serialized = await buildSplTransfer({
      agentId: "agent-1",
      action: "transfer",
      walletAddress: owner,
      transferAsset: "spl",
      recipientAddress: recipient,
      mintAddress: mint,
      amountAtomic: "1000",
    });

    const transaction = Transaction.from(Buffer.from(serialized, "base64"));
    expect(transaction.instructions.length).toBe(2);
  });

  it("rejects invalid recipient and missing mint metadata cleanly", async () => {
    const owner = Keypair.generate().publicKey.toBase58();
    const mint = Keypair.generate().publicKey.toBase58();
    const recipient = Keypair.generate().publicKey.toBase58();
    setSolanaTransferConnectionFactoryForTests(
      () =>
        ({
          getLatestBlockhash: async () => ({ blockhash: "11111111111111111111111111111111" }),
          getParsedAccountInfo: async () => ({ value: null }),
          getAccountInfo: async () => null,
        }) as any
    );

    await expect(
      buildSplTransfer({
        agentId: "agent-1",
        action: "transfer",
        walletAddress: owner,
        transferAsset: "spl",
        recipientAddress: "bad",
        mintAddress: mint,
        amountAtomic: "1000",
      })
    ).rejects.toThrow("TRANSFER_RECIPIENT_REQUIRED");

    await expect(
      buildSplTransfer({
        agentId: "agent-1",
        action: "transfer",
        walletAddress: owner,
        transferAsset: "spl",
        recipientAddress: recipient,
        mintAddress: mint,
        amountAtomic: "1000",
      })
    ).rejects.toThrow("SPL_MINT_METADATA_UNAVAILABLE");
  });
});
