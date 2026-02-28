import { afterEach, describe, expect, it, mock } from "bun:test";
import { AegisApiClient } from "../src/demo/agent/AegisApiClient";

describe("AegisApiClient", () => {
  const originalFetch = globalThis.fetch;
  const originalRpc = process.env.SOLANA_RPC;
  const originalCluster = process.env.SOLANA_CLUSTER;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.SOLANA_RPC = originalRpc;
    process.env.SOLANA_CLUSTER = originalCluster;
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
        expect(body.fromMint).toBe("So11111111111111111111111111111111111111112");
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
    process.env.SOLANA_RPC = "https://api.devnet.solana.com";
    const swap = await client.swapTokens("agent-1", "api-key", {
      fromToken: "SOL",
      toToken: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      amountLamports: "7000",
    });

    expect(swap.status).toBe("approved");
  });

  it("normalizes SOL -> USDC on devnet", async () => {
    process.env.SOLANA_RPC = "https://api.devnet.solana.com";
    globalThis.fetch = mock(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      expect(body.fromMint).toBe("So11111111111111111111111111111111111111112");
      expect(body.toMint).toBe("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k");
      return new Response(JSON.stringify({ status: "approved", provider: "privy", txSignature: "sig-devnet", policyChecks: [] }));
    }) as unknown as typeof fetch;

    const client = new AegisApiClient("http://localhost:3000");
    const result = await client.swapTokens("agent-1", "api-key", {
      fromToken: "SOL",
      toToken: "USDC",
      amountLamports: "1000",
    });
    expect(result.status).toBe("approved");
  });

  it("normalizes SOL -> USDC on devnet to Raydium mint when raydium is requested", async () => {
    process.env.SOLANA_RPC = "https://api.devnet.solana.com";
    globalThis.fetch = mock(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      expect(body.toMint).toBe("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
      expect(body.swapProtocol).toBe("raydium");
      return new Response(JSON.stringify({ status: "approved", provider: "privy", txSignature: "sig-raydium", policyChecks: [] }));
    }) as unknown as typeof fetch;

    const client = new AegisApiClient("http://localhost:3000");
    const result = await client.swapTokens("agent-1", "api-key", {
      protocol: "raydium",
      fromToken: "SOL",
      toToken: "USDC",
      amountLamports: "1000",
    });
    expect(result.status).toBe("approved");
  });

  it("normalizes SOL -> USDC on mainnet", async () => {
    process.env.SOLANA_CLUSTER = "mainnet-beta";
    globalThis.fetch = mock(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      expect(body.toMint).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
      return new Response(JSON.stringify({ status: "approved", provider: "privy", txSignature: "sig-mainnet", policyChecks: [] }));
    }) as unknown as typeof fetch;

    const client = new AegisApiClient("http://localhost:3000");
    const result = await client.swapTokens("agent-1", "api-key", {
      fromToken: "SOL",
      toToken: "USDC",
      amountLamports: "1000",
    });
    expect(result.status).toBe("approved");
  });

  it("rejects unsupported symbol-only output token", async () => {
    const client = new AegisApiClient("http://localhost:3000");

    await expect(
      client.swapTokens("agent-1", "api-key", {
        fromToken: "SOL",
        toToken: "USDT",
        amountLamports: "1000",
      })
    ).rejects.toThrow("Only USDC is supported by symbol in this build");
  });

  it("wraps policy lifecycle endpoints", async () => {
    let call = 0;
    globalThis.fetch = mock(async (input, init) => {
      call += 1;
      const url = String(input);
      expect((init?.headers as Record<string, string>)["x-agent-id"]).toBe("agent-1");
      if (call === 1) {
        expect(url.endsWith("/policies")).toBe(true);
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({
          id: "pol-1",
          ownerAgentId: "agent-1",
          name: "Transfers",
          description: null,
          status: "active",
          dsl: { version: "aegis.policy.v1", rules: [] },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }));
      }
      if (call === 2) {
        expect(url.includes("/policies?assigned=true")).toBe(true);
        return new Response(JSON.stringify({ count: 1, data: [] }));
      }
      if (call === 3) {
        expect(url.endsWith("/policies/pol-1")).toBe(true);
        expect(init?.method).toBe("GET");
        return new Response(JSON.stringify({
          id: "pol-1",
          ownerAgentId: "agent-1",
          name: "Transfers",
          description: null,
          status: "active",
          dsl: { version: "aegis.policy.v1", rules: [] },
          assignment: { assignedToAgentWallet: false },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }));
      }
      if (call === 4) {
        expect(init?.method).toBe("PATCH");
        return new Response(JSON.stringify({
          id: "pol-1",
          ownerAgentId: "agent-1",
          name: "Transfers updated",
          description: null,
          status: "disabled",
          dsl: { version: "aegis.policy.v1", rules: [] },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z"
        }));
      }
      if (call === 5) {
        expect(url.endsWith("/agents/agent-1/policies/pol-1")).toBe(true);
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({ agentId: "agent-1", policyId: "pol-1", status: "assigned" }));
      }
      if (call === 6) {
        expect(init?.method).toBe("GET");
        return new Response(JSON.stringify({ agentId: "agent-1", count: 0, data: [] }));
      }
      if (call === 7) {
        expect(init?.method).toBe("DELETE");
        return new Response(JSON.stringify({ agentId: "agent-1", policyId: "pol-1", status: "unassigned" }));
      }
      expect(init?.method).toBe("DELETE");
      return new Response(JSON.stringify({ id: "pol-1", status: "archived" }));
    }) as unknown as typeof fetch;

    const client = new AegisApiClient("http://localhost:3000");
    await client.createPolicy("agent-1", "api-key", {
      name: "Transfers",
      dsl: { version: "aegis.policy.v1", rules: [] }
    });
    await client.getPolicies("agent-1", "api-key", { assigned: true });
    await client.getPolicy("agent-1", "api-key", "pol-1");
    await client.updatePolicy("agent-1", "api-key", "pol-1", { status: "disabled" });
    await client.assignPolicy("agent-1", "api-key", "pol-1", { priority: 200 });
    await client.getWalletPolicies("agent-1", "api-key");
    await client.unassignPolicy("agent-1", "api-key", "pol-1");
    await client.archivePolicy("agent-1", "api-key", "pol-1");
  });
});
