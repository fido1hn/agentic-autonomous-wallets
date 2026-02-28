import { afterEach, describe, expect, it } from "bun:test";
import {
  privyProvider,
  setBroadcastSignedTransactionForTests
} from "../src/wallet/privyProvider";
import { setPrivyClientForTests } from "../src/wallet/privyClient";

describe("privyProvider", () => {
  afterEach(() => {
    setPrivyClientForTests(null);
    setBroadcastSignedTransactionForTests(null);
  });

  it("signs and broadcasts transaction using Privy wallet RPC", async () => {
    process.env.SOLANA_RPC = "https://api.devnet.solana.com";

    const fakeClient = {
      wallets: () => ({
        solana: () => ({
          signTransaction: async () => ({
            signed_transaction: Buffer.from("signed_tx_bytes").toString("base64")
          })
        })
      })
    } as any;
    setPrivyClientForTests(fakeClient);

    setBroadcastSignedTransactionForTests(async () => "sig_test_001");

    const result = await privyProvider.signAndSend({
      agentId: "agent-1",
      walletRef: "wallet_123",
      serializedTx: "dGVzdA=="
    });

    expect(result.provider).toBe("privy");
    expect(result.txSignature).toBe("sig_test_001");
  });

  it("maps broadcast insufficient funds errors to a stable reason code", async () => {
    process.env.SOLANA_RPC = "https://api.devnet.solana.com";

    const fakeClient = {
      wallets: () => ({
        solana: () => ({
          signTransaction: async () => ({
            signed_transaction: Buffer.from("signed_tx_bytes").toString("base64")
          })
        })
      })
    } as any;
    setPrivyClientForTests(fakeClient);

    setBroadcastSignedTransactionForTests(async () => {
      throw new Error("insufficient funds for fee");
    });

    await expect(
      privyProvider.signAndSend({
        agentId: "agent-1",
        walletRef: "wallet_123",
        serializedTx: "dGVzdA=="
      })
    ).rejects.toThrow("INSUFFICIENT_FUNDS");
  });
});
