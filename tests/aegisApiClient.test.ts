import { afterEach, describe, expect, it, mock } from "bun:test";
import { AegisApiClient } from "../src/demo/agent/AegisApiClient";

describe("AegisApiClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("loads balances with auth headers", async () => {
    globalThis.fetch = mock(async (_input, init) => {
      expect((init?.headers as Record<string, string>)["x-agent-id"]).toBe("agent-1");
      return new Response(
        JSON.stringify({
          agentId: "agent-1",
          walletAddress: "wallet-address",
          native: { lamports: "1000", sol: "0.000001" },
          tokens: [],
          slot: 10,
        })
      );
    }) as unknown as typeof fetch;

    const client = new AegisApiClient("http://localhost:3000");
    const result = await client.getBalances("agent-1", "api-key");
    expect(result.native.lamports).toBe("1000");
  });

  it("wraps transferSol through executeIntent payload", async () => {
    globalThis.fetch = mock(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      expect(body.action).toBe("transfer");
      expect(body.transferAsset).toBe("native");
      expect(body.amountAtomic).toBe("5000");
      return new Response(JSON.stringify({ status: "approved", provider: "privy", txSignature: "sig-1", policyChecks: [] }));
    }) as unknown as typeof fetch;

    const client = new AegisApiClient("http://localhost:3000");
    const result = await client.transferSol("agent-1", "api-key", {
      recipientAddress: "recipient",
      amountLamports: "5000",
    });
    expect(result.status).toBe("approved");
  });

  it("wraps transferSpl and swapTokens payloads", async () => {
    let call = 0;
    globalThis.fetch = mock(async (_input, init) => {
      call += 1;
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      if (call === 1) {
        expect(body.transferAsset).toBe("spl");
        expect(body.mintAddress).toBe("mint-1");
      } else {
        expect(body.action).toBe("swap");
        expect(body.fromMint).toBe("from-mint");
        expect(body.amountAtomic).toBe("7000");
      }
      return new Response(JSON.stringify({ status: "approved", provider: "privy", txSignature: `sig-${call}`, policyChecks: [] }));
    }) as unknown as typeof fetch;

    const client = new AegisApiClient("http://localhost:3000");
    await client.transferSpl("agent-1", "api-key", {
      recipientAddress: "recipient",
      mintAddress: "mint-1",
      amountAtomic: "10",
    });
    const swap = await client.swapTokens("agent-1", "api-key", {
      fromMint: "from-mint",
      toMint: "to-mint",
      amountLamports: "7000",
    });

    expect(swap.status).toBe("approved");
  });
});
